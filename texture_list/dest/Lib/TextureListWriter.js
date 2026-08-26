"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Builds and writes the texture list.
 */
class TextureListWriter {
    /**
     * Filters excluded images and returns their sorted list paths.
     *
     * @param images - Images found in a pack.
     * @param excluded - Lower case keys to leave out.
     *
     * @returns Sorted list paths, duplicates removed.
     */
    static build(images, excluded) {
        const kept = images.filter((image) => !excluded.has(image.key)).map((image) => image.listPath);
        return [...new Set(kept)].sort();
    }
    /**
     * Writes the list as indented JSON, creating parent folders as needed.
     *
     * @param filePath - Absolute output file path.
     * @param list - Texture list paths.
     */
    static write(filePath, list) {
        fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
        JsonTools_1.default.writePretty(filePath, list);
    }
}
exports.default = TextureListWriter;
