import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import TextureListFilter from "../../src/Lib/TextureListFilter";
import PackFixture from "../Helpers/PackFixture";

describe("TextureListFilter.collect", () => {
    let pack: PackFixture;

    beforeEach(() => {
        pack = new PackFixture();
    });

    afterEach(() => {
        pack.dispose();
    });

    test("merges subpack textures relative to the subpack root", () => {
        pack.writeFile("textures/blocks/stone.png");
        pack.writeFile("textures/blocks/stone_mer.png");
        pack.writeSet("textures/blocks/stone.texture_set.json", {
            color: "stone",
            metalness_emissive_roughness: "stone_mer",
        });
        pack.writeFile("subpacks/hd/textures/blocks/stone.png");
        pack.writeFile("subpacks/hd/textures/blocks/extra.png");

        const filter = new TextureListFilter(pack.workingDirectory, pack.projectRoot);

        assert.deepEqual(filter.collect(), ["textures/blocks/extra", "textures/blocks/stone"]);
    });

    test("returns an empty list when the textures folder is missing", () => {
        assert.deepEqual(new TextureListFilter(pack.workingDirectory, pack.projectRoot).collect(), []);
    });
});

describe("TextureListFilter constructor", () => {
    test("reads the resource pack folder from config.json", () => {
        const pack = new PackFixture("packs/resources");
        pack.writeFile("textures/a.png");

        assert.deepEqual(new TextureListFilter(pack.workingDirectory, pack.projectRoot).collect(), ["textures/a"]);
        pack.dispose();
    });

    test("falls back to RP without config.json", () => {
        const pack = new PackFixture();
        pack.writeFile("textures/a.png");

        assert.deepEqual(new TextureListFilter(pack.workingDirectory, pack.packRoot).collect(), ["textures/a"]);
        pack.dispose();
    });
});
