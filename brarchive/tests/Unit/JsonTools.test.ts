import assert from "node:assert/strict";
import { describe, test } from "node:test";
import JsonTools from "../../src/Lib/JsonTools";

describe("JsonTools.parse", () => {
    test("parses JSON with comments and trailing commas", () => {
        assert.deepEqual(JsonTools.parse('{ /* note */ "a": 1, }'), { a: 1 });
    });

    test("throws on invalid JSON", () => {
        assert.throws(() => JsonTools.parse("{ bad"));
    });
});
