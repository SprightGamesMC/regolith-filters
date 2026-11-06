import type { RecipeDescription, RecipeGrid } from "../Types/ContentGuideTypes";
import Identifiers from "./Identifiers";

/**
 * Writes one line of readable text for a recipe file.
 */
export default class RecipeDescriber {
    /** Symbol for an empty slot in a written pattern, because spaces are hard to see. */
    static readonly EMPTY_SLOT = ".";

    /** Recipe types that the filter describes. */
    static readonly KNOWN_TYPES: readonly string[] = [
        "minecraft:recipe_shaped",
        "minecraft:recipe_shapeless",
        "minecraft:recipe_furnace",
        "minecraft:recipe_brewing_mix",
        "minecraft:recipe_brewing_container",
        "minecraft:recipe_smithing_transform",
    ];

    /** Recipe type that changes an item and makes no new one, so it has no result. */
    static readonly NO_RESULT_TYPE = "minecraft:recipe_smithing_trim";

    /** Key in a recipe file that is not a recipe. */
    static readonly FORMAT_KEY = "format_version";

    /** Tag of crafting table recipes. The inventory crafting grid also uses them when they fit in it. */
    static readonly CRAFTING_TABLE_TAG = "crafting_table";

    /** Width and height of the inventory crafting grid. */
    static readonly INVENTORY_GRID_SIZE = 2;

    /** Station name of the inventory crafting grid. */
    static readonly INVENTORY_STATION = "Inventory";

    /** Width of the crafting table grid. */
    static readonly TABLE_GRID_SIZE = 3;

    /** Symbols for shapeless ingredients when no letter of the name is free. */
    static readonly FALLBACK_SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    /** Finds the display name of an item. */
    private readonly nameOf: (identifier: string) => string;

    /**
     * Creates a describer.
     *
     * @param nameOf - Finds the display name of an item.
     */
    constructor(nameOf: (identifier: string) => string) {
        this.nameOf = nameOf;
    }

    /**
     * Finds a recipe type that is new to this filter, such as one from a future Minecraft version.
     *
     * @param file - Parsed recipe file.
     *
     * @returns Recipe type, or `null` when the file has none.
     */
    static findUnknownType(file: Record<string, unknown>): string | null {
        const known = [...this.KNOWN_TYPES, this.NO_RESULT_TYPE, this.FORMAT_KEY];

        return Object.keys(file).find((key) => !known.includes(key)) ?? null;
    }

    /**
     * Describes one recipe file.
     *
     * @param file - Parsed recipe file.
     *
     * @returns RecipeDescription, or `null` when the file has no recipe that makes an item.
     */
    describe(file: Record<string, unknown>): RecipeDescription | null {
        const shaped = file["minecraft:recipe_shaped"] as Record<string, unknown> | undefined;
        const shapeless = file["minecraft:recipe_shapeless"] as Record<string, unknown> | undefined;
        const furnace = file["minecraft:recipe_furnace"] as Record<string, unknown> | undefined;
        const brewing = (file["minecraft:recipe_brewing_mix"] ?? file["minecraft:recipe_brewing_container"]) as
            Record<string, unknown> | undefined;
        const smithing = file["minecraft:recipe_smithing_transform"] as Record<string, unknown> | undefined;

        if (shaped) {
            return this.finish(shaped.result, this.describeShaped(shaped), this.createGrid(shaped));
        }

        if (shapeless) {
            return this.finish(shapeless.result, this.describeShapeless(shapeless), this.createShapelessGrid(shapeless));
        }

        if (furnace) {
            return this.finish(furnace.output, `Smelted in ${this.describeTags(furnace)} from ${this.ingredientName(furnace.input)}`);
        }

        if (brewing) {
            const text = `Brewed from ${this.ingredientName(brewing.input)} with ${this.ingredientName(brewing.reagent)}`;

            return this.finish(brewing.output, text);
        }

        if (smithing) {
            const parts = [smithing.base, smithing.addition, smithing.template].map((part) => this.ingredientName(part));

            return this.finish(smithing.result, `Smithed in ${this.describeTags(smithing)} from ${parts.join(", ")}`);
        }

        return this.describeUnknownType(file);
    }

    /**
     * Describes a recipe type that is new to this filter, so its result still counts as craftable.
     *
     * @param file - Parsed recipe file.
     *
     * @returns RecipeDescription, or `null` when the file has no such type or no result.
     */
    private describeUnknownType(file: Record<string, unknown>): RecipeDescription | null {
        const type = RecipeDescriber.findUnknownType(file);

        if (!type) {
            return null;
        }

        const body = file[type] as { result?: unknown; output?: unknown } | null;

        return this.finish(body?.result ?? body?.output, `Made with a ${Identifiers.humanize(type.replace("recipe_", ""))} recipe`);
    }

    /**
     * Describes a shaped recipe with its pattern and key.
     *
     * @param recipe - Recipe body.
     *
     * @returns Recipe text.
     */
    private describeShaped(recipe: Record<string, unknown>): string {
        const rows = Array.isArray(recipe.pattern) ? recipe.pattern.map((row) => String(row)) : [];
        const pattern = rows.map((row) => row.replaceAll(" ", RecipeDescriber.EMPTY_SLOT)).join(" / ");
        const key = Object.entries((recipe.key ?? {}) as Record<string, unknown>).map(
            ([symbol, ingredient]) => `${symbol} = ${this.ingredientName(ingredient)}`
        );
        const hasEmptySlot = rows.some((row) => row.includes(" "));
        const legend = [...key, ...(hasEmptySlot ? [`${RecipeDescriber.EMPTY_SLOT} = empty`] : [])].join(", ");

        return `Crafted in ${this.describeTags(recipe)}: pattern \`${pattern}\`, ${legend}`;
    }

    /**
     * Creates the crafting grid of a shaped recipe.
     *
     * @param recipe - Recipe body.
     *
     * @returns RecipeGrid.
     */
    private createGrid(recipe: Record<string, unknown>): RecipeGrid {
        return {
            station: this.describeTags(recipe),
            rows: Array.isArray(recipe.pattern) ? Array.from(recipe.pattern, (row) => String(row)) : [],
            legend: Object.entries((recipe.key ?? {}) as Record<string, unknown>).map(([symbol, ingredient]) => ({
                symbol,
                name: this.ingredientName(ingredient),
            })),
            makes: this.findResultCount(recipe.result),
        };
    }

    /**
     * Creates the crafting grid of a shapeless recipe. The ingredients fill the slots in order, as in the recipe book.
     *
     * @param recipe - Recipe body.
     *
     * @returns RecipeGrid, or `null` when it is not a crafting table recipe or its ingredients do not fit in one.
     */
    private createShapelessGrid(recipe: Record<string, unknown>): RecipeGrid | null {
        const slotNames = this.listSlotNames(recipe);
        const tableSize = RecipeDescriber.TABLE_GRID_SIZE;
        const isTableRecipe = Array.isArray(recipe.tags) && recipe.tags.includes(RecipeDescriber.CRAFTING_TABLE_TAG);

        if (!isTableRecipe || slotNames.length === 0 || slotNames.length > tableSize * tableSize) {
            return null;
        }

        const legend: { symbol: string; name: string }[] = [];

        for (const name of new Set(slotNames)) {
            legend.push({ symbol: this.chooseSymbol(name, legend), name });
        }

        const symbols = slotNames.map((name) => legend.find((entry) => entry.name === name)?.symbol ?? " ");
        const width = this.fitsInventoryGrid(recipe) ? RecipeDescriber.INVENTORY_GRID_SIZE : tableSize;
        const rows: string[] = [];

        for (let start = 0; start < symbols.length; start += width) {
            rows.push(symbols.slice(start, start + width).join(""));
        }

        return { station: this.describeTags(recipe), rows, legend, makes: this.findResultCount(recipe.result) };
    }

    /**
     * Lists the ingredient name of each slot of a shapeless recipe. An ingredient with a count uses that many slots.
     *
     * @param recipe - Recipe body.
     *
     * @returns Ingredient names.
     */
    private listSlotNames(recipe: Record<string, unknown>): string[] {
        if (recipe.ingredients === undefined) {
            return [];
        }

        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [recipe.ingredients];

        return ingredients.flatMap((ingredient: unknown) => {
            const count = (ingredient as { count?: unknown } | null)?.count;

            return Array.from({ length: typeof count === "number" ? count : 1 }, () => this.ingredientName(ingredient));
        });
    }

    /**
     * Chooses a grid symbol for an ingredient. It uses the first free letter of the name.
     *
     * @param name - Ingredient name.
     * @param legend - Symbols that are already used.
     *
     * @returns Symbol.
     */
    private chooseSymbol(name: string, legend: { symbol: string }[]): string {
        const used = new Set(legend.map((entry) => entry.symbol));
        const letters = [...name.toUpperCase().replace(/[^A-Z]/g, ""), ...RecipeDescriber.FALLBACK_SYMBOLS];

        return letters.find((letter) => !used.has(letter)) ?? "?";
    }

    /**
     * Finds the count of the crafted item when the recipe makes more than one.
     *
     * @param rawResults - Raw recipe result value.
     *
     * @returns Count, or `null` when the recipe makes one item.
     */
    private findResultCount(rawResults: unknown): number | null {
        const firstResult: unknown = Array.isArray(rawResults) ? rawResults[0] : rawResults;
        const count = (firstResult as { count?: unknown } | null)?.count;

        return typeof count === "number" && count > 1 ? count : null;
    }

    /**
     * Describes a shapeless recipe and adds repeated ingredients together.
     *
     * @param recipe - Recipe body.
     *
     * @returns Recipe text.
     */
    private describeShapeless(recipe: Record<string, unknown>): string {
        const counts = new Map<string, number>();
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [recipe.ingredients];

        for (const ingredient of ingredients) {
            const name = this.ingredientName(ingredient);
            const count = (ingredient as { count?: unknown } | null)?.count;

            counts.set(name, (counts.get(name) ?? 0) + (typeof count === "number" ? count : 1));
        }

        const parts = [...counts].map(([name, count]) => `${count} ${name}`);

        return `Crafted in ${this.describeTags(recipe)} from ${parts.join(", ")}`;
    }

    /**
     * Creates the description from the recipe text and its results. The first result is the crafted item.
     *
     * @param rawResults - Raw recipe result value.
     * @param text - Recipe text without the result count.
     * @param grid - Crafting grid of a shaped recipe.
     *
     * @returns RecipeDescription, or `null` when the recipe has no result.
     */
    private finish(rawResults: unknown, text: string, grid: RecipeGrid | null = null): RecipeDescription | null {
        const [result, ...returnedItems] = (Array.isArray(rawResults) ? rawResults : [rawResults]).flatMap((rawResult) =>
            this.resultIdentifier(rawResult)
        );

        if (result === undefined) {
            return null;
        }

        const count = this.findResultCount(rawResults);
        const countText = count === null ? "" : `, makes ${count}`;
        // Minecraft gives later results to the player as well, such as a container that an ingredient used
        const returnText = returnedItems.length === 0 ? "" : `, returns ${returnedItems.map((item) => this.nameOf(item)).join(", ")}`;

        return { result, text: `${text}${countText}${returnText}`, grid };
    }

    /**
     * Reads the identifier of one recipe result.
     *
     * @param result - Raw result as a string or object.
     *
     * @returns Identifier in an array, empty when the result is invalid.
     */
    private resultIdentifier(result: unknown): string[] {
        const item = typeof result === "string" ? result : (result as { item?: unknown } | null)?.item;

        return typeof item === "string" ? [Identifiers.base(item)] : [];
    }

    /**
     * Writes the stations of a recipe.
     *
     * @param recipe - Recipe body.
     *
     * @returns Station names such as `Crafting Table`.
     */
    private describeTags(recipe: Record<string, unknown>): string {
        const tags = Array.isArray(recipe.tags) ? recipe.tags.filter((tag): tag is string => typeof tag === "string") : [];

        if (tags.length === 0) {
            return "Unknown Station";
        }

        const stations = tags.map((tag) => Identifiers.humanize(tag)).join(", ");
        const isInventoryRecipe = tags.includes(RecipeDescriber.CRAFTING_TABLE_TAG) && this.fitsInventoryGrid(recipe);

        return isInventoryRecipe ? `${RecipeDescriber.INVENTORY_STATION} or ${stations}` : stations;
    }

    /**
     * Checks whether a crafting recipe fits in the inventory crafting grid.
     *
     * @param recipe - Recipe body.
     *
     * @returns `true` when the pattern or the ingredients fit in the grid.
     */
    private fitsInventoryGrid(recipe: Record<string, unknown>): boolean {
        const size = RecipeDescriber.INVENTORY_GRID_SIZE;

        if (Array.isArray(recipe.pattern)) {
            const rows = recipe.pattern.map((row) => String(row));

            return rows.length <= size && rows.every((row) => row.length <= size);
        }

        const slotCount = this.listSlotNames(recipe).length;

        return slotCount > 0 && slotCount <= size * size;
    }

    /**
     * Writes the name of one ingredient.
     *
     * @param ingredient - Raw ingredient as a string or an object with `item` or `tag`.
     *
     * @returns Display name.
     */
    private ingredientName(ingredient: unknown): string {
        if (typeof ingredient === "string") {
            return this.nameOf(Identifiers.base(ingredient));
        }

        const { item, tag } = (ingredient ?? {}) as { item?: unknown; tag?: unknown };

        if (typeof item === "string") {
            return this.nameOf(Identifiers.base(item));
        }

        return typeof tag === "string" ? `Any ${Identifiers.humanize(tag)}` : "Unknown Item";
    }
}
