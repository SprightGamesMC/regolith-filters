import assert from "node:assert/strict";
import { describe, test } from "node:test";
import AssetOutputNames from "../../src/Lib/AssetOutputNames";

describe("AssetOutputNames store names", () => {
    test("builds fixed store filenames", () => {
        assert.equal(AssetOutputNames.createStoreKeyArtName("game"), "game_Thumbnail_0.jpg");
        assert.equal(AssetOutputNames.createStorePanoramaName("game"), "game_panorama_0.jpg");
        assert.equal(AssetOutputNames.createStorePackIconName("game"), "game_packicon_0.jpg");
        assert.equal(AssetOutputNames.createStoreScreenshotName("game", 3), "game_screenshot_3.jpg");
    });
});

describe("AssetOutputNames marketing names", () => {
    test("keeps the source extension for key art", () => {
        assert.equal(AssetOutputNames.createMarketingKeyArtName("Game", { fileName: "art.psd" }), "Game_MarketingKeyArt.psd");
    });

    test("falls back to .jpg when no extension is known", () => {
        assert.equal(AssetOutputNames.createMarketingKeyArtName("Game", undefined), "Game_MarketingKeyArt.jpg");
    });

    test("indexes marketing screenshots", () => {
        assert.equal(AssetOutputNames.createMarketingScreenshotName("Game", 2, { fileName: "s.jpeg" }), "Game_MarketingScreenshot_2.jpeg");
    });
});

describe("AssetOutputNames.normalizeOutputExtension", () => {
    test("lowercases and dots the extension", () => {
        assert.equal(AssetOutputNames.normalizeOutputExtension(".PNG"), ".png");
        assert.equal(AssetOutputNames.normalizeOutputExtension("psd"), ".psd");
    });

    test("uses the fallback for blank input", () => {
        assert.equal(AssetOutputNames.normalizeOutputExtension(""), ".jpg");
        assert.equal(AssetOutputNames.normalizeOutputExtension("   ", ".png"), ".png");
    });
});
