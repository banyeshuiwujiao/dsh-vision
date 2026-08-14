import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { VisualMemory } from './registry.js';
import { type VisionConfig } from './vision-client.js';
export interface ToolDeps {
    vision: VisionConfig;
    memory: VisualMemory;
    maxEdge: number;
}
export interface Verdict {
    claim: string;
    verdict: 'supported' | 'contradicted' | 'unverifiable';
    reason: string;
}
/** Tolerant parse of the vision_check verdict reply (fences, wrapper keys). */
export declare function parseVerdicts(text: string, claims: string[]): Verdict[];
/** Generic object output schema with exactly the given properties. */
export declare function buildTools(deps: ToolDeps): ToolDefinition[];
