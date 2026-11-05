"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
/**
 * Reads the translated names in a `.lang` file.
 */
class LangFile {
    /** Text that starts a comment. */
    static COMMENT_MARKER = "##";
    /** Translated text by key. */
    values = new Map();
    /**
     * Parses `.lang` text.
     *
     * @param text - Raw file text.
     */
    constructor(text) {
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
    static load(filePath) {
        return new LangFile(fs_1.default.existsSync(filePath) ? fs_1.default.readFileSync(filePath, "utf8") : "");
    }
    /**
     * Finds the first key with a translation.
     *
     * @param keys - Keys to try in order.
     *
     * @returns Translated text, or `null` when no key has one.
     */
    find(...keys) {
        for (const key of keys) {
            const value = this.values.get(key);
            if (value) {
                return value;
            }
        }
        return null;
    }
}
exports.default = LangFile;
