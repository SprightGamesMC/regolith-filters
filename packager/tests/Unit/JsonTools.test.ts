import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import JsonTools from "../../src/Lib/JsonTools";

describe("JsonTools.parse", () => {
    test("parses JSON with comments and trailing commas", () => {
        assert.deepEqual(JsonTools.parse('{ /* note */ "a": 1, }'), { a: 1 });
    });

    test("throws on invalid JSON", () => {
        assert.throws(() => JsonTools.parse("{ bad"));
    });
});

describe("JsonTools.loadFile", () => {
    let filePath: string;

    beforeEach(() => {
        filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jsontools-")), "data.json");
    });

    afterEach(() => {
        fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    });

    test("loads and parses a JSONC file", () => {
        fs.writeFileSync(filePath, '{ /* c */ "a": 1 }');

        assert.deepEqual(JsonTools.loadFile(filePath), { a: 1 });
    });

    test("throws on a missing file", () => {
        assert.throws(() => JsonTools.loadFile(path.join(path.dirname(filePath), "missing.json")));
    });
});
