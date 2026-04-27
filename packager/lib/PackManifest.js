const JsonTools = require("./JsonTools.js");

/**
 * Updates version fields in Minecraft pack manifest.json files.
 * Handles both v1/v2 (array) and v3 (string) manifest version formats.
 */
class PackManifest {
  /**
   * Updates a pack manifest in place.
   *
   * @param {string} manifestPath - Absolute manifest file path.
   * @param {{ contentType: string; contentVersion: [number, number, number]; minEngineVersion: [number, number, number] | null; packKind: string }} options - Manifest update options.
   */
  static updateManifest(manifestPath, options) {
    JsonTools.writeMinified(manifestPath, this.createUpdatedManifestData(manifestPath, options));
  }

  /**
   * Creates updated manifest data without writing it to disk.
   *
   * @param {string} manifestPath - Absolute manifest file path.
   * @param {{ contentType: string; contentVersion: [number, number, number]; minEngineVersion: [number, number, number] | null; packKind: string }} options - Manifest update options.
   *
   * @returns {Record<string, any>} Updated manifest data.
   */
  static createUpdatedManifestData(manifestPath, options) {
    const manifestData = JsonTools.loadFile(manifestPath);
    const formatVersion = this.detectFormatVersion(manifestData);

    this.updateVersionFields(manifestData, options.contentVersion, options.minEngineVersion, formatVersion);
    this.applyAddonRequirements(manifestData, options.contentType, options.packKind);

    return manifestData;
  }

  /**
   * Creates minified manifest JSON content without writing it to disk.
   *
   * @param {string} manifestPath - Absolute manifest file path.
   * @param {{ contentType: string; contentVersion: [number, number, number]; minEngineVersion: [number, number, number] | null; packKind: string }} options - Manifest update options.
   *
   * @returns {string} Minified manifest JSON content.
   */
  static createUpdatedManifestContent(manifestPath, options) {
    return JSON.stringify(this.createUpdatedManifestData(manifestPath, options));
  }

  /**
   * Creates a world pack reference entry from updated manifest data.
   *
   * @param {Record<string, any>} manifestData - Updated manifest data.
   * @param {[number, number, number]} contentVersion - Content version tuple.
   * @param {string} manifestPath - Absolute manifest file path for error reporting.
   *
   * @returns {{ pack_id: string; version: [number, number, number] }} World pack reference entry.
   *
   * @throws {Error} If `header.uuid` is missing.
   */
  static createWorldPackReference(manifestData, contentVersion, manifestPath) {
    const packId = manifestData?.header?.uuid;

    if (typeof packId !== "string" || packId.trim() === "") {
      throw new Error(`Missing manifest header.uuid: ${manifestPath}`);
    }

    return {
      pack_id: packId,
      version: [...contentVersion]
    };
  }

  /**
   * Determines the manifest format version from parsed manifest data.
   *
   * @param {Record<string, any>} manifestData - Parsed manifest.json object.
   *
   * @returns {number} The format version.
   *
   * @throws {Error} If `format_version` is missing or unsupported.
   */
  static detectFormatVersion(manifestData) {
    const rawFormatVersion = manifestData.format_version;
    const parsedFormatVersion =
      typeof rawFormatVersion === "string" && /^[123]$/.test(rawFormatVersion)
        ? Number(rawFormatVersion)
        : rawFormatVersion;

    if (parsedFormatVersion === 1 || parsedFormatVersion === 2 || parsedFormatVersion === 3) {
      return parsedFormatVersion;
    }

    throw new Error(`Unsupported manifest format_version: ${rawFormatVersion}`);
  }

  /**
   * Converts a version tuple to the correct format for the manifest version.
   *
   * @param {[number, number, number]} version - Version tuple to format.
   * @param {number} formatVersion - Manifest format version.
   *
   * @returns {number[] | string} Manifest-compatible version value.
   */
  static formatVersion(version, formatVersion) {
    if (formatVersion === 3) {
      return version.join(".");
    }

    return [...version];
  }

  /**
   * Recursively updates manifest version fields.
   *
   * @param {unknown} manifestNode - Current manifest node.
   * @param {[number, number, number]} contentVersion - Content version tuple.
   * @param {[number, number, number] | null} minEngineVersion - Minimum engine version tuple.
   * @param {number} formatVersion - Manifest format version.
   */
  static updateVersionFields(manifestNode, contentVersion, minEngineVersion, formatVersion) {
    if (Array.isArray(manifestNode)) {
      for (const entry of manifestNode) {
        this.updateVersionFields(entry, contentVersion, minEngineVersion, formatVersion);
      }

      return;
    }

    if (!manifestNode || typeof manifestNode !== "object") {
      return;
    }

    const isScript = manifestNode.type === "script" || manifestNode.module_name !== undefined;

    for (const [key, value] of Object.entries(manifestNode)) {
      if (key === "version" && !isScript) {
        manifestNode[key] = this.formatVersion(contentVersion, formatVersion);
        continue;
      }

      if ((key === "min_engine_version" || key === "base_game_version") && Array.isArray(minEngineVersion)) {
        manifestNode[key] = this.formatVersion(minEngineVersion, formatVersion);
        continue;
      }

      this.updateVersionFields(value, contentVersion, minEngineVersion, formatVersion);
    }
  }

  /**
   * Applies addon-only manifest requirements.
   *
   * @param {Record<string, any>} manifestData - Parsed manifest data.
   * @param {string} contentType - Selected content type.
   * @param {string} packKind - Current pack kind identifier.
   */
  static applyAddonRequirements(manifestData, contentType, packKind) {
    if (contentType !== "addon") {
      return;
    }

    if (!manifestData.header || typeof manifestData.header !== "object" || Array.isArray(manifestData.header)) {
      manifestData.header = {};
    }

    if (!manifestData.metadata || typeof manifestData.metadata !== "object" || Array.isArray(manifestData.metadata)) {
      manifestData.metadata = {};
    }

    manifestData.metadata.product_type = "addon";

    if (packKind === "resource_pack") {
      manifestData.header.pack_scope = "world";
      return;
    }

    delete manifestData.header.pack_scope;
  }
}

module.exports = PackManifest;
