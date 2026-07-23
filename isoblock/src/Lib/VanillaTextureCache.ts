import type FilterLogger from "./FilterLogger";
import type { FetchFunction, TextureData } from "../Types/IsoBlockTypes";
import fs from "fs/promises";
import path from "path";
import JsonTools from "./JsonTools";

/**
 * Downloads vanilla resource-pack assets from Mojang's bedrock-samples
 * repository and caches them on disk for later runs.
 */
export default class VanillaTextureCache {
    static readonly BASE_URL = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/";

    static readonly TERRAIN_TEXTURE_PATH = "textures/terrain_texture.json";

    static readonly TEXTURE_EXTENSIONS = [".png", ".tga"];

    /** Absolute cache directory path. */
    private readonly cacheDirectory: string;

    /** Standardized output logger. */
    private readonly logger: FilterLogger;

    /** Downloader for repository URLs. */
    private readonly fetchFunction: FetchFunction;

    /** Texture requests keyed by relative path, shared between callers. */
    private readonly textureRequests = new Map<string, Promise<string | null>>();

    /** Memoized vanilla terrain texture data. */
    private textureData: Promise<TextureData> | null = null;

    /**
     * Creates the cache.
     *
     * @param cacheDirectory - Absolute cache directory path.
     * @param logger - Standardized output logger.
     * @param fetchFunction - Downloader for repository URLs.
     */
    constructor(cacheDirectory: string, logger: FilterLogger, fetchFunction: FetchFunction = (url): Promise<Response> => fetch(url)) {
        this.cacheDirectory = cacheDirectory;
        this.logger = logger;
        this.fetchFunction = fetchFunction;
    }

    /**
     * Loads the vanilla terrain texture data, downloading it on first use.
     *
     * @returns TextureData, or an empty object when unavailable.
     */
    loadTextureData(): Promise<TextureData> {
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
    fetchTexture(relativePath: string): Promise<string | null> {
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
    private async readTextureData(): Promise<TextureData> {
        const filePath = await this.ensureFile(VanillaTextureCache.TERRAIN_TEXTURE_PATH);
        if (!filePath) {
            return {};
        }

        try {
            const document = JsonTools.loadFile(filePath) as { texture_data?: TextureData };

            return document.texture_data ?? {};
        } catch {
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
    private async ensureTexture(relativePath: string): Promise<string | null> {
        for (const extension of VanillaTextureCache.TEXTURE_EXTENSIONS) {
            const filePath = path.join(this.cacheDirectory, `${relativePath}${extension}`);

            if (await this.fileExists(filePath)) {
                return filePath;
            }
        }

        for (const [index, extension] of VanillaTextureCache.TEXTURE_EXTENSIONS.entries()) {
            const fileRelativePath = `${relativePath}${extension}`;
            const isLastExtension = index === VanillaTextureCache.TEXTURE_EXTENSIONS.length - 1;
            const filePath = await this.downloadFile(fileRelativePath, path.join(this.cacheDirectory, fileRelativePath), isLastExtension);

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
    private async ensureFile(relativePath: string, warnOnMissing = true): Promise<string | null> {
        const filePath = path.join(this.cacheDirectory, relativePath);

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
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await fs.access(filePath);

            return true;
        } catch {
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
    private async downloadFile(relativePath: string, filePath: string, warnOnMissing: boolean): Promise<string | null> {
        const url = `${VanillaTextureCache.BASE_URL}${relativePath.replace(/\\/g, "/")}`;

        try {
            const response = await this.fetchFunction(url);
            if (!response.ok) {
                if (warnOnMissing) {
                    this.logger.warn(`Vanilla asset not found in bedrock-samples (HTTP ${response.status}): ${relativePath}`);
                }

                return null;
            }

            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, Buffer.from(await response.arrayBuffer()));

            return filePath;
        } catch (error) {
            this.logger.warn(`Failed to download vanilla asset ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);

            return null;
        }
    }
}
