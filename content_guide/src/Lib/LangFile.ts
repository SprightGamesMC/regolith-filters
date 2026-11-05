import fs from "fs";

/**
 * Reads the translated names in a `.lang` file.
 */
export default class LangFile {
    /** Text that starts a comment. */
    static readonly COMMENT_MARKER = "##";

    /** Translated text by key. */
    private readonly values = new Map<string, string>();

    /**
     * Parses `.lang` text.
     *
     * @param text - Raw file text.
     */
    constructor(text: string) {
        for (const rawLine of text.trimStart().split(/\r?\n/)) {
            const line = rawLine.split(LangFile.COMMENT_MARKER)[0];
            const separatorIndex = line.indexOf("=");

            if (separatorIndex > 0) {
                this.values.set(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
            }
        }
    }

    /**
     * Loads a `.lang` file.
     *
     * @param filePath - Absolute file path.
     *
     * @returns LangFile, empty when the file does not exist.
     */
    static load(filePath: string): LangFile {
        return new LangFile(fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "");
    }

    /**
     * Finds the first key with a translation.
     *
     * @param keys - Keys to try in order.
     *
     * @returns Translated text, or `null` when no key has one.
     */
    find(...keys: string[]): string | null {
        for (const key of keys) {
            const value = this.values.get(key);

            if (value) {
                return value;
            }
        }

        return null;
    }
}
