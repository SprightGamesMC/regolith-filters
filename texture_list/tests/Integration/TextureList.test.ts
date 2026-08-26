import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import Main from "../../src/Main";
import PackFixture from "../Helpers/PackFixture";

describe("Main.run", () => {
    const originalCwd = process.cwd();
    const originalRootDirectory = process.env.ROOT_DIR;
    let pack: PackFixture;

    beforeEach(() => {
        pack = new PackFixture();
        process.chdir(pack.workingDirectory);
        process.env.ROOT_DIR = pack.projectRoot;
    });

    afterEach(() => {
        process.chdir(originalCwd);
        pack.dispose();

        if (originalRootDirectory === undefined) {
            delete process.env.ROOT_DIR;
            return;
        }

        process.env.ROOT_DIR = originalRootDirectory;
    });

    test("writes the texture list without texture set layer files", () => {
        pack.writeFile("textures/blocks/stone.png");
        pack.writeFile("textures/blocks/stone_mer.png");
        pack.writeFile("textures/blocks/stone_normal.png");
        pack.writeFile("textures/items/apple.png");
        pack.writeFile("textures/texture_list.json", "[]");
        pack.writeSet("textures/blocks/stone.texture_set.json", {
            color: "stone",
            normal: "stone_normal",
            metalness_emissive_roughness: "stone_mer",
        });

        new Main().run();

        assert.deepEqual(pack.readJson("textures/texture_list.json"), ["textures/blocks/stone", "textures/items/apple"]);
    });

    test("finds the project root two levels up when ROOT_DIR is unset", () => {
        delete process.env.ROOT_DIR;
        pack.writeFile("textures/a.png");

        new Main().run();

        assert.deepEqual(pack.readJson("textures/texture_list.json"), ["textures/a"]);
    });

    test("fails on a malformed texture set", () => {
        pack.writeFile("textures/bad.texture_set.json", "{");

        assert.throws(() => new Main().run(), /Malformed texture set/);
    });
});
