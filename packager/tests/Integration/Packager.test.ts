import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import type { PackagerFixtureResult } from "../Helpers/PackagerFixture";
import Packager from "../../src/Lib/Packager";
import PackagerFixture from "../Helpers/PackagerFixture";
import ZipReader from "../Helpers/ZipReader";

describe("Packager.run", () => {
    let fixture: PackagerFixtureResult | null = null;

    afterEach(() => {
        fixture?.cleanup();
        fixture = null;
    });

    /**
     * Runs the packager against the active fixture.
     *
     * @returns Generated output file paths.
     */
    async function runPackager(): Promise<{ gameFilePath: string; submissionFilePath: string }> {
        const activeFixture = fixture as PackagerFixtureResult;
        return new Packager(activeFixture.cwd, activeFixture.projectRoot).run(activeFixture.settingsJson);
    }

    test("produces addon submission and game archives at the expected paths", async () => {
        fixture = await PackagerFixture.createAddon();

        const result = await runPackager();

        assert.equal(result.submissionFilePath, fixture.submissionOutputPath);
        assert.equal(result.gameFilePath, fixture.gameOutputPath);
        assert.ok(fs.existsSync(result.submissionFilePath), "submission zip should exist");
        assert.ok(fs.existsSync(result.gameFilePath), "game file should exist");
        assert.ok(fs.statSync(result.submissionFilePath).size > 0, "submission zip should be non-empty");
    });

    test("lays out addon archives and rewrites manifests", async () => {
        fixture = await PackagerFixture.createAddon();

        await runPackager();

        const gameEntryNames = ZipReader.listEntryNames(fixture.gameOutputPath);
        assert.ok(gameEntryNames.includes("BP/manifest.json"));
        assert.ok(gameEntryNames.includes("RP/manifest.json"));

        const behaviorManifest = JSON.parse(ZipReader.readEntryText(fixture.gameOutputPath, "BP/manifest.json"));
        assert.deepEqual(behaviorManifest.header.version, [1, 2, 3]);
        assert.deepEqual(behaviorManifest.header.min_engine_version, [1, 20, 0]);
        assert.equal(behaviorManifest.metadata.product_type, "addon");
        assert.equal(behaviorManifest.header.pack_scope, undefined);

        const resourceManifest = JSON.parse(ZipReader.readEntryText(fixture.gameOutputPath, "RP/manifest.json"));
        assert.equal(resourceManifest.header.pack_scope, "world");

        const submissionEntryNames = ZipReader.listEntryNames(fixture.submissionOutputPath);
        assert.ok(submissionEntryNames.includes("Content/behavior_packs/BP_TP/manifest.json"));
        assert.ok(submissionEntryNames.includes("Content/resource_packs/RP_TP/manifest.json"));
        assert.ok(submissionEntryNames.includes("Store Art/testpack_Thumbnail_0.jpg"));
        assert.ok(submissionEntryNames.includes("Store Art/testpack_screenshot_0.jpg"));
        assert.ok(submissionEntryNames.includes("Store Art/testpack_panorama_0.jpg"));
        assert.ok(submissionEntryNames.includes("Store Art/testpack_packicon_0.jpg"));
        assert.ok(submissionEntryNames.includes("Marketing Art/TestPack_MarketingKeyArt.jpg"));
        assert.ok(submissionEntryNames.includes("Marketing Art/TestPack_MarketingScreenshot_0.jpg"));
        assert.ok(submissionEntryNames.includes("Marketing Art/TestPack_PartnerArt.jpg"));
    });

    test("lays out world archives with generated pack references", async () => {
        fixture = await PackagerFixture.createWorld();

        await runPackager();

        const gameEntryNames = ZipReader.listEntryNames(fixture.gameOutputPath);
        assert.ok(gameEntryNames.includes("manifest.json"));
        assert.ok(gameEntryNames.includes("behavior_packs/BP_TW/manifest.json"));
        assert.ok(gameEntryNames.includes("resource_packs/RP_TW/manifest.json"));
        assert.ok(gameEntryNames.includes("world_behavior_packs.json"));
        assert.ok(gameEntryNames.includes("world_resource_packs.json"));

        const behaviorReferences = JSON.parse(ZipReader.readEntryText(fixture.gameOutputPath, "world_behavior_packs.json"));
        assert.deepEqual(behaviorReferences, [{ pack_id: PackagerFixture.BEHAVIOR_PACK_UUID, version: [1, 2, 3] }]);

        const submissionEntryNames = ZipReader.listEntryNames(fixture.submissionOutputPath);
        assert.ok(submissionEntryNames.includes("Content/world_template/manifest.json"));
        assert.ok(submissionEntryNames.includes("Content/world_template/behavior_packs/BP_TW/manifest.json"));
        assert.ok(submissionEntryNames.includes("Content/world_template/resource_packs/RP_TW/manifest.json"));
        assert.ok(submissionEntryNames.includes("Content/world_template/world_behavior_packs.json"));
    });

    test("replaces stale world pack-reference files instead of copying them", async () => {
        fixture = await PackagerFixture.createWorld();

        await runPackager();

        const behaviorReferences = JSON.parse(ZipReader.readEntryText(fixture.gameOutputPath, "world_behavior_packs.json"));
        assert.notEqual(behaviorReferences[0].pack_id, "stale");
    });

    test("lays out texture-pack archives from the resource pack", async () => {
        fixture = await PackagerFixture.createTexturePack();

        await runPackager();

        assert.ok(ZipReader.listEntryNames(fixture.gameOutputPath).includes("manifest.json"));
        assert.ok(ZipReader.listEntryNames(fixture.submissionOutputPath).includes("Content/resource_packs/RP_TT/manifest.json"));
    });

    test("lays out skin-pack archives without an acronym or engine version", async () => {
        fixture = await PackagerFixture.createSkinPack();

        await runPackager();

        assert.ok(ZipReader.listEntryNames(fixture.gameOutputPath).includes("manifest.json"));

        const submissionEntryNames = ZipReader.listEntryNames(fixture.submissionOutputPath);
        assert.ok(submissionEntryNames.includes("Content/skin_pack/manifest.json"));
        assert.ok(submissionEntryNames.includes("Store Art/testskins_Thumbnail_0.jpg"));
    });

    test("overwrites existing outputs on a second run", async () => {
        fixture = await PackagerFixture.createAddon();
        const packager = new Packager(fixture.cwd, fixture.projectRoot);

        await packager.run(fixture.settingsJson);
        await packager.run(fixture.settingsJson);

        assert.ok(fs.existsSync(fixture.submissionOutputPath));
        assert.ok(fs.existsSync(fixture.gameOutputPath));
    });

    test("rejects when a required pack folder is missing", async () => {
        fixture = await PackagerFixture.createAddon();

        fs.rmSync(path.resolve(fixture.cwd, "RP"), { force: true, recursive: true });

        await assert.rejects(runPackager(), /resource pack/);
    });

    test("rejects when art violates the specs", async () => {
        fixture = await PackagerFixture.createAddon();

        await PackagerFixture.writeJpeg(path.resolve(fixture.projectRoot, "StoreArt", "key_art.jpg"), 100, 100, 72);

        await assert.rejects(runPackager(), /expected 800x450/);
    });

    test("rejects when a pack manifest is missing", async () => {
        fixture = await PackagerFixture.createAddon();

        fs.rmSync(path.resolve(fixture.cwd, "RP", "manifest.json"));

        await assert.rejects(runPackager(), /missing required manifest\.json for resource pack/);
    });
});
