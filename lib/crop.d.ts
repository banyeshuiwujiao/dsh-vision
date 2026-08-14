import { type PngImage } from './png.js';
export declare class CropError extends Error {
    constructor(message: string);
}
export declare function requirePng(path: string): PngImage;
/** Extract a pixel box from a PNG and write it to a new file. */
export declare function cropPngRegion(imagePath: string, region: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}, outPath: string | null, scale?: number): {
    path: string;
    width: number;
    height: number;
    scale: number;
};
/** Clamp a region string against a PNG's real size (helper for tool args). */
export declare function regionFor(imagePath: string, region?: string): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
} | null;
