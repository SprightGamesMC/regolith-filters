import assert from "node:assert/strict";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { ArtAsset, ArtGroup } from "../../src/Types/PackagerTypes";
import AssetValidator from "../../src/Lib/AssetValidator";
import PackagerFixture from "../Helpers/PackagerFixture";
import ProjectFixture from "../Helpers/ProjectFixture";
import PsdFixture from "../Helpers/PsdFixture";
import { STORE_ART_SPECS } from "../../src/Data/AssetRequirements";

describe("AssetValidator.matchesExpectedDpi", () => {
    test("accepts values within tolerance", () => {
        assert.equal(AssetValidator.matchesExpectedDpi(72.005, 72), true);
    });

    test("rejects values outside tolerance", () => {
        assert.equal(AssetValidator.matchesExpectedDpi(72.02, 72), false);
    });
});

describe("AssetValidator.formatDpi", () => {
    test("collapses matching axes", () => {
        assert.equal(AssetValidator.formatDpi({ horizontalDpi: 72, verticalDpi: 72 }), "72 DPI");
    });

    test("shows both axes when they differ", () => {
        assert.equal(AssetValidator.formatDpi({ horizontalDpi: 72, verticalDpi: 96 }), "72x96 DPI");
    });

    test("labels missing values as unknown", () => {
        assert.equal(AssetValidator.formatDpi({}), "unknown DPI");
    });
});

describe("AssetValidator.roundDpi", () => {
    test("rounds to two decimals", () => {
        assert.equal(AssetValidator.roundDpi(72.005), "72.01");
    });

    test("labels non-finite values as unknown", () => {
        assert.equal(AssetValidator.roundDpi(undefined), "unknown");
        assert.equal(AssetValidator.roundDpi(Number.NaN), "unknown");
    });
});

describe("AssetValidator.resolveFormat", () => {
    test("prefers metadata format and normalizes jpg", () => {
        assert.equal(AssetValidator.resolveFormat({ format: "jpg" }, "art/key.png"), "jpeg");
        assert.equal(AssetValidator.resolveFormat({ format: "PNG" }, "art/key.jpg"), "png");
    });

    test("falls back to the file extension", () => {
        assert.equal(AssetValidator.resolveFormat({}, "art/key.PSD"), "psd");
    });
});

describe("AssetValidator.describeRoleKey", () => {
    test("labels plain roles and indexed screenshots", () => {
        assert.equal(AssetValidator.describeRoleKey("key_art", null), "key: key_art");
        assert.equal(AssetValidator.describeRoleKey("screenshots", 2), "key: screenshots[2]");
    });
});

describe("AssetValidator.normalizeRasterMetadata", () => {
    test("maps density onto both DPI axes", () => {
        const metadata = AssetValidator.normalizeRasterMetadata({ density: 300 } as never);

        assert.equal(metadata.horizontalDpi, 300);
        assert.equal(metadata.verticalDpi, 300);
    });

    test("leaves DPI unset without density", () => {
        const metadata = AssetValidator.normalizeRasterMetadata({} as never);

        assert.equal(metadata.horizontalDpi, undefined);
    });
});

describe("AssetValidator.validateArtCount", () => {
    /**
     * Builds a screenshot list of the requested size.
     *
     * @param count - Number of fake screenshots.
     *
     * @returns Art group containing only screenshots.
     */
    function createGroup(count: number): ArtGroup {
        const screenshots = Array.from({ length: count }, (_, index) => {
            return { fileName: `s${index}.jpg`, sourcePath: `s${index}.jpg` };
        });

        return { screenshots };
    }

    test("reports an exact-count mismatch", () => {
        const errors: string[] = [];

        AssetValidator.validateArtCount(errors, "Store Art", createGroup(3), STORE_ART_SPECS, ["screenshots"]);

        assert.equal(errors.length, 1);
        assert.match(errors[0], /expected exactly 5 screenshot assets, received 3/);
    });

    test("passes at the exact count", () => {
        const errors: string[] = [];

        AssetValidator.validateArtCount(errors, "Store Art", createGroup(5), STORE_ART_SPECS, ["screenshots"]);

        assert.deepEqual(errors, []);
    });

    test("skips the check when screenshots are optional and absent", () => {
        const errors: string[] = [];

        AssetValidator.validateArtCount(errors, "Store Art", {}, STORE_ART_SPECS, ["key_art"]);

        assert.deepEqual(errors, []);
    });
});

describe("AssetValidator.validateSingleAsset", () => {
    let fixture: ProjectFixture;

    before(() => {
        fixture = new ProjectFixture();
    });

    after(() => {
        fixture.dispose();
    });

    /**
     * Builds an asset record for a fixture file.
     *
     * @param relativePath - File path relative to the fixture root.
     *
     * @returns Resolved asset record.
     */
    function createAsset(relativePath: string): ArtAsset {
        return { fileName: path.basename(relativePath), sourcePath: fixture.resolve(relativePath) };
    }

    test("passes a spec-compliant asset", async () => {
        await PackagerFixture.writeJpeg(fixture.resolve("good.jpg"), 800, 450, 72);

        const errors = await AssetValidator.validateSingleAsset(
            "Store Art",
            "key_art",
            createAsset("good.jpg"),
            STORE_ART_SPECS.key_art,
            null
        );

        assert.deepEqual(errors, []);
    });

    test("skips absent assets", async () => {
        assert.deepEqual(await AssetValidator.validateSingleAsset("Store Art", "key_art", undefined, STORE_ART_SPECS.key_art, null), []);
    });

    test("reports a dimension mismatch", async () => {
        await PackagerFixture.writeJpeg(fixture.resolve("small.jpg"), 100, 100, 72);

        const errors = await AssetValidator.validateSingleAsset(
            "Store Art",
            "key_art",
            createAsset("small.jpg"),
            STORE_ART_SPECS.key_art,
            null
        );

        assert.equal(errors.length, 1);
        assert.match(errors[0], /expected 800x450, got 100x100/);
    });

    test("reports a format mismatch", async () => {
        fixture.writeFile("art.psd", PsdFixture.create({ width: 800, height: 450, horizontalDpi: 72 }));

        const errors = await AssetValidator.validateSingleAsset(
            "Store Art",
            "key_art",
            createAsset("art.psd"),
            STORE_ART_SPECS.key_art,
            null
        );

        assert.equal(errors.length, 1);
        assert.match(errors[0], /expected jpeg, got PSD/);
    });

    test("reports a DPI mismatch", async () => {
        await PackagerFixture.writeJpeg(fixture.resolve("dense.jpg"), 800, 450, 300);

        const errors = await AssetValidator.validateSingleAsset(
            "Store Art",
            "key_art",
            createAsset("dense.jpg"),
            STORE_ART_SPECS.key_art,
            null
        );

        assert.equal(errors.length, 1);
        assert.match(errors[0], /expected 72 DPI, got 300 DPI/);
    });

    test("reports a panorama width outside its range", async () => {
        await PackagerFixture.writeJpeg(fixture.resolve("narrow.jpg"), 500, 450, 72);

        const errors = await AssetValidator.validateSingleAsset(
            "Store Art",
            "panorama",
            createAsset("narrow.jpg"),
            STORE_ART_SPECS.panorama,
            null
        );

        assert.equal(errors.length, 1);
        assert.match(errors[0], /expected width between 1000 and 4000, got 500/);
    });

    test("reports unreadable image files", async () => {
        fixture.writeFile("broken.jpg", "not an image");

        const errors = await AssetValidator.validateSingleAsset(
            "Store Art",
            "key_art",
            createAsset("broken.jpg"),
            STORE_ART_SPECS.key_art,
            null
        );

        assert.equal(errors.length, 1);
        assert.match(errors[0], /could not read image metadata/);
    });
});

describe("AssetValidator.readAssetMetadata", () => {
    let fixture: ProjectFixture;

    before(() => {
        fixture = new ProjectFixture();
    });

    after(() => {
        fixture.dispose();
    });

    test("reads PSD files with the PSD reader", async () => {
        fixture.writeFile("art.psd", PsdFixture.create({ width: 1920, height: 1080, horizontalDpi: 300 }));

        const metadata = await AssetValidator.readAssetMetadata({ fileName: "art.psd", sourcePath: fixture.resolve("art.psd") });

        assert.equal(metadata.format, "psd");
        assert.equal(metadata.width, 1920);
        assert.equal(metadata.horizontalDpi, 300);
    });

    test("reads raster files with sharp", async () => {
        await PackagerFixture.writeJpeg(fixture.resolve("art.jpg"), 800, 450, 72);

        const metadata = await AssetValidator.readAssetMetadata({ fileName: "art.jpg", sourcePath: fixture.resolve("art.jpg") });

        assert.equal(metadata.format, "jpeg");
        assert.equal(metadata.width, 800);
        assert.equal(metadata.horizontalDpi, 72);
    });
});
