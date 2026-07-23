import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import OutputCapture from "../Helpers/OutputCapture";
import TsCompileFilter from "../../src/Lib/TsCompileFilter";
import WorkspaceFixture from "../Helpers/WorkspaceFixture";

describe("TsCompileFilter.run", () => {
    const moduleUUID = "12345678-1234-4123-8123-1234567890ab";
    let fixture: WorkspaceFixture;

    beforeEach(() => {
        fixture = new WorkspaceFixture();
        fixture.writeFile("BP/manifest.json", JSON.stringify({ format_version: 2, header: {} }));
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Runs the filter with captured output.
     *
     * @param rawSettings - Raw JSON settings.
     */
    async function runFilter(rawSettings: Record<string, unknown> = {}): Promise<void> {
        await new TsCompileFilter(fixture.workspacePath, fixture.workspacePath, { moduleUUID, ...rawSettings }).run();
    }

    test("bundles the default entry and updates the manifest", async () => {
        fixture.writeFile("BP/scripts/src/util.ts", 'export const GREETING: string = "hi";');
        fixture.writeFile("BP/scripts/src/main.ts", 'import { GREETING } from "./util";\nconsole.log(GREETING);');

        await OutputCapture.record(() => runFilter());

        assert.equal(fixture.exists("BP/scripts/main.js"), true);
        assert.equal(fixture.exists("BP/scripts/src"), false);
        assert.match(fixture.readText("BP/scripts/main.js"), /hi/);

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.deepEqual(manifest.dependencies, [{ module_name: "@minecraft/server", version: "2.0.0" }]);
        assert.equal(manifest.modules[0].entry, "scripts/main.js");
    });

    test("keeps sources and emits into dist when keepSource is true", async () => {
        fixture.writeFile("BP/scripts/src/main.ts", "console.log(1);");

        await OutputCapture.record(() => runFilter({ keepSource: true }));

        assert.equal(fixture.exists("BP/scripts/dist/main.js"), true);
        assert.equal(fixture.exists("BP/scripts/src/main.ts"), true);
    });

    test("bundles JSONC imports through the JSON plugin", async () => {
        fixture.writeFile("BP/scripts/src/data.json", '{ /* comment */ "value": "jsonc-works", }');
        fixture.writeFile("BP/scripts/src/main.ts", 'import data from "./data.json";\nconsole.log(data.value);');

        await OutputCapture.record(() => runFilter());

        assert.match(fixture.readText("BP/scripts/main.js"), /jsonc-works/);
    });

    test("compiles every file separately when bundling is disabled", async () => {
        fixture.writeFile("BP/scripts/src/main.ts", 'import { helper } from "./util/helper";\nconsole.log(helper());');
        fixture.writeFile("BP/scripts/src/util/helper.ts", "export function helper(): number { return 1; }");

        await OutputCapture.record(() => runFilter({ buildOptions: { bundle: false } }));

        assert.equal(fixture.exists("BP/scripts/main.js"), true);
        assert.equal(fixture.exists("BP/scripts/util/helper.js"), true);
    });

    test("leaves the manifest untouched when modification is disabled", async () => {
        fixture.writeFile("BP/scripts/src/main.ts", "console.log(1);");
        const originalManifest = fixture.readText("BP/manifest.json");

        await OutputCapture.record(() => runFilter({ disableManifestModification: true }));

        assert.equal(fixture.readText("BP/manifest.json"), originalManifest);
    });

    test("rejects a missing source directory", async () => {
        await OutputCapture.record(async () => {
            await assert.rejects(runFilter(), /Could not find "sourceDir"/);
        });
    });

    test("rejects JSON imports in split builds before compiling", async () => {
        fixture.writeFile("BP/scripts/src/main.ts", 'import data from "./data.json";\nconsole.log(data);');
        fixture.writeFile("BP/scripts/src/data.json", "{}");

        await OutputCapture.record(async () => {
            await assert.rejects(runFilter({ buildOptions: { bundle: false } }), /JSON imports require bundling/);
        });
    });

    test("rejects a manifest with a conflicting script module", async () => {
        fixture.writeFile(
            "BP/manifest.json",
            JSON.stringify({ format_version: 2, modules: [{ type: "script", uuid: "different", entry: "scripts/other.js" }] })
        );
        fixture.writeFile("BP/scripts/src/main.ts", "console.log(1);");

        await OutputCapture.record(async () => {
            await assert.rejects(runFilter(), /"uuid" or "entry" does not match/);
        });
    });
});
