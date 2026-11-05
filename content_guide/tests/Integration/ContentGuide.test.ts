import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import Main from "../../src/Main";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("Main.run", () => {
    const originalCwd = process.cwd();
    const originalArgument = process.argv[2];
    const originalRootDirectory = process.env.ROOT_DIR;
    const originalStderrWrite = process.stderr.write;
    const originalStdoutWrite = process.stdout.write;
    let project: ProjectFixture;
    let errorOutput: string;

    beforeEach(() => {
        project = new ProjectFixture();
        errorOutput = "";
        process.chdir(project.workingDirectory);
        process.env.ROOT_DIR = project.projectRoot;
        process.argv[2] = JSON.stringify({ content_name: "Test Pack", content_type: "addon", content_version: [1, 0, 0] });
        process.stderr.write = ((text: string) => {
            errorOutput += text;
            return true;
        }) as typeof process.stderr.write;
        process.stdout.write = (() => true) as typeof process.stdout.write;
    });

    afterEach(() => {
        process.stderr.write = originalStderrWrite;
        process.stdout.write = originalStdoutWrite;
        process.chdir(originalCwd);
        process.argv[2] = originalArgument;
        project.dispose();

        if (originalRootDirectory === undefined) {
            delete process.env.ROOT_DIR;
            return;
        }

        process.env.ROOT_DIR = originalRootDirectory;
    });

    const outputPath = (extension: string): string =>
        path.join(project.projectRoot, "build", "content_guide", `Test Pack Content Guide 1.0.0.${extension}`);

    test("writes a Markdown and PDF guide from guide data and packs", async () => {
        project.writePacks();
        project.writeGuide({
            ...ProjectFixture.completeGuide(),
            items: Object.fromEntries(
                ["test:gem", "test:secret", "test:ore", "test:golem_spawn_egg", "minecraft:slime_ball"].map((identifier) => [
                    identifier,
                    { notes: [] },
                ])
            ),
            entities: { "test:golem": { notes: ["Guards the ore"] }, "test:bolt": { notes: [] }, "minecraft:cow": { notes: [] } },
            sounds: { "test:block.ore.break": { notes: [] } },
        });

        await new Main().run();

        const markdown = fs.readFileSync(outputPath("md"), "utf8");

        assert.equal(fs.readFileSync(outputPath("pdf")).subarray(0, 5).toString(), "%PDF-");
        assert.match(markdown, /# Test Pack/);
        assert.match(markdown, /Go to the house \(`10 70 130`\)/);
        assert.match(markdown, /Return: `\/tp @s 10 70 130`/);
        assert.match(markdown, /Farmer Joe \(`150 70 0`\)/);
        assert.match(markdown, /Shiny Gem \(`test:gem`\)\n {4}- Cannot be crafted\n {4}- Dropped by Gem Ore/);
        assert.match(markdown, /Stone Golem \(`test:golem`\)\n {4}- Guards the ore\n {4}- Spawns naturally/);
        assert.match(markdown, /Adds a recipe for Slime Ball \(`minecraft:slime_ball`\)/);
        assert.match(markdown, /Edits the vanilla entity Cow \(`minecraft:cow`\)/);
        assert.match(markdown, /Block Ore Break \(`test:block\.ore\.break`\)/);
        assert.match(markdown, /Version 1\.0\.0 \(2026-11-04\)\n {4}- Initial release/);
        assert.match(errorOutput, /entities\.test:bolt: Has no notes/);
    });

    test("orders sections as the requirements define", async () => {
        project.writeGuide();

        await new Main().run();

        const headings = fs
            .readFileSync(outputPath("md"), "utf8")
            .split("\n")
            .filter((line) => line.startsWith("## ") || line.startsWith("### "));

        assert.deepEqual(headings, [
            "## Design",
            "### Completion Guide",
            "### Navigation",
            "### Characters and Villagers",
            "### Gameplay Elements",
            "## Technical Elements",
            "### Changes to Original Minecraft Functionality",
            "### Custom Inventory Items",
            "### Custom Creatures, Entities, and Decorations",
            "### Custom Sounds",
            "## Changelog",
        ]);
    });

    test("writes nothing and lists every error when strict", async () => {
        project.writeGuide({ ...ProjectFixture.completeGuide(), characters: null, changelog: [] });

        await assert.rejects(new Main().run(), (error: Error) => {
            assert.match(error.message, /2 errors/);
            assert.match(error.message, /characters: Not written/);
            assert.match(error.message, /changelog: Needs a release for the current content version 1\.0\.0/);
            return true;
        });
        assert.equal(fs.existsSync(outputPath("md")), false);
    });

    test("writes TODO text and prints errors when not strict", async () => {
        process.argv[2] = JSON.stringify({ content_name: "Test Pack", content_type: "addon", content_version: [1, 0, 0], strict: false });
        project.writeGuide({ ...ProjectFixture.completeGuide(), characters: null });

        await new Main().run();

        assert.match(fs.readFileSync(outputPath("md"), "utf8"), /### Characters and Villagers\n\nTODO: Write this section/);
        assert.match(errorOutput, /characters: Not written/);
    });

    test("shows a sound with notes in full and marks notes that are not written", async () => {
        process.argv[2] = JSON.stringify({ content_name: "Test Pack", content_type: "addon", content_version: [1, 0, 0], strict: false });
        project.writePacks();
        project.writeGuide({ ...ProjectFixture.completeGuide(), sounds: { "test:block.ore.break": { notes: ["Plays when ore breaks"] } } });

        await new Main().run();

        const markdown = fs.readFileSync(outputPath("md"), "utf8");

        assert.match(markdown, /Plays when ore breaks/);
        assert.match(markdown, /Shiny Gem \(`test:gem`\)\n {4}- TODO: Write these notes/);
    });

    test("reads guide data with comments", async () => {
        project.writeText("data/content_guide/content_guide.json", `// Comment\n${JSON.stringify(ProjectFixture.completeGuide())}`);

        await new Main().run();

        assert.equal(fs.existsSync(outputPath("pdf")), true);
    });

    test("creates a blank guide file when it is missing", async () => {
        await assert.rejects(new Main().run(), /completion_guide: Not written/);

        assert.match(fs.readFileSync(project.projectGuideFile(), "utf8"), /"completion_guide": null/);
        assert.match(errorOutput, /Missing, so a blank one was created/);
    });

    test("finds the project root two levels up when ROOT_DIR is unset", async () => {
        delete process.env.ROOT_DIR;
        project.writeGuide();

        await new Main().run();

        assert.equal(fs.existsSync(outputPath("md")), true);
    });
});
