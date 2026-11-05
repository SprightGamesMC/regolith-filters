"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Settings_1 = __importDefault(require("./Settings"));
/**
 * Merges guide data and the pack catalog into the section structure that the requirements define.
 */
class GuideBuilder {
    /** Display name of each content type. */
    static CONTENT_TYPE_LABELS = {
        addon: "Add-On",
        world: "World",
        mash_up: "Mash-Up",
        texture_pack: "Texture Pack",
    };
    /** Text shown on the guide cover. */
    static INTRODUCTION = "Coordinates use spaces between x, y, and z so they can be copied straight into commands.";
    /** Summary under the Design title. */
    static DESIGN_SUMMARY = "How to finish the content, how to move through it, and what the player can do.";
    /** Summary under the Technical Elements title. */
    static TECHNICAL_SUMMARY = "Every change, item, entity, and sound.";
    /** Summary under the Changelog title. */
    static CHANGELOG_SUMMARY = "What changed in each version of this content.";
    /** Text shown when a section does not apply. */
    static NONE_TEXT = "None.";
    /** Text shown when a section is not written and the run is not strict. */
    static TODO_TEXT = "TODO: Write this section in content_guide.json.";
    /** Text shown for an item, entity, or sound with notes that are not written, when the run is not strict. */
    static TODO_NOTES_TEXT = "TODO: Write these notes in content_guide.json.";
    /** Guide data for this run. */
    data;
    /** Pack catalog for this run. */
    catalog;
    /** Filter settings for this run. */
    settings;
    /**
     * Creates a builder for one run.
     *
     * @param data - Normalized guide data.
     * @param catalog - Pack catalog.
     * @param settings - Filter settings.
     */
    constructor(data, catalog, settings) {
        this.data = data;
        this.catalog = catalog;
        this.settings = settings;
    }
    /**
     * Builds the complete guide.
     *
     * @returns GuideDocument.
     */
    build() {
        const { contentName, contentType, contentVersion, creatorTeamName, partnerName } = this.settings;
        const release = this.data.changelog?.find((entry) => entry.version === contentVersion);
        const credits = [
            ...(creatorTeamName ? [`Creator Team: ${creatorTeamName}`] : []),
            ...(partnerName ? [`Partner: ${partnerName}`] : []),
        ];
        return {
            title: contentName,
            contentTypeLabel: GuideBuilder.CONTENT_TYPE_LABELS[contentType],
            version: contentVersion,
            date: release?.date ?? null,
            credits,
            introduction: GuideBuilder.INTRODUCTION,
            stats: [
                { value: String(this.catalog.items.length), label: "Items" },
                { value: String(this.catalog.entities.length), label: "Entities" },
                { value: String(this.catalog.sounds.length), label: "Sounds" },
            ],
            sections: [this.buildDesign(), this.buildTechnicalElements(), this.buildChangelog()],
        };
    }
    /**
     * Builds the Design section.
     *
     * @returns GuideSection.
     */
    buildDesign() {
        const { navigation, gameplay, characters } = this.data;
        return this.parent("Design", GuideBuilder.DESIGN_SUMMARY, [
            this.buildCompletionGuide(this.data.completionGuide),
            this.parent("Navigation", null, [
                this.section("General", navigation.general),
                this.section("Key Locations", navigation.keyLocations),
                ...(Settings_1.default.isMap(this.settings.contentType) ? [this.section("End Portal", navigation.endPortal)] : []),
                this.section("Landmarks", navigation.landmarks),
                this.section("Containers", navigation.containers),
                this.section("Easter Eggs / Hidden Elements", navigation.hiddenElements),
            ]),
            this.section("Characters and Villagers", characters),
            this.parent("Gameplay Elements", null, [
                this.section("Mechanics", gameplay.mechanics),
                this.section("User Interface (UI)", gameplay.userInterface),
                this.section("Additional Key Bindings", gameplay.keyBindings),
            ]),
        ]);
    }
    /**
     * Builds the Technical Elements section.
     *
     * @returns GuideSection.
     */
    buildTechnicalElements() {
        const vanillaEdits = this.catalog.vanillaEdits.map((text) => ({ text, children: [] }));
        return this.parent("Technical Elements", GuideBuilder.TECHNICAL_SUMMARY, [
            this.section("Changes to Original Minecraft Functionality", this.data.vanillaChanges, vanillaEdits),
            this.buildAccessibilitySplit("Custom Inventory Items", this.catalog.items, this.data.items),
            this.buildAccessibilitySplit("Custom Creatures, Entities, and Decorations", this.catalog.entities, this.data.entities),
            this.buildSounds(),
        ]);
    }
    /**
     * Builds the sounds section, which is a compact table unless a sound has notes that a table has no room for.
     *
     * @returns GuideSection.
     */
    buildSounds() {
        const lines = this.buildCatalogLines(this.catalog.sounds, this.data.sounds);
        return { ...this.generatedSection("Custom Sounds", lines), isCompact: lines.every((line) => line.children.length === 0) };
    }
    /**
     * Builds the Changelog section.
     *
     * @returns GuideSection.
     */
    buildChangelog() {
        const { changelog } = this.data;
        if (!changelog) {
            return this.section("Changelog", null);
        }
        const lines = changelog.map((release) => ({
            text: `Version ${release.version}${release.date ? ` (${release.date})` : ""}`,
            children: release.changes.map((change) => this.entryLine(change)),
            isHeading: true,
        }));
        return { ...this.generatedSection("Changelog", lines), paragraphs: [GuideBuilder.CHANGELOG_SUMMARY] };
    }
    /**
     * Builds the Completion Guide section.
     *
     * @param steps - Authored steps.
     *
     * @returns GuideSection.
     */
    buildCompletionGuide(steps) {
        if (!steps) {
            return this.section("Completion Guide", null);
        }
        return {
            ...this.generatedSection("Completion Guide", steps.map((step) => this.stepLine(step))),
            ordered: true,
        };
    }
    /**
     * Splits generated content into player accessible and non player accessible sections.
     *
     * @param title - Parent section title.
     * @param entries - Generated entries.
     * @param notes - Authored notes by identifier.
     *
     * @returns GuideSection.
     */
    buildAccessibilitySplit(title, entries, notes) {
        const isAccessible = (entry) => notes.get(entry.identifier)?.playerAccessible ?? entry.playerAccessible;
        const accessible = entries.filter((entry) => isAccessible(entry));
        const notAccessible = entries.filter((entry) => !isAccessible(entry));
        return this.parent(title, null, [
            this.generatedSection("Player Accessible", this.buildCatalogLines(accessible, notes)),
            this.generatedSection("Non-Player Accessible", this.buildCatalogLines(notAccessible, notes)),
        ]);
    }
    /**
     * Creates sorted lines for generated content, with authored notes before generated facts.
     *
     * @param entries - Generated entries.
     * @param notes - Authored notes by identifier.
     *
     * @returns Guide lines.
     */
    buildCatalogLines(entries, notes) {
        const lines = entries.map((entry) => {
            const authored = notes.get(entry.identifier);
            return {
                name: authored?.name ?? entry.name,
                line: {
                    text: authored?.name ?? entry.name,
                    identifier: entry.identifier,
                    children: [
                        ...(authored?.notes ?? [{ text: GuideBuilder.TODO_NOTES_TEXT, locations: [], notes: [] }]).map((note) => this.entryLine(note)),
                        ...(authored?.tags ?? []).map((text) => ({ text, children: [], isFact: true, isTag: true })),
                        ...entry.facts.filter((fact) => !authored?.tags || !fact.isTag).map((fact) => this.factLine(fact)),
                    ],
                },
            };
        });
        return lines.sort((first, second) => first.name.localeCompare(second.name, undefined, { numeric: true })).map(({ line }) => line);
    }
    /**
     * Creates the line for a completion step, with its requirement, its way to skip it, and its way to return to it.
     *
     * @param step - Authored step.
     *
     * @returns GuideLine.
     */
    stepLine(step) {
        const line = this.entryLine(step);
        const returnTo = step.returnTo ?? (step.locations[0] ? `/tp @s ${step.locations[0]}` : null);
        const labeled = [
            ["Requires", step.requirement],
            ["Skip", step.skip],
            ["Return", returnTo],
        ];
        for (const [label, text] of labeled) {
            if (text) {
                line.children.push({ label, text: label !== "Requires" && text.startsWith("/") ? `\`${text}\`` : text, children: [] });
            }
        }
        return line;
    }
    /**
     * Creates the line for a generated fact.
     *
     * @param fact - Generated fact.
     *
     * @returns GuideLine.
     */
    factLine(fact) {
        return { text: fact.text, children: [], isFact: true, isTag: fact.isTag, ...(fact.recipe ? { recipe: fact.recipe } : {}) };
    }
    /**
     * Creates the line for an authored entry.
     *
     * @param entry - Authored entry.
     *
     * @returns GuideLine.
     */
    entryLine(entry) {
        return {
            text: this.withLocations(entry.text, entry.locations),
            children: entry.notes.map((note) => this.entryLine(note)),
        };
    }
    /**
     * Adds coordinates to the end of a text.
     *
     * @param text - Entry text.
     * @param locations - Coordinates.
     *
     * @returns Text with the coordinates marked as code.
     */
    withLocations(text, locations) {
        return locations.length === 0 ? text : `${text} ${locations.map((location) => `(\`${location}\`)`).join(", ")}`;
    }
    /**
     * Creates a section from authored entries. `null` shows the `TODO` text and an empty list shows the none text.
     *
     * @param title - Section title.
     * @param entries - Authored entries, or `null` when not written.
     * @param generatedLines - Lines generated from the packs, listed after the entries.
     *
     * @returns GuideSection.
     */
    section(title, entries, generatedLines = []) {
        const lines = [...(entries ?? []).map((entry) => this.entryLine(entry)), ...generatedLines];
        const section = this.generatedSection(title, lines);
        return entries === null ? { ...section, paragraphs: [GuideBuilder.TODO_TEXT] } : section;
    }
    /**
     * Creates a section from complete lines.
     *
     * @param title - Section title.
     * @param lines - Section lines. An empty list shows the none text.
     *
     * @returns GuideSection.
     */
    generatedSection(title, lines) {
        return { title, paragraphs: lines.length === 0 ? [GuideBuilder.NONE_TEXT] : [], ordered: false, lines, sections: [] };
    }
    /**
     * Creates a section that only contains other sections.
     *
     * @param title - Section title.
     * @param summary - Text under the title, or `null` for none.
     * @param sections - Nested sections.
     *
     * @returns GuideSection.
     */
    parent(title, summary, sections) {
        return { title, paragraphs: summary ? [summary] : [], ordered: false, lines: [], sections };
    }
}
exports.default = GuideBuilder;
