import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type fs from "node:fs";
import BrarchiveDecoder from "../Helpers/BrarchiveDecoder";
import BrarchiveFilter from "../../src/Lib/BrarchiveFilter";
import PackFixture from "../Helpers/PackFixture";

describe("BrarchiveFilter.createSettings", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});

    test("applies canonical defaults", () => {
        assert.deepEqual(filter.createSettings({}), { mode: "replace", minify: true });
    });

    test("preserves provided values", () => {
        assert.deepEqual(filter.createSettings({ mode: "keep_both", minify: false }), { mode: "keep_both", minify: false });
    });

    test("fills only the missing setting", () => {
        assert.deepEqual(filter.createSettings({ mode: "keep_both" }), { mode: "keep_both", minify: true });
        assert.deepEqual(filter.createSettings({ minify: false }), { mode: "replace", minify: false });
    });
});

describe("BrarchiveFilter.validateSettings", () => {
    test("accepts default settings", () => {
        assert.doesNotThrow(() => new BrarchiveFilter("x", {}).validateSettings());
    });

    test("accepts keep_both mode", () => {
        assert.doesNotThrow(() => new BrarchiveFilter("x", { mode: "keep_both" }).validateSettings());
    });

    test("rejects an unknown mode", () => {
        assert.throws(() => new BrarchiveFilter("x", { mode: "nope" }).validateSettings(), /unknown mode/);
    });

    test("rejects a non-string mode", () => {
        assert.throws(() => new BrarchiveFilter("x", { mode: 5 }).validateSettings(), /unknown mode/);
    });

    test("rejects a non-boolean minify", () => {
        assert.throws(() => new BrarchiveFilter("x", { minify: 5 }).validateSettings(), /must be a boolean/);
    });
});

describe("BrarchiveFilter.getPackRoots", () => {
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("returns an empty list when no pack directory exists", () => {
        assert.deepEqual(new BrarchiveFilter(fixture.workspacePath, {}).getPackRoots(), []);
    });

    test("returns only existing pack directories", () => {
        fixture.makeDirectory("BP");

        assert.deepEqual(new BrarchiveFilter(fixture.workspacePath, {}).getPackRoots(), [fixture.resolve("BP")]);
    });

    test("returns both packs when both exist", () => {
        fixture.makeDirectory("BP");
        fixture.makeDirectory("RP");

        assert.deepEqual(new BrarchiveFilter(fixture.workspacePath, {}).getPackRoots(), [fixture.resolve("BP"), fixture.resolve("RP")]);
    });

    test("ignores a file named like a pack directory", () => {
        fixture.writeFile("BP", "not a directory");

        assert.deepEqual(new BrarchiveFilter(fixture.workspacePath, {}).getPackRoots(), []);
    });
});

describe("BrarchiveFilter.toNormalizedPath", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});

    test("lowercases and forward-slashes", () => {
        assert.equal(filter.toNormalizedPath("UI/Foo.JSON"), "ui/foo.json");
    });

    test("normalizes platform separators", () => {
        assert.equal(filter.toNormalizedPath(["UI", "Sub", "Foo.JSON"].join(path.sep)), "ui/sub/foo.json");
    });

    test("resolves dot segments", () => {
        assert.equal(filter.toNormalizedPath("UI/./Sub/../Foo.JSON"), "ui/foo.json");
    });
});

describe("BrarchiveFilter.partitionEntries", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});

    test("splits directories from files", () => {
        const entryList = [
            { name: "child", isDirectory: () => true, isFile: () => false },
            { name: "data.json", isDirectory: () => false, isFile: () => true },
        ] as unknown as fs.Dirent[];

        assert.deepEqual(filter.partitionEntries(entryList), { directoryNameList: ["child"], fileNameList: ["data.json"] });
    });

    test("returns empty lists for an empty entry list", () => {
        assert.deepEqual(filter.partitionEntries([]), { directoryNameList: [], fileNameList: [] });
    });

    test("skips entries that are neither directory nor file", () => {
        const entryList = [{ name: "link", isDirectory: () => false, isFile: () => false }] as unknown as fs.Dirent[];

        assert.deepEqual(filter.partitionEntries(entryList), { directoryNameList: [], fileNameList: [] });
    });
});

describe("BrarchiveFilter.isValidUtf8", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("accepts UTF-8 text including multibyte characters", async () => {
        const filePath = fixture.writeFile("good.json", '{ "emoji": "🎉" }');

        assert.equal(await filter.isValidUtf8(filePath), true);
    });

    test("accepts an empty file", async () => {
        const filePath = fixture.writeFile("empty.json", "");

        assert.equal(await filter.isValidUtf8(filePath), true);
    });

    test("rejects invalid UTF-8 bytes", async () => {
        const filePath = fixture.writeFile("bad.bin", Buffer.from([0xc3, 0x28, 0xff]));

        assert.equal(await filter.isValidUtf8(filePath), false);
    });

    test("rejects a missing file", async () => {
        assert.equal(await filter.isValidUtf8(fixture.resolve("missing.json")), false);
    });
});

describe("BrarchiveFilter.maybeMinifyContent", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});

    test("strips whitespace and line comments from JSON", () => {
        assert.equal(filter.maybeMinifyContent("a.json", '{ "a": 1 } // trailing', true), '{"a":1}');
    });

    test("strips block comments from JSON", () => {
        assert.equal(filter.maybeMinifyContent("a.json", '{ /* note */ "a": 1 }', true), '{"a":1}');
    });

    test("preserves comment-like text inside strings", () => {
        assert.equal(filter.maybeMinifyContent("a.json", '{ "a": "b // c" }', true), '{"a":"b // c"}');
    });

    test("preserves strings with escaped quotes", () => {
        assert.equal(filter.maybeMinifyContent("a.json", '{ "a": "say \\"hi\\" /* x */" }', true), '{"a":"say \\"hi\\" /* x */"}');
    });

    test("matches the json extension case-insensitively", () => {
        assert.equal(filter.maybeMinifyContent("A.JSON", "{ }", true), "{}");
    });

    test("leaves near-json extensions untouched", () => {
        assert.equal(filter.maybeMinifyContent("a.jsonx", "{ }", true), "{ }");
    });

    test("leaves non-JSON files untouched", () => {
        assert.equal(filter.maybeMinifyContent("a.txt", "  keep  ", true), "  keep  ");
    });

    test("leaves content untouched when minify is disabled", () => {
        assert.equal(filter.maybeMinifyContent("a.json", "{ }", false), "{ }");
    });
});

describe("BrarchiveFilter.serializeBrarchive", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});

    test("writes the magic header and entry count", () => {
        const header = BrarchiveDecoder.readHeader(filter.serializeBrarchive([["a.json", "1"]]));

        assert.deepEqual(header, { entryCount: 1, magic: BrarchiveFilter.MAGIC, version: BrarchiveFilter.VERSION });
    });

    test("serializes an empty entry list to a bare header", () => {
        const buffer = filter.serializeBrarchive([]);

        assert.equal(buffer.length, BrarchiveFilter.HEADER_SIZE);
        assert.equal(BrarchiveDecoder.readHeader(buffer).entryCount, 0);
    });

    test("sorts entries by name and round-trips content", () => {
        const buffer = filter.serializeBrarchive([
            ["b.json", "second"],
            ["a.json", "first"],
        ]);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(buffer), [
            { content: "first", name: "a.json" },
            { content: "second", name: "b.json" },
        ]);
    });

    test("accepts a Map as the entry source", () => {
        const buffer = filter.serializeBrarchive(new Map([["a.json", "data"]]));

        assert.deepEqual(BrarchiveDecoder.decodeEntries(buffer), [{ content: "data", name: "a.json" }]);
    });

    test("round-trips multibyte content", () => {
        const buffer = filter.serializeBrarchive([["a.json", '{"emoji":"🎉"}']]);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(buffer), [{ content: '{"emoji":"🎉"}', name: "a.json" }]);
    });

    test("round-trips an empty content entry", () => {
        const buffer = filter.serializeBrarchive([
            ["a.json", ""],
            ["b.json", "data"],
        ]);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(buffer), [
            { content: "", name: "a.json" },
            { content: "data", name: "b.json" },
        ]);
    });

    test("zero-fills the unused name field bytes", () => {
        const buffer = filter.serializeBrarchive([["a", "1"]]);
        const nameFieldStart = BrarchiveFilter.HEADER_SIZE + 1;
        const padding = buffer.subarray(nameFieldStart + 1, nameFieldStart + BrarchiveFilter.ENTRY_NAME_LENGTH_MAX);

        assert.ok(padding.every((byte) => byte === 0));
    });

    test("accepts an entry name at exactly the limit", () => {
        const maxName = "x".repeat(BrarchiveFilter.ENTRY_NAME_LENGTH_MAX);
        const buffer = filter.serializeBrarchive([[maxName, "data"]]);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(buffer), [{ content: "data", name: maxName }]);
    });

    test("throws when an entry name exceeds the limit", () => {
        const longName = "x".repeat(BrarchiveFilter.ENTRY_NAME_LENGTH_MAX + 1);

        assert.throws(() => filter.serializeBrarchive([[longName, "data"]]), /Entry name too long/);
    });

    test("measures the name limit in bytes, not characters", () => {
        const multibyteName = "é".repeat(124);

        assert.throws(() => filter.serializeBrarchive([[multibyteName, "data"]]), /Entry name too long/);
    });
});

describe("BrarchiveFilter.findTargets", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Sorts targets by relative path for stable comparison.
     *
     * @param scanTargets - Targets returned by a scan.
     *
     * @returns Sorted relative paths.
     */
    function toSortedRelativePaths(scanTargets: Array<{ relativePath: string }>): string[] {
        return scanTargets.map((target) => target.relativePath).sort();
    }

    test("collects nested directories and tracks archived files", async () => {
        fixture.writeFile("BP/entities/foo.json", "{}");
        fixture.writeFile("BP/entities/sub/bar.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(toSortedRelativePaths(scan.targets), ["entities", path.join("entities", "sub")]);
        assert.deepEqual(
            [...scan.archivedFiles].sort(),
            [
                fixture.resolve(path.join("BP", "entities", "foo.json")),
                fixture.resolve(path.join("BP", "entities", "sub", "bar.json")),
            ].sort()
        );
    });

    test("never archives root-level files", async () => {
        fixture.writeFile("BP/manifest.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(scan.targets, []);
        assert.equal(scan.archivedFiles.size, 0);
    });

    test("skips banned root directories but not nested namesakes", async () => {
        fixture.writeFile("BP/textures/t.json", "{}");
        fixture.writeFile("BP/ui/textures/x.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(toSortedRelativePaths(scan.targets), [path.join("ui", "textures")]);
    });

    test("skips the archive output directory", async () => {
        fixture.writeFile("BP/__brarchive/old.brarchive", "stale");
        fixture.writeFile("BP/entities/foo.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(toSortedRelativePaths(scan.targets), ["entities"]);
    });

    test("skips the subpacks directory", async () => {
        fixture.writeFile("BP/subpacks/fancy/ui/x.json", "{}");
        fixture.writeFile("BP/entities/foo.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(toSortedRelativePaths(scan.targets), ["entities"]);
    });

    test("excludes protected paths regardless of case", async () => {
        fixture.writeFile("BP/UI/_GLOBAL_VARIABLES.JSON", "{}");
        fixture.writeFile("BP/UI/main.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(toSortedRelativePaths(scan.targets), ["UI"]);
        assert.deepEqual([...scan.archivedFiles], [fixture.resolve(path.join("BP", "UI", "main.json"))]);
    });

    test("skips a directory whose only file is excluded", async () => {
        fixture.writeFile("BP/ui/_global_variables.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(scan.targets, []);
        assert.equal(scan.archivedFiles.size, 0);
    });

    test("skips a directory containing any non-UTF-8 file", async () => {
        fixture.writeFile("BP/entities/good.json", "{}");
        fixture.writeFile("BP/entities/bad.bin", Buffer.from([0xff, 0xfe, 0xc3]));
        fixture.writeFile("BP/entities/sub/ok.json", "{}");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(toSortedRelativePaths(scan.targets), [path.join("entities", "sub")]);
        assert.deepEqual([...scan.archivedFiles], [fixture.resolve(path.join("BP", "entities", "sub", "ok.json"))]);
    });

    test("ignores empty directories", async () => {
        fixture.makeDirectory("BP/entities/empty");

        const scan = await filter.findTargets(fixture.resolve("BP"));

        assert.deepEqual(scan.targets, []);
    });
});

describe("BrarchiveFilter.encodeDirectoryToBrarchive", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("writes an archive with minified entries", async () => {
        fixture.writeFile("BP/entities/foo.json", '{ "a": 1 } // note');
        fixture.writeFile("BP/entities/bar.json", '{ "b": 2 }');

        await filter.encodeDirectoryToBrarchive(fixture.resolve("BP/entities"), fixture.resolve("out"), "entities", true);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("out/entities.brarchive")), [
            { content: '{"b":2}', name: "bar.json" },
            { content: '{"a":1}', name: "foo.json" },
        ]);
    });

    test("preserves content when minify is disabled", async () => {
        fixture.writeFile("BP/entities/foo.json", '{ "a": 1 }');

        await filter.encodeDirectoryToBrarchive(fixture.resolve("BP/entities"), fixture.resolve("out"), "entities", false);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("out/entities.brarchive")), [
            { content: '{ "a": 1 }', name: "foo.json" },
        ]);
    });

    test("skips excluded files", async () => {
        fixture.writeFile("BP/ui/_global_variables.json", "{}");
        fixture.writeFile("BP/ui/main.json", "{}");

        await filter.encodeDirectoryToBrarchive(fixture.resolve("BP/ui"), fixture.resolve("out"), "ui", true);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("out/ui.brarchive")), [{ content: "{}", name: "main.json" }]);
    });

    test("writes nothing when every file is excluded", async () => {
        fixture.writeFile("BP/ui/_global_variables.json", "{}");

        await filter.encodeDirectoryToBrarchive(fixture.resolve("BP/ui"), fixture.resolve("out"), "ui", true);

        assert.equal(fixture.exists("out/ui.brarchive"), false);
    });

    test("ignores child directories", async () => {
        fixture.writeFile("BP/entities/foo.json", "{}");
        fixture.writeFile("BP/entities/sub/bar.json", "{}");

        await filter.encodeDirectoryToBrarchive(fixture.resolve("BP/entities"), fixture.resolve("out"), "entities", true);

        assert.deepEqual(BrarchiveDecoder.decodeEntries(fixture.readBuffer("out/entities.brarchive")), [
            { content: "{}", name: "foo.json" },
        ]);
    });
});

describe("BrarchiveFilter.cleanupEmptyDirectories", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("removes nested empty directory chains", async () => {
        fixture.makeDirectory("root/a/b/c");

        await filter.cleanupEmptyDirectories(fixture.resolve("root"));

        assert.equal(fixture.exists("root/a"), false);
        assert.equal(fixture.exists("root"), true);
    });

    test("keeps directories that contain files", async () => {
        fixture.writeFile("root/keep/file.txt", "data");
        fixture.makeDirectory("root/drop");

        await filter.cleanupEmptyDirectories(fixture.resolve("root"));

        assert.equal(fixture.exists("root/keep/file.txt"), true);
        assert.equal(fixture.exists("root/drop"), false);
    });

    test("keeps directories named in the skip set even when empty", async () => {
        fixture.makeDirectory("root/__brarchive");

        await filter.cleanupEmptyDirectories(fixture.resolve("root"), new Set(["__brarchive"]));

        assert.equal(fixture.exists("root/__brarchive"), true);
    });

    test("never removes the root itself", async () => {
        fixture.makeDirectory("root");

        await filter.cleanupEmptyDirectories(fixture.resolve("root"));

        assert.equal(fixture.exists("root"), true);
    });
});

describe("BrarchiveFilter.runEncodeWorkers", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("completes with an empty job list", async () => {
        await assert.doesNotReject(() => filter.runEncodeWorkers([]));
    });

    test("encodes every job", async () => {
        const relativePathList = ["one", "two", "three"];

        for (const relativePath of relativePathList) {
            fixture.writeFile(`BP/${relativePath}/data.json`, "{}");
        }

        await filter.runEncodeWorkers(
            relativePathList.map((relativePath) => {
                return {
                    directoryPath: fixture.resolve(`BP/${relativePath}`),
                    outputRoot: fixture.resolve("out"),
                    relativePath,
                    shouldMinify: true,
                };
            })
        );

        for (const relativePath of relativePathList) {
            assert.equal(fixture.exists(`out/${relativePath}.brarchive`), true);
        }
    });
});

describe("BrarchiveFilter.setPackOptimizationVersion", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("stamps the version and preserves other manifest fields", async () => {
        fixture.writeFile("BP/manifest.json", JSON.stringify({ format_version: 2, header: { name: "Pack" } }));

        await filter.setPackOptimizationVersion(fixture.resolve("BP"));

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.equal(manifest.header.pack_optimization_version, BrarchiveFilter.PACK_OPTIMIZATION_VERSION);
        assert.equal(manifest.header.name, "Pack");
        assert.equal(manifest.format_version, 2);
    });

    test("creates the header when missing", async () => {
        fixture.writeFile("BP/manifest.json", "{}");

        await filter.setPackOptimizationVersion(fixture.resolve("BP"));

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.equal(manifest.header.pack_optimization_version, BrarchiveFilter.PACK_OPTIMIZATION_VERSION);
    });

    test("replaces a non-object header", async () => {
        fixture.writeFile("BP/manifest.json", JSON.stringify({ header: [] }));

        await filter.setPackOptimizationVersion(fixture.resolve("BP"));

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.equal(manifest.header.pack_optimization_version, BrarchiveFilter.PACK_OPTIMIZATION_VERSION);
    });

    test("tolerates comments in the manifest", async () => {
        fixture.writeFile("BP/manifest.json", '{ /* note */ "header": {}, }');

        await filter.setPackOptimizationVersion(fixture.resolve("BP"));

        const manifest = JSON.parse(fixture.readText("BP/manifest.json"));
        assert.equal(manifest.header.pack_optimization_version, BrarchiveFilter.PACK_OPTIMIZATION_VERSION);
    });

    test("writes indented output with a trailing newline", async () => {
        fixture.writeFile("BP/manifest.json", "{}");

        await filter.setPackOptimizationVersion(fixture.resolve("BP"));

        const rawManifest = fixture.readText("BP/manifest.json");
        assert.ok(rawManifest.endsWith("\n"));
        assert.ok(rawManifest.includes("  "));
    });

    test("throws when a required manifest is missing", async () => {
        fixture.makeDirectory("BP");

        await assert.rejects(() => filter.setPackOptimizationVersion(fixture.resolve("BP")), /manifest\.json not found/);
    });

    test("skips silently when an optional manifest is missing", async () => {
        fixture.makeDirectory("BP");

        await filter.setPackOptimizationVersion(fixture.resolve("BP"), false);

        assert.equal(fixture.exists("BP/manifest.json"), false);
    });
});

describe("BrarchiveFilter.getSubpackDirectoryNameList", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("returns an empty list when subpacks is missing", async () => {
        fixture.makeDirectory("BP");

        assert.deepEqual(await filter.getSubpackDirectoryNameList(fixture.resolve("BP")), []);
    });

    test("returns only child directories", async () => {
        fixture.makeDirectory("BP/subpacks/fancy");
        fixture.writeFile("BP/subpacks/readme.txt", "not a subpack");

        assert.deepEqual(await filter.getSubpackDirectoryNameList(fixture.resolve("BP")), ["fancy"]);
    });
});

describe("BrarchiveFilter.processSubpacks", () => {
    const filter = new BrarchiveFilter(process.cwd(), {});
    let fixture: PackFixture;

    beforeEach(() => {
        fixture = new PackFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("invokes the handler for each subpack", async () => {
        fixture.makeDirectory("BP/subpacks/one");
        fixture.makeDirectory("BP/subpacks/two");
        const handledNameList: string[] = [];

        await filter.processSubpacks(fixture.resolve("BP"), async (subpackDirectoryName) => {
            handledNameList.push(subpackDirectoryName);
        });

        assert.deepEqual(handledNameList.sort(), ["one", "two"]);
    });

    test("does not invoke the handler without subpacks", async () => {
        fixture.makeDirectory("BP");
        let handledCount = 0;

        await filter.processSubpacks(fixture.resolve("BP"), async () => {
            handledCount += 1;
        });

        assert.equal(handledCount, 0);
    });
});
