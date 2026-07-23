"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const comment_json_1 = require("comment-json");
/**
 * Reads JSON with comment-tolerant parsing.
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
}
exports.default = JsonTools;
