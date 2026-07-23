import type {
    BoneVisibility,
    BoxUvEntry,
    DecodedImage,
    FaceRect,
    FaceTexture,
    GeometryBone,
    GeometryCube,
    GeometryDefinition,
    GeometryFile,
    GeometryUvSpace,
    LoadedTexture,
    PerFaceUv,
    RenderPart,
    TextureConfig,
    TextureLoader,
    Vector3Tuple,
} from "../Types/IsoBlockTypes";
import { writeFileSync } from "fs";
import fs from "fs/promises";
import glFactory from "gl";
import { PNG } from "pngjs";
import * as THREE from "three";
import TgaDecoder from "./TgaDecoder";

/**
 * Renders isometric PNG images of Minecraft Bedrock block models.
 */
export default class IsoRenderer {
    static readonly AMBIENT_INTENSITY = 0.6;

    static readonly SUN_INTENSITY = 0.8;

    // Inventory icons view the block from the north-east, showing its top,
    // north, and east faces.
    static readonly CAMERA_DIRECTION = new THREE.Vector3(2, 1, -2).normalize();

    static readonly BLOCK_CENTER: Vector3Tuple = [0, 8, 0];

    static readonly BLOCK_SIZE = 16;

    static readonly DEFAULT_ISO_SCALE = 12;

    static readonly DEFAULT_RESOLUTION = 128;

    /**
     * Renders an isometric PNG of a Minecraft Bedrock block model.
     *
     * @param parts - Parts to render, composing into one image via their offsets.
     * @param outputPath - Destination .png path.
     * @param resolution - Output dimensions (square).
     * @param modelRotation - Optional world-space [x, y, z] rotation in degrees
     *   about the block centre (e.g. from minecraft:transformation).
     *
     * @returns Resolves after the image is written.
     */
    async render(
        parts: RenderPart[],
        outputPath: string,
        resolution: number = IsoRenderer.DEFAULT_RESOLUTION,
        modelRotation: number[] | null = null
    ): Promise<void> {
        const gl = glFactory(resolution, resolution);
        (gl as unknown as Record<string, unknown>).getInternalformatParameter = (): void => {};

        const renderer = new THREE.WebGLRenderer({
            context: gl,
            canvas: { addEventListener: () => {}, style: {}, getContext: () => gl } as unknown as HTMLCanvasElement,
            antialias: false,
        });
        renderer.setSize(resolution, resolution);
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        const modelRoot = new THREE.Group();
        let sceneRoot: THREE.Object3D = modelRoot;

        if (modelRotation?.some((value) => value !== 0)) {
            const [centerX, centerY, centerZ] = IsoRenderer.BLOCK_CENTER;
            const pivot = new THREE.Group();
            pivot.position.set(centerX, centerY, centerZ);
            modelRoot.position.set(-centerX, -centerY, -centerZ);
            this.applyWorldRotation(pivot, modelRotation);
            pivot.add(modelRoot);
            sceneRoot = pivot;
        }
        scene.add(sceneRoot);

        const loadTexture = this.createTextureLoader();
        for (const part of parts) {
            modelRoot.add(await this.buildPart(part, loadTexture));
        }

        const camera = this.createCamera(sceneRoot, parts.length > 1 || this.computeHeightLevels(parts) > 1);

        scene.add(new THREE.AmbientLight(0xffffff, IsoRenderer.AMBIENT_INTENSITY));
        const sun = new THREE.DirectionalLight(0xffffff, IsoRenderer.SUN_INTENSITY);
        sun.position.copy(camera.position).add(new THREE.Vector3(-10, 10, 10));
        scene.add(sun);

        renderer.render(scene, camera);
        this.writePixelsToPng(gl, resolution, outputPath);
    }

    /**
     * Mirrors a geometry point into display space. Bedrock geometry is stored
     * X-mirrored relative to how the game and Blockbench render it (Blockbench
     * bedrock.js parseCube/parseBone).
     *
     * @param point - Geometry-space [x, y, z] point.
     *
     * @returns Display-space point.
     */
    toDisplayPoint([x, y, z]: number[]): Vector3Tuple {
        return [-x, y, z];
    }

    /**
     * Applies a geometry-space rotation, negating the X/Y angles to match the
     * display-space mirror.
     *
     * @param object - Object to rotate.
     * @param rotation - Geometry [x, y, z] rotation in degrees.
     */
    applyGeoRotation(object: THREE.Object3D, [rx, ry, rz]: number[]): void {
        object.rotation.set(THREE.MathUtils.degToRad(-rx), THREE.MathUtils.degToRad(-ry), THREE.MathUtils.degToRad(rz), "ZYX");
    }

    /**
     * Applies a world-space rotation (e.g. minecraft:transformation), which is not mirrored.
     *
     * @param object - Object to rotate.
     * @param rotation - World [x, y, z] rotation in degrees.
     */
    applyWorldRotation(object: THREE.Object3D, [rx, ry, rz]: number[]): void {
        object.rotation.set(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz), "ZYX");
    }

    /**
     * Computes display-space corner positions for each cube face, given half extents.
     * Corners are ordered [topLeft, topRight, bottomLeft, bottomRight] as seen
     * from outside the cube, matching Blockbench's setShape layout.
     *
     * @param hx - Half extent along X.
     * @param hy - Half extent along Y.
     * @param hz - Half extent along Z.
     *
     * @returns Face corner positions keyed by face name.
     */
    createFaceCorners(hx: number, hy: number, hz: number): Record<string, Vector3Tuple[]> {
        return {
            north: [
                [hx, hy, -hz],
                [-hx, hy, -hz],
                [hx, -hy, -hz],
                [-hx, -hy, -hz],
            ],
            south: [
                [-hx, hy, hz],
                [hx, hy, hz],
                [-hx, -hy, hz],
                [hx, -hy, hz],
            ],
            east: [
                [hx, hy, hz],
                [hx, hy, -hz],
                [hx, -hy, hz],
                [hx, -hy, -hz],
            ],
            west: [
                [-hx, hy, -hz],
                [-hx, hy, hz],
                [-hx, -hy, -hz],
                [-hx, -hy, hz],
            ],
            up: [
                [-hx, hy, -hz],
                [hx, hy, -hz],
                [-hx, hy, hz],
                [hx, hy, hz],
            ],
            down: [
                [-hx, -hy, hz],
                [hx, -hy, hz],
                [-hx, -hy, -hz],
                [hx, -hy, -hz],
            ],
        };
    }

    /**
     * Computes the box UV unwrap layout in texture units. Negative sizes encode
     * the flipped up/down regions.
     *
     * @param w - Cube width in texture units.
     * @param h - Cube height in texture units.
     * @param d - Cube depth in texture units.
     *
     * @returns Box UV layout entries.
     */
    createBoxUvLayout(w: number, h: number, d: number): BoxUvEntry[] {
        return [
            { face: "east", fromX: 0, fromY: d, sizeX: d, sizeY: h },
            { face: "west", fromX: d + w, fromY: d, sizeX: d, sizeY: h },
            { face: "up", fromX: d + w, fromY: d, sizeX: -w, sizeY: -d },
            { face: "down", fromX: d + w * 2, fromY: 0, sizeX: -w, sizeY: d },
            { face: "south", fromX: d * 2 + w, fromY: d, sizeX: w, sizeY: h },
            { face: "north", fromX: d, fromY: d, sizeX: w, sizeY: h },
        ];
    }

    /**
     * Computes each face's UV rectangle [x1, y1, x2, y2] in texture units, from
     * either box UV (`uv: [u, v]`) or per-face UV (`uv: { north: {...} }`).
     * Inverted coordinates (x1 > x2) encode flips and are resolved by the vertex
     * mapping. Returns only faces that should render. Per-face up/down rects are
     * read as authored (the in-game block renderer does not apply Blockbench's
     * 180-degree up/down parse rotation); the box UV `mirror` flag flips all
     * faces horizontally and swaps east/west.
     *
     * @param cube - Geometry cube definition.
     * @param boneMirror - Mirror flag inherited from the bone.
     *
     * @returns UV rectangles keyed by face name.
     */
    computeFaceRects(cube: GeometryCube, boneMirror: boolean | undefined): Record<string, FaceRect> {
        if (Array.isArray(cube.uv)) {
            return this.createBoxUvRects(cube, boneMirror);
        }
        if (cube.uv && typeof cube.uv === "object") {
            return this.createPerFaceRects(cube);
        }

        return {};
    }

    /**
     * Computes box UV rectangles for a cube.
     *
     * @param cube - Geometry cube definition.
     * @param boneMirror - Mirror flag inherited from the bone.
     *
     * @returns UV rectangles keyed by face name.
     */
    createBoxUvRects(cube: GeometryCube, boneMirror: boolean | undefined): Record<string, FaceRect> {
        const [u, v] = cube.uv as number[];
        const floor = (value: number): number => Math.floor(value + 1e-7);
        const [w, h, d] = cube.size.map(floor);
        const layout = this.createBoxUvLayout(w, h, d);

        if (cube.mirror ?? boneMirror ?? false) {
            for (const entry of layout) {
                entry.fromX += entry.sizeX;
                entry.sizeX *= -1;
            }
            const [east, west] = layout;
            [east.fromX, west.fromX] = [west.fromX, east.fromX];
            [east.fromY, west.fromY] = [west.fromY, east.fromY];
            [east.sizeX, west.sizeX] = [west.sizeX, east.sizeX];
            [east.sizeY, west.sizeY] = [west.sizeY, east.sizeY];
        }

        const rects: Record<string, FaceRect> = {};
        for (const { face, fromX, fromY, sizeX, sizeY } of layout) {
            rects[face] = { rect: [u + fromX, v + fromY, u + fromX + sizeX, v + fromY + sizeY], rotation: 0 };
        }

        return rects;
    }

    /**
     * Computes per-face UV rectangles for a cube.
     *
     * @param cube - Geometry cube definition.
     *
     * @returns UV rectangles keyed by face name.
     */
    createPerFaceRects(cube: GeometryCube): Record<string, FaceRect> {
        const rects: Record<string, FaceRect> = {};

        for (const [name, data] of Object.entries(cube.uv as Record<string, PerFaceUv>)) {
            if (!data?.uv) {
                continue;
            }

            const [u, v] = data.uv;
            const [uw, vh] = data.uv_size ?? [cube.size[0], cube.size[1]];

            rects[name] = { rect: [u, v, u + uw, v + vh], rotation: data.uv_rotation || 0 };
        }

        return rects;
    }

    /**
     * Maps a UV rect onto a face's six triangle vertices, applying any 90-degree
     * uv_rotation the same way Blockbench's updateUV does.
     *
     * @param faceRect - UV rectangle and rotation in texture units.
     * @param geoTW - Geometry texture width.
     * @param geoTH - Geometry texture height.
     * @param frameV - Vertical scale confining sampling to frame 0 of vertical flipbook
     *   textures (1 for normal textures).
     *
     * @returns UV coordinates for the face's six triangle vertices.
     */
    createFaceUvCoords(faceRect: FaceRect, geoTW: number, geoTH: number, frameV: number): number[] {
        const { rect, rotation } = faceRect;
        const u = (x: number): number => x / geoTW;
        const v = (y: number): number => 1 - (y / geoTH) * frameV;

        let corners: [number, number][] = [
            [u(rect[0]), v(rect[1])],
            [u(rect[2]), v(rect[1])],
            [u(rect[0]), v(rect[3])],
            [u(rect[2]), v(rect[3])],
        ];

        for (let remaining = rotation; remaining > 0; remaining -= 90) {
            corners = [corners[2], corners[0], corners[3], corners[1]];
        }

        const [tl, tr, bl, br] = corners;

        return [...tl, ...bl, ...tr, ...tr, ...bl, ...br];
    }

    /**
     * Creates a caching texture loader.
     *
     * @returns TextureLoader.
     */
    createTextureLoader(): TextureLoader {
        const cache = new Map<string, LoadedTexture>();

        return async (texturePath: string): Promise<LoadedTexture> => {
            const cached = cache.get(texturePath);
            if (cached) {
                return cached;
            }

            const image = this.decodeImage(texturePath, await fs.readFile(texturePath));
            const tex = new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat);
            tex.flipY = true;
            tex.magFilter = tex.minFilter = THREE.NearestFilter;
            tex.needsUpdate = true;

            const entry = { tex, width: image.width, height: image.height };
            cache.set(texturePath, entry);

            return entry;
        };
    }

    /**
     * Decodes a texture file by its extension.
     *
     * @param texturePath - Absolute texture file path.
     * @param file - Raw file contents.
     *
     * @returns DecodedImage.
     *
     * @throws If the file cannot be decoded.
     */
    decodeImage(texturePath: string, file: Buffer): DecodedImage {
        if (texturePath.toLowerCase().endsWith(".tga")) {
            return TgaDecoder.decode(file);
        }

        return PNG.sync.read(file);
    }

    /**
     * Creates a material for a face's render method.
     *
     * @param renderMethod - Bedrock render method name.
     * @param texture - Texture to map onto the material.
     *
     * @returns Configured MeshStandardMaterial.
     */
    createMaterial(renderMethod: string | undefined, texture: THREE.Texture): THREE.MeshStandardMaterial {
        const params: THREE.MeshStandardMaterialParameters = { map: texture };
        const mode = renderMethod?.toLowerCase() || "opaque";

        if (mode.includes("alpha_test")) {
            params.transparent = true;
            params.alphaTest = 0.5;
        } else if (mode.includes("blend")) {
            params.transparent = true;
        }

        const singleSided = mode.includes("single_sided") || mode === "opaque";
        params.side = singleSided ? THREE.FrontSide : THREE.DoubleSide;

        return new THREE.MeshStandardMaterial(params);
    }

    /**
     * Builds the meshes for a single geometry cube.
     *
     * @param cube - Geometry cube definition.
     * @param bone - Bone owning the cube.
     * @param bonePivot - Display-space bone pivot.
     * @param geoSpace - Geometry UV coordinate space.
     * @param textureConfig - Texture configuration keyed by face name.
     * @param loadTexture - Caching texture loader.
     *
     * @returns Group containing the cube's face meshes.
     */
    async buildCube(
        cube: GeometryCube,
        bone: GeometryBone,
        bonePivot: Vector3Tuple,
        geoSpace: GeometryUvSpace,
        textureConfig: TextureConfig,
        loadTexture: TextureLoader
    ): Promise<THREE.Group> {
        const [w, h, d] = cube.size;
        const inflate = cube.inflate ?? bone.inflate ?? 0;
        const corners = this.createFaceCorners(w / 2 + inflate, h / 2 + inflate, d / 2 + inflate);
        const rects = this.computeFaceRects(cube, bone.mirror);

        const cubePivot = this.toDisplayPoint(cube.pivot || [0, 0, 0]);
        const group = new THREE.Group();
        group.position.set(cubePivot[0] - bonePivot[0], cubePivot[1] - bonePivot[1], cubePivot[2] - bonePivot[2]);
        if (cube.rotation) {
            this.applyGeoRotation(group, cube.rotation);
        }

        const center = [-(cube.origin[0] + w / 2), cube.origin[1] + h / 2, cube.origin[2] + d / 2];

        for (const [faceName, faceRect] of Object.entries(rects)) {
            const config = this.resolveFaceConfig(cube, faceName, textureConfig);
            if (!config) {
                continue;
            }

            const { tex, width, height } = await loadTexture(config.texture);
            const frameV = (geoSpace.height * width) / (geoSpace.width * height);

            const [tl, tr, bl, br] = corners[faceName];
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute([...tl, ...bl, ...tr, ...tr, ...bl, ...br], 3));
            geometry.setAttribute(
                "uv",
                new THREE.Float32BufferAttribute(this.createFaceUvCoords(faceRect, geoSpace.width, geoSpace.height, frameV), 2)
            );
            geometry.computeVertexNormals();

            const mesh = new THREE.Mesh(geometry, this.createMaterial(config.render_method, tex));
            mesh.position.set(center[0] - cubePivot[0], center[1] - cubePivot[1], center[2] - cubePivot[2]);
            group.add(mesh);
        }

        return group;
    }

    /**
     * Resolves the texture config for a cube face. Prefers the face's named
     * `material_instance` from its per-face UV entry, then the face's direction
     * name, then the `*` wildcard.
     *
     * @param cube - Cube owning the face.
     * @param faceName - Face direction name.
     * @param textureConfig - Texture configuration keyed by face or material name.
     *
     * @returns FaceTexture, or undefined when nothing resolves.
     */
    resolveFaceConfig(cube: GeometryCube, faceName: string, textureConfig: TextureConfig): FaceTexture | undefined {
        const perFaceUv = cube.uv && !Array.isArray(cube.uv) ? cube.uv[faceName] : undefined;
        const materialInstance = perFaceUv?.material_instance;
        const namedConfig = materialInstance ? textureConfig[materialInstance] : undefined;

        return namedConfig ?? textureConfig[faceName] ?? textureConfig["*"];
    }

    /**
     * Determines whether a bone is hidden by a `bone_visibility` map, checking
     * the bone and every ancestor. A literal `false` hides the bone. A Molang
     * expression string also hides it, because the icon shows the block's
     * default resting state and such expressions gate non-default states.
     *
     * @param bone - Bone to check.
     * @param bonesByName - All geometry bones keyed by name.
     * @param boneVisibility - `bone_visibility` map from the geometry component.
     *
     * @returns `true` when the bone or an ancestor is hidden, `false` otherwise.
     */
    isBoneHidden(bone: GeometryBone, bonesByName: Record<string, GeometryBone>, boneVisibility: BoneVisibility): boolean {
        const visited = new Set<string>();

        for (
            let current: GeometryBone | undefined = bone;
            current && !visited.has(current.name);
            current = bonesByName[current.parent ?? ""]
        ) {
            visited.add(current.name);
            const visibility = boneVisibility[current.name];

            if (visibility === false || typeof visibility === "string") {
                return true;
            }
        }

        return false;
    }

    /**
     * Resolves the geometry definition inside a model file.
     *
     * @param modelData - Parsed .geo.json model file.
     *
     * @returns GeometryDefinition.
     */
    getGeometryDefinition(modelData: GeometryFile): GeometryDefinition {
        return modelData["minecraft:geometry"]?.[0] ?? (Object.values(modelData)[0] as GeometryDefinition);
    }

    /**
     * Computes how many 16-unit block levels the visible model spans, from the
     * highest cube top across all parts. A model up to 16 units tall is one
     * level, up to 32 units is two, and so on.
     *
     * @param parts - Parts composing the render.
     *
     * @returns Height in block levels, at least 1.
     */
    computeHeightLevels(parts: RenderPart[]): number {
        let highestTop = 0;

        for (const part of parts) {
            const geometryDef = this.getGeometryDefinition(part.modelData);
            const boneVisibility = part.boneVisibility ?? {};
            const bonesByName: Record<string, GeometryBone> = {};
            for (const bone of geometryDef.bones ?? []) {
                bonesByName[bone.name] = bone;
            }

            for (const bone of geometryDef.bones ?? []) {
                if (this.isBoneHidden(bone, bonesByName, boneVisibility)) {
                    continue;
                }

                for (const cube of bone.cubes || []) {
                    const inflate = cube.inflate ?? bone.inflate ?? 0;
                    highestTop = Math.max(highestTop, cube.origin[1] + cube.size[1] + inflate + part.offset[1]);
                }
            }
        }

        return Math.max(1, Math.ceil(highestTop / IsoRenderer.BLOCK_SIZE));
    }

    /**
     * Builds the bone hierarchy and meshes for a renderable part.
     *
     * @param part - Part to build.
     * @param loadTexture - Caching texture loader.
     *
     * @returns Group containing the part's bones and meshes.
     */
    async buildPart(part: RenderPart, loadTexture: TextureLoader): Promise<THREE.Group> {
        const { modelData, textureConfig, offset } = part;
        const boneVisibility = part.boneVisibility ?? {};
        const partGroup = new THREE.Group();
        partGroup.position.set(...offset);

        const geometryDef = this.getGeometryDefinition(modelData);

        // The UV coordinate space of the geometry, which may differ from the
        // texture image's pixel size (HD textures, flipbooks).
        const geoSpace: GeometryUvSpace = {
            width: geometryDef.description?.texture_width || 16,
            height: geometryDef.description?.texture_height || 16,
        };

        const bonesByName: Record<string, GeometryBone> = {};
        const boneGroups: Record<string, THREE.Group> = {};
        for (const bone of geometryDef.bones ?? []) {
            bonesByName[bone.name] = bone;
            boneGroups[bone.name] = new THREE.Group();
        }

        for (const bone of geometryDef.bones ?? []) {
            if (this.isBoneHidden(bone, bonesByName, boneVisibility)) {
                continue;
            }

            const pivot = this.toDisplayPoint(bone.pivot || [0, 0, 0]);
            const parentPivot = this.toDisplayPoint(bonesByName[bone.parent ?? ""]?.pivot || [0, 0, 0]);
            const boneGroup = boneGroups[bone.name];

            boneGroup.position.set(pivot[0] - parentPivot[0], pivot[1] - parentPivot[1], pivot[2] - parentPivot[2]);
            if (bone.rotation) {
                this.applyGeoRotation(boneGroup, bone.rotation);
            }
            const parentGroup = boneGroups[bone.parent ?? ""] || partGroup;
            parentGroup.add(boneGroup);

            for (const cube of bone.cubes || []) {
                boneGroup.add(await this.buildCube(cube, bone, pivot, geoSpace, textureConfig, loadTexture));
            }
        }

        return partGroup;
    }

    /**
     * Computes the orthographic half-extent that fits a bounding box in the
     * camera's screen plane. Projects every box corner onto the screen axes
     * instead of guessing from the largest dimension, so slim tall models are
     * not cut off, and adds a 10% margin.
     *
     * @param box - World-space bounding box to fit.
     * @param target - Camera look-at target, the box center.
     *
     * @returns Orthographic half-extent.
     */
    computeFittedScale(box: THREE.Box3, target: THREE.Vector3): number {
        const zAxis = IsoRenderer.CAMERA_DIRECTION.clone();
        const xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis).normalize();
        const yAxis = zAxis.clone().cross(xAxis);
        let extent = 0;

        for (const cornerX of [box.min.x, box.max.x]) {
            for (const cornerY of [box.min.y, box.max.y]) {
                for (const cornerZ of [box.min.z, box.max.z]) {
                    const corner = new THREE.Vector3(cornerX, cornerY, cornerZ).sub(target);
                    extent = Math.max(extent, Math.abs(corner.dot(xAxis)), Math.abs(corner.dot(yAxis)));
                }
            }
        }

        return extent * 1.1;
    }

    /**
     * Creates the orthographic camera framing the scene.
     *
     * @param sceneRoot - Root object to frame.
     * @param multiBlock - Whether the model spans multiple blocks, by part count or height.
     *
     * @returns Positioned OrthographicCamera.
     */
    createCamera(sceneRoot: THREE.Object3D, multiBlock: boolean): THREE.OrthographicCamera {
        let isoScale = IsoRenderer.DEFAULT_ISO_SCALE;
        const target = new THREE.Vector3(...IsoRenderer.BLOCK_CENTER);

        if (multiBlock) {
            const box = new THREE.Box3().setFromObject(sceneRoot);
            box.getCenter(target);
            isoScale = this.computeFittedScale(box, target);
        }

        const camera = new THREE.OrthographicCamera(-isoScale, isoScale, isoScale, -isoScale, 0.1, 1000);
        camera.position.copy(target).add(IsoRenderer.CAMERA_DIRECTION.clone().multiplyScalar(multiBlock ? isoScale * 4 : 40));
        camera.lookAt(target);

        return camera;
    }

    /**
     * Reads the GL framebuffer and writes it as a PNG file.
     *
     * @param gl - GL context to read pixels from.
     * @param resolution - Output dimensions (square).
     * @param outputPath - Destination .png path.
     */
    writePixelsToPng(gl: WebGLRenderingContext, resolution: number, outputPath: string): void {
        const pixels = new Uint8Array(resolution * resolution * 4);
        gl.readPixels(0, 0, resolution, resolution, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // GL rows are bottom-up; PNG rows are top-down.
        const png = new PNG({ width: resolution, height: resolution });
        for (let y = 0; y < resolution; y++) {
            const sourceOffset = (resolution - 1 - y) * resolution * 4;
            png.data.set(pixels.subarray(sourceOffset, sourceOffset + resolution * 4), y * resolution * 4);
        }

        writeFileSync(outputPath, PNG.sync.write(png));
    }
}
