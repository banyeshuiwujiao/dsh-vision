// Draw bounding boxes onto an RGBA image — the "annotated proof" output.
// Pure pixel borders (no text rendering, no fonts): labels stay in the tool
// text, boxes land on the pixels. Deterministic and dependency-free.
const DEFAULT_COLOR = [45, 107, 254];
/** Return a copy of the image with 2px borders drawn around every box. */
export function drawBoxes(image, boxes, color = DEFAULT_COLOR, thickness = 2) {
    const data = new Uint8Array(image.data);
    const width = image.width;
    const height = image.height;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    for (const box of boxes) {
        const x1 = clamp(box.x1, 0, width - 1);
        const y1 = clamp(box.y1, 0, height - 1);
        const x2 = clamp(box.x2, 0, width - 1);
        const y2 = clamp(box.y2, 0, height - 1);
        if (x2 <= x1 || y2 <= y1)
            continue;
        const paint = (x, y) => {
            const i = (y * width + x) * 4;
            data[i] = color[0];
            data[i + 1] = color[1];
            data[i + 2] = color[2];
            data[i + 3] = 255;
        };
        for (let t = 0; t < thickness; t++) {
            for (let x = x1; x <= x2; x++) {
                paint(x, y1 + t);
                paint(x, y2 - t);
            }
            for (let y = y1; y <= y2; y++) {
                paint(x1 + t, y);
                paint(x2 - t, y);
            }
        }
    }
    return { width, height, data };
}
