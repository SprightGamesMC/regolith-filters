import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import OutputCapture from "../Helpers/OutputCapture";
import TsCompileFilter from "../../src/Lib/TsCompileFilter";
import WorkspaceFixture from "../Helpers/WorkspaceFixture";

/**
 * Creates a filter instance with the given raw settings.
 *
 * @param rawSettings - Raw JSON settings.
 *
 * @returns Filter instance.
 */
function createFilter(rawSettings: Record<string, unknown> = {}): TsCompileFilter {
    return new TsCompileFilter(path.resolve("/workspace"), path.resolve("/project"), rawSettings);
}

/**
 * Creates a filter rooted in a workspace fixture that acts as cwd and project root.
 *
 * @param fixture - Active workspace fixture.
 * @param rawSettings - Raw JSON settings.
 *
 * @returns Filter instance.
 */
function createFixtureFilter(fixture: WorkspaceFixture, rawSettings: Record<string, unknown> = {}): TsCompileFilter {
    return new TsCompileFilter(fixture.workspacePath, fixture.workspacePath, rawSettings);
}

describe("TsCompileFilter.createSettings", () => {
    const filter = createFilter();

    test("applies canonical defaults", () => {
        const settings = filter.createSettings({});

        assert.equal(settings.sourceDir, "BP/scripts/src");
        assert.equal(settings.sourceEntry, "main.ts");
        assert.equal(settings.keepSource, false);
        assert.equal(settings.enableDebugger, false);
        assert.equal(settings.buildOptions.bundle, true);
        assert.equal(settings.buildOptions.minify, true);
        assert.deepEqual(settings.modules, ["@minecraft/server@2.0.0"]);
    });

    test("merges build options over defaults", () => {
        const settings = filter.createSettings({ buildOptions: { minify: false } });

        assert.equal(settings.buildOptions.bundle, true);
        assert.equal(settings.buildOptions.minify, false);
    });

    test("ignores a non-object buildOptions value", () => {
        const settings = filter.createSettings({ buildOptions: [1, 2] });

        assert.equal(settings.buildOptions.bundle, true);
    });
});

describe("TsCompileFilter.normalizeSettings", () => {
    test("normalizes separators in path settings", () => {
        const filter = createFilter({ sourceDir: "BP\\scripts\\src", sourceEntry: "sub\\main.ts" });

        filter.normalizeSettings();

        assert.equal(filter.getSourceEntryProjectPath(), "BP/scripts/src/sub/main.ts");
    });
});

describe("TsCompileFilter.ensureResolvedPaths", () => {
    test("derives in-place output paths when source is removed", () => {
        const filter = createFilter();

        assert.equal(filter.getActiveDistDir(), ".");
        assert.equal(filter.getDerivedOutputPath(), "main.js");
        assert.equal(filter.getCompiledOutputPath(), path.resolve("/workspace", "BP", "scripts", "main.js"));
    });

    test("derives dist output paths when source is kept", () => {
        const filter = createFilter({ keepSource: true });

        assert.equal(filter.getActiveDistDir(), "dist");
        assert.equal(filter.getDerivedOutputPath(), "dist/main.js");
    });

    test("maps nested entry extensions to .js", () => {
        const filter = createFilter({ sourceEntry: "sub/entry.mts" });

        assert.equal(filter.getDerivedOutputPath(), "sub/entry.js");
    });
});

describe("TsCompileFilter.configureBuildOutputPaths", () => {
    /**
     * Reads the private settings of a filter for assertions.
     *
     * @param filter - Filter instance.
     *
     * @returns Resolved filter settings.
     */
    function readSettings(filter: TsCompileFilter): { buildOptions: { outdir?: string; outfile?: string } } {
        return (filter as unknown as { settings: { buildOptions: { outdir?: string; outfile?: string } } }).settings;
    }

    test("sets outfile and clears outdir for bundled builds", () => {
        const filter = createFilter({ buildOptions: { outdir: "stale" } });

        filter.configureBuildOutputPaths();

        const settings = readSettings(filter);
        assert.equal(settings.buildOptions.outdir, undefined);
        assert.equal(settings.buildOptions.outfile, path.resolve("/workspace", "BP", "scripts", "main.js"));
    });

    test("sets outdir for split builds", () => {
        const filter = createFilter({ buildOptions: { bundle: false } });

        filter.configureBuildOutputPaths();

        const settings = readSettings(filter);
        assert.equal(settings.buildOptions.outfile, undefined);
        assert.equal(settings.buildOptions.outdir, path.resolve("/workspace", "BP", "scripts"));
    });
});

describe("TsCompileFilter.parseModules", () => {
    test("parses valid module strings", () => {
        assert.deepEqual(createFilter().parseModules(), [{ name: "@minecraft/server", version: "2.0.0" }]);
    });

    test("parses prerelease versions", () => {
        assert.deepEqual(createFilter({ modules: ["@minecraft/server-ui@2.1.0-beta"] }).parseModules(), [
            { name: "@minecraft/server-ui", version: "2.1.0-beta" },
        ]);
    });

    test("throws on an invalid module string", () => {
        assert.throws(() => createFilter({ modules: ["not-a-module"] }).parseModules(), /Invalid module entry/);
    });
});

describe("TsCompileFilter.applyExternalModules", () => {
    /**
     * Reads the private build options of a filter for assertions.
     *
     * @param filter - Filter instance.
     *
     * @returns Resolved build options.
     */
    function readBuildOptions(filter: TsCompileFilter): { external?: string[] } {
        return (filter as unknown as { settings: { buildOptions: { external?: string[] } } }).settings.buildOptions;
    }

    test("adds module names to externals without duplicates", () => {
        const filter = createFilter({ modules: ["@minecraft/server@2.0.0", "@minecraft/server-ui@1.0.0"] });

        filter.applyExternalModules();
        filter.applyExternalModules();

        assert.deepEqual(readBuildOptions(filter).external, ["@minecraft/server", "@minecraft/server-ui"]);
    });

    test("drops externals for split builds", () => {
        const filter = createFilter({ buildOptions: { bundle: false } });

        filter.applyExternalModules();

        assert.equal(readBuildOptions(filter).external, undefined);
    });
});

describe("TsCompileFilter.validateSettings", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
        fixture.writeFile("BP/scripts/src/main.ts", "export {};");
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Creates a fixture filter with a valid module UUID plus overrides.
     *
     * @param rawSettings - Raw setting overrides.
     *
     * @returns Filter instance.
     */
    function createValidatableFilter(rawSettings: Record<string, unknown> = {}): TsCompileFilter {
        return createFixtureFilter(fixture, { moduleUUID: "12345678-1234-4123-8123-1234567890ab", ...rawSettings });
    }

    test("accepts a valid default configuration", () => {
        assert.doesNotThrow(() => createValidatableFilter().validateSettings());
    });

    test("requires a module UUID when manifest modification is enabled", () => {
        assert.throws(() => createFixtureFilter(fixture).validateSettings(), /"moduleUUID" must be set/);
    });

    test("rejects an invalid module UUID", () => {
        assert.throws(() => createValidatableFilter({ moduleUUID: "not-a-uuid" }).validateSettings(), /not a valid UUID v4/);
    });

    test("skips the UUID requirement when manifest modification is disabled", () => {
        assert.doesNotThrow(() => createFixtureFilter(fixture, { disableManifestModification: true }).validateSettings());
    });

    test("rejects wrong setting types", () => {
        assert.throws(() => createValidatableFilter({ keepSource: "yes" }).validateSettings(), /"keepSource" must be a boolean/);
        assert.throws(() => createValidatableFilter({ modules: "x" }).validateSettings(), /"modules" must be an array/);
    });

    test("rejects direct entryPoints configuration", () => {
        assert.throws(
            () => createValidatableFilter({ buildOptions: { entryPoints: ["x.ts"] } }).validateSettings(),
            /Do not set "buildOptions.entryPoints"/
        );
    });

    test("rejects the debugger with minified output", () => {
        assert.throws(
            () => createValidatableFilter({ enableDebugger: true, debuggerProfile: "dev" }).validateSettings(),
            /requires "buildOptions.minify" to be false/
        );
    });

    test("rejects debuggerProfile without the debugger", () => {
        assert.throws(() => createValidatableFilter({ debuggerProfile: "dev" }).validateSettings(), /only valid when "enableDebugger"/);
    });

    test("rejects an unsupported sourceEntry extension", () => {
        fixture.writeFile("BP/scripts/src/main.txt", "x");

        assert.throws(() => createValidatableFilter({ sourceEntry: "main.txt" }).validateSettings(), /script extensions/);
    });

    test("rejects an absolute sourceEntry", () => {
        assert.throws(() => createValidatableFilter({ sourceEntry: "/main.ts" }).validateSettings(), /must be a relative path/);
    });

    test("rejects a sourceEntry escaping sourceDir", () => {
        assert.throws(() => createValidatableFilter({ sourceEntry: "../outside.ts" }).validateSettings(), /stay inside "sourceDir"/);
    });

    test("rejects a sourceDir outside the scripts root when source is removed", () => {
        fixture.writeFile("Elsewhere/main.ts", "export {};");

        assert.throws(() => createValidatableFilter({ sourceDir: "Elsewhere" }).validateSettings(), /must stay inside/);
    });

    test("rejects a missing sourceDir", () => {
        assert.throws(() => createValidatableFilter({ sourceDir: "BP/scripts/gone" }).validateSettings(), /Could not find "sourceDir"/);
    });

    test("rejects a sourceDir that is a file", () => {
        fixture.writeFile("BP/scripts/file.ts", "export {};");

        assert.throws(() => createValidatableFilter({ sourceDir: "BP/scripts/file.ts" }).validateSettings(), /must point to a directory/);
    });

    test("rejects a missing sourceEntry file", () => {
        assert.throws(() => createValidatableFilter({ sourceEntry: "gone.ts" }).validateSettings(), /Could not find "sourceEntry"/);
    });

    test("rejects a kept sourceDir overlapping the dist folder", () => {
        fixture.writeFile("BP/scripts/dist/main.ts", "export {};");

        assert.throws(
            () => createValidatableFilter({ keepSource: true, sourceDir: "BP/scripts/dist" }).validateSettings(),
            /reserved for compiled output/
        );
    });

    test("accepts a kept sourceDir outside the behavior pack", () => {
        fixture.writeFile("scripts-src/main.ts", "export {};");

        assert.doesNotThrow(() => createValidatableFilter({ keepSource: true, sourceDir: "scripts-src" }).validateSettings());
    });
});

describe("TsCompileFilter.configureEntryPoint", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("uses the source entry for bundled builds", () => {
        const filter = createFilter();

        filter.configureEntryPoint();

        assert.deepEqual(filter.analyzeSplitBuildEntries(), []);
    });

    test("globs every script for split builds", () => {
        fixture.writeFile("BP/scripts/src/main.ts", "export {};");
        fixture.writeFile("BP/scripts/src/util/extra.mts", "export {};");
        fixture.writeFile("BP/scripts/src/types.d.ts", "export {};");
        fixture.writeFile("BP/scripts/src/readme.md", "x");

        const filter = createFixtureFilter(fixture, { buildOptions: { bundle: false } });

        filter.configureEntryPoint();

        const entryPoints = filter.analyzeSplitBuildEntries().map((analysis) => analysis.entryPoint);
        assert.deepEqual(entryPoints.sort(), ["BP/scripts/src/main.ts", "BP/scripts/src/util/extra.mts"]);
    });

    test("throws when a split build finds no scripts", () => {
        fixture.makeDirectory("BP/scripts/src");

        const filter = createFixtureFilter(fixture, { buildOptions: { bundle: false } });

        assert.throws(() => filter.configureEntryPoint(), /No supported script files/);
    });
});

describe("TsCompileFilter.validateSplitBuildEntries", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("rejects JSON imports in split builds", () => {
        fixture.writeFile("BP/scripts/src/main.ts", 'import data from "./data.json";\nexport { data };');

        const filter = createFixtureFilter(fixture, { buildOptions: { bundle: false } });
        filter.configureEntryPoint();

        assert.throws(() => filter.validateSplitBuildEntries(), /JSON imports require bundling/);
    });

    test("warns about CommonJS syntax in split builds", async () => {
        fixture.writeFile("BP/scripts/src/main.ts", 'const x = require("thing");');

        const filter = createFixtureFilter(fixture, { buildOptions: { bundle: false } });
        filter.configureEntryPoint();

        const output = await OutputCapture.record(() => filter.validateSplitBuildEntries());

        assert.match(output.stderrText, /Possible CommonJS syntax/);
    });

    test("does nothing for bundled builds", () => {
        assert.doesNotThrow(() => createFilter().validateSplitBuildEntries());
    });
});

describe("TsCompileFilter.updateManifest", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
        fixture.writeFile("BP/manifest.json", JSON.stringify({ format_version: 2, header: {} }));
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Creates a fixture filter with a valid module UUID plus overrides.
     *
     * @param rawSettings - Raw setting overrides.
     *
     * @returns Filter instance.
     */
    function createManifestFilter(rawSettings: Record<string, unknown> = {}): TsCompileFilter {
        return createFixtureFilter(fixture, { moduleUUID: "12345678-1234-4123-8123-1234567890ab", ...rawSettings });
    }

    test("adds dependencies and the script module", async () => {
        await OutputCapture.record(() => createManifestFilter().updateManifest());

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.deepEqual(manifest.dependencies, [{ module_name: "@minecraft/server", version: "2.0.0" }]);
        assert.equal(manifest.modules.length, 1);
        assert.equal(manifest.modules[0].entry, "scripts/main.js");
        assert.equal(manifest.modules[0].uuid, "12345678-1234-4123-8123-1234567890ab");
        assert.deepEqual(manifest.modules[0].version, [0, 0, 1]);
    });

    test("keeps a matching existing dependency", async () => {
        fixture.writeFile(
            "BP/manifest.json",
            JSON.stringify({ format_version: 2, dependencies: [{ module_name: "@minecraft/server", version: "2.0.0" }] })
        );

        await OutputCapture.record(() => createManifestFilter().updateManifest());

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.equal(manifest.dependencies.length, 1);
    });

    test("rejects a conflicting dependency version", async () => {
        fixture.writeFile(
            "BP/manifest.json",
            JSON.stringify({ format_version: 2, dependencies: [{ module_name: "@minecraft/server", version: "1.0.0" }] })
        );

        await OutputCapture.record(() => {
            assert.throws(() => createManifestFilter().updateManifest(), /Update one side so they match/);
        });
    });

    test("rejects a conflicting existing script module", async () => {
        fixture.writeFile(
            "BP/manifest.json",
            JSON.stringify({ format_version: 2, modules: [{ type: "script", uuid: "other", entry: "scripts/other.js" }] })
        );

        await OutputCapture.record(() => {
            assert.throws(() => createManifestFilter().updateManifest(), /"uuid" or "entry" does not match/);
        });
    });

    test("uses a string module version for format 3 manifests", async () => {
        fixture.writeFile("BP/manifest.json", JSON.stringify({ format_version: 3 }));

        await OutputCapture.record(() => createManifestFilter().updateManifest());

        assert.equal(JSON.parse(fixture.readText("BP/manifest.json")).modules[0].version, "0.0.1");
    });

    test("skips modification when disabled", async () => {
        const originalManifest = fixture.readText("BP/manifest.json");

        await OutputCapture.record(() => createManifestFilter({ disableManifestModification: true }).updateManifest());

        assert.equal(fixture.readText("BP/manifest.json"), originalManifest);
    });
});

describe("TsCompileFilter.loadConfigFile", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("applies a config override to the settings", async () => {
        fixture.writeFile("tscompile.config.js", "module.exports = { config(settings) { settings.keepSource = true; } };");

        const filter = createFixtureFilter(fixture);

        await OutputCapture.record(() => filter.loadConfigFile());

        assert.equal(filter.getActiveDistDir(), "dist");
    });

    test("warns when the config exports no function", async () => {
        fixture.writeFile("tscompile.config.js", "module.exports = { notConfig: true };");

        const output = await OutputCapture.record(() => createFixtureFilter(fixture).loadConfigFile());

        assert.match(output.stderrText, /must export a "config\(settings\)" function/);
    });

    test("does nothing without a config file", () => {
        assert.doesNotThrow(() => createFixtureFilter(fixture).loadConfigFile());
    });
});

describe("TsCompileFilter.shouldRemoveSourceDirectory", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("removes the source directory only when it exists and keepSource is false", async () => {
        fixture.writeFile("BP/scripts/src/main.ts", "export {};");

        const filter = createFixtureFilter(fixture);

        assert.equal(filter.shouldRemoveSourceDirectory(), true);
        await OutputCapture.record(() => filter.removeSourceDirectory());
        assert.equal(fixture.exists("BP/scripts/src"), false);
        assert.equal(filter.shouldRemoveSourceDirectory(), false);
    });

    test("keeps the source directory when keepSource is true", () => {
        fixture.writeFile("BP/scripts/src/main.ts", "export {};");

        assert.equal(createFixtureFilter(fixture, { keepSource: true }).shouldRemoveSourceDirectory(), false);
    });
});

describe("TsCompileFilter.isScriptEntryPath", () => {
    const filter = createFilter();

    test("accepts supported script extensions", () => {
        assert.equal(filter.isScriptEntryPath("main.ts"), true);
        assert.equal(filter.isScriptEntryPath("main.mjs"), true);
        assert.equal(filter.isScriptEntryPath("main.cts"), true);
    });

    test("rejects declaration files and unrelated extensions", () => {
        assert.equal(filter.isScriptEntryPath("types.d.ts"), false);
        assert.equal(filter.isScriptEntryPath("types.d.mts"), false);
        assert.equal(filter.isScriptEntryPath("readme.md"), false);
    });
});

describe("TsCompileFilter.toScriptsProjectPath", () => {
    test("prefixes the scripts root", () => {
        assert.equal(createFilter().toScriptsProjectPath("main.js"), "BP/scripts/main.js");
    });
});

describe("TsCompileFilter.getDerivedOutputPathForCompiledOutput", () => {
    const filter = createFilter();

    test("resolves a path inside the scripts root", () => {
        const compiledOutput = path.resolve("/workspace/BP/scripts/nested/main.js");

        assert.equal(filter.getDerivedOutputPathForCompiledOutput(compiledOutput), "nested/main.js");
    });

    test("recovers from a duplicated temp prefix", () => {
        const compiledOutput = path.resolve("/other-root/tmp/BP/scripts/main.js");

        assert.equal(filter.getDerivedOutputPathForCompiledOutput(compiledOutput), "main.js");
    });

    test("throws for outputs outside the scripts root", () => {
        assert.throws(
            () => filter.getDerivedOutputPathForCompiledOutput(path.resolve("/workspace/RP/main.js")),
            /Expected a compiled output/
        );
    });
});

describe("TsCompileFilter.extractScriptsRelativeOutputPath", () => {
    test("resolves a path inside the scripts root", () => {
        const filter = createFilter();
        const scriptsRoot = path.resolve("/workspace/BP/scripts");
        const compiledOutput = path.resolve("/workspace/BP/scripts/nested/main.js");

        assert.equal(filter.extractScriptsRelativeOutputPath(compiledOutput, scriptsRoot), "nested/main.js");
    });
});
