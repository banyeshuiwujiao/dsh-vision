import { type NormBox } from './coords.js';
export interface ParsedElement {
    id: number;
    label: string;
    /** Verbatim visible text, when the model reported one. */
    text?: string;
    /** Model's self-reported certainty (0-1), when reported. */
    confidence?: number;
    /** 0-1000 of the model's view space. */
    norm: NormBox;
}
export declare class BboxError extends Error {
    constructor(message: string);
}
/**
 * Parse the model reply into cleaned, deduplicated, reading-order-sorted,
 * harness-numbered elements.
 * @param viewDims - the model view size (after preprocessing), used to
 *   validate spans against the wire grid.
 */
export declare function parseElements(text: string, maxItems: number, viewDims: {
    width: number;
    height: number;
}): ParsedElement[];
/** Parse a "X1,Y1,X2,Y2" pixel box string, clamped into the image bounds. */
export declare function parseRegion(region: string, width: number, height: number): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};
/** Coarse position label from the box center, for inventory readability. */
export declare function positionLabel(box: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}, width: number, height: number): string;
