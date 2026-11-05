import fs from "fs";
import { parse, stringify } from "comment-json";

/**
 * Reads and writes JSON that may have comments and trailing commas.
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
     * Parses JSON text and keeps its comments, so the text can be written back with them.
     *
     * @param jsonText - Raw JSON or JSONC text.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the text is not valid JSON.
     */
    static parseWithComments(jsonText: string): unknown {
        return parse(jsonText);
    }

    /**
     * Checks for a JSON object.
     *
     * @param value - Raw value.
     *
     * @returns `true` if the value is an object, `false` otherwise.
     */
    static isObject(value: unknown): value is Record<string, unknown> {
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
    static loadFileWithComments(filePath: string): unknown {
        return this.parseWithComments(fs.readFileSync(filePath, "utf8"));
    }

    /**
     * Writes a value from `loadFileWithComments` to disk with its comments.
     *
     * @param filePath - Absolute output file path.
     * @param data - JSON-compatible value to write.
     */
    static writeWithComments(filePath: string, data: unknown): void {
        fs.writeFileSync(filePath, `${stringify(data, null, 4)}\n`);
    }

    /**
     * Describes why a JSON file could not be loaded.
     *
     * @param file - File name to show.
     * @param error - Error from loading the file.
     *
     * @returns Message for the author.
     */
    static describeLoadError(file: string, error: unknown): string {
        return error instanceof RangeError ? `${file} is nested too deeply to read.` : `Invalid JSON in ${file}.`;
    }
}
