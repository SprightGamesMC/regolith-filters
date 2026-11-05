import assert from "node:assert/strict";
import { describe, test } from "node:test";
import GuideDataReader from "../../src/Lib/GuideDataReader";
import GuideIssues from "../../src/Lib/GuideIssues";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("GuideDataReader completion guide", () => {
    const read = (completionGuide: unknown): GuideIssues => {
        const issues = new GuideIssues();

        new GuideDataReader(issues).read({ ...ProjectFixture.completeGuide(), completion_guide: completionGuide });

        return issues;
    };

    test("reports a guide that is not written or not a list", () => {
        assert.ok(read(null).errors.includes("completion_guide: Not written. Use [] when there are no steps."));
        assert.ok(read({ steps: [] }).errors.includes("completion_guide: Must be an array of steps."));
        assert.deepEqual(read([]).errors, []);
    });

    test("accepts a schema key", () => {
        const issues = new GuideIssues();

        new GuideDataReader(issues).read({ ...ProjectFixture.completeGuide(), $schema: "schema.json" });

        assert.deepEqual(issues.errors, []);
    });
});

describe("GuideDataReader nesting", () => {
    test("rejects notes nested past the limit", () => {
        let entry: unknown = "Deepest";

        for (let level = 0; level < 500; level += 1) {
            entry = { text: "Level", notes: [entry] };
        }

        const issues = new GuideIssues();

        new GuideDataReader(issues).read({ vanilla_changes: [entry] });

        assert.ok(issues.errors.some((error) => /nested more than 64 levels deep/.test(error)));
    });
});

describe("GuideDataReader.read", () => {
    const read = (raw: unknown): { data: ReturnType<GuideDataReader["read"]>; issues: GuideIssues } => {
        const issues = new GuideIssues();

        return { data: new GuideDataReader(issues).read(raw), issues };
    };

    test("accepts complete guide data", () => {
        const { data, issues } = read(ProjectFixture.completeGuide());

        assert.deepEqual(issues.errors, []);
        assert.deepEqual(data.navigation.general, []);
        assert.equal(data.characters?.[0].locations[0], "150 70 0");
        assert.equal(data.changelog?.[0].date, "2026-11-04");
    });

    test("reports every section that is not written", () => {
        const { data, issues } = read({});

        assert.equal(data.characters, null);
        assert.equal(issues.errors.length, 12);
        assert.ok(issues.errors.includes("navigation.hidden_elements: Not written. Use [] when the section does not apply."));
    });

    test("normalizes string entries and nested notes", () => {
        const { data } = read({
            ...ProjectFixture.completeGuide(),
            gameplay: { mechanics: ["Plain", { text: "Nested", notes: ["Inner"] }], user_interface: [], key_bindings: [] },
        });

        assert.deepEqual(data.gameplay.mechanics, [
            { text: "Plain", locations: [], notes: [] },
            { text: "Nested", locations: [], notes: [{ text: "Inner", locations: [], notes: [] }] },
        ]);
    });

    test("rejects coordinates without spaces", () => {
        const { issues } = read({
            ...ProjectFixture.completeGuide(),
            characters: [{ text: "Joe", locations: ["150,70,0"] }],
        });

        assert.match(issues.errors[0], /characters\[0\]\.locations\[0\]: Must use spaces/);
    });

    test("rejects unknown keys and wrong types", () => {
        const { issues } = read({
            ...ProjectFixture.completeGuide(),
            extra: 1,
            navigation: { general: "text", key_locations: [], landmarks: [], containers: [], hidden_elements: [] },
            items: { "test:gem": { player_accessible: "yes", typo: 1 } },
        });

        assert.ok(issues.errors.includes('content_guide.json: Unknown key "extra".'));
        assert.ok(issues.errors.includes("navigation.general: Must be an array of entries."));
        assert.ok(issues.errors.includes("items.test:gem.player_accessible: Must be a boolean."));
        assert.ok(issues.errors.includes('items.test:gem: Unknown key "typo".'));
    });

    test("reads step fields", () => {
        const { data } = read({
            ...ProjectFixture.completeGuide(),
            completion_guide: [{ text: "Win", requirement: "A sword", skip: "/function skip", return: "/function reset" }],
        });

        assert.equal(data.completionGuide?.[0].requirement, "A sword");
        assert.equal(data.completionGuide?.[0].skip, "/function skip");
        assert.equal(data.completionGuide?.[0].returnTo, "/function reset");
    });

    test("requires changes in each changelog release", () => {
        const { issues } = read({ ...ProjectFixture.completeGuide(), changelog: [{ version: "1.0.0", changes: [] }] });

        assert.ok(issues.errors.includes("changelog[0].changes: Must list at least one change."));
    });
});
