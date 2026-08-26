import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import TextureScanner from "../../src/Lib/TextureScanner";
import PackFixture from "../Helpers/PackFixture";

describe("TextureScanner.scan", () => {
    let pack: PackFixture;

    beforeEach(() => {
        pack = new PackFixture();
    });

    afterEach(() => {
        pack.dispose();
    });

    test("finds nested images and skips other files", () => {
        pack.writeFile("textures/blocks/Stone.png");
        pack.writeFile("textures/items/deep/gem.TGA");
        pack.writeFile("textures/terrain_texture.json");
        pack.writeFile("textures/notes.txt");
        pack.writeFile("sounds/click.png");

        const images = TextureScanner.scan(pack.packRoot, ["png", "tga"]).sort((a, b) => a.key.localeCompare(b.key));

        assert.deepEqual(images, [
            { key: "textures/blocks/stone", listPath: "textures/blocks/Stone" },
            { key: "textures/items/deep/gem", listPath: "textures/items/deep/gem" },
        ]);
    });

    test("returns nothing when the textures folder is missing", () => {
        assert.deepEqual(TextureScanner.scan(pack.packRoot, ["png"]), []);
    });
});

describe("TextureScanner.toKey", () => {
    test("strips the extension and uses forward slashes", () => {
        const filePath = path.join("root", "textures", "a", "b.png");

        assert.equal(TextureScanner.toKey("root", filePath), "textures/a/b");
    });

    test("keeps a path without an extension", () => {
        assert.equal(TextureScanner.toKey("root", path.join("root", "textures", "a")), "textures/a");
    });
});
