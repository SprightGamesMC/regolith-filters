import type { ContentGuideSettings, PackCatalog } from "../../src/Types/ContentGuideTypes";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import StyleSettings from "../../src/Lib/StyleSettings";

/**
 * Temp Regolith project on disk for tests.
 */
export default class ProjectFixture {
    /** Absolute project root. */
    readonly projectRoot: string;

    /** Absolute Regolith working directory. */
    readonly workingDirectory: string;

    /**
     * Creates a fresh temp project.
     */
    constructor() {
        this.projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "content-guide-test-"));
        this.workingDirectory = path.join(this.projectRoot, ".regolith", "tmp");
        fs.mkdirSync(this.workingDirectory, { recursive: true });
    }

    /**
     * Creates guide data that passes every check for an Add-On at version 1.0.0.
     *
     * @returns Raw guide data.
     */
    static completeGuide(): Record<string, unknown> {
        return {
            completion_guide: [{ text: "Go to the house", locations: ["10 70 130"] }],
            navigation: { general: [], key_locations: [], landmarks: [], containers: [], hidden_elements: [] },
            characters: [{ text: "Farmer Joe", locations: ["150 70 0"], notes: ["Sells potatoes"] }],
            gameplay: { mechanics: [], user_interface: [], key_bindings: [] },
            vanilla_changes: [],
            items: {},
            entities: {},
            sounds: {},
            changelog: [{ version: "1.0.0", date: "2026-11-04", changes: ["Initial release"] }],
        };
    }

    /**
     * Creates settings for an Add-On at version 1.0.0.
     *
     * @param overrides - Values that replace the defaults.
     *
     * @returns ContentGuideSettings.
     */
    static settings(overrides: Partial<ContentGuideSettings> = {}): ContentGuideSettings {
        return {
            contentName: "Test Pack",
            contentType: "addon",
            contentVersion: "1.0.0",
            creatorTeamName: null,
            partnerName: null,
            outputPath: "out",
            strict: true,
            autoBlankOptionalNotes: false,
            style: StyleSettings.empty(),
            ...overrides,
        };
    }

    /**
     * Creates an empty catalog.
     *
     * @param overrides - Values that replace the defaults.
     *
     * @returns PackCatalog.
     */
    static catalog(overrides: Partial<PackCatalog> = {}): PackCatalog {
        return { items: [], entities: [], sounds: [], vanillaEdits: [], hasJsonUi: false, uncertainSections: [], ...overrides };
    }

    /**
     * Writes a file under the working directory, creating parent folders as needed.
     *
     * @param relativePath - Path relative to the working directory.
     * @param contents - File contents.
     */
    writeText(relativePath: string, contents: string): void {
        const filePath = path.join(this.workingDirectory, relativePath);

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, contents);
    }

    /**
     * Writes a JSON file under the working directory.
     *
     * @param relativePath - Path relative to the working directory.
     * @param data - JSON value.
     */
    writeJson(relativePath: string, data: unknown): void {
        this.writeText(relativePath, JSON.stringify(data));
    }

    /**
     * Writes the guide data file in the working directory and in the project, as Regolith would have it.
     *
     * @param data - Raw guide data.
     */
    writeGuide(data: unknown = ProjectFixture.completeGuide()): void {
        const projectFile = this.projectGuideFile();

        this.writeJson("data/content_guide/content_guide.json", data);
        fs.mkdirSync(path.dirname(projectFile), { recursive: true });
        fs.writeFileSync(projectFile, JSON.stringify(data));
    }

    /**
     * Finds the guide data file in the project.
     *
     * @returns Absolute file path.
     */
    projectGuideFile(): string {
        return path.join(this.projectRoot, "data", "content_guide", "content_guide.json");
    }

    /**
     * Writes a small behavior pack and resource pack with one of each content kind.
     */
    writePacks(): void {
        this.writeJson("BP/items/gem.json", {
            "minecraft:item": { description: { identifier: "test:gem", menu_category: { category: "items" } }, components: {} },
        });
        this.writeJson("BP/items/secret.json", {
            "minecraft:item": { description: { identifier: "test:secret", menu_category: { category: "none" } }, components: {} },
        });
        this.writeJson("BP/blocks/ore.json", {
            "minecraft:block": {
                description: { identifier: "test:ore", menu_category: { category: "nature" } },
                components: { "minecraft:loot": "loot_tables/ore.json" },
            },
        });
        this.writeJson("BP/entities/golem.json", {
            "minecraft:entity": {
                description: { identifier: "test:golem", is_spawnable: true },
                components: {},
                component_groups: { rich: { "minecraft:loot": { table: "loot_tables/golem.json" } } },
            },
        });
        this.writeJson("BP/entities/bolt.json", {
            "minecraft:entity": {
                description: { identifier: "test:bolt", is_spawnable: false },
                components: { "minecraft:projectile": {} },
            },
        });
        this.writeJson("BP/entities/cow.json", {
            "minecraft:entity": { description: { identifier: "minecraft:cow", is_spawnable: true }, components: {} },
        });
        this.writeJson("BP/spawn_rules/golem.json", {
            "minecraft:spawn_rules": { description: { identifier: "test:golem" } },
        });
        this.writeJson("BP/loot_tables/ore.json", { pools: [{ entries: [{ type: "item", name: "test:gem" }] }] });
        this.writeJson("BP/loot_tables/golem.json", { pools: [{ entries: [{ type: "item", name: "minecraft:iron_ingot" }] }] });
        this.writeJson("BP/recipes/slime.json", {
            "minecraft:recipe_shapeless": {
                description: { identifier: "test:slime" },
                tags: ["crafting_table"],
                ingredients: [{ item: "test:gem" }],
                result: { item: "minecraft:slime_ball", count: 2 },
            },
        });
        this.writeText(
            "RP/texts/en_US.lang",
            "item.test:gem.name=Shiny Gem\ntile.test:ore.name=Gem Ore\nentity.test:golem.name=Stone Golem\n"
        );
        this.writeJson("RP/sounds/sound_definitions.json", {
            format_version: "1.20.20",
            sound_definitions: { "test:block.ore.break": {} },
        });
    }

    /**
     * Removes the temp project.
     */
    dispose(): void {
        fs.rmSync(this.projectRoot, { recursive: true, force: true });
    }
}
