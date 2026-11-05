"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const JsonTools_1 = __importDefault(require("./JsonTools"));
const StyleSettings_1 = __importDefault(require("./StyleSettings"));
/**
 * Parses and validates the filter's Regolith settings.
 */
class Settings {
    /** Accepted `content_type` values. */
    static CONTENT_TYPES = ["addon", "world", "mash_up", "texture_pack"];
    /** Output folder used when the setting is omitted. */
    static DEFAULT_OUTPUT_PATH = "build/content_guide";
    /** Accepted setting names. */
    static KEYS = [
        "content_name",
        "content_type",
        "content_version",
        "creator_team_name",
        "partner_name",
        "output_path",
        "strict",
        "auto_blank_optional_notes",
        "style",
    ];
    /** Number of parts in a content version. */
    static VERSION_LENGTH = 3;
    /** Content types that are maps, which keep the vanilla game and so have an end portal to list. */
    static MAP_TYPES = ["world", "mash_up"];
    /**
     * Checks whether a content type is a map.
     *
     * @param contentType - Content type.
     *
     * @returns `true` if the content is a world or mash-up, `false` otherwise.
     */
    static isMap(contentType) {
        return Settings.MAP_TYPES.includes(contentType);
    }
    /**
     * Parses and validates the raw settings JSON.
     *
     * @param rawJson - Raw settings string passed by Regolith.
     *
     * @returns Validated settings.
     *
     * @throws If the JSON is missing, malformed, or fails validation.
     */
    static resolve(rawJson) {
        const settings = this.parse(rawJson);
        for (const key of Object.keys(settings)) {
            if (!Settings.KEYS.includes(key)) {
                throw new Error(`Unknown setting "${key}". Check the spelling.`);
            }
        }
        return {
            contentName: this.readRequiredString(settings, "content_name"),
            contentType: this.readContentType(settings),
            contentVersion: this.readVersion(settings),
            creatorTeamName: this.readOptionalString(settings, "creator_team_name"),
            partnerName: this.readOptionalString(settings, "partner_name"),
            outputPath: this.readOutputPath(settings),
            strict: this.readBoolean(settings, "strict", true),
            autoBlankOptionalNotes: this.readBoolean(settings, "auto_blank_optional_notes", false),
            style: StyleSettings_1.default.read(settings.style),
        };
    }
    /**
     * Parses the raw settings JSON into a plain object.
     *
     * @param rawJson - Raw settings string.
     *
     * @returns Parsed settings object.
     *
     * @throws If the JSON is missing or not an object.
     */
    static parse(rawJson) {
        if (typeof rawJson !== "string" || rawJson.trim() === "") {
            throw new Error("Missing filter settings JSON.");
        }
        let parsed;
        try {
            parsed = JsonTools_1.default.parse(rawJson);
        }
        catch (error) {
            throw new Error("Invalid filter settings JSON.", { cause: error });
        }
        if (!JsonTools_1.default.isObject(parsed)) {
            throw new Error("Filter settings must be a JSON object.");
        }
        return parsed;
    }
    /**
     * Reads a required non-empty string setting.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     *
     * @returns Trimmed string value.
     *
     * @throws If the value is missing or not a non-empty string.
     */
    static readRequiredString(settings, key) {
        const value = settings[key];
        if (typeof value !== "string" || value.trim() === "") {
            throw new Error(`Setting "${key}" must be a non-empty string.`);
        }
        return value.trim();
    }
    /**
     * Reads an optional non-empty string setting.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     *
     * @returns Trimmed string value, or `null` when the key is omitted.
     *
     * @throws If the value is present but not a non-empty string.
     */
    static readOptionalString(settings, key) {
        return Object.hasOwn(settings, key) ? this.readRequiredString(settings, key) : null;
    }
    /**
     * Reads the content type.
     *
     * @param settings - Parsed settings object.
     *
     * @returns Validated content type.
     *
     * @throws If the value is not an accepted content type.
     */
    static readContentType(settings) {
        const value = settings.content_type;
        if (!Settings.CONTENT_TYPES.includes(value)) {
            throw new Error(`Setting "content_type" must be one of: ${Settings.CONTENT_TYPES.join(", ")}.`);
        }
        return value;
    }
    /**
     * Reads the content version as dotted text.
     *
     * @param settings - Parsed settings object.
     *
     * @returns Version such as `1.2.0`.
     *
     * @throws If the value is not an array of three non-negative integers.
     */
    static readVersion(settings) {
        const value = settings.content_version;
        const isVersion = Array.isArray(value) &&
            value.length === Settings.VERSION_LENGTH &&
            value.every((part) => typeof part === "number" && Number.isInteger(part) && part >= 0);
        if (!isVersion) {
            throw new Error(`Setting "content_version" must be an array of ${Settings.VERSION_LENGTH} non-negative integers.`);
        }
        return value.join(".");
    }
    /**
     * Reads the output folder.
     *
     * @param settings - Parsed settings object.
     *
     * @returns Output folder relative to the project root.
     *
     * @throws If the value is present but not a non-empty string.
     */
    static readOutputPath(settings) {
        if (!Object.hasOwn(settings, "output_path")) {
            return Settings.DEFAULT_OUTPUT_PATH;
        }
        return this.readRequiredString(settings, "output_path");
    }
    /**
     * Reads an optional boolean setting.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     * @param fallback - Value when the key is omitted.
     *
     * @returns Boolean value.
     *
     * @throws If the value is present but not a boolean.
     */
    static readBoolean(settings, key, fallback) {
        const value = settings[key] ?? fallback;
        if (typeof value !== "boolean") {
            throw new Error(`Setting "${key}" must be a boolean.`);
        }
        return value;
    }
}
exports.default = Settings;
