import type {
    CatalogEntry,
    CatalogFact,
    EntityDefinition,
    ItemDefinition,
    PackCatalog,
    RecipeDescription,
} from "../Types/ContentGuideTypes";
import type GuideIssues from "./GuideIssues";
import Identifiers from "./Identifiers";
import ItemTables from "./ItemTables";
import PackReader from "./PackReader";
import RecipeDescriber from "./RecipeDescriber";

/**
 * Builds the catalog of items, entities, and sounds from the built packs.
 */
export default class PackScanner {
    /** Reader of the pack files. */
    private readonly reader: PackReader;

    /** Collector for every problem found. */
    private readonly issues: GuideIssues;

    /** Display names by identifier. */
    private readonly names = new Map<string, string>();

    /**
     * Creates a scanner for the Regolith working directory.
     *
     * @param workingDirectory - Directory that contains the `BP` and `RP` folders.
     * @param issues - Collector for every problem found.
     */
    constructor(workingDirectory: string, issues: GuideIssues) {
        this.issues = issues;
        this.reader = new PackReader(workingDirectory, issues);
    }

    /**
     * Scans both packs.
     *
     * @returns PackCatalog.
     *
     * @throws If a pack file is not valid JSON.
     */
    scan(): PackCatalog {
        const { reader } = this;
        const items = reader.readItemDefinitions();
        const entities = reader.readEntityDefinitions();
        const eggs = this.createSpawnEggs(entities, items);

        for (const definition of [...items.values(), ...entities, ...eggs]) {
            this.names.set(definition.identifier, definition.name);
        }

        const recipes = this.readRecipes();
        const lootTables = reader.readLootTables();
        const drops = this.findDrops([...items.values(), ...entities], lootTables);
        const trades = this.findTrades(entities);

        return {
            items: this.createItems([...items.values(), ...eggs], recipes, drops, trades),
            entities: this.createEntities(entities, lootTables),
            sounds: reader.readSounds(),
            vanillaEdits: this.createVanillaEdits(items, entities, recipes),
            hasJsonUi: reader.hasJsonUi(),
            uncertainSections: [...reader.uncertainSections],
        };
    }

    /**
     * Creates the spawn eggs that spawnable custom entities add.
     *
     * @param entities - Entity definitions.
     * @param items - Item definitions, which replace a generated egg with the same identifier.
     *
     * @returns Spawn egg definitions, hidden by default as in the requirements example.
     */
    private createSpawnEggs(entities: EntityDefinition[], items: Map<string, ItemDefinition>): ItemDefinition[] {
        return entities.flatMap((entity) => {
            const identifier = `${entity.identifier}_spawn_egg`;

            if (!entity.isSpawnable || Identifiers.isVanilla(entity.identifier) || items.has(identifier)) {
                return [];
            }

            const name = this.reader.lang.find(`item.spawn_egg.entity.${entity.identifier}.name`) ?? `${entity.name} Spawn Egg`;

            return [{ identifier, name, isInCreativeMenu: false, lootTables: [], isGeneratedEgg: true }];
        });
    }

    /**
     * Describes every recipe.
     *
     * @returns Recipe text by result identifier.
     */
    private readRecipes(): Map<string, RecipeDescription[]> {
        const describer = new RecipeDescriber((identifier) => this.nameOf(identifier));
        const recipes = new Map<string, RecipeDescription[]>();

        for (const file of this.reader.readBehaviorFolder("recipes", "items")) {
            const description = describer.describe(file.data);
            const unknownType = RecipeDescriber.findUnknownType(file.data);

            if (unknownType) {
                this.issues.warning(
                    this.reader.behaviorPath(file.relativePath),
                    `Recipe type "${unknownType}" is new to this filter, so the guide only says what it makes.`
                );
            }

            if (description) {
                for (const result of description.results) {
                    recipes.set(result, [...(recipes.get(result) ?? []), description]);
                }
            } else if (!(RecipeDescriber.NO_RESULT_TYPE in file.data)) {
                this.reader.reportSkipped(file.relativePath, "Has no recipe with a valid result.", "items");
            }
        }

        return recipes;
    }

    /**
     * Finds which blocks and entities drop each item. A block that drops itself is not listed.
     *
     * @param sources - Blocks and entities with loot tables.
     * @param lootTables - Parsed loot tables by path.
     *
     * @returns Source names by item identifier.
     */
    private findDrops(sources: (ItemDefinition | EntityDefinition)[], lootTables: Map<string, unknown>): Map<string, Set<string>> {
        const drops = new Map<string, Set<string>>();

        for (const source of sources) {
            for (const table of source.lootTables) {
                for (const item of ItemTables.lootItems(table, lootTables)) {
                    if (item !== source.identifier) {
                        drops.set(item, (drops.get(item) ?? new Set()).add(source.name));
                    }
                }
            }
        }

        return drops;
    }

    /**
     * Finds which entities trade each item.
     *
     * @param entities - Entity definitions.
     *
     * @returns Entity names by item identifier.
     */
    private findTrades(entities: EntityDefinition[]): Map<string, Set<string>> {
        const trades = new Map<string, Set<string>>();

        for (const entity of entities) {
            for (const table of entity.tradeTables) {
                for (const item of ItemTables.tradeItems(this.reader.readBehaviorFile(table))) {
                    trades.set(item, (trades.get(item) ?? new Set()).add(entity.name));
                }
            }
        }

        return trades;
    }

    /**
     * Creates the item entries, including vanilla items that gain a recipe.
     *
     * @param definitions - Items, blocks, and spawn eggs.
     * @param recipes - Recipe text by result identifier.
     * @param drops - Drop sources by item identifier.
     * @param trades - Trade sources by item identifier.
     *
     * @returns Catalog entries.
     */
    private createItems(
        definitions: ItemDefinition[],
        recipes: Map<string, RecipeDescription[]>,
        drops: Map<string, Set<string>>,
        trades: Map<string, Set<string>>
    ): CatalogEntry[] {
        const defined = new Map(definitions.map((definition) => [definition.identifier, definition]));
        const identifiers = new Set([...defined.keys(), ...recipes.keys()]);

        return [...identifiers].map((identifier) => {
            const definition = defined.get(identifier);
            const itemRecipes = recipes.get(identifier) ?? [];
            const itemDrops = [...(drops.get(identifier) ?? [])];
            const itemTrades = [...(trades.get(identifier) ?? [])];
            const isVanillaRecipeOnly = !definition && Identifiers.isVanilla(identifier);
            const facts: CatalogFact[] =
                itemRecipes.length > 0
                    ? itemRecipes.map((recipe) => ({ text: recipe.text, isTag: false, recipe: recipe.grid }))
                    : [{ text: "Cannot be crafted", isTag: true, recipe: null }];

            if (itemDrops.length > 0) {
                facts.push({ text: `Dropped by ${itemDrops.sort().join(", ")}`, isTag: false, recipe: null });
            }

            if (itemTrades.length > 0) {
                facts.push({ text: `Traded by ${itemTrades.sort().join(", ")}`, isTag: false, recipe: null });
            }

            return {
                ...(definition?.isGeneratedEgg || isVanillaRecipeOnly ? { isNotesOptional: true } : {}),
                identifier,
                name: this.nameOf(identifier),
                playerAccessible:
                    definition?.isInCreativeMenu === true || itemRecipes.length > 0 || itemDrops.length > 0 || itemTrades.length > 0,
                facts,
            };
        });
    }

    /**
     * Creates the entity entries.
     *
     * @param entities - Entity definitions.
     * @param lootTables - Parsed loot tables by path.
     *
     * @returns Catalog entries.
     */
    private createEntities(entities: EntityDefinition[], lootTables: Map<string, unknown>): CatalogEntry[] {
        const spawnRules = this.reader.readSpawnRuleIdentifiers();

        return entities.map((entity) => {
            const spawnsNaturally = spawnRules.has(entity.identifier);
            const drops = [...new Set(entity.lootTables.flatMap((table) => ItemTables.lootItems(table, lootTables)))];
            const tags = [
                ...(Identifiers.isVanilla(entity.identifier) ? ["Edits the vanilla entity"] : []),
                ...(spawnsNaturally ? ["Spawns naturally"] : []),
                ...(entity.isSpawnable ? ["Has a spawn egg"] : []),
                ...(entity.isProjectile ? ["Projectile"] : []),
                ...(entity.isRideable ? ["Can be ridden"] : []),
                ...(!spawnsNaturally && !entity.isSpawnable && !entity.isProjectile ? ["No spawn egg or spawn rule"] : []),
            ];
            const facts: CatalogFact[] = [
                ...tags.map((text) => ({ text, isTag: true, recipe: null })),
                ...(drops.length > 0
                    ? [{ text: `Drops ${drops.map((item) => this.nameOf(item)).join(", ")}`, isTag: false, recipe: null }]
                    : []),
            ];

            return {
                identifier: entity.identifier,
                name: entity.name,
                playerAccessible: spawnsNaturally || entity.isSpawnable,
                facts,
            };
        });
    }

    /**
     * Lists the vanilla content that the behavior pack edits.
     *
     * @param items - Item and block definitions.
     * @param entities - Entity definitions.
     * @param recipes - Recipe text by result identifier.
     *
     * @returns Guide lines. Backticks mark identifiers.
     */
    private createVanillaEdits(
        items: Map<string, ItemDefinition>,
        entities: EntityDefinition[],
        recipes: Map<string, RecipeDescription[]>
    ): string[] {
        const describe = (identifier: string): string => `${this.nameOf(identifier)} (\`${identifier}\`)`;
        const isVanilla = (identifier: string): boolean => Identifiers.isVanilla(identifier);

        return [
            ...entities
                .map((entity) => entity.identifier)
                .filter(isVanilla)
                .map((identifier) => `Edits the vanilla entity ${describe(identifier)}`),
            ...[...items.keys()].filter(isVanilla).map((identifier) => `Edits the vanilla item or block ${describe(identifier)}`),
            ...[...recipes.keys()].filter(isVanilla).map((identifier) => `Adds a recipe for ${describe(identifier)}`),
        ];
    }

    /**
     * Finds the display name of an item or entity.
     *
     * @param identifier - Namespaced identifier.
     *
     * @returns Display name.
     */
    private nameOf(identifier: string): string {
        return this.names.get(identifier) ?? Identifiers.humanize(identifier);
    }
}
