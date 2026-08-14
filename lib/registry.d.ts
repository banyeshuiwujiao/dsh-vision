import type { NormBox, PxBox } from './coords.js';
export interface RegistryRegion {
    id: number;
    label: string;
    /** 0-1000 of the original image. */
    norm: NormBox;
}
export interface RegistryEntry {
    key: string;
    imageId: string;
    width: number;
    height: number;
    regions: RegistryRegion[];
}
export declare class RegistryError extends Error {
    constructor(message: string);
}
export declare const REGISTRY_CAP = 16;
export declare class VisualMemory {
    private entries;
    private order;
    private latestKey;
    /** File identity: the same path with changed content is a new image. */
    static identity(path: string): string;
    store(imagePath: string, imageId: string, width: number, height: number, regions: RegistryRegion[]): RegistryEntry;
    /**
     * Resolve a reference string against an image path.
     * Forms: "7" (most recent map) or "7@imageId" (a specific map).
     */
    resolve(imagePath: string, ref: string): {
        region: RegistryRegion;
        box: PxBox;
        imageId: string;
    };
    get size(): number;
}
