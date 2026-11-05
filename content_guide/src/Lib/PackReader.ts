import type { CatalogEntry, CatalogSection, EntityDefinition, ItemDefinition, PackFile } from "../Types/ContentGuideTypes";
import type GuideIssues from "./GuideIssues";
import fs from "fs";
import path from "path";
import Identifiers from "./Identifiers";
import JsonTools from "./JsonTools";
import LangFile from "./LangFile";
import PackFiles from "./PackFiles";

/**
 * Reads definitions from the built packs and warns about each file that the guide cannot use.
 */
export default class PackReader {
    /** Behavior pack folder in the working directory. */
    static readonly BEHAVIOR_PACK = "BP";

    /** Resource pack folder in the working directory. */
    static readonly RESOURCE_PACK = "RP";

    /** Language file that supplies display names. */
    static readonly LANG_FILE = "texts/en_US.lang";

    /** Sound definitions file in the resource pack. */
    static readonly SOUND_FILE = "sounds/sound_definitions.json";

    /** Key in the sound definitions file that is not a sound. */
    static readonly SOUND_FORMAT_KEY = "format_version";

    /** Creative menu category of content that is hidden from the menu. */
    static readonly HIDDEN_CATEGORY = "none";

    /** Folders and body keys of items and blocks. */
    static readonly ITEM_SOURCES: readonly { folder: string; key: string }[] = [
        { folder: "items", key: "minecraft:item" },
        { folder: "blocks", key: "minecraft:block" },
    ];

    /** Components that name a trade table. */
    static readonly TRADE_COMPONENTS: readonly string[] = ["minecraft:trade_table", "minecraft:economy_trade_table"];

    /** Display names from the resource pack. */
    readonly lang: LangFile;

    /** Sections that may be missing content, because a pack is absent or a file was skipped. */
    readonly uncertainSections = new Set<CatalogSection>();

    /** Absolute behavior pack root. */
    private readonly behaviorPack: string;

    /** Absolute resource pack root. */
    private readonly resourcePack: string;

    /** Collector for every problem found. */
    private readonly issues: GuideIssues;

    /**
     * Creates a reader for the working directory.
     *
     * @param workingDirectory - Directory that contains the `BP` and `RP` folders.
     * @param issues - Collector for every problem found.
     */
    constructor(workingDirectory: string, issues: GuideIssues) {
        this.issues = issues;
        this.behaviorPack = path.join(workingDirectory, PackReader.BEHAVIOR_PACK);
        this.resourcePack = path.join(workingDirectory, PackReader.RESOURCE_PACK);
        this.lang = LangFile.load(path.join(this.resourcePack, PackReader.LANG_FILE));

        if (!fs.existsSync(this.behaviorPack)) {
            this.uncertainSections.add("items").add("entities");
        }

        if (!fs.existsSync(this.resourcePack)) {
            this.uncertainSections.add("sounds");
        }
    }

    /**
     * Reads a behavior pack folder and reports each file that is not a JSON object.
     *
     * @param folder - Folder relative to the pack root.
     * @param section - Section that loses content when a file is skipped, if any.
     *
     * @returns Pack files.
     *
     * @throws If a file is not valid JSON.
     */
    readBehaviorFolder(folder: string, section: CatalogSection | null): PackFile[] {
        return PackFiles.readFolder(this.behaviorPack, folder, (relativePath) =>
            this.reportSkipped(relativePath, "Is not a JSON object.", section)
        );
    }

    /**
     * Reads one behavior pack file.
     *
     * @param relativePath - File path relative to the pack root.
     *
     * @returns Parsed object, or `null` when the file does not exist or is not an object.
     *
     * @throws If the file is not valid JSON.
     */
    readBehaviorFile(relativePath: string): Record<string, unknown> | null {
        return PackFiles.readFile(path.join(this.behaviorPack, relativePath));
    }

    /**
     * Warns about a behavior pack file that the guide cannot use.
     *
     * @param relativePath - File path relative to the behavior pack.
     * @param problem - What is wrong with the file.
     * @param section - Section that loses content, if any.
     */
    reportSkipped(relativePath: string, problem: string, section: CatalogSection | null): void {
        this.issues.warning(this.behaviorPath(relativePath), `${problem} The guide skips this file.`);

        if (section) {
            this.uncertainSections.add(section);
        }
    }

    /**
     * Writes the path of a behavior pack file for messages.
     *
     * @param relativePath - File path relative to the behavior pack.
     *
     * @returns Path that starts with the pack folder.
     */
    behaviorPath(relativePath: string): string {
        return `${PackReader.BEHAVIOR_PACK}/${relativePath}`;
    }

    /**
     * Reads items and blocks, merging an item and block that share an identifier.
     *
     * @returns Definitions by identifier.
     */
    readItemDefinitions(): Map<string, ItemDefinition> {
        const definitions = new Map<string, ItemDefinition>();

        for (const { folder, key } of PackReader.ITEM_SOURCES) {
            for (const file of this.readBehaviorFolder(folder, "items")) {
                const body = file.data[key] as Record<string, unknown> | undefined;
                const definition = body ? this.readItemDefinition(body) : null;

                if (!definition) {
                    this.reportSkipped(file.relativePath, `Has no "${key}" with a valid identifier.`, "items");
                    continue;
                }

                const existing = definitions.get(definition.identifier);

                definitions.set(definition.identifier, {
                    ...definition,
                    name: existing?.name ?? definition.name,
                    isInCreativeMenu: definition.isInCreativeMenu || existing?.isInCreativeMenu === true,
                    lootTables: [...(existing?.lootTables ?? []), ...definition.lootTables],
                });
            }
        }

        return definitions;
    }

    /**
     * Reads every entity definition.
     *
     * @returns Entity definitions.
     */
    readEntityDefinitions(): EntityDefinition[] {
        return this.readBehaviorFolder("entities", "entities").flatMap((file) => {
            const body = file.data["minecraft:entity"] as Record<string, unknown> | undefined;
            const description = (body?.description ?? {}) as { is_spawnable?: unknown };
            const identifier = this.readIdentifier(description);

            if (!body || !identifier) {
                this.reportSkipped(file.relativePath, 'Has no "minecraft:entity" with a valid identifier.', "entities");
                return [];
            }

            const groups = Object.values((body.component_groups ?? {}) as Record<string, Record<string, unknown>>);
            const componentSets = [(body.components ?? {}) as Record<string, unknown>, ...groups];

            return [
                {
                    identifier,
                    name: this.lang.find(`entity.${identifier}.name`) ?? Identifiers.humanize(identifier),
                    isSpawnable: description.is_spawnable === true,
                    isProjectile: componentSets.some((components) => "minecraft:projectile" in components),
                    isRideable: componentSets.some((components) => "minecraft:rideable" in components),
                    lootTables: this.findLootTables(componentSets),
                    tradeTables: this.findTradeTables(componentSets),
                },
            ];
        });
    }

    /**
     * Reads every loot table.
     *
     * @returns Parsed loot tables by path.
     */
    readLootTables(): Map<string, unknown> {
        return new Map(this.readBehaviorFolder("loot_tables", null).map((file) => [file.relativePath, file.data]));
    }

    /**
     * Reads the entities that have spawn rules.
     *
     * @returns Entity identifiers.
     */
    readSpawnRuleIdentifiers(): Set<string> {
        return new Set(
            this.readBehaviorFolder("spawn_rules", null).flatMap((file) => {
                const body = file.data["minecraft:spawn_rules"] as { description?: unknown } | undefined;
                const identifier = this.readIdentifier(body?.description);

                if (!identifier) {
                    this.reportSkipped(file.relativePath, 'Has no "minecraft:spawn_rules" with a valid identifier.', null);
                    return [];
                }

                return [identifier];
            })
        );
    }

    /**
     * Reads every sound definition.
     *
     * @returns Catalog entries.
     *
     * @throws If the sound definitions file is not valid JSON.
     */
    readSounds(): CatalogEntry[] {
        const file = PackFiles.readFile(path.join(this.resourcePack, PackReader.SOUND_FILE)) ?? {};
        const definitions = file.sound_definitions ?? file;

        if (!JsonTools.isObject(definitions)) {
            this.issues.warning(
                `${PackReader.RESOURCE_PACK}/${PackReader.SOUND_FILE}`,
                '"sound_definitions" must be an object. The guide lists no sounds.'
            );
            this.uncertainSections.add("sounds");
            return [];
        }

        return Object.keys(definitions)
            .filter((key) => key !== PackReader.SOUND_FORMAT_KEY)
            .map((identifier) => ({
                identifier,
                name: Identifiers.humanize(identifier),
                playerAccessible: true,
                facts: [],
                isNotesOptional: true,
            }));
    }

    /**
     * Checks for a resource pack UI folder.
     *
     * @returns `true` if the folder exists, `false` otherwise.
     */
    hasJsonUi(): boolean {
        return fs.existsSync(path.join(this.resourcePack, "ui"));
    }

    /**
     * Reads one item or block body.
     *
     * @param body - Body of the `minecraft:item` or `minecraft:block` key.
     *
     * @returns ItemDefinition, or `null` when the body has no identifier.
     */
    private readItemDefinition(body: Record<string, unknown>): ItemDefinition | null {
        const description = (body.description ?? {}) as { menu_category?: { category?: unknown } };
        const identifier = this.readIdentifier(description);

        if (!identifier) {
            return null;
        }

        const permutations = Array.isArray(body.permutations) ? (body.permutations as { components?: Record<string, unknown> }[]) : [];
        const componentSets = [(body.components ?? {}) as Record<string, unknown>, ...permutations.map((entry) => entry.components ?? {})];
        const displayName = (componentSets[0]["minecraft:display_name"] as { value?: unknown } | undefined)?.value;
        const category = description.menu_category?.category;

        return {
            identifier,
            name: this.resolveItemName(identifier, typeof displayName === "string" ? displayName : null),
            isInCreativeMenu: typeof category === "string" && category !== PackReader.HIDDEN_CATEGORY,
            lootTables: this.findLootTables(componentSets),
        };
    }

    /**
     * Reads the identifier in a description.
     *
     * @param description - Raw description value.
     *
     * @returns Identifier, or `null` when it is missing or blank.
     */
    private readIdentifier(description: unknown): string | null {
        const identifier = (description as { identifier?: unknown } | null | undefined)?.identifier;

        return typeof identifier === "string" && identifier.trim() !== "" ? identifier : null;
    }

    /**
     * Finds the display name of an item or block.
     *
     * @param identifier - Item identifier.
     * @param displayName - Value of the display name component, which is a language key or plain text.
     *
     * @returns Display name.
     */
    private resolveItemName(identifier: string, displayName: string | null): string {
        const keys = [`item.${identifier}.name`, `item.${identifier}`, `tile.${identifier}.name`];
        const translated = this.lang.find(...(displayName ? [displayName] : []), ...keys);

        return translated ?? displayName ?? Identifiers.humanize(identifier);
    }

    /**
     * Finds the loot tables that components name.
     *
     * @param componentSets - Component objects.
     *
     * @returns Loot table paths relative to the pack root.
     */
    private findLootTables(componentSets: Record<string, unknown>[]): string[] {
        return componentSets.flatMap((components) => {
            const loot = components["minecraft:loot"] as string | { table?: unknown } | undefined;
            const table = typeof loot === "string" ? loot : loot?.table;

            return typeof table === "string" ? [table.replaceAll("\\", "/")] : [];
        });
    }

    /**
     * Finds the trade tables that components name.
     *
     * @param componentSets - Component objects.
     *
     * @returns Trade table paths relative to the pack root.
     */
    private findTradeTables(componentSets: Record<string, unknown>[]): string[] {
        return componentSets.flatMap((components) =>
            PackReader.TRADE_COMPONENTS.flatMap((key) => {
                const table = (components[key] as { table?: unknown } | undefined)?.table;

                return typeof table === "string" ? [table.replaceAll("\\", "/")] : [];
            })
        );
    }
}
