"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
const TextureScanner_1 = __importDefault(require("./TextureScanner"));
/**
 * Reads texture set files and collects the texture keys they reference.
 */
class TextureSetReader {
    /** File name suffix that marks a texture set. */
    static SET_SUFFIX = ".texture_set.json";
    /** Root key of a texture set document. */
    static SET_KEY = "minecraft:texture_set";
    /** Layer whose files stay in the list. */
    static COLOR_LAYER = "color";
    /** Layers whose files leave the list. */
    static NON_COLOR_LAYERS = [
        "normal",
        "heightmap",
        "metalness_emissive_roughness",
        "metalness_emissive_roughness_subsurface",
    ];
    /**
     * Collects color and non color layer keys from every texture set in a pack.
     *
     * @param packRoot - Absolute pack root path.
     *
     * @returns TextureSetLayers with keys in lower case, pack relative, no extension.
     *
     * @throws If a texture set file cannot be parsed.
     */
    static read(packRoot) {
        const layers = { colorKeys: new Set(), layerKeys: new Set() };
        for (const setPath of this.findSets(packRoot)) {
            this.readSet(packRoot, setPath, layers);
        }
        return layers;
    }
    /**
     * Returns the keys to exclude: non color layer files that are never a color layer.
     *
     * @param layers - Collected layer keys.
     *
     * @returns Set of excluded keys.
     */
    static excludedKeys(layers) {
        return new Set([...layers.layerKeys].filter((key) => !layers.colorKeys.has(key)));
    }
    /**
     * Finds every texture set file under the pack's textures folder.
     *
     * @param packRoot - Absolute pack root path.
     *
     * @returns Absolute texture set file paths.
     */
    static findSets(packRoot) {
        return TextureScanner_1.default.listFiles(packRoot).filter((filePath) => path_1.default.basename(filePath).toLowerCase().endsWith(TextureSetReader.SET_SUFFIX));
    }
    /**
     * Adds the layer keys of one texture set into the collected layers.
     *
     * @param packRoot - Absolute pack root path.
     * @param setPath - Absolute texture set file path.
     * @param layers - Collected layers to extend.
     *
     * @throws If the file is not valid JSON or has no texture set object.
     */
    static readSet(packRoot, setPath, layers) {
        let document;
        try {
            document = JsonTools_1.default.loadFile(setPath);
        }
        catch (error) {
            throw new Error(`Malformed texture set "${setPath}".`, { cause: error });
        }
        const set = this.readSetObject(document, setPath);
        this.addKey(packRoot, setPath, set[TextureSetReader.COLOR_LAYER], layers.colorKeys);
        for (const layer of TextureSetReader.NON_COLOR_LAYERS) {
            this.addKey(packRoot, setPath, set[layer], layers.layerKeys);
        }
    }
    /**
     * Extracts the `minecraft:texture_set` object from a parsed document.
     *
     * @param document - Parsed texture set JSON.
     * @param setPath - Absolute file path used in errors.
     *
     * @returns Texture set object.
     *
     * @throws If the document does not hold a texture set object.
     */
    static readSetObject(document, setPath) {
        const set = document && typeof document === "object" ? document[TextureSetReader.SET_KEY] : undefined;
        if (!set || typeof set !== "object" || Array.isArray(set)) {
            throw new Error(`Malformed texture set "${setPath}": missing "${TextureSetReader.SET_KEY}" object.`);
        }
        return set;
    }
    /**
     * Adds a layer value's key to a set when the value names a file.
     *
     * @param packRoot - Absolute pack root path.
     * @param setPath - Absolute texture set file path, for sibling resolution.
     * @param value - Raw layer value. Arrays and `#` hex strings are colors and skipped.
     * @param keys - Set that receives the key.
     */
    static addKey(packRoot, setPath, value, keys) {
        if (typeof value !== "string" || value.startsWith("#") || value.trim() === "") {
            return;
        }
        keys.add(this.resolveKey(packRoot, setPath, value));
    }
    /**
     * Resolves a layer file reference to a lower case pack relative key.
     *
     * @param packRoot - Absolute pack root path.
     * @param setPath - Absolute texture set file path.
     * @param reference - Layer value. Contains `/` when pack relative, else names a sibling file.
     *
     * @returns Lower case pack relative key without extension.
     */
    static resolveKey(packRoot, setPath, reference) {
        const normalized = reference.replace(/\\/g, "/");
        const absolute = normalized.includes("/") ? path_1.default.join(packRoot, normalized) : path_1.default.join(path_1.default.dirname(setPath), normalized);
        return TextureScanner_1.default.toKey(packRoot, absolute).toLowerCase();
    }
}
exports.default = TextureSetReader;
