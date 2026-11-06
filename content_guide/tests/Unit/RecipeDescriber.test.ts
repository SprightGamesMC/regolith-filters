import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Identifiers from "../../src/Lib/Identifiers";
import RecipeDescriber from "../../src/Lib/RecipeDescriber";

describe("RecipeDescriber.describe", () => {
    const describer = new RecipeDescriber((identifier) => Identifiers.humanize(identifier));

    test("describes a shaped recipe and marks empty slots", () => {
        const description = describer.describe({
            "minecraft:recipe_shaped": {
                tags: ["crafting_table"],
                pattern: ["A A", " B "],
                key: { A: { item: "test:gem" }, B: "minecraft:stick" },
                result: { item: "test:rod", count: 2 },
            },
        });

        assert.deepEqual(description, {
            results: ["test:rod"],
            text: "Crafted in Crafting Table: pattern `A.A / .B.`, A = Gem, B = Stick, . = empty, makes 2",
            grid: {
                station: "Crafting Table",
                rows: ["A A", " B "],
                legend: [
                    { symbol: "A", name: "Gem" },
                    { symbol: "B", name: "Stick" },
                ],
                makes: 2,
            },
        });
    });

    test("adds repeated shapeless ingredients together", () => {
        const description = describer.describe({
            "minecraft:recipe_shapeless": {
                tags: ["stonecutter"],
                ingredients: [{ item: "test:gem" }, { item: "test:gem", count: 2 }, { tag: "minecraft:planks" }],
                result: "test:rod",
            },
        });

        assert.equal(description?.text, "Crafted in Stonecutter from 3 Gem, 1 Any Planks");
    });

    test("adds the inventory to crafting table recipes that fit in 2 by 2", () => {
        const shapeless = describer.describe({
            "minecraft:recipe_shapeless": {
                tags: ["crafting_table"],
                ingredients: [{ item: "test:gem", count: 2 }, { item: "test:dust" }, { item: "test:dust" }],
                result: "test:rod",
            },
        });
        const largeShapeless = describer.describe({
            "minecraft:recipe_shapeless": {
                tags: ["crafting_table"],
                ingredients: [{ item: "test:gem", count: 5 }],
                result: "test:rod",
            },
        });
        const shaped = describer.describe({
            "minecraft:recipe_shaped": { tags: ["crafting_table"], pattern: ["AA", "AA"], key: { A: "test:gem" }, result: "test:rod" },
        });

        assert.equal(shapeless?.text, "Crafted in Inventory or Crafting Table from 2 Gem, 2 Dust");
        assert.equal(largeShapeless?.text, "Crafted in Crafting Table from 5 Gem");
        assert.equal(shaped?.grid?.station, "Inventory or Crafting Table");
    });

    test("creates a grid for a shapeless crafting table recipe", () => {
        const small = describer.describe({
            "minecraft:recipe_shapeless": {
                tags: ["crafting_table"],
                ingredients: [{ item: "test:gem", count: 2 }, { item: "test:gold" }, { item: "test:gold" }],
                result: { item: "test:rod", count: 4 },
            },
        });
        const large = describer.describe({
            "minecraft:recipe_shapeless": {
                tags: ["crafting_table"],
                ingredients: [{ item: "test:gem", count: 4 }, { item: "test:dust" }],
                result: "test:rod",
            },
        });
        const stonecutter = describer.describe({
            "minecraft:recipe_shapeless": { tags: ["stonecutter"], ingredients: [{ item: "test:gem" }], result: "test:rod" },
        });

        assert.deepEqual(small?.grid, {
            station: "Inventory or Crafting Table",
            rows: ["GG", "OO"],
            legend: [
                { symbol: "G", name: "Gem" },
                { symbol: "O", name: "Gold" },
            ],
            makes: 4,
        });
        assert.deepEqual(large?.grid?.rows, ["GGG", "GD"]);
        assert.equal(stonecutter?.grid, null);
    });

    test("describes furnace, brewing, and smithing recipes", () => {
        const furnace = describer.describe({
            "minecraft:recipe_furnace": { tags: ["furnace", "blast_furnace"], input: "test:ore", output: "test:gem" },
        });
        const brewing = describer.describe({
            "minecraft:recipe_brewing_mix": { input: "minecraft:potion", reagent: "test:gem", output: "minecraft:potion_type:strength" },
        });
        const smithing = describer.describe({
            "minecraft:recipe_smithing_transform": {
                tags: ["smithing_table"],
                base: "minecraft:iron_sword",
                addition: "test:gem",
                template: "test:template",
                result: "test:sword",
            },
        });

        assert.equal(furnace?.text, "Smelted in Furnace, Blast Furnace from Ore");
        assert.equal(brewing?.text, "Brewed from Potion with Gem");
        assert.deepEqual(brewing?.results, ["minecraft:potion_type"]);
        assert.equal(smithing?.text, "Smithed in Smithing Table from Iron Sword, Gem, Template");
    });

    test("reads array results and normalizes identifiers", () => {
        const description = describer.describe({
            "minecraft:recipe_shapeless": { tags: ["crafting_table"], ingredients: "stick", result: [{ item: "test:a:1" }, { item: "b" }] },
        });

        assert.deepEqual(description?.results, ["test:a", "minecraft:b"]);
    });

    test("returns null without a recipe or result", () => {
        assert.equal(describer.describe({ format_version: "1.20" }), null);
        assert.equal(describer.describe({ "minecraft:recipe_shapeless": { ingredients: [] } }), null);
    });
});
