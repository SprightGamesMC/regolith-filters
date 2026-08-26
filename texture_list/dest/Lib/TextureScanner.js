"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Finds image files under a pack's textures folder.
 */
class TextureScanner {
    /** Folder under the pack root that holds textures. */
    static TEXTURES_FOLDER = "textures";
    /**
     * Collects every image with an allowed extension under `textures`.
     *
     * @param packRoot - Absolute pack root path.
     * @param extensions - Lower case extensions without a leading dot.
     *
     * @returns Images found. Empty when the textures folder is missing.
     */
    static scan(packRoot, extensions) {
        const allowed = new Set(extensions.map((extension) => `.${extension.toLowerCase()}`));
        return this.listFiles(packRoot)
            .filter((filePath) => allowed.has(path_1.default.extname(filePath).toLowerCase()))
            .map((filePath) => this.toImage(packRoot, filePath));
    }
    /**
     * Lists every file under the pack's textures folder.
     *
     * @param packRoot - Absolute pack root path.
     *
     * @returns Absolute file paths. Empty when the textures folder is missing.
     */
    static listFiles(packRoot) {
        const texturesPath = path_1.default.join(packRoot, TextureScanner.TEXTURES_FOLDER);
        if (!fs_1.default.existsSync(texturesPath)) {
            return [];
        }
        return fs_1.default
            .readdirSync(texturesPath, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => path_1.default.join(entry.parentPath, entry.name));
    }
    /**
     * Builds the comparison key and output path for one image file.
     *
     * @param packRoot - Absolute pack root path.
     * @param filePath - Absolute image file path.
     *
     * @returns TextureImage for the file.
     */
    static toImage(packRoot, filePath) {
        const listPath = this.toKey(packRoot, filePath);
        return { key: listPath.toLowerCase(), listPath };
    }
    /**
     * Converts an absolute file path into a pack relative path without extension.
     *
     * @param packRoot - Absolute pack root path.
     * @param filePath - Absolute file path.
     *
     * @returns Forward slash path relative to the pack root, extension removed, case kept.
     */
    static toKey(packRoot, filePath) {
        const relative = path_1.default.relative(packRoot, filePath).split(path_1.default.sep).join("/");
        const extension = path_1.default.extname(relative);
        return extension === "" ? relative : relative.slice(0, -extension.length);
    }
}
exports.default = TextureScanner;
