import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import TextureListFilter from "../../src/Lib/TextureListFilter";
import PackFixture from "../Helpers/PackFixture";

describe("TextureListFilter.run", () => {
    let pack: PackFixture;

    beforeEach(() => {
        pack = new PackFixture();
    });

    afterEach(() => {
        pack.dispose();
    });

    test("writes a separate list per pack level", () => {
        pack.writeFile("textures/blocks/stone.png");
        pack.writeFile("textures/blocks/stone_mer.png");
        pack.writeSet("textures/blocks/stone.texture_set.json", {
            color: "stone",
            metalness_emissive_roughness: "stone_mer",
        });
        pack.writeFile("subpacks/hd/textures/blocks/stone.png");
        pack.writeFile("subpacks/hd/textures/blocks/extra.png");
        pack.writeFile("subpacks/empty/manifest.json");

        new TextureListFilter(pack.workingDirectory, pack.projectRoot).run();

        assert.deepEqual(pack.readJson("textures/texture_list.json"), ["textures/blocks/stone"]);
        assert.deepEqual(pack.readJson("subpacks/hd/textures/texture_list.json"), ["textures/blocks/extra", "textures/blocks/stone"]);
        assert.deepEqual(pack.readJson("subpacks/empty/textures/texture_list.json"), []);
    });

    test("writes an empty list when the textures folder is missing", () => {
        new TextureListFilter(pack.workingDirectory, pack.projectRoot).run();

        assert.deepEqual(pack.readJson("textures/texture_list.json"), []);
    });
});

describe("TextureListFilter constructor", () => {
    test("reads the resource pack folder from config.json", () => {
        const pack = new PackFixture("packs/resources");
        pack.writeFile("textures/a.png");

        assert.deepEqual(new TextureListFilter(pack.workingDirectory, pack.projectRoot).collectPack(pack.packRoot), ["textures/a"]);
        pack.dispose();
    });

    test("falls back to RP without config.json", () => {
        const pack = new PackFixture();
        pack.writeFile("textures/a.png");

        new TextureListFilter(pack.workingDirectory, pack.packRoot).run();

        assert.deepEqual(pack.readJson("textures/texture_list.json"), ["textures/a"]);
        pack.dispose();
    });
});
