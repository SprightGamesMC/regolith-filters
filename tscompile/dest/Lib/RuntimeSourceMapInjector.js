"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const source_map_1 = require("source-map");
const FilterPaths_1 = __importDefault(require("./FilterPaths"));
/**
 * Injects and adjusts runtime sourcemap metadata for debugger builds.
 */
class RuntimeSourceMapInjector {
    /** Export path resolver used for generated output locations. */
    exportResolver;
    /** Logger used for standardized output. */
    logger;
    /** Absolute Regolith project root path. */
    projectRoot;
    /** Resolved filter settings. */
    settings;
    /** Converts a scripts-relative path into a project-relative path. */
    toScriptsProjectPath;
    /**
     * Creates the runtime sourcemap helper.
     *
     * @param options - Helper dependencies and runtime state.
     */
    constructor(options) {
        this.exportResolver = options.exportResolver;
        this.logger = options.logger;
        this.projectRoot = options.projectRoot;
        this.settings = options.settings;
        this.toScriptsProjectPath = options.toScriptsProjectPath;
    }
    /**
     * Builds a generated-to-source line mapping and injects it into a compiled output file.
     *
     * @param outputPath - Absolute compiled JavaScript output path.
     * @param derivedOutputPath - Output path relative to `BP/scripts`.
     *
     * @returns `true` when sourcemap metadata was injected.
     */
    async generateSourceMapping(outputPath, derivedOutputPath) {
        const sourceMapPath = `${outputPath}.map`;
        if (!fs_1.default.existsSync(sourceMapPath)) {
            this.logger.warn(`Debugger support is enabled, but tscompile could not find the generated sourcemap at "${sourceMapPath}". Runtime error mapping was skipped.`);
            return false;
        }
        const sourceMapContent = fs_1.default.readFileSync(sourceMapPath, "utf8");
        const normalizedSourceDirectory = FilterPaths_1.default.normalizeRelativePath(this.settings.sourceDir);
        await source_map_1.SourceMapConsumer.with(sourceMapContent, null, (consumer) => {
            const mapping = {};
            consumer.eachMapping((mappingEntry) => {
                if (!mappingEntry.source || mapping[mappingEntry.generatedLine]) {
                    return;
                }
                const cleanedSource = this.cleanMappedSourcePath(mappingEntry.source, normalizedSourceDirectory);
                mapping[mappingEntry.generatedLine] = {
                    originalLine: mappingEntry.originalLine,
                    source: cleanedSource,
                };
            });
            mapping.metadata = {
                filePath: FilterPaths_1.default.normalizeRelativePath(derivedOutputPath),
                offset: 1,
            };
            const currentOutput = fs_1.default.readFileSync(outputPath, "utf8");
            const injectedOutput = `var globalSourceMapping = ${JSON.stringify(mapping)};\n${currentOutput}`;
            fs_1.default.writeFileSync(outputPath, injectedOutput);
        });
        return true;
    }
    /**
     * Normalizes a mapped source path for debugging metadata.
     *
     * @param mappedSource - Source path from the sourcemap.
     * @param normalizedSourceDirectory - Normalized source directory.
     *
     * @returns Cleaned source path.
     */
    cleanMappedSourcePath(mappedSource, normalizedSourceDirectory) {
        const normalizedSource = FilterPaths_1.default.normalizeRelativePath(mappedSource);
        const sourceIndex = normalizedSource.indexOf(`${normalizedSourceDirectory}/`);
        const sourceDirectoryName = path_1.default.posix.basename(normalizedSourceDirectory);
        if (sourceIndex !== -1) {
            return normalizedSource.slice(sourceIndex + normalizedSourceDirectory.length + 1);
        }
        if (normalizedSource === sourceDirectoryName) {
            return "";
        }
        if (normalizedSource.startsWith(`${sourceDirectoryName}/`)) {
            return normalizedSource.slice(sourceDirectoryName.length + 1);
        }
        if (path_1.default.isAbsolute(mappedSource)) {
            return FilterPaths_1.default.normalizeRelativePath(path_1.default.relative(this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir), mappedSource));
        }
        return normalizedSource;
    }
    /**
     * Offsets generated sourcemap lines after source mapping injection.
     *
     * @param mapPath - Path to the sourcemap file.
     * @param derivedOutputPath - Output path relative to `BP/scripts`.
     * @param lineOffset - Number of lines to offset generated mappings.
     */
    async adjustSourceMap(mapPath, derivedOutputPath, lineOffset) {
        const mapContent = fs_1.default.readFileSync(mapPath, "utf8");
        const originalMap = JSON.parse(mapContent);
        await source_map_1.SourceMapConsumer.with(mapContent, null, (consumer) => {
            const rewrittenSourcePathMap = this.createRewrittenSourcePathMap(mapPath, derivedOutputPath, Array.isArray(originalMap.sources) ? originalMap.sources : [], consumer.sources);
            const consumerFile = consumer.file;
            const generator = new source_map_1.SourceMapGenerator({
                file: consumerFile || originalMap.file || path_1.default.basename(mapPath, ".map"),
            });
            consumer.eachMapping((mappingEntry) => {
                const mappedSource = mappingEntry.source && rewrittenSourcePathMap.has(mappingEntry.source)
                    ? rewrittenSourcePathMap.get(mappingEntry.source)
                    : mappingEntry.source;
                generator.addMapping({
                    generated: {
                        column: mappingEntry.generatedColumn,
                        line: mappingEntry.generatedLine + lineOffset,
                    },
                    name: mappingEntry.name ?? undefined,
                    original: mappingEntry.originalLine !== null
                        ? { column: mappingEntry.originalColumn, line: mappingEntry.originalLine }
                        : undefined,
                    source: mappedSource ?? undefined,
                });
            });
            for (const source of consumer.sources) {
                const content = consumer.sourceContentFor(source, true);
                if (content !== null) {
                    generator.setSourceContent(rewrittenSourcePathMap.get(source) || source, content);
                }
            }
            fs_1.default.writeFileSync(mapPath, generator.toString());
        });
    }
    /**
     * Rewrites consumer source paths to the final generated map location.
     *
     * @param mapPath - Workspace sourcemap path.
     * @param derivedOutputPath - Output path relative to `BP/scripts`.
     * @param rawSources - Raw `sources` entries from the sourcemap JSON.
     * @param consumerSources - Resolved source paths exposed by `source-map`.
     *
     * @returns Mapping from consumer source path to final generated source path.
     */
    createRewrittenSourcePathMap(mapPath, derivedOutputPath, rawSources, consumerSources) {
        const rewrittenSourcePathMap = new Map();
        const workspaceMapDirectory = path_1.default.dirname(mapPath);
        const generatedMapPath = this.resolveGeneratedMapPath(mapPath, derivedOutputPath);
        const generatedMapDirectory = path_1.default.dirname(generatedMapPath);
        for (let index = 0; index < consumerSources.length; index += 1) {
            const consumerSource = consumerSources[index];
            const rawSource = typeof rawSources[index] === "string" ? rawSources[index] : consumerSource;
            const absoluteSourcePath = this.resolveOriginalSourcePath(workspaceMapDirectory, rawSource);
            const rewrittenSourcePath = FilterPaths_1.default.normalizeRelativePath(path_1.default.relative(generatedMapDirectory, absoluteSourcePath));
            rewrittenSourcePathMap.set(rawSource, rewrittenSourcePath);
            rewrittenSourcePathMap.set(consumerSource, rewrittenSourcePath);
            rewrittenSourcePathMap.set(absoluteSourcePath, rewrittenSourcePath);
        }
        return rewrittenSourcePathMap;
    }
    /**
     * Resolves the generated sourcemap path for the active export target.
     *
     * @param mapPath - Workspace sourcemap path.
     * @param derivedOutputPath - Output path relative to `BP/scripts`.
     *
     * @returns Absolute generated sourcemap path.
     */
    resolveGeneratedMapPath(mapPath, derivedOutputPath) {
        const generatedMapProjectPath = this.toScriptsProjectPath(`${derivedOutputPath}.map`);
        const generatedMapPath = this.exportResolver.resolveBehaviorPackExportPath(generatedMapProjectPath);
        if (generatedMapPath) {
            return generatedMapPath;
        }
        return mapPath;
    }
    /**
     * Resolves a raw sourcemap source entry back to its absolute local source path.
     *
     * @param mapDirectory - Absolute directory containing the workspace sourcemap.
     * @param rawSource - Raw `sources` entry from the sourcemap.
     *
     * @returns Absolute local source path.
     */
    resolveOriginalSourcePath(mapDirectory, rawSource) {
        if (path_1.default.isAbsolute(rawSource)) {
            return path_1.default.resolve(rawSource);
        }
        return path_1.default.resolve(mapDirectory, ...FilterPaths_1.default.normalizeRelativePath(rawSource).split("/"));
    }
}
exports.default = RuntimeSourceMapInjector;
