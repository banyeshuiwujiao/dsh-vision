import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { VisualMemory } from './registry.js';
import { type VisionConfig } from './vision-client.js';
export interface ToolDeps {
    vision: VisionConfig;
    memory: VisualMemory;
    maxEdge: number;
}
/** Generic object output schema with exactly the given properties. */
export declare function buildTools(deps: ToolDeps): ToolDefinition[];
