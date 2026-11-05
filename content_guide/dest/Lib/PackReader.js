"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const Identifiers_1 = __importDefault(require("./Identifiers"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
const LangFile_1 = __importDefault(require("./LangFile"));
const PackFiles_1 = __importDefault(require("./PackFiles"));
/**
 * Reads definitions from the built packs and warns about each file that the guide cannot use.
 */
class PackReader {
    /** Behavior pack folder in the working directory. */
    static BEHAVIOR_PACK = "BP";
    /** Resource pack folder in the working directory. */
    static RESOURCE_PACK = "RP";
    /** Language file that supplies display names. */
    static LANG_FILE = "texts/en_US.lang";
    /** Sound definitions file in the resource pack. */
    static SOUND_FILE = "sounds/sound_definitions.json";
    /** Key in the sound definitions file that is not a sound. */
    static SOUND_FORMAT_KEY = "format_version";
    /** Creative menu category of content that is hidden from the menu. */
    static HIDDEN_CATEGORY = "none";
    /** Folders and body keys of items and blocks. */
    static ITEM_SOURCES = [
        { folder: "items", key: "minecraft:item" },
        { folder: "blocks", key: "minecraft:block" },
    ];
    /** Components that name a trade table. */
    static TRADE_COMPONENTS = ["minecraft:trade_table", "minecraft:economy_trade_table"];
    /** Display names from the resource pack. */
    lang;
    /** Sections that may be missing content, because a pack is absent or a file was skipped. */
    uncertainSections = new Set();
    /** Absolute behavior pack root. */
    behaviorPack;
    /** Absolute resource pack root. */
    resourcePack;
    /** Collector for every problem found. */
    issues;
    /**
     * Creates a reader for the working directory.
     *
     * @param workingDirectory - Directory that contains the `BP` and `RP` folders.
     * @param issues - Collector for every problem found.
     */
    constructor(workingDirectory, issues) {
        this.issues = issues;
        this.behaviorPack = path_1.default.join(workingDirectory, PackReader.BEHAVIOR_PACK);
        this.resourcePack = path_1.default.join(workingDirectory, PackReader.RESOURCE_PACK);
        this.lang = LangFile_1.default.load(path_1.default.join(this.resourcePack, PackReader.LANG_FILE));
        if (!fs_1.default.existsSync(this.behaviorPack)) {
            this.uncertainSections.add("items").add("entities");
        }
        if (!fs_1.default.existsSync(this.resourcePack)) {
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
    readBehaviorFolder(folder, section) {
        return PackFiles_1.default.readFolder(this.behaviorPack, folder, (relativePath) => this.reportSkipped(relativePath, "Is not a JSON object.", section));
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
    readBehaviorFile(relativePath) {
        return PackFiles_1.default.readFile(path_1.default.join(this.behaviorPack, relativePath));
    }
    /**
     * Warns about a behavior pack file that the guide cannot use.
     *
     * @param relativePath - File path relative to the behavior pack.
     * @param problem - What is wrong with the file.
     * @param section - Section that loses content, if any.
     */
    reportSkipped(relativePath, problem, section) {
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
    behaviorPath(relativePath) {
        return `${PackReader.BEHAVIOR_PACK}/${relativePath}`;
    }
    /**
     * Reads items and blocks, merging an item and block that share an identifier.
     *
     * @returns Definitions by identifier.
     */
    readItemDefinitions() {
        const definitions = new Map();
        for (const { folder, key } of PackReader.ITEM_SOURCES) {
            for (const file of this.readBehaviorFolder(folder, "items")) {
                const body = file.data[key];
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
    readEntityDefinitions() {
        return this.readBehaviorFolder("entities", "entities").flatMap((file) => {
            const body = file.data["minecraft:entity"];
            const description = (body?.description ?? {});
            const identifier = this.readIdentifier(description);
            if (!body || !identifier) {
                this.reportSkipped(file.relativePath, 'Has no "minecraft:entity" with a valid identifier.', "entities");
                return [];
            }
            const groups = Object.values((body.component_groups ?? {}));
            const componentSets = [(body.components ?? {}), ...groups];
            return [
                {
                    identifier,
                    name: this.lang.find(`entity.${identifier}.name`) ?? Identifiers_1.default.humanize(identifier),
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
    readLootTables() {
        return new Map(this.readBehaviorFolder("loot_tables", null).map((file) => [file.relativePath, file.data]));
    }
    /**
     * Reads the entities that have spawn rules.
     *
     * @returns Entity identifiers.
     */
    readSpawnRuleIdentifiers() {
        return new Set(this.readBehaviorFolder("spawn_rules", null).flatMap((file) => {
            const body = file.data["minecraft:spawn_rules"];
            const identifier = this.readIdentifier(body?.description);
            if (!identifier) {
                this.reportSkipped(file.relativePath, 'Has no "minecraft:spawn_rules" with a valid identifier.', null);
                return [];
            }
            return [identifier];
        }));
    }
    /**
     * Reads every sound definition.
     *
     * @returns Catalog entries.
     *
     * @throws If the sound definitions file is not valid JSON.
     */
    readSounds() {
        const file = PackFiles_1.default.readFile(path_1.default.join(this.resourcePack, PackReader.SOUND_FILE)) ?? {};
        const definitions = file.sound_definitions ?? file;
        if (!JsonTools_1.default.isObject(definitions)) {
            this.issues.warning(`${PackReader.RESOURCE_PACK}/${PackReader.SOUND_FILE}`, '"sound_definitions" must be an object. The guide lists no sounds.');
            this.uncertainSections.add("sounds");
            return [];
        }
        return Object.keys(definitions)
            .filter((key) => key !== PackReader.SOUND_FORMAT_KEY)
            .map((identifier) => ({
            identifier,
            name: Identifiers_1.default.humanize(identifier),
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
    hasJsonUi() {
        return fs_1.default.existsSync(path_1.default.join(this.resourcePack, "ui"));
    }
    /**
     * Reads one item or block body.
     *
     * @param body - Body of the `minecraft:item` or `minecraft:block` key.
     *
     * @returns ItemDefinition, or `null` when the body has no identifier.
     */
    readItemDefinition(body) {
        const description = (body.description ?? {});
        const identifier = this.readIdentifier(description);
        if (!identifier) {
            return null;
        }
        const permutations = Array.isArray(body.permutations) ? body.permutations : [];
        const componentSets = [(body.components ?? {}), ...permutations.map((entry) => entry.components ?? {})];
        const displayName = componentSets[0]["minecraft:display_name"]?.value;
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
    readIdentifier(description) {
        const identifier = description?.identifier;
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
    resolveItemName(identifier, displayName) {
        const keys = [`item.${identifier}.name`, `item.${identifier}`, `tile.${identifier}.name`];
        const translated = this.lang.find(...(displayName ? [displayName] : []), ...keys);
        return translated ?? displayName ?? Identifiers_1.default.humanize(identifier);
    }
    /**
     * Finds the loot tables that components name.
     *
     * @param componentSets - Component objects.
     *
     * @returns Loot table paths relative to the pack root.
     */
    findLootTables(componentSets) {
        return componentSets.flatMap((components) => {
            const loot = components["minecraft:loot"];
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
    findTradeTables(componentSets) {
        return componentSets.flatMap((components) => PackReader.TRADE_COMPONENTS.flatMap((key) => {
            const table = components[key]?.table;
            return typeof table === "string" ? [table.replaceAll("\\", "/")] : [];
        }));
    }
}
exports.default = PackReader;
