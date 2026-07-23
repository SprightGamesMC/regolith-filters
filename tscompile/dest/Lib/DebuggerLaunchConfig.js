"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
const FilterPaths_1 = __importDefault(require("./FilterPaths"));
/**
 * Manages debugger-specific launch configuration and sourcemap roots.
 */
class DebuggerLaunchConfig {
    static VSCODE_LAUNCH_VERSION = "0.3.0";
    static TSCOMPILE_LAUNCH_NAME = "(tscompile) Debug with Minecraft";
    /** Export path resolver used for generated output locations. */
    exportResolver;
    /** Resolves the absolute compiled output path. */
    getCompiledOutputPath;
    /** Resolves the derived output path relative to `BP/scripts`. */
    getDerivedOutputPath;
    /** Logger used for standardized output. */
    logger;
    /** Absolute Regolith project root path. */
    projectRoot;
    /** Resolved filter settings. */
    settings;
    /** Converts a scripts-relative path into a project-relative path. */
    toScriptsProjectPath;
    /**
     * Creates the debugger launch manager.
     *
     * @param options - Manager dependencies and runtime state.
     */
    constructor(options) {
        this.exportResolver = options.exportResolver;
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
     * @returns Relative sourceRoot path.
     */
    createSourceRoot() {
        const outputDirectory = this.resolveGeneratedOutputDirectory();
        const sourceRootDirectory = this.getSourceRootDirectory();
        return FilterPaths_1.default.normalizeRelativePath(path_1.default.relative(outputDirectory, sourceRootDirectory));
    }
    /**
     * Ensures the VS Code launch configuration matches the active source directory.
     */
    ensureLaunchConfiguration() {
        const launchPath = path_1.default.join(this.projectRoot, ".vscode", "launch.json");
        const expectedConfig = this.createMinecraftLaunchConfiguration();
        const nextVersion = DebuggerLaunchConfig.VSCODE_LAUNCH_VERSION;
        if (!fs_1.default.existsSync(launchPath)) {
            fs_1.default.mkdirSync(path_1.default.dirname(launchPath), { recursive: true });
            JsonTools_1.default.writePretty(launchPath, { version: nextVersion, configurations: [expectedConfig] });
            this.logger.info("Created VS Code launch configuration.");
            return;
        }
        const parsedLaunch = JsonTools_1.default.loadFile(launchPath);
        if (!parsedLaunch || typeof parsedLaunch !== "object" || Array.isArray(parsedLaunch)) {
            JsonTools_1.default.writePretty(launchPath, { version: nextVersion, configurations: [expectedConfig] });
            this.logger.info("Replaced VS Code launch configuration with a supported debugger profile.");
            return;
        }
        const launchConfig = parsedLaunch;
        const existingConfigurations = Array.isArray(launchConfig.configurations) ? launchConfig.configurations : [];
        const preservedConfigurations = existingConfigurations.filter((configuration) => {
            return !this.isTsCompileLaunchConfiguration(configuration);
        });
        const nextLaunchConfig = { ...launchConfig, version: nextVersion, configurations: [...preservedConfigurations, expectedConfig] };
        if (JSON.stringify(launchConfig) === JSON.stringify(nextLaunchConfig)) {
            return;
        }
        JsonTools_1.default.writePretty(launchPath, nextLaunchConfig);
        this.logger.info("Updated VS Code launch configuration.");
    }
    /**
     * Creates the canonical Minecraft debugger launch configuration.
     *
     * @returns VS Code debugger configuration.
     */
    createMinecraftLaunchConfiguration() {
        const generatedRoot = this.resolveDebuggerGeneratedRoot();
        return {
            type: "minecraft-js",
            request: "attach",
            name: DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME,
            mode: "listen",
            targetModuleUuid: this.settings.moduleUUID,
            localRoot: FilterPaths_1.default.ensureTrailingSlash(this.exportResolver.toVsCodePath(this.getLocalRootDirectory())),
            sourceMapRoot: generatedRoot,
            generatedSourceRoot: generatedRoot,
            port: 19144,
        };
    }
    /**
     * Resolves the generated debugger root for the active export target.
     *
     * @returns VS Code launch path for generated scripts and sourcemaps.
     */
    resolveDebuggerGeneratedRoot() {
        const behaviorPackRoot = this.exportResolver.resolveBehaviorPackExportRoot();
        const workspaceFallback = FilterPaths_1.default.ensureTrailingSlash(`\${workspaceFolder}/${this.getScriptsDebuggerRoot()}`);
        if (!behaviorPackRoot) {
            return workspaceFallback;
        }
        const scriptsRelativeRoot = this.getScriptsRelativeDebuggerRoot();
        const generatedRoot = path_1.default.resolve(behaviorPackRoot, ...scriptsRelativeRoot.split("/"));
        return FilterPaths_1.default.ensureTrailingSlash(this.exportResolver.toVsCodePath(generatedRoot));
    }
    /**
     * Resolves the generated output directory used by sourcemaps.
     *
     * @returns Absolute generated output directory.
     */
    resolveGeneratedOutputDirectory() {
        const generatedOutputPath = this.resolveGeneratedOutputPath();
        return path_1.default.dirname(generatedOutputPath);
    }
    /**
     * Resolves the generated output file path for the active export target.
     *
     * @returns Absolute generated output file path.
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
     * @returns Absolute local source directory.
     */
    getLocalRootDirectory() {
        return this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir);
    }
    /**
     * Resolves the filesystem directory used as the sourcemap sourceRoot base.
     *
     * @returns Absolute sourceRoot base directory.
     */
    getSourceRootDirectory() {
        const sourceDirectory = this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir);
        return path_1.default.dirname(sourceDirectory);
    }
    /**
     * Gets the scripts debugger root relative to the project root.
     *
     * @returns Project-relative scripts debugger root.
     */
    getScriptsDebuggerRoot() {
        return this.toScriptsProjectPath(".");
    }
    /**
     * Gets the scripts debugger root relative to the behavior pack root.
     *
     * @returns Behavior-pack-relative scripts output root.
     */
    getScriptsRelativeDebuggerRoot() {
        return FilterPaths_1.default.normalizeRelativePath(path_1.default.posix.relative("BP", this.getScriptsDebuggerRoot()));
    }
    /**
     * Checks whether a launch configuration targets the Minecraft JS debugger.
     *
     * @param configuration - Launch configuration candidate.
     *
     * @returns `true` when the configuration uses the Minecraft JS debugger.
     */
    isMinecraftLaunchConfiguration(configuration) {
        return Boolean(configuration &&
            typeof configuration === "object" &&
            !Array.isArray(configuration) &&
            configuration.type === "minecraft-js");
    }
    /**
     * Checks whether a launch configuration is the tscompile-managed debugger entry.
     *
     * @param configuration - Launch configuration candidate.
     *
     * @returns `true` when the configuration is managed by tscompile.
     */
    isTsCompileLaunchConfiguration(configuration) {
        return (this.isMinecraftLaunchConfiguration(configuration) &&
            configuration.name === DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME);
    }
}
exports.default = DebuggerLaunchConfig;
