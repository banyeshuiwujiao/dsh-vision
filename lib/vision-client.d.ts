export type VisionTask = 'map' | 'read' | 'zoom' | 'check';
export interface VisionEndpoint {
    apiKey: string;
    baseURL: string;
    model: string;
}
export interface VisionConfig {
    apiKey: string;
    baseURL: string;
    /** Primary model. */
    model: string;
    /** Per-task overrides; empty means use the primary. */
    modelMap: string;
    modelRead: string;
    modelZoom: string;
    modelCheck: string;
    /** Ordered fallback endpoints, tried after the primary per task. */
    chain: VisionEndpoint[];
    lang: string;
    timeoutMs: number;
}
export interface VisionImage {
    dataUrl: string;
}
export interface VisionCallOptions {
    task: VisionTask;
    prompt: string;
    images: VisionImage[];
    /** Omitted entirely when jsonMode (truncated JSON is worse than none). */
    maxTokens?: number;
    jsonMode?: boolean;
    /** Force temperature 0 (grounding, transcription). */
    deterministic?: boolean;
    /** Cancellation from the caller (fused with the per-request timeout). */
    signal?: AbortSignal;
}
export declare class VisionError extends Error {
    constructor(message: string);
}
export declare function callVision(config: VisionConfig, options: VisionCallOptions): Promise<string>;
