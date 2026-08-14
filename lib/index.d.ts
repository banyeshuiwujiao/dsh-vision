import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-vision";
export declare const inject: string[];
export interface Config {
    apiKey: string;
    baseURL: string;
    model: string;
    modelMap: string;
    modelRead: string;
    modelZoom: string;
    lang: string;
    timeoutMs: number;
    maxEdge: number;
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
