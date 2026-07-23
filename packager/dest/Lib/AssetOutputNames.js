"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
/**
 * Resolves staged and archived output filenames for art assets.
 */
class AssetOutputNames {
    /**
     * Resolves the staged output extension for an asset.
     *
     * @param asset - Resolved asset metadata.
     * @param fallbackExtension - Extension used when none is available.
     *
     * @returns Normalized output extension.
     */
    static resolveAssetOutputExtension(asset, fallbackExtension = ".jpg") {
        const candidatePath = asset && typeof asset.fileName === "string" && asset.fileName.trim() !== ""
            ? asset.fileName
            : asset && typeof asset.sourcePath === "string"
                ? asset.sourcePath
                : "";
        return this.normalizeOutputExtension(path_1.default.extname(candidatePath), fallbackExtension);
    }
    /**
     * Builds the output filename for store key art.
     *
     * @param contentName - Store asset content name.
     *
     * @returns Output filename.
     */
    static createStoreKeyArtName(contentName) {
        return `${contentName}_Thumbnail_0.jpg`;
    }
    /**
     * Builds the output filename for store panorama art.
     *
     * @param contentName - Store asset content name.
     *
     * @returns Output filename.
     */
    static createStorePanoramaName(contentName) {
        return `${contentName}_panorama_0.jpg`;
    }
    /**
     * Builds the output filename for store pack-icon art.
     *
     * @param contentName - Store asset content name.
     *
     * @returns Output filename.
     */
    static createStorePackIconName(contentName) {
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
    static createStoreScreenshotName(contentName, index) {
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
    static createMarketingKeyArtName(contentName, asset) {
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
    static createMarketingPartnerArtName(contentName, asset) {
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
    static createMarketingScreenshotName(contentName, index, asset) {
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
    static normalizeOutputExtension(extension, fallbackExtension = ".jpg") {
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
exports.default = AssetOutputNames;
