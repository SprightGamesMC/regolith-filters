import type { FetchFunction, FetchResult } from "../../src/Types/IsoBlockTypes";
import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, describe, test } from "node:test";
import FilterLogger from "../../src/Lib/FilterLogger";
import VanillaTextureCache from "../../src/Lib/VanillaTextureCache";
import WorkspaceFixture from "../Helpers/WorkspaceFixture";

/**
 * Creates a logger that drops warnings to keep test output clean.
 *
 * @returns FilterLogger.
 */
function createSilentLogger(): FilterLogger {
    const logger = new FilterLogger();
    logger.warn = (): void => {};

    return logger;
}

/**
 * Creates a successful fetch result serving the given text.
 *
 * @param text - Response body text.
 *
 * @returns FetchResult.
 */
function createFetchResult(text: string): FetchResult {
    const body = new TextEncoder().encode(text);

    return { ok: true, status: 200, arrayBuffer: () => Promise.resolve(body.buffer as ArrayBuffer) };
}

describe("VanillaTextureCache.fetchTexture", () => {
    const workspace = new WorkspaceFixture();

    afterEach(() => {
        workspace.dispose();
    });

    /**
     * Creates a cache with a counting fetch stub.
     *
     * @param requestedUrls - Array collecting every requested URL.
     * @param fetchFunction - Fetch override. Defaults to serving fake texture bytes.
     *
     * @returns VanillaTextureCache.
     */
    function createCache(requestedUrls: string[], fetchFunction?: FetchFunction): VanillaTextureCache {
        const countingFetch: FetchFunction = (url) => {
            requestedUrls.push(url);

            return fetchFunction ? fetchFunction(url) : Promise.resolve(createFetchResult("png-bytes"));
        };

        return new VanillaTextureCache(workspace.resolve("cache"), createSilentLogger(), countingFetch);
    }

    test("downloads a texture into the cache", async () => {
        const requestedUrls: string[] = [];
        const cache = createCache(requestedUrls);

        const filePath = await cache.fetchTexture("textures/blocks/stone");

        assert.ok(filePath);
        assert.equal(fs.readFileSync(filePath, "utf8"), "png-bytes");
        assert.deepEqual(requestedUrls, [`${VanillaTextureCache.BASE_URL}textures/blocks/stone.png`]);
    });

    test("shares one download between concurrent requests", async () => {
        const requestedUrls: string[] = [];
        const cache = createCache(requestedUrls);

        const [first, second] = await Promise.all([
            cache.fetchTexture("textures/blocks/stone"),
            cache.fetchTexture("textures/blocks/stone"),
        ]);

        assert.equal(first, second);
        assert.equal(requestedUrls.length, 1);
    });

    test("reuses the disk cache across instances without downloading", async () => {
        await createCache([]).fetchTexture("textures/blocks/stone");

        const requestedUrls: string[] = [];
        const filePath = await createCache(requestedUrls).fetchTexture("textures/blocks/stone");

        assert.ok(filePath);
        assert.equal(requestedUrls.length, 0);
    });

    test("falls back to a tga texture when the repository has no png", async () => {
        const requestedUrls: string[] = [];
        const cache = createCache(requestedUrls, (url) =>
            url.endsWith(".png")
                ? Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
                : Promise.resolve(createFetchResult("tga-bytes"))
        );

        const filePath = await cache.fetchTexture("textures/blocks/cake");

        assert.ok(filePath?.endsWith(".tga"));
        assert.equal(fs.readFileSync(filePath, "utf8"), "tga-bytes");
        assert.equal(requestedUrls.length, 2);
    });

    test("reuses a cached tga without retrying the png download", async () => {
        workspace.writeFile("cache/textures/blocks/cake.tga", "tga-bytes");

        const requestedUrls: string[] = [];
        const filePath = await createCache(requestedUrls).fetchTexture("textures/blocks/cake");

        assert.ok(filePath?.endsWith(".tga"));
        assert.equal(requestedUrls.length, 0);
    });

    test("returns null when the texture is not in the repository", async () => {
        const cache = createCache([], () =>
            Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })
        );

        assert.equal(await cache.fetchTexture("textures/blocks/unknown"), null);
    });

    test("returns null when the download fails", async () => {
        const cache = createCache([], () => Promise.reject(new Error("offline")));

        assert.equal(await cache.fetchTexture("textures/blocks/stone"), null);
    });
});

describe("VanillaTextureCache.loadTextureData", () => {
    const workspace = new WorkspaceFixture();

    afterEach(() => {
        workspace.dispose();
    });

    test("downloads and parses the vanilla terrain texture data once", async () => {
        const requestedUrls: string[] = [];
        const fetchStub: FetchFunction = (url) => {
            requestedUrls.push(url);

            return Promise.resolve(createFetchResult(JSON.stringify({ texture_data: { stone: { textures: "textures/blocks/stone" } } })));
        };
        const cache = new VanillaTextureCache(workspace.resolve("cache"), createSilentLogger(), fetchStub);

        const textureData = await cache.loadTextureData();

        assert.deepEqual(textureData, { stone: { textures: "textures/blocks/stone" } });
        assert.deepEqual(await cache.loadTextureData(), textureData);
        assert.deepEqual(requestedUrls, [`${VanillaTextureCache.BASE_URL}${VanillaTextureCache.TERRAIN_TEXTURE_PATH}`]);
    });

    test("returns an empty object when the download fails", async () => {
        const cache = new VanillaTextureCache(workspace.resolve("cache"), createSilentLogger(), () => Promise.reject(new Error("offline")));

        assert.deepEqual(await cache.loadTextureData(), {});
    });
});
