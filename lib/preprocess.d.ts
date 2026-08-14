import { type PngImage } from './png.js';
import type { ViewTransform } from './coords.js';
export declare class ImageError extends Error {
    constructor(message: string);
}
export interface PreparedUpload {
    /** data URL ready for the vision API. */
    dataUrl: string;
    mime: string;
    /** What the model saw, mapped to the original image. */
    view: ViewTransform;
    /** Original image size. */
    originalDims: {
        width: number;
        height: number;
    };
}
export interface Dims {
    width: number;
    height: number;
}
export declare function readImageDims(path: string): Dims;
/** Integer-factor mean-pool downscale: every k×k block averages to one pixel. */
export declare function meanPoolDownscale(image: PngImage, factor: number): PngImage;
/**
 * Prepare one image path for upload. PNG gets a deterministic downscale to
 * the long-edge cap; other formats pass through with original dimensions.
 */
export declare function prepareUpload(path: string, maxEdge: number): PreparedUpload;
/**
 * Crop a region of a PNG locally (optionally upscaled), then prepare the
 * crop for upload. The crop REPLACES the image: the model sees only this
 * region, at full resolution. The view transform maps model boxes back to
 * original-image coordinates. PNG only — region cropping of other formats
 * is not possible without a codec.
 */
export declare function prepareCropUpload(path: string, box: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}, options: {
    scale?: number;
    maxEdge: number;
}): PreparedUpload;
