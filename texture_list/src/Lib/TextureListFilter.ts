import type { ProjectConfig } from "../Types/TextureListTypes";
import fs from "fs";
import path from "path";
import JsonTools from "./JsonTools";
import TextureListWriter from "./TextureListWriter";
import TextureScanner from "./TextureScanner";
import TextureSetReader from "./TextureSetReader";

/**
 * Runs the texture list generation for the project's resource pack.
 */
export default class TextureListFilter {
    /** Resource pack folder used when `config.json` does not name one. */
    static readonly DEFAULT_RESOURCE_PACK = "RP";

    /** Output file path relative to the pack root. */
    static readonly OUTPUT_FILE = "textures/texture_list.json";

    /** Image extensions that count as textures. */
    static readonly EXTENSIONS: readonly string[] = ["png", "jpg", "jpeg", "tga"];

    /** Folder under the pack root that holds subpacks. */
    static readonly SUBPACKS_FOLDER = "subpacks";

    /** Absolute resource pack root path. */
    private readonly packRoot: string;

    /**
     * Creates a filter for the given Regolith directories.
     *
     * @param workingDirectory - Regolith working directory that holds the pack folder.
     * @param projectRoot - Regolith project root that holds `config.json`.
     */
    constructor(workingDirectory: string, projectRoot: string) {
        const config = TextureListFilter.loadProjectConfig(projectRoot);

        this.packRoot = path.resolve(workingDirectory, config.packs?.resourcePack ?? TextureListFilter.DEFAULT_RESOURCE_PACK);
    }

    /**
     * Loads the Regolith project configuration.
     *
     * @param projectRoot - Regolith project root path.
     *
     * @returns ProjectConfig, or an empty object when unavailable.
     */
    static loadProjectConfig(projectRoot: string): ProjectConfig {
        try {
            return JsonTools.loadFile(path.join(projectRoot, "config.json")) as ProjectConfig;
        } catch {
            return {};
        }
    }

    /**
     * Builds the list and writes it to the output file.
     */
    run(): void {
        TextureListWriter.write(path.resolve(this.packRoot, TextureListFilter.OUTPUT_FILE), this.collect());
    }

    /**
     * Collects the texture list for the pack and each subpack.
     *
     * @returns Sorted texture list paths.
     */
    collect(): string[] {
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
    collectPack(packRoot: string): string[] {
        const images = TextureScanner.scan(packRoot, TextureListFilter.EXTENSIONS);
        const excluded = TextureSetReader.excludedKeys(TextureSetReader.read(packRoot));

        return TextureListWriter.build(images, excluded);
    }

    /**
     * Finds every subpack folder under the pack root.
     *
     * @returns Absolute subpack root paths.
     */
    findSubpacks(): string[] {
        const subpacksPath = path.join(this.packRoot, TextureListFilter.SUBPACKS_FOLDER);

        if (!fs.existsSync(subpacksPath)) {
            return [];
        }

        return fs
            .readdirSync(subpacksPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => path.join(subpacksPath, entry.name));
    }
}
