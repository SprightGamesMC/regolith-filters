import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "node:test";
import type { BuildResult } from "esbuild";
import type { TsCompileSettings } from "../../src/Types/TsCompileTypes";
import EsbuildCompiler from "../../src/Lib/EsbuildCompiler";
import FilterLogger from "../../src/Lib/FilterLogger";
import ProjectExportResolver from "../../src/Lib/ProjectExportResolver";

/**
 * Creates a compiler with fixed workspace and project roots.
 *
 * @returns Compiler instance.
 */
function createCompiler(): EsbuildCompiler {
    const settings = {
        buildOptions: {},
        modules: [],
        sourceDir: "BP/scripts/src",
        sourceEntry: "main.ts",
    } as unknown as TsCompileSettings;
    const exportResolver = new ProjectExportResolver({ projectRoot: path.resolve("/project"), settings });

    return new EsbuildCompiler(new FilterLogger(), path.resolve("/workspace"), path.resolve("/project"), exportResolver);
}

describe("EsbuildCompiler.createBuildOptions", () => {
    const compiler = createCompiler();

    test("applies the filter defaults", () => {
        const buildOptions = compiler.createBuildOptions({});

        assert.equal(buildOptions.absWorkingDir, path.resolve("/project"));
        assert.equal(buildOptions.format, "esm");
        assert.equal(buildOptions.target, "es2020");
        assert.equal(buildOptions.metafile, true);
        assert.equal(buildOptions.plugins?.length, 1);
        assert.equal(buildOptions.plugins?.[0].name, "tscompile-json");
    });

    test("keeps caller overrides and appends the JSON plugin", () => {
        const customPlugin = { name: "custom", setup: () => undefined };

        const buildOptions = compiler.createBuildOptions({ format: "iife", target: "es2021", plugins: [customPlugin] });

        assert.equal(buildOptions.format, "iife");
        assert.equal(buildOptions.target, "es2021");
        assert.deepEqual(
            buildOptions.plugins?.map((plugin) => plugin.name),
            ["custom", "tscompile-json"]
        );
    });
});

describe("EsbuildCompiler.createSplitBuildOutputPath", () => {
    const compiler = createCompiler();

    test("maps an entry into the output directory with a .js extension", () => {
        const outputPath = compiler.createSplitBuildOutputPath("BP/scripts/src", path.resolve("/out"), "BP/scripts/src/sub/entry.mts");

        assert.equal(outputPath, path.resolve("/out", "sub", "entry.js"));
    });

    test("resolves a relative outdir against the workspace root", () => {
        const outputPath = compiler.createSplitBuildOutputPath("BP/scripts/src", "BP/scripts", "BP/scripts/src/main.ts");

        assert.equal(outputPath, path.resolve("/workspace", "BP", "scripts", "main.js"));
    });
});

describe("EsbuildCompiler.validateSplitBuildOutputPaths", () => {
    const compiler = createCompiler();

    test("accepts unique output paths", () => {
        assert.doesNotThrow(() => {
            compiler.validateSplitBuildOutputPaths("src", "out", ["src/a.ts", "src/b.ts"]);
        });
    });

    test("rejects entries that collide on one output path", () => {
        assert.throws(() => {
            compiler.validateSplitBuildOutputPaths("src", "out", ["src/a.ts", "src/a.mts"]);
        }, /would both emit/);
    });
});

describe("EsbuildCompiler.collectJavaScriptOutputs", () => {
    const compiler = createCompiler();

    test("collects .js outputs as absolute paths", () => {
        const buildResult = {
            metafile: {
                outputs: {
                    "BP/scripts/main.js": {},
                    "BP/scripts/main.js.map": {},
                },
            },
        } as unknown as BuildResult;

        assert.deepEqual(compiler.collectJavaScriptOutputs(buildResult, path.resolve("/project")), [
            path.resolve("/project", "BP", "scripts", "main.js"),
        ]);
    });

    test("returns an empty list without a metafile", () => {
        assert.deepEqual(compiler.collectJavaScriptOutputs({} as BuildResult, path.resolve("/project")), []);
    });
});

describe("EsbuildCompiler.compileSplitDebuggerBuilds", () => {
    const compiler = createCompiler();

    test("rejects incomplete split configuration", async () => {
        const settings = {
            buildOptions: { entryPoints: [] },
            sourceDir: "BP/scripts/src",
        } as unknown as TsCompileSettings;

        await assert.rejects(compiler.compileSplitDebuggerBuilds(settings), /require "entryPoints", "outdir", and "sourceDir"/);
    });
});

describe("EsbuildCompiler.toAbsolutePath", () => {
    const compiler = createCompiler();

    test("resolves relative paths against the workspace root", () => {
        assert.equal(compiler.toAbsolutePath("BP/scripts/main.js"), path.resolve("/workspace", "BP", "scripts", "main.js"));
    });

    test("keeps absolute paths", () => {
        assert.equal(compiler.toAbsolutePath(path.resolve("/x/y.js")), path.resolve("/x/y.js"));
    });
});
