"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const comment_json_1 = require("comment-json");
/**
 * Reads and writes JSON with comment-tolerant parsing.
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
     * Writes minified JSON to disk, discarding comments.
     *
     * @param filePath - Absolute output file path.
     * @param data - JSON-compatible value to write.
     */
    static writeMinified(filePath, data) {
        fs_1.default.writeFileSync(filePath, JSON.stringify(data));
    }
    /**
     * Writes indented JSON to disk, discarding comments and adding a trailing newline.
     *
     * @param filePath - Absolute output file path.
     * @param data - JSON-compatible value to write.
     */
    static writePretty(filePath, data) {
        fs_1.default.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
    }
}
exports.default = JsonTools;
