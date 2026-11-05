import type {
    CatalogEntry,
    ContentGuideSettings,
    ContentNotes,
    GuideData,
    GuideDocument,
    GuideEntry,
    GuideLine,
    GuideSection,
    PackCatalog,
} from "../Types/ContentGuideTypes";
import type GuideIssues from "./GuideIssues";
import GuideSync from "./GuideSync";
import InlineText from "./InlineText";
import Settings from "./Settings";

/**
 * Checks the guide against the content guide requirements.
 */
export default class GuideValidator {
    /** Coordinates in parentheses or with no spaces, which can only mean a position, and which cannot be copied into commands. */
    static readonly CLEAR_COMMA_COORDINATES =
        /\(\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*\)|-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?/;

    /** Three numbers in a list, which may be coordinates or an ordinary list such as damage values. */
    static readonly COMMA_COORDINATES = /-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?/;

    /** Any spelling of Add-On that a person is likely to write. */
    static readonly ADD_ON_SPELLINGS = /\badd-?ons?\b/gi;

    /** The words add on used as a noun, as opposed to a verb such as in add on top. */
    static readonly ADD_ON_NOUN = /\b(an?|the|this|that|each|every|your|our|my)\s+add on\b/i;

    /** Accepted spellings of Add-On. */
    static readonly ADD_ON_EXACT = /^Add-Ons?$/;

    /** Any spelling of Add-On in a title. */
    static readonly TITLE_ADD_ON = /\badd[\s-]?ons?\b/i;

    /** Only accepted use of Add-On in a title. */
    static readonly TITLE_ADD_ON_SUFFIX = /\bAdd-On$/;

    /** The word mod and its variations. */
    static readonly MOD_WORDS = /\bmod(s|ded|ding|der|ders)?\b/i;

    /** Any spelling of X-Ray. */
    static readonly X_RAY = /\bx[\s-]?rays?\b/i;

    /** Technical changelog wording that Marketplace policy 0.0.6 does not allow. */
    static readonly TECHNICAL_CHANGELOG_WORDING = /\bfix(ed|es)?\b.*\b(bugs?|errors?)\b|\bbug ?fix(es)?\b|\berrors? resolved\b/i;

    /** Guide data for this run. */
    private readonly data: GuideData;

    /** Pack catalog for this run. */
    private readonly catalog: PackCatalog;

    /** Filter settings for this run. */
    private readonly settings: ContentGuideSettings;

    /** Collector for every problem found. */
    private readonly issues: GuideIssues;

    /**
     * Creates a validator for one run.
     *
     * @param data - Normalized guide data.
     * @param catalog - Pack catalog.
     * @param settings - Filter settings.
     * @param issues - Collector for every problem found.
     */
    constructor(data: GuideData, catalog: PackCatalog, settings: ContentGuideSettings, issues: GuideIssues) {
        this.data = data;
        this.catalog = catalog;
        this.settings = settings;
        this.issues = issues;
    }

    /**
     * Runs every check.
     *
     * @param document - Built guide.
     */
    validate(document: GuideDocument): void {
        this.checkCompletionGuide();
        this.checkEndPortal();
        this.checkCharacters();
        this.checkNavigationCoordinates();

        for (const section of GuideSync.SECTIONS) {
            this.checkUnknownIdentifiers(section, this.data[section], this.catalog[section]);
            this.checkNotesWritten(section, this.data[section], this.catalog[section]);
        }

        this.checkEntityNotes();
        this.checkUserInterface();
        this.checkChangelog();

        if (this.settings.contentType === "addon") {
            this.checkAddOnTitle();
        }

        for (const section of document.sections) {
            this.checkSectionText(section);
        }
    }

    /**
     * Checks that each step has a place or requirement, and a way to skip it or return to it.
     */
    private checkCompletionGuide(): void {
        this.data.completionGuide?.forEach((step, index) => {
            const where = `completion_guide[${index}]`;

            if (step.locations.length === 0 && !step.requirement) {
                this.issues.error(where, "Needs locations or a requirement.");
            }

            if (step.locations.length === 0 && !step.skip && !step.returnTo) {
                this.issues.error(where, "Needs locations, a skip value, or a return value, so reviewers can skip or return to the step.");
            }
        });
    }

    /**
     * Checks that a map lists each end portal with coordinates, and that other content types do not list one.
     */
    private checkEndPortal(): void {
        const where = "navigation.end_portal";
        const portals = this.data.navigation.endPortal;

        if (!Settings.isMap(this.settings.contentType)) {
            if (portals) {
                this.issues.error(where, "Only a world or mash-up has an end portal to list. Remove this key.");
            }

            return;
        }

        if (!portals) {
            this.issues.error(where, "Not written. List each end portal with its coordinates, or use [] when the map has none.");
            return;
        }

        portals.forEach((portal, index) => {
            if (portal.locations.length === 0) {
                this.issues.error(`${where}[${index}]`, `"${portal.text}" needs coordinates.`);
            }
        });
    }

    /**
     * Checks that every character has coordinates, which the requirements demand.
     */
    private checkCharacters(): void {
        this.data.characters?.forEach((character, index) => {
            if (character.locations.length === 0) {
                this.issues.error(`characters[${index}]`, `"${character.text}" needs coordinates.`);
            }
        });
    }

    /**
     * Warns about navigation entries that reviewers cannot travel to. An Add-On overlays any world, so its positions depend on the seed.
     */
    private checkNavigationCoordinates(): void {
        if (this.settings.contentType === "addon") {
            return;
        }

        const sections: [string, GuideEntry[] | null][] = [
            ["navigation.key_locations", this.data.navigation.keyLocations],
            ["navigation.landmarks", this.data.navigation.landmarks],
            ["navigation.containers", this.data.navigation.containers],
        ];

        for (const [where, entries] of sections) {
            entries?.forEach((entry, index) => {
                if (entry.locations.length === 0) {
                    this.issues.warning(`${where}[${index}]`, `"${entry.text}" has no coordinates.`);
                }
            });
        }
    }

    /**
     * Checks that authored notes name content that exists in the packs.
     *
     * @param where - Field path for messages.
     * @param notes - Authored notes by identifier.
     * @param entries - Generated entries.
     */
    private checkUnknownIdentifiers(where: string, notes: Map<string, ContentNotes>, entries: CatalogEntry[]): void {
        const identifiers = new Set(entries.map((entry) => entry.identifier));

        for (const identifier of notes.keys()) {
            if (!identifiers.has(identifier)) {
                this.issues.error(`${where}.${identifier}`, "This identifier is not in the packs.");
            }
        }
    }

    /**
     * Checks that a person has written the notes of all content in the packs, so nothing new reaches a guide without review.
     *
     * @param where - Field path for messages.
     * @param notes - Authored notes by identifier.
     * @param entries - Generated entries.
     */
    private checkNotesWritten(where: string, notes: Map<string, ContentNotes>, entries: CatalogEntry[]): void {
        for (const { identifier } of entries) {
            if (!notes.get(identifier)?.notes) {
                this.issues.error(
                    `${where}.${identifier}.notes`,
                    "Not written. Add what reviewers need to know, or use [] when there is nothing to add."
                );
            }
        }
    }

    /**
     * Warns about entities with no authored behaviors, because the packs cannot supply them.
     */
    private checkEntityNotes(): void {
        for (const entity of this.catalog.entities) {
            if (this.data.entities.get(entity.identifier)?.notes?.length === 0) {
                this.issues.warning(`entities.${entity.identifier}`, "Has no notes on its behaviors and effects.");
            }
        }
    }

    /**
     * Warns when the resource pack has JSON UI files and the guide does not describe any UI.
     */
    private checkUserInterface(): void {
        if (this.catalog.hasJsonUi && this.data.gameplay.userInterface?.length === 0) {
            this.issues.warning("gameplay.user_interface", "RP/ui exists, but this section is empty.");
        }
    }

    /**
     * Checks that the changelog has a release for the current version.
     */
    private checkChangelog(): void {
        const { changelog } = this.data;
        const { contentVersion } = this.settings;

        if (changelog && !changelog.some((release) => release.version === contentVersion)) {
            this.issues.error("changelog", `Needs a release for the current content version ${contentVersion}.`);
        }

        const versions = new Set<string>();

        changelog?.forEach((release, index) => {
            if (release.version !== "" && versions.has(release.version)) {
                this.issues.error(`changelog[${index}].version`, `Version ${release.version} is listed more than once.`);
            }

            versions.add(release.version);
            this.checkChangelogWording(release.changes, `changelog[${index}]`);
        });
    }

    /**
     * Warns about changes that describe technical work instead of what is different for the player.
     *
     * @param changes - Changelog entries.
     * @param where - Field path for messages.
     */
    private checkChangelogWording(changes: GuideEntry[], where: string): void {
        for (const change of changes) {
            if (GuideValidator.TECHNICAL_CHANGELOG_WORDING.test(change.text)) {
                this.issues.warning(where, `Say what is different for the player instead: "${change.text}".`);
            }

            this.checkChangelogWording(change.notes, where);
        }
    }

    /**
     * Checks the Add-On title rules.
     */
    private checkAddOnTitle(): void {
        const { contentName } = this.settings;

        if (GuideValidator.MOD_WORDS.test(contentName)) {
            this.issues.error("content_name", 'Add-On titles cannot use "mod" or a variation.');
        }

        if (GuideValidator.X_RAY.test(contentName)) {
            this.issues.error("content_name", 'Add-Ons cannot be called "X-Ray".');
        }

        if (GuideValidator.TITLE_ADD_ON.test(contentName) && !GuideValidator.TITLE_ADD_ON_SUFFIX.test(contentName)) {
            this.issues.error("content_name", '"Add-On" is only allowed in a title as a suffix, with that exact spelling.');
        }
    }

    /**
     * Checks the text of one section and its nested sections.
     *
     * @param section - Section to check.
     */
    private checkSectionText(section: GuideSection): void {
        for (const paragraph of section.paragraphs) {
            this.checkText(paragraph, section.title);
        }

        for (const line of section.lines) {
            this.checkLineText(line, section.title);
        }

        for (const child of section.sections) {
            this.checkSectionText(child);
        }
    }

    /**
     * Checks the text of one line and its children.
     *
     * @param line - Line to check.
     * @param where - Section title for messages.
     */
    private checkLineText(line: GuideLine, where: string): void {
        this.checkText(line.text, where);

        for (const child of line.children) {
            this.checkLineText(child, where);
        }
    }

    /**
     * Checks one text for coordinate format and Add-On terms. Code runs are exempt from the terms because identifiers cannot be reworded.
     *
     * @param text - Guide text.
     * @param where - Section title for messages.
     */
    private checkText(text: string, where: string): void {
        if (GuideValidator.CLEAR_COMMA_COORDINATES.test(text)) {
            this.issues.error(where, `Coordinates must use spaces, not commas: "${text}".`);
        } else if (GuideValidator.COMMA_COORDINATES.test(text)) {
            this.issues.warning(where, `If these are coordinates, use spaces instead of commas: "${text}".`);
        }

        if (this.settings.contentType !== "addon") {
            return;
        }

        const plainText = InlineText.split(text)
            .filter((segment) => !segment.isCode)
            .map((segment) => segment.text)
            .join(" ");

        for (const spelling of plainText.match(GuideValidator.ADD_ON_SPELLINGS) ?? []) {
            if (!GuideValidator.ADD_ON_EXACT.test(spelling)) {
                this.issues.error(where, `Write "Add-On" exactly, not "${spelling}": "${text}".`);
            }
        }

        if (GuideValidator.ADD_ON_NOUN.test(plainText)) {
            this.issues.error(where, `Write "Add-On" exactly: "${text}".`);
        }

        if (GuideValidator.X_RAY.test(plainText)) {
            this.issues.error(where, `Do not call content "X-Ray": "${text}".`);
        }
    }
}
