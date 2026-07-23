import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

/** Generated fixture project used by integration tests. */
export interface PackagerFixtureResult {
    projectRoot: string;
    cwd: string;
    settingsJson: string;
    archiveBaseName: string;
    submissionOutputPath: string;
    gameOutputPath: string;
    cleanup: () => void;
}

/** Shared temp layout for a fixture project. */
interface FixtureBase {
    cwd: string;
    marketingArtPath: string;
    projectRoot: string;
    storeArtPath: string;
}

/**
 * Builds throwaway on-disk projects the packager can run against.
 * Generates spec-compliant art so `AssetValidator` passes without committed binaries.
 */
export default abstract class PackagerFixture {
    static readonly SCREENSHOT_COUNT = 5;

    static readonly BEHAVIOR_PACK_UUID = "11111111-1111-4111-8111-111111111111";

    static readonly RESOURCE_PACK_UUID = "22222222-2222-4222-8222-222222222222";

    static readonly WORLD_TEMPLATE_UUID = "33333333-3333-4333-8333-333333333333";

    static readonly SKIN_PACK_UUID = "44444444-4444-4444-8444-444444444444";

    /**
     * Creates a complete addon fixture in a fresh temp directory.
     *
     * @returns Fixture paths, settings JSON, and a cleanup callback.
     */
    static async createAddon(): Promise<PackagerFixtureResult> {
        const base = this.createBase();

        this.writeManifest(path.resolve(base.cwd, "BP"), this.BEHAVIOR_PACK_UUID, "data");
        this.writeManifest(path.resolve(base.cwd, "RP"), this.RESOURCE_PACK_UUID, "resources");

        const settings = {
            content_type: "addon",
            content_name: "Test Pack",
            content_acronym: "TP",
            content_version: [1, 2, 3],
            min_engine_version: [1, 20, 0],
            paths: this.createBasePaths(),
            store_art: await this.writeFullStoreArt(base.storeArtPath),
            marketing_art: await this.writeFullMarketingArt(base.marketingArtPath),
        };

        return this.createResult(base, settings, "TestPack", "mcaddon");
    }

    /**
     * Creates a complete world-template fixture in a fresh temp directory.
     *
     * @returns Fixture paths, settings JSON, and a cleanup callback.
     */
    static async createWorld(): Promise<PackagerFixtureResult> {
        const base = this.createBase();
        const worldPath = path.resolve(base.projectRoot, "WorldTemplate");

        this.writeManifest(worldPath, this.WORLD_TEMPLATE_UUID, "world_template");
        this.writeManifest(path.resolve(base.cwd, "BP"), this.BEHAVIOR_PACK_UUID, "data");
        this.writeManifest(path.resolve(base.cwd, "RP"), this.RESOURCE_PACK_UUID, "resources");
        fs.writeFileSync(path.resolve(worldPath, "world_behavior_packs.json"), JSON.stringify([{ pack_id: "stale", version: [0, 0, 0] }]));

        const settings = {
            content_type: "world",
            content_name: "Test World",
            content_acronym: "TW",
            content_version: [1, 2, 3],
            min_engine_version: [1, 20, 0],
            paths: { ...this.createBasePaths(), world_path: "WorldTemplate" },
            store_art: await this.writeFullStoreArt(base.storeArtPath),
            marketing_art: await this.writeFullMarketingArt(base.marketingArtPath),
        };

        return this.createResult(base, settings, "TestWorld", "mctemplate");
    }

    /**
     * Creates a complete texture-pack fixture in a fresh temp directory.
     *
     * @returns Fixture paths, settings JSON, and a cleanup callback.
     */
    static async createTexturePack(): Promise<PackagerFixtureResult> {
        const base = this.createBase();

        this.writeManifest(path.resolve(base.cwd, "RP"), this.RESOURCE_PACK_UUID, "resources");

        const settings = {
            content_type: "texture_pack",
            content_name: "Test Textures",
            content_acronym: "TT",
            content_version: [1, 2, 3],
            min_engine_version: [1, 20, 0],
            paths: this.createBasePaths(),
            store_art: await this.writeFullStoreArt(base.storeArtPath),
            marketing_art: await this.writeFullMarketingArt(base.marketingArtPath),
        };

        return this.createResult(base, settings, "TestTextures", "mcpack");
    }

    /**
     * Creates a complete skin-pack fixture in a fresh temp directory.
     *
     * @returns Fixture paths, settings JSON, and a cleanup callback.
     */
    static async createSkinPack(): Promise<PackagerFixtureResult> {
        const base = this.createBase();
        const skinPackPath = path.resolve(base.projectRoot, "SkinPack");

        this.writeManifest(skinPackPath, this.SKIN_PACK_UUID, "skin_pack", 1);

        const settings = {
            content_type: "skin_pack",
            content_name: "Test Skins",
            content_version: [1, 2, 3],
            paths: { ...this.createBasePaths(), skin_pack_path: "SkinPack" },
            store_art: { key_art: await this.writeJpeg(path.resolve(base.storeArtPath, "key_art.jpg"), 800, 450, 72) },
            marketing_art: {
                key_art: await this.writeJpeg(path.resolve(base.marketingArtPath, "key_art.jpg"), 1920, 1080, 300),
                partner_art: await this.writeJpeg(path.resolve(base.marketingArtPath, "partner_art.jpg"), 1920, 1080, 300),
            },
        };

        return this.createResult(base, settings, "TestSkins", "mcpack");
    }

    /**
     * Creates the shared temp directory layout.
     *
     * @returns Base fixture paths.
     */
    static createBase(): FixtureBase {
        const projectRoot = fs.mkdtempSync(path.resolve(os.tmpdir(), "packager-fixture-"));
        const cwd = path.resolve(projectRoot, "data");
        const storeArtPath = path.resolve(projectRoot, "StoreArt");
        const marketingArtPath = path.resolve(projectRoot, "MarketingArt");

        fs.mkdirSync(cwd, { recursive: true });
        fs.mkdirSync(storeArtPath, { recursive: true });
        fs.mkdirSync(marketingArtPath, { recursive: true });

        return { cwd, marketingArtPath, projectRoot, storeArtPath };
    }

    /**
     * Creates the shared `paths` settings block.
     *
     * @returns Base path settings.
     */
    static createBasePaths(): Record<string, string> {
        return {
            build_path: "build",
            store_art_path: "StoreArt",
            marketing_art_path: "MarketingArt",
        };
    }

    /**
     * Builds the fixture result record.
     *
     * @param base - Base fixture paths.
     * @param settings - Filter settings object.
     * @param archiveBaseName - Sanitized archive basename.
     * @param gameExtension - Game archive extension.
     *
     * @returns Assembled fixture result.
     */
    static createResult(
        base: FixtureBase,
        settings: Record<string, unknown>,
        archiveBaseName: string,
        gameExtension: string
    ): PackagerFixtureResult {
        const buildPath = path.resolve(base.projectRoot, "build");

        return {
            projectRoot: base.projectRoot,
            cwd: base.cwd,
            settingsJson: JSON.stringify(settings),
            archiveBaseName,
            submissionOutputPath: path.resolve(buildPath, `${archiveBaseName}.zip`),
            gameOutputPath: path.resolve(buildPath, `${archiveBaseName}.${gameExtension}`),
            cleanup: () => fs.rmSync(base.projectRoot, { force: true, recursive: true }),
        };
    }

    /**
     * Writes the full store art set required by non-skin content types.
     *
     * @param storeArtPath - Absolute store art directory.
     *
     * @returns Store art settings block.
     */
    static async writeFullStoreArt(storeArtPath: string): Promise<Record<string, unknown>> {
        return {
            key_art: await this.writeJpeg(path.resolve(storeArtPath, "key_art.jpg"), 800, 450, 72),
            screenshots: await this.writeScreenshots(storeArtPath, "store_ss", this.SCREENSHOT_COUNT, 800, 450, 72),
            panorama: await this.writeJpeg(path.resolve(storeArtPath, "panorama.jpg"), 2000, 450, 72),
            pack_icon: await this.writeJpeg(path.resolve(storeArtPath, "pack_icon.jpg"), 256, 256, 72),
        };
    }

    /**
     * Writes the full marketing art set required by non-skin content types.
     *
     * @param marketingArtPath - Absolute marketing art directory.
     *
     * @returns Marketing art settings block.
     */
    static async writeFullMarketingArt(marketingArtPath: string): Promise<Record<string, unknown>> {
        return {
            key_art: await this.writeJpeg(path.resolve(marketingArtPath, "key_art.jpg"), 1920, 1080, 300),
            screenshots: await this.writeScreenshots(marketingArtPath, "mkt_ss", this.SCREENSHOT_COUNT, 1920, 1080, 300),
            partner_art: await this.writeJpeg(path.resolve(marketingArtPath, "partner_art.jpg"), 1920, 1080, 300),
        };
    }

    /**
     * Writes a minimal pack directory with a valid `manifest.json`.
     *
     * @param packPath - Absolute pack directory path.
     * @param uuid - Header UUID.
     * @param moduleType - Manifest module type.
     * @param formatVersion - Manifest format version.
     */
    static writeManifest(packPath: string, uuid: string, moduleType: string, formatVersion: number = 2): void {
        fs.mkdirSync(packPath, { recursive: true });

        const manifest = {
            format_version: formatVersion,
            header: {
                name: "Fixture Pack",
                uuid,
                version: [0, 0, 1],
                min_engine_version: [1, 0, 0],
            },
            modules: [
                {
                    type: moduleType,
                    uuid: `${uuid}-mod`,
                    version: [0, 0, 1],
                },
            ],
        };

        fs.writeFileSync(path.resolve(packPath, "manifest.json"), JSON.stringify(manifest, null, 2));
    }

    /**
     * Writes an indexed run of screenshot files.
     *
     * @param directoryPath - Absolute output directory.
     * @param prefix - Filename prefix.
     * @param count - Number of screenshots.
     * @param width - Image width.
     * @param height - Image height.
     * @param dpi - Image density in DPI.
     *
     * @returns Written screenshot filenames.
     */
    static async writeScreenshots(
        directoryPath: string,
        prefix: string,
        count: number,
        width: number,
        height: number,
        dpi: number
    ): Promise<string[]> {
        const fileNames: string[] = [];

        for (let index = 0; index < count; index += 1) {
            fileNames.push(await this.writeJpeg(path.resolve(directoryPath, `${prefix}_${index}.jpg`), width, height, dpi));
        }

        return fileNames;
    }

    /**
     * Writes a solid-color JPEG with the given dimensions and density.
     *
     * @param filePath - Absolute output file path.
     * @param width - Image width.
     * @param height - Image height.
     * @param dpi - Image density in DPI.
     *
     * @returns Written file basename.
     */
    static async writeJpeg(filePath: string, width: number, height: number, dpi: number): Promise<string> {
        await sharp({
            create: {
                width,
                height,
                channels: 3,
                background: { r: 90, g: 120, b: 150 },
            },
        })
            .withMetadata({ density: dpi })
            .jpeg()
            .toFile(filePath);

        return path.basename(filePath);
    }
}
