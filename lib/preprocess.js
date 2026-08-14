// Upload preparation and image dimension reading, zero dependencies.
// PNG is fully understood via the bundled codec and can be downscaled with
// an integer-factor mean pool (better than nearest-neighbor for text) before
// upload; JPEG/GIF/WebP pass through as-is (dimensions come from header
// scans; downscaling those formats is not possible without a codec and is
// documented as a limitation — screenshots are always PNG).
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { decodePng, encodePng, PngError } from './png.js';
export class ImageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ImageError';
    }
}
const MIME_BY_EXT = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
};
function jpegDims(bytes) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset++;
            continue;
        }
        const marker = bytes[offset + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            offset += 2;
            continue;
        }
        const length = bytes.readUInt16BE(offset + 2);
        const frame = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (frame && length >= 7) {
            return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
        }
        offset += 2 + length;
    }
    throw new ImageError('cannot read JPEG dimensions');
}
function gifDims(bytes) {
    if (bytes.length < 10 || bytes.subarray(0, 6).toString('latin1') !== 'GIF8')
        throw new ImageError('not a GIF file');
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}
function webpDims(bytes) {
    if (bytes.length < 30 || bytes.subarray(0, 4).toString('latin1') !== 'RIFF' || bytes.subarray(8, 12).toString('latin1') !== 'WEBP') {
        throw new ImageError('not a WebP file');
    }
    const kind = bytes.subarray(12, 16).toString('latin1');
    if (kind === 'VP8X')
        return { width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L' && bytes[20] === 0x2f) {
        const bits = bytes.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    throw new ImageError('cannot read WebP dimensions (unknown variant)');
}
export function readImageDims(path) {
    const ext = extname(path).toLowerCase();
    const bytes = readFileSync(path);
    switch (ext) {
        case '.png': {
            try {
                const image = decodePng(bytes);
                return { width: image.width, height: image.height };
            }
            catch (error) {
                throw new ImageError(error instanceof PngError ? error.message : `cannot read image: ${path}`);
            }
        }
        case '.jpg':
        case '.jpeg':
            return jpegDims(bytes);
        case '.gif':
            return gifDims(bytes);
        case '.webp':
            return webpDims(bytes);
        default:
            throw new ImageError(`unsupported image format: ${path} (PNG, JPEG, GIF, WebP only)`);
    }
}
/** Integer-factor mean-pool downscale: every k×k block averages to one pixel. */
export function meanPoolDownscale(image, factor) {
    const width = Math.floor(image.width / factor);
    const height = Math.floor(image.height / factor);
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let r = 0;
            let g = 0;
            let b = 0;
            let a = 0;
            const count = factor * factor;
            for (let dy = 0; dy < factor; dy++) {
                const row = (y * factor + dy) * image.width * 4;
                for (let dx = 0; dx < factor; dx++) {
                    const i = row + (x * factor + dx) * 4;
                    r += image.data[i];
                    g += image.data[i + 1];
                    b += image.data[i + 2];
                    a += image.data[i + 3];
                }
            }
            const o = (y * width + x) * 4;
            data[o] = Math.round(r / count);
            data[o + 1] = Math.round(g / count);
            data[o + 2] = Math.round(b / count);
            data[o + 3] = Math.round(a / count);
        }
    }
    return { width, height, data };
}
/**
 * Prepare one image path for upload. PNG gets a deterministic downscale to
 * the long-edge cap; other formats pass through with original dimensions.
 */
export function prepareUpload(path, maxEdge) {
    const ext = extname(path).toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime)
        throw new ImageError(`unsupported image format: ${path} (PNG, JPEG, GIF, WebP only)`);
    const bytes = readFileSync(path);
    const originalDims = readImageDims(path);
    let dataUrl;
    let viewDims = originalDims;
    if (ext === '.png') {
        const image = decodePng(bytes);
        const longEdge = Math.max(image.width, image.height);
        const factor = longEdge > maxEdge ? Math.ceil(longEdge / maxEdge) : 1;
        const view = factor > 1 ? meanPoolDownscale(image, factor) : image;
        viewDims = { width: view.width, height: view.height };
        dataUrl = `data:image/png;base64,${encodePng(view).toString('base64')}`;
    }
    else {
        dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
    }
    return {
        dataUrl,
        mime,
        originalDims,
        view: { viewBox: { x1: 0, y1: 0, x2: originalDims.width, y2: originalDims.height }, viewDims },
    };
}
/**
 * Crop a region of a PNG locally (optionally upscaled), then prepare the
 * crop for upload. The crop REPLACES the image: the model sees only this
 * region, at full resolution. The view transform maps model boxes back to
 * original-image coordinates. PNG only — region cropping of other formats
 * is not possible without a codec.
 */
export function prepareCropUpload(path, box, options) {
    const ext = extname(path).toLowerCase();
    if (ext !== '.png') {
        throw new ImageError(`region cropping requires a PNG image: ${path}`);
    }
    const image = decodePng(readFileSync(path));
    const { x1, y1, x2, y2 } = box;
    let data = new Uint8Array((x2 - x1) * (y2 - y1) * 4);
    for (let y = y1; y < y2; y++) {
        const rowStart = y * image.width * 4;
        data.set(image.data.subarray(rowStart + x1 * 4, rowStart + x2 * 4), (y - y1) * (x2 - x1) * 4);
    }
    let crop = { width: x2 - x1, height: y2 - y1, data };
    const scale = options.scale && options.scale > 1 ? options.scale : 1;
    if (scale !== 1) {
        // Nearest-neighbor upscale (pixel replication); never generative.
        const scaled = new Uint8Array(crop.width * crop.height * scale * scale * 4);
        for (let y = 0; y < crop.height; y++) {
            for (let x = 0; x < crop.width; x++) {
                const src = (y * crop.width + x) * 4;
                for (let dy = 0; dy < scale; dy++) {
                    const dstRow = (y * scale + dy) * crop.width * scale * 4;
                    for (let dx = 0; dx < scale; dx++) {
                        scaled.set(data.subarray(src, src + 4), dstRow + (x * scale + dx) * 4);
                    }
                }
            }
        }
        crop = { width: crop.width * scale, height: crop.height * scale, data: scaled };
    }
    const longEdge = Math.max(crop.width, crop.height);
    const factor = longEdge > options.maxEdge ? Math.ceil(longEdge / options.maxEdge) : 1;
    const view = factor > 1 ? meanPoolDownscale(crop, factor) : crop;
    return {
        dataUrl: `data:image/png;base64,${encodePng(view).toString('base64')}`,
        mime: 'image/png',
        originalDims: { width: image.width, height: image.height },
        view: { viewBox: box, viewDims: { width: view.width, height: view.height } },
    };
}
