import assert from "node:assert/strict";
import { describe, test } from "node:test";
import PackManifest from "../../src/Lib/PackManifest";

describe("PackManifest.detectFormatVersion", () => {
    test("accepts numeric and string forms", () => {
        assert.equal(PackManifest.detectFormatVersion({ format_version: 2 }), 2);
        assert.equal(PackManifest.detectFormatVersion({ format_version: "3" }), 3);
    });

    test("rejects unsupported versions", () => {
        assert.throws(() => PackManifest.detectFormatVersion({ format_version: 4 }), /Unsupported manifest format_version/);
    });
});

describe("PackManifest.formatVersion", () => {
    test("emits an array below format 3", () => {
        assert.deepEqual(PackManifest.formatVersion([1, 2, 3], 2), [1, 2, 3]);
    });

    test("emits a dotted string at format 3", () => {
        assert.equal(PackManifest.formatVersion([1, 2, 3], 3), "1.2.3");
    });
});

describe("PackManifest.updateVersionFields", () => {
    test("rewrites version and engine fields but skips script modules", () => {
        const manifest = {
            header: { version: [0, 0, 1], min_engine_version: [1, 0, 0] },
            modules: [
                { type: "data", version: [0, 0, 1] },
                { type: "script", version: [9, 9, 9] },
            ],
        };

        PackManifest.updateVersionFields(manifest, [2, 5, 0], [1, 20, 0], 2);

        assert.deepEqual(manifest.header.version, [2, 5, 0]);
        assert.deepEqual(manifest.header.min_engine_version, [1, 20, 0]);
        assert.deepEqual(manifest.modules[0].version, [2, 5, 0]);
        assert.deepEqual(manifest.modules[1].version, [9, 9, 9]);
    });

    test("leaves engine fields untouched when no engine version is given", () => {
        const manifest = { header: { version: [0, 0, 1], min_engine_version: [1, 0, 0] } };

        PackManifest.updateVersionFields(manifest, [3, 0, 0], null, 2);

        assert.deepEqual(manifest.header.min_engine_version, [1, 0, 0]);
    });
});

describe("PackManifest.applyAddonRequirements", () => {
    test("tags addon resource packs with world scope", () => {
        const manifest: Record<string, unknown> = { header: {}, metadata: {} };

        PackManifest.applyAddonRequirements(manifest, "addon", "resource_pack");

        assert.equal((manifest.metadata as Record<string, unknown>).product_type, "addon");
        assert.equal((manifest.header as Record<string, unknown>).pack_scope, "world");
    });

    test("drops pack_scope for behavior packs", () => {
        const manifest: Record<string, unknown> = { header: { pack_scope: "world" }, metadata: {} };

        PackManifest.applyAddonRequirements(manifest, "addon", "behavior_pack");

        assert.equal((manifest.header as Record<string, unknown>).pack_scope, undefined);
    });

    test("does nothing for non-addon content", () => {
        const manifest: Record<string, unknown> = { header: {} };

        PackManifest.applyAddonRequirements(manifest, "world", "behavior_pack");

        assert.equal(manifest.metadata, undefined);
    });
});

describe("PackManifest.createWorldPackReference", () => {
    test("builds a reference from the header uuid", () => {
        const reference = PackManifest.createWorldPackReference({ header: { uuid: "abc" } }, [1, 2, 3], "manifest.json");

        assert.deepEqual(reference, { pack_id: "abc", version: [1, 2, 3] });
    });

    test("throws when the uuid is missing", () => {
        assert.throws(() => PackManifest.createWorldPackReference({ header: {} }, [1, 2, 3], "manifest.json"), /header.uuid/);
    });
});
