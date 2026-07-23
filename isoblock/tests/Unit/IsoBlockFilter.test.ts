import type { FetchFunction, IsoBlockSettings, PackContext } from "../../src/Types/IsoBlockTypes";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import FilterLogger from "../../src/Lib/FilterLogger";
import IsoBlockFilter from "../../src/Lib/IsoBlockFilter";
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
 * Creates a vanilla cache whose downloads always fail.
 *
 * @returns VanillaTextureCache.
 */
function createOfflineCache(): VanillaTextureCache {
    const fetchStub: FetchFunction = () =>
        Promise.resolve({ ok: false, status: 404, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });

    return new VanillaTextureCache(path.join(os.tmpdir(), "isoblock-test-offline-cache"), createSilentLogger(), fetchStub);
}

/**
 * Creates a filter instance for unit testing.
 *
 * @param rawSettings - Raw settings passed to the filter.
 * @param vanillaTextures - Vanilla cache override. Defaults to an offline cache.
 *
 * @returns IsoBlockFilter.
 */
function createFilter(rawSettings: unknown = {}, vanillaTextures: VanillaTextureCache = createOfflineCache()): IsoBlockFilter {
    return new IsoBlockFilter(process.cwd(), process.cwd(), rawSettings, vanillaTextures);
}

/**
 * Creates a render context for unit testing.
 *
 * @param overrides - Context fields to override.
 *
 * @returns PackContext.
 */
function createContext(overrides: Partial<PackContext> = {}): PackContext {
    return { rpPath: path.join("root", "RP"), textureData: {}, geoMap: {}, ...overrides };
}

describe("IsoBlockFilter.createSettings", () => {
    test("applies canonical defaults", () => {
        assert.deepEqual(createFilter().createSettings({}), { outputPath: "build/isoblock", resolution: 128 });
    });

    test("keeps provided values over defaults", () => {
        assert.deepEqual(createFilter().createSettings({ resolution: 64 }), { outputPath: "build/isoblock", resolution: 64 });
    });

    test("falls back to defaults when raw settings are not an object", () => {
        const filter = new IsoBlockFilter(process.cwd(), process.cwd(), null);
        const settings = (filter as unknown as { settings: IsoBlockSettings }).settings;

        assert.deepEqual(settings, { outputPath: "build/isoblock", resolution: 128 });
    });
});

describe("IsoBlockFilter.offsetForPart", () => {
    const filter = createFilter();

    test("stacks along the trait direction", () => {
        assert.deepEqual(filter.offsetForPart("up", 2), [0, 32, 0]);
        assert.deepEqual(filter.offsetForPart("west", 1), [-16, 0, 0]);
    });

    test("returns a zero offset for the first part", () => {
        assert.deepEqual(filter.offsetForPart("east", 0), [0, 0, 0]);
    });

    test("falls back to up for unknown directions", () => {
        assert.deepEqual(filter.offsetForPart("sideways", 1), [0, 16, 0]);
    });
});

describe("IsoBlockFilter.componentsForPart", () => {
    const filter = createFilter();
    const baseComponents = { "minecraft:geometry": "geometry.base" };
    const permutations = [
        {
            condition: "q.block_state('spright:multi_block_part') == 1",
            components: { "minecraft:geometry": "geometry.one" },
        },
        {
            condition: "q.block_property('cardinal_direction') == 'north'",
            components: { "minecraft:geometry": "geometry.rotated" },
        },
    ];

    test("returns base components when no permutation matches", () => {
        assert.deepEqual(filter.componentsForPart(baseComponents, permutations, 0), baseComponents);
    });

    test("merges the permutation targeting the part index", () => {
        assert.deepEqual(filter.componentsForPart(baseComponents, permutations, 1), { "minecraft:geometry": "geometry.one" });
    });
});

describe("IsoBlockFilter.resolveTexturePath", () => {
    const filter = createFilter();

    test("resolves a string value", () => {
        assert.equal(filter.resolveTexturePath("textures/blocks/stone"), "textures/blocks/stone");
    });

    test("resolves the first array entry", () => {
        assert.equal(filter.resolveTexturePath(["textures/a", "textures/b"]), "textures/a");
    });

    test("resolves an object with a path", () => {
        assert.equal(filter.resolveTexturePath({ path: "textures/c" }), "textures/c");
    });

    test("resolves the first weighted variation", () => {
        assert.equal(filter.resolveTexturePath({ variations: [{ path: "textures/d" }, { path: "textures/e" }] }), "textures/d");
    });

    test("returns an empty string when unknown", () => {
        assert.equal(filter.resolveTexturePath(undefined), "");
    });
});

describe("IsoBlockFilter.buildTextureConfig", () => {
    const filter = createFilter();
    const context = createContext({ textureData: { stone: { textures: "textures/blocks/stone" } } });

    test("maps faces to absolute texture paths with a default render method", async () => {
        const config = await filter.buildTextureConfig({ "*": { texture: "stone" } }, context);

        assert.deepEqual(config, {
            "*": { texture: path.join(context.rpPath, "textures/blocks/stone.png"), render_method: "opaque" },
        });
    });

    test("keeps an explicit render method", async () => {
        const config = await filter.buildTextureConfig({ up: { texture: "stone", render_method: "alpha_test" } }, context);

        assert.equal(config.up.render_method, "alpha_test");
    });
});

describe("IsoBlockFilter.resolveFaceTexture", () => {
    const workspace = new WorkspaceFixture();

    afterEach(() => {
        workspace.dispose();
    });

    /**
     * Creates a fetch stub serving vanilla terrain data and a stone texture.
     *
     * @param requestedUrls - Array collecting every requested URL.
     *
     * @returns FetchFunction.
     */
    function createVanillaFetchStub(requestedUrls: string[]): FetchFunction {
        const terrainText = JSON.stringify({ texture_data: { stone: { textures: "textures/blocks/stone" } } });

        return (url) => {
            requestedUrls.push(url);
            const body = new TextEncoder().encode(url.endsWith("terrain_texture.json") ? terrainText : "png-bytes");

            return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(body.buffer as ArrayBuffer) });
        };
    }

    test("downloads vanilla textures missing from the pack", async () => {
        const requestedUrls: string[] = [];
        const cache = new VanillaTextureCache(workspace.resolve("cache"), createSilentLogger(), createVanillaFetchStub(requestedUrls));
        const filter = createFilter({}, cache);

        const texturePath = await filter.resolveFaceTexture("stone", createContext());

        assert.equal(texturePath, workspace.resolve(path.join("cache", "textures", "blocks", "stone.png")));
        assert.ok(fs.existsSync(texturePath));
        assert.equal(requestedUrls.length, 2);
    });

    test("finds pack tga textures", async () => {
        const requestedUrls: string[] = [];
        const cache = new VanillaTextureCache(workspace.resolve("cache"), createSilentLogger(), createVanillaFetchStub(requestedUrls));
        const filter = createFilter({}, cache);
        const packTexturePath = workspace.writeFile("RP/textures/blocks/stone.tga", "tga-bytes");
        const context = createContext({
            rpPath: workspace.resolve("RP"),
            textureData: { stone: { textures: "textures/blocks/stone" } },
        });

        assert.equal(await filter.resolveFaceTexture("stone", context), packTexturePath);
        assert.equal(requestedUrls.length, 0);
    });

    test("prefers pack textures that exist on disk", async () => {
        const requestedUrls: string[] = [];
        const cache = new VanillaTextureCache(workspace.resolve("cache"), createSilentLogger(), createVanillaFetchStub(requestedUrls));
        const filter = createFilter({}, cache);
        const packTexturePath = workspace.writeFile("RP/textures/blocks/stone.png", "png-bytes");
        const context = createContext({
            rpPath: workspace.resolve("RP"),
            textureData: { stone: { textures: "textures/blocks/stone" } },
        });

        assert.equal(await filter.resolveFaceTexture("stone", context), packTexturePath);
        assert.equal(requestedUrls.length, 0);
    });
});

describe("IsoBlockFilter.resolveModelRotation", () => {
    const filter = createFilter();

    test("rotates cross geometry blocks 45 degrees", () => {
        const block = { components: { "minecraft:geometry": "minecraft:geometry.cross" } };

        assert.deepEqual(filter.resolveModelRotation(block), [0, 45, 0]);
    });

    test("reads the item_visual geometry, including the object form", () => {
        const block = {
            components: { "minecraft:item_visual": { geometry: { identifier: "minecraft:geometry.cross" } } },
        };

        assert.deepEqual(filter.resolveModelRotation(block), [0, 45, 0]);
    });

    test("returns null for other geometry", () => {
        assert.equal(filter.resolveModelRotation({ components: { "minecraft:geometry": "minecraft:geometry.full_block" } }), null);
        assert.equal(filter.resolveModelRotation({}), null);
    });
});

describe("IsoBlockFilter.resolveGeometry", () => {
    const filter = createFilter();
    const workspace = new WorkspaceFixture();

    afterEach(() => {
        workspace.dispose();
    });

    test("resolves builtin geometry identifiers", () => {
        const modelData = filter.resolveGeometry("minecraft:geometry.full_block", createContext());

        assert.ok(modelData?.["minecraft:geometry"]?.length);
    });

    test("loads mapped resource-pack geometry with comments", () => {
        const geoPath = workspace.writeFile(
            "RP/models/blocks/custom.geo.json",
            '{ /* model */ "minecraft:geometry": [{ "description": { "identifier": "geometry.custom" } }] }'
        );
        const context = createContext({ geoMap: { "geometry.custom": geoPath } });

        const modelData = filter.resolveGeometry("geometry.custom", context);

        assert.equal(modelData?.["minecraft:geometry"]?.[0]?.description?.identifier, "geometry.custom");
    });

    test("returns null for unknown identifiers", () => {
        assert.equal(filter.resolveGeometry("geometry.unknown", createContext()), null);
    });
});

describe("IsoBlockFilter.collectParts", () => {
    const filter = createFilter();
    const materials = { "*": { texture: "stone" } };

    test("returns no parts without components", async () => {
        assert.deepEqual(await filter.collectParts({}, createContext()), []);
    });

    test("uses item_visual geometry for single-part blocks", async () => {
        const block = {
            description: { identifier: "spright:test" },
            components: {
                "minecraft:item_visual": { geometry: "minecraft:geometry.full_block", material_instances: materials },
            },
        };

        const parts = await filter.collectParts(block, createContext());

        assert.equal(parts.length, 1);
        assert.deepEqual(parts[0].offset, [0, 0, 0]);
        assert.ok(parts[0].modelData["minecraft:geometry"]);
    });

    test("carries bone_visibility into the part", async () => {
        const block = {
            components: {
                "minecraft:item_visual": {
                    geometry: { identifier: "minecraft:geometry.full_block", bone_visibility: { root: false } },
                    material_instances: materials,
                },
            },
        };

        const parts = await filter.collectParts(block, createContext());

        assert.deepEqual(parts[0].boneVisibility, { root: false });
    });

    test("accepts the object form of the geometry component", async () => {
        const block = {
            components: {
                "minecraft:item_visual": { geometry: { identifier: "minecraft:geometry.cross" }, material_instances: materials },
            },
        };

        assert.equal((await filter.collectParts(block, createContext())).length, 1);
    });

    test("builds one offset part per multi_block segment", async () => {
        const block = {
            description: { traits: { "minecraft:multi_block": { parts: 2, direction: "up" } } },
            components: {
                "minecraft:geometry": "minecraft:geometry.full_block",
                "minecraft:material_instances": materials,
            },
        };

        const parts = await filter.collectParts(block, createContext());

        assert.equal(parts.length, 2);
        assert.deepEqual(parts[0].offset, [0, 0, 0]);
        assert.deepEqual(parts[1].offset, [0, 16, 0]);
    });

    test("skips parts whose geometry cannot be resolved", async () => {
        const block = {
            components: {
                "minecraft:geometry": "geometry.unknown",
                "minecraft:material_instances": materials,
            },
        };

        assert.deepEqual(await filter.collectParts(block, createContext()), []);
    });
});
