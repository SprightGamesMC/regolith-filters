"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const cross_geo_json_1 = __importDefault(require("../cross.geo.json"));
const full_block_geo_json_1 = __importDefault(require("../full_block.geo.json"));
const FilterLogger_1 = __importDefault(require("./FilterLogger"));
const FilterTiming_1 = __importDefault(require("./FilterTiming"));
const IsoRenderer_1 = __importDefault(require("./IsoRenderer"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
const VanillaTextureCache_1 = __importDefault(require("./VanillaTextureCache"));
/**
 * Coordinates the isoblock Regolith filter lifecycle.
 */
class IsoBlockFilter {
    static FILTER_IDENTIFIER = "isoblock";
    static BLOCK_SIZE = 16;
    static DEFAULT_RESOLUTION = 128;
    static DEFAULT_OUTPUT_PATH = "build/isoblock";
    static BUILTIN_GEOMETRY = {
        "minecraft:geometry.full_block": full_block_geo_json_1.default,
        "minecraft:geometry.cross": cross_geo_json_1.default,
    };
    static MULTI_BLOCK_PART_CONDITION_PATTERN = /multi_block_part'?\)?\s*==\s*(\d+)/;
    static CROSS_GEOMETRY_IDENTIFIER = "minecraft:geometry.cross";
    // Cross planes sit at 45 degrees to the block axes and the iso camera looks
    // along the diagonal, so without this turn one plane renders edge-on.
    static CROSS_MODEL_ROTATION = [0, 45, 0];
    static PART_DIRECTIONS = {
        up: [0, 1, 0],
        down: [0, -1, 0],
        north: [0, 0, -1],
        south: [0, 0, 1],
        east: [1, 0, 0],
        west: [-1, 0, 0],
    };
    /** Current working directory. */
    cwd;
    /** Absolute Regolith project root path. */
    projectRoot;
    /** Raw JSON settings passed to the filter. */
    rawSettings;
    /** Standardized output logger. */
    logger;
    /** Stage timing helper. */
    timing;
    /** Resolved filter settings. */
    settings;
    /** Isometric renderer. */
    renderer;
    /** Vanilla asset downloader and cache. */
    vanillaTextures;
    /**
     * Creates the filter instance.
     *
     * @param cwd - Current working directory.
     * @param projectRoot - Absolute Regolith project root path.
     * @param rawSettings - Raw JSON settings passed to the filter.
     * @param vanillaTextures - Vanilla asset downloader and cache. Defaults to a project-local cache.
     */
    constructor(cwd, projectRoot, rawSettings, vanillaTextures) {
        this.cwd = cwd;
        this.projectRoot = projectRoot;
        this.rawSettings =
            rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {};
        this.logger = new FilterLogger_1.default();
        this.timing = new FilterTiming_1.default(this.logger);
        this.settings = this.createSettings(this.rawSettings);
        this.renderer = new IsoRenderer_1.default();
        this.vanillaTextures =
            vanillaTextures ??
                new VanillaTextureCache_1.default(path_1.default.join(projectRoot, ".regolith", "cache", IsoBlockFilter.FILTER_IDENTIFIER), this.logger);
    }
    /**
     * Runs the full filter pipeline.
     */
    async run() {
        this.logger.info("Preparing isometric block rendering.");
        const runStartedAt = this.timing.createTimer();
        const pack = await this.timing.timeStage("Load Pack Data", () => this.loadPackData());
        await this.timing.timeStage("Render Blocks", () => this.renderBlocks(pack));
        this.timing.logDuration("Rendering Complete", runStartedAt);
    }
    /**
     * Creates merged settings with canonical defaults.
     *
     * @param rawSettings - Raw JSON settings passed to the filter.
     *
     * @returns IsoBlockSettings.
     */
    createSettings(rawSettings) {
        const defaults = {
            outputPath: IsoBlockFilter.DEFAULT_OUTPUT_PATH,
            resolution: IsoBlockFilter.DEFAULT_RESOLUTION,
        };
        return { ...defaults, ...rawSettings };
    }
    /**
     * Resolves pack paths and loads the resource-pack data required for rendering.
     *
     * Regolith sets the working directory to its tmp build dir, where earlier
     * filters (e.g. jsonte) have already generated blocks. The project root
     * points at the untouched source and would miss them.
     *
     * @returns LoadedPack.
     */
    async loadPackData() {
        const config = this.loadProjectConfig();
        const bpPath = path_1.default.resolve(this.cwd, config.packs?.behaviorPack ?? "BP");
        const rpPath = path_1.default.resolve(this.cwd, config.packs?.resourcePack ?? "RP");
        return {
            blocksDir: path_1.default.join(bpPath, "blocks"),
            outputDir: path_1.default.resolve(this.projectRoot, this.settings.outputPath),
            context: {
                rpPath,
                textureData: this.loadTextureData(rpPath),
                geoMap: await this.loadGeoData(rpPath),
            },
        };
    }
    /**
     * Renders every block definition in the behavior pack to the output folder.
     *
     * @param pack - Loaded pack paths and render context.
     *
     * @returns Resolves after all renders complete.
     */
    async renderBlocks(pack) {
        const files = (await promises_1.default.readdir(pack.blocksDir, { recursive: true })).filter((file) => file.endsWith(".json"));
        await promises_1.default.mkdir(pack.outputDir, { recursive: true });
        await Promise.all(files.map((file) => this.renderBlock(pack, file)));
    }
    /**
     * Renders a single block definition file, logging failures without aborting the run.
     *
     * @param pack - Loaded pack paths and render context.
     * @param file - Block definition path relative to the blocks folder.
     *
     * @returns Resolves after the render completes or fails.
     */
    async renderBlock(pack, file) {
        try {
            const document = JsonTools_1.default.loadFile(path_1.default.join(pack.blocksDir, file));
            const block = document["minecraft:block"];
            if (!block) {
                return;
            }
            const parts = await this.collectParts(block, pack.context);
            if (!parts.length) {
                return;
            }
            const identifier = block.description?.identifier;
            const outputName = `${identifier ? identifier.split(":").pop() : path_1.default.parse(file).name}.png`;
            await this.renderer.render(parts, path_1.default.join(pack.outputDir, outputName), this.settings.resolution, this.resolveModelRotation(block));
        }
        catch (error) {
            this.logger.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Extracts the identifier from a `minecraft:geometry` component value.
     *
     * @param geometry - `minecraft:geometry` component value.
     *
     * @returns Geometry identifier, or undefined when absent.
     */
    getGeometryIdentifier(geometry) {
        return typeof geometry === "object" ? geometry?.identifier : geometry;
    }
    /**
     * Resolves the extra model rotation for a block. Cross geometry gets a 45
     * degree turn so both planes face the camera instead of one edge-on.
     *
     * @param block - Parsed `minecraft:block` definition.
     *
     * @returns Rotation in degrees, or null when none applies.
     */
    resolveModelRotation(block) {
        const components = block.components ?? {};
        const identifiers = [
            this.getGeometryIdentifier(components["minecraft:item_visual"]?.geometry),
            this.getGeometryIdentifier(components["minecraft:geometry"]),
        ];
        return identifiers.includes(IsoBlockFilter.CROSS_GEOMETRY_IDENTIFIER) ? [...IsoBlockFilter.CROSS_MODEL_ROTATION] : null;
    }
    /**
     * Resolves the renderable parts of a block: either its item_visual geometry
     * (the dedicated inventory icon, used because the in-world geometry contains
     * every connection state) or one part per minecraft:multi_block segment.
     * The block's placement `minecraft:transformation` is intentionally not
     * applied; the icon shows the raw default geometry, matching Blockbench.
     *
     * @param block - Parsed `minecraft:block` definition.
     * @param context - Loaded resource-pack render context.
     *
     * @returns Renderable parts for the block.
     */
    async collectParts(block, context) {
        const baseComponents = block.components;
        if (!baseComponents) {
            return [];
        }
        const multiBlock = block.description?.traits?.["minecraft:multi_block"];
        const partCount = multiBlock?.parts ?? 1;
        const itemVisual = baseComponents["minecraft:item_visual"];
        if (partCount === 1 && itemVisual) {
            const part = await this.buildPart(itemVisual.geometry, itemVisual.material_instances || baseComponents["minecraft:material_instances"], [0, 0, 0], context);
            return part ? [part] : [];
        }
        const parts = [];
        const permutations = block.permutations || [];
        const direction = multiBlock?.direction ?? "up";
        for (let i = 0; i < partCount; i++) {
            const components = this.componentsForPart(baseComponents, permutations, i);
            const part = await this.buildPart(components["minecraft:geometry"], components["minecraft:material_instances"], this.offsetForPart(direction, i), context);
            if (part) {
                parts.push(part);
            }
        }
        return parts;
    }
    /**
     * Builds a renderable part from geometry and material components.
     *
     * @param geometry - `minecraft:geometry` component value.
     * @param materials - `minecraft:material_instances` component value.
     * @param offset - World translation applied to the part.
     * @param context - Loaded resource-pack render context.
     *
     * @returns RenderPart, or null when the geometry cannot be resolved.
     */
    async buildPart(geometry, materials, offset, context) {
        const geoIdentifier = this.getGeometryIdentifier(geometry);
        if (!geoIdentifier) {
            return null;
        }
        const modelData = this.resolveGeometry(geoIdentifier, context);
        if (!modelData) {
            return null;
        }
        return {
            modelData,
            textureConfig: await this.buildTextureConfig(materials || {}, context),
            offset,
            boneVisibility: typeof geometry === "object" ? geometry?.bone_visibility : undefined,
        };
    }
    /**
     * Merges the base components with any permutation targeting a specific
     * multi_block part index. Orientation permutations (e.g. cardinal_direction)
     * are ignored so every render uses the canonical orientation.
     *
     * @param baseComponents - Base block components.
     * @param permutations - Block permutations list.
     * @param index - Multi-block part index.
     *
     * @returns Merged components for the part.
     */
    componentsForPart(baseComponents, permutations, index) {
        let components = { ...baseComponents };
        for (const permutation of permutations) {
            const match = IsoBlockFilter.MULTI_BLOCK_PART_CONDITION_PATTERN.exec(permutation.condition || "");
            if (match && Number(match[1]) === index) {
                components = { ...components, ...permutation.components };
            }
        }
        return components;
    }
    /**
     * Computes the world offset of a multi_block part along the trait's stacking direction.
     *
     * @param direction - Stacking direction from the multi_block trait.
     * @param index - Multi-block part index.
     *
     * @returns World translation for the part.
     */
    offsetForPart(direction, index) {
        const axis = IsoBlockFilter.PART_DIRECTIONS[direction] || IsoBlockFilter.PART_DIRECTIONS.up;
        return [
            axis[0] * IsoBlockFilter.BLOCK_SIZE * index,
            axis[1] * IsoBlockFilter.BLOCK_SIZE * index,
            axis[2] * IsoBlockFilter.BLOCK_SIZE * index,
        ];
    }
    /**
     * Resolves a geometry identifier to its parsed model data.
     *
     * @param geoIdentifier - Geometry identifier to resolve.
     * @param context - Loaded resource-pack render context.
     *
     * @returns GeometryFile, or null when unknown.
     */
    resolveGeometry(geoIdentifier, context) {
        const builtin = IsoBlockFilter.BUILTIN_GEOMETRY[geoIdentifier];
        if (builtin) {
            return builtin;
        }
        const geoPath = context.geoMap[geoIdentifier];
        if (!geoPath) {
            return null;
        }
        return JsonTools_1.default.loadFile(geoPath);
    }
    /**
     * Maps material_instances faces to absolute texture paths and render methods.
     *
     * @param materials - `minecraft:material_instances` component value.
     * @param context - Loaded resource-pack render context.
     *
     * @returns TextureConfig.
     */
    async buildTextureConfig(materials, context) {
        const textureConfig = {};
        await Promise.all(Object.entries(materials).map(async ([face, material]) => {
            textureConfig[face] = {
                texture: await this.resolveFaceTexture(material.texture ?? "", context),
                render_method: material.render_method || "opaque",
            };
        }));
        return textureConfig;
    }
    /**
     * Resolves a material texture short name to an absolute texture file path.
     * Short names missing from the pack's terrain texture data fall back to the
     * vanilla data, and resolved paths missing from the pack fall back to a
     * cached bedrock-samples download.
     *
     * @param textureName - `material_instances` texture short name.
     * @param context - Loaded resource-pack render context.
     *
     * @returns Absolute texture path. May not exist when unresolvable.
     */
    async resolveFaceTexture(textureName, context) {
        let relativePath = this.resolveTexturePath(context.textureData[textureName]?.textures);
        if (!relativePath) {
            const vanillaData = await this.vanillaTextures.loadTextureData();
            relativePath = this.resolveTexturePath(vanillaData[textureName]?.textures);
        }
        const fallbackPath = path_1.default.join(context.rpPath, `${relativePath}.png`);
        if (!relativePath) {
            return fallbackPath;
        }
        const packTexturePath = await this.findPackTexture(context.rpPath, relativePath);
        if (packTexturePath) {
            return packTexturePath;
        }
        return (await this.vanillaTextures.fetchTexture(relativePath)) ?? fallbackPath;
    }
    /**
     * Finds a pack texture file for a relative path, trying each supported extension.
     *
     * @param rpPath - Absolute resource pack path.
     * @param relativePath - Texture path relative to the resource pack root, without extension.
     *
     * @returns Absolute texture path, or null when the pack has no matching file.
     */
    async findPackTexture(rpPath, relativePath) {
        for (const extension of VanillaTextureCache_1.default.TEXTURE_EXTENSIONS) {
            const filePath = path_1.default.join(rpPath, `${relativePath}${extension}`);
            if (await this.fileExists(filePath)) {
                return filePath;
            }
        }
        return null;
    }
    /**
     * Checks whether a file exists.
     *
     * @param filePath - Absolute file path.
     *
     * @returns `true` when the file exists, `false` otherwise.
     */
    async fileExists(filePath) {
        try {
            await promises_1.default.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Resolves a terrain_texture.json `textures` value to a texture path. Values
     * may be a string, an array, or an object with a `path` or weighted
     * `variations` list.
     *
     * @param textures - `textures` value from terrain_texture.json.
     *
     * @returns Resolved texture path, or an empty string when unknown.
     */
    resolveTexturePath(textures) {
        if (typeof textures === "string") {
            return textures;
        }
        const first = Array.isArray(textures) ? textures[0] : textures;
        if (typeof first === "string") {
            return first;
        }
        if (first?.variations?.length) {
            return first.variations[0].path;
        }
        if (first?.path) {
            return first.path;
        }
        return "";
    }
    /**
     * Loads the Regolith project configuration.
     *
     * @returns Parsed config, or an empty object when unavailable.
     */
    loadProjectConfig() {
        try {
            return JsonTools_1.default.loadFile(path_1.default.join(this.projectRoot, "config.json"));
        }
        catch {
            return {};
        }
    }
    /**
     * Loads the resource pack's terrain texture data.
     *
     * @param rpPath - Absolute resource pack path.
     *
     * @returns TextureData, or an empty object when unavailable.
     */
    loadTextureData(rpPath) {
        try {
            const texturePath = path_1.default.join(rpPath, "textures", "terrain_texture.json");
            return JsonTools_1.default.loadFile(texturePath).texture_data ?? {};
        }
        catch {
            return {};
        }
    }
    /**
     * Maps every geometry identifier in the RP models directory to its file path.
     *
     * @param rpPath - Absolute resource pack path.
     *
     * @returns Geometry identifier map, or an empty object when unavailable.
     */
    async loadGeoData(rpPath) {
        const geoMap = {};
        const modelsDir = path_1.default.join(rpPath, "models");
        try {
            const files = await promises_1.default.readdir(modelsDir, { recursive: true });
            for (const file of files.filter((name) => name.endsWith(".json"))) {
                const fullPath = path_1.default.join(modelsDir, file);
                const json = JsonTools_1.default.loadFile(fullPath);
                const geometries = json["minecraft:geometry"];
                for (const geo of Array.isArray(geometries) ? geometries : [geometries]) {
                    const id = geo?.description?.identifier;
                    if (id) {
                        geoMap[id] = fullPath;
                    }
                }
            }
        }
        catch {
            return {};
        }
        return geoMap;
    }
}
exports.default = IsoBlockFilter;
