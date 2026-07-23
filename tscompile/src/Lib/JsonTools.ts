import fs from "fs";
import { parse } from "comment-json";

/**
 * Reads and writes JSON with comment-tolerant parsing.
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

    /**
     * Loads and parses a JSON file, tolerating comments and trailing commas.
     *
     * @param filePath - Absolute JSON file path.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the file is missing or not valid JSON.
     */
    static loadFile(filePath: string): unknown {
        return this.parse(fs.readFileSync(filePath, "utf8"));
    }

    /**
     * Writes indented JSON to disk, discarding comments and adding a trailing newline.
     *
     * @param filePath - Absolute output file path.
     * @param data - JSON-compatible value to write.
     */
    static writePretty(filePath: string, data: unknown): void {
        fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
    }
}
