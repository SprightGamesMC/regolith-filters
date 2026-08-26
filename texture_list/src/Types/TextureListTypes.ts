/**
 * Shared type definitions for the texture list filter.
 */

/** Regolith project config fields the filter reads. */
export interface ProjectConfig {
    packs?: {
        resourcePack?: string;
    };
}

/** Image file found under a pack's textures folder. */
export interface TextureImage {
    /** Lower case pack relative path without extension, for comparison. */
    key: string;
    /** Pack relative path without extension, original case, for output. */
    listPath: string;
}

/** Layer keys collected from every texture set in a pack. */
export interface TextureSetLayers {
    /** Keys named by `color` layers. */
    colorKeys: Set<string>;
    /** Keys named by non color layers. */
    layerKeys: Set<string>;
}
