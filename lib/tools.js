// The three v1 tool definitions, as pure factories over (config, vision
// client, visual working memory). The flow is user-image-first: the user
// uploads an image or gives a path, and these tools turn it into what the
// text-only main model needs — a numbered inventory (map), answers and
// verbatim text (read), and targeted crops (zoom).
import { basename } from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { parseElements, parseRegion, positionLabel } from './bbox.js';
import { normToPx, pxToNormOfOriginal } from './coords.js';
import { regionFor } from './crop.js';
import { readImageDims, prepareUpload, prepareCropUpload, ImageError } from './preprocess.js';
import { mapPrompt, readAskPrompt, readStripPrompt, readTranscribePrompt, zoomPrompt } from './prompts.js';
import { VisualMemory, RegistryError } from './registry.js';
import { mergeStrips, planStrips, shouldTile, unreadableStrip } from './tile.js';
import { callVision, VisionError } from './vision-client.js';
const text = (value) => [{ type: 'text', text: value }];
function errorText(error) {
    if (error instanceof VisionError || error instanceof ImageError || error instanceof RegistryError || error instanceof Error) {
        return error.message;
    }
    return String(error);
}
/** Generic object output schema with exactly the given properties. */
// Schemas are inlined at each tool call site so the const generic inference
// captures literal types (a helper typed as Record<string, unknown> breaks
// execute-return checking).
export function buildTools(deps) {
    const { vision, memory, maxEdge } = deps;
    // ── vision_map: numbered element inventory (the signature tool) ─────────
    const map = defineTool({
        name: 'vision_map',
        description: 'Annotate an image into a numbered inventory: every distinct interactive or informative element (buttons, inputs, icons, headings, banners) gets an id, a label, and its pixel box, and the list is kept in visual working memory. Map first: before reasoning about what an image contains or where something is, map it, then refer to elements by id ("element 7"), never by vague description. Optionally filter with `focus` (one kind only), or annotate only inside `region`. Boxes are not pixel-exact (model grid scaled to the image) — accurate enough to crop or zoom. A different file means a new map: ids never carry over between images.',
        parameters: {
            image: { type: 'string', required: true, description: 'Absolute image path (PNG/JPEG/GIF/WebP).' },
            focus: { type: 'string', description: 'Optional element kind to list only, e.g. "buttons" or "error messages".' },
            region: { type: 'string', description: 'Optional pixel box "X1,Y1,X2,Y2" to annotate only inside (PNG only). Results stay in original-image coordinates.' },
            maxItems: { type: 'integer', description: 'Maximum elements to list (default 30).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    imageId: { type: 'string' },
                    width: { type: 'integer' },
                    height: { type: 'integer' },
                    elements: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                id: { type: 'integer' },
                                label: { type: 'string' },
                                position: { type: 'string' },
                                x1: { type: 'integer' },
                                y1: { type: 'integer' },
                                x2: { type: 'integer' },
                                y2: { type: 'integer' },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => {
                const result = value;
                const lines = result.elements.map((element) => `${element.id}. [${element.position}] ${element.label}  x1: ${element.x1}, y1: ${element.y1}, x2: ${element.x2}, y2: ${element.y2}`);
                if (lines.length === 0)
                    lines.push('no elements detected');
                lines.push(`visual memory updated: refs 1-${result.elements.length} valid for ${result.imageId} — use vision_zoom ref "N" to inspect one element.`);
                return text(lines.join('\n'));
            },
        },
        async execute(args) {
            try {
                const originalDims = readImageDims(args.image);
                const maxItems = args.maxItems ?? 30;
                let prepared;
                if (args.region) {
                    prepared = prepareCropUpload(args.image, parseRegion(args.region, originalDims.width, originalDims.height), { maxEdge });
                }
                else {
                    prepared = prepareUpload(args.image, maxEdge);
                }
                const answer = await callVision(vision, {
                    task: 'map',
                    prompt: mapPrompt({ focus: args.focus, maxItems, lang: vision.lang }),
                    images: [{ dataUrl: prepared.dataUrl }],
                    jsonMode: true,
                });
                const parsed = parseElements(answer, maxItems, prepared.view.viewDims);
                const imageId = basename(args.image);
                const regions = parsed.map((element) => ({
                    id: element.id,
                    label: element.label,
                    norm: pxToNormOfOriginal(normToPx(element.norm, prepared.view), originalDims),
                }));
                memory.store(args.image, imageId, originalDims.width, originalDims.height, regions);
                const elements = parsed.map((element) => {
                    const box = normToPx(element.norm, prepared.view);
                    return { id: element.id, label: element.label, position: positionLabel(box, originalDims.width, originalDims.height), x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
                });
                return { imageId, width: originalDims.width, height: originalDims.height, elements };
            }
            catch (error) {
                throw new Error(errorText(error));
            }
        },
    });
    // ── vision_read: Q&A + verbatim text extraction ─────────────────────────
    const read = defineTool({
        name: 'vision_read',
        description: 'Read images with a vision model. mode "transcribe" extracts ALL visible text verbatim, character for character — the mode for receipts, logs, forms, long chat screenshots; tall pages are automatically cut into overlapping top-to-bottom strips and merged, so a long page is read at full detail, not shrunk. mode "ask" answers a precise question; pass several image paths at once to compare them in one call — never compare via separate calls. The model is instructed not to guess: if a needed detail is not legible, it says which region to inspect (INSPECT hint) instead of inventing it.',
        parameters: {
            images: { type: 'array', items: { type: 'string' }, required: true, description: 'One or more absolute image paths.' },
            mode: { type: 'string', required: true, enum: ['ask', 'transcribe'], description: '"ask" answers a question; "transcribe" extracts all visible text verbatim.' },
            question: { type: 'string', description: 'The exact question; required when mode is "ask", forbidden when "transcribe".' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    mode: { type: 'string' },
                    answer: { type: 'string' },
                    images: { type: 'integer' },
                    tiled: { type: 'boolean' },
                    strips: { type: 'integer' },
                },
            },
            render: (_args, value) => {
                const result = value;
                return text(result.tiled ? `${result.answer}\n(transcribed from ${result.strips} overlapping strips, merged top-to-bottom)` : result.answer);
            },
        },
        async execute(args) {
            try {
                if (args.mode === 'ask') {
                    if (!args.question)
                        throw new Error('vision_read mode "ask" requires a question');
                    const prepared = args.images.map((path) => prepareUpload(path, maxEdge));
                    const answer = await callVision(vision, {
                        task: 'read',
                        prompt: readAskPrompt(args.question, args.images.length, vision.lang),
                        images: prepared.map((upload) => ({ dataUrl: upload.dataUrl })),
                        maxTokens: 4096,
                    });
                    return { mode: 'ask', answer, images: args.images.length, tiled: false, strips: 1 };
                }
                // transcribe
                if (args.question)
                    throw new Error('vision_read mode "transcribe" does not take a question');
                const answers = [];
                let totalStrips = 0;
                let anyTiled = false;
                for (const path of args.images) {
                    const dims = readImageDims(path);
                    if (shouldTile(dims)) {
                        anyTiled = true;
                        const plan = planStrips(dims.width, dims.height);
                        const parts = [];
                        for (const strip of plan.strips) {
                            totalStrips++;
                            try {
                                const prepared = prepareCropUpload(path, { x1: 0, y1: strip.y1, x2: dims.width, y2: strip.y2 }, { maxEdge });
                                const part = await callVision(vision, {
                                    task: 'read',
                                    prompt: readStripPrompt(strip.index, strip.count),
                                    images: [{ dataUrl: prepared.dataUrl }],
                                    maxTokens: 2048,
                                    deterministic: true,
                                });
                                parts.push(part);
                            }
                            catch (error) {
                                parts.push(unreadableStrip(strip.index));
                                void error;
                            }
                        }
                        answers.push(mergeStrips(parts));
                    }
                    else {
                        totalStrips++;
                        const prepared = prepareUpload(path, maxEdge);
                        const answer = await callVision(vision, {
                            task: 'read',
                            prompt: readTranscribePrompt(),
                            images: [{ dataUrl: prepared.dataUrl }],
                            maxTokens: 4096,
                            deterministic: true,
                        });
                        answers.push(answer);
                    }
                }
                const answer = answers.length > 1 ? answers.map((part, index) => `## Image ${index + 1}\n${part}`).join('\n\n') : (answers[0] ?? '');
                return { mode: 'transcribe', answer, images: args.images.length, tiled: anyTiled, strips: totalStrips };
            }
            catch (error) {
                throw new Error(errorText(error));
            }
        },
    });
    // ── vision_zoom: targeted region inspection (coarse-to-fine) ────────────
    const zoom = defineTool({
        name: 'vision_zoom',
        description: 'Zoom into one region of an image and answer a targeted question about it. The crop is uploaded alone, so small text, icons, and states are read at effectively full resolution — a full-image pass routinely misses them. Prefer `ref` (an id from vision_map\'s visual working memory, e.g. "7") over a raw `region` box. `scale` upscales the crop for tiny elements. Zoom is the only reliable way to inspect one element closely; if the crop is still not enough, the answer will say exactly what is missing instead of guessing.',
        parameters: {
            image: { type: 'string', required: true, description: 'Absolute PNG path.' },
            question: { type: 'string', required: true, description: 'The targeted question, e.g. "is this button enabled or greyed out?" or "what is the exact error text?".' },
            ref: { type: 'string', description: 'Element id from vision_map ("7", or "7@imageId"). Mutually exclusive with region.' },
            region: { type: 'string', description: 'Alternative raw pixel box "X1,Y1,X2,Y2" when no registry entry exists.' },
            scale: { type: 'integer', description: 'Optional integer upscale of the crop, 2-8, for tiny elements.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    answer: { type: 'string' },
                    box: {
                        type: 'object',
                        additionalProperties: false,
                        properties: {
                            x1: { type: 'integer' },
                            y1: { type: 'integer' },
                            x2: { type: 'integer' },
                            y2: { type: 'integer' },
                        },
                    },
                    cropWidth: { type: 'integer' },
                    cropHeight: { type: 'integer' },
                    scale: { type: 'integer' },
                },
            },
            render: (_args, value) => {
                const result = value;
                return text(`${result.answer}\n(crop box: x1: ${result.box.x1}, y1: ${result.box.y1}, x2: ${result.box.x2}, y2: ${result.box.y2})`);
            },
        },
        async execute(args) {
            try {
                const scale = args.scale ?? 1;
                if (!Number.isInteger(scale) || scale < 1 || scale > 8)
                    throw new Error('scale must be an integer between 1 and 8');
                let box;
                if (args.ref && args.region)
                    throw new Error('ref and region are mutually exclusive — pass exactly one');
                if (args.ref) {
                    box = memory.resolve(args.image, args.ref).box;
                }
                else if (args.region) {
                    const region = regionFor(args.image, args.region);
                    if (!region)
                        throw new Error('region is required when ref is not given');
                    box = region;
                }
                else {
                    throw new Error('pass either ref (a vision_map id) or region (a "X1,Y1,X2,Y2" box)');
                }
                const prepared = prepareCropUpload(args.image, box, { scale, maxEdge });
                const answer = await callVision(vision, {
                    task: 'zoom',
                    prompt: zoomPrompt(args.question, vision.lang),
                    images: [{ dataUrl: prepared.dataUrl }],
                    maxTokens: 4096,
                });
                return { answer, box, cropWidth: prepared.view.viewDims.width, cropHeight: prepared.view.viewDims.height, scale };
            }
            catch (error) {
                throw new Error(errorText(error));
            }
        },
    });
    return [map, read, zoom];
}
