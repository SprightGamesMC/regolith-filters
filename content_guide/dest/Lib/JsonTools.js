"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const comment_json_1 = require("comment-json");
/**
 * Reads and writes JSON that may have comments and trailing commas.
 */
class JsonTools {
    /**
     * Parses JSON text, tolerating comments and trailing commas.
     *
     * @param jsonText - Raw JSON or JSONC text.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the text is not valid JSON.
     */
    static parse(jsonText) {
        return (0, comment_json_1.parse)(jsonText, undefined, true);
    }
    /**
     * Loads and parses a JSON file, tolerating comments and trailing commas.
     *
     * @param filePath - Absolute JSON file path.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the file is missing or not valid JSON.
     */
    static loadFile(filePath) {
        return this.parse(fs_1.default.readFileSync(filePath, "utf8"));
    }
    /**
     * Parses JSON text and keeps its comments, so the text can be written back with them.
     *
     * @param jsonText - Raw JSON or JSONC text.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the text is not valid JSON.
     */
    static parseWithComments(jsonText) {
        return (0, comment_json_1.parse)(jsonText);
    }
    /**
     * Checks for a JSON object.
     *
     * @param value - Raw value.
     *
     * @returns `true` if the value is an object, `false` otherwise.
     */
    static isObject(value) {
        return typeof value === "object" && value !== null && !Array.isArray(value);
    }
    /**
     * Loads a JSON file and keeps its comments, so the file can be written back with them.
     *
     * @param filePath - Absolute JSON file path.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the file is missing or not valid JSON.
     */
    static loadFileWithComments(filePath) {
        return this.parseWithComments(fs_1.default.readFileSync(filePath, "utf8"));
    }
    /**
     * Writes a value from `loadFileWithComments` to disk with its comments.
     *
     * @param filePath - Absolute output file path.
     * @param data - JSON-compatible value to write.
     */
    static writeWithComments(filePath, data) {
        fs_1.default.writeFileSync(filePath, `${(0, comment_json_1.stringify)(data, null, 4)}\n`);
    }
    /**
     * Describes why a JSON file could not be loaded.
     *
     * @param file - File name to show.
     * @param error - Error from loading the file.
     *
     * @returns Message for the author.
     */
    static describeLoadError(file, error) {
        return error instanceof RangeError ? `${file} is nested too deeply to read.` : `Invalid JSON in ${file}.`;
    }
}
exports.default = JsonTools;
