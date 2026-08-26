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

describe("JsonTools file writers", () => {
    let filePath: string;

    beforeEach(() => {
        filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "jsontools-")), "data.json");
    });

    afterEach(() => {
        fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    });

    test("writeMinified writes compact JSON without comments", () => {
        JsonTools.writeMinified(filePath, JsonTools.parse('{ /* c */ "a": 1 }'));

        assert.equal(fs.readFileSync(filePath, "utf8"), '{"a":1}');
    });

    test("writePretty writes indented JSON with a trailing newline", () => {
        JsonTools.writePretty(filePath, { a: 1 });

        assert.equal(fs.readFileSync(filePath, "utf8"), '{\n  "a": 1\n}\n');
    });

    test("loadFile round-trips a written file", () => {
        JsonTools.writeMinified(filePath, { a: 1 });

        assert.deepEqual(JsonTools.loadFile(filePath), { a: 1 });
    });
});
