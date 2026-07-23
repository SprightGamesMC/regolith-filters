/**
 * Shared type definitions for the packager filter.
 */

/** Supported Marketplace content types. */
export type ContentType = "addon" | "world" | "texture_pack" | "skin_pack";

/** Semantic version tuple (major, minor, patch). */
export type VersionTuple = [number, number, number];

/** Resolved art file reference. */
export interface ArtAsset {
    fileName: string;
    sourcePath: string;
}

/** Resolved art role mapping for a store or marketing group. */
export interface ArtGroup {
    key_art?: ArtAsset;
    panorama?: ArtAsset;
    pack_icon?: ArtAsset;
    partner_art?: ArtAsset;
    screenshots?: ArtAsset[];
}

/** Validation specification for a single art role. */
export interface ArtSpec {
    count?: number;
    dpi?: number;
    formats: string[];
    height?: number;
    maxWidth?: number;
    minCount?: number;
    minWidth?: number;
    width?: number;
}

/** Map of role key to validation spec. */
export type ArtSpecMap = Record<string, ArtSpec>;

/** Required store and marketing role keys for a content type. */
export interface RequiredRoles {
    marketing: string[];
    store: string[];
}

/** Pack input rules for a content type. */
export interface PackRules {
    gameExtension: string;
    requiresBehaviorPack: boolean;
    requiresResourcePack: boolean;
    requiresSkinPack: boolean;
    requiresWorldTemplate: boolean;
}

/** Resolved project-relative content paths. */
export interface ContentPaths {
    buildPath: string;
    marketingArtPath: string;
    skinPackPath: string | null;
    storeArtPath: string;
    worldPath: string | null;
}

/** Absolute pack directory paths. */
export interface PackPaths {
    behaviorPackPath: string;
    resourcePackPath: string;
    skinPackPath: string | null;
    worldPath: string | null;
}

/** Validated packager arguments. */
export interface ResolvedArgs {
    archiveContentName: string;
    art: {
        marketing: ArtGroup;
        store: ArtGroup;
    };
    buildPath: string;
    contentAcronym: string | null;
    contentName: string;
    contentType: ContentType;
    contentVersion: VersionTuple;
    cwd: string;
    isStandaloneRp: boolean;
    marketingAssetContentName: string;
    minEngineVersion: VersionTuple | null;
    packPaths: PackPaths;
    paths: ContentPaths;
    projectRoot: string;
    storeAssetContentName: string;
}

/** Runtime path context passed to argument resolution. */
export interface RuntimeContext {
    cwd: string;
    projectRoot: string;
}

/** Normalized image metadata shared across decoders. */
export interface ImageMetadata {
    density?: number;
    format?: string;
    height?: number;
    horizontalDpi?: number;
    verticalDpi?: number;
    width?: number;
}

/** World pack reference entry. */
export interface PackReference {
    pack_id: string;
    version: VersionTuple;
}

/** Manifest update options. */
export interface ManifestOptions {
    contentType: ContentType;
    contentVersion: VersionTuple;
    minEngineVersion: VersionTuple | null;
    packKind: string;
}

/** Pack manifest lookup result. */
export interface ManifestState {
    actualPath: string | null;
    expectedPath: string;
    status: "case_mismatch" | "exact" | "missing";
}

/** Archive source metadata for a single pack directory. */
export interface PackSourceState {
    filePathList: string[];
    manifestContent: string | null;
    packReference: PackReference | null;
    sourcePath: string;
}

/** Archive source state produced by staging. */
export interface StageState {
    behaviorPack: PackSourceState | null;
    buildTempPath: string;
    resourcePack: PackSourceState | null;
    skinPack: PackSourceState | null;
    worldTemplate: PackSourceState | null;
}

/** Temporary and final archive paths for the build phase. */
export interface BuildState {
    gameOutputPath: string;
    gameTempPath: string;
    submissionOutputPath: string;
    submissionTempPath: string;
}

/** Generated output file paths. */
export interface PackagedFiles {
    gameFilePath: string;
    submissionFilePath: string;
}
