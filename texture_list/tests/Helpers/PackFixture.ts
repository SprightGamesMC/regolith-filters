import type { TextureSetLayerValues } from "../Types/TextureListTestTypes";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Temp Regolith project on disk for tests.
 */
export default class PackFixture {
    /** Absolute project root that holds `config.json`. */
    readonly projectRoot: string;

    /** Absolute working directory that holds the pack folder. */
    readonly workingDirectory: string;

    /** Absolute pack root path. */
    readonly packRoot: string;

    /**
     * Creates a fresh temp project with a `config.json` naming the pack folder.
     *
     * @param packFolder - Resource pack folder written into `config.json`.
     */
    constructor(packFolder = "RP") {
        this.projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "texture-list-test-"));
        this.workingDirectory = path.join(this.projectRoot, ".regolith", "tmp");
        this.packRoot = path.join(this.workingDirectory, packFolder);
        fs.mkdirSync(this.packRoot, { recursive: true });
        fs.writeFileSync(
            path.join(this.projectRoot, "config.json"),
            JSON.stringify({ packs: { behaviorPack: "BP", resourcePack: packFolder } })
        );
    }

    /**
     * Resolves a pack relative path to an absolute path.
     *
     * @param relativePath - Path relative to the pack root.
     *
     * @returns Absolute path.
     */
    resolve(relativePath: string): string {
        return path.join(this.packRoot, relativePath);
    }

    /**
     * Writes a file, creating parent folders as needed.
     *
     * @param relativePath - File path relative to the pack root.
     * @param contents - File contents. Empty by default.
     *
     * @returns Absolute file path.
     */
    writeFile(relativePath: string, contents = ""): string {
        const filePath = this.resolve(relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, contents);
        return filePath;
    }

    /**
     * Writes a texture set file with the given layers.
     *
     * @param relativePath - Set file path relative to the pack root.
     * @param layers - Layer values under `minecraft:texture_set`.
     *
     * @returns Absolute file path.
     */
    writeSet(relativePath: string, layers: TextureSetLayerValues): string {
        return this.writeFile(relativePath, JSON.stringify({ format_version: "1.16.100", "minecraft:texture_set": layers }));
    }

    /**
     * Reads and parses a JSON file from the pack.
     *
     * @param relativePath - File path relative to the pack root.
     *
     * @returns Parsed JSON value.
     */
    readJson(relativePath: string): unknown {
        return JSON.parse(fs.readFileSync(this.resolve(relativePath), "utf8"));
    }

    /**
     * Deletes the project and everything in it.
     */
    dispose(): void {
        fs.rmSync(this.projectRoot, { force: true, recursive: true });
    }
}
