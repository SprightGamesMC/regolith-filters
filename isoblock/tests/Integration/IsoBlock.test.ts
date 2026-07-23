import assert from "node:assert/strict";
import fs from "node:fs";
import { afterEach, describe, test } from "node:test";
import { PNG } from "pngjs";
import IsoBlockFilter from "../../src/Lib/IsoBlockFilter";
import ImageAssertions from "../Helpers/ImageAssertions";
import OutputCapture from "../Helpers/OutputCapture";
import WorkspaceFixture from "../Helpers/WorkspaceFixture";

/**
 * Creates a solid, opaque PNG texture buffer.
 *
 * @param size - Width and height in pixels.
 *
 * @returns Encoded PNG buffer.
 */
function createTexture(size: number): Buffer {
    const png = new PNG({ width: size, height: size });

    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 200;
        png.data[i + 1] = 60;
        png.data[i + 2] = 60;
        png.data[i + 3] = 255;
    }

    return PNG.sync.write(png);
}

/**
 * Builds a minimal Regolith project with one block using builtin geometry.
 *
 * @param workspace - Workspace to populate.
 */
function createProject(workspace: WorkspaceFixture): void {
    workspace.writeFile(
        "config.json",
        `{
            // Regolith project config.
            "packs": { "behaviorPack": "./BP", "resourcePack": "./RP" }
        }`
    );
    workspace.writeFile(
        "BP/blocks/test_block.json",
        `{
            "format_version": "1.21.0",
            "minecraft:block": {
                // Comments must not break block parsing.
                "description": { "identifier": "spright:test_block" },
                "components": {
                    "minecraft:item_visual": {
                        "geometry": "minecraft:geometry.full_block",
                        "material_instances": { "*": { "texture": "test_texture" } }
                    },
                    "minecraft:material_instances": { "*": { "texture": "test_texture" } }
                }
            }
        }`
    );
    workspace.writeFile(
        "RP/textures/terrain_texture.json",
        `{
            "texture_data": {
                // Comments must not break texture parsing.
                "test_texture": { "textures": "textures/blocks/test_texture" }
            }
        }`
    );
    workspace.writeFile("RP/textures/blocks/test_texture.png", createTexture(16));
}

/**
 * Adds a single-part block with a 32-unit-tall custom model to the project.
 *
 * @param workspace - Workspace to populate.
 */
function addTallBlock(workspace: WorkspaceFixture): void {
    workspace.writeFile(
        "RP/models/blocks/tall.geo.json",
        JSON.stringify({
            format_version: "1.12.0",
            "minecraft:geometry": [
                {
                    description: { identifier: "geometry.tall", texture_width: 16, texture_height: 16 },
                    bones: [{ name: "root", pivot: [0, 0, 0], cubes: [{ origin: [-8, 0, -8], size: [16, 32, 16], uv: [0, 0] }] }],
                },
            ],
        })
    );
    workspace.writeFile(
        "BP/blocks/tall_block.json",
        JSON.stringify({
            format_version: "1.21.0",
            "minecraft:block": {
                description: { identifier: "spright:tall_block" },
                components: {
                    "minecraft:geometry": "geometry.tall",
                    "minecraft:material_instances": { "*": { texture: "test_texture" } },
                },
            },
        })
    );
}

/**
 * Adds a three-part multi_block tower to the project.
 *
 * @param workspace - Workspace to populate.
 */
function addTowerBlock(workspace: WorkspaceFixture): void {
    workspace.writeFile(
        "BP/blocks/tower_block.json",
        JSON.stringify({
            format_version: "1.21.0",
            "minecraft:block": {
                description: {
                    identifier: "spright:tower_block",
                    traits: { "minecraft:multi_block": { parts: 3, direction: "up" } },
                },
                components: {
                    "minecraft:geometry": "minecraft:geometry.full_block",
                    "minecraft:material_instances": { "*": { texture: "test_texture" } },
                },
            },
        })
    );
}

/**
 * Runs the filter and reads a rendered output image.
 *
 * @param workspace - Populated project workspace.
 * @param outputName - Output image file name.
 *
 * @returns Decoded PNG image.
 */
async function renderProject(workspace: WorkspaceFixture, outputName: string): Promise<PNG> {
    const filter = new IsoBlockFilter(workspace.workspacePath, workspace.workspacePath, { outputPath: "out", resolution: 64 });
    const output = await OutputCapture.record(() => filter.run());

    assert.equal(output.stderrText, "");

    return PNG.sync.read(fs.readFileSync(workspace.resolve(`out/${outputName}`)));
}

describe("isoblock integration", () => {
    const workspace = new WorkspaceFixture();

    afterEach(() => {
        workspace.dispose();
    });

    test("renders a block definition to an isometric PNG", async () => {
        createProject(workspace);
        const filter = new IsoBlockFilter(workspace.workspacePath, workspace.workspacePath, { outputPath: "out", resolution: 32 });

        const output = await OutputCapture.record(() => filter.run());

        assert.equal(output.stderrText, "");
        assert.match(output.stdoutText, /Rendering Complete in /);

        const imagePath = workspace.resolve("out/test_block.png");
        assert.ok(fs.existsSync(imagePath));

        const image = PNG.sync.read(fs.readFileSync(imagePath));
        assert.equal(image.width, 32);
        assert.equal(image.height, 32);

        assert.ok(ImageAssertions.hasVisiblePixels(image));
        assert.equal(ImageAssertions.countVisibleBorderPixels(image), 0);
    });

    test("does not cut off a tall single-part model", async () => {
        createProject(workspace);
        addTallBlock(workspace);

        const image = await renderProject(workspace, "tall_block.png");

        assert.ok(ImageAssertions.hasVisiblePixels(image));
        assert.equal(ImageAssertions.countVisibleBorderPixels(image), 0);
    });

    test("does not cut off a stacked multi_block model", async () => {
        createProject(workspace);
        addTowerBlock(workspace);

        const image = await renderProject(workspace, "tower_block.png");

        assert.ok(ImageAssertions.hasVisiblePixels(image));
        assert.equal(ImageAssertions.countVisibleBorderPixels(image), 0);
    });
});
