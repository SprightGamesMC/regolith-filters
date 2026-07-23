"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const esbuild = __importStar(require("esbuild"));
const JsonImportPlugin_1 = __importDefault(require("./JsonImportPlugin"));
const FilterPaths_1 = __importDefault(require("./FilterPaths"));
/**
 * Runs esbuild with the filter's standard defaults.
 */
class EsbuildCompiler {
    /** Logger used for standardized output. */
    logger;
    /** Absolute Regolith temp workspace path. */
    workspaceRoot;
    /** Absolute Regolith project root path. */
    projectRoot;
    /** Export path resolver used for debugger sourcemaps. */
    exportResolver;
    /** JSONC-aware esbuild plugin for `.json` imports. */
    jsonExtensionPlugin;
    /**
     * Creates the compiler instance.
     *
     * @param logger - Logger used for standardized output.
     * @param workspaceRoot - Absolute Regolith temp workspace path.
     * @param projectRoot - Absolute Regolith project root path.
     * @param exportResolver - Export path resolver used for debugger sourcemaps.
     */
    constructor(logger, workspaceRoot, projectRoot, exportResolver) {
        this.logger = logger;
        this.workspaceRoot = workspaceRoot;
        this.projectRoot = projectRoot;
        this.exportResolver = exportResolver;
        this.jsonExtensionPlugin = new JsonImportPlugin_1.default().create();
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
    async compile(settings) {
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
    createBuildOptions(buildOptions) {
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
    async compileSplitDebuggerBuilds(settings) {
        const entryPoints = Array.isArray(settings.buildOptions.entryPoints) ? settings.buildOptions.entryPoints : [];
        const outdir = typeof settings.buildOptions.outdir === "string" ? settings.buildOptions.outdir : "";
        const sourceDir = typeof settings.sourceDir === "string" ? settings.sourceDir : "";
        if (entryPoints.length === 0 || outdir.trim() === "" || sourceDir.trim() === "") {
            throw new Error(`Split debugger builds require "entryPoints", "outdir", and "sourceDir" to be configured.`);
        }
        this.validateSplitBuildOutputPaths(sourceDir, outdir, entryPoints);
        const emittedOutputPaths = [];
        for (const entryPoint of entryPoints) {
            const outputPath = this.createSplitBuildOutputPath(sourceDir, outdir, entryPoint);
            const buildOptions = {
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
    validateSplitBuildOutputPaths(sourceDir, outdir, entryPoints) {
        const outputRegistry = new Map();
        for (const entryPoint of entryPoints) {
            const outputPath = this.createSplitBuildOutputPath(sourceDir, outdir, entryPoint);
            const outputKey = process.platform === "win32" ? outputPath.toLowerCase() : outputPath;
            const existingEntryPoint = outputRegistry.get(outputKey);
            if (existingEntryPoint) {
                throw new Error(`Split debugger build entries "${existingEntryPoint}" and "${entryPoint}" would both emit "${outputPath}". Rename one of the source files or change the source layout so each compiled output path is unique.`);
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
    createSplitBuildOutputPath(sourceDir, outdir, entryPoint) {
        const relativeEntryPath = FilterPaths_1.default.normalizeRelativePath(path_1.default.posix.relative(sourceDir, entryPoint));
        const outputPath = relativeEntryPath.replace(/\.[^./]+$/, ".js");
        const outputRoot = path_1.default.isAbsolute(outdir) ? outdir : path_1.default.resolve(this.workspaceRoot, outdir);
        return path_1.default.resolve(outputRoot, ...outputPath.split("/"));
    }
    /**
     * Creates the sourcemap sourceRoot for a split-build output.
     *
     * @param sourceDir - Project-relative source directory.
     * @param outputPath - Absolute JavaScript output path.
     *
     * @returns Relative sourceRoot path.
     */
    createSplitBuildSourceRoot(sourceDir, outputPath) {
        const generatedOutputPath = this.resolveGeneratedOutputPath(outputPath);
        const outputDirectory = path_1.default.dirname(generatedOutputPath);
        const sourceRootDirectory = path_1.default.dirname(this.exportResolver.resolveLocalProjectPath(sourceDir));
        return FilterPaths_1.default.normalizeRelativePath(path_1.default.relative(outputDirectory, sourceRootDirectory));
    }
    /**
     * Resolves a workspace output path into its active exported output path.
     *
     * @param outputPath - Absolute workspace output path.
     *
     * @returns Absolute generated output path.
     */
    resolveGeneratedOutputPath(outputPath) {
        const relativeProjectPath = FilterPaths_1.default.normalizeRelativePath(path_1.default.relative(this.workspaceRoot, outputPath));
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
    collectJavaScriptOutputs(buildResult, outputBaseDirectory) {
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
    toAbsolutePath(outputPath, baseDirectory = this.workspaceRoot) {
        return path_1.default.isAbsolute(outputPath) ? path_1.default.resolve(outputPath) : path_1.default.resolve(baseDirectory, outputPath);
    }
}
exports.default = EsbuildCompiler;
