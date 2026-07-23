import path from "path";
import type { ArtAsset } from "../Types/PackagerTypes";

/**
 * Resolves staged and archived output filenames for art assets.
 */
export default class AssetOutputNames {
    /**
     * Resolves the staged output extension for an asset.
     *
     * @param asset - Resolved asset metadata.
     * @param fallbackExtension - Extension used when none is available.
     *
     * @returns Normalized output extension.
     */
    static resolveAssetOutputExtension(asset: Partial<ArtAsset> | undefined, fallbackExtension = ".jpg"): string {
        const candidatePath =
            asset && typeof asset.fileName === "string" && asset.fileName.trim() !== ""
                ? asset.fileName
                : asset && typeof asset.sourcePath === "string"
                  ? asset.sourcePath
                  : "";

        return this.normalizeOutputExtension(path.extname(candidatePath), fallbackExtension);
    }

    /**
     * Builds the output filename for store key art.
     *
     * @param contentName - Store asset content name.
     *
     * @returns Output filename.
     */
    static createStoreKeyArtName(contentName: string): string {
        return `${contentName}_Thumbnail_0.jpg`;
    }

    /**
     * Builds the output filename for store panorama art.
     *
     * @param contentName - Store asset content name.
     *
     * @returns Output filename.
     */
    static createStorePanoramaName(contentName: string): string {
        return `${contentName}_panorama_0.jpg`;
    }

    /**
     * Builds the output filename for store pack-icon art.
     *
     * @param contentName - Store asset content name.
     *
     * @returns Output filename.
     */
    static createStorePackIconName(contentName: string): string {
        return `${contentName}_packicon_0.jpg`;
    }

    /**
     * Builds the output filename for a store screenshot.
     *
     * @param contentName - Store asset content name.
     * @param index - Screenshot index.
     *
     * @returns Output filename.
     */
    static createStoreScreenshotName(contentName: string, index: number): string {
        return `${contentName}_screenshot_${index}.jpg`;
    }

    /**
     * Builds the output filename for marketing key art.
     *
     * @param contentName - Marketing asset content name.
     * @param asset - Resolved asset metadata.
     *
     * @returns Output filename.
     */
    static createMarketingKeyArtName(contentName: string, asset: Partial<ArtAsset> | undefined): string {
        return `${contentName}_MarketingKeyArt${this.resolveAssetOutputExtension(asset)}`;
    }

    /**
     * Builds the output filename for marketing partner art.
     *
     * @param contentName - Marketing asset content name.
     * @param asset - Resolved asset metadata.
     *
     * @returns Output filename.
     */
    static createMarketingPartnerArtName(contentName: string, asset: Partial<ArtAsset> | undefined): string {
        return `${contentName}_PartnerArt${this.resolveAssetOutputExtension(asset)}`;
    }

    /**
     * Builds the output filename for a marketing screenshot.
     *
     * @param contentName - Marketing asset content name.
     * @param index - Screenshot index.
     * @param asset - Resolved asset metadata.
     *
     * @returns Output filename.
     */
    static createMarketingScreenshotName(contentName: string, index: number, asset: Partial<ArtAsset> | undefined): string {
        return `${contentName}_MarketingScreenshot_${index}${this.resolveAssetOutputExtension(asset)}`;
    }

    /**
     * Normalizes a file extension for staged output filenames.
     *
     * @param extension - Detected source extension.
     * @param fallbackExtension - Extension used when none is available.
     *
     * @returns Normalized lowercase extension with a leading dot.
     */
    static normalizeOutputExtension(extension: string, fallbackExtension = ".jpg"): string {
        if (typeof extension !== "string" || extension.trim() === "") {
            return fallbackExtension;
        }

        const trimmedExtension = extension.trim().toLowerCase();

        if (trimmedExtension.startsWith(".")) {
            return trimmedExtension;
        }

        return `.${trimmedExtension}`;
    }
}
