import type { GeometryBone, GeometryCube, RenderPart, Vector3Tuple } from "../../src/Types/IsoBlockTypes";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { PNG } from "pngjs";
import * as THREE from "three";
import IsoRenderer from "../../src/Lib/IsoRenderer";
import TgaFixture from "../Helpers/TgaFixture";

/**
 * Creates a unit cube definition for UV tests.
 *
 * @param uv - UV value to place on the cube.
 *
 * @returns GeometryCube.
 */
function createCube(uv: GeometryCube["uv"]): GeometryCube {
    return { origin: [0, 0, 0], size: [16, 16, 16], uv };
}

describe("IsoRenderer.toDisplayPoint", () => {
    const renderer = new IsoRenderer();

    test("mirrors the X axis", () => {
        assert.deepEqual(renderer.toDisplayPoint([1, 2, 3]), [-1, 2, 3]);
    });
});

describe("IsoRenderer.createFaceCorners", () => {
    const renderer = new IsoRenderer();

    test("orders north corners top-left to bottom-right", () => {
        const corners = renderer.createFaceCorners(8, 8, 8);

        assert.deepEqual(corners.north, [
            [8, 8, -8],
            [-8, 8, -8],
            [8, -8, -8],
            [-8, -8, -8],
        ]);
    });

    test("covers all six faces", () => {
        assert.deepEqual(Object.keys(renderer.createFaceCorners(1, 1, 1)).sort(), ["down", "east", "north", "south", "up", "west"]);
    });
});

describe("IsoRenderer.createBoxUvLayout", () => {
    const renderer = new IsoRenderer();

    test("lays out the standard box unwrap", () => {
        const layout = renderer.createBoxUvLayout(16, 16, 16);

        assert.deepEqual(layout[0], { face: "east", fromX: 0, fromY: 16, sizeX: 16, sizeY: 16 });
        assert.deepEqual(layout[5], { face: "north", fromX: 16, fromY: 16, sizeX: 16, sizeY: 16 });
    });

    test("encodes flipped up and down regions with negative sizes", () => {
        const upEntry = renderer.createBoxUvLayout(16, 16, 16).find((entry) => entry.face === "up");

        assert.deepEqual(upEntry, { face: "up", fromX: 32, fromY: 16, sizeX: -16, sizeY: -16 });
    });
});

describe("IsoRenderer.computeFaceRects", () => {
    const renderer = new IsoRenderer();

    test("uses box UV for array values", () => {
        const rects = renderer.computeFaceRects(createCube([0, 0]), undefined);

        assert.deepEqual(rects.north, { rect: [16, 16, 32, 32], rotation: 0 });
        assert.deepEqual(rects.east, { rect: [0, 16, 16, 32], rotation: 0 });
    });

    test("swaps east and west and flips horizontally when mirrored", () => {
        const rects = renderer.computeFaceRects({ ...createCube([0, 0]), mirror: true }, undefined);

        assert.deepEqual(rects.east.rect, [48, 16, 32, 32]);
        assert.deepEqual(rects.west.rect, [16, 16, 0, 32]);
    });

    test("inherits the bone mirror flag", () => {
        const rects = renderer.computeFaceRects(createCube([0, 0]), true);

        assert.deepEqual(rects.east.rect, [48, 16, 32, 32]);
    });

    test("uses per-face UV for object values", () => {
        const rects = renderer.computeFaceRects(createCube({ north: { uv: [0, 0], uv_size: [8, 8], uv_rotation: 90 } }), undefined);

        assert.deepEqual(rects, { north: { rect: [0, 0, 8, 8], rotation: 90 } });
    });

    test("defaults per-face UV size from the cube size", () => {
        const rects = renderer.computeFaceRects(createCube({ up: { uv: [4, 4] } }), undefined);

        assert.deepEqual(rects.up, { rect: [4, 4, 20, 20], rotation: 0 });
    });

    test("returns no rects without UV data", () => {
        assert.deepEqual(renderer.computeFaceRects(createCube(undefined), undefined), {});
    });
});

describe("IsoRenderer.createFaceUvCoords", () => {
    const renderer = new IsoRenderer();

    test("maps a full rect onto six vertices", () => {
        const coords = renderer.createFaceUvCoords({ rect: [0, 0, 16, 16], rotation: 0 }, 16, 16, 1);

        assert.deepEqual(coords, [0, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0]);
    });

    test("rotates corners by 90 degrees", () => {
        const coords = renderer.createFaceUvCoords({ rect: [0, 0, 16, 16], rotation: 90 }, 16, 16, 1);

        assert.deepEqual(coords, [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    });

    test("confines sampling to frame 0 of flipbook textures", () => {
        const coords = renderer.createFaceUvCoords({ rect: [0, 16, 16, 16], rotation: 0 }, 16, 16, 0.5);

        assert.equal(coords[1], 0.5);
    });
});

describe("IsoRenderer.createMaterial", () => {
    const renderer = new IsoRenderer();
    const texture = new THREE.Texture();

    test("defaults to opaque and single sided", () => {
        const material = renderer.createMaterial(undefined, texture);

        assert.equal(material.transparent, false);
        assert.equal(material.side, THREE.FrontSide);
    });

    test("enables alpha testing for alpha_test methods", () => {
        const material = renderer.createMaterial("alpha_test", texture);

        assert.equal(material.transparent, true);
        assert.equal(material.alphaTest, 0.5);
        assert.equal(material.side, THREE.DoubleSide);
    });

    test("enables blending for blend methods", () => {
        const material = renderer.createMaterial("blend", texture);

        assert.equal(material.transparent, true);
    });

    test("respects single_sided variants", () => {
        assert.equal(renderer.createMaterial("alpha_test_single_sided", texture).side, THREE.FrontSide);
    });
});

describe("IsoRenderer.resolveFaceConfig", () => {
    const renderer = new IsoRenderer();
    const textureConfig = {
        "*": { texture: "wildcard.png", render_method: "opaque" },
        north: { texture: "north.png", render_method: "opaque" },
        wood_b: { texture: "wood_b.png", render_method: "opaque" },
    };

    test("prefers the face's named material_instance", () => {
        const cube = createCube({ north: { uv: [0, 0], material_instance: "wood_b" } });

        assert.equal(renderer.resolveFaceConfig(cube, "north", textureConfig)?.texture, "wood_b.png");
    });

    test("falls back to the direction name for unknown named instances", () => {
        const cube = createCube({ north: { uv: [0, 0], material_instance: "missing" } });

        assert.equal(renderer.resolveFaceConfig(cube, "north", textureConfig)?.texture, "north.png");
    });

    test("uses direction lookup for box UV cubes", () => {
        assert.equal(renderer.resolveFaceConfig(createCube([0, 0]), "north", textureConfig)?.texture, "north.png");
    });

    test("falls back to the wildcard", () => {
        assert.equal(renderer.resolveFaceConfig(createCube([0, 0]), "up", textureConfig)?.texture, "wildcard.png");
    });

    test("returns undefined when nothing resolves", () => {
        assert.equal(renderer.resolveFaceConfig(createCube([0, 0]), "up", {}), undefined);
    });
});

describe("IsoRenderer.isBoneHidden", () => {
    const renderer = new IsoRenderer();
    const bones: Record<string, GeometryBone> = {
        root: { name: "root" },
        child: { name: "child", parent: "root" },
    };

    test("hides bones set to false", () => {
        assert.equal(renderer.isBoneHidden(bones.root, bones, { root: false }), true);
    });

    test("shows bones set to true or absent from the map", () => {
        assert.equal(renderer.isBoneHidden(bones.root, bones, { root: true }), false);
        assert.equal(renderer.isBoneHidden(bones.root, bones, {}), false);
    });

    test("hides bones gated by Molang expressions", () => {
        assert.equal(renderer.isBoneHidden(bones.root, bones, { root: "q.block_state('spright:stage') == 1" }), true);
    });

    test("hides children of hidden bones", () => {
        assert.equal(renderer.isBoneHidden(bones.child, bones, { root: false }), true);
        assert.equal(renderer.isBoneHidden(bones.child, bones, { root: true }), false);
    });
});

describe("IsoRenderer.decodeImage", () => {
    const renderer = new IsoRenderer();

    test("decodes png files", () => {
        const png = new PNG({ width: 2, height: 2 });
        png.data.fill(128);

        const image = renderer.decodeImage("texture.png", PNG.sync.write(png));

        assert.equal(image.width, 2);
        assert.equal(image.height, 2);
        assert.deepEqual([...image.data], new Array(16).fill(128));
    });

    test("decodes tga files by extension", () => {
        const file = TgaFixture.create({ width: 1, height: 1, body: Buffer.from([1, 2, 3, 4]) });

        const image = renderer.decodeImage("TEXTURE.TGA", file);

        assert.deepEqual([...image.data], [3, 2, 1, 4]);
    });
});

describe("IsoRenderer.computeHeightLevels", () => {
    const renderer = new IsoRenderer();

    /**
     * Creates a single-bone render part for height tests.
     *
     * @param height - Cube height in units.
     * @param offset - Part offset.
     * @param boneVisibility - `bone_visibility` map for the part.
     *
     * @returns RenderPart.
     */
    function createPart(height: number, offset: Vector3Tuple = [0, 0, 0], boneVisibility?: RenderPart["boneVisibility"]): RenderPart {
        return {
            modelData: {
                "minecraft:geometry": [{ bones: [{ name: "root", cubes: [{ origin: [0, 0, 0], size: [16, height, 16] }] }] }],
            },
            offset,
            textureConfig: {},
            boneVisibility,
        };
    }

    test("counts a 16-unit model as one level", () => {
        assert.equal(renderer.computeHeightLevels([createPart(16)]), 1);
    });

    test("raises one level per started 16 units", () => {
        assert.equal(renderer.computeHeightLevels([createPart(17)]), 2);
        assert.equal(renderer.computeHeightLevels([createPart(32)]), 2);
        assert.equal(renderer.computeHeightLevels([createPart(33)]), 3);
    });

    test("includes part offsets", () => {
        assert.equal(renderer.computeHeightLevels([createPart(16), createPart(16, [0, 16, 0])]), 2);
    });

    test("ignores hidden bones", () => {
        assert.equal(renderer.computeHeightLevels([createPart(48, [0, 0, 0], { root: false })]), 1);
    });

    test("returns one level for empty parts", () => {
        assert.equal(renderer.computeHeightLevels([]), 1);
    });
});

describe("IsoRenderer.createCamera", () => {
    const renderer = new IsoRenderer();

    test("frames single blocks at the default scale", () => {
        const camera = renderer.createCamera(new THREE.Group(), false);

        assert.ok(camera instanceof THREE.OrthographicCamera);
        assert.equal(camera.left, -IsoRenderer.DEFAULT_ISO_SCALE);
    });
});
