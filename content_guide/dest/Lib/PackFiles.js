"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Finds and reads the JSON files of a built pack.
 */
class PackFiles {
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
    static readFolder(packRoot, folder, onInvalid) {
        return this.findJsonFiles(path_1.default.join(packRoot, folder))
            .sort()
            .flatMap((filePath) => {
            const data = this.readFile(filePath);
            const relativePath = path_1.default.relative(packRoot, filePath).replaceAll("\\", "/");
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
    static readFile(filePath) {
        if (!fs_1.default.existsSync(filePath)) {
            return null;
        }
        let data;
        try {
            data = JsonTools_1.default.loadFile(filePath);
        }
        catch (error) {
            throw new Error(JsonTools_1.default.describeLoadError(filePath, error), { cause: error });
        }
        return JsonTools_1.default.isObject(data) ? data : null;
    }
    /**
     * Finds every JSON file under a folder.
     *
     * @param folderPath - Absolute folder path.
     *
     * @returns Absolute file paths.
     */
    static findJsonFiles(folderPath) {
        if (!fs_1.default.existsSync(folderPath)) {
            return [];
        }
        return fs_1.default.readdirSync(folderPath, { withFileTypes: true }).flatMap((entry) => {
            const entryPath = path_1.default.join(folderPath, entry.name);
            if (entry.isDirectory()) {
                return this.findJsonFiles(entryPath);
            }
            return entry.name.endsWith(".json") ? [entryPath] : [];
        });
    }
}
exports.default = PackFiles;
