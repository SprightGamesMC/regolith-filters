"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const JsonTools_1 = __importDefault(require("./JsonTools"));
const Settings_1 = __importDefault(require("./Settings"));
/**
 * Keeps the guide data matched to the packs and the content type.
 */
class GuideSync {
    /** Sections of the guide data that have an entry for each identifier. */
    static SECTIONS = ["items", "entities", "sounds"];
    /** Collector for every problem found. */
    issues;
    /** Filter settings for this run. */
    settings;
    /**
     * Creates a sync for one run.
     *
     * @param issues - Collector for every problem found.
     * @param settings - Filter settings.
     */
    constructor(issues, settings) {
        this.issues = issues;
        this.settings = settings;
    }
    /**
     * Adds a template entry for new content and removes entries of content that left the packs.
     *
     * @param guide - Guide data, which this method changes.
     * @param catalog - Pack catalog.
     *
     * @returns `true` if the guide data changed, `false` otherwise.
     */
    apply(guide, catalog) {
        if (!JsonTools_1.default.isObject(guide)) {
            return false;
        }
        const changes = [this.addEndPortal(guide), ...GuideSync.SECTIONS.map((section) => this.syncSection(guide, section, catalog))];
        return changes.some((isChanged) => isChanged);
    }
    /**
     * Adds the end portal list, not written, to the navigation of a map that does not have it.
     *
     * @param guide - Guide data, which this method changes.
     *
     * @returns `true` if the list was added, `false` otherwise.
     */
    addEndPortal(guide) {
        const navigation = guide.navigation;
        if (!Settings_1.default.isMap(this.settings.contentType) || !JsonTools_1.default.isObject(navigation) || Object.hasOwn(navigation, "end_portal")) {
            return false;
        }
        navigation.end_portal = null;
        this.issues.warning("navigation.end_portal", "A map lists its end portals. Added to the guide data as not written.");
        return true;
    }
    /**
     * Syncs one section. A section of the wrong type is left for the guide data reader to report.
     *
     * @param guide - Guide data, which this method changes.
     * @param section - Section to sync.
     * @param catalog - Pack catalog.
     *
     * @returns `true` if the section changed, `false` otherwise.
     */
    syncSection(guide, section, catalog) {
        const current = guide[section] ?? {};
        if (!JsonTools_1.default.isObject(current)) {
            return false;
        }
        const blanked = this.settings.autoBlankOptionalNotes ? this.blankExistingNotes(current, section, catalog) : false;
        const identifiers = new Set(catalog[section].map((entry) => entry.identifier));
        const optional = new Set(catalog[section].filter((entry) => entry.isNotesOptional).map((entry) => entry.identifier));
        const added = [...identifiers].filter((identifier) => !Object.hasOwn(current, identifier)).sort();
        const removed = catalog.uncertainSections.includes(section)
            ? []
            : Object.keys(current).filter((identifier) => !identifiers.has(identifier));
        for (const identifier of added) {
            const isBlank = this.settings.autoBlankOptionalNotes && optional.has(identifier);
            current[identifier] = { notes: isBlank ? [] : null };
            this.issues.warning(`${section}.${identifier}`, `New in the packs. Added to the guide data with its notes ${isBlank ? "blank" : "not written"}.`);
        }
        for (const identifier of removed) {
            delete current[identifier];
            this.issues.warning(`${section}.${identifier}`, "No longer in the packs. Removed from the guide data with its notes.");
        }
        if (!blanked && added.length === 0 && removed.length === 0) {
            return false;
        }
        guide[section] = current;
        return true;
    }
    /**
     * Sets blank notes on existing entries with optional notes that are not written.
     *
     * @param current - Section entries, which this method changes.
     * @param section - Section to sync.
     * @param catalog - Pack catalog.
     *
     * @returns `true` if an entry changed, `false` otherwise.
     */
    blankExistingNotes(current, section, catalog) {
        let isChanged = false;
        for (const { identifier, isNotesOptional } of catalog[section]) {
            const entry = Object.hasOwn(current, identifier) ? current[identifier] : null;
            if (isNotesOptional && JsonTools_1.default.isObject(entry) && (entry.notes === undefined || entry.notes === null)) {
                entry.notes = [];
                isChanged = true;
                this.issues.warning(`${section}.${identifier}`, 'Notes set to blank because of "auto_blank_optional_notes".');
            }
        }
        return isChanged;
    }
}
exports.default = GuideSync;
