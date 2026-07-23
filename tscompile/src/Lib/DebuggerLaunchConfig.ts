import fs from "fs";
import path from "path";
import JsonTools from "./JsonTools";
import FilterPaths from "./FilterPaths";
import type ProjectExportResolver from "./ProjectExportResolver";
import type FilterLogger from "./FilterLogger";
import type { TsCompileSettings } from "../Types/TsCompileTypes";

/** Constructor dependencies for the debugger launch manager. */
interface DebuggerLaunchConfigOptions {
    exportResolver: ProjectExportResolver;
    getCompiledOutputPath: () => string;
    getDerivedOutputPath: () => string;
    logger: FilterLogger;
    projectRoot: string;
    settings: TsCompileSettings;
    toScriptsProjectPath: (relativePath: string) => string;
}

/**
 * Manages debugger-specific launch configuration and sourcemap roots.
 */
export default class DebuggerLaunchConfig {
    static readonly VSCODE_LAUNCH_VERSION = "0.3.0";

    static readonly TSCOMPILE_LAUNCH_NAME = "(tscompile) Debug with Minecraft";

    /** Export path resolver used for generated output locations. */
    private readonly exportResolver: ProjectExportResolver;

    /** Resolves the absolute compiled output path. */
    private readonly getCompiledOutputPath: () => string;

    /** Resolves the derived output path relative to `BP/scripts`. */
    private readonly getDerivedOutputPath: () => string;

    /** Logger used for standardized output. */
    private readonly logger: FilterLogger;

    /** Absolute Regolith project root path. */
    private readonly projectRoot: string;

    /** Resolved filter settings. */
    private readonly settings: TsCompileSettings;

    /** Converts a scripts-relative path into a project-relative path. */
    private readonly toScriptsProjectPath: (relativePath: string) => string;

    /**
     * Creates the debugger launch manager.
     *
     * @param options - Manager dependencies and runtime state.
     */
    constructor(options: DebuggerLaunchConfigOptions) {
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
    createSourceRoot(): string {
        const outputDirectory = this.resolveGeneratedOutputDirectory();
        const sourceRootDirectory = this.getSourceRootDirectory();

        return FilterPaths.normalizeRelativePath(path.relative(outputDirectory, sourceRootDirectory));
    }

    /**
     * Ensures the VS Code launch configuration matches the active source directory.
     */
    ensureLaunchConfiguration(): void {
        const launchPath = path.join(this.projectRoot, ".vscode", "launch.json");
        const expectedConfig = this.createMinecraftLaunchConfiguration();
        const nextVersion = DebuggerLaunchConfig.VSCODE_LAUNCH_VERSION;

        if (!fs.existsSync(launchPath)) {
            fs.mkdirSync(path.dirname(launchPath), { recursive: true });
            JsonTools.writePretty(launchPath, { version: nextVersion, configurations: [expectedConfig] });

            this.logger.info("Created VS Code launch configuration.");
            return;
        }

        const parsedLaunch = JsonTools.loadFile(launchPath);

        if (!parsedLaunch || typeof parsedLaunch !== "object" || Array.isArray(parsedLaunch)) {
            JsonTools.writePretty(launchPath, { version: nextVersion, configurations: [expectedConfig] });
            this.logger.info("Replaced VS Code launch configuration with a supported debugger profile.");
            return;
        }

        const launchConfig = parsedLaunch as Record<string, unknown>;
        const existingConfigurations = Array.isArray(launchConfig.configurations) ? (launchConfig.configurations as unknown[]) : [];
        const preservedConfigurations = existingConfigurations.filter((configuration) => {
            return !this.isTsCompileLaunchConfiguration(configuration);
        });
        const nextLaunchConfig = { ...launchConfig, version: nextVersion, configurations: [...preservedConfigurations, expectedConfig] };

        if (JSON.stringify(launchConfig) === JSON.stringify(nextLaunchConfig)) {
            return;
        }

        JsonTools.writePretty(launchPath, nextLaunchConfig);
        this.logger.info("Updated VS Code launch configuration.");
    }

    /**
     * Creates the canonical Minecraft debugger launch configuration.
     *
     * @returns VS Code debugger configuration.
     */
    createMinecraftLaunchConfiguration(): Record<string, unknown> {
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
            port: 19144,
        };
    }

    /**
     * Resolves the generated debugger root for the active export target.
     *
     * @returns VS Code launch path for generated scripts and sourcemaps.
     */
    resolveDebuggerGeneratedRoot(): string {
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
     * @returns Absolute generated output directory.
     */
    resolveGeneratedOutputDirectory(): string {
        const generatedOutputPath = this.resolveGeneratedOutputPath();

        return path.dirname(generatedOutputPath);
    }

    /**
     * Resolves the generated output file path for the active export target.
     *
     * @returns Absolute generated output file path.
     */
    resolveGeneratedOutputPath(): string {
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
    getLocalRootDirectory(): string {
        return this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir);
    }

    /**
     * Resolves the filesystem directory used as the sourcemap sourceRoot base.
     *
     * @returns Absolute sourceRoot base directory.
     */
    getSourceRootDirectory(): string {
        const sourceDirectory = this.exportResolver.resolveLocalProjectPath(this.settings.sourceDir);

        return path.dirname(sourceDirectory);
    }

    /**
     * Gets the scripts debugger root relative to the project root.
     *
     * @returns Project-relative scripts debugger root.
     */
    getScriptsDebuggerRoot(): string {
        return this.toScriptsProjectPath(".");
    }

    /**
     * Gets the scripts debugger root relative to the behavior pack root.
     *
     * @returns Behavior-pack-relative scripts output root.
     */
    getScriptsRelativeDebuggerRoot(): string {
        return FilterPaths.normalizeRelativePath(path.posix.relative("BP", this.getScriptsDebuggerRoot()));
    }

    /**
     * Checks whether a launch configuration targets the Minecraft JS debugger.
     *
     * @param configuration - Launch configuration candidate.
     *
     * @returns `true` when the configuration uses the Minecraft JS debugger.
     */
    isMinecraftLaunchConfiguration(configuration: unknown): boolean {
        return Boolean(
            configuration &&
            typeof configuration === "object" &&
            !Array.isArray(configuration) &&
            (configuration as Record<string, unknown>).type === "minecraft-js"
        );
    }

    /**
     * Checks whether a launch configuration is the tscompile-managed debugger entry.
     *
     * @param configuration - Launch configuration candidate.
     *
     * @returns `true` when the configuration is managed by tscompile.
     */
    isTsCompileLaunchConfiguration(configuration: unknown): boolean {
        return (
            this.isMinecraftLaunchConfiguration(configuration) &&
            (configuration as Record<string, unknown>).name === DebuggerLaunchConfig.TSCOMPILE_LAUNCH_NAME
        );
    }
}
