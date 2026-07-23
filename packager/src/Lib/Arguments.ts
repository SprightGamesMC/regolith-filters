import fs from "fs";
import path from "path";
import { REQUIRED_ROLES_BY_TYPE } from "../Data/AssetRequirements";
import type { ArtAsset, ArtGroup, ContentPaths, ContentType, ResolvedArgs, RuntimeContext, VersionTuple } from "../Types/PackagerTypes";

/**
 * Parses and validates Regolith filter settings from process arguments.
 */
export default class Arguments {
    static readonly CONTENT_TYPES: ContentType[] = ["addon", "world", "texture_pack", "skin_pack"];

    static readonly SAFE_PATH_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

    static readonly REALPATH_RESOLVER: (path: string) => string =
        typeof fs.realpathSync.native === "function" ? fs.realpathSync.native : fs.realpathSync;

    /**
     * Parses the raw JSON string from process arguments and validates all fields.
     *
     * @param rawJson - The JSON settings string passed by Regolith.
     * @param context - Runtime path context.
     *
     * @returns The validated settings object.
     *
     * @throws If required keys are missing or values are invalid.
     */
    static resolve(rawJson: string, context: RuntimeContext): ResolvedArgs {
        const rawSettings = this.parseSettings(rawJson);
        const projectRoot = path.resolve(context.projectRoot);
        const cwd = path.resolve(context.cwd);
        const contentType = this.readRequiredString(rawSettings, "content_type") as ContentType;

        if (!Arguments.CONTENT_TYPES.includes(contentType)) {
            throw new Error(`Invalid "content_type" value "${contentType}". Expected one of: ${Arguments.CONTENT_TYPES.join(", ")}.`);
        }

        const contentName = this.readRequiredString(rawSettings, "content_name");
        const contentAcronym =
            contentType === "skin_pack"
                ? this.readOptionalSafePathToken(rawSettings, "content_acronym", null)
                : this.readSafePathToken(rawSettings, "content_acronym");
        const contentVersion = this.readVersionTuple(rawSettings, "content_version");
        const isStandaloneRp = this.readOptionalBoolean(rawSettings, "is_standalone_rp", false);
        const minEngineVersion =
            contentType === "skin_pack"
                ? this.readOptionalVersionTuple(rawSettings, "min_engine_version", null)
                : this.readVersionTuple(rawSettings, "min_engine_version");
        const paths = this.readObject(rawSettings, "paths");
        const storeArt = this.readObject(rawSettings, "store_art");
        const marketingArt = this.readObject(rawSettings, "marketing_art");
        const artPaths = this.resolveContentPaths(paths, projectRoot, contentType);
        const requiredRoles = REQUIRED_ROLES_BY_TYPE[contentType];

        this.validateArtMappings(storeArt, requiredRoles.store, "store_art");
        this.validateArtMappings(marketingArt, requiredRoles.marketing, "marketing_art");

        const resolvedStoreArt = this.resolveArtFiles(storeArt, artPaths.storeArtPath, "store_art");
        const resolvedMarketingArt = this.resolveArtFiles(marketingArt, artPaths.marketingArtPath, "marketing_art");
        const archiveContentName = this.createArchiveContentName(contentName);

        fs.mkdirSync(artPaths.buildPath, { recursive: true });

        return {
            archiveContentName,
            art: {
                marketing: resolvedMarketingArt,
                store: resolvedStoreArt,
            },
            buildPath: artPaths.buildPath,
            contentAcronym,
            contentName,
            contentType,
            contentVersion,
            cwd,
            isStandaloneRp,
            minEngineVersion,
            packPaths: {
                behaviorPackPath: path.resolve(cwd, "BP"),
                resourcePackPath: path.resolve(cwd, "RP"),
                skinPackPath: artPaths.skinPackPath,
                worldPath: artPaths.worldPath,
            },
            marketingAssetContentName: archiveContentName,
            paths: artPaths,
            projectRoot,
            storeAssetContentName: archiveContentName.toLowerCase(),
        };
    }

    /**
     * Parses the raw Regolith settings JSON.
     *
     * @param rawJson - Raw JSON settings string.
     *
     * @returns Parsed settings object.
     *
     * @throws If the JSON is missing or invalid.
     */
    static parseSettings(rawJson: string): Record<string, unknown> {
        if (typeof rawJson !== "string" || rawJson.trim() === "") {
            throw new Error("Missing filter settings JSON.");
        }

        let parsedSettings: unknown;

        try {
            parsedSettings = JSON.parse(rawJson);
        } catch (error) {
            throw new Error("Invalid filter settings JSON.", { cause: error });
        }

        if (!parsedSettings || typeof parsedSettings !== "object" || Array.isArray(parsedSettings)) {
            throw new Error("Filter settings must be a JSON object.");
        }

        return parsedSettings as Record<string, unknown>;
    }

    /**
     * Reads a required string setting.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     *
     * @returns Trimmed string setting value.
     *
     * @throws If the key is missing or invalid.
     */
    static readRequiredString(settings: Record<string, unknown>, key: string): string {
        const value = settings[key];

        if (typeof value !== "string" || value.trim() === "") {
            throw new Error(`Setting "${key}" must be a non-empty string.`);
        }

        return value.trim();
    }

    /**
     * Reads a required string token that must remain safe as a single path segment.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     *
     * @returns Trimmed token value.
     *
     * @throws If the token is missing or contains invalid characters.
     */
    static readSafePathToken(settings: Record<string, unknown>, key: string): string {
        const value = this.readRequiredString(settings, key);

        if (!Arguments.SAFE_PATH_TOKEN_PATTERN.test(value)) {
            throw new Error(`Setting "${key}" must contain only letters, numbers, underscores, and hyphens.`);
        }

        return value;
    }

    /**
     * Reads an optional string token that must remain safe as a single path segment.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     * @param fallbackValue - Value returned when the key is omitted.
     *
     * @returns Trimmed token value when present.
     *
     * @throws If the token is present but invalid.
     */
    static readOptionalSafePathToken(settings: Record<string, unknown>, key: string, fallbackValue: string | null): string | null {
        if (!Object.hasOwn(settings, key) || settings[key] === null) {
            return fallbackValue;
        }

        return this.readSafePathToken(settings, key);
    }

    /**
     * Reads a required object setting.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     *
     * @returns Plain object value.
     *
     * @throws If the key is missing or invalid.
     */
    static readObject(settings: Record<string, unknown>, key: string): Record<string, unknown> {
        const value = settings[key];

        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`Setting "${key}" must be an object.`);
        }

        return value as Record<string, unknown>;
    }

    /**
     * Reads and validates a semantic version tuple.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     *
     * @returns Version tuple.
     *
     * @throws If the version is invalid.
     */
    static readVersionTuple(settings: Record<string, unknown>, key: string): VersionTuple {
        const value = settings[key];

        if (!Array.isArray(value) || value.length !== 3) {
            throw new Error(`Setting "${key}" must be an array of exactly three integers.`);
        }

        if (!value.every((entry) => Number.isInteger(entry) && entry >= 0)) {
            throw new Error(`Setting "${key}" must contain only non-negative integers.`);
        }

        return [value[0], value[1], value[2]];
    }

    /**
     * Reads an optional semantic version tuple.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     * @param fallbackValue - Value returned when the key is omitted.
     *
     * @returns Version tuple when present.
     *
     * @throws If the version is present but invalid.
     */
    static readOptionalVersionTuple(
        settings: Record<string, unknown>,
        key: string,
        fallbackValue: VersionTuple | null
    ): VersionTuple | null {
        if (!Object.hasOwn(settings, key) || settings[key] === null) {
            return fallbackValue;
        }

        return this.readVersionTuple(settings, key);
    }

    /**
     * Reads an optional boolean setting.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     * @param fallbackValue - Value returned when the key is omitted.
     *
     * @returns Boolean setting value.
     *
     * @throws If the value is present but not a boolean.
     */
    static readOptionalBoolean(settings: Record<string, unknown>, key: string, fallbackValue: boolean): boolean {
        if (!Object.hasOwn(settings, key)) {
            return fallbackValue;
        }

        if (typeof settings[key] !== "boolean") {
            throw new Error(`Setting "${key}" must be a boolean.`);
        }

        return settings[key];
    }

    /**
     * Resolves project-relative content paths.
     *
     * @param paths - Raw `paths` settings object.
     * @param projectRoot - Absolute project root.
     * @param contentType - Selected content type.
     *
     * @returns Resolved path object.
     *
     * @throws If required paths are missing or invalid.
     */
    static resolveContentPaths(paths: Record<string, unknown>, projectRoot: string, contentType: ContentType): ContentPaths {
        const buildPath = this.resolveOutputPath(this.readRequiredString(paths, "build_path"), projectRoot, "paths.build_path");
        const storeArtPath = this.resolveRequiredPath(paths, "store_art_path", projectRoot);
        const marketingArtPath = this.resolveRequiredPath(paths, "marketing_art_path", projectRoot);
        const worldPath = this.resolveOptionalPath(paths, "world_path", projectRoot);
        const skinPackPath = this.resolveOptionalPath(paths, "skin_pack_path", projectRoot);

        if (contentType === "world" && !worldPath) {
            throw new Error(`Setting "paths.world_path" must be provided when "content_type" is "world".`);
        }

        if (contentType === "skin_pack" && !skinPackPath) {
            throw new Error(`Setting "paths.skin_pack_path" must be provided when "content_type" is "skin_pack".`);
        }

        return {
            buildPath,
            marketingArtPath,
            skinPackPath,
            storeArtPath,
            worldPath,
        };
    }

    /**
     * Resolves a required project-relative path.
     *
     * @param paths - Raw path settings object.
     * @param key - Path key to resolve.
     * @param projectRoot - Absolute project root.
     *
     * @returns Absolute filesystem path.
     *
     * @throws If the path is missing or invalid.
     */
    static resolveRequiredPath(paths: Record<string, unknown>, key: string, projectRoot: string): string {
        const value = paths[key];

        if (typeof value !== "string" || value.trim() === "") {
            throw new Error(`Setting "paths.${key}" must be a non-empty string.`);
        }

        const resolvedPath = this.resolveProjectRelativePath(value, projectRoot, `paths.${key}`);

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Path "${value}" for "paths.${key}" does not exist.`);
        }

        if (!fs.statSync(resolvedPath).isDirectory()) {
            throw new Error(`Path "${value}" for "paths.${key}" must point to a directory.`);
        }

        return resolvedPath;
    }

    /**
     * Resolves an optional project-relative path.
     *
     * @param paths - Raw path settings object.
     * @param key - Path key to resolve.
     * @param projectRoot - Absolute project root.
     *
     * @returns Absolute filesystem path when present.
     *
     * @throws If a provided path is invalid.
     */
    static resolveOptionalPath(paths: Record<string, unknown>, key: string, projectRoot: string): string | null {
        if (!Object.hasOwn(paths, key) || paths[key] === null) {
            return null;
        }

        if (typeof paths[key] !== "string" || paths[key].trim() === "") {
            throw new Error(`Setting "paths.${key}" must be a string or null.`);
        }

        const resolvedPath = this.resolveProjectRelativePath(paths[key], projectRoot, `paths.${key}`);

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Path "${paths[key]}" for "paths.${key}" does not exist.`);
        }

        if (!fs.statSync(resolvedPath).isDirectory()) {
            throw new Error(`Path "${paths[key]}" for "paths.${key}" must point to a directory.`);
        }

        return resolvedPath;
    }

    /**
     * Resolves an output directory path and allows it to be created later.
     *
     * @param relativePath - Project-relative output path.
     * @param projectRoot - Absolute project root.
     * @param key - Setting key for error messages.
     *
     * @returns Absolute output directory path.
     *
     * @throws If the path is invalid.
     */
    static resolveOutputPath(relativePath: string, projectRoot: string, key: string): string {
        const resolvedPath = this.resolveProjectRelativePath(relativePath, projectRoot, key);

        if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
            throw new Error(`Path "${relativePath}" for "${key}" must point to a directory.`);
        }

        return resolvedPath;
    }

    /**
     * Resolves a project-relative path and ensures it stays under the project root.
     *
     * @param relativePath - Candidate project-relative path.
     * @param projectRoot - Absolute project root.
     * @param key - Setting key for error messages.
     *
     * @returns Absolute filesystem path inside the project root.
     *
     * @throws If the path is absolute or escapes the project root.
     */
    static resolveProjectRelativePath(relativePath: string, projectRoot: string, key: string): string {
        const trimmedPath = relativePath.trim();

        if (path.isAbsolute(trimmedPath)) {
            throw new Error(`Path "${relativePath}" for "${key}" must be project-relative.`);
        }

        const resolvedPath = path.resolve(projectRoot, trimmedPath);

        if (!this.isPathInsideRoot(projectRoot, resolvedPath)) {
            throw new Error(`Path "${relativePath}" for "${key}" must stay inside the project root.`);
        }

        return resolvedPath;
    }

    /**
     * Validates required and optional asset role mappings.
     *
     * @param artSettings - Raw art settings object.
     * @param requiredRoles - Required role keys for the content type.
     * @param settingsKey - Root settings key for error messages.
     *
     * @throws If the role mapping object is invalid.
     */
    static validateArtMappings(artSettings: Record<string, unknown>, requiredRoles: string[], settingsKey: string): void {
        const allowedRoleSet = new Set(["key_art", "panorama", "pack_icon", "partner_art", "screenshots"]);

        for (const roleKey of Object.keys(artSettings)) {
            if (!allowedRoleSet.has(roleKey)) {
                throw new Error(`Unknown role "${roleKey}" in "${settingsKey}".`);
            }
        }

        for (const roleKey of requiredRoles) {
            if (!Object.hasOwn(artSettings, roleKey)) {
                throw new Error(`Missing required role "${roleKey}" in "${settingsKey}".`);
            }
        }

        for (const [roleKey, roleValue] of Object.entries(artSettings)) {
            if (roleKey === "screenshots") {
                if (!Array.isArray(roleValue) || roleValue.length === 0) {
                    throw new Error(`Setting "${settingsKey}.screenshots" must be a non-empty array of strings.`);
                }

                if (!roleValue.every((entry) => typeof entry === "string" && entry.trim() !== "")) {
                    throw new Error(`Setting "${settingsKey}.screenshots" must contain only non-empty strings.`);
                }

                continue;
            }

            if (typeof roleValue !== "string" || roleValue.trim() === "") {
                throw new Error(`Setting "${settingsKey}.${roleKey}" must be a non-empty string.`);
            }
        }
    }

    /**
     * Resolves art file references into absolute file metadata records.
     *
     * @param artSettings - Raw art settings object.
     * @param artRootPath - Absolute art source directory.
     * @param settingsKey - Root settings key for error messages.
     *
     * @returns Resolved art file mapping.
     *
     * @throws If a referenced file is missing.
     */
    static resolveArtFiles(artSettings: Record<string, unknown>, artRootPath: string, settingsKey: string): ArtGroup {
        const resolvedArt: ArtGroup = {};

        for (const [roleKey, roleValue] of Object.entries(artSettings)) {
            if (roleKey === "screenshots") {
                resolvedArt.screenshots = (roleValue as string[]).map((fileName, index) => {
                    return this.resolveReferencedArtFile(fileName, artRootPath, `${settingsKey}.screenshots[${index}]`);
                });
                continue;
            }

            resolvedArt[roleKey as "key_art" | "panorama" | "pack_icon" | "partner_art"] = this.resolveReferencedArtFile(
                roleValue as string,
                artRootPath,
                `${settingsKey}.${roleKey}`
            );
        }

        return resolvedArt;
    }

    /**
     * Resolves a single asset filename inside an art directory.
     *
     * @param fileName - Project-relative filename inside the art directory.
     * @param artRootPath - Absolute art source directory.
     * @param settingsKey - Setting key for error messages.
     *
     * @returns Resolved asset file record.
     *
     * @throws If the referenced file does not exist.
     */
    static resolveReferencedArtFile(fileName: string, artRootPath: string, settingsKey: string): ArtAsset {
        const sourcePath = path.resolve(artRootPath, fileName);

        if (!this.isPathInsideRoot(artRootPath, sourcePath)) {
            throw new Error(`Referenced file "${fileName}" for "${settingsKey}" must stay inside "${artRootPath}".`);
        }

        if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
            throw new Error(`Referenced file "${fileName}" for "${settingsKey}" was not found in "${artRootPath}".`);
        }

        return {
            fileName,
            sourcePath,
        };
    }

    /**
     * Determines whether a candidate path stays inside a root directory.
     *
     * @param rootPath - Absolute root directory path.
     * @param candidatePath - Absolute candidate path.
     *
     * @returns `true` when the candidate stays within the root.
     */
    static isPathInsideRoot(rootPath: string, candidatePath: string): boolean {
        const canonicalRootPath = this.resolveCanonicalPath(rootPath);
        const canonicalCandidatePath = this.resolveCanonicalPath(candidatePath);
        const relativePath = path.relative(canonicalRootPath, canonicalCandidatePath);

        if (relativePath === "") {
            return true;
        }

        return !relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath);
    }

    /**
     * Resolves a filesystem path to a canonical path, following symlinks and junctions.
     * Allows the final path segment to be missing by resolving the nearest existing ancestor.
     *
     * @param targetPath - Absolute candidate path.
     *
     * @returns Canonical filesystem path.
     */
    static resolveCanonicalPath(targetPath: string): string {
        const resolvedTargetPath = path.resolve(targetPath);

        if (fs.existsSync(resolvedTargetPath)) {
            return Arguments.REALPATH_RESOLVER(resolvedTargetPath);
        }

        const pendingSegmentList: string[] = [];
        let existingAncestorPath = resolvedTargetPath;
        let parentPath = path.dirname(existingAncestorPath);

        while (!fs.existsSync(existingAncestorPath)) {
            pendingSegmentList.unshift(path.basename(existingAncestorPath));

            if (parentPath === existingAncestorPath) {
                break;
            }

            existingAncestorPath = parentPath;
            parentPath = path.dirname(existingAncestorPath);
        }

        const canonicalAncestorPath = Arguments.REALPATH_RESOLVER(existingAncestorPath);

        if (pendingSegmentList.length === 0) {
            return canonicalAncestorPath;
        }

        return path.resolve(canonicalAncestorPath, ...pendingSegmentList);
    }

    /**
     * Builds the sanitized archive basename from the configured content name.
     *
     * @param contentName - Raw content name.
     *
     * @returns Safe archive basename.
     *
     * @throws If the content name cannot produce a usable basename.
     */
    static createArchiveContentName(contentName: string): string {
        const archiveContentName = this.toPascalCaseName(contentName);

        if (archiveContentName === "") {
            throw new Error(`Setting "content_name" must contain at least one letter or number.`);
        }

        return archiveContentName;
    }

    /**
     * Converts a content name into a compact PascalCase filename token.
     *
     * @param contentName - Raw content name.
     *
     * @returns PascalCase content name.
     */
    static toPascalCaseName(contentName: string): string {
        return contentName
            .split(/[^A-Za-z0-9]+/)
            .filter((part) => part !== "")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join("");
    }
}
