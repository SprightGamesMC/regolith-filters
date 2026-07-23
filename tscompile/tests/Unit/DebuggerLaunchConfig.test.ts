import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { TsCompileSettings } from "../../src/Types/TsCompileTypes";
import DebuggerLaunchConfig from "../../src/Lib/DebuggerLaunchConfig";
import FilterLogger from "../../src/Lib/FilterLogger";
import OutputCapture from "../Helpers/OutputCapture";
import ProjectExportResolver from "../../src/Lib/ProjectExportResolver";
import WorkspaceFixture from "../Helpers/WorkspaceFixture";

/**
 * Creates a launch manager rooted at a fixture project.
 *
 * @param fixture - Active workspace fixture.
 * @param settingOverrides - Setting overrides.
 *
 * @returns Launch manager instance.
 */
function createManager(fixture: WorkspaceFixture, settingOverrides: Record<string, unknown> = {}): DebuggerLaunchConfig {
    const settings = {
        buildOptions: {},
        disableManifestModification: false,
        enableDebugger: true,
        keepSource: false,
        moduleUUID: "12345678-1234-4123-8123-1234567890ab",
        modules: [],
        sourceDir: "BP/scripts/src",
        sourceEntry: "main.ts",
        ...settingOverrides,
    } as unknown as TsCompileSettings;
    const exportResolver = new ProjectExportResolver({ projectRoot: fixture.workspacePath, settings });

    return new DebuggerLaunchConfig({
        exportResolver,
        getCompiledOutputPath: () => fixture.resolve(path.join("BP", "scripts", "main.js")),
        getDerivedOutputPath: () => "main.js",
        logger: new FilterLogger(),
        projectRoot: fixture.workspacePath,
        settings,
        toScriptsProjectPath: (relativePath) => `BP/scripts/${relativePath}`.replace(/\/\.$/, ""),
    });
}

describe("DebuggerLaunchConfig.isMinecraftLaunchConfiguration", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("accepts minecraft-js configurations only", () => {
        const manager = createManager(fixture);

        assert.equal(manager.isMinecraftLaunchConfiguration({ type: "minecraft-js" }), true);
        assert.equal(manager.isMinecraftLaunchConfiguration({ type: "node" }), false);
        assert.equal(manager.isMinecraftLaunchConfiguration(null), false);
        assert.equal(manager.isMinecraftLaunchConfiguration([]), false);
    });

    test("identifies the tscompile-managed entry by name", () => {
        const manager = createManager(fixture);

        assert.equal(
            manager.isTsCompileLaunchConfiguration({ type: "minecraft-js", name: DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME }),
            true
        );
        assert.equal(manager.isTsCompileLaunchConfiguration({ type: "minecraft-js", name: "Custom" }), false);
    });
});

describe("DebuggerLaunchConfig.createMinecraftLaunchConfiguration", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("builds a workspace-relative configuration without export config", () => {
        const configuration = createManager(fixture).createMinecraftLaunchConfiguration();

        assert.equal(configuration.type, "minecraft-js");
        assert.equal(configuration.request, "attach");
        assert.equal(configuration.name, DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME);
        assert.equal(configuration.targetModuleUuid, "12345678-1234-4123-8123-1234567890ab");
        assert.equal(configuration.localRoot, "${workspaceFolder}/BP/scripts/src/");
        assert.equal(configuration.sourceMapRoot, "${workspaceFolder}/BP/scripts/");
        assert.equal(configuration.port, 19144);
    });

    test("targets the exported behavior pack when configured", () => {
        fixture.writeFile(
            "config.json",
            JSON.stringify({ regolith: { profiles: { dev: { export: { target: "exact", bpPath: "out/BP" } } } } })
        );

        const configuration = createManager(fixture, { debuggerProfile: "dev" }).createMinecraftLaunchConfiguration();

        assert.equal(configuration.sourceMapRoot, "${workspaceFolder}/out/BP/scripts/");
    });
});

describe("DebuggerLaunchConfig.createSourceRoot", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("resolves the current directory when output and source parent match", () => {
        assert.equal(createManager(fixture).createSourceRoot(), ".");
    });
});

describe("DebuggerLaunchConfig.ensureLaunchConfiguration", () => {
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("creates a fresh launch.json", async () => {
        await OutputCapture.record(() => createManager(fixture).ensureLaunchConfiguration());

        const launchConfig = JSON.parse(fixture.readText(".vscode/launch.json"));
        assert.equal(launchConfig.version, DebuggerLaunchConfig.VSCODE_LAUNCH_VERSION);
        assert.equal(launchConfig.configurations.length, 1);
        assert.equal(launchConfig.configurations[0].name, DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME);
    });

    test("preserves foreign configurations and replaces the managed one", async () => {
        fixture.writeFile(
            ".vscode/launch.json",
            JSON.stringify({
                version: "0.2.0",
                configurations: [
                    { type: "node", name: "Keep Me" },
                    { type: "minecraft-js", name: DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME, port: 1 },
                ],
            })
        );

        await OutputCapture.record(() => createManager(fixture).ensureLaunchConfiguration());

        const launchConfig = JSON.parse(fixture.readText(".vscode/launch.json"));
        assert.equal(launchConfig.configurations.length, 2);
        assert.equal(launchConfig.configurations[0].name, "Keep Me");
        assert.equal(launchConfig.configurations[1].port, 19144);
    });

    test("replaces an invalid launch.json", async () => {
        fixture.writeFile(".vscode/launch.json", "[]");

        await OutputCapture.record(() => createManager(fixture).ensureLaunchConfiguration());

        const launchConfig = JSON.parse(fixture.readText(".vscode/launch.json"));
        assert.equal(launchConfig.configurations.length, 1);
    });

    test("leaves an up-to-date launch.json untouched", async () => {
        await OutputCapture.record(() => createManager(fixture).ensureLaunchConfiguration());
        const firstContents = fixture.readText(".vscode/launch.json");

        const output = await OutputCapture.record(() => createManager(fixture).ensureLaunchConfiguration());

        assert.equal(fixture.readText(".vscode/launch.json"), firstContents);
        assert.equal(output.stdoutText, "");
    });
});
