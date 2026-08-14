import type { PngImage } from './png.js';
export interface AnnotateBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** Return a copy of the image with 2px borders drawn around every box. */
export declare function drawBoxes(image: PngImage, boxes: AnnotateBox[], color?: [number, number, number], thickness?: number): PngImage;
