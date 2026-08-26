import type { TextureImage } from "../Types/TextureListTypes";
import fs from "fs";
import path from "path";
import JsonTools from "./JsonTools";

/**
 * Builds and writes the texture list.
 */
export default abstract class TextureListWriter {
    /**
     * Filters excluded images and returns their sorted list paths.
     *
     * @param images - Images found in a pack.
     * @param excluded - Lower case keys to leave out.
     *
     * @returns Sorted list paths, duplicates removed.
     */
    static build(images: readonly TextureImage[], excluded: ReadonlySet<string>): string[] {
        const kept = images.filter((image) => !excluded.has(image.key)).map((image) => image.listPath);

        return [...new Set(kept)].sort();
    }

    /**
     * Writes the list as indented JSON, creating parent folders as needed.
     *
     * @param filePath - Absolute output file path.
     * @param list - Texture list paths.
     */
    static write(filePath: string, list: readonly string[]): void {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        JsonTools.writePretty(filePath, list);
    }
}
