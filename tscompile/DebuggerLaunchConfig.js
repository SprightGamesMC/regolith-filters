const fs = require("fs");
const path = require("path");
const FilterPaths = require("./FilterPaths.js");
const JsoncDocument = require("./JsoncDocument.js");

/**
 * Manages debugger-specific launch configuration and sourcemap roots.
 */
class DebuggerLaunchConfig {
  static VSCODE_LAUNCH_VERSION = "0.3.0";

  static TSCOMPILE_LAUNCH_NAME = "(tscompile) Debug with Minecraft";

  /**
   * Creates the debugger launch manager.
   *
   * @param {{
   *   exportResolver: {
   *     resolveBehaviorPackExportPath: (projectRelativePath: string) => string | null;
   *     resolveBehaviorPackExportRoot: () => string | null;
   *     resolveLocalProjectPath: (projectRelativePath: string) => string;
   *     toVsCodePath: (absolutePath: string) => string;
   *   };
   *   getActiveDistDir: () => string;
   *   getCompiledOutputPath: () => string;
   *   getDerivedOutputPath: () => string;
   *   logger: { info: (message: unknown) => void; warn: (message: unknown) => void };
   *   projectRoot: string;
   *   settings: Record<string, any>;
   *   toScriptsProjectPath: (relativePath: string) => string;
   * }} options - Manager dependencies and runtime state.
   */
  constructor(options) {
    this.exportResolver = options.exportResolver;
    this.getActiveDistDir = options.getActiveDistDir;
    this.getCompiledOutputPath = options.getCompiledOutputPath;
    this.getDerivedOutputPath = options.getDerivedOutputPath;
    this.logger = options.logger;
    this.projectRoot = options.projectRoot;
    this.settings = options.settings;
    this.toScriptsProjectPath = options.toScriptsProjectPath;
  }

  /**
   * Creates the sourceRoot value used for sourcemaps.
   *
   * @returns {string} Relative sourceRoot path.
   */
  createSourceRoot() {
    const outputDirectory = this.resolveGeneratedOutputDirectory();
    const sourceRootDirectory = this.getSourceRootDirectory();

    return FilterPaths.normalizeRelativePath(path.relative(outputDirectory, sourceRootDirectory));
  }

  /**
   * Ensures the VS Code launch configuration matches the active source directory.
   */
  ensureLaunchConfiguration() {
    const launchPath = path.join(this.projectRoot, ".vscode", "launch.json");
    const expectedConfig = this.createMinecraftLaunchConfiguration();

    if (!fs.existsSync(launchPath)) {
      const launchDirectory = path.dirname(launchPath);
      const launchConfig = {
        version: DebuggerLaunchConfig.VSCODE_LAUNCH_VERSION,
        configurations: [expectedConfig]
      };

      fs.mkdirSync(launchDirectory, { recursive: true });
      fs.writeFileSync(launchPath, JsoncDocument.ensureTrailingNewline(JSON.stringify(launchConfig, null, 2)));

      this.logger.info("Created VS Code launch configuration.");
      return;
    }

    const launchContent = fs.readFileSync(launchPath, "utf8");
    const launchConfig = JsoncDocument.parseDocument(launchContent, launchPath);

    if (!launchConfig || typeof launchConfig !== "object" || Array.isArray(launchConfig)) {
      const replacementConfig = {
        version: DebuggerLaunchConfig.VSCODE_LAUNCH_VERSION,
        configurations: [expectedConfig]
      };
      fs.writeFileSync(launchPath, JsoncDocument.ensureTrailingNewline(JSON.stringify(replacementConfig, null, 2)));
      this.logger.info("Replaced VS Code launch configuration with a supported debugger profile.");
      return;
    }

    const existingConfigurations = Array.isArray(launchConfig.configurations) ? launchConfig.configurations : [];
    const preservedConfigurations = existingConfigurations.filter((configuration) => {
      return !this.isTsCompileLaunchConfiguration(configuration);
    });
    const nextConfigurations = [...preservedConfigurations, expectedConfig];
    const nextVersion = DebuggerLaunchConfig.VSCODE_LAUNCH_VERSION;
    let changed = !Array.isArray(launchConfig.configurations);
    let nextLaunchContent = launchContent;

    if (existingConfigurations.length !== nextConfigurations.length) {
      changed = true;
    }

    if (!changed) {
      changed = JSON.stringify(existingConfigurations) !== JSON.stringify(nextConfigurations);
    }

    if (launchConfig.version !== nextVersion) {
      nextLaunchContent = JsoncDocument.updateProperty(nextLaunchContent, ["version"], nextVersion);
      changed = true;
    }

    if (changed) {
      nextLaunchContent = JsoncDocument.updateProperty(nextLaunchContent, ["configurations"], nextConfigurations);
      fs.writeFileSync(launchPath, JsoncDocument.ensureTrailingNewline(nextLaunchContent));
      this.logger.info("Updated VS Code launch configuration.");
    }
  }

  /**
   * Creates the canonical Minecraft debugger launch configuration.
   *
   * @returns {Record<string, any>} VS Code debugger configuration.
   */
  createMinecraftLaunchConfiguration() {
    const generatedRoot = this.resolveDebuggerGeneratedRoot();

    return {
      type: "minecraft-js",
      request: "attach",
      name: DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME,
      mode: "listen",
      targetModuleUuid: this.settings.moduleUUID,
      localRoot: FilterPaths.ensureTrailingSlash(this.exportResolver.toVsCodePath(this.getLocalRootDirectory())),
      sourceMapRoot: generatedRoot,
      generatedSourceRoot: generatedRoot,
      port: 19144
    };
  }

  /**
   * Resolves the generated debugger root for the active export target.
   *
   * @returns {string} VS Code launch path for generated scripts and sourcemaps.
   */
  resolveDebuggerGeneratedRoot() {
    const behaviorPackRoot = this.exportResolver.resolveBehaviorPackExportRoot();
    const workspaceFallback = FilterPaths.ensureTrailingSlash(`\${workspaceFolder}/${this.getScriptsDebuggerRoot()}`);

    if (!behaviorPackRoot) {
      return workspaceFallback;
    }

    const scriptsRelativeRoot = this.getScriptsRelativeDebuggerRoot();
    const generatedRoot = path.resolve(behaviorPackRoot, ...scriptsRelativeRoot.split("/"));

    return FilterPaths.ensureTrailingSlash(this.exportResolver.toVsCodePath(generatedRoot));
  }

  /**
   * Resolves the generated output directory used by sourcemaps.
   *
   * @returns {string} Absolute generated output directory.
   */
  resolveGeneratedOutputDirectory() {
    const generatedOutputPath = this.resolveGeneratedOutputPath();

    return path.dirname(generatedOutputPath);
  }

  /**
   * Resolves the generated output file path for the active export target.
   *
   * @returns {string} Absolute generated output file path.
   */
  resolveGeneratedOutputPath() {
    const generatedProjectPath = this.toScriptsProjectPath(this.getDerivedOutputPath());
    const exportedOutputPath = this.exportResolver.resolveBehaviorPackExportPath(generatedProjectPath);

    if (exportedOutputPath) {
      return exportedOutputPath;
    }

    return this.getCompiledOutputPath();
  }

  /**
   * Resolves the local source directory used by the VS Code debugger.
   *
   * @returns {string} Absolute local source directory.
   */
  getLocalRootDirectory() {
    return this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir);
  }

  /**
   * Resolves the filesystem directory used as the sourcemap sourceRoot base.
   *
   * @returns {string} Absolute sourceRoot base directory.
   */
  getSourceRootDirectory() {
    const sourceDirectory = this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir);

    return path.dirname(sourceDirectory);
  }

  /**
   * Gets the scripts output root relative to the project root.
   *
   * @returns {string} Project-relative scripts output root.
   */
  getScriptsOutputRoot() {
    return this.settings.buildOptions.bundle !== false
      ? path.posix.dirname(this.toScriptsProjectPath(this.getDerivedOutputPath()))
      : this.toScriptsProjectPath(this.getActiveDistDir());
  }

  /**
   * Gets the scripts debugger root relative to the project root.
   *
   * @returns {string} Project-relative scripts debugger root.
   */
  getScriptsDebuggerRoot() {
    return this.toScriptsProjectPath(".");
  }

  /**
   * Gets the scripts debugger root relative to the behavior pack root.
   *
   * @returns {string} Behavior-pack-relative scripts output root.
   */
  getScriptsRelativeDebuggerRoot() {
    return FilterPaths.normalizeRelativePath(path.posix.relative("BP", this.getScriptsDebuggerRoot()));
  }

  /**
   * Checks whether a launch configuration targets the Minecraft JS debugger.
   *
   * @param {Record<string, any> | null | undefined} configuration - Launch configuration candidate.
   *
   * @returns {boolean} Whether the configuration uses the Minecraft JS debugger.
   */
  isMinecraftLaunchConfiguration(configuration) {
    return Boolean(
      configuration &&
      typeof configuration === "object" &&
      !Array.isArray(configuration) &&
      configuration.type === "minecraft-js"
    );
  }

  /**
   * Checks whether a launch configuration is the tscompile-managed debugger entry.
   *
   * @param {Record<string, any> | null | undefined} configuration - Launch configuration candidate.
   *
   * @returns {boolean} Whether the configuration is managed by tscompile.
   */
  isTsCompileLaunchConfiguration(configuration) {
    return (
      this.isMinecraftLaunchConfiguration(configuration) &&
      configuration.name === DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME
    );
  }
}

module.exports = DebuggerLaunchConfig;
