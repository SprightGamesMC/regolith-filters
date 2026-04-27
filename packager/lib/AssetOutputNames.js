const path = require("path");

/**
 * Resolves staged and archived output filenames for art assets.
 */
class AssetOutputNames {
  /**
   * Resolves the staged output extension for an asset.
   *
   * @param {{ fileName?: string; sourcePath?: string } | undefined} asset - Resolved asset metadata.
   * @param {string} fallbackExtension - Extension used when none is available.
   *
   * @returns {string} Normalized output extension.
   */
  static resolveAssetOutputExtension(asset, fallbackExtension = ".jpg") {
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
   * @param {string} contentName - Store asset content name.
   *
   * @returns {string} Output filename.
   */
  static createStoreKeyArtName(contentName) {
    return `${contentName}_Thumbnail_0.jpg`;
  }

  /**
   * Builds the output filename for store panorama art.
   *
   * @param {string} contentName - Store asset content name.
   *
   * @returns {string} Output filename.
   */
  static createStorePanoramaName(contentName) {
    return `${contentName}_panorama_0.jpg`;
  }

  /**
   * Builds the output filename for store pack-icon art.
   *
   * @param {string} contentName - Store asset content name.
   *
   * @returns {string} Output filename.
   */
  static createStorePackIconName(contentName) {
    return `${contentName}_packicon_0.jpg`;
  }

  /**
   * Builds the output filename for a store screenshot.
   *
   * @param {string} contentName - Store asset content name.
   * @param {number} index - Screenshot index.
   *
   * @returns {string} Output filename.
   */
  static createStoreScreenshotName(contentName, index) {
    return `${contentName}_screenshot_${index}.jpg`;
  }

  /**
   * Builds the output filename for marketing key art.
   *
   * @param {string} contentName - Marketing asset content name.
   * @param {{ fileName?: string; sourcePath?: string } | undefined} asset - Resolved asset metadata.
   *
   * @returns {string} Output filename.
   */
  static createMarketingKeyArtName(contentName, asset) {
    return `${contentName}_MarketingKeyArt${this.resolveAssetOutputExtension(asset)}`;
  }

  /**
   * Builds the output filename for marketing partner art.
   *
   * @param {string} contentName - Marketing asset content name.
   * @param {{ fileName?: string; sourcePath?: string } | undefined} asset - Resolved asset metadata.
   *
   * @returns {string} Output filename.
   */
  static createMarketingPartnerArtName(contentName, asset) {
    return `${contentName}_PartnerArt${this.resolveAssetOutputExtension(asset)}`;
  }

  /**
   * Builds the output filename for a marketing screenshot.
   *
   * @param {string} contentName - Marketing asset content name.
   * @param {number} index - Screenshot index.
   * @param {{ fileName?: string; sourcePath?: string } | undefined} asset - Resolved asset metadata.
   *
   * @returns {string} Output filename.
   */
  static createMarketingScreenshotName(contentName, index, asset) {
    return `${contentName}_MarketingScreenshot_${index}${this.resolveAssetOutputExtension(asset)}`;
  }

  /**
   * Normalizes a file extension for staged output filenames.
   *
   * @param {string} extension - Detected source extension.
   * @param {string} fallbackExtension - Extension used when none is available.
   *
   * @returns {string} Normalized lowercase extension with a leading dot.
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

module.exports = AssetOutputNames;
