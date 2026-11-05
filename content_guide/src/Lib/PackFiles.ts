import type { PackFile } from "../Types/ContentGuideTypes";
import fs from "fs";
import path from "path";
import JsonTools from "./JsonTools";

/**
 * Finds and reads the JSON files of a built pack.
 */
export default abstract class PackFiles {
    /**
     * Reads every JSON file under a pack folder.
     *
     * @param packRoot - Absolute pack root path.
     * @param folder - Folder relative to the pack root.
     * @param onInvalid - Called with the path of each file that is not a JSON object.
     *
     * @returns Files sorted by path, empty when the folder does not exist.
     *
     * @throws If a file is not valid JSON.
     */
    static readFolder(packRoot: string, folder: string, onInvalid?: (relativePath: string) => void): PackFile[] {
        return this.findJsonFiles(path.join(packRoot, folder))
            .sort()
            .flatMap((filePath) => {
                const data = this.readFile(filePath);
                const relativePath = path.relative(packRoot, filePath).replaceAll("\\", "/");

                if (!data) {
                    onInvalid?.(relativePath);
                    return [];
                }

                return [{ relativePath, data }];
            });
    }

    /**
     * Reads one JSON object file.
     *
     * @param filePath - Absolute file path.
     *
     * @returns Parsed object, or `null` when the file does not exist or is not an object.
     *
     * @throws If the file is not valid JSON.
     */
    static readFile(filePath: string): Record<string, unknown> | null {
        if (!fs.existsSync(filePath)) {
            return null;
        }

        let data: unknown;

        try {
            data = JsonTools.loadFile(filePath);
        } catch (error) {
            throw new Error(JsonTools.describeLoadError(filePath, error), { cause: error });
        }

        return JsonTools.isObject(data) ? data : null;
    }

    /**
     * Finds every JSON file under a folder.
     *
     * @param folderPath - Absolute folder path.
     *
     * @returns Absolute file paths.
     */
    private static findJsonFiles(folderPath: string): string[] {
        if (!fs.existsSync(folderPath)) {
            return [];
        }

        return fs.readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
            const entryPath = path.join(folderPath, entry.name);

            if (entry.isDirectory()) {
                return this.findJsonFiles(entryPath);
            }

            return entry.name.endsWith(".json") ? [entryPath] : [];
        });
    }
}
