import type { ChangelogRelease, CompletionStep, ContentNotes, GuideData, GuideEntry } from "../Types/ContentGuideTypes";
import type GuideIssues from "./GuideIssues";
import JsonTools from "./JsonTools";

/**
 * Converts raw `content_guide.json` data into normalized guide data and records every problem it finds.
 */
export default class GuideDataReader {
    /** Accepted coordinate format, with spaces so it can be copied into commands. */
    static readonly LOCATION_PATTERN = /^-?\d+(\.\d+)?( -?\d+(\.\d+)?){2}$/;

    /** Accepted top level `content_guide.json` keys. */
    static readonly TOP_LEVEL_KEYS: readonly string[] = [
        "$schema",
        "completion_guide",
        "navigation",
        "characters",
        "gameplay",
        "vanilla_changes",
        "items",
        "entities",
        "sounds",
        "changelog",
    ];

    /** Deepest level of nested notes. Far past any real guide, and it keeps the renderers from running out of stack. */
    static readonly MAX_NOTE_DEPTH = 64;

    /** Accepted keys of a guide entry object. */
    static readonly ENTRY_KEYS: readonly string[] = ["text", "locations", "notes"];

    /** Accepted keys of a completion step. */
    static readonly STEP_KEYS: readonly string[] = [...GuideDataReader.ENTRY_KEYS, "requirement", "skip", "return"];

    /** Collector for every problem found. */
    private readonly issues: GuideIssues;

    /**
     * Creates a reader for one run.
     *
     * @param issues - Collector for every problem found.
     */
    constructor(issues: GuideIssues) {
        this.issues = issues;
    }

    /**
     * Normalizes raw guide data.
     *
     * @param raw - Parsed `content_guide.json` value.
     *
     * @returns GuideData. Invalid or unwritten sections are `null`.
     */
    read(raw: unknown): GuideData {
        const root = this.readObject(raw, "content_guide.json") ?? {};

        this.rejectUnknownKeys(root, GuideDataReader.TOP_LEVEL_KEYS, "content_guide.json");

        const navigation = this.readObject(root.navigation, "navigation") ?? {};
        const gameplay = this.readObject(root.gameplay, "gameplay") ?? {};

        return {
            completionGuide: this.readCompletionGuide(root.completion_guide),
            navigation: {
                general: this.readSection(navigation.general, "navigation.general"),
                keyLocations: this.readSection(navigation.key_locations, "navigation.key_locations"),
                endPortal: this.readOptionalSection(navigation.end_portal, "navigation.end_portal"),
                landmarks: this.readSection(navigation.landmarks, "navigation.landmarks"),
                containers: this.readSection(navigation.containers, "navigation.containers"),
                hiddenElements: this.readSection(navigation.hidden_elements, "navigation.hidden_elements"),
            },
            characters: this.readSection(root.characters, "characters"),
            gameplay: {
                mechanics: this.readSection(gameplay.mechanics, "gameplay.mechanics"),
                userInterface: this.readSection(gameplay.user_interface, "gameplay.user_interface"),
                keyBindings: this.readSection(gameplay.key_bindings, "gameplay.key_bindings"),
            },
            vanillaChanges: this.readSection(root.vanilla_changes, "vanilla_changes"),
            items: this.readContentNotes(root.items, "items"),
            entities: this.readContentNotes(root.entities, "entities"),
            sounds: this.readContentNotes(root.sounds, "sounds"),
            changelog: this.readChangelog(root.changelog),
        };
    }

    /**
     * Reads the completion guide.
     *
     * @param raw - Raw `completion_guide` value.
     *
     * @returns Steps, or `null` when not written or invalid.
     */
    private readCompletionGuide(raw: unknown): CompletionStep[] | null {
        const where = "completion_guide";

        if (raw === undefined || raw === null) {
            this.issues.error(where, "Not written. Use [] when there are no steps.");
            return null;
        }

        if (!Array.isArray(raw)) {
            this.issues.error(where, "Must be an array of steps.");
            return null;
        }

        return raw.map((step, index) => this.readStep(step, `${where}[${index}]`));
    }

    /**
     * Reads one completion step.
     *
     * @param raw - Raw step value.
     * @param where - Field path for messages.
     *
     * @returns CompletionStep.
     */
    private readStep(raw: unknown, where: string): CompletionStep {
        const allowedKeys = GuideDataReader.STEP_KEYS;
        const step = typeof raw === "string" ? { text: raw } : (this.readObject(raw, where) ?? {});

        return {
            ...this.readEntry(step, where, allowedKeys),
            requirement: this.readOptionalString(step.requirement, `${where}.requirement`),
            skip: this.readOptionalString(step.skip, `${where}.skip`),
            returnTo: this.readOptionalString(step.return, `${where}.return`),
        };
    }

    /**
     * Reads a section that must be written. `[]` means the section does not apply.
     *
     * @param raw - Raw section value.
     * @param where - Field path for messages.
     *
     * @returns Entries, or `null` when not written or invalid.
     */
    private readSection(raw: unknown, where: string): GuideEntry[] | null {
        if (raw === undefined || raw === null) {
            this.issues.error(where, "Not written. Use [] when the section does not apply.");
            return null;
        }

        if (!Array.isArray(raw)) {
            this.issues.error(where, "Must be an array of entries.");
            return null;
        }

        return this.readEntries(raw, where);
    }

    /**
     * Reads a section that only some content types write. The validator decides whether `null` is an error.
     *
     * @param raw - Raw section value.
     * @param where - Field path for messages.
     *
     * @returns Entries, or `null` when not written or invalid.
     */
    private readOptionalSection(raw: unknown, where: string): GuideEntry[] | null {
        return raw === undefined || raw === null ? null : this.readSection(raw, where);
    }

    /**
     * Reads an optional list of entries.
     *
     * @param raw - Raw list value.
     * @param where - Field path for messages.
     *
     * @returns Entries, empty when the value is omitted or invalid.
     */
    private readEntries(raw: unknown, where: string): GuideEntry[] {
        if (raw === undefined || raw === null) {
            return [];
        }

        if (where.split(".notes").length > GuideDataReader.MAX_NOTE_DEPTH) {
            this.issues.error(where.split(".notes")[0], `Notes are nested more than ${GuideDataReader.MAX_NOTE_DEPTH} levels deep.`);
            return [];
        }

        if (!Array.isArray(raw)) {
            this.issues.error(where, "Must be an array of entries.");
            return [];
        }

        return raw.map((entry, index) => this.readEntryValue(entry, `${where}[${index}]`));
    }

    /**
     * Reads one entry written as a string or an object.
     *
     * @param raw - Raw entry value.
     * @param where - Field path for messages.
     *
     * @returns GuideEntry.
     */
    private readEntryValue(raw: unknown, where: string): GuideEntry {
        if (typeof raw === "string") {
            if (raw.trim() === "") {
                this.issues.error(where, "Must be a non-empty string.");
            }

            return { text: raw.trim(), locations: [], notes: [] };
        }

        return this.readEntry(this.readObject(raw, where) ?? {}, where, GuideDataReader.ENTRY_KEYS);
    }

    /**
     * Reads the shared fields of an entry object.
     *
     * @param entry - Raw entry object.
     * @param where - Field path for messages.
     * @param allowedKeys - Keys accepted on this entry.
     *
     * @returns GuideEntry.
     */
    private readEntry(entry: Record<string, unknown>, where: string, allowedKeys: readonly string[]): GuideEntry {
        this.rejectUnknownKeys(entry, allowedKeys, where);

        if (typeof entry.text !== "string" || entry.text.trim() === "") {
            this.issues.error(`${where}.text`, "Must be a non-empty string.");
        }

        return {
            text: typeof entry.text === "string" ? entry.text.trim() : "",
            locations: this.readLocations(entry.locations, `${where}.locations`),
            notes: this.readEntries(entry.notes, `${where}.notes`),
        };
    }

    /**
     * Reads a list of coordinates.
     *
     * @param raw - Raw locations value.
     * @param where - Field path for messages.
     *
     * @returns Valid coordinates.
     */
    private readLocations(raw: unknown, where: string): string[] {
        if (raw === undefined || raw === null) {
            return [];
        }

        if (!Array.isArray(raw)) {
            this.issues.error(where, 'Must be an array of coordinates such as "5 70 5".');
            return [];
        }

        return raw.flatMap((location, index) => this.readOptionalLocation(location, `${where}[${index}]`) ?? []);
    }

    /**
     * Reads one optional coordinate.
     *
     * @param raw - Raw coordinate value.
     * @param where - Field path for messages.
     *
     * @returns Coordinate, or `null` when omitted or invalid.
     */
    private readOptionalLocation(raw: unknown, where: string): string | null {
        if (raw === undefined || raw === null) {
            return null;
        }

        if (typeof raw !== "string" || !GuideDataReader.LOCATION_PATTERN.test(raw.trim())) {
            this.issues.error(where, 'Must use spaces between x, y, and z, such as "5 70 5".');
            return null;
        }

        return raw.trim();
    }

    /**
     * Reads the notes authored for generated content, keyed by identifier.
     *
     * @param raw - Raw notes object.
     * @param where - Field path for messages.
     *
     * @returns Notes by identifier.
     */
    private readContentNotes(raw: unknown, where: string): Map<string, ContentNotes> {
        const notes = new Map<string, ContentNotes>();

        if (raw === undefined || raw === null) {
            return notes;
        }

        const source = this.readObject(raw, where) ?? {};

        for (const [identifier, value] of Object.entries(source)) {
            const fieldPath = `${where}.${identifier}`;
            const content = this.readObject(value, fieldPath) ?? {};

            this.rejectUnknownKeys(content, ["name", "player_accessible", "tags", "notes"], fieldPath);
            notes.set(identifier, {
                name: this.readOptionalString(content.name, `${fieldPath}.name`),
                playerAccessible: this.readOptionalBoolean(content.player_accessible, `${fieldPath}.player_accessible`),
                tags: this.readOptionalTags(content.tags, `${fieldPath}.tags`),
                notes: content.notes === undefined || content.notes === null ? null : this.readEntries(content.notes, `${fieldPath}.notes`),
            });
        }

        return notes;
    }

    /**
     * Reads authored tags, which replace the generated tags of an item or entity.
     *
     * @param raw - Raw tags value.
     * @param where - Field path for messages.
     *
     * @returns Tags, or `null` when omitted or invalid.
     */
    private readOptionalTags(raw: unknown, where: string): string[] | null {
        if (raw === undefined || raw === null) {
            return null;
        }

        if (!Array.isArray(raw) || !raw.every((tag) => typeof tag === "string" && tag.trim() !== "")) {
            this.issues.error(where, "Must be an array of text. Use [] for no tags.");
            return null;
        }

        return raw as string[];
    }

    /**
     * Reads the changelog.
     *
     * @param raw - Raw changelog value.
     *
     * @returns Releases, or `null` when not written or invalid.
     */
    private readChangelog(raw: unknown): ChangelogRelease[] | null {
        if (raw === undefined || raw === null) {
            this.issues.error("changelog", "Not written. Add a release for the current content version.");
            return null;
        }

        if (!Array.isArray(raw)) {
            this.issues.error("changelog", "Must be an array of releases.");
            return null;
        }

        return raw.map((release, index) => this.readRelease(release, `changelog[${index}]`));
    }

    /**
     * Reads one changelog release.
     *
     * @param raw - Raw release value.
     * @param where - Field path for messages.
     *
     * @returns ChangelogRelease.
     */
    private readRelease(raw: unknown, where: string): ChangelogRelease {
        const release = this.readObject(raw, where) ?? {};

        this.rejectUnknownKeys(release, ["version", "date", "changes"], where);

        if (typeof release.version !== "string" || release.version.trim() === "") {
            this.issues.error(`${where}.version`, "Must be a non-empty string.");
        }

        const changes = this.readEntries(release.changes, `${where}.changes`);

        if (changes.length === 0) {
            this.issues.error(`${where}.changes`, "Must list at least one change.");
        }

        return {
            version: typeof release.version === "string" ? release.version.trim() : "",
            date: this.readOptionalString(release.date, `${where}.date`),
            changes,
        };
    }

    /**
     * Reads a value that must be an object when present.
     *
     * @param raw - Raw value.
     * @param where - Field path for messages.
     *
     * @returns Object, or `null` when the value is omitted or invalid.
     */
    private readObject(raw: unknown, where: string): Record<string, unknown> | null {
        if (raw === undefined || raw === null) {
            return null;
        }

        if (!JsonTools.isObject(raw)) {
            this.issues.error(where, "Must be an object.");
            return null;
        }

        return raw;
    }

    /**
     * Reads an optional string.
     *
     * @param raw - Raw value.
     * @param where - Field path for messages.
     *
     * @returns Trimmed string, or `null` when omitted or invalid.
     */
    private readOptionalString(raw: unknown, where: string): string | null {
        if (raw === undefined || raw === null) {
            return null;
        }

        if (typeof raw !== "string" || raw.trim() === "") {
            this.issues.error(where, "Must be a non-empty string.");
            return null;
        }

        return raw.trim();
    }

    /**
     * Reads an optional boolean.
     *
     * @param raw - Raw value.
     * @param where - Field path for messages.
     *
     * @returns Boolean, or `null` when omitted or invalid.
     */
    private readOptionalBoolean(raw: unknown, where: string): boolean | null {
        if (raw === undefined || raw === null) {
            return null;
        }

        if (typeof raw !== "boolean") {
            this.issues.error(where, "Must be a boolean.");
            return null;
        }

        return raw;
    }

    /**
     * Records an error for each key that is not accepted, so spelling mistakes do not hide content.
     *
     * @param value - Raw object.
     * @param allowedKeys - Accepted keys.
     * @param where - Field path for messages.
     */
    private rejectUnknownKeys(value: Record<string, unknown>, allowedKeys: readonly string[], where: string): void {
        for (const key of Object.keys(value)) {
            if (!allowedKeys.includes(key)) {
                this.issues.error(where, `Unknown key "${key}".`);
            }
        }
    }
}
