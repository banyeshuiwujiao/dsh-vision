export interface PngImage {
    width: number;
    height: number;
    /** RGBA pixels, row-major, 4 bytes per pixel. */
    data: Uint8Array;
}
export declare class PngError extends Error {
    constructor(message: string);
}
export declare function decodePng(input: Uint8Array): PngImage;
export declare function encodePng(image: PngImage): Buffer;
export declare function readPngFile(path: string): PngImage;
