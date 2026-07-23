import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import BrarchiveDecoder from "../Helpers/BrarchiveDecoder";
import Main from "../../src/Main";
import PackFixture from "../Helpers/PackFixture";

describe("Main.run", () => {
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
        fixture.writeFile(path.join("BP", "manifest.json"), JSON.stringify({ header: {} }));
        fixture.writeFile(path.join("BP", "entities", "foo.json"), '{ "a": 1 }');
        process.chdir(fixture.workspacePath);
    });

    afterEach(() => {
        process.chdir(originalCwd);
        process.argv = originalArgv;
        fixture.dispose();
    });

    test("runs against the current working directory with default settings", async () => {
        process.argv = ["node", "Main.js"];

        await new Main().run();

        assert.equal(fixture.exists("BP/__brarchive/entities.brarchive"), true);
        assert.equal(fixture.exists("BP/entities"), false);
        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("BP/__brarchive/entities.brarchive")), [
            { content: '{"a":1}', name: "foo.json" },
        ]);
    });

    test("honors settings passed as an argument", async () => {
        process.argv = ["node", "Main.js", '{ "mode": "keep_both", "minify": false }'];

        await new Main().run();

        assert.equal(fixture.exists("BP/__brarchive/entities.brarchive"), true);
        assert.equal(fixture.exists("BP/entities/foo.json"), true);
        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("BP/__brarchive/entities.brarchive")), [
            { content: '{ "a": 1 }', name: "foo.json" },
        ]);
    });

    test("rejects invalid settings before touching the pack", async () => {
        process.argv = ["node", "Main.js", "[]"];

        await assert.rejects(() => new Main().run(), /must be a JSON object/);
        assert.equal(fixture.exists("BP/__brarchive"), false);
    });
});
