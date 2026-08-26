import type { TextureSetLayers } from "../Types/TextureListTypes";
import path from "path";
import JsonTools from "./JsonTools";
import TextureScanner from "./TextureScanner";

/**
 * Reads texture set files and collects the texture keys they reference.
 */
export default abstract class TextureSetReader {
    /** File name suffix that marks a texture set. */
    static readonly SET_SUFFIX = ".texture_set.json";

    /** Root key of a texture set document. */
    static readonly SET_KEY = "minecraft:texture_set";

    /** Layer whose files stay in the list. */
    static readonly COLOR_LAYER = "color";

    /** Layers whose files leave the list. */
    static readonly NON_COLOR_LAYERS: readonly string[] = [
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
    static read(packRoot: string): TextureSetLayers {
        const layers: TextureSetLayers = { colorKeys: new Set(), layerKeys: new Set() };

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
    static excludedKeys(layers: TextureSetLayers): Set<string> {
        return new Set([...layers.layerKeys].filter((key) => !layers.colorKeys.has(key)));
    }

    /**
     * Finds every texture set file under the pack's textures folder.
     *
     * @param packRoot - Absolute pack root path.
     *
     * @returns Absolute texture set file paths.
     */
    static findSets(packRoot: string): string[] {
        return TextureScanner.listFiles(packRoot).filter((filePath) =>
            path.basename(filePath).toLowerCase().endsWith(TextureSetReader.SET_SUFFIX)
        );
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
    static readSet(packRoot: string, setPath: string, layers: TextureSetLayers): void {
        let document: unknown;

        try {
            document = JsonTools.loadFile(setPath);
        } catch (error) {
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
    static readSetObject(document: unknown, setPath: string): Record<string, unknown> {
        const set = document && typeof document === "object" ? (document as Record<string, unknown>)[TextureSetReader.SET_KEY] : undefined;

        if (!set || typeof set !== "object" || Array.isArray(set)) {
            throw new Error(`Malformed texture set "${setPath}": missing "${TextureSetReader.SET_KEY}" object.`);
        }

        return set as Record<string, unknown>;
    }

    /**
     * Adds a layer value's key to a set when the value names a file.
     *
     * @param packRoot - Absolute pack root path.
     * @param setPath - Absolute texture set file path, for sibling resolution.
     * @param value - Raw layer value. Arrays and `#` hex strings are colors and skipped.
     * @param keys - Set that receives the key.
     */
    static addKey(packRoot: string, setPath: string, value: unknown, keys: Set<string>): void {
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
    static resolveKey(packRoot: string, setPath: string, reference: string): string {
        const normalized = reference.replace(/\\/g, "/");
        const absolute = normalized.includes("/") ? path.join(packRoot, normalized) : path.join(path.dirname(setPath), normalized);

        return TextureScanner.toKey(packRoot, absolute).toLowerCase();
    }
}
