export interface Strip {
    index: number;
    count: number;
    y1: number;
    y2: number;
}
export interface TilePlan {
    strips: Strip[];
    stripHeight: number;
    overlap: number;
}
/** Whether a page should be tiled for transcription. */
export declare function shouldTile(dims: {
    width: number;
    height: number;
}): boolean;
/** Plan horizontal strips for one page. The last strip anchors the bottom edge. */
export declare function planStrips(width: number, height: number): TilePlan;
/**
 * Merge per-strip transcripts top-to-bottom. Consecutive strips overlap by
 * design; the merge finds the longest exact-line overlap (last k lines of the
 * previous strip == first k lines of the next) and drops the duplicated
 * prefix. Exact comparison only: lines that differ anywhere stay, so real
 * content is never removed.
 */
export declare function mergeStrips(transcripts: string[]): string;
/** Placeholder for a strip whose call failed: honest, never fabricated. */
export declare function unreadableStrip(index: number): string;
