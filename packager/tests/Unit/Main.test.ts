import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import Main from "../../src/Main";

describe("Main.resolveProjectRoot", () => {
    const originalRootDirectory = process.env.ROOT_DIR;

    afterEach(() => {
        if (originalRootDirectory === undefined) {
            delete process.env.ROOT_DIR;
            return;
        }

        process.env.ROOT_DIR = originalRootDirectory;
    });

    test("uses ROOT_DIR when set", () => {
        process.env.ROOT_DIR = "some/root";

        assert.equal(new Main().resolveProjectRoot(), path.resolve("some/root"));
    });

    test("ignores a blank ROOT_DIR", () => {
        process.env.ROOT_DIR = "   ";

        assert.equal(new Main().resolveProjectRoot(), path.resolve(process.cwd(), "../../"));
    });

    test("defaults to two levels above the working directory", () => {
        delete process.env.ROOT_DIR;

        assert.equal(new Main().resolveProjectRoot(), path.resolve(process.cwd(), "../../"));
    });
});
