import type { CatalogEntry, PackCatalog } from "../../src/Types/ContentGuideTypes";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import GuideIssues from "../../src/Lib/GuideIssues";
import PackScanner from "../../src/Lib/PackScanner";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("PackScanner.scan", () => {
    let project: ProjectFixture;

    beforeEach(() => {
        project = new ProjectFixture();
    });

    afterEach(() => {
        project.dispose();
    });

    const scan = (): PackCatalog => new PackScanner(project.workingDirectory, new GuideIssues()).scan();

    test("warns about each pack file it skips and marks what may be missing", () => {
        const issues = new GuideIssues();

        project.writeJson("BP/items/no_id.json", { "minecraft:item": { description: {} } });
        project.writeJson("BP/items/wrong_key.json", { other: {} });
        project.writeJson("BP/blocks/list.json", []);
        project.writeJson("BP/entities/blank.json", { "minecraft:entity": { description: { identifier: " " } } });
        project.writeJson("BP/spawn_rules/no_id.json", { "minecraft:spawn_rules": {} });
        project.writeJson("BP/recipes/no_result.json", { "minecraft:recipe_shapeless": { ingredients: [] } });
        project.writeJson("RP/sounds/sound_definitions.json", { sound_definitions: "wrong" });

        const catalog = new PackScanner(project.workingDirectory, issues).scan();

        for (const file of [
            "BP/items/no_id.json",
            "BP/items/wrong_key.json",
            "BP/blocks/list.json",
            "BP/entities/blank.json",
            "BP/spawn_rules/no_id.json",
            "BP/recipes/no_result.json",
            "RP/sounds/sound_definitions.json",
        ]) {
            assert.ok(
                issues.warnings.some((warning) => warning.startsWith(file)),
                file
            );
        }

        assert.deepEqual(catalog.sounds, []);
        assert.deepEqual([...catalog.uncertainSections].sort(), ["entities", "items", "sounds"]);
    });

    test("lists a recipe type that is new to the filter and warns about it", () => {
        const issues = new GuideIssues();

        project.writeJson("BP/items/gem.json", { "minecraft:item": { description: { identifier: "test:gem" } } });
        project.writeJson("BP/recipes/future.json", {
            format_version: "2.0.0",
            "minecraft:recipe_future_press": { result: { item: "test:gem" } },
        });

        const [gem] = new PackScanner(project.workingDirectory, issues).scan().items;

        assert.deepEqual(factTexts(gem), ["Made with a Future Press recipe"]);
        assert.equal(gem.playerAccessible, true);
        assert.match(issues.warnings.join(), /Recipe type "minecraft:recipe_future_press" is new/);
    });

    test("accepts a smithing trim recipe, which makes no new item", () => {
        const issues = new GuideIssues();

        project.writeJson("BP/items/gem.json", { "minecraft:item": { description: { identifier: "test:gem" } } });
        project.writeJson("BP/recipes/trim.json", { "minecraft:recipe_smithing_trim": { tags: ["smithing_table"] } });
        new PackScanner(project.workingDirectory, issues).scan();

        assert.deepEqual(issues.warnings, []);
    });

    test("marks only content that the packs fully describe as having optional notes", () => {
        project.writePacks();

        const catalog = scan();
        const optional = [...catalog.items, ...catalog.entities, ...catalog.sounds]
            .filter((entry) => entry.isNotesOptional)
            .map((entry) => entry.identifier)
            .sort();

        assert.deepEqual(optional, ["minecraft:slime_ball", "test:block.ore.break", "test:golem_spawn_egg"]);
    });

    test("marks sections uncertain when a pack is absent", () => {
        project.writeJson("BP/items/gem.json", { "minecraft:item": { description: { identifier: "test:gem" } } });

        assert.deepEqual(scan().uncertainSections, ["sounds"]);
    });

    const factTexts = (entry: CatalogEntry): string[] => entry.facts.map((fact) => fact.text);

    const find = (entries: CatalogEntry[], identifier: string): CatalogEntry => {
        const entry = entries.find((candidate) => candidate.identifier === identifier);

        assert.ok(entry, `Missing ${identifier}`);

        return entry;
    };

    test("returns an empty catalog when the packs do not exist", () => {
        assert.deepEqual(scan(), {
            items: [],
            entities: [],
            sounds: [],
            vanillaEdits: [],
            hasJsonUi: false,
            uncertainSections: ["items", "entities", "sounds"],
        });
    });

    test("uses language names and creates names from identifiers when missing", () => {
        project.writePacks();

        const { items, entities } = scan();

        assert.equal(find(items, "test:gem").name, "Shiny Gem");
        assert.equal(find(items, "test:ore").name, "Gem Ore");
        assert.equal(find(items, "test:secret").name, "Secret");
        assert.equal(find(entities, "test:golem").name, "Stone Golem");
    });

    test("uses the display name component as a language key or plain text", () => {
        project.writeText("RP/texts/en_US.lang", "custom.key=Translated Name\n");
        project.writeJson("BP/items/keyed.json", {
            "minecraft:item": {
                description: { identifier: "test:keyed" },
                components: { "minecraft:display_name": { value: "custom.key" } },
            },
        });
        project.writeJson("BP/items/plain.json", {
            "minecraft:item": {
                description: { identifier: "test:plain" },
                components: { "minecraft:display_name": { value: "Plain Name" } },
            },
        });

        const { items } = scan();

        assert.equal(find(items, "test:keyed").name, "Translated Name");
        assert.equal(find(items, "test:plain").name, "Plain Name");
    });

    test("infers player accessibility", () => {
        project.writePacks();

        const { items, entities } = scan();

        assert.equal(find(items, "test:gem").playerAccessible, true);
        assert.equal(find(items, "test:secret").playerAccessible, false);
        assert.equal(find(items, "test:golem_spawn_egg").playerAccessible, false);
        assert.equal(find(entities, "test:golem").playerAccessible, true);
        assert.equal(find(entities, "test:bolt").playerAccessible, false);
    });

    test("merges an item and block with one identifier", () => {
        project.writeJson("BP/items/ore.json", {
            "minecraft:item": { description: { identifier: "test:ore", menu_category: { category: "none" } }, components: {} },
        });
        project.writeJson("BP/blocks/ore.json", {
            "minecraft:block": { description: { identifier: "test:ore", menu_category: { category: "nature" } }, components: {} },
        });

        const { items } = scan();

        assert.equal(items.length, 1);
        assert.equal(items[0].playerAccessible, true);
    });

    test("records recipes, drops, and missing recipes as facts", () => {
        project.writePacks();

        const { items } = scan();

        assert.deepEqual(factTexts(find(items, "test:gem")), ["Cannot be crafted", "Dropped by Gem Ore"]);
        assert.deepEqual(factTexts(find(items, "minecraft:slime_ball")), [
            "Crafted in Inventory or Crafting Table from 1 Shiny Gem, makes 2",
        ]);
        assert.equal(find(items, "minecraft:slime_ball").name, "Slime Ball");
    });

    test("marks short facts as tags and keeps the crafting grid of a shaped recipe", () => {
        project.writePacks();
        project.writeJson("BP/recipes/rod.json", {
            "minecraft:recipe_shaped": {
                tags: ["crafting_table"],
                pattern: ["#"],
                key: { "#": { item: "test:gem" } },
                result: { item: "test:secret" },
            },
        });

        const { items, entities } = scan();

        assert.equal(find(items, "test:ore").facts[0].isTag, true);
        assert.deepEqual(find(items, "test:secret").facts[0].recipe?.rows, ["#"]);
        assert.equal(find(entities, "test:golem").facts[0].isTag, true);
        assert.equal(find(entities, "test:golem").facts.at(-1)?.isTag, false);
    });

    test("does not list a block as its own drop", () => {
        project.writeJson("BP/blocks/rock.json", {
            "minecraft:block": { description: { identifier: "test:rock" }, components: { "minecraft:loot": "loot_tables/rock.json" } },
        });
        project.writeJson("BP/loot_tables/rock.json", { pools: [{ entries: [{ type: "item", name: "test:rock" }] }] });

        assert.deepEqual(factTexts(scan().items[0]), ["Cannot be crafted"]);
    });

    test("reads block loot from permutations", () => {
        project.writeJson("BP/blocks/rock.json", {
            "minecraft:block": {
                description: { identifier: "test:rock" },
                components: {},
                permutations: [{ condition: "true", components: { "minecraft:loot": "loot_tables/rock.json" } }],
            },
        });
        project.writeJson("BP/items/gem.json", { "minecraft:item": { description: { identifier: "test:gem" }, components: {} } });
        project.writeJson("BP/loot_tables/rock.json", { pools: [{ entries: [{ type: "item", name: "test:gem" }] }] });

        assert.ok(factTexts(find(scan().items, "test:gem")).includes("Dropped by Rock"));
    });

    test("records trades", () => {
        project.writeJson("BP/items/gem.json", { "minecraft:item": { description: { identifier: "test:gem" }, components: {} } });
        project.writeJson("BP/entities/seller.json", {
            "minecraft:entity": {
                description: { identifier: "test:seller" },
                components: { "minecraft:economy_trade_table": { table: "trading/seller.json" } },
            },
        });
        project.writeJson("BP/trading/seller.json", {
            tiers: [{ trades: [{ wants: [{ item: "minecraft:emerald" }], gives: [{ item: "test:gem" }] }] }],
        });

        const gem = find(scan().items, "test:gem");

        assert.ok(factTexts(gem).includes("Traded by Seller"));
        assert.equal(gem.playerAccessible, true);
    });

    test("records entity facts, including component groups", () => {
        project.writePacks();

        const { entities } = scan();

        assert.deepEqual(factTexts(find(entities, "test:golem")), ["Spawns naturally", "Has a spawn egg", "Drops Iron Ingot"]);
        assert.deepEqual(factTexts(find(entities, "test:bolt")), ["Projectile"]);
        assert.ok(factTexts(find(entities, "minecraft:cow")).includes("Edits the vanilla entity"));
    });

    test("does not create a spawn egg for a vanilla entity", () => {
        project.writePacks();

        assert.equal(
            scan().items.some((item) => item.identifier === "minecraft:cow_spawn_egg"),
            false
        );
    });

    test("lists vanilla edits", () => {
        project.writePacks();

        assert.deepEqual(scan().vanillaEdits, [
            "Edits the vanilla entity Cow (`minecraft:cow`)",
            "Adds a recipe for Slime Ball (`minecraft:slime_ball`)",
        ]);
    });

    test("reads sounds without the format key and from the flat layout", () => {
        project.writePacks();
        assert.deepEqual(
            scan().sounds.map((sound) => sound.identifier),
            ["test:block.ore.break"]
        );

        project.writeJson("RP/sounds/sound_definitions.json", { "flat.sound": {} });
        assert.equal(scan().sounds[0].name, "Flat Sound");
    });

    test("detects JSON UI", () => {
        project.writeText("RP/ui/hud_screen.json", "{}");

        assert.equal(scan().hasJsonUi, true);
    });

    test("names the file when JSON is invalid", () => {
        project.writeText("BP/items/bad.json", "{");

        assert.throws(() => scan(), /Invalid JSON in .*bad\.json/);
    });
});
