import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import Arguments from "../../src/Lib/Arguments";
import ProjectFixture from "../Helpers/ProjectFixture";

describe("Arguments.parseSettings", () => {
    test("parses a JSON object", () => {
        assert.deepEqual(Arguments.parseSettings('{"a":1}'), { a: 1 });
    });

    test("rejects empty input", () => {
        assert.throws(() => Arguments.parseSettings(""), /Missing filter settings/);
    });

    test("rejects invalid JSON", () => {
        assert.throws(() => Arguments.parseSettings("{"), /Invalid filter settings/);
    });

    test("rejects non-object JSON", () => {
        assert.throws(() => Arguments.parseSettings("[1,2]"), /must be a JSON object/);
    });
});

describe("Arguments.readRequiredString", () => {
    test("returns the trimmed value", () => {
        assert.equal(Arguments.readRequiredString({ name: "  value  " }, "name"), "value");
    });

    test("rejects missing, blank, and non-string values", () => {
        assert.throws(() => Arguments.readRequiredString({}, "name"), /non-empty string/);
        assert.throws(() => Arguments.readRequiredString({ name: "   " }, "name"), /non-empty string/);
        assert.throws(() => Arguments.readRequiredString({ name: 5 }, "name"), /non-empty string/);
    });
});

describe("Arguments.readSafePathToken", () => {
    test("accepts letters, numbers, underscores, and hyphens", () => {
        assert.equal(Arguments.readSafePathToken({ token: "My_Pack-2" }, "token"), "My_Pack-2");
    });

    test("rejects separators and other characters", () => {
        assert.throws(() => Arguments.readSafePathToken({ token: "a b" }, "token"), /only letters/);
        assert.throws(() => Arguments.readSafePathToken({ token: "a/b" }, "token"), /only letters/);
        assert.throws(() => Arguments.readSafePathToken({ token: "a." }, "token"), /only letters/);
    });
});

describe("Arguments.readOptionalSafePathToken", () => {
    test("returns the fallback when absent or null", () => {
        assert.equal(Arguments.readOptionalSafePathToken({}, "token", null), null);
        assert.equal(Arguments.readOptionalSafePathToken({ token: null }, "token", "fb"), "fb");
    });

    test("validates a provided token", () => {
        assert.equal(Arguments.readOptionalSafePathToken({ token: "ok" }, "token", null), "ok");
        assert.throws(() => Arguments.readOptionalSafePathToken({ token: "a b" }, "token", null), /only letters/);
    });
});

describe("Arguments.readObject", () => {
    test("returns a plain object", () => {
        assert.deepEqual(Arguments.readObject({ paths: { a: 1 } }, "paths"), { a: 1 });
    });

    test("rejects arrays, null, and missing keys", () => {
        assert.throws(() => Arguments.readObject({ paths: [] }, "paths"), /must be an object/);
        assert.throws(() => Arguments.readObject({ paths: null }, "paths"), /must be an object/);
        assert.throws(() => Arguments.readObject({}, "paths"), /must be an object/);
    });
});

describe("Arguments.readVersionTuple", () => {
    test("returns a three-part tuple", () => {
        assert.deepEqual(Arguments.readVersionTuple({ v: [1, 2, 3] }, "v"), [1, 2, 3]);
    });

    test("rejects wrong length", () => {
        assert.throws(() => Arguments.readVersionTuple({ v: [1, 2] }, "v"), /exactly three integers/);
    });

    test("rejects negative or non-integer parts", () => {
        assert.throws(() => Arguments.readVersionTuple({ v: [1, -2, 3] }, "v"), /non-negative integers/);
        assert.throws(() => Arguments.readVersionTuple({ v: [1, 2, 3.5] }, "v"), /non-negative integers/);
    });
});

describe("Arguments.readOptionalVersionTuple", () => {
    test("returns the fallback when absent or null", () => {
        assert.equal(Arguments.readOptionalVersionTuple({}, "v", null), null);
        assert.deepEqual(Arguments.readOptionalVersionTuple({ v: null }, "v", [1, 0, 0]), [1, 0, 0]);
    });

    test("validates a provided tuple", () => {
        assert.deepEqual(Arguments.readOptionalVersionTuple({ v: [1, 2, 3] }, "v", null), [1, 2, 3]);
        assert.throws(() => Arguments.readOptionalVersionTuple({ v: [1] }, "v", null), /exactly three integers/);
    });
});

describe("Arguments.readOptionalBoolean", () => {
    test("returns the fallback when absent", () => {
        assert.equal(Arguments.readOptionalBoolean({}, "flag", true), true);
    });

    test("returns the provided boolean", () => {
        assert.equal(Arguments.readOptionalBoolean({ flag: false }, "flag", true), false);
    });

    test("rejects non-boolean values", () => {
        assert.throws(() => Arguments.readOptionalBoolean({ flag: "yes" }, "flag", false), /must be a boolean/);
    });
});

describe("Arguments.createArchiveContentName", () => {
    test("collapses to PascalCase", () => {
        assert.equal(Arguments.createArchiveContentName("test pack!! two"), "TestPackTwo");
        assert.equal(Arguments.toPascalCaseName("a-b_c"), "ABC");
    });

    test("rejects names with no usable characters", () => {
        assert.throws(() => Arguments.createArchiveContentName("!!! ---"), /at least one letter or number/);
    });
});

describe("Arguments.isPathInsideRoot", () => {
    const root = path.resolve("root");

    test("accepts descendants and the root itself", () => {
        assert.equal(Arguments.isPathInsideRoot(root, root), true);
        assert.equal(Arguments.isPathInsideRoot(root, path.resolve(root, "child", "leaf")), true);
    });

    test("rejects escapes", () => {
        assert.equal(Arguments.isPathInsideRoot(root, path.resolve(root, "..")), false);
        assert.equal(Arguments.isPathInsideRoot(root, path.resolve(root, "..", "sibling")), false);
    });
});

describe("Arguments.resolveProjectRelativePath", () => {
    const root = path.resolve("root");

    test("resolves a relative path under the root", () => {
        assert.equal(Arguments.resolveProjectRelativePath("build/out", root, "key"), path.resolve(root, "build", "out"));
    });

    test("rejects absolute paths", () => {
        assert.throws(() => Arguments.resolveProjectRelativePath(path.resolve("elsewhere"), root, "key"), /must be project-relative/);
    });

    test("rejects paths escaping the root", () => {
        assert.throws(() => Arguments.resolveProjectRelativePath("../outside", root, "key"), /stay inside the project root/);
    });
});

describe("Arguments.resolveCanonicalPath", () => {
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("resolves an existing path", () => {
        const directoryPath = fixture.makeDirectory("real");

        assert.equal(Arguments.resolveCanonicalPath(directoryPath), Arguments.REALPATH_RESOLVER(directoryPath));
    });

    test("resolves missing tail segments against the nearest existing ancestor", () => {
        const missingPath = fixture.resolve(path.join("real", "missing", "leaf"));

        fixture.makeDirectory("real");

        const canonicalPath = Arguments.resolveCanonicalPath(missingPath);
        assert.ok(canonicalPath.endsWith(path.join("real", "missing", "leaf")));
    });
});

describe("Arguments path resolvers", () => {
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("resolveRequiredPath returns an existing directory", () => {
        fixture.makeDirectory("art");

        assert.equal(Arguments.resolveRequiredPath({ art_path: "art" }, "art_path", fixture.workspacePath), fixture.resolve("art"));
    });

    test("resolveRequiredPath rejects missing paths and files", () => {
        fixture.writeFile("file.txt", "x");

        assert.throws(() => Arguments.resolveRequiredPath({ art_path: "missing" }, "art_path", fixture.workspacePath), /does not exist/);
        assert.throws(
            () => Arguments.resolveRequiredPath({ art_path: "file.txt" }, "art_path", fixture.workspacePath),
            /must point to a directory/
        );
    });

    test("resolveOptionalPath returns null when absent or null", () => {
        assert.equal(Arguments.resolveOptionalPath({}, "world_path", fixture.workspacePath), null);
        assert.equal(Arguments.resolveOptionalPath({ world_path: null }, "world_path", fixture.workspacePath), null);
    });

    test("resolveOptionalPath validates a provided path", () => {
        fixture.makeDirectory("world");

        assert.equal(Arguments.resolveOptionalPath({ world_path: "world" }, "world_path", fixture.workspacePath), fixture.resolve("world"));
        assert.throws(() => Arguments.resolveOptionalPath({ world_path: "  " }, "world_path", fixture.workspacePath), /string or null/);
        assert.throws(() => Arguments.resolveOptionalPath({ world_path: "gone" }, "world_path", fixture.workspacePath), /does not exist/);
    });

    test("resolveOutputPath allows a missing directory but rejects files", () => {
        fixture.writeFile("taken.txt", "x");

        assert.equal(Arguments.resolveOutputPath("build", fixture.workspacePath, "key"), fixture.resolve("build"));
        assert.throws(() => Arguments.resolveOutputPath("taken.txt", fixture.workspacePath, "key"), /must point to a directory/);
    });

    test("resolveContentPaths requires the type-specific paths", () => {
        fixture.makeDirectory("StoreArt");
        fixture.makeDirectory("MarketingArt");

        const paths = { build_path: "build", store_art_path: "StoreArt", marketing_art_path: "MarketingArt" };

        assert.throws(() => Arguments.resolveContentPaths(paths, fixture.workspacePath, "world"), /world_path/);
        assert.throws(() => Arguments.resolveContentPaths(paths, fixture.workspacePath, "skin_pack"), /skin_pack_path/);
        assert.equal(Arguments.resolveContentPaths(paths, fixture.workspacePath, "addon").worldPath, null);
    });
});

describe("Arguments.validateArtMappings", () => {
    test("accepts a complete mapping", () => {
        assert.doesNotThrow(() => {
            Arguments.validateArtMappings({ key_art: "a.jpg", screenshots: ["s.jpg"] }, ["key_art", "screenshots"], "store_art");
        });
    });

    test("rejects unknown roles", () => {
        assert.throws(() => Arguments.validateArtMappings({ bogus: "a.jpg" }, [], "store_art"), /Unknown role "bogus"/);
    });

    test("rejects missing required roles", () => {
        assert.throws(() => Arguments.validateArtMappings({}, ["key_art"], "store_art"), /Missing required role "key_art"/);
    });

    test("rejects invalid screenshots lists", () => {
        assert.throws(() => Arguments.validateArtMappings({ screenshots: [] }, [], "store_art"), /non-empty array/);
        assert.throws(() => Arguments.validateArtMappings({ screenshots: "s.jpg" }, [], "store_art"), /non-empty array/);
        assert.throws(() => Arguments.validateArtMappings({ screenshots: ["ok.jpg", " "] }, [], "store_art"), /non-empty strings/);
    });

    test("rejects blank role values", () => {
        assert.throws(() => Arguments.validateArtMappings({ key_art: "  " }, [], "store_art"), /non-empty string/);
    });
});

describe("Arguments.resolveArtFiles", () => {
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
    });

    afterEach(() => {
        fixture.dispose();
    });

    test("resolves existing files with metadata", () => {
        fixture.writeFile("art/key.jpg", "jpeg");
        fixture.writeFile("art/s0.jpg", "jpeg");

        const resolvedArt = Arguments.resolveArtFiles({ key_art: "key.jpg", screenshots: ["s0.jpg"] }, fixture.resolve("art"), "store_art");

        assert.deepEqual(resolvedArt.key_art, { fileName: "key.jpg", sourcePath: fixture.resolve(path.join("art", "key.jpg")) });
        assert.equal(resolvedArt.screenshots?.length, 1);
    });

    test("rejects missing files", () => {
        fixture.makeDirectory("art");

        assert.throws(() => Arguments.resolveArtFiles({ key_art: "gone.jpg" }, fixture.resolve("art"), "store_art"), /was not found/);
    });

    test("rejects files escaping the art directory", () => {
        fixture.writeFile("secret.txt", "x");
        fixture.makeDirectory("art");

        assert.throws(
            () => Arguments.resolveArtFiles({ key_art: "../secret.txt" }, fixture.resolve("art"), "store_art"),
            /must stay inside/
        );
    });
});

describe("Arguments.resolve", () => {
    let fixture: ProjectFixture;

    beforeEach(() => {
        fixture = new ProjectFixture();
        fixture.makeDirectory("StoreArt");
        fixture.makeDirectory("MarketingArt");
        fixture.writeFile("StoreArt/key.jpg", "jpeg");
        fixture.writeFile("StoreArt/s0.jpg", "jpeg");
        fixture.writeFile("StoreArt/s1.jpg", "jpeg");
        fixture.writeFile("StoreArt/s2.jpg", "jpeg");
        fixture.writeFile("StoreArt/s3.jpg", "jpeg");
        fixture.writeFile("StoreArt/s4.jpg", "jpeg");
        fixture.writeFile("StoreArt/panorama.jpg", "jpeg");
        fixture.writeFile("StoreArt/icon.jpg", "jpeg");
        fixture.writeFile("MarketingArt/key.jpg", "jpeg");
        fixture.writeFile("MarketingArt/s0.jpg", "jpeg");
        fixture.writeFile("MarketingArt/partner.jpg", "jpeg");
    });

    afterEach(() => {
        fixture.dispose();
    });

    /**
     * Builds a complete valid addon settings object.
     *
     * @returns Raw settings object.
     */
    function createAddonSettings(): Record<string, unknown> {
        return {
            content_type: "addon",
            content_name: "My Pack",
            content_acronym: "MP",
            content_version: [1, 2, 3],
            min_engine_version: [1, 20, 0],
            paths: { build_path: "build", store_art_path: "StoreArt", marketing_art_path: "MarketingArt" },
            store_art: {
                key_art: "key.jpg",
                screenshots: ["s0.jpg", "s1.jpg", "s2.jpg", "s3.jpg", "s4.jpg"],
                panorama: "panorama.jpg",
                pack_icon: "icon.jpg",
            },
            marketing_art: { key_art: "key.jpg", screenshots: ["s0.jpg"], partner_art: "partner.jpg" },
        };
    }

    test("resolves a complete addon configuration", () => {
        const cwd = fixture.makeDirectory("data");

        const args = Arguments.resolve(JSON.stringify(createAddonSettings()), { cwd, projectRoot: fixture.workspacePath });

        assert.equal(args.archiveContentName, "MyPack");
        assert.equal(args.storeAssetContentName, "mypack");
        assert.equal(args.contentAcronym, "MP");
        assert.equal(args.isStandaloneRp, false);
        assert.equal(args.packPaths.behaviorPackPath, path.resolve(cwd, "BP"));
        assert.equal(args.packPaths.resourcePackPath, path.resolve(cwd, "RP"));
        assert.ok(fixture.exists("build"), "build directory should be created");
    });

    test("rejects an unknown content type", () => {
        const settings = { ...createAddonSettings(), content_type: "mystery" };

        assert.throws(
            () => Arguments.resolve(JSON.stringify(settings), { cwd: fixture.workspacePath, projectRoot: fixture.workspacePath }),
            /Invalid "content_type"/
        );
    });

    test("requires the acronym for non-skin content", () => {
        const settings = createAddonSettings();
        delete settings.content_acronym;

        assert.throws(
            () => Arguments.resolve(JSON.stringify(settings), { cwd: fixture.workspacePath, projectRoot: fixture.workspacePath }),
            /content_acronym/
        );
    });

    test("allows skin packs to omit the acronym and engine version", () => {
        fixture.makeDirectory("SkinPack");

        const settings = {
            content_type: "skin_pack",
            content_name: "My Skins",
            content_version: [1, 0, 0],
            paths: {
                build_path: "build",
                store_art_path: "StoreArt",
                marketing_art_path: "MarketingArt",
                skin_pack_path: "SkinPack",
            },
            store_art: { key_art: "key.jpg" },
            marketing_art: { key_art: "key.jpg", partner_art: "partner.jpg" },
        };

        const args = Arguments.resolve(JSON.stringify(settings), { cwd: fixture.workspacePath, projectRoot: fixture.workspacePath });

        assert.equal(args.contentAcronym, null);
        assert.equal(args.minEngineVersion, null);
        assert.equal(args.packPaths.skinPackPath, fixture.resolve("SkinPack"));
    });
});
