import type { CatalogEntry, ContentGuideSettings, PackCatalog } from "../../src/Types/ContentGuideTypes";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import GuideBuilder from "../../src/Lib/GuideBuilder";
import GuideDataReader from "../../src/Lib/GuideDataReader";
import GuideIssues from "../../src/Lib/GuideIssues";
import GuideValidator from "../../src/Lib/GuideValidator";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("GuideValidator.validate", () => {
    const validate = (
        changes: Record<string, unknown> = {},
        settings: Partial<ContentGuideSettings> = {},
        catalog: Partial<PackCatalog> = {}
    ): GuideIssues => {
        const issues = new GuideIssues();
        const resolvedSettings = ProjectFixture.settings(settings);
        const resolvedCatalog = ProjectFixture.catalog(catalog);
        const data = new GuideDataReader(issues).read({ ...ProjectFixture.completeGuide(), ...changes });
        const document = new GuideBuilder(data, resolvedCatalog, resolvedSettings).build();

        new GuideValidator(data, resolvedCatalog, resolvedSettings, issues).validate(document);

        return issues;
    };

    test("requires written notes for all content in the packs", () => {
        const entry = (identifier: string): CatalogEntry => ({ identifier, name: identifier, playerAccessible: true, facts: [] });
        const issues = validate(
            { items: { "a:template": { notes: null }, "a:written": { notes: [] } }, sounds: { "a.sound": { name: "No notes key" } } },
            {},
            { items: [entry("a:template"), entry("a:written"), entry("a:absent")], sounds: [entry("a.sound")] }
        );

        const message = "Not written. Add what reviewers need to know, or use [] when there is nothing to add.";

        assert.deepEqual(issues.errors, [
            `items.a:template.notes: ${message}`,
            `items.a:absent.notes: ${message}`,
            `sounds.a.sound.notes: ${message}`,
        ]);
    });

    test("rejects a changelog version that is listed twice", () => {
        const issues = validate({
            changelog: [
                { version: "1.0.0", changes: ["First"] },
                { version: "1.0.0", changes: ["Second"] },
            ],
        });

        assert.ok(issues.errors.includes("changelog[1].version: Version 1.0.0 is listed more than once."));
    });

    test("passes complete guide data", () => {
        const issues = validate();

        assert.deepEqual(issues.errors, []);
        assert.deepEqual(issues.warnings, []);
    });

    test("requires a way to reach and skip each step", () => {
        const issues = validate({ completion_guide: [{ text: "Win" }] });

        assert.equal(issues.errors.length, 2);
        assert.match(issues.errors[0], /Needs locations or a requirement/);
        assert.match(issues.errors[1], /Needs locations, a skip value, or a return value/);
    });

    test("accepts a step with a requirement and a skip or return", () => {
        for (const step of [{ skip: "/function skip" }, { return: "/function reset" }]) {
            assert.deepEqual(validate({ completion_guide: [{ text: "Win", requirement: "A sword", ...step }] }).errors, []);
        }
    });

    test("requires the end portals of a map only", () => {
        const errorsFor = (endPortal: unknown, contentType: "world" | "mash_up" | "addon" = "world"): string[] =>
            validate(
                {
                    navigation: {
                        general: [],
                        key_locations: [],
                        end_portal: endPortal,
                        landmarks: [],
                        containers: [],
                        hidden_elements: [],
                    },
                },
                { contentType }
            ).errors;

        assert.deepEqual(errorsFor(undefined, "mash_up"), [
            "navigation.end_portal: Not written. List each end portal with its coordinates, or use [] when the map has none.",
        ]);
        assert.deepEqual(errorsFor(["Stronghold"]), ['navigation.end_portal[0]: "Stronghold" needs coordinates.']);
        assert.deepEqual(errorsFor([{ text: "Stronghold", locations: ["0 30 3600"] }]), []);
        assert.deepEqual(errorsFor([]), []);
        assert.deepEqual(errorsFor(undefined, "addon"), []);
        assert.deepEqual(errorsFor([], "addon"), [
            "navigation.end_portal: Only a world or mash-up has an end portal to list. Remove this key.",
        ]);
    });

    test("separates clear comma coordinates from ordinary lists of numbers", () => {
        const general = (text: string): Record<string, unknown> => ({
            navigation: { general: [text], key_locations: [], landmarks: [], containers: [], hidden_elements: [] },
        });

        assert.match(validate(general("Go to (5, 70, 5)")).errors[0], /must use spaces/);
        assert.match(validate(general("Go to 5,70,5")).errors[0], /must use spaces/);
        assert.deepEqual(validate(general("Deals 1, 2, 3 damage")).errors, []);
        assert.ok(validate(general("Deals 1, 2, 3 damage")).warnings.some((warning) => warning.includes("If these are coordinates")));
    });

    test("rejects add on as a noun but not as a verb", () => {
        const general = (text: string): Record<string, unknown> => ({
            navigation: { general: [text], key_locations: [], landmarks: [], containers: [], hidden_elements: [] },
        });

        assert.match(validate(general("This add on is great")).errors[0], /Add-On/);
        assert.deepEqual(validate(general("Blocks add on top of it")).errors, []);
    });

    test("requires coordinates for characters", () => {
        assert.match(validate({ characters: ["Joe"] }).errors[0], /"Joe" needs coordinates/);
    });

    test("warns about navigation entries with no coordinates, except for an Add-On", () => {
        const changes = {
            navigation: {
                general: ["No coordinates"],
                key_locations: ["Hub"],
                end_portal: [],
                landmarks: [],
                containers: [],
                hidden_elements: [],
            },
        };
        const issues = validate(changes, { contentType: "world" });

        assert.deepEqual(validate({ navigation: { ...changes.navigation, end_portal: undefined } }).warnings, []);
        assert.deepEqual(issues.errors, []);
        assert.equal(issues.warnings.length, 1);
        assert.match(issues.warnings[0], /"Hub" has no coordinates/);
    });

    test("rejects comma coordinates in any text", () => {
        const issues = validate(
            {
                navigation: { general: [], key_locations: [], end_portal: [], landmarks: [], containers: [], hidden_elements: [] },
                vanilla_changes: ["Lava starts at (5, 70, 5)"],
            },
            { contentType: "world" }
        );

        assert.match(issues.errors[0], /must use spaces/);
    });

    test("rejects notes for identifiers that are not in the packs", () => {
        const issues = validate({ items: { "test:gone": {} }, entities: { "test:gone": {} }, sounds: { "test:gone": {} } });

        assert.equal(issues.errors.length, 3);
        assert.match(issues.errors[0], /items\.test:gone: This identifier is not in the packs/);
    });

    test("warns about entities with no notes", () => {
        const entity = { identifier: "test:golem", name: "Golem", playerAccessible: true, facts: [] };

        assert.match(
            validate({ entities: { "test:golem": { notes: [] } } }, {}, { entities: [entity] }).warnings[0],
            /test:golem: Has no notes/
        );
        assert.deepEqual(validate({ entities: { "test:golem": { notes: ["Guards"] } } }, {}, { entities: [entity] }).warnings, []);
    });

    test("warns when JSON UI exists and the section is empty", () => {
        assert.match(validate({}, {}, { hasJsonUi: true }).warnings[0], /RP\/ui exists/);
    });

    test("requires a changelog release for the current version", () => {
        assert.match(validate({}, { contentVersion: "2.0.0" }).errors[0], /current content version 2\.0\.0/);
    });

    test("warns about technical changelog wording, including nested notes", () => {
        const release = (changes: unknown[]): Record<string, unknown> => ({ changelog: [{ version: "1.0.0", changes }] });

        assert.match(validate(release(["Fixed jumping bug"])).warnings[0], /what is different for the player/);
        assert.match(validate(release([{ text: "Changes", notes: ["Error resolved"] }])).warnings[0], /Error resolved/);
        assert.deepEqual(validate(release(["You can now jump higher"])).warnings, []);
    });

    test("rejects wrong Add-On spellings in guide text", () => {
        const issues = validate({ vanilla_changes: ["This addon and this add-on are wrong", "These Add-Ons are right"] });

        assert.equal(issues.errors.length, 2);
        assert.match(issues.errors[0], /not "addon"/);
        assert.match(issues.errors[1], /not "add-on"/);
    });

    test("rejects X-Ray in guide text but not in code", () => {
        assert.match(validate({ vanilla_changes: ["Adds xray vision"] }).errors[0], /X-Ray/);
        assert.deepEqual(validate({ vanilla_changes: ["Uses `test:x_ray` and `addon_id`"] }).errors, []);
    });

    test("applies the Add-On terms to Add-Ons only", () => {
        const issues = validate(
            {
                navigation: { general: [], key_locations: [], end_portal: [], landmarks: [], containers: [], hidden_elements: [] },
                vanilla_changes: ["Works with an addon and xray"],
            },
            { contentType: "world", contentName: "Mod World" }
        );

        assert.deepEqual(issues.errors, []);
    });

    test("checks the Add-On title rules", () => {
        const errorsFor = (contentName: string): string[] => validate({}, { contentName }).errors;

        assert.deepEqual(errorsFor("Dragons Add-On"), []);
        assert.match(errorsFor("Modded Dragons")[0], /"mod"/);
        assert.match(errorsFor("Xray Vision")[0], /X-Ray/);
        assert.match(errorsFor("Add-On of Dragons")[0], /suffix/);
        assert.match(errorsFor("Dragons Addon")[0], /suffix/);
        assert.deepEqual(errorsFor("Modern Dragons"), []);
    });
});
