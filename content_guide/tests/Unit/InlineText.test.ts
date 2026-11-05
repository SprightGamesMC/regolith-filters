import assert from "node:assert/strict";
import { describe, test } from "node:test";
import InlineText from "../../src/Lib/InlineText";

describe("InlineText.split", () => {
    test("separates plain and code runs", () => {
        assert.deepEqual(InlineText.split("Use `/tp` now"), [
            { text: "Use ", isCode: false },
            { text: "/tp", isCode: true },
            { text: " now", isCode: false },
        ]);
    });

    test("drops empty runs", () => {
        assert.deepEqual(InlineText.split("`code`"), [{ text: "code", isCode: true }]);
    });

    test("treats a backtick without a partner as plain text", () => {
        assert.deepEqual(InlineText.split("A `b` c`d"), [
            { text: "A ", isCode: false },
            { text: "b", isCode: true },
            { text: " c`d", isCode: false },
        ]);
    });
});
