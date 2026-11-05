import assert from "node:assert/strict";
import { describe, test } from "node:test";
import ItemTables from "../../src/Lib/ItemTables";

describe("ItemTables.lootItems", () => {
    test("collects items from nested tables and pools without duplicates", () => {
        const tables = new Map<string, unknown>([
            [
                "main.json",
                {
                    pools: [
                        {
                            entries: [
                                { type: "item", name: "test:gem:1" },
                                { type: "item", name: "stick" },
                                { type: "loot_table", name: "other.json" },
                                { type: "empty" },
                            ],
                        },
                    ],
                },
            ],
            [
                "other.json",
                {
                    pools: [
                        {
                            entries: [
                                { type: "item", name: "test:gem" },
                                { type: "item", name: "test:rod" },
                            ],
                        },
                    ],
                },
            ],
        ]);

        assert.deepEqual(ItemTables.lootItems("main.json", tables), ["test:gem", "minecraft:stick", "test:rod"]);
    });

    test("stops reference loops and accepts missing tables", () => {
        const tables = new Map<string, unknown>([["loop.json", { pools: [{ entries: [{ type: "loot_table", name: "loop.json" }] }] }]]);

        assert.deepEqual(ItemTables.lootItems("loop.json", tables), []);
        assert.deepEqual(ItemTables.lootItems("missing.json", tables), []);
    });
});

describe("ItemTables.tradeItems", () => {
    test("collects given items from tiers, groups, and choices only", () => {
        const table = {
            tiers: [
                {
                    groups: [
                        {
                            trades: [
                                {
                                    wants: [{ item: "minecraft:emerald" }],
                                    gives: [{ item: "test:gem" }, { choice: [{ item: "test:rod" }, { item: "test:gem" }] }],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        assert.deepEqual(ItemTables.tradeItems(table), ["test:gem", "test:rod"]);
    });

    test("accepts empty values", () => {
        assert.deepEqual(ItemTables.tradeItems(null), []);
    });
});
