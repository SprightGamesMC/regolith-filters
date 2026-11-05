import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Identifiers from "../../src/Lib/Identifiers";

describe("Identifiers", () => {
    test("removes data values and adds the vanilla namespace", () => {
        assert.equal(Identifiers.base("apple"), "minecraft:apple");
        assert.equal(Identifiers.base("minecraft:wool:3"), "minecraft:wool");
        assert.equal(Identifiers.base("test:gem"), "test:gem");
    });

    test("detects vanilla content", () => {
        assert.equal(Identifiers.isVanilla("minecraft:cow"), true);
        assert.equal(Identifiers.isVanilla("test:cow"), false);
    });

    test("creates readable names", () => {
        assert.equal(Identifiers.humanize("test:will_o_wisp_bottle_1"), "Will O Wisp Bottle 1");
        assert.equal(Identifiers.humanize("test:block.lucky_break"), "Block Lucky Break");
        assert.equal(Identifiers.humanize("crafting_table"), "Crafting Table");
    });
});
