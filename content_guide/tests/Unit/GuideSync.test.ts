import type { CatalogEntry } from "../../src/Types/ContentGuideTypes";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import GuideIssues from "../../src/Lib/GuideIssues";
import GuideSync from "../../src/Lib/GuideSync";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("GuideSync.apply", () => {
    const entry = (identifier: string): CatalogEntry => ({ identifier, name: identifier, playerAccessible: true, facts: [] });

    test("adds a template for new content in every section", () => {
        const guide = { items: {}, entities: {}, sounds: {} };
        const catalog = ProjectFixture.catalog({ items: [entry("a:item")], entities: [entry("a:entity")], sounds: [entry("a.sound")] });

        assert.equal(new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(guide, catalog), true);
        assert.deepEqual(guide, {
            items: { "a:item": { notes: null } },
            entities: { "a:entity": { notes: null } },
            sounds: { "a.sound": { notes: null } },
        });
    });

    test("removes entries of content that left the packs and keeps the rest", () => {
        const guide = { items: { "a:kept": { notes: ["Kept"] }, "a:gone": { notes: ["Gone"] } } };
        const issues = new GuideIssues();

        new GuideSync(issues, ProjectFixture.settings()).apply(guide, ProjectFixture.catalog({ items: [entry("a:kept")] }));

        assert.deepEqual(guide.items, { "a:kept": { notes: ["Kept"] } });
        assert.match(issues.warnings[0], /items\.a:gone: No longer in the packs/);
    });

    test("does not remove entries when the section may be missing content", () => {
        const guide = { items: { "a:gone": { notes: ["Gone"] } } };

        assert.equal(
            new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(
                guide,
                ProjectFixture.catalog({ uncertainSections: ["items"] })
            ),
            false
        );
        assert.deepEqual(guide.items, { "a:gone": { notes: ["Gone"] } });
    });

    test("creates a missing section only when it has content", () => {
        const empty = {};
        const filled = {};

        assert.equal(new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(empty, ProjectFixture.catalog()), false);
        assert.deepEqual(empty, {});
        new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(filled, ProjectFixture.catalog({ sounds: [entry("a.sound")] }));
        assert.deepEqual(filled, { sounds: { "a.sound": { notes: null } } });
    });

    test("keeps optional notes not written unless the setting is on", () => {
        const sound = { ...entry("a.sound"), isNotesOptional: true };
        const off = {};
        const on = {};

        new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(off, ProjectFixture.catalog({ sounds: [sound] }));
        new GuideSync(new GuideIssues(), ProjectFixture.settings({ autoBlankOptionalNotes: true })).apply(
            on,
            ProjectFixture.catalog({ sounds: [sound], items: [entry("a:item")] })
        );

        assert.deepEqual(off, { sounds: { "a.sound": { notes: null } } });
        assert.deepEqual(on, { sounds: { "a.sound": { notes: [] } }, items: { "a:item": { notes: null } } });
    });

    test("blanks existing optional notes only when not written", () => {
        const guide = {
            sounds: { "a.empty": { notes: null }, "a.written": { notes: ["Kept"] } },
            items: { "a:item": { notes: null } },
        };
        const catalog = ProjectFixture.catalog({
            sounds: [
                { ...entry("a.empty"), isNotesOptional: true },
                { ...entry("a.written"), isNotesOptional: true },
            ],
            items: [entry("a:item")],
        });

        assert.equal(
            new GuideSync(new GuideIssues(), ProjectFixture.settings({ autoBlankOptionalNotes: true })).apply(guide, catalog),
            true
        );
        assert.deepEqual(guide, {
            sounds: { "a.empty": { notes: [] }, "a.written": { notes: ["Kept"] } },
            items: { "a:item": { notes: null } },
        });
        assert.equal(
            new GuideSync(new GuideIssues(), ProjectFixture.settings({ autoBlankOptionalNotes: true })).apply(guide, catalog),
            false
        );
    });

    test("reports no change when the guide matches the packs", () => {
        const guide = { items: { "a:item": { notes: [] } } };

        assert.equal(
            new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(guide, ProjectFixture.catalog({ items: [entry("a:item")] })),
            false
        );
    });

    test("leaves guide data of the wrong type for the reader to report", () => {
        const guide = { items: "wrong" };

        assert.equal(
            new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(guide, ProjectFixture.catalog({ items: [entry("a:item")] })),
            false
        );
        assert.equal(new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply([], ProjectFixture.catalog()), false);
        assert.deepEqual(guide, { items: "wrong" });
    });

    test("adds the end portal list to a map only", () => {
        const map = { navigation: { general: [] } };
        const addOn = { navigation: { general: [] } };
        const written = { navigation: { end_portal: [] } };
        const issues = new GuideIssues();

        assert.equal(new GuideSync(issues, ProjectFixture.settings({ contentType: "world" })).apply(map, ProjectFixture.catalog()), true);
        assert.deepEqual(map, { navigation: { general: [], end_portal: null } });
        assert.deepEqual(issues.warnings, ["navigation.end_portal: A map lists its end portals. Added to the guide data as not written."]);
        assert.equal(new GuideSync(new GuideIssues(), ProjectFixture.settings()).apply(addOn, ProjectFixture.catalog()), false);
        assert.equal(
            new GuideSync(new GuideIssues(), ProjectFixture.settings({ contentType: "mash_up" })).apply(written, ProjectFixture.catalog()),
            false
        );
        assert.deepEqual(written, { navigation: { end_portal: [] } });
    });
});
