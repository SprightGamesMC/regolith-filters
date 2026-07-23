import fs from "fs";
import path from "path";
import { SourceMapConsumer, SourceMapGenerator } from "source-map";
import FilterPaths from "./FilterPaths";
import type ProjectExportResolver from "./ProjectExportResolver";
import type FilterLogger from "./FilterLogger";
import type { TsCompileSettings } from "../Types/TsCompileTypes";

/** Constructor dependencies for the runtime sourcemap injector. */
interface RuntimeSourceMapInjectorOptions {
    exportResolver: ProjectExportResolver;
    logger: FilterLogger;
    projectRoot: string;
    settings: TsCompileSettings;
    toScriptsProjectPath: (relativePath: string) => string;
}

/**
 * Injects and adjusts runtime sourcemap metadata for debugger builds.
 */
export default class RuntimeSourceMapInjector {
    /** Export path resolver used for generated output locations. */
    private readonly exportResolver: ProjectExportResolver;

    /** Logger used for standardized output. */
    private readonly logger: FilterLogger;

    /** Absolute Regolith project root path. */
    private readonly projectRoot: string;

    /** Resolved filter settings. */
    private readonly settings: TsCompileSettings;

    /** Converts a scripts-relative path into a project-relative path. */
    private readonly toScriptsProjectPath: (relativePath: string) => string;

    /**
     * Creates the runtime sourcemap helper.
     *
     * @param options - Helper dependencies and runtime state.
     */
    constructor(options: RuntimeSourceMapInjectorOptions) {
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
    async generateSourceMapping(outputPath: string, derivedOutputPath: string): Promise<boolean> {
        const sourceMapPath = `${outputPath}.map`;

        if (!fs.existsSync(sourceMapPath)) {
            this.logger.warn(
                `Debugger support is enabled, but tscompile could not find the generated sourcemap at "${sourceMapPath}". Runtime error mapping was skipped.`
            );
            return false;
        }

        const sourceMapContent = fs.readFileSync(sourceMapPath, "utf8");
        const normalizedSourceDirectory = FilterPaths.normalizeRelativePath(this.settings.sourceDir);

        await SourceMapConsumer.with(sourceMapContent, null, (consumer) => {
            const mapping: Record<string, unknown> = {};

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
                filePath: FilterPaths.normalizeRelativePath(derivedOutputPath),
                offset: 1,
            };

            const currentOutput = fs.readFileSync(outputPath, "utf8");
            const injectedOutput = `var globalSourceMapping = ${JSON.stringify(mapping)};\n${currentOutput}`;
            fs.writeFileSync(outputPath, injectedOutput);
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
    cleanMappedSourcePath(mappedSource: string, normalizedSourceDirectory: string): string {
        const normalizedSource = FilterPaths.normalizeRelativePath(mappedSource);
        const sourceIndex = normalizedSource.indexOf(`${normalizedSourceDirectory}/`);
        const sourceDirectoryName = path.posix.basename(normalizedSourceDirectory);

        if (sourceIndex !== -1) {
            return normalizedSource.slice(sourceIndex + normalizedSourceDirectory.length + 1);
        }

        if (normalizedSource === sourceDirectoryName) {
            return "";
        }

        if (normalizedSource.startsWith(`${sourceDirectoryName}/`)) {
            return normalizedSource.slice(sourceDirectoryName.length + 1);
        }

        if (path.isAbsolute(mappedSource)) {
            return FilterPaths.normalizeRelativePath(
                path.relative(this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir), mappedSource)
            );
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
    async adjustSourceMap(mapPath: string, derivedOutputPath: string, lineOffset: number): Promise<void> {
        const mapContent = fs.readFileSync(mapPath, "utf8");
        const originalMap = JSON.parse(mapContent) as { file?: string; sources?: unknown };

        await SourceMapConsumer.with(mapContent, null, (consumer) => {
            const rewrittenSourcePathMap = this.createRewrittenSourcePathMap(
                mapPath,
                derivedOutputPath,
                Array.isArray(originalMap.sources) ? (originalMap.sources as string[]) : [],
                consumer.sources
            );
            const consumerFile = (consumer as { file?: string | null }).file;
            const generator = new SourceMapGenerator({
                file: consumerFile || originalMap.file || path.basename(mapPath, ".map"),
            });

            consumer.eachMapping((mappingEntry) => {
                const mappedSource =
                    mappingEntry.source && rewrittenSourcePathMap.has(mappingEntry.source)
                        ? rewrittenSourcePathMap.get(mappingEntry.source)
                        : mappingEntry.source;

                generator.addMapping({
                    generated: {
                        column: mappingEntry.generatedColumn,
                        line: mappingEntry.generatedLine + lineOffset,
                    },
                    name: mappingEntry.name ?? undefined,
                    original:
                        mappingEntry.originalLine !== null
                            ? { column: mappingEntry.originalColumn, line: mappingEntry.originalLine }
                            : undefined,
                    source: mappedSource ?? undefined,
                } as Parameters<SourceMapGenerator["addMapping"]>[0]);
            });

            for (const source of consumer.sources) {
                const content = consumer.sourceContentFor(source, true);

                if (content !== null) {
                    generator.setSourceContent(rewrittenSourcePathMap.get(source) || source, content);
                }
            }

            fs.writeFileSync(mapPath, generator.toString());
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
    createRewrittenSourcePathMap(
        mapPath: string,
        derivedOutputPath: string,
        rawSources: string[],
        consumerSources: string[]
    ): Map<string, string> {
        const rewrittenSourcePathMap = new Map<string, string>();
        const workspaceMapDirectory = path.dirname(mapPath);
        const generatedMapPath = this.resolveGeneratedMapPath(mapPath, derivedOutputPath);
        const generatedMapDirectory = path.dirname(generatedMapPath);

        for (let index = 0; index < consumerSources.length; index += 1) {
            const consumerSource = consumerSources[index];
            const rawSource = typeof rawSources[index] === "string" ? rawSources[index] : consumerSource;
            const absoluteSourcePath = this.resolveOriginalSourcePath(workspaceMapDirectory, rawSource);
            const rewrittenSourcePath = FilterPaths.normalizeRelativePath(path.relative(generatedMapDirectory, absoluteSourcePath));

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
    resolveGeneratedMapPath(mapPath: string, derivedOutputPath: string): string {
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
    resolveOriginalSourcePath(mapDirectory: string, rawSource: string): string {
        if (path.isAbsolute(rawSource)) {
            return path.resolve(rawSource);
        }

        return path.resolve(mapDirectory, ...FilterPaths.normalizeRelativePath(rawSource).split("/"));
    }
}
