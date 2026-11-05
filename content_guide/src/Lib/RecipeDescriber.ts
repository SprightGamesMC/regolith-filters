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
            return this.finish(shapeless.result, this.describeShapeless(shapeless));
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
     * Finds the count of a result that makes more than one item.
     *
     * @param rawResults - Raw recipe result value.
     *
     * @returns Count, or `null` when the recipe makes one item.
     */
    private findResultCount(rawResults: unknown): number | null {
        const counts = (Array.isArray(rawResults) ? rawResults : [rawResults]).map(
            (result) => (result as { count?: unknown } | null)?.count
        );
        const count = counts.find((value) => typeof value === "number" && value > 1);

        return typeof count === "number" ? count : null;
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
     * Creates the description from the recipe text and its results.
     *
     * @param rawResults - Raw recipe result value.
     * @param text - Recipe text without the result count.
     * @param grid - Crafting grid of a shaped recipe.
     *
     * @returns RecipeDescription, or `null` when the recipe has no result.
     */
    private finish(rawResults: unknown, text: string, grid: RecipeGrid | null = null): RecipeDescription | null {
        const results = (Array.isArray(rawResults) ? rawResults : [rawResults]).flatMap((result) => this.resultIdentifier(result));

        if (results.length === 0) {
            return null;
        }

        const count = this.findResultCount(rawResults);

        return { results, text: count === null ? text : `${text}, makes ${count}`, grid };
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

        return tags.length > 0 ? tags.map((tag) => Identifiers.humanize(tag)).join(", ") : "Unknown Station";
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
