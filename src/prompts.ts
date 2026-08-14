// Every vision-model prompt lives here: the single review point for wording.
// The designs are grounded in published research (Set-of-Mark numbering,
// SEAL-style sufficiency rules, document tiling with ordinal strip labels,
// verbatim transcription with explicit cut/unreadable markers) but all
// wording below is original to this plugin. See REFERENCES.md.

export const LANG_LINES: Record<string, string> = {
  zh: 'All of your output must be written in Simplified Chinese.',
  en: 'All of your output must be written in English.',
}

const JSON_ONLY = 'Output only JSON — no markdown fences, no commentary.'

/** vision_map: turn an image into a numbered element inventory. */
export function mapPrompt(params: { focus?: string; maxItems: number; lang: string }): string {
  const langLine = LANG_LINES[params.lang] ?? LANG_LINES.zh
  const focusLine = params.focus
    ? `Focus: list only elements of this kind: ${params.focus}.`
    : 'Skip decorative backgrounds and repeated spacing.'
  return `You are the visual front-end of a text-only assistant that cannot see images. Your job is to turn this image into a structured inventory of elements the assistant can reason about. ${langLine}

Return a single JSON object — ${JSON_ONLY} — with exactly one key "elements", whose value is an array. For each distinct interactive or informative element in the image, add one item:
{"label": "<visible text or a short noun phrase>", "x1": int, "y1": int, "x2": int, "y2": int}

(x1,y1) is the top-left corner and (x2,y2) the bottom-right corner of the element's bounding box, each an integer on a 0-1000 grid covering the whole visible image (0 = left/top edge, 1000 = right/bottom edge). Use tight boxes that contain the whole element.

Rules:
- Include buttons, links, text inputs, dropdowns, toggles, icons, tabs, headings, badges, banners, error messages, and any other element a user could interact with or that carries meaning.
- ${focusLine}
- A label must contain the element's visible text if it has any (for example "button 'Send'"). Do not translate text printed in the image. Describe icons by their shape or glyph.
- List at most ${params.maxItems} elements, the most salient first.
- If an element is too small or blurred to identify, still list it with the label "unclear element". Never invent a label for what you cannot read.
- Do not list elements from parts of the image that are cut off.`
}

/** vision_read ask mode: answer a precise question about one or more images. */
export function readAskPrompt(question: string, imageCount: number, lang: string): string {
  const langLine = LANG_LINES[lang] ?? LANG_LINES.zh
  const opening = imageCount > 1
    ? `You are looking at ${imageCount} images, labeled Image 1 through Image ${imageCount}, provided together. Refer to each image by its label. ${langLine}`
    : `You are looking at one image. ${langLine}`
  return `${opening}
Task: ${question}
Grounding rules:
- Base your answer only on what is actually visible in the image.
- You cannot see beyond the image: do not state colors, text, states, or styling that the image does not show. If the question needs a detail that is not legible at this scale, do not guess it — end your answer by naming the exact element or region to zoom into for a targeted inspection, in the form "INSPECT: <element or region>".
- Keep the answer focused on the question; no preamble.`
}

/** vision_read transcribe mode, one short image. */
export function readTranscribePrompt(): string {
  return `You are looking at one image. Transcribe ALL text visible in the image, verbatim, character for character.
Rules:
- Reproduce the text exactly as printed: no translation, no correction, no reordering, no summarising.
- Keep reading order. When the layout has natural blocks (a header, a list, a footer), prefix each block with a short "## <block>" heading.
- If characters are illegible, write [unreadable] for exactly the unreadable part. If a line is cut off by the image edge, transcribe what is visible and append [...] at the cut. Never fill in what is not visible.
- No preamble, no explanation.`
}

/** vision_read transcribe mode, one strip of a tiled page. */
export function readStripPrompt(index: number, count: number): string {
  return `This is strip ${index} of ${count} of one longer page, cut horizontally from top to bottom. Transcribe ALL text visible in this strip, verbatim, character for character.
Rules:
- Lines at the strip's top or bottom edge may continue in the neighbouring strip: transcribe them exactly as they appear here, even if cut mid-line, marking a cut with a trailing [...] or leading [...].
- If characters are illegible, write [unreadable] for exactly the unreadable part.
- No preamble, no translation, no correction.`
}

/** vision_zoom: answer a targeted question about a magnified crop. */
export function zoomPrompt(question: string, lang: string): string {
  const langLine = LANG_LINES[lang] ?? LANG_LINES.zh
  return `You are looking at a magnified crop of one region of a larger image, cut out so you can read it precisely. ${langLine}
Task: ${question}
Rules:
- Answer only about what this crop shows; do not describe what surrounds it unless the question asks.
- If the crop is still too small or too blurred to answer, say exactly so and state what additional detail is missing. Never invent it.`
}

/** vision_check (v1.1): verify claims against visual evidence. */
export function checkPrompt(claims: string[]): string {
  const list = claims.map((claim, index) => `${index + 1}. ${claim}`).join('\n')
  return `You are verifying statements against visual evidence in one image. Return a single JSON object — ${JSON_ONLY} — with one key "verdicts": an array with one item per claim:
{"claim": "<the claim as given>", "verdict": "supported"|"contradicted"|"unverifiable", "reason": "<one line citing what is actually visible>"}
Rules:
- "supported" requires direct visual evidence in the image.
- "contradicted" means the image directly shows the opposite.
- "unverifiable" means the image neither confirms nor contradicts (too small, cut off, or outside the image). Prefer "unverifiable" over guessing.
Claims:
${list}`
}
