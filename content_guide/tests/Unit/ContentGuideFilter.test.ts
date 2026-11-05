import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { parse } from "comment-json";
import ContentGuideFilter from "../../src/Lib/ContentGuideFilter";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("ContentGuideFilter", () => {
    let project: ProjectFixture;

    beforeEach(() => {
        project = new ProjectFixture();
    });

    afterEach(() => {
        project.dispose();
    });

    const createFilter = (overrides = {}): ContentGuideFilter =>
        new ContentGuideFilter(project.workingDirectory, project.projectRoot, ProjectFixture.settings(overrides));

    test("resolves the output folder inside the project root", () => {
        assert.equal(createFilter({ outputPath: "guides/final" }).resolveOutputFolder(), path.join(project.projectRoot, "guides", "final"));
    });

    test("rejects an output folder outside the project root", () => {
        assert.throws(() => createFilter({ outputPath: "../outside" }).resolveOutputFolder(), /must stay inside the project root/);
    });

    test("stops a strict run when the fonts cannot show a character", async () => {
        project.writeGuide({ ...ProjectFixture.completeGuide(), vanilla_changes: ["\u65e5\u672c\u8a9e"] });

        await assert.rejects(createFilter().run(), /cannot show these characters/);
    });

    test("shortens a very long content name in the file name", async () => {
        project.writeGuide();

        const files = await createFilter({ contentName: "A".repeat(400) }).run();

        assert.ok(path.basename(files[0]).length < 200);
    });

    test("explains when the guide cannot be written", async () => {
        project.writeGuide();
        fs.mkdirSync(path.join(project.projectRoot, "out", "Test Pack Content Guide 1.0.0.pdf"), { recursive: true });

        await assert.rejects(createFilter().run(), /Cannot write the guide/);
    });

    test("uses a clean file name when no characters of the name are valid", async () => {
        project.writeGuide();

        const files = await createFilter({ contentName: "???" }).run();

        assert.equal(path.basename(files[0]), "Content Guide 1.0.0.md");
    });

    test("removes invalid file name characters", async () => {
        project.writeGuide();

        const files = await createFilter({ contentName: 'What: "Next"?' }).run();

        assert.equal(path.basename(files[0]), "What Next Content Guide 1.0.0.md");
        assert.equal(fs.existsSync(files[1]), true);
    });

    test("saves new content in the project file, keeps comments, and stops until the notes are written", async () => {
        const text = `// Team comment\n${JSON.stringify({ ...ProjectFixture.completeGuide(), items: { "test:gone": { notes: ["Old"] } } })}`;

        project.writePacks();
        project.writeGuide();
        project.writeText("data/content_guide/content_guide.json", text);
        fs.writeFileSync(project.projectGuideFile(), text);

        await assert.rejects(createFilter().run(), /items\.test:gem\.notes: Not written/);

        const saved = fs.readFileSync(project.projectGuideFile(), "utf8");
        const guide = parse(saved, undefined, true) as unknown as { items: Record<string, unknown>; sounds: Record<string, unknown> };

        assert.match(saved, /\/\/ Team comment/);
        assert.deepEqual(guide.items["test:gem"], { notes: null });
        assert.equal(guide.items["test:gone"], undefined);
        assert.deepEqual(guide.sounds["test:block.ore.break"], { notes: null });
    });

    test("does not rewrite the project file when nothing changed", async () => {
        project.writeGuide();
        fs.writeFileSync(project.projectGuideFile(), "unchanged");

        await createFilter().run();

        assert.equal(fs.readFileSync(project.projectGuideFile(), "utf8"), "unchanged");
    });

    test("uses the data folder of the project config", async () => {
        project.writePacks();
        project.writeGuide();
        fs.writeFileSync(path.join(project.projectRoot, "config.json"), JSON.stringify({ regolith: { dataPath: "./other" } }));
        fs.mkdirSync(path.join(project.projectRoot, "other", "content_guide"), { recursive: true });
        fs.writeFileSync(path.join(project.projectRoot, "other", "content_guide", "content_guide.json"), "{}");

        await assert.rejects(createFilter().run(), /Not written/);

        assert.match(fs.readFileSync(path.join(project.projectRoot, "other", "content_guide", "content_guide.json"), "utf8"), /test:gem/);
    });

    test("names the guide file when its JSON is invalid", async () => {
        project.writeText("data/content_guide/content_guide.json", "{");

        await assert.rejects(createFilter().run(), /Invalid JSON in data\/content_guide\/content_guide\.json/);
    });
});
