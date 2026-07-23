"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Parses and validates the example filter's Regolith settings.
 */
class Settings {
    /** Repeat count used when the setting is omitted. */
    static DEFAULT_REPEAT = 1;
    /** Highest repeat count the filter accepts. */
    static MAX_REPEAT = 10;
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
        return {
            message: this.readRequiredString(settings, "message"),
            repeat: this.readOptionalCount(settings, "repeat", Settings.DEFAULT_REPEAT),
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
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
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
     * Reads an optional positive integer count within the allowed range.
     *
     * @param settings - Parsed settings object.
     * @param key - Setting key to read.
     * @param fallbackValue - Value returned when the key is omitted.
     *
     * @returns Validated count.
     *
     * @throws If the value is present but out of range.
     */
    static readOptionalCount(settings, key, fallbackValue) {
        if (!Object.hasOwn(settings, key)) {
            return fallbackValue;
        }
        const value = settings[key];
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > Settings.MAX_REPEAT) {
            throw new Error(`Setting "${key}" must be an integer between 1 and ${Settings.MAX_REPEAT}.`);
        }
        return value;
    }
}
exports.default = Settings;
