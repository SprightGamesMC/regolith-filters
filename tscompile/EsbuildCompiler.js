const path = require("path");
const esbuild = require("esbuild");
const FilterPaths = require("./FilterPaths.js");
const JsonImportPlugin = require("./JsonImportPlugin.js");

/**
 * Runs esbuild with the filter's standard defaults.
 */
class EsbuildCompiler {
  /**
   * Creates the compiler instance.
   *
   * @param {{ info: (message: string) => void; error: (message: string) => void }} logger - Logger used for standardized output.
   * @param {string} workspaceRoot - Absolute Regolith temp workspace path.
   * @param {string} projectRoot - Absolute Regolith project root path.
   * @param {{
   *   resolveBehaviorPackExportPath: (projectRelativePath: string) => string | null;
   *   resolveLocalProjectPath: (projectRelativePath: string) => string;
   * }} exportResolver - Export path resolver used for debugger sourcemaps.
   */
  constructor(logger, workspaceRoot, projectRoot, exportResolver) {
    this.logger = logger;
    this.workspaceRoot = workspaceRoot;
    this.projectRoot = projectRoot;
    this.exportResolver = exportResolver;
    this.jsonExtensionPlugin = new JsonImportPlugin().create();
  }

  /**
   * Compiles the configured TypeScript sources.
   *
   * @param {{
   *   buildOptions: import("esbuild").BuildOptions;
   *   enableDebugger?: boolean;
   *   sourceDir?: string;
   * }} settings - Filter settings.
   *
   * @returns {Promise<string[]>} Absolute paths to emitted JavaScript outputs.
   *
   * @throws {Error} Thrown when the build fails.
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
   * @param {import("esbuild").BuildOptions} buildOptions - Raw build options.
   *
   * @returns {import("esbuild").BuildOptions} Normalized build options.
   */
  createBuildOptions(buildOptions) {
    const existingPlugins = Array.isArray(buildOptions.plugins) ? buildOptions.plugins : [];

    return Object.assign({}, buildOptions, {
      absWorkingDir: buildOptions.absWorkingDir ?? this.projectRoot,
      format: buildOptions.format ?? "esm",
      metafile: true,
      plugins: [...existingPlugins, this.jsonExtensionPlugin],
      target: buildOptions.target ?? "es2020"
    });
  }

  /**
   * Compiles split builds one entry at a time so each sourcemap gets the correct source root.
   *
   * @param {{
   *   buildOptions: import("esbuild").BuildOptions;
   *   sourceDir?: string;
   * }} settings - Filter settings.
   *
   * @returns {Promise<string[]>} Absolute paths to emitted JavaScript outputs.
   *
   * @throws {Error} Thrown when split-build configuration is incomplete.
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
      const buildOptions = Object.assign({}, this.createBuildOptions(settings.buildOptions), {
        entryPoints: [entryPoint],
        outfile: outputPath,
        outdir: undefined,
        sourceRoot: this.createSplitBuildSourceRoot(sourceDir, outputPath)
      });
      await esbuild.build(buildOptions);
      emittedOutputPaths.push(this.toAbsolutePath(outputPath));
    }

    return emittedOutputPaths;
  }

  /**
   * Rejects split-build entry sets that would emit to the same output path.
   *
   * @param {string} sourceDir - Project-relative source directory.
   * @param {string} outdir - Project-relative output directory.
   * @param {string[]} entryPoints - Project-relative entry points.
   *
   * @throws {Error} Thrown when more than one entry would emit to the same output path.
   */
  validateSplitBuildOutputPaths(sourceDir, outdir, entryPoints) {
    const outputRegistry = new Map();

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
   * @param {string} sourceDir - Project-relative source directory.
   * @param {string} outdir - Output directory path.
   * @param {string} entryPoint - Project-relative entry point.
   *
   * @returns {string} Absolute JavaScript output path.
   */
  createSplitBuildOutputPath(sourceDir, outdir, entryPoint) {
    const relativeEntryPath = FilterPaths.normalizeRelativePath(path.posix.relative(sourceDir, entryPoint));
    const outputPath = relativeEntryPath.replace(/\.[^.\/]+$/, ".js");
    const outputRoot = path.isAbsolute(outdir) ? outdir : path.resolve(this.workspaceRoot, outdir);

    return path.resolve(outputRoot, ...outputPath.split("/"));
  }

  /**
   * Creates the sourcemap sourceRoot for a split-build output.
   *
   * @param {string} sourceDir - Project-relative source directory.
   * @param {string} outputPath - Absolute JavaScript output path.
   *
   * @returns {string} Relative sourceRoot path.
   */
  createSplitBuildSourceRoot(sourceDir, outputPath) {
    const generatedOutputPath = this.resolveGeneratedOutputPath(outputPath);
    const outputDirectory = path.dirname(generatedOutputPath);
    const sourceRootDirectory = path.dirname(this.exportResolver.resolveLocalProjectPath(sourceDir));

    return FilterPaths.normalizeRelativePath(path.relative(outputDirectory, sourceRootDirectory));
  }

  /**
   * Resolves a workspace output path into its active exported output path.
   *
   * @param {string} outputPath - Absolute workspace output path.
   *
   * @returns {string} Absolute generated output path.
   */
  resolveGeneratedOutputPath(outputPath) {
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
   * @param {import("esbuild").BuildResult<import("esbuild").BuildOptions>} buildResult - Completed build result.
   * @param {string} outputBaseDirectory - Absolute base directory for relative metafile outputs.
   *
   * @returns {string[]} Absolute paths to emitted JavaScript outputs.
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
   * @param {string} outputPath - Emitted output path from build configuration or metafile data.
   * @param {string} [baseDirectory] - Base directory for relative outputs.
   *
   * @returns {string} Absolute output path.
   */
  toAbsolutePath(outputPath, baseDirectory = this.workspaceRoot) {
    return path.isAbsolute(outputPath) ? path.resolve(outputPath) : path.resolve(baseDirectory, outputPath);
  }
}

module.exports = EsbuildCompiler;
