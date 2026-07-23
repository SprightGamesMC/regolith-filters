import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { globSync } from "glob";
import DebuggerLaunchConfig from "./DebuggerLaunchConfig";
import EsbuildCompiler from "./EsbuildCompiler";
import FilterLogger from "./FilterLogger";
import FilterTiming from "./FilterTiming";
import FilterPaths from "./FilterPaths";
import ProjectExportResolver from "./ProjectExportResolver";
import RuntimeSourceMapInjector from "./RuntimeSourceMapInjector";
import type { BuildOptions } from "esbuild";
import type { EntryAnalysis, ModuleDefinition, ResolvedPaths, TsCompileSettings } from "../Types/TsCompileTypes";

/**
 * Coordinates the tscompile Regolith filter lifecycle.
 */
export default class TsCompileFilter {
    static readonly FILTER_IDENTIFIER = "tscompile";

    static readonly BEHAVIOR_PACK_ROOT = "BP";

    static readonly MANIFEST_PATH = "BP/manifest.json";

    static readonly MODULE_LANGUAGE = "javascript";

    static readonly MODULE_TYPE = "script";

    static readonly CONFIG_FILENAME = "tscompile.config.js";

    static readonly SCRIPTS_ROOT = "BP/scripts";

    static readonly DEFAULT_SOURCE_DIR = "BP/scripts/src";

    static readonly DEFAULT_SOURCE_ENTRY = "main.ts";

    static readonly SUPPORTED_SCRIPT_EXTENSION_LIST = ".ts, .mts, .cts, .js, .mjs, and .cjs";

    static readonly UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    static readonly TYPESCRIPT_DECLARATION_PATTERN = /\.d\.(?:cts|mts|ts)$/i;

    static readonly SCRIPT_ENTRY_PATTERN = /\.(?:cjs|cts|js|mjs|mts|ts)$/i;

    static readonly JSON_IMPORT_PATTERN =
        /\b(?:import|export)\b[\s\S]*?from\s*["'][^"']+\.json["']|\bimport\s*\(\s*["'][^"']+\.json["']\s*\)|\brequire\s*\(\s*["'][^"']+\.json["']\s*\)/;

    static readonly COMMON_JS_PATTERN = /\brequire\s*\(|\bmodule\.exports\b|\bexports\.(?!default\b)|\bexports\s*\[/;

    /** Current working directory. */
    private readonly cwd: string;

    /** Absolute Regolith project root path. */
    private readonly projectRoot: string;

    /** Raw JSON settings passed to the filter. */
    private readonly rawSettings: Record<string, unknown>;

    /** Standardized output logger. */
    private readonly logger: FilterLogger;

    /** Stage timing helper. */
    private readonly timing: FilterTiming;

    /** Resolved filter settings. */
    private readonly settings: TsCompileSettings;

    /** Export path resolver used for debugger support. */
    private readonly exportResolver: ProjectExportResolver;

    /** esbuild compiler wrapper. */
    private readonly compiler: EsbuildCompiler;

    /** Debugger launch configuration manager. */
    private readonly debuggerLaunchManager: DebuggerLaunchConfig;

    /** Runtime sourcemap injector. */
    private readonly runtimeSourceMaps: RuntimeSourceMapInjector;

    /** Cached parsed module definitions. */
    private parsedModules: ModuleDefinition[] | null;

    /** Cached derived path values. */
    private resolvedPaths: ResolvedPaths | null;

    /** Cached split-build entry analysis. */
    private entrySourceAnalysis: EntryAnalysis[] | null;

    /** Absolute paths to emitted JavaScript outputs. */
    private emittedOutputPaths: string[];

    /**
     * Creates the filter instance.
     *
     * @param cwd - Current working directory.
     * @param projectRoot - Absolute Regolith project root path.
     * @param rawSettings - Raw JSON settings passed to the filter.
     */
    constructor(cwd: string, projectRoot: string, rawSettings: unknown) {
        this.cwd = cwd;
        this.projectRoot = projectRoot;
        this.rawSettings =
            rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? (rawSettings as Record<string, unknown>) : {};
        this.logger = new FilterLogger();
        this.timing = new FilterTiming(this.logger);
        this.settings = this.createSettings(this.rawSettings);
        this.exportResolver = new ProjectExportResolver({
            projectRoot: this.projectRoot,
            settings: this.settings,
        });
        this.compiler = new EsbuildCompiler(this.logger, this.cwd, this.projectRoot, this.exportResolver);
        this.debuggerLaunchManager = new DebuggerLaunchConfig({
            exportResolver: this.exportResolver,
            getCompiledOutputPath: () => this.getCompiledOutputPath(),
            getDerivedOutputPath: () => this.getDerivedOutputPath(),
            logger: this.logger,
            projectRoot: this.projectRoot,
            settings: this.settings,
            toScriptsProjectPath: (relativePath) => this.toScriptsProjectPath(relativePath),
        });
        this.runtimeSourceMaps = new RuntimeSourceMapInjector({
            exportResolver: this.exportResolver,
            logger: this.logger,
            projectRoot: this.projectRoot,
            settings: this.settings,
            toScriptsProjectPath: (relativePath) => this.toScriptsProjectPath(relativePath),
        });
        this.parsedModules = null;
        this.resolvedPaths = null;
        this.entrySourceAnalysis = null;
        this.emittedOutputPaths = [];
    }

    /**
     * Runs the full filter pipeline.
     */
    async run(): Promise<void> {
        this.logger.info("Preparing TypeScript compilation.");
        const runStartedAt = this.timing.createTimer();

        await this.timing.timeStage("Prepare Build", () => {
            this.prepareBuild();
        });

        await this.timing.timeStage("Update Project Files", () => {
            this.updateProjectFiles();
        });

        await this.timing.timeStage("Compile", async () => {
            this.emittedOutputPaths = await this.compiler.compile(this.settings);
        });

        await this.timing.timeStage("Finalize Build", async () => {
            await this.finalizeBuild();
        });

        this.timing.logDuration("Compilation Complete", runStartedAt);
    }

    /**
     * Prepares settings and build metadata before file updates and compilation.
     */
    prepareBuild(): void {
        this.loadConfigFile();
        this.resetComputedState();

        this.normalizeSettings();
        this.resetComputedState();

        this.configureBuildOutputPaths();

        this.validateSettings();

        if (this.settings.enableDebugger) {
            this.settings.buildOptions.sourcemap = true;
            this.settings.buildOptions.sourceRoot = this.debuggerLaunchManager.createSourceRoot();
        }

        this.configureEntryPoint();

        this.validateSplitBuildEntries();

        this.applyExternalModules();
    }

    /**
     * Updates project files required before the compile step.
     */
    updateProjectFiles(): void {
        if (this.settings.enableDebugger) {
            this.debuggerLaunchManager.ensureLaunchConfiguration();
        }

        this.updateManifest();
    }

    /**
     * Applies post-build output adjustments and cleanup.
     */
    async finalizeBuild(): Promise<void> {
        if (this.settings.enableDebugger) {
            for (const compiledOutputPath of this.getDebuggerOutputPaths()) {
                const derivedOutputPath = this.getDerivedOutputPathForCompiledOutput(compiledOutputPath);
                const injectedSourceMapping = await this.runtimeSourceMaps.generateSourceMapping(compiledOutputPath, derivedOutputPath);

                if (injectedSourceMapping) {
                    await this.runtimeSourceMaps.adjustSourceMap(`${compiledOutputPath}.map`, derivedOutputPath, 1);
                }
            }
        }

        if (!this.shouldRemoveSourceDirectory()) {
            return;
        }

        this.removeSourceDirectory();
    }

    /**
     * Creates merged settings with canonical defaults.
     *
     * @param rawSettings - Raw JSON settings passed to the filter.
     *
     * @returns Merged filter settings.
     */
    createSettings(rawSettings: Record<string, unknown>): TsCompileSettings {
        const rawBuildOptions =
            rawSettings.buildOptions && typeof rawSettings.buildOptions === "object" && !Array.isArray(rawSettings.buildOptions)
                ? (rawSettings.buildOptions as BuildOptions)
                : {};
        const defaults = {
            buildOptions: {
                bundle: true,
                external: [] as string[],
                minify: true,
            } as BuildOptions,
            modules: ["@minecraft/server@2.0.0"],
            sourceDir: TsCompileFilter.DEFAULT_SOURCE_DIR,
            sourceEntry: TsCompileFilter.DEFAULT_SOURCE_ENTRY,
            keepSource: false,
            enableDebugger: false,
            disableManifestModification: false,
        };
        const settings = { ...defaults, ...rawSettings } as unknown as TsCompileSettings;
        settings.buildOptions = { ...defaults.buildOptions, ...rawBuildOptions };

        return settings;
    }

    /**
     * Normalizes mutable path settings after config overrides are applied.
     */
    normalizeSettings(): void {
        this.settings.sourceEntry = FilterPaths.normalizeRelativePath(this.settings.sourceEntry);
        this.settings.sourceDir = FilterPaths.normalizeRelativePath(this.settings.sourceDir);
    }

    /**
     * Clears computed values that depend on mutable settings.
     */
    resetComputedState(): void {
        this.parsedModules = null;
        this.resolvedPaths = null;
        this.entrySourceAnalysis = null;
        this.emittedOutputPaths = [];
    }

    /**
     * Ensures derived path values are cached for the current settings.
     *
     * @returns Cached derived path values.
     */
    ensureResolvedPaths(): ResolvedPaths {
        if (this.resolvedPaths) {
            return this.resolvedPaths;
        }

        const activeDistDir = this.settings.keepSource ? "dist" : ".";
        const sourceEntryProjectPath = FilterPaths.joinRelativePath(this.settings.sourceDir, this.settings.sourceEntry);
        const outputRelativePath = this.settings.sourceEntry.replace(/\.[^./]+$/, ".js");
        const derivedOutputPath = this.settings.keepSource ? FilterPaths.joinRelativePath("dist", outputRelativePath) : outputRelativePath;

        this.resolvedPaths = {
            activeDistDir,
            compiledOutputPath: FilterPaths.toAbsolutePath(this.cwd, this.toScriptsProjectPath(derivedOutputPath)),
            derivedOutputPath,
            sourceEntryProjectPath,
        };

        return this.resolvedPaths;
    }

    /**
     * Loads the optional root-level `tscompile.config.js` override.
     */
    loadConfigFile(): void {
        const configPath = path.resolve(this.projectRoot, TsCompileFilter.CONFIG_FILENAME);

        if (!fs.existsSync(configPath)) {
            return;
        }

        const requireConfig = createRequire(__filename);
        const loadedConfig = requireConfig(configPath) as unknown;
        const configModule = loadedConfig && typeof loadedConfig === "object" ? (loadedConfig as Record<string, unknown>) : null;
        const config =
            configModule && typeof configModule.config === "function"
                ? (configModule.config as (settings: TsCompileSettings) => void)
                : null;

        if (!config) {
            this.logger.warn(`Skipping "${TsCompileFilter.CONFIG_FILENAME}" because it must export a "config(settings)" function.`);
            return;
        }

        this.logger.info(`Loading config override "${TsCompileFilter.CONFIG_FILENAME}".`);
        config(this.settings);
    }

    /**
     * Configures build output paths based on bundle mode.
     *
     * @throws If output path configuration is invalid.
     */
    configureBuildOutputPaths(): void {
        const bundle = this.settings.buildOptions.bundle !== false;
        const outputPath = this.getDerivedOutputPath();

        delete this.settings.buildOptions.outdir;
        delete this.settings.buildOptions.outfile;

        if (bundle) {
            this.settings.buildOptions.outfile = this.getCompiledOutputPath();
            return;
        }

        if (!FilterPaths.isSubPath(this.getActiveDistDir(), outputPath)) {
            throw new Error(
                `When "buildOptions.bundle" is false, the compiled output path must stay inside the active output folder. Check your "sourceEntry" and "keepSource" settings.`
            );
        }

        this.settings.buildOptions.outdir = this.getCompiledOutputDirectoryPath();
    }

    /**
     * Validates the current filter settings.
     *
     * @throws If setting types or values are invalid.
     */
    validateSettings(): void {
        const typeMap: Record<string, string> = {
            buildOptions: "object",
            modules: "array",
            moduleUUID: "string",
            sourceEntry: "string",
            sourceDir: "string",
            keepSource: "boolean",
            enableDebugger: "boolean",
            debuggerProfile: "string",
            disableManifestModification: "boolean",
        };
        const optionalTypeSet = new Set(["debuggerProfile", "moduleUUID"]);

        for (const [key, expectedType] of Object.entries(typeMap)) {
            if (optionalTypeSet.has(key)) {
                this.ensureOptionalSettingType(key, expectedType);
                continue;
            }

            this.ensureSettingType(key, expectedType);
        }

        const requiresModuleUUID = !this.settings.disableManifestModification || this.settings.enableDebugger;

        if (requiresModuleUUID) {
            if (typeof this.settings.moduleUUID !== "string" || this.settings.moduleUUID.trim() === "") {
                throw new Error(`"moduleUUID" must be set when manifest modification or debugger support is enabled.`);
            }

            if (!TsCompileFilter.UUID_V4_PATTERN.test(this.settings.moduleUUID)) {
                throw new Error(`"${this.settings.moduleUUID}" is not a valid UUID v4 for "moduleUUID".`);
            }
        }

        if (Object.prototype.hasOwnProperty.call(this.settings.buildOptions, "entryPoints")) {
            throw new Error(
                `Do not set "buildOptions.entryPoints" directly. Tscompile manages entry points from "sourceDir" and "sourceEntry".`
            );
        }

        if (this.settings.enableDebugger && this.settings.buildOptions.minify !== false) {
            throw new Error(
                `"enableDebugger" requires "buildOptions.minify" to be false. Minecraft stack traces do not include generated column data, so runtime error mapping only works with non-minified output.`
            );
        }

        if (this.settings.enableDebugger && process.platform !== "win32") {
            throw new Error(`"enableDebugger" is currently supported only on Windows.`);
        }

        if (!this.settings.enableDebugger && Object.prototype.hasOwnProperty.call(this.settings, "debuggerProfile")) {
            throw new Error(`"debuggerProfile" is only valid when "enableDebugger" is true.`);
        }

        if (this.settings.enableDebugger) {
            this.validateDebuggerProfile();
        }

        if (path.posix.isAbsolute(this.settings.sourceEntry)) {
            throw new Error(`"sourceEntry" must be a relative path inside "sourceDir". Absolute paths are not supported.`);
        }

        if (!this.isScriptEntryPath(this.settings.sourceEntry)) {
            throw new Error(`"sourceEntry" must use one of these script extensions: ${TsCompileFilter.SUPPORTED_SCRIPT_EXTENSION_LIST}.`);
        }

        if (!FilterPaths.isSubPath(this.settings.sourceDir, this.getSourceEntryProjectPath())) {
            throw new Error(`"sourceEntry" must stay inside "sourceDir".`);
        }

        if (!FilterPaths.isSubPath(this.getScriptsProjectRoot(), this.settings.sourceDir) && this.settings.keepSource === false) {
            throw new Error(
                `When "keepSource" is false, "sourceDir" must stay inside "${this.getScriptsProjectRoot()}" because tscompile writes compiled files directly into that folder.`
            );
        }

        if (
            this.settings.keepSource === false &&
            FilterPaths.isSubPath(this.settings.sourceDir, this.toProjectScriptsPath(this.getDerivedOutputPath()))
        ) {
            throw new Error(
                `When "keepSource" is false, compiled output cannot be written inside "sourceDir" because tscompile removes that directory after compilation. Choose a narrower "sourceDir" or change "sourceEntry" so the output path stays outside the source tree.`
            );
        }

        if (!FilterPaths.isSubPath(this.getActiveDistDir(), this.getDerivedOutputPath())) {
            throw new Error(
                `The derived output path must stay inside the active output folder. Check your "sourceEntry" and "keepSource" settings.`
            );
        }

        if (this.settings.keepSource) {
            if (
                FilterPaths.isSubPath(this.getBehaviorPackProjectRoot(), this.settings.sourceDir) &&
                !FilterPaths.isSubPath(this.getScriptsProjectRoot(), this.settings.sourceDir)
            ) {
                throw new Error(
                    `When "keepSource" is true, "sourceDir" must stay outside "${this.getBehaviorPackProjectRoot()}" or inside a subfolder of "${this.getScriptsProjectRoot()}".`
                );
            }

            if (
                FilterPaths.isSubPath(this.settings.sourceDir, this.toProjectScriptsPath(this.getActiveDistDir())) ||
                FilterPaths.isSubPath(this.toProjectScriptsPath(this.getActiveDistDir()), this.settings.sourceDir)
            ) {
                throw new Error(
                    `When "keepSource" is true, "sourceDir" cannot overlap "${this.toProjectScriptsPath(this.getActiveDistDir())}" because that folder is reserved for compiled output.`
                );
            }
        }

        const sourceDirectoryPath = this.getSourceDirectoryPath();

        if (!fs.existsSync(sourceDirectoryPath)) {
            throw new Error(`Could not find "sourceDir" at "${this.settings.sourceDir}".`);
        }

        if (!fs.statSync(sourceDirectoryPath).isDirectory()) {
            throw new Error(`"sourceDir" must point to a directory, but "${this.settings.sourceDir}" is not a directory.`);
        }

        const sourceEntryPath = this.getSourceEntryPath();

        if (!fs.existsSync(sourceEntryPath)) {
            throw new Error(`Could not find "sourceEntry" at "${this.settings.sourceEntry}" inside "${this.settings.sourceDir}".`);
        }

        if (!fs.statSync(sourceEntryPath).isFile()) {
            throw new Error(`"sourceEntry" must point to a file, but "${this.settings.sourceEntry}" is not a file.`);
        }
    }

    /**
     * Ensures a setting matches its expected type.
     *
     * @param key - Setting key to validate.
     * @param expectedType - Expected type description.
     *
     * @throws If the value is the wrong type.
     */
    ensureSettingType(key: string, expectedType: string): void {
        const value = (this.settings as unknown as Record<string, unknown>)[key];

        if (expectedType === "array") {
            if (!Array.isArray(value)) {
                throw new TypeError(`Setting "${key}" must be an array.`);
            }

            return;
        }

        if (expectedType === "object") {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
                throw new TypeError(`Setting "${key}" must be an object.`);
            }

            return;
        }

        if (typeof value !== expectedType) {
            throw new TypeError(`Setting "${key}" must be a ${expectedType}.`);
        }
    }

    /**
     * Ensures an optional setting matches its expected type when present.
     *
     * @param key - Setting key to validate.
     * @param expectedType - Expected type description.
     *
     * @throws If the value is present with the wrong type.
     */
    ensureOptionalSettingType(key: string, expectedType: string): void {
        if (!Object.prototype.hasOwnProperty.call(this.settings, key)) {
            return;
        }

        if (typeof (this.settings as unknown as Record<string, unknown>)[key] !== expectedType) {
            throw new TypeError(`Setting "${key}" must be a ${expectedType}.`);
        }
    }

    /**
     * Validates debugger profile settings.
     *
     * @throws If `debuggerProfile` is missing, not a string, or cannot be resolved.
     */
    validateDebuggerProfile(): void {
        const debuggerProfile = this.settings.debuggerProfile;

        if (typeof debuggerProfile !== "string") {
            throw new TypeError(`"enableDebugger" requires "debuggerProfile" to be a string.`);
        }

        if (debuggerProfile.trim() === "") {
            throw new Error(`"enableDebugger" requires "debuggerProfile" to be set.`);
        }

        if (!this.exportResolver.resolveDebuggerExportConfig()) {
            throw new Error(
                `Could not resolve debugger export settings for profile "${debuggerProfile}". Set "debuggerProfile" to the same Regolith profile that contains this tscompile filter entry, and make sure that profile exists in "config.json" with an "export" object.`
            );
        }
    }

    /**
     * Applies the filter's internal esbuild entry points.
     *
     * @throws If no supported script files are found for a split build.
     */
    configureEntryPoint(): void {
        if (this.settings.buildOptions.bundle !== false) {
            this.settings.buildOptions.entryPoints = [this.getSourceEntryProjectPath()];
            this.entrySourceAnalysis = null;
            return;
        }

        const entryPattern = FilterPaths.joinRelativePath(this.settings.sourceDir, "**/*.{cjs,cts,js,mjs,mts,ts}");
        const entryPoints = globSync(entryPattern, {
            cwd: this.projectRoot,
            nodir: true,
        })
            .map((match) => FilterPaths.normalizeRelativePath(match))
            .filter((entryPoint) => this.isScriptEntryPath(entryPoint));

        if (entryPoints.length === 0) {
            throw new Error(
                `No supported script files were found inside "${this.settings.sourceDir}". Tscompile looks for ${TsCompileFilter.SUPPORTED_SCRIPT_EXTENSION_LIST}.`
            );
        }

        this.settings.buildOptions.entryPoints = [...new Set(entryPoints)];
        this.entrySourceAnalysis = null;
    }

    /**
     * Reads split-build source entries once and caches their validation metadata.
     *
     * @returns Cached entry analysis records.
     */
    analyzeSplitBuildEntries(): EntryAnalysis[] {
        if (this.settings.buildOptions.bundle !== false) {
            return [];
        }

        if (this.entrySourceAnalysis) {
            return this.entrySourceAnalysis;
        }

        const entryPoints = Array.isArray(this.settings.buildOptions.entryPoints)
            ? (this.settings.buildOptions.entryPoints as string[])
            : [];

        this.entrySourceAnalysis = entryPoints.map((entryPoint) => {
            const sourcePath = path.resolve(this.projectRoot, entryPoint);
            const sourceContent = fs.readFileSync(sourcePath, "utf8");

            return {
                entryPoint,
                hasCommonJs: TsCompileFilter.COMMON_JS_PATTERN.test(sourceContent),
                hasJsonImport: TsCompileFilter.JSON_IMPORT_PATTERN.test(sourceContent),
            };
        });

        return this.entrySourceAnalysis;
    }

    /**
     * Rejects unsupported import and module syntax for split builds.
     *
     * @throws If a split-build source file uses unsupported syntax.
     */
    validateSplitBuildEntries(): void {
        if (this.settings.buildOptions.bundle !== false) {
            return;
        }

        for (const entryAnalysis of this.analyzeSplitBuildEntries()) {
            if (entryAnalysis.hasJsonImport) {
                throw new Error(
                    `Found a ".json" import in "${entryAnalysis.entryPoint}" while "buildOptions.bundle" is false. JSON imports require bundling, so either remove the import or set "buildOptions.bundle" to true.`
                );
            }

            if (entryAnalysis.hasCommonJs) {
                this.logger.warn(
                    `Possible CommonJS syntax detected in "${entryAnalysis.entryPoint}" while "buildOptions.bundle" is false. Minecraft behavior pack scripts are expected to use ESM. The file may compile but still fail to load in game.`
                );
            }
        }
    }

    /**
     * Applies module dependencies to build externals.
     */
    applyExternalModules(): void {
        if (this.settings.buildOptions.bundle === false) {
            delete this.settings.buildOptions.external;
            return;
        }

        const externalModules = Array.isArray(this.settings.buildOptions.external) ? [...this.settings.buildOptions.external] : [];

        for (const moduleDefinition of this.parseModules()) {
            if (!externalModules.includes(moduleDefinition.name)) {
                externalModules.push(moduleDefinition.name);
            }
        }

        this.settings.buildOptions.external = externalModules;
    }

    /**
     * Parses module dependency definitions.
     *
     * @returns Parsed module definitions.
     *
     * @throws If a module string is invalid.
     */
    parseModules(): ModuleDefinition[] {
        if (this.parsedModules) {
            return this.parsedModules;
        }

        this.parsedModules = this.settings.modules.map((moduleDefinition) => {
            const match = /^(@minecraft\/[A-Za-z0-9-]+)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$/.exec(
                moduleDefinition
            );

            if (!match) {
                throw new Error(
                    `Invalid module entry "${moduleDefinition}" in "modules". Use the format "@minecraft/<name>@<version>", for example "@minecraft/server@2.0.0".`
                );
            }

            return {
                name: match[1],
                version: match[2],
            };
        });

        return this.parsedModules;
    }

    /**
     * Updates the behavior pack manifest when enabled.
     *
     * @throws If the manifest contains conflicting module data.
     */
    updateManifest(): void {
        if (this.settings.disableManifestModification) {
            this.logger.info("Skipping manifest modification.");
            return;
        }

        this.logger.info(`Updating manifest "${TsCompileFilter.MANIFEST_PATH}".`);
        const manifestPath = FilterPaths.toAbsolutePath(this.cwd, TsCompileFilter.MANIFEST_PATH);
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
        const originalManifest = JSON.stringify(manifest);
        const parsedModules = this.parseModules();

        if (!Array.isArray(manifest.dependencies)) {
            manifest.dependencies = [];
        }

        const dependencyList = manifest.dependencies as Array<Record<string, unknown>>;

        for (const moduleDefinition of parsedModules) {
            const existingDependency = dependencyList.find((dependency) => {
                return dependency && typeof dependency === "object" && dependency.module_name === moduleDefinition.name;
            });

            if (existingDependency) {
                if (existingDependency.version !== moduleDefinition.version) {
                    throw new Error(
                        `BP/manifest.json already lists "${moduleDefinition.name}" with version "${existingDependency.version as string}", but tscompile was asked for version "${moduleDefinition.version}". Update one side so they match.`
                    );
                }

                continue;
            }

            dependencyList.push({
                module_name: moduleDefinition.name,
                version: moduleDefinition.version,
            });
        }

        if (!Array.isArray(manifest.modules)) {
            manifest.modules = [];
        }

        const moduleList = manifest.modules as Array<Record<string, unknown>>;
        const manifestEntry = FilterPaths.toManifestPath(this.toScriptsProjectPath(this.getDerivedOutputPath()));
        const existingModule = moduleList.find((moduleDefinition) => moduleDefinition.type === TsCompileFilter.MODULE_TYPE);

        if (existingModule) {
            if (existingModule.uuid !== this.settings.moduleUUID || existingModule.entry !== manifestEntry) {
                throw new Error(
                    `BP/manifest.json already contains a "${TsCompileFilter.MODULE_TYPE}" module, but its "uuid" or "entry" does not match this filter's settings.`
                );
            }
        } else {
            moduleList.push({
                description: "Scripting module",
                entry: manifestEntry,
                language: TsCompileFilter.MODULE_LANGUAGE,
                type: TsCompileFilter.MODULE_TYPE,
                uuid: this.settings.moduleUUID,
                version: manifest.format_version === 3 ? "0.0.1" : [0, 0, 1],
            });
        }

        if (JSON.stringify(manifest) === originalManifest) {
            this.logger.info("Manifest already up to date.");
            return;
        }

        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }

    /**
     * Determines whether source cleanup should run.
     *
     * @returns `true` when the source directory exists and should be removed.
     */
    shouldRemoveSourceDirectory(): boolean {
        if (this.settings.keepSource) {
            return false;
        }

        const sourceDirectory = this.getWorkspaceSourceDirectoryPath();

        return fs.existsSync(sourceDirectory);
    }

    /**
     * Removes the source directory after compilation when configured.
     */
    removeSourceDirectory(): void {
        const sourceDirectory = this.getWorkspaceSourceDirectoryPath();

        if (!fs.existsSync(sourceDirectory)) {
            return;
        }

        fs.rmSync(sourceDirectory, { force: true, recursive: true });
        this.logger.info(`Removed source directory "${this.settings.sourceDir}".`);
    }

    /**
     * Gets the absolute compiled output path.
     *
     * @returns Absolute output file path.
     */
    getCompiledOutputPath(): string {
        return this.ensureResolvedPaths().compiledOutputPath;
    }

    /**
     * Gets the absolute compiled output directory.
     *
     * @returns Absolute output directory path.
     */
    getCompiledOutputDirectoryPath(): string {
        return FilterPaths.toAbsolutePath(this.cwd, this.toScriptsProjectPath(this.getActiveDistDir()));
    }

    /**
     * Gets the active distribution directory for the current settings.
     *
     * @returns Active distribution directory path.
     */
    getActiveDistDir(): string {
        return this.ensureResolvedPaths().activeDistDir;
    }

    /**
     * Derives the runtime JavaScript output path from the configured source entry.
     *
     * @returns Derived output path relative to `BP/scripts`.
     */
    getDerivedOutputPath(): string {
        return this.ensureResolvedPaths().derivedOutputPath;
    }

    /**
     * Gets the compiled JavaScript outputs that need debugger post-processing.
     *
     * @returns Absolute output file paths.
     */
    getDebuggerOutputPaths(): string[] {
        if (this.emittedOutputPaths.length > 0) {
            return this.emittedOutputPaths;
        }

        return [this.getCompiledOutputPath()];
    }

    /**
     * Resolves a compiled output path back to the `BP/scripts`-relative output path.
     *
     * @param compiledOutputPath - Absolute output file path.
     *
     * @returns Output path relative to `BP/scripts`.
     *
     * @throws If the output is outside the scripts root.
     */
    getDerivedOutputPathForCompiledOutput(compiledOutputPath: string): string {
        const scriptsRootPath = FilterPaths.toAbsolutePath(this.cwd, TsCompileFilter.SCRIPTS_ROOT);
        const relativeOutputPath = this.extractScriptsRelativeOutputPath(compiledOutputPath, scriptsRootPath);

        if (relativeOutputPath === "" || relativeOutputPath.startsWith("../") || path.isAbsolute(relativeOutputPath)) {
            throw new Error(`Expected a compiled output inside "${TsCompileFilter.SCRIPTS_ROOT}", but received "${compiledOutputPath}".`);
        }

        return relativeOutputPath;
    }

    /**
     * Extracts an output path relative to `BP/scripts`, even when tool output includes a duplicated temp prefix.
     *
     * @param compiledOutputPath - Absolute output file path.
     * @param scriptsRootPath - Absolute `BP/scripts` root path for the current workspace.
     *
     * @returns Output path relative to `BP/scripts`.
     */
    extractScriptsRelativeOutputPath(compiledOutputPath: string, scriptsRootPath: string): string {
        const directRelativePath = FilterPaths.normalizeRelativePath(path.relative(scriptsRootPath, compiledOutputPath));

        if (directRelativePath !== "" && !directRelativePath.startsWith("../") && !path.isAbsolute(directRelativePath)) {
            return directRelativePath;
        }

        const normalizedCompiledOutputPath = FilterPaths.normalizeRelativePath(compiledOutputPath);
        const scriptsRootMarker = `${TsCompileFilter.SCRIPTS_ROOT}/`;
        const scriptsRootIndex = normalizedCompiledOutputPath.lastIndexOf(scriptsRootMarker);

        if (scriptsRootIndex === -1) {
            return directRelativePath;
        }

        return FilterPaths.normalizeRelativePath(normalizedCompiledOutputPath.slice(scriptsRootIndex + scriptsRootMarker.length));
    }

    /**
     * Gets the full project-relative source entry path.
     *
     * @returns Project-relative source entry path.
     */
    getSourceEntryProjectPath(): string {
        return this.ensureResolvedPaths().sourceEntryProjectPath;
    }

    /**
     * Gets the absolute source directory path from the project root.
     *
     * @returns Absolute source directory path.
     */
    getSourceDirectoryPath(): string {
        return path.resolve(this.projectRoot, this.settings.sourceDir);
    }

    /**
     * Gets the absolute source entry path from the project root.
     *
     * @returns Absolute source entry path.
     */
    getSourceEntryPath(): string {
        return path.resolve(this.projectRoot, this.getSourceEntryProjectPath());
    }

    /**
     * Gets the source directory path inside the temp export workspace.
     *
     * @returns Absolute workspace source directory path.
     */
    getWorkspaceSourceDirectoryPath(): string {
        return FilterPaths.toAbsolutePath(this.cwd, this.settings.sourceDir);
    }

    /**
     * Gets the configured behavior-pack root path from the project config.
     *
     * @returns Project-relative behavior-pack root path.
     */
    getBehaviorPackProjectRoot(): string {
        return this.exportResolver.resolveBehaviorPackProjectPath();
    }

    /**
     * Gets the configured scripts root inside the local behavior pack.
     *
     * @returns Project-relative scripts root path.
     */
    getScriptsProjectRoot(): string {
        return this.exportResolver.normalizeBehaviorPackProjectPath(TsCompileFilter.SCRIPTS_ROOT);
    }

    /**
     * Converts a scripts-relative path into a local project path.
     *
     * @param relativePath - Path relative to the local scripts root.
     *
     * @returns Project-relative local path.
     */
    toProjectScriptsPath(relativePath: string): string {
        return FilterPaths.joinRelativePath(this.getScriptsProjectRoot(), relativePath);
    }

    /**
     * Determines whether a path is a supported script source file.
     *
     * @param relativePath - Relative path to validate.
     *
     * @returns `true` when the path is a supported script source file.
     */
    isScriptEntryPath(relativePath: string): boolean {
        return (
            TsCompileFilter.SCRIPT_ENTRY_PATTERN.test(relativePath) && !TsCompileFilter.TYPESCRIPT_DECLARATION_PATTERN.test(relativePath)
        );
    }

    /**
     * Converts a scripts-relative path into a project-relative path.
     *
     * @param relativePath - Path relative to the output `BP/scripts` root.
     *
     * @returns Project-relative path.
     */
    toScriptsProjectPath(relativePath: string): string {
        return FilterPaths.joinRelativePath(TsCompileFilter.SCRIPTS_ROOT, relativePath);
    }
}
