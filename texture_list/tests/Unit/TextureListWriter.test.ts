import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import TextureListWriter from "../../src/Lib/TextureListWriter";
import PackFixture from "../Helpers/PackFixture";

describe("TextureListWriter.build", () => {
    test("drops excluded keys, sorts, and removes duplicates", () => {
        const list = TextureListWriter.build(
            [
                { key: "textures/b", listPath: "textures/b" },
                { key: "textures/a_mer", listPath: "textures/a_mer" },
                { key: "textures/a", listPath: "textures/A" },
                { key: "textures/a", listPath: "textures/A" },
            ],
            new Set(["textures/a_mer"])
        );

        assert.deepEqual(list, ["textures/A", "textures/b"]);
    });
});

describe("TextureListWriter.write", () => {
    let pack: PackFixture;

    beforeEach(() => {
        pack = new PackFixture();
    });

    afterEach(() => {
        pack.dispose();
    });

    test("writes pretty JSON and creates parent folders", () => {
        const filePath = path.join(pack.packRoot, "textures", "texture_list.json");

        TextureListWriter.write(filePath, ["textures/a"]);

        assert.equal(fs.readFileSync(filePath, "utf8"), '[\n  "textures/a"\n]\n');
    });
});
