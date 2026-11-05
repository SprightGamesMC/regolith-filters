import type { CatalogEntry, GuideDocument, GuideSection, PackCatalog } from "../../src/Types/ContentGuideTypes";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import GuideBuilder from "../../src/Lib/GuideBuilder";
import GuideDataReader from "../../src/Lib/GuideDataReader";
import GuideIssues from "../../src/Lib/GuideIssues";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("GuideBuilder.build", () => {
    const build = (changes: Record<string, unknown> = {}, catalog: Partial<PackCatalog> = {}): GuideDocument => {
        const data = new GuideDataReader(new GuideIssues()).read({ ...ProjectFixture.completeGuide(), ...changes });

        return new GuideBuilder(data, ProjectFixture.catalog(catalog), ProjectFixture.settings()).build();
    };

    const find = (sections: GuideSection[], ...titles: string[]): GuideSection => {
        const section = sections.find((entry) => entry.title === titles[0]);

        assert.ok(section, `Missing section ${titles[0]}`);

        return titles.length === 1 ? section : find(section.sections, ...titles.slice(1));
    };

    const gem: CatalogEntry = {
        identifier: "test:gem",
        name: "Gem",
        playerAccessible: true,
        facts: [{ text: "Cannot be crafted", isTag: true, recipe: null }],
    };

    test("uses the section titles from the requirements", () => {
        const { sections } = build();

        for (const title of ["General", "Key Locations", "Landmarks", "Containers", "Easter Eggs / Hidden Elements"]) {
            find(sections, "Design", "Navigation", title);
        }

        for (const title of ["Mechanics", "User Interface (UI)", "Additional Key Bindings"]) {
            find(sections, "Design", "Gameplay Elements", title);
        }

        find(sections, "Technical Elements", "Custom Inventory Items", "Non-Player Accessible");
        find(sections, "Technical Elements", "Custom Creatures, Entities, and Decorations", "Player Accessible");
    });

    test("lists the end portals of a map only", () => {
        const navigation = {
            general: [],
            key_locations: [],
            end_portal: [{ text: "Stronghold", locations: ["0 30 3600"] }],
            landmarks: [],
            containers: [],
            hidden_elements: [],
        };
        const data = new GuideDataReader(new GuideIssues()).read({ ...ProjectFixture.completeGuide(), navigation });
        const titles = (contentType: "world" | "addon"): string[] =>
            find(
                new GuideBuilder(data, ProjectFixture.catalog(), ProjectFixture.settings({ contentType })).build().sections,
                "Design",
                "Navigation"
            ).sections.map((section) => section.title);
        const portal = find(
            new GuideBuilder(data, ProjectFixture.catalog(), ProjectFixture.settings({ contentType: "world" })).build().sections,
            "Design",
            "Navigation",
            "End Portal"
        );

        assert.deepEqual(titles("world").slice(0, 3), ["General", "Key Locations", "End Portal"]);
        assert.ok(!titles("addon").includes("End Portal"));
        assert.equal(portal.lines[0].text, "Stronghold (`0 30 3600`)");
    });

    test("prints none for an empty section and TODO for one that is not written", () => {
        const { sections } = build({ characters: null });

        assert.deepEqual(find(sections, "Design", "Navigation", "General").paragraphs, ["None."]);
        assert.deepEqual(find(sections, "Design", "Characters and Villagers").paragraphs, [GuideBuilder.TODO_TEXT]);
    });

    test("adds a teleport command to steps with coordinates", () => {
        const step = find(build().sections, "Design", "Completion Guide").lines[0];

        assert.equal(step.text, "Go to the house (`10 70 130`)");
        assert.deepEqual(step.children, [{ label: "Return", text: "`/tp @s 10 70 130`", children: [] }]);
    });

    test("writes step requirements, an authored skip, and an authored return", () => {
        const labels = (step: Record<string, unknown>): string[] =>
            find(build({ completion_guide: [{ text: "Win", ...step }] }).sections, "Design", "Completion Guide").lines[0].children.map(
                (child) => `${child.label}: ${child.text}`
            );

        assert.deepEqual(labels({ requirement: "/A sword", skip: "Open the debug menu" }), [
            "Requires: /A sword",
            "Skip: Open the debug menu",
        ]);
        assert.deepEqual(labels({ locations: ["1 2 3"], skip: "/function skip" }), ["Skip: `/function skip`", "Return: `/tp @s 1 2 3`"]);
        assert.deepEqual(labels({ locations: ["1 2 3"], return: "/function reset" }), ["Return: `/function reset`"]);
    });

    test("splits generated content and puts authored notes before facts", () => {
        const secret = { identifier: "test:secret", name: "Secret", playerAccessible: false, facts: [] };
        const { sections } = build({ items: { "test:gem": { notes: ["Shines"] } } }, { items: [secret, gem] });
        const accessible = find(sections, "Technical Elements", "Custom Inventory Items", "Player Accessible");
        const hidden = find(sections, "Technical Elements", "Custom Inventory Items", "Non-Player Accessible");

        assert.equal(accessible.lines[0].text, "Gem");
        assert.equal(accessible.lines[0].identifier, "test:gem");
        assert.equal(accessible.lines[0].children[1].isTag, true);
        assert.deepEqual(
            accessible.lines[0].children.map((child) => child.text),
            ["Shines", "Cannot be crafted"]
        );
        assert.equal(hidden.lines[0].text, "Secret");
    });

    test("applies authored names and accessibility", () => {
        const { sections } = build({ items: { "test:gem": { name: "Ruby", player_accessible: false } } }, { items: [gem] });

        assert.deepEqual(find(sections, "Technical Elements", "Custom Inventory Items", "Player Accessible").lines, []);
        assert.equal(find(sections, "Technical Elements", "Custom Inventory Items", "Non-Player Accessible").lines[0].text, "Ruby");
    });

    test("sorts generated content by name", () => {
        const zinc = { ...gem, identifier: "test:zinc", name: "Zinc" };
        const { sections } = build({}, { items: [zinc, gem] });

        assert.deepEqual(
            find(sections, "Technical Elements", "Custom Inventory Items", "Player Accessible").lines.map((line) => line.text),
            ["Gem", "Zinc"]
        );
    });

    test("replaces generated tags with authored tags", () => {
        const egg = { ...gem, identifier: "test:egg", name: "Egg", facts: [{ text: "Cannot be crafted", isTag: true, recipe: null }] };
        const { sections } = build({ items: { "test:egg": { tags: ["Caught in a net"] } } }, { items: [egg] });
        const [line] = find(sections, "Technical Elements", "Custom Inventory Items", "Player Accessible").lines;

        assert.deepEqual(
            line.children.filter((child) => child.isTag).map((child) => child.text),
            ["Caught in a net"]
        );
    });

    test("sorts numbers in names by value", () => {
        const second = { ...gem, identifier: "test:variant_2", name: "Variant 2" };
        const tenth = { ...gem, identifier: "test:variant_10", name: "Variant 10" };
        const { sections } = build({}, { items: [tenth, second] });

        assert.deepEqual(
            find(sections, "Technical Elements", "Custom Inventory Items", "Player Accessible").lines.map((line) => line.text),
            ["Variant 2", "Variant 10"]
        );
    });

    test("lists authored vanilla changes before generated edits", () => {
        const { sections } = build({ vanilla_changes: ["Jump height is doubled"] }, { vanillaEdits: ["Adds a recipe for Stone"] });

        assert.deepEqual(
            find(sections, "Technical Elements", "Changes to Original Minecraft Functionality").lines.map((line) => line.text),
            ["Jump height is doubled", "Adds a recipe for Stone"]
        );
    });

    test("adds only the credits that are set", () => {
        const data = new GuideDataReader(new GuideIssues()).read(ProjectFixture.completeGuide());
        const credits = (creatorTeamName: string | null, partnerName: string | null): string[] =>
            new GuideBuilder(data, ProjectFixture.catalog(), ProjectFixture.settings({ creatorTeamName, partnerName })).build().credits;

        assert.deepEqual(credits("Team", "Spright"), ["Creator Team: Team", "Partner: Spright"]);
        assert.deepEqual(credits(null, "Spright"), ["Partner: Spright"]);
        assert.deepEqual(credits(null, null), []);
    });

    test("counts the generated content", () => {
        assert.deepEqual(
            build({}, { items: [gem] }).stats.map((stat) => stat.value),
            ["1", "0", "0"]
        );
    });

    test("marks the sounds as a compact table and changelog releases as headings", () => {
        const { sections } = build();

        assert.equal(find(sections, "Technical Elements", "Custom Sounds").isCompact, true);
        assert.equal(find(sections, "Changelog").lines[0].isHeading, true);
    });

    test("uses the date of the current release", () => {
        const document = build();

        assert.equal(document.date, "2026-11-04");
        assert.equal(document.contentTypeLabel, "Add-On");
        assert.equal(find(document.sections, "Changelog").lines[0].text, "Version 1.0.0 (2026-11-04)");
    });
});
