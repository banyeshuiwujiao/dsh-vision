// One internal coordinate convention: 0-1000 normalized on both axes, in the
// ORIGINAL image space. Every model call carries a view transform describing
// exactly which rectangle of the original image the model saw (after any
// deterministic crop or downscale), so model outputs — always requested in
// 0-1000 of the model's view — convert back to original pixels mechanically.
// Downscaling, region scoping, and strip tiling therefore never leak into the
// wire protocol, and the text agent never deals with model-specific
// conventions (Qwen absolute pixels, GPT tile math, etc.).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Model's 0-1000 box → original-image pixels. */
export function normToPx(norm, view) {
    const scaleX = view.viewDims.width / 1000;
    const scaleY = view.viewDims.height / 1000;
    return {
        x1: clamp(Math.round(norm.x1 * scaleX) + view.viewBox.x1, 0, view.viewBox.x2),
        y1: clamp(Math.round(norm.y1 * scaleY) + view.viewBox.y1, 0, view.viewBox.y2),
        x2: clamp(Math.round(norm.x2 * scaleX) + view.viewBox.x1, 0, view.viewBox.x2),
        y2: clamp(Math.round(norm.y2 * scaleY) + view.viewBox.y1, 0, view.viewBox.y2),
    };
}
/** Original pixels → 0-1000 of the original image space. */
export function pxToNormOfOriginal(box, dims) {
    return {
        x1: (box.x1 / dims.width) * 1000,
        y1: (box.y1 / dims.height) * 1000,
        x2: (box.x2 / dims.width) * 1000,
        y2: (box.y2 / dims.height) * 1000,
    };
}
/** 0-1000 of the original image → original pixels (execution boundary). */
export function normOfOriginalToPx(norm, dims) {
    return {
        x1: clamp(Math.round((norm.x1 / 1000) * dims.width), 0, dims.width),
        y1: clamp(Math.round((norm.y1 / 1000) * dims.height), 0, dims.height),
        x2: clamp(Math.round((norm.x2 / 1000) * dims.width), 0, dims.width),
        y2: clamp(Math.round((norm.y2 / 1000) * dims.height), 0, dims.height),
    };
}
export const normalizedAdapter = {
    toNorm(raw, view) {
        if (!Array.isArray(raw) || raw.length !== 4)
            return null;
        const values = raw.map(Number);
        if (values.some((v) => !Number.isFinite(v)))
            return null;
        let [x1, y1, x2, y2] = values;
        // Tolerate the [y0,x0,y1,x1] convention by heuristics: if the "x" pair
        // spans more of the view than the "y" pair would, swap axes. In practice
        // we always prompt for [x1,y1,x2,y2]; this is a last-mile guard.
        if (Math.abs(x2 - x1) > view.viewDims.width && Math.abs(y2 - y1) <= view.viewDims.height) {
            ;
            [x1, y1, x2, y2] = [y1, x1, y2, x2];
        }
        if (x1 > x2)
            [x1, x2] = [x2, x1];
        if (y1 > y2)
            [y1, y2] = [y2, y1];
        const norm = { x1, y1, x2, y2 };
        return norm;
    },
};
