import assert from "node:assert/strict";
import { describe, test } from "node:test";
import FilterPaths from "../../src/Lib/FilterPaths";

describe("FilterPaths.normalizeRelativePath", () => {
    test("converts backslashes to forward slashes", () => {
        assert.equal(FilterPaths.normalizeRelativePath("a\\b\\c"), "a/b/c");
    });

    test("collapses redundant segments", () => {
        assert.equal(FilterPaths.normalizeRelativePath("a/./b/../c"), "a/c");
    });
});

describe("FilterPaths.isSubPath", () => {
    test("accepts a nested child", () => {
        assert.equal(FilterPaths.isSubPath("a", "a/b"), true);
    });

    test("accepts an identical path", () => {
        assert.equal(FilterPaths.isSubPath("a", "a"), true);
    });

    test("rejects an unrelated path", () => {
        assert.equal(FilterPaths.isSubPath("a", "b"), false);
    });
});

describe("FilterPaths.toManifestPath", () => {
    test("strips the BP root", () => {
        assert.equal(FilterPaths.toManifestPath("BP/scripts/main.js"), "scripts/main.js");
    });

    test("throws outside the behavior pack", () => {
        assert.throws(() => FilterPaths.toManifestPath("RP/scripts/main.js"), /outside the behavior pack root/);
    });
});

describe("FilterPaths.ensureTrailingSlash", () => {
    test("adds a slash when missing", () => {
        assert.equal(FilterPaths.ensureTrailingSlash("a/b"), "a/b/");
    });

    test("leaves an existing slash", () => {
        assert.equal(FilterPaths.ensureTrailingSlash("a/b/"), "a/b/");
    });
});

describe("FilterPaths.joinRelativePath", () => {
    test("joins and normalizes segments", () => {
        assert.equal(FilterPaths.joinRelativePath("a", "b/c"), "a/b/c");
    });
});
