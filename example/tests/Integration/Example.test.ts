import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import Main from "../../src/Main";
import OutputCapture from "../Helpers/OutputCapture";

describe("Main.run", () => {
    const originalArgv = process.argv;

    afterEach(() => {
        process.argv = originalArgv;
    });

    test("greets using the resolved settings", async () => {
        process.argv = ["node", "Main.js", '{"message":"hello","repeat":2}'];

        const output = await OutputCapture.record(() => {
            new Main().run();
        });

        assert.deepEqual(output.lines, ["hello", "hello"]);
    });

    test("fails when the settings are missing", () => {
        process.argv = ["node", "Main.js"];

        assert.throws(() => new Main().run(), /Missing filter settings/);
    });
});
