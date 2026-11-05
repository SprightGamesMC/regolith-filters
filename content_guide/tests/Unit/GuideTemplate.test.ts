import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import GuideTemplate from "../../src/Data/GuideTemplate";

describe("GuideTemplate", () => {
    test("matches the file that regolith install copies", () => {
        const file = fs.readFileSync(path.resolve(__dirname, "../../data/content_guide.json"), "utf8");

        assert.equal(GuideTemplate.TEXT, file.replaceAll("\r\n", "\n"));
    });
});
