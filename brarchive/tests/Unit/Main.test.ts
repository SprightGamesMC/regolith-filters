import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import Main from "../../src/Main";

describe("Main.parseSettings", () => {
    const originalArgv = process.argv;

    afterEach(() => {
        process.argv = originalArgv;
    });

    /**
     * Sets the settings argument passed to the filter.
     *
     * @param rawSettings - Raw settings argument, or undefined for none.
     */
    function setSettingsArgument(rawSettings?: string): void {
        process.argv = rawSettings === undefined ? ["node", "Main.js"] : ["node", "Main.js", rawSettings];
    }

    test("returns an empty object when no argument is given", () => {
        setSettingsArgument();

        assert.deepEqual(new Main().parseSettings(), {});
    });

    test("parses a settings object", () => {
        setSettingsArgument('{ "mode": "keep_both", "minify": false }');

        assert.deepEqual(new Main().parseSettings(), { mode: "keep_both", minify: false });
    });

    test("tolerates comments and trailing commas", () => {
        setSettingsArgument('{ /* note */ "mode": "replace", }');

        assert.deepEqual(new Main().parseSettings(), { mode: "replace" });
    });

    test("rejects a JSON array", () => {
        setSettingsArgument("[]");

        assert.throws(() => new Main().parseSettings(), /must be a JSON object/);
    });

    test("rejects a non-object primitive", () => {
        setSettingsArgument("5");

        assert.throws(() => new Main().parseSettings(), /must be a JSON object/);
    });

    test("rejects the null literal", () => {
        setSettingsArgument("null");

        assert.throws(() => new Main().parseSettings(), /must be a JSON object/);
    });

    test("rejects malformed JSON", () => {
        setSettingsArgument("{ bad");

        assert.throws(() => new Main().parseSettings());
    });
});
