export interface PxBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** 0-1000 normalized box in whatever space the context declares. */
export interface NormBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
export interface ViewTransform {
    /** Rectangle of the original image the model actually saw (original pixels). */
    viewBox: PxBox;
    /** Dimensions of the model's view after deterministic preprocessing. */
    viewDims: {
        width: number;
        height: number;
    };
}
/** Model's 0-1000 box → original-image pixels. */
export declare function normToPx(norm: NormBox, view: ViewTransform): PxBox;
/** Original pixels → 0-1000 of the original image space. */
export declare function pxToNormOfOriginal(box: PxBox, dims: {
    width: number;
    height: number;
}): NormBox;
/** 0-1000 of the original image → original pixels (execution boundary). */
export declare function normOfOriginalToPx(norm: NormBox, dims: {
    width: number;
    height: number;
}): PxBox;
/**
 * Model convention adapter seam. v1 ships only the normalized adapter (the
 * wire protocol always asks for 0-1000); pixel-absolute model families
 * (Qwen2.5-VL style) get their own adapter here later without touching tools.
 */
export interface CoordinateAdapter {
    /** Raw model box (whatever the model emitted) → 0-1000 of the model's view. */
    toNorm(raw: unknown, view: ViewTransform): NormBox | null;
}
export declare const normalizedAdapter: CoordinateAdapter;
