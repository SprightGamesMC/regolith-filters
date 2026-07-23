import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { SourceMapConsumer, SourceMapGenerator } from "source-map";
import type { TsCompileSettings } from "../../src/Types/TsCompileTypes";
import FilterLogger from "../../src/Lib/FilterLogger";
import OutputCapture from "../Helpers/OutputCapture";
import ProjectExportResolver from "../../src/Lib/ProjectExportResolver";
import RuntimeSourceMapInjector from "../../src/Lib/RuntimeSourceMapInjector";
import WorkspaceFixture from "../Helpers/WorkspaceFixture";

/**
 * Creates an injector rooted at a fixture project.
 *
 * @param fixture - Active workspace fixture.
 *
 * @returns Injector instance.
 */
function createInjector(fixture: WorkspaceFixture): RuntimeSourceMapInjector {
    const settings = {
        buildOptions: {},
        enableDebugger: true,
        keepSource: false,
        modules: [],
        sourceDir: "BP/scripts/src",
        sourceEntry: "main.ts",
    } as unknown as TsCompileSettings;
    const exportResolver = new ProjectExportResolver({ projectRoot: fixture.workspacePath, settings });

    return new RuntimeSourceMapInjector({
        exportResolver,
        logger: new FilterLogger(),
        projectRoot: fixture.workspacePath,
        settings,
        toScriptsProjectPath: (relativePath) => `BP/scripts/${relativePath}`,
    });
}

/**
 * Builds a minimal sourcemap with one mapping per generated line.
 *
 * @param sourcePath - Source path recorded in the map.
 * @param generatedLineCount - Number of generated lines to map.
 *
 * @returns Serialized sourcemap JSON.
 */
function createSourceMap(sourcePath: string, generatedLineCount: number): string {
    const generator = new SourceMapGenerator({ file: "main.js" });

    for (let line = 1; line <= generatedLineCount; line += 1) {
        generator.addMapping({
            generated: { column: 0, line },
            original: { column: 0, line: line + 10 },
            source: sourcePath,
        });
    }

    return generator.toString();
}

describe("RuntimeSourceMapInjector.cleanMappedSourcePath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("strips the source directory prefix", () => {
        const injector = createInjector(fixture);

        assert.equal(injector.cleanMappedSourcePath("../../BP/scripts/src/sub/file.ts", "BP/scripts/src"), "sub/file.ts");
    });

    test("strips the source directory basename prefix", () => {
        const injector = createInjector(fixture);

        assert.equal(injector.cleanMappedSourcePath("src/file.ts", "BP/scripts/src"), "file.ts");
        assert.equal(injector.cleanMappedSourcePath("src", "BP/scripts/src"), "");
    });

    test("relativizes absolute sources against the local source directory", () => {
        const injector = createInjector(fixture);
        const absoluteSource = fixture.resolve(path.join("BP", "scripts", "src", "file.ts"));

        assert.equal(injector.cleanMappedSourcePath(absoluteSource, "BP/scripts/src"), "file.ts");
    });

    test("passes through unrelated sources", () => {
        assert.equal(createInjector(fixture).cleanMappedSourcePath("other/file.ts", "BP/scripts/src"), "other/file.ts");
    });
});

describe("RuntimeSourceMapInjector.resolveOriginalSourcePath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("keeps absolute sources", () => {
        const absolutePath = path.resolve("/abs/file.ts");

        assert.equal(createInjector(fixture).resolveOriginalSourcePath(fixture.workspacePath, absolutePath), absolutePath);
    });

    test("resolves relative sources against the map directory", () => {
        assert.equal(
            createInjector(fixture).resolveOriginalSourcePath(fixture.workspacePath, "../src/file.ts"),
            path.resolve(fixture.workspacePath, "..", "src", "file.ts")
        );
    });
});

describe("RuntimeSourceMapInjector.resolveGeneratedMapPath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("falls back to the workspace map path without export config", () => {
        const mapPath = fixture.resolve("main.js.map");

        assert.equal(createInjector(fixture).resolveGeneratedMapPath(mapPath, "main.js"), mapPath);
    });
});

describe("RuntimeSourceMapInjector.generateSourceMapping", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("injects a line mapping header into the output", async () => {
        const outputPath = fixture.writeFile("BP/scripts/main.js", "line1;\nline2;");
        fixture.writeFile("BP/scripts/main.js.map", createSourceMap("../../BP/scripts/src/main.ts", 2));

        const injected = await createInjector(fixture).generateSourceMapping(outputPath, "main.js");

        assert.equal(injected, true);

        const outputContent = fixture.readText("BP/scripts/main.js");
        assert.match(outputContent, /^var globalSourceMapping = /);

        const mappingJson = JSON.parse(outputContent.split("\n")[0].replace("var globalSourceMapping = ", "").replace(/;$/, ""));
        assert.deepEqual(mappingJson["1"], { originalLine: 11, source: "main.ts" });
        assert.deepEqual(mappingJson.metadata, { filePath: "main.js", offset: 1 });
    });

    test("warns and skips when the sourcemap is missing", async () => {
        const outputPath = fixture.writeFile("BP/scripts/main.js", "line1;");
        let injected = true;

        const output = await OutputCapture.record(async () => {
            injected = await createInjector(fixture).generateSourceMapping(outputPath, "main.js");
        });

        assert.equal(injected, false);
        assert.match(output.stderrText, /could not find the generated sourcemap/);
    });
});

describe("RuntimeSourceMapInjector.adjustSourceMap", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("offsets generated lines by the requested amount", async () => {
        const mapPath = fixture.writeFile("BP/scripts/main.js.map", createSourceMap("../../BP/scripts/src/main.ts", 2));

        await createInjector(fixture).adjustSourceMap(mapPath, "main.js", 1);

        await SourceMapConsumer.with(fixture.readText("BP/scripts/main.js.map"), null, (consumer) => {
            const generatedLines: number[] = [];

            consumer.eachMapping((mappingEntry) => {
                generatedLines.push(mappingEntry.generatedLine);
            });

            assert.deepEqual(generatedLines, [2, 3]);
        });
    });
});
