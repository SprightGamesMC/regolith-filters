import path from "path";
import * as esbuild from "esbuild";
import JsonImportPlugin from "./JsonImportPlugin";
import FilterPaths from "./FilterPaths";
import type { BuildOptions, BuildResult, Plugin } from "esbuild";
import type ProjectExportResolver from "./ProjectExportResolver";
import type FilterLogger from "./FilterLogger";
import type { TsCompileSettings } from "../Types/TsCompileTypes";

/**
 * Runs esbuild with the filter's standard defaults.
 */
export default class EsbuildCompiler {
    /** Logger used for standardized output. */
    private readonly logger: FilterLogger;

    /** Absolute Regolith temp workspace path. */
    private readonly workspaceRoot: string;

    /** Absolute Regolith project root path. */
    private readonly projectRoot: string;

    /** Export path resolver used for debugger sourcemaps. */
    private readonly exportResolver: ProjectExportResolver;

    /** JSONC-aware esbuild plugin for `.json` imports. */
    private readonly jsonExtensionPlugin: Plugin;

    /**
     * Creates the compiler instance.
     *
     * @param logger - Logger used for standardized output.
     * @param workspaceRoot - Absolute Regolith temp workspace path.
     * @param projectRoot - Absolute Regolith project root path.
     * @param exportResolver - Export path resolver used for debugger sourcemaps.
     */
    constructor(logger: FilterLogger, workspaceRoot: string, projectRoot: string, exportResolver: ProjectExportResolver) {
        this.logger = logger;
        this.workspaceRoot = workspaceRoot;
        this.projectRoot = projectRoot;
        this.exportResolver = exportResolver;
        this.jsonExtensionPlugin = new JsonImportPlugin().create();
    }

    /**
     * Compiles the configured TypeScript sources.
     *
     * @param settings - Filter settings.
     *
     * @returns Absolute paths to emitted JavaScript outputs.
     *
     * @throws If the build fails.
     */
    async compile(settings: TsCompileSettings): Promise<string[]> {
        this.logger.info("Compiling scripts with esbuild.");

        if (settings.buildOptions.bundle === false && settings.enableDebugger) {
            return this.compileSplitDebuggerBuilds(settings);
        }

        const buildOptions = this.createBuildOptions(settings.buildOptions);
        const buildResult = await esbuild.build(buildOptions);

        return this.collectJavaScriptOutputs(buildResult, buildOptions.absWorkingDir || this.projectRoot);
    }

    /**
     * Creates normalized build options with the filter's enforced defaults.
     *
     * @param buildOptions - Raw build options.
     *
     * @returns Normalized build options.
     */
    createBuildOptions(buildOptions: BuildOptions): BuildOptions {
        const existingPlugins = Array.isArray(buildOptions.plugins) ? buildOptions.plugins : [];

        return {
            ...buildOptions,
            absWorkingDir: buildOptions.absWorkingDir ?? this.projectRoot,
            format: buildOptions.format ?? "esm",
            metafile: true,
            plugins: [...existingPlugins, this.jsonExtensionPlugin],
            target: buildOptions.target ?? "es2020",
        };
    }

    /**
     * Compiles split builds one entry at a time so each sourcemap gets the correct source root.
     *
     * @param settings - Filter settings.
     *
     * @returns Absolute paths to emitted JavaScript outputs.
     *
     * @throws If split-build configuration is incomplete.
     */
    async compileSplitDebuggerBuilds(settings: TsCompileSettings): Promise<string[]> {
        const entryPoints = Array.isArray(settings.buildOptions.entryPoints) ? (settings.buildOptions.entryPoints as string[]) : [];
        const outdir = typeof settings.buildOptions.outdir === "string" ? settings.buildOptions.outdir : "";
        const sourceDir = typeof settings.sourceDir === "string" ? settings.sourceDir : "";

        if (entryPoints.length === 0 || outdir.trim() === "" || sourceDir.trim() === "") {
            throw new Error(`Split debugger builds require "entryPoints", "outdir", and "sourceDir" to be configured.`);
        }

        this.validateSplitBuildOutputPaths(sourceDir, outdir, entryPoints);
        const emittedOutputPaths: string[] = [];

        for (const entryPoint of entryPoints) {
            const outputPath = this.createSplitBuildOutputPath(sourceDir, outdir, entryPoint);
            const buildOptions: BuildOptions = {
                ...this.createBuildOptions(settings.buildOptions),
                entryPoints: [entryPoint],
                outfile: outputPath,
                outdir: undefined,
                sourceRoot: this.createSplitBuildSourceRoot(sourceDir, outputPath),
            };
            await esbuild.build(buildOptions);
            emittedOutputPaths.push(this.toAbsolutePath(outputPath));
        }

        return emittedOutputPaths;
    }

    /**
     * Rejects split-build entry sets that would emit to the same output path.
     *
     * @param sourceDir - Project-relative source directory.
     * @param outdir - Project-relative output directory.
     * @param entryPoints - Project-relative entry points.
     *
     * @throws If more than one entry would emit to the same output path.
     */
    validateSplitBuildOutputPaths(sourceDir: string, outdir: string, entryPoints: string[]): void {
        const outputRegistry = new Map<string, string>();

        for (const entryPoint of entryPoints) {
            const outputPath = this.createSplitBuildOutputPath(sourceDir, outdir, entryPoint);
            const outputKey = process.platform === "win32" ? outputPath.toLowerCase() : outputPath;
            const existingEntryPoint = outputRegistry.get(outputKey);

            if (existingEntryPoint) {
                throw new Error(
                    `Split debugger build entries "${existingEntryPoint}" and "${entryPoint}" would both emit "${outputPath}". Rename one of the source files or change the source layout so each compiled output path is unique.`
                );
            }

            outputRegistry.set(outputKey, entryPoint);
        }
    }

    /**
     * Resolves the output path for a split-build entry.
     *
     * @param sourceDir - Project-relative source directory.
     * @param outdir - Output directory path.
     * @param entryPoint - Project-relative entry point.
     *
     * @returns Absolute JavaScript output path.
     */
    createSplitBuildOutputPath(sourceDir: string, outdir: string, entryPoint: string): string {
        const relativeEntryPath = FilterPaths.normalizeRelativePath(path.posix.relative(sourceDir, entryPoint));
        const outputPath = relativeEntryPath.replace(/\.[^./]+$/, ".js");
        const outputRoot = path.isAbsolute(outdir) ? outdir : path.resolve(this.workspaceRoot, outdir);

        return path.resolve(outputRoot, ...outputPath.split("/"));
    }

    /**
     * Creates the sourcemap sourceRoot for a split-build output.
     *
     * @param sourceDir - Project-relative source directory.
     * @param outputPath - Absolute JavaScript output path.
     *
     * @returns Relative sourceRoot path.
     */
    createSplitBuildSourceRoot(sourceDir: string, outputPath: string): string {
        const generatedOutputPath = this.resolveGeneratedOutputPath(outputPath);
        const outputDirectory = path.dirname(generatedOutputPath);
        const sourceRootDirectory = path.dirname(this.exportResolver.resolveLocalProjectPath(sourceDir));

        return FilterPaths.normalizeRelativePath(path.relative(outputDirectory, sourceRootDirectory));
    }

    /**
     * Resolves a workspace output path into its active exported output path.
     *
     * @param outputPath - Absolute workspace output path.
     *
     * @returns Absolute generated output path.
     */
    resolveGeneratedOutputPath(outputPath: string): string {
        const relativeProjectPath = FilterPaths.normalizeRelativePath(path.relative(this.workspaceRoot, outputPath));
        const exportedOutputPath = this.exportResolver.resolveBehaviorPackExportPath(relativeProjectPath);

        if (exportedOutputPath) {
            return exportedOutputPath;
        }

        return outputPath;
    }

    /**
     * Collects emitted JavaScript outputs from an esbuild metafile.
     *
     * @param buildResult - Completed build result.
     * @param outputBaseDirectory - Absolute base directory for relative metafile outputs.
     *
     * @returns Absolute paths to emitted JavaScript outputs.
     */
    collectJavaScriptOutputs(buildResult: BuildResult, outputBaseDirectory: string): string[] {
        const outputs = buildResult?.metafile?.outputs || {};

        return Object.keys(outputs)
            .filter((outputPath) => outputPath.endsWith(".js"))
            .map((outputPath) => this.toAbsolutePath(outputPath, outputBaseDirectory));
    }

    /**
     * Converts an emitted output path into an absolute filesystem path.
     *
     * @param outputPath - Emitted output path from build configuration or metafile data.
     * @param baseDirectory - Base directory for relative outputs.
     *
     * @returns Absolute output path.
     */
    toAbsolutePath(outputPath: string, baseDirectory: string = this.workspaceRoot): string {
        return path.isAbsolute(outputPath) ? path.resolve(outputPath) : path.resolve(baseDirectory, outputPath);
    }
}
