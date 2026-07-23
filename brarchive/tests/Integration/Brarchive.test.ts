import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import BrarchiveDecoder from "../Helpers/BrarchiveDecoder";
import BrarchiveFilter from "../../src/Lib/BrarchiveFilter";
import PackFixture from "../Helpers/PackFixture";

describe("BrarchiveFilter.run", () => {
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Creates a minimal pack with one archivable directory.
     *
     * @param packName - Pack directory name.
     */
    function createPack(packName: string): void {
        fixture.writeFile(path.join(packName, "manifest.json"), JSON.stringify({ header: {} }));
        fixture.writeFile(path.join(packName, "entities", "foo.json"), '{ "a": 1 }');
    }

    test("archives eligible directories and removes originals in replace mode", async () => {
        createPack("BP");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: true }).run();

        assert.equal(fixture.exists("BP/__brarchive/entities.brarchive"), true);
        assert.equal(fixture.exists("BP/entities"), false);

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.equal(manifest.header.pack_optimization_version, BrarchiveFilter.PACK_OPTIMIZATION_VERSION);
    });

    test("minifies archived JSON content", async () => {
        createPack("BP");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: true }).run();

        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("BP/__brarchive/entities.brarchive")), [
            { content: '{"a":1}', name: "foo.json" },
        ]);
    });

    test("preserves archived content when minify is disabled", async () => {
        createPack("BP");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: false }).run();

        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("BP/__brarchive/entities.brarchive")), [
            { content: '{ "a": 1 }', name: "foo.json" },
        ]);
    });

    test("keeps originals in keep_both mode", async () => {
        createPack("BP");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "keep_both", minify: false }).run();

        assert.equal(fixture.exists("BP/__brarchive/entities.brarchive"), true);
        assert.equal(fixture.exists("BP/entities/foo.json"), true);
    });

    test("processes both packs", async () => {
        createPack("BP");
        createPack("RP");

        await new BrarchiveFilter(fixture.workspacePath, {}).run();

        assert.equal(fixture.exists("BP/__brarchive/entities.brarchive"), true);
        assert.equal(fixture.exists("RP/__brarchive/entities.brarchive"), true);
    });

    test("processes subpacks separately without requiring a subpack manifest", async () => {
        createPack("BP");
        fixture.writeFile("BP/subpacks/fancy/ui/x.json", "{}");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: true }).run();

        assert.equal(fixture.exists("BP/subpacks/fancy/__brarchive/ui.brarchive"), true);
        assert.equal(fixture.exists("BP/subpacks/fancy/ui"), false);
        assert.equal(fixture.exists("BP/subpacks/fancy/manifest.json"), false);
    });

    test("keeps excluded files on disk and out of the archive", async () => {
        createPack("BP");
        fixture.writeFile("BP/ui/_global_variables.json", "{}");
        fixture.writeFile("BP/ui/main.json", "{}");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: true }).run();

        assert.equal(fixture.exists("BP/ui/_global_variables.json"), true);
        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("BP/__brarchive/ui.brarchive")), [
            { content: "{}", name: "main.json" },
        ]);
    });

    test("leaves banned root directories untouched", async () => {
        createPack("BP");
        fixture.writeFile("BP/textures/t.json", "{}");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: true }).run();

        assert.equal(fixture.exists("BP/textures/t.json"), true);
        assert.equal(fixture.exists("BP/__brarchive/textures.brarchive"), false);
    });

    test("leaves directories with non-UTF-8 files untouched", async () => {
        createPack("BP");
        fixture.writeFile("BP/structures/good.json", "{}");
        fixture.writeFile("BP/structures/bad.bin", Buffer.from([0xff, 0xfe, 0xc3]));

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: true }).run();

        assert.equal(fixture.exists("BP/structures/good.json"), true);
        assert.equal(fixture.exists("BP/structures/bad.bin"), true);
        assert.equal(fixture.exists("BP/__brarchive/structures.brarchive"), false);
    });

    test("keeps root-level files", async () => {
        createPack("BP");
        fixture.writeFile("BP/pack_icon.png.json", "{}");

        await new BrarchiveFilter(fixture.workspacePath, { mode: "replace", minify: true }).run();

        assert.equal(fixture.exists("BP/pack_icon.png.json"), true);
    });

    test("throws when no pack directory exists", async () => {
        await assert.rejects(() => new BrarchiveFilter(fixture.workspacePath, {}).run(), /no BP or RP directory found/);
    });
});
