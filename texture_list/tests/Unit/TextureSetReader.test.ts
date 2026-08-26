import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import TextureSetReader from "../../src/Lib/TextureSetReader";
import PackFixture from "../Helpers/PackFixture";

describe("TextureSetReader.read", () => {
    let pack: PackFixture;

    beforeEach(() => {
        pack = new PackFixture();
    });

    afterEach(() => {
        pack.dispose();
    });

    test("collects every non color layer as a sibling key", () => {
        pack.writeSet("textures/blocks/stone.texture_set.json", {
            color: "stone",
            normal: "stone_normal",
            heightmap: "stone_height",
            metalness_emissive_roughness: "stone_mer",
            metalness_emissive_roughness_subsurface: "stone_mers",
        });

        const layers = TextureSetReader.read(pack.packRoot);

        assert.deepEqual([...layers.colorKeys], ["textures/blocks/stone"]);
        assert.deepEqual([...layers.layerKeys].sort(), [
            "textures/blocks/stone_height",
            "textures/blocks/stone_mer",
            "textures/blocks/stone_mers",
            "textures/blocks/stone_normal",
        ]);
    });

    test("skips array and hex colors", () => {
        pack.writeSet("textures/blocks/a.texture_set.json", {
            color: [1, 2, 3, 4],
            metalness_emissive_roughness: "#0000FF",
            normal: "a_normal",
        });

        const layers = TextureSetReader.read(pack.packRoot);

        assert.deepEqual([...layers.colorKeys], []);
        assert.deepEqual([...layers.layerKeys], ["textures/blocks/a_normal"]);
    });

    test("resolves pack relative paths and lower cases keys", () => {
        pack.writeSet("textures/blocks/a.texture_set.json", {
            color: "textures/Blocks/A",
            normal: "textures/other/A_Normal.png",
        });

        const layers = TextureSetReader.read(pack.packRoot);

        assert.deepEqual([...layers.colorKeys], ["textures/blocks/a"]);
        assert.deepEqual([...layers.layerKeys], ["textures/other/a_normal"]);
    });

    test("throws with the file name on malformed JSON", () => {
        pack.writeFile("textures/blocks/bad.texture_set.json", "{ nope");

        assert.throws(() => TextureSetReader.read(pack.packRoot), /bad\.texture_set\.json/);
    });

    test("throws when the texture set object is missing", () => {
        pack.writeFile("textures/blocks/bad.texture_set.json", '{"format_version":"1.16.100"}');

        assert.throws(() => TextureSetReader.read(pack.packRoot), /missing "minecraft:texture_set"/);
    });
});

describe("TextureSetReader.excludedKeys", () => {
    test("keeps a file that is a color layer in another set", () => {
        const excluded = TextureSetReader.excludedKeys({
            colorKeys: new Set(["textures/a", "textures/shared"]),
            layerKeys: new Set(["textures/shared", "textures/a_mer"]),
        });

        assert.deepEqual([...excluded], ["textures/a_mer"]);
    });
});
