import { parse } from "comment-json";

/**
 * Reads JSON with comment-tolerant parsing.
 */
export default abstract class JsonTools {
    /**
     * Parses JSON text, tolerating comments and trailing commas.
     *
     * @param jsonText - Raw JSON or JSONC text.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the text is not valid JSON.
     */
    static parse(jsonText: string): unknown {
        return parse(jsonText, undefined, true);
    }
}
