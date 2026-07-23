"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Updates version fields in Minecraft pack manifest.json files.
 * Handles both v1/v2 (array) and v3 (string) manifest version formats.
 */
class PackManifest {
    /**
     * Creates updated manifest data without writing it to disk.
     *
     * @param manifestPath - Absolute manifest file path.
     * @param options - Manifest update options.
     *
     * @returns Updated manifest data.
     */
    static createUpdatedManifestData(manifestPath, options) {
        const manifestData = JsonTools_1.default.loadFile(manifestPath);
        if (!manifestData || typeof manifestData !== "object" || Array.isArray(manifestData)) {
            throw new Error(`Manifest must be a JSON object: ${manifestPath}`);
        }
        const manifest = manifestData;
        const formatVersion = this.detectFormatVersion(manifest);
        this.updateVersionFields(manifest, options.contentVersion, options.minEngineVersion, formatVersion);
        this.applyAddonRequirements(manifest, options.contentType, options.packKind);
        return manifest;
    }
    /**
     * Creates a world pack reference entry from updated manifest data.
     *
     * @param manifestData - Updated manifest data.
     * @param contentVersion - Content version tuple.
     * @param manifestPath - Absolute manifest file path for error reporting.
     *
     * @returns World pack reference entry.
     *
     * @throws If `header.uuid` is missing.
     */
    static createWorldPackReference(manifestData, contentVersion, manifestPath) {
        const header = manifestData.header;
        const packId = header?.uuid;
        if (typeof packId !== "string" || packId.trim() === "") {
            throw new Error(`Missing manifest header.uuid: ${manifestPath}`);
        }
        return {
            pack_id: packId,
            version: [...contentVersion],
        };
    }
    /**
     * Determines the manifest format version from parsed manifest data.
     *
     * @param manifestData - Parsed manifest.json object.
     *
     * @returns The format version.
     *
     * @throws If `format_version` is missing or unsupported.
     */
    static detectFormatVersion(manifestData) {
        const rawFormatVersion = manifestData.format_version;
        const parsedFormatVersion = typeof rawFormatVersion === "string" && /^[123]$/.test(rawFormatVersion) ? Number(rawFormatVersion) : rawFormatVersion;
        if (parsedFormatVersion === 1 || parsedFormatVersion === 2 || parsedFormatVersion === 3) {
            return parsedFormatVersion;
        }
        throw new Error(`Unsupported manifest format_version: ${rawFormatVersion}`);
    }
    /**
     * Converts a version tuple to the correct format for the manifest version.
     *
     * @param version - Version tuple to format.
     * @param formatVersion - Manifest format version.
     *
     * @returns Manifest-compatible version value.
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
     * @param manifestNode - Current manifest node.
     * @param contentVersion - Content version tuple.
     * @param minEngineVersion - Minimum engine version tuple.
     * @param formatVersion - Manifest format version.
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
        const node = manifestNode;
        const isScript = node.type === "script" || node.module_name !== undefined;
        for (const [key, value] of Object.entries(node)) {
            if (key === "version" && !isScript) {
                node[key] = this.formatVersion(contentVersion, formatVersion);
                continue;
            }
            if ((key === "min_engine_version" || key === "base_game_version") && Array.isArray(minEngineVersion)) {
                node[key] = this.formatVersion(minEngineVersion, formatVersion);
                continue;
            }
            this.updateVersionFields(value, contentVersion, minEngineVersion, formatVersion);
        }
    }
    /**
     * Applies addon-only manifest requirements.
     *
     * @param manifestData - Parsed manifest data.
     * @param contentType - Selected content type.
     * @param packKind - Current pack kind identifier.
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
        const header = manifestData.header;
        const metadata = manifestData.metadata;
        metadata.product_type = "addon";
        if (packKind === "resource_pack") {
            header.pack_scope = "world";
            return;
        }
        delete header.pack_scope;
    }
}
exports.default = PackManifest;
