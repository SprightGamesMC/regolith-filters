"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Downloads vanilla resource-pack assets from Mojang's bedrock-samples
 * repository and caches them on disk for later runs.
 */
class VanillaTextureCache {
    static BASE_URL = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/";
    static TERRAIN_TEXTURE_PATH = "textures/terrain_texture.json";
    static TEXTURE_EXTENSIONS = [".png", ".tga"];
    /** Absolute cache directory path. */
    cacheDirectory;
    /** Standardized output logger. */
    logger;
    /** Downloader for repository URLs. */
    fetchFunction;
    /** Texture requests keyed by relative path, shared between callers. */
    textureRequests = new Map();
    /** Memoized vanilla terrain texture data. */
    textureData = null;
    /**
     * Creates the cache.
     *
     * @param cacheDirectory - Absolute cache directory path.
     * @param logger - Standardized output logger.
     * @param fetchFunction - Downloader for repository URLs.
     */
    constructor(cacheDirectory, logger, fetchFunction = (url) => fetch(url)) {
        this.cacheDirectory = cacheDirectory;
        this.logger = logger;
        this.fetchFunction = fetchFunction;
    }
    /**
     * Loads the vanilla terrain texture data, downloading it on first use.
     *
     * @returns TextureData, or an empty object when unavailable.
     */
    loadTextureData() {
        this.textureData ??= this.readTextureData();
        return this.textureData;
    }
    /**
     * Resolves a vanilla texture to a locally cached file, downloading it on
     * first use. Tries each supported extension in order. Concurrent requests
     * for the same texture share one download.
     *
     * @param relativePath - Texture path relative to the resource pack root, without extension.
     *
     * @returns Absolute cached file path, or null when unavailable.
     */
    fetchTexture(relativePath) {
        let request = this.textureRequests.get(relativePath);
        if (!request) {
            request = this.ensureTexture(relativePath);
            this.textureRequests.set(relativePath, request);
        }
        return request;
    }
    /**
     * Reads and parses the cached vanilla terrain texture file.
     *
     * @returns TextureData, or an empty object when unavailable.
     */
    async readTextureData() {
        const filePath = await this.ensureFile(VanillaTextureCache.TERRAIN_TEXTURE_PATH);
        if (!filePath) {
            return {};
        }
        try {
            const document = JsonTools_1.default.loadFile(filePath);
            return document.texture_data ?? {};
        }
        catch {
            return {};
        }
    }
    /**
     * Returns the cached texture file for a relative path. Checks the disk
     * cache for every supported extension before downloading, so a cached
     * `.tga` is never shadowed by a repeated `.png` download attempt.
     *
     * @param relativePath - Texture path relative to the resource pack root, without extension.
     *
     * @returns Absolute cached file path, or null when unavailable.
     */
    async ensureTexture(relativePath) {
        for (const extension of VanillaTextureCache.TEXTURE_EXTENSIONS) {
            const filePath = path_1.default.join(this.cacheDirectory, `${relativePath}${extension}`);
            if (await this.fileExists(filePath)) {
                return filePath;
            }
        }
        for (const [index, extension] of VanillaTextureCache.TEXTURE_EXTENSIONS.entries()) {
            const fileRelativePath = `${relativePath}${extension}`;
            const isLastExtension = index === VanillaTextureCache.TEXTURE_EXTENSIONS.length - 1;
            const filePath = await this.downloadFile(fileRelativePath, path_1.default.join(this.cacheDirectory, fileRelativePath), isLastExtension);
            if (filePath) {
                return filePath;
            }
        }
        return null;
    }
    /**
     * Returns the cached copy of a repository file, downloading it when absent.
     *
     * @param relativePath - File path relative to the resource pack root.
     * @param warnOnMissing - Whether to warn when the repository lacks the file.
     *
     * @returns Absolute cached file path, or null when the download fails.
     */
    async ensureFile(relativePath, warnOnMissing = true) {
        const filePath = path_1.default.join(this.cacheDirectory, relativePath);
        if (await this.fileExists(filePath)) {
            return filePath;
        }
        return this.downloadFile(relativePath, filePath, warnOnMissing);
    }
    /**
     * Checks whether a file exists.
     *
     * @param filePath - Absolute file path.
     *
     * @returns `true` when the file exists, `false` otherwise.
     */
    async fileExists(filePath) {
        try {
            await promises_1.default.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Downloads a repository file into the cache.
     *
     * @param relativePath - File path relative to the resource pack root.
     * @param filePath - Absolute cache destination path.
     * @param warnOnMissing - Whether to warn when the repository lacks the file.
     *
     * @returns Absolute cached file path, or null when the download fails.
     */
    async downloadFile(relativePath, filePath, warnOnMissing) {
        const url = `${VanillaTextureCache.BASE_URL}${relativePath.replace(/\\/g, "/")}`;
        try {
            const response = await this.fetchFunction(url);
            if (!response.ok) {
                if (warnOnMissing) {
                    this.logger.warn(`Vanilla asset not found in bedrock-samples (HTTP ${response.status}): ${relativePath}`);
                }
                return null;
            }
            await promises_1.default.mkdir(path_1.default.dirname(filePath), { recursive: true });
            await promises_1.default.writeFile(filePath, Buffer.from(await response.arrayBuffer()));
            return filePath;
        }
        catch (error) {
            this.logger.warn(`Failed to download vanilla asset ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
}
exports.default = VanillaTextureCache;
