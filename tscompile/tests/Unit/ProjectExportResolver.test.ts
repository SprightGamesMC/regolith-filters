import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { TsCompileSettings } from "../../src/Types/TsCompileTypes";
import ProjectExportResolver from "../../src/Lib/ProjectExportResolver";
import WorkspaceFixture from "../Helpers/WorkspaceFixture";

/**
 * Creates resolver settings with optional overrides.
 *
 * @param overrides - Setting overrides.
 *
 * @returns Filter settings for resolver tests.
 */
function createSettings(overrides: Record<string, unknown> = {}): TsCompileSettings {
    return {
        buildOptions: {},
        disableManifestModification: false,
        enableDebugger: false,
        keepSource: false,
        modules: [],
        sourceDir: "BP/scripts/src",
        sourceEntry: "main.ts",
        ...overrides,
    } as unknown as TsCompileSettings;
}

/**
 * Creates an export resolver rooted at an absolute project path.
 *
 * @param projectRoot - Absolute project root path.
 * @param overrides - Setting overrides.
 *
 * @returns Export resolver instance.
 */
function createResolver(projectRoot: string = path.resolve("/project"), overrides: Record<string, unknown> = {}): ProjectExportResolver {
    return new ProjectExportResolver({ projectRoot, settings: createSettings(overrides) });
}

describe("ProjectExportResolver.asObject", () => {
    const resolver = createResolver();

    test("returns plain objects", () => {
        assert.deepEqual(resolver.asObject({ a: 1 }), { a: 1 });
    });

    test("rejects arrays and null", () => {
        assert.equal(resolver.asObject([]), null);
        assert.equal(resolver.asObject(null), null);
    });
});

describe("ProjectExportResolver.evaluateSimpleStringExpression", () => {
    const resolver = createResolver();

    test("resolves string literals", () => {
        assert.equal(resolver.evaluateSimpleStringExpression('"literal"', {}), "literal");
    });

    test("resolves the project name token", () => {
        assert.equal(resolver.evaluateSimpleStringExpression("project.name", { project: { name: "Foo" } }), "Foo");
    });

    test("resolves concatenation", () => {
        assert.equal(resolver.evaluateSimpleStringExpression('project.name + "_bp"', { project: { name: "Foo" } }), "Foo_bp");
    });

    test("keeps plus signs inside quotes", () => {
        assert.equal(resolver.evaluateSimpleStringExpression('"a+b"', {}), "a+b");
    });

    test("returns null for unsupported identifiers", () => {
        assert.equal(resolver.evaluateSimpleStringExpression("unsupported", {}), null);
    });

    test("returns null for unbalanced quotes", () => {
        assert.equal(resolver.evaluateSimpleStringExpression('"open', {}), null);
    });

    test("returns null for non-string and blank expressions", () => {
        assert.equal(resolver.evaluateSimpleStringExpression(5, {}), null);
        assert.equal(resolver.evaluateSimpleStringExpression("   ", {}), null);
    });
});

describe("ProjectExportResolver.expandEnvironmentVariables", () => {
    const resolver = createResolver();

    test("expands supported syntaxes", () => {
        process.env.TSCOMPILE_TEST_VAR = "value";

        try {
            assert.equal(resolver.expandEnvironmentVariables("%TSCOMPILE_TEST_VAR%"), "value");
            assert.equal(resolver.expandEnvironmentVariables("${TSCOMPILE_TEST_VAR}"), "value");
            assert.equal(resolver.expandEnvironmentVariables("$TSCOMPILE_TEST_VAR"), "value");
        } finally {
            delete process.env.TSCOMPILE_TEST_VAR;
        }
    });

    test("replaces unknown variables with empty text", () => {
        assert.equal(resolver.expandEnvironmentVariables("%TSCOMPILE_UNSET_VAR%/x"), "/x");
    });
});

describe("ProjectExportResolver.toVsCodePath", () => {
    const resolver = createResolver();

    test("maps the project root to the workspace folder", () => {
        assert.equal(resolver.toVsCodePath(path.resolve("/project")), "${workspaceFolder}");
    });

    test("maps nested paths under the workspace folder", () => {
        assert.equal(resolver.toVsCodePath(path.resolve("/project/BP/x")), "${workspaceFolder}/BP/x");
    });

    test("keeps outside paths absolute", () => {
        assert.equal(resolver.toVsCodePath(path.resolve("/elsewhere/x")), path.resolve("/elsewhere/x").replace(/\\/g, "/"));
    });
});

describe("ProjectExportResolver.readProjectConfig", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("returns null when config.json is missing", () => {
        assert.equal(createResolver(fixture.workspacePath).readProjectConfig(), null);
    });

    test("parses config.json with comments", () => {
        fixture.writeFile("config.json", '{ /* note */ "name": "Proj", }');

        assert.deepEqual(createResolver(fixture.workspacePath).readProjectConfig(), { name: "Proj" });
    });

    test("caches the first read", () => {
        fixture.writeFile("config.json", '{ "name": "First" }');

        const resolver = createResolver(fixture.workspacePath);
        resolver.readProjectConfig();
        fixture.writeFile("config.json", '{ "name": "Second" }');

        assert.deepEqual(resolver.readProjectConfig(), { name: "First" });
    });
});

describe("ProjectExportResolver.resolveDebuggerExportConfig", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("returns null without a debugger profile", () => {
        assert.equal(createResolver(fixture.workspacePath).resolveDebuggerExportConfig(), null);
    });

    test("reads the export object from regolith profiles", () => {
        fixture.writeFile("config.json", JSON.stringify({ regolith: { profiles: { dev: { export: { target: "exact" } } } } }));

        assert.deepEqual(createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveDebuggerExportConfig(), {
            target: "exact",
        });
    });

    test("falls back to top-level profiles", () => {
        fixture.writeFile("config.json", JSON.stringify({ profiles: { dev: { export: { target: "development" } } } }));

        assert.deepEqual(createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveDebuggerExportConfig(), {
            target: "development",
        });
    });

    test("returns null for a missing profile", () => {
        fixture.writeFile("config.json", JSON.stringify({ regolith: { profiles: {} } }));

        assert.equal(createResolver(fixture.workspacePath, { debuggerProfile: "gone" }).resolveDebuggerExportConfig(), null);
    });
});

describe("ProjectExportResolver.resolveBehaviorPackProjectPath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("defaults to BP", () => {
        assert.equal(createResolver(fixture.workspacePath).resolveBehaviorPackProjectPath(), "BP");
    });

    test("uses the configured packs.behaviorPack path", () => {
        fixture.writeFile("config.json", JSON.stringify({ packs: { behaviorPack: "./packs/BP" } }));

        assert.equal(createResolver(fixture.workspacePath).resolveBehaviorPackProjectPath(), "packs/BP");
    });
});

describe("ProjectExportResolver.normalizeBehaviorPackProjectPath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
        fixture.writeFile("config.json", JSON.stringify({ packs: { behaviorPack: "packs/BP" } }));
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("rewrites the BP alias to the configured route", () => {
        const resolver = createResolver(fixture.workspacePath);

        assert.equal(resolver.normalizeBehaviorPackProjectPath("BP"), "packs/BP");
        assert.equal(resolver.normalizeBehaviorPackProjectPath("BP/scripts/main.js"), "packs/BP/scripts/main.js");
    });

    test("leaves non-BP paths unchanged", () => {
        assert.equal(createResolver(fixture.workspacePath).normalizeBehaviorPackProjectPath("RP/textures"), "RP/textures");
    });
});

describe("ProjectExportResolver.resolveExportBuild", () => {
    const resolver = createResolver();

    test("keeps preview and education builds", () => {
        assert.equal(resolver.resolveExportBuild({ build: "preview" }), "preview");
        assert.equal(resolver.resolveExportBuild({ build: "education" }), "education");
    });

    test("falls back to standard", () => {
        assert.equal(resolver.resolveExportBuild({}), "standard");
        assert.equal(resolver.resolveExportBuild({ build: "custom" }), "standard");
    });
});

describe("ProjectExportResolver.resolveBehaviorPackName", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("evaluates a configured bpName expression", () => {
        fixture.writeFile("config.json", JSON.stringify({ name: "Proj" }));

        assert.equal(createResolver(fixture.workspacePath).resolveBehaviorPackName({ bpName: 'project.name + "_dev"' }), "Proj_dev");
    });

    test("falls back to the project name with a _bp suffix", () => {
        fixture.writeFile("config.json", JSON.stringify({ name: "Proj" }));

        assert.equal(createResolver(fixture.workspacePath).resolveBehaviorPackName({}), "Proj_bp");
    });

    test("uses the project directory name when config has no name", () => {
        const expectedName = path.basename(fixture.workspacePath);

        assert.equal(createResolver(fixture.workspacePath).resolveBehaviorPackName({}), `${expectedName}_bp`);
    });

    test("throws for unsupported bpName expressions", () => {
        assert.throws(
            () => createResolver(fixture.workspacePath).resolveBehaviorPackName({ bpName: "fn(project)" }),
            /Unsupported "export\.bpName"/
        );
    });
});

describe("ProjectExportResolver.resolveConfiguredPath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("resolves relative paths against the project root", () => {
        assert.equal(createResolver(fixture.workspacePath).resolveConfiguredPath("packs/BP"), fixture.resolve(path.join("packs", "BP")));
    });

    test("expands environment variables", () => {
        process.env.TSCOMPILE_TEST_ROOT = fixture.workspacePath;

        try {
            assert.equal(
                createResolver(fixture.workspacePath).resolveConfiguredPath("%TSCOMPILE_TEST_ROOT%"),
                path.resolve(fixture.workspacePath)
            );
        } finally {
            delete process.env.TSCOMPILE_TEST_ROOT;
        }
    });
});

describe("ProjectExportResolver.resolveBehaviorPackExportRoot", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Writes a config.json with the given export settings for profile "dev".
     *
     * @param exportConfig - Export configuration object.
     */
    function writeExportConfig(exportConfig: Record<string, unknown>): void {
        fixture.writeFile("config.json", JSON.stringify({ regolith: { profiles: { dev: { export: exportConfig } } } }));
    }

    test("returns null without export config", () => {
        assert.equal(createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveBehaviorPackExportRoot(), null);
    });

    test("resolves an exact target from bpPath", () => {
        writeExportConfig({ target: "exact", bpPath: "out/BP" });

        assert.equal(
            createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveBehaviorPackExportRoot(),
            fixture.resolve(path.join("out", "BP"))
        );
    });

    test("throws for an exact target without bpPath", () => {
        writeExportConfig({ target: "exact" });

        assert.throws(
            () => createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveBehaviorPackExportRoot(),
            /requires "bpPath"/
        );
    });

    test("resolves a development target under the com.mojang override", () => {
        writeExportConfig({ target: "development" });
        fixture.writeFile(
            "config.json",
            JSON.stringify({ name: "Proj", regolith: { profiles: { dev: { export: { target: "development" } } } } })
        );
        process.env.COM_MOJANG = fixture.resolve("mojang");

        try {
            assert.equal(
                createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveBehaviorPackExportRoot(),
                path.resolve(fixture.resolve("mojang"), "development_behavior_packs", "Proj_bp")
            );
        } finally {
            delete process.env.COM_MOJANG;
        }
    });

    test("returns null for unknown targets", () => {
        writeExportConfig({ target: "mystery" });

        assert.equal(createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveBehaviorPackExportRoot(), null);
    });
});

describe("ProjectExportResolver.resolveBehaviorPackExportPath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
        fixture.writeFile(
            "config.json",
            JSON.stringify({ regolith: { profiles: { dev: { export: { target: "exact", bpPath: "out/BP" } } } } })
        );
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("maps the behavior pack root and nested paths", () => {
        const resolver = createResolver(fixture.workspacePath, { debuggerProfile: "dev" });
        const exportRoot = fixture.resolve(path.join("out", "BP"));

        assert.equal(resolver.resolveBehaviorPackExportPath("BP"), exportRoot);
        assert.equal(resolver.resolveBehaviorPackExportPath("BP/scripts/main.js"), path.resolve(exportRoot, "scripts", "main.js"));
    });

    test("returns null for paths outside the behavior pack", () => {
        assert.equal(createResolver(fixture.workspacePath, { debuggerProfile: "dev" }).resolveBehaviorPackExportPath("RP/x.json"), null);
    });
});

describe("ProjectExportResolver.resolveWorldExportRoot", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("requires exactly one of worldPath or worldName", () => {
        const resolver = createResolver(fixture.workspacePath);

        assert.throws(() => resolver.resolveWorldExportRoot({}), /exactly one of "worldPath" or "worldName"/);
        assert.throws(() => resolver.resolveWorldExportRoot({ worldPath: "w", worldName: "n" }), /must not define both/);
    });

    test("resolves an existing worldPath directory", () => {
        fixture.makeDirectory("world");

        assert.equal(createResolver(fixture.workspacePath).resolveWorldExportRoot({ worldPath: "world" }), fixture.resolve("world"));
    });

    test("rejects a missing or non-directory worldPath", () => {
        fixture.writeFile("file.txt", "x");
        const resolver = createResolver(fixture.workspacePath);

        assert.throws(() => resolver.resolveWorldExportRoot({ worldPath: "gone" }), /does not exist/);
        assert.throws(() => resolver.resolveWorldExportRoot({ worldPath: "file.txt" }), /not a directory/);
    });

    test("finds a world by level name under the com.mojang override", () => {
        fixture.writeFile("mojang/minecraftWorlds/abc/levelname.txt", "My World\n");
        process.env.COM_MOJANG = fixture.resolve("mojang");

        try {
            assert.equal(
                createResolver(fixture.workspacePath).resolveWorldExportRoot({ worldName: "My World" }),
                fixture.resolve(path.join("mojang", "minecraftWorlds", "abc"))
            );
        } finally {
            delete process.env.COM_MOJANG;
        }
    });

    test("rejects missing and ambiguous world names", () => {
        fixture.writeFile("mojang/minecraftWorlds/one/levelname.txt", "Twin");
        fixture.writeFile("mojang/minecraftWorlds/two/levelname.txt", "Twin");
        process.env.COM_MOJANG = fixture.resolve("mojang");

        try {
            const resolver = createResolver(fixture.workspacePath);

            assert.throws(() => resolver.resolveWorldExportRoot({ worldName: "Missing" }), /Could not find a world named/);
            assert.throws(() => resolver.resolveWorldExportRoot({ worldName: "Twin" }), /multiple worlds named/);
        } finally {
            delete process.env.COM_MOJANG;
        }
    });
});

describe("ProjectExportResolver.resolveComMojangRoot", () => {
    const resolver = createResolver();

    test("prefers build-specific environment overrides", () => {
        process.env.COM_MOJANG_PREVIEW = path.resolve("/preview-root");

        try {
            assert.equal(resolver.resolveComMojangRoot("preview", "development"), path.resolve("/preview-root"));
        } finally {
            delete process.env.COM_MOJANG_PREVIEW;
        }
    });
});

describe("ProjectExportResolver.findWorldUserDirectory", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("returns the first non-Shared user directory", () => {
        fixture.makeDirectory("Users/Shared");
        fixture.makeDirectory("Users/Player123");

        assert.equal(
            createResolver(fixture.workspacePath).findWorldUserDirectory(fixture.resolve("Users")),
            fixture.resolve(path.join("Users", "Player123"))
        );
    });

    test("returns null when the users root is missing or empty", () => {
        fixture.makeDirectory("Users/Shared");
        const resolver = createResolver(fixture.workspacePath);

        assert.equal(resolver.findWorldUserDirectory(fixture.resolve("Missing")), null);
        assert.equal(resolver.findWorldUserDirectory(fixture.resolve("Users")), null);
    });
});

describe("ProjectExportResolver.resolveLocalProjectPath", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
        fixture.writeFile("config.json", JSON.stringify({ packs: { behaviorPack: "packs/BP" } }));
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("expands the BP alias to the configured local route", () => {
        assert.equal(
            createResolver(fixture.workspacePath).resolveLocalProjectPath("BP/scripts/src"),
            fixture.resolve(path.join("packs", "BP", "scripts", "src"))
        );
    });
});
