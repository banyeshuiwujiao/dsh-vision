export declare const LANG_LINES: Record<string, string>;
/** vision_map: turn an image into a numbered element inventory. */
export declare function mapPrompt(params: {
    focus?: string;
    maxItems: number;
    lang: string;
}): string;
/** vision_read ask mode: answer a precise question about one or more images. */
export declare function readAskPrompt(question: string, imageCount: number, lang: string): string;
/** vision_read transcribe mode, one short image. */
export declare function readTranscribePrompt(): string;
/** vision_read transcribe mode, one strip of a tiled page. */
export declare function readStripPrompt(index: number, count: number): string;
/** vision_zoom: answer a targeted question about a magnified crop. */
export declare function zoomPrompt(question: string, lang: string): string;
/** vision_check (v1.1): verify claims against visual evidence. */
export declare function checkPrompt(claims: string[]): string;
