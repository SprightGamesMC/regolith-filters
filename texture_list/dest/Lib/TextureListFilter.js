"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
const TextureListWriter_1 = __importDefault(require("./TextureListWriter"));
const TextureScanner_1 = __importDefault(require("./TextureScanner"));
const TextureSetReader_1 = __importDefault(require("./TextureSetReader"));
/**
 * Runs the texture list generation for the project's resource pack.
 */
class TextureListFilter {
    /** Resource pack folder used when `config.json` does not name one. */
    static DEFAULT_RESOURCE_PACK = "RP";
    /** Output file path relative to the pack root. */
    static OUTPUT_FILE = "textures/texture_list.json";
    /** Image extensions that count as textures. */
    static EXTENSIONS = ["png", "jpg", "jpeg", "tga"];
    /** Folder under the pack root that holds subpacks. */
    static SUBPACKS_FOLDER = "subpacks";
    /** Absolute resource pack root path. */
    packRoot;
    /**
     * Creates a filter for the given Regolith directories.
     *
     * @param workingDirectory - Regolith working directory that holds the pack folder.
     * @param projectRoot - Regolith project root that holds `config.json`.
     */
    constructor(workingDirectory, projectRoot) {
        const config = TextureListFilter.loadProjectConfig(projectRoot);
        this.packRoot = path_1.default.resolve(workingDirectory, config.packs?.resourcePack ?? TextureListFilter.DEFAULT_RESOURCE_PACK);
    }
    /**
     * Loads the Regolith project configuration.
     *
     * @param projectRoot - Regolith project root path.
     *
     * @returns ProjectConfig, or an empty object when unavailable.
     */
    static loadProjectConfig(projectRoot) {
        try {
            return JsonTools_1.default.loadFile(path_1.default.join(projectRoot, "config.json"));
        }
        catch {
            return {};
        }
    }
    /**
     * Builds the list and writes it to the output file.
     */
    run() {
        TextureListWriter_1.default.write(path_1.default.resolve(this.packRoot, TextureListFilter.OUTPUT_FILE), this.collect());
    }
    /**
     * Collects the texture list for the pack and each subpack.
     *
     * @returns Sorted texture list paths.
     */
    collect() {
        const roots = [this.packRoot, ...this.findSubpacks()];
        const list = roots.flatMap((root) => this.collectPack(root));
        return [...new Set(list)].sort();
    }
    /**
     * Collects the texture list for one pack root.
     *
     * @param packRoot - Absolute pack or subpack root path.
     *
     * @returns Texture list paths relative to that root.
     */
    collectPack(packRoot) {
        const images = TextureScanner_1.default.scan(packRoot, TextureListFilter.EXTENSIONS);
        const excluded = TextureSetReader_1.default.excludedKeys(TextureSetReader_1.default.read(packRoot));
        return TextureListWriter_1.default.build(images, excluded);
    }
    /**
     * Finds every subpack folder under the pack root.
     *
     * @returns Absolute subpack root paths.
     */
    findSubpacks() {
        const subpacksPath = path_1.default.join(this.packRoot, TextureListFilter.SUBPACKS_FOLDER);
        if (!fs_1.default.existsSync(subpacksPath)) {
            return [];
        }
        return fs_1.default
            .readdirSync(subpacksPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => path_1.default.join(subpacksPath, entry.name));
    }
}
exports.default = TextureListFilter;
