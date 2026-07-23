import assert from "node:assert/strict";
import { describe, test } from "node:test";
import JsonImportPlugin from "../../src/Lib/JsonImportPlugin";

describe("JsonImportPlugin.parseJson", () => {
    test("parses JSON with comments and trailing commas", () => {
        assert.deepEqual(JsonImportPlugin.parseJson('{ /* note */ "a": 1, }', "data.json"), { a: 1 });
    });

    test("throws with the file path on invalid JSON", () => {
        assert.throws(() => JsonImportPlugin.parseJson("{ bad", "broken.json"), /Imported JSON file "broken\.json"/);
    });
});

describe("JsonImportPlugin.create", () => {
    test("creates a named plugin with a setup hook", () => {
        const plugin = new JsonImportPlugin().create();

        assert.equal(plugin.name, "tscompile-json");
        assert.equal(typeof plugin.setup, "function");
    });
});
