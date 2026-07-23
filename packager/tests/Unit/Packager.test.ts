import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { ResolvedArgs } from "../../src/Types/PackagerTypes";
import Packager from "../../src/Lib/Packager";
import ProjectFixture from "../Helpers/ProjectFixture";
import ZipReader from "../Helpers/ZipReader";

describe("Packager.joinArchivePath", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("joins segments with forward slashes", () => {
        assert.equal(packager.joinArchivePath("Content", "behavior_packs", "BP_X"), "Content/behavior_packs/BP_X");
    });

    test("drops empty segments", () => {
        assert.equal(packager.joinArchivePath("", "BP", ""), "BP");
        assert.equal(packager.joinArchivePath("", ""), "");
    });

    test("normalizes backslashes", () => {
        assert.equal(packager.joinArchivePath("a\\b", "c"), "a/b/c");
    });
});

describe("Packager.normalizeArchivePath", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("replaces every backslash", () => {
        assert.equal(packager.normalizeArchivePath("a\\b\\c.json"), "a/b/c.json");
    });
});

describe("Packager.shouldStoreArchiveEntry", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("stores already-compressed extensions case-insensitively", () => {
        assert.equal(packager.shouldStoreArchiveEntry("art/key.PNG"), true);
        assert.equal(packager.shouldStoreArchiveEntry("audio/theme.ogg"), true);
    });

    test("deflates other extensions", () => {
        assert.equal(packager.shouldStoreArchiveEntry("data/entity.json"), false);
    });
});

describe("Packager.isWorldPackKind", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("accepts only behavior and resource packs", () => {
        assert.equal(packager.isWorldPackKind("behavior_pack"), true);
        assert.equal(packager.isWorldPackKind("resource_pack"), true);
        assert.equal(packager.isWorldPackKind("world_template"), false);
    });
});

describe("Packager.createExcludedPackFilePathSet", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("excludes generated reference files for world templates", () => {
        const excludedSet = packager.createExcludedPackFilePathSet({ contentType: "world" } as ResolvedArgs, "world_template");

        assert.deepEqual([...(excludedSet as Set<string>)].sort(), ["world_behavior_packs.json", "world_resource_packs.json"]);
    });

    test("returns null for every other combination", () => {
        assert.equal(packager.createExcludedPackFilePathSet({ contentType: "world" } as ResolvedArgs, "behavior_pack"), null);
        assert.equal(packager.createExcludedPackFilePathSet({ contentType: "addon" } as ResolvedArgs, "world_template"), null);
    });
});

describe("Packager.formatValidationErrors", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("counts and indents grouped errors", () => {
        const message = packager.formatValidationErrors(["a"], ["b"]);

        assert.equal(message, "2 packaging validation failure(s):\n  a\n  b");
    });
});

describe("Packager.createBuildState", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("derives archive paths from the content type extension", () => {
        const args = { archiveContentName: "MyPack", buildPath: path.resolve("build"), contentType: "addon" } as ResolvedArgs;

        const buildState = packager.createBuildState(path.resolve("temp"), args);

        assert.equal(buildState.gameOutputPath, path.resolve("build", "MyPack.mcaddon"));
        assert.equal(buildState.gameTempPath, path.resolve("temp", "MyPack.mcaddon"));
        assert.equal(buildState.submissionOutputPath, path.resolve("build", "MyPack.zip"));
        assert.equal(buildState.submissionTempPath, path.resolve("temp", "MyPack.zip"));
    });
});

describe("Packager filesystem checks", () => {
    const packager = new Packager(process.cwd(), process.cwd());
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("isExistingDirectory distinguishes directories from files and null", () => {
        fixture.makeDirectory("dir");
        fixture.writeFile("file.txt", "x");

        assert.equal(packager.isExistingDirectory(fixture.resolve("dir")), true);
        assert.equal(packager.isExistingDirectory(fixture.resolve("file.txt")), false);
        assert.equal(packager.isExistingDirectory(fixture.resolve("missing")), false);
        assert.equal(packager.isExistingDirectory(null), false);
    });
});

describe("Packager.resolvePackManifestState", () => {
    const packager = new Packager(process.cwd(), process.cwd());
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("reports an exact manifest", () => {
        fixture.writeFile("pack/manifest.json", "{}");

        const state = packager.resolvePackManifestState(fixture.resolve("pack"));

        assert.equal(state.status, "exact");
        assert.equal(state.actualPath, fixture.resolve(path.join("pack", "manifest.json")));
    });

    test("reports a casing mismatch", () => {
        fixture.writeFile("pack/Manifest.json", "{}");

        const state = packager.resolvePackManifestState(fixture.resolve("pack"));

        assert.equal(state.status, "case_mismatch");
    });

    test("reports a missing manifest", () => {
        fixture.makeDirectory("pack");

        const state = packager.resolvePackManifestState(fixture.resolve("pack"));

        assert.equal(state.status, "missing");
        assert.equal(state.actualPath, null);
    });
});

describe("Packager.collectPackErrors", () => {
    const packager = new Packager(process.cwd(), process.cwd());
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Builds minimal args pointing pack paths into the fixture.
     *
     * @param contentType - Selected content type.
     *
     * @returns Minimal resolved args for pack validation.
     */
    function createArgs(contentType: ResolvedArgs["contentType"]): ResolvedArgs {
        return {
            contentType,
            packPaths: {
                behaviorPackPath: fixture.resolve("BP"),
                resourcePackPath: fixture.resolve("RP"),
                skinPackPath: null,
                worldPath: null,
            },
        } as ResolvedArgs;
    }

    test("reports missing required pack folders", () => {
        const errors = packager.collectPackErrors(createArgs("addon"));

        assert.equal(errors.length, 2);
        assert.match(errors[0], /behavior pack folder/);
        assert.match(errors[1], /resource pack folder/);
    });

    test("reports a pack folder without a manifest", () => {
        fixture.writeFile("BP/manifest.json", "{}");
        fixture.makeDirectory("RP");

        const errors = packager.collectPackErrors(createArgs("addon"));

        assert.equal(errors.length, 1);
        assert.match(errors[0], /missing required manifest\.json for resource pack/);
    });

    test("passes when required packs and manifests exist", () => {
        fixture.writeFile("BP/manifest.json", "{}");
        fixture.writeFile("RP/manifest.json", "{}");

        assert.deepEqual(packager.collectPackErrors(createArgs("addon")), []);
    });
});

describe("Packager.listFilesRecursive", () => {
    const packager = new Packager(process.cwd(), process.cwd());
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("lists nested files relative to the root", () => {
        fixture.writeFile("pack/manifest.json", "{}");
        fixture.writeFile("pack/textures/icon.png", "png");

        const filePathList = packager.listFilesRecursive(fixture.resolve("pack")).map((entry) => packager.normalizeArchivePath(entry));

        assert.deepEqual(filePathList.sort(), ["manifest.json", "textures/icon.png"]);
    });

    test("skips excluded normalized paths", () => {
        fixture.writeFile("pack/manifest.json", "{}");
        fixture.writeFile("pack/world_behavior_packs.json", "[]");

        const filePathList = packager.listFilesRecursive(fixture.resolve("pack"), new Set(["world_behavior_packs.json"]));

        assert.deepEqual(filePathList, ["manifest.json"]);
    });
});

describe("Packager.publishBuiltFile", () => {
    const packager = new Packager(process.cwd(), process.cwd());
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("moves a build into a fresh destination", () => {
        fixture.writeFile("temp/built.zip", "new");
        fixture.makeDirectory("out");

        packager.publishBuiltFile(fixture.resolve("temp/built.zip"), fixture.resolve("out/final.zip"));

        assert.equal(fixture.readText("out/final.zip"), "new");
        assert.equal(fixture.exists("temp/built.zip"), false);
    });

    test("replaces an existing destination and removes the backup", () => {
        fixture.writeFile("temp/built.zip", "new");
        fixture.writeFile("out/final.zip", "old");

        packager.publishBuiltFile(fixture.resolve("temp/built.zip"), fixture.resolve("out/final.zip"));

        assert.equal(fixture.readText("out/final.zip"), "new");
    });
});

describe("Packager.cleanupTemporaryArtifact", () => {
    const packager = new Packager(process.cwd(), process.cwd());
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("removes an existing artifact", () => {
        fixture.writeFile("junk.tmp", "x");

        packager.cleanupTemporaryArtifact(fixture.resolve("junk.tmp"));

        assert.equal(fixture.exists("junk.tmp"), false);
    });

    test("ignores null and missing paths", () => {
        assert.doesNotThrow(() => packager.cleanupTemporaryArtifact(null));
        assert.doesNotThrow(() => packager.cleanupTemporaryArtifact(fixture.resolve("missing.tmp")));
    });
});

describe("Packager.createTemporarySiblingPath", () => {
    const packager = new Packager(process.cwd(), process.cwd());

    test("creates unique hidden siblings beside the destination", () => {
        const destinationPath = path.resolve("out", "final.zip");
        const first = packager.createTemporarySiblingPath(destinationPath, "backup");
        const second = packager.createTemporarySiblingPath(destinationPath, "backup");

        assert.equal(path.dirname(first), path.resolve("out"));
        assert.ok(path.basename(first).startsWith(".final.zip.backup."));
        assert.ok(first.endsWith(".tmp"));
        assert.notEqual(first, second);
    });
});

describe("Packager.createArchive", () => {
    const packager = new Packager(process.cwd(), process.cwd());
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("writes appended entries to the output zip", async () => {
        const outputPath = fixture.resolve("out.zip");

        await packager.createArchive(outputPath, (archive) => {
            archive.append("hello", { name: "docs/readme.txt" });
        });

        assert.deepEqual(ZipReader.listEntryNames(outputPath), ["docs/readme.txt"]);
        assert.equal(ZipReader.readEntryText(outputPath, "docs/readme.txt"), "hello");
    });

    test("rejects when the builder throws", async () => {
        await assert.rejects(
            packager.createArchive(fixture.resolve("broken.zip"), () => {
                throw new Error("builder failed");
            }),
            /builder failed/
        );
    });
});
