import type { TextureImage } from "../Types/TextureListTypes";
import fs from "fs";
import path from "path";

/**
 * Finds image files under a pack's textures folder.
 */
export default abstract class TextureScanner {
    /** Folder under the pack root that holds textures. */
    static readonly TEXTURES_FOLDER = "textures";

    /**
     * Collects every image with an allowed extension under `textures`.
     *
     * @param packRoot - Absolute pack root path.
     * @param extensions - Lower case extensions without a leading dot.
     *
     * @returns Images found. Empty when the textures folder is missing.
     */
    static scan(packRoot: string, extensions: readonly string[]): TextureImage[] {
        const allowed = new Set(extensions.map((extension) => `.${extension.toLowerCase()}`));

        return this.listFiles(packRoot)
            .filter((filePath) => allowed.has(path.extname(filePath).toLowerCase()))
            .map((filePath) => this.toImage(packRoot, filePath));
    }

    /**
     * Lists every file under the pack's textures folder.
     *
     * @param packRoot - Absolute pack root path.
     *
     * @returns Absolute file paths. Empty when the textures folder is missing.
     */
    static listFiles(packRoot: string): string[] {
        const texturesPath = path.join(packRoot, TextureScanner.TEXTURES_FOLDER);

        if (!fs.existsSync(texturesPath)) {
            return [];
        }

        return fs
            .readdirSync(texturesPath, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => path.join(entry.parentPath, entry.name));
    }

    /**
     * Builds the comparison key and output path for one image file.
     *
     * @param packRoot - Absolute pack root path.
     * @param filePath - Absolute image file path.
     *
     * @returns TextureImage for the file.
     */
    static toImage(packRoot: string, filePath: string): TextureImage {
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
    static toKey(packRoot: string, filePath: string): string {
        const relative = path.relative(packRoot, filePath).split(path.sep).join("/");
        const extension = path.extname(relative);

        return extension === "" ? relative : relative.slice(0, -extension.length);
    }
}
