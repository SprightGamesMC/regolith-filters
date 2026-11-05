import assert from "node:assert/strict";
import { describe, test } from "node:test";
import LangFile from "../../src/Lib/LangFile";

describe("LangFile", () => {
    test("reads values and ignores comments, blank lines, and a byte order mark", () => {
        const lang = new LangFile(String.fromCharCode(0xfeff) + "## Header\r\n\r\nfirst.key=First\t## Comment\r\nsecond.key=A = B\r\n");

        assert.equal(lang.find("first.key"), "First");
        assert.equal(lang.find("second.key"), "A = B");
    });

    test("finds the first key with a value", () => {
        const lang = new LangFile("b=Second\nc=Third\nempty=\n");

        assert.equal(lang.find("a", "empty", "b", "c"), "Second");
        assert.equal(lang.find("a"), null);
    });

    test("loads a missing file as empty", () => {
        assert.equal(LangFile.load("missing.lang").find("a"), null);
    });
});
