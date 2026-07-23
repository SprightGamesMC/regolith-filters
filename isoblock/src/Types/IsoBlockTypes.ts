import type { DataTexture } from "three";

/**
 * Shared type definitions for the isoblock filter.
 */

/** Resolved isoblock filter settings. */
export interface IsoBlockSettings {
    outputPath: string;
    resolution: number;
}

/** World-space [x, y, z] tuple. */
export type Vector3Tuple = [number, number, number];

/** Loaded pack paths and render context for a run. */
export interface LoadedPack {
    blocksDir: string;
    context: PackContext;
    outputDir: string;
}

/** Loaded resource-pack data required for rendering. */
export interface PackContext {
    geoMap: Record<string, string>;
    rpPath: string;
    textureData: TextureData;
}

/** `texture_data` map from terrain_texture.json. */
export type TextureData = Record<string, TextureEntry>;

/** Downloader resolving a URL to a fetch-shaped result. */
export type FetchFunction = (url: string) => Promise<FetchResult>;

/** Minimal response shape required from a FetchFunction. */
export interface FetchResult {
    arrayBuffer(): Promise<ArrayBuffer>;
    ok: boolean;
    status: number;
}

/** Single terrain_texture.json texture entry. */
export interface TextureEntry {
    textures?: TextureValue;
}

/** `textures` value shapes accepted by terrain_texture.json. */
export type TextureValue = string | TextureObject | (string | TextureObject)[];

/** Object form of a terrain_texture.json texture reference. */
export interface TextureObject {
    path?: string;
    variations?: { path: string }[];
}

/** `minecraft:block` definition. */
export interface BlockDefinition {
    components?: BlockComponents;
    description?: {
        identifier?: string;
        traits?: { "minecraft:multi_block"?: MultiBlockTrait };
    };
    permutations?: BlockPermutation[];
}

/** Block components map. */
export interface BlockComponents {
    "minecraft:geometry"?: GeometryComponent;
    "minecraft:item_visual"?: ItemVisualComponent;
    "minecraft:material_instances"?: MaterialInstances;
    [componentName: string]: unknown;
}

/** `minecraft:geometry` component value. */
export type GeometryComponent = string | { bone_visibility?: BoneVisibility; identifier?: string };

/** `bone_visibility` map from the `minecraft:geometry` component. */
export type BoneVisibility = Record<string, boolean | string>;

/** `minecraft:item_visual` component value. */
export interface ItemVisualComponent {
    geometry?: GeometryComponent;
    material_instances?: MaterialInstances;
}

/** `minecraft:material_instances` component value. */
export type MaterialInstances = Record<string, MaterialInstance>;

/** Single material instance entry. */
export interface MaterialInstance {
    render_method?: string;
    texture?: string;
}

/** `minecraft:multi_block` trait value. */
export interface MultiBlockTrait {
    direction?: string;
    parts?: number;
}

/** Block permutation entry. */
export interface BlockPermutation {
    components?: BlockComponents;
    condition?: string;
}

/** Parsed .geo.json model file. */
export interface GeometryFile {
    "minecraft:geometry"?: GeometryDefinition[];
    [key: string]: unknown;
}

/** Single geometry definition inside a model file. */
export interface GeometryDefinition {
    bones?: GeometryBone[];
    description?: {
        identifier?: string;
        texture_height?: number;
        texture_width?: number;
    };
}

/** Geometry bone definition. */
export interface GeometryBone {
    cubes?: GeometryCube[];
    inflate?: number;
    mirror?: boolean;
    name: string;
    parent?: string;
    pivot?: number[];
    rotation?: number[];
}

/** Geometry cube definition. */
export interface GeometryCube {
    inflate?: number;
    mirror?: boolean;
    origin: number[];
    pivot?: number[];
    rotation?: number[];
    size: number[];
    uv?: number[] | Record<string, PerFaceUv>;
}

/** Per-face UV definition on a geometry cube. */
export interface PerFaceUv {
    material_instance?: string;
    uv?: number[];
    uv_rotation?: number;
    uv_size?: number[];
}

/** Renderable part composed into a single image. */
export interface RenderPart {
    boneVisibility?: BoneVisibility;
    modelData: GeometryFile;
    offset: Vector3Tuple;
    textureConfig: TextureConfig;
}

/** Texture configuration keyed by face name (or `*`). */
export type TextureConfig = Record<string, FaceTexture>;

/** Texture and render method for a single face. */
export interface FaceTexture {
    render_method: string;
    texture: string;
}

/** UV rectangle in texture units with an optional 90-degree rotation. */
export interface FaceRect {
    rect: [number, number, number, number];
    rotation: number;
}

/** Box UV unwrap layout entry in texture units. */
export interface BoxUvEntry {
    face: string;
    fromX: number;
    fromY: number;
    sizeX: number;
    sizeY: number;
}

/** Decoded RGBA image data in top-down row order. */
export interface DecodedImage {
    data: Buffer;
    height: number;
    width: number;
}

/** Cached texture entry produced by the texture loader. */
export interface LoadedTexture {
    height: number;
    tex: DataTexture;
    width: number;
}

/** Caching texture loader resolving paths to loaded textures. */
export type TextureLoader = (texturePath: string) => Promise<LoadedTexture>;

/** UV coordinate space of a geometry, which may differ from texture pixel size. */
export interface GeometryUvSpace {
    height: number;
    width: number;
}
