"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const module_1 = require("module");
const glob_1 = require("glob");
const DebuggerLaunchConfig_1 = __importDefault(require("./DebuggerLaunchConfig"));
const EsbuildCompiler_1 = __importDefault(require("./EsbuildCompiler"));
const FilterLogger_1 = __importDefault(require("./FilterLogger"));
const FilterTiming_1 = __importDefault(require("./FilterTiming"));
const FilterPaths_1 = __importDefault(require("./FilterPaths"));
const ProjectExportResolver_1 = __importDefault(require("./ProjectExportResolver"));
const RuntimeSourceMapInjector_1 = __importDefault(require("./RuntimeSourceMapInjector"));
/**
 * Coordinates the tscompile Regolith filter lifecycle.
 */
class TsCompileFilter {
    static FILTER_IDENTIFIER = "tscompile";
    static BEHAVIOR_PACK_ROOT = "BP";
    static MANIFEST_PATH = "BP/manifest.json";
    static MODULE_LANGUAGE = "javascript";
    static MODULE_TYPE = "script";
    static CONFIG_FILENAME = "tscompile.config.js";
    static SCRIPTS_ROOT = "BP/scripts";
    static DEFAULT_SOURCE_DIR = "BP/scripts/src";
    static DEFAULT_SOURCE_ENTRY = "main.ts";
    static SUPPORTED_SCRIPT_EXTENSION_LIST = ".ts, .mts, .cts, .js, .mjs, and .cjs";
    static UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    static TYPESCRIPT_DECLARATION_PATTERN = /\.d\.(?:cts|mts|ts)$/i;
    static SCRIPT_ENTRY_PATTERN = /\.(?:cjs|cts|js|mjs|mts|ts)$/i;
    static JSON_IMPORT_PATTERN = /\b(?:import|export)\b[\s\S]*?from\s*["'][^"']+\.json["']|\bimport\s*\(\s*["'][^"']+\.json["']\s*\)|\brequire\s*\(\s*["'][^"']+\.json["']\s*\)/;
    static COMMON_JS_PATTERN = /\brequire\s*\(|\bmodule\.exports\b|\bexports\.(?!default\b)|\bexports\s*\[/;
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
    /** Export path resolver used for debugger support. */
    exportResolver;
    /** esbuild compiler wrapper. */
    compiler;
    /** Debugger launch configuration manager. */
    debuggerLaunchManager;
    /** Runtime sourcemap injector. */
    runtimeSourceMaps;
    /** Cached parsed module definitions. */
    parsedModules;
    /** Cached derived path values. */
    resolvedPaths;
    /** Cached split-build entry analysis. */
    entrySourceAnalysis;
    /** Absolute paths to emitted JavaScript outputs. */
    emittedOutputPaths;
    /**
     * Creates the filter instance.
     *
     * @param cwd - Current working directory.
     * @param projectRoot - Absolute Regolith project root path.
     * @param rawSettings - Raw JSON settings passed to the filter.
     */
    constructor(cwd, projectRoot, rawSettings) {
        this.cwd = cwd;
        this.projectRoot = projectRoot;
        this.rawSettings =
            rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {};
        this.logger = new FilterLogger_1.default();
        this.timing = new FilterTiming_1.default(this.logger);
        this.settings = this.createSettings(this.rawSettings);
        this.exportResolver = new ProjectExportResolver_1.default({
            projectRoot: this.projectRoot,
            settings: this.settings,
        });
        this.compiler = new EsbuildCompiler_1.default(this.logger, this.cwd, this.projectRoot, this.exportResolver);
        this.debuggerLaunchManager = new DebuggerLaunchConfig_1.default({
            exportResolver: this.exportResolver,
            getCompiledOutputPath: () => this.getCompiledOutputPath(),
            getDerivedOutputPath: () => this.getDerivedOutputPath(),
            logger: this.logger,
            projectRoot: this.projectRoot,
            settings: this.settings,
            toScriptsProjectPath: (relativePath) => this.toScriptsProjectPath(relativePath),
        });
        this.runtimeSourceMaps = new RuntimeSourceMapInjector_1.default({
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
    async run() {
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
    prepareBuild() {
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
    updateProjectFiles() {
        if (this.settings.enableDebugger) {
            this.debuggerLaunchManager.ensureLaunchConfiguration();
        }
        this.updateManifest();
    }
    /**
     * Applies post-build output adjustments and cleanup.
     */
    async finalizeBuild() {
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
    createSettings(rawSettings) {
        const rawBuildOptions = rawSettings.buildOptions && typeof rawSettings.buildOptions === "object" && !Array.isArray(rawSettings.buildOptions)
            ? rawSettings.buildOptions
            : {};
        const defaults = {
            buildOptions: {
                bundle: true,
                external: [],
                minify: true,
            },
            modules: ["@minecraft/server@2.0.0"],
            sourceDir: TsCompileFilter.DEFAULT_SOURCE_DIR,
            sourceEntry: TsCompileFilter.DEFAULT_SOURCE_ENTRY,
            keepSource: false,
            enableDebugger: false,
            disableManifestModification: false,
        };
        const settings = { ...defaults, ...rawSettings };
        settings.buildOptions = { ...defaults.buildOptions, ...rawBuildOptions };
        return settings;
    }
    /**
     * Normalizes mutable path settings after config overrides are applied.
     */
    normalizeSettings() {
        this.settings.sourceEntry = FilterPaths_1.default.normalizeRelativePath(this.settings.sourceEntry);
        this.settings.sourceDir = FilterPaths_1.default.normalizeRelativePath(this.settings.sourceDir);
    }
    /**
     * Clears computed values that depend on mutable settings.
     */
    resetComputedState() {
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
    ensureResolvedPaths() {
        if (this.resolvedPaths) {
            return this.resolvedPaths;
        }
        const activeDistDir = this.settings.keepSource ? "dist" : ".";
        const sourceEntryProjectPath = FilterPaths_1.default.joinRelativePath(this.settings.sourceDir, this.settings.sourceEntry);
        const outputRelativePath = this.settings.sourceEntry.replace(/\.[^./]+$/, ".js");
        const derivedOutputPath = this.settings.keepSource ? FilterPaths_1.default.joinRelativePath("dist", outputRelativePath) : outputRelativePath;
        this.resolvedPaths = {
            activeDistDir,
            compiledOutputPath: FilterPaths_1.default.toAbsolutePath(this.cwd, this.toScriptsProjectPath(derivedOutputPath)),
            derivedOutputPath,
            sourceEntryProjectPath,
        };
        return this.resolvedPaths;
    }
    /**
     * Loads the optional root-level `tscompile.config.js` override.
     */
    loadConfigFile() {
        const configPath = path_1.default.resolve(this.projectRoot, TsCompileFilter.CONFIG_FILENAME);
        if (!fs_1.default.existsSync(configPath)) {
            return;
        }
        const requireConfig = (0, module_1.createRequire)(__filename);
        const loadedConfig = requireConfig(configPath);
        const configModule = loadedConfig && typeof loadedConfig === "object" ? loadedConfig : null;
        const config = configModule && typeof configModule.config === "function"
            ? configModule.config
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
    configureBuildOutputPaths() {
        const bundle = this.settings.buildOptions.bundle !== false;
        const outputPath = this.getDerivedOutputPath();
        delete this.settings.buildOptions.outdir;
        delete this.settings.buildOptions.outfile;
        if (bundle) {
            this.settings.buildOptions.outfile = this.getCompiledOutputPath();
            return;
        }
        if (!FilterPaths_1.default.isSubPath(this.getActiveDistDir(), outputPath)) {
            throw new Error(`When "buildOptions.bundle" is false, the compiled output path must stay inside the active output folder. Check your "sourceEntry" and "keepSource" settings.`);
        }
        this.settings.buildOptions.outdir = this.getCompiledOutputDirectoryPath();
    }
    /**
     * Validates the current filter settings.
     *
     * @throws If setting types or values are invalid.
     */
    validateSettings() {
        const typeMap = {
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
            throw new Error(`Do not set "buildOptions.entryPoints" directly. Tscompile manages entry points from "sourceDir" and "sourceEntry".`);
        }
        if (this.settings.enableDebugger && this.settings.buildOptions.minify !== false) {
            throw new Error(`"enableDebugger" requires "buildOptions.minify" to be false. Minecraft stack traces do not include generated column data, so runtime error mapping only works with non-minified output.`);
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
        if (path_1.default.posix.isAbsolute(this.settings.sourceEntry)) {
            throw new Error(`"sourceEntry" must be a relative path inside "sourceDir". Absolute paths are not supported.`);
        }
        if (!this.isScriptEntryPath(this.settings.sourceEntry)) {
            throw new Error(`"sourceEntry" must use one of these script extensions: ${TsCompileFilter.SUPPORTED_SCRIPT_EXTENSION_LIST}.`);
        }
        if (!FilterPaths_1.default.isSubPath(this.settings.sourceDir, this.getSourceEntryProjectPath())) {
            throw new Error(`"sourceEntry" must stay inside "sourceDir".`);
        }
        if (!FilterPaths_1.default.isSubPath(this.getScriptsProjectRoot(), this.settings.sourceDir) && this.settings.keepSource === false) {
            throw new Error(`When "keepSource" is false, "sourceDir" must stay inside "${this.getScriptsProjectRoot()}" because tscompile writes compiled files directly into that folder.`);
        }
        if (this.settings.keepSource === false &&
            FilterPaths_1.default.isSubPath(this.settings.sourceDir, this.toProjectScriptsPath(this.getDerivedOutputPath()))) {
            throw new Error(`When "keepSource" is false, compiled output cannot be written inside "sourceDir" because tscompile removes that directory after compilation. Choose a narrower "sourceDir" or change "sourceEntry" so the output path stays outside the source tree.`);
        }
        if (!FilterPaths_1.default.isSubPath(this.getActiveDistDir(), this.getDerivedOutputPath())) {
            throw new Error(`The derived output path must stay inside the active output folder. Check your "sourceEntry" and "keepSource" settings.`);
        }
        if (this.settings.keepSource) {
            if (FilterPaths_1.default.isSubPath(this.getBehaviorPackProjectRoot(), this.settings.sourceDir) &&
                !FilterPaths_1.default.isSubPath(this.getScriptsProjectRoot(), this.settings.sourceDir)) {
                throw new Error(`When "keepSource" is true, "sourceDir" must stay outside "${this.getBehaviorPackProjectRoot()}" or inside a subfolder of "${this.getScriptsProjectRoot()}".`);
            }
            if (FilterPaths_1.default.isSubPath(this.settings.sourceDir, this.toProjectScriptsPath(this.getActiveDistDir())) ||
                FilterPaths_1.default.isSubPath(this.toProjectScriptsPath(this.getActiveDistDir()), this.settings.sourceDir)) {
                throw new Error(`When "keepSource" is true, "sourceDir" cannot overlap "${this.toProjectScriptsPath(this.getActiveDistDir())}" because that folder is reserved for compiled output.`);
            }
        }
        const sourceDirectoryPath = this.getSourceDirectoryPath();
        if (!fs_1.default.existsSync(sourceDirectoryPath)) {
            throw new Error(`Could not find "sourceDir" at "${this.settings.sourceDir}".`);
        }
        if (!fs_1.default.statSync(sourceDirectoryPath).isDirectory()) {
            throw new Error(`"sourceDir" must point to a directory, but "${this.settings.sourceDir}" is not a directory.`);
        }
        const sourceEntryPath = this.getSourceEntryPath();
        if (!fs_1.default.existsSync(sourceEntryPath)) {
            throw new Error(`Could not find "sourceEntry" at "${this.settings.sourceEntry}" inside "${this.settings.sourceDir}".`);
        }
        if (!fs_1.default.statSync(sourceEntryPath).isFile()) {
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
    ensureSettingType(key, expectedType) {
        const value = this.settings[key];
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
    ensureOptionalSettingType(key, expectedType) {
        if (!Object.prototype.hasOwnProperty.call(this.settings, key)) {
            return;
        }
        if (typeof this.settings[key] !== expectedType) {
            throw new TypeError(`Setting "${key}" must be a ${expectedType}.`);
        }
    }
    /**
     * Validates debugger profile settings.
     *
     * @throws If `debuggerProfile` is missing, not a string, or cannot be resolved.
     */
    validateDebuggerProfile() {
        const debuggerProfile = this.settings.debuggerProfile;
        if (typeof debuggerProfile !== "string") {
            throw new TypeError(`"enableDebugger" requires "debuggerProfile" to be a string.`);
        }
        if (debuggerProfile.trim() === "") {
            throw new Error(`"enableDebugger" requires "debuggerProfile" to be set.`);
        }
        if (!this.exportResolver.resolveDebuggerExportConfig()) {
            throw new Error(`Could not resolve debugger export settings for profile "${debuggerProfile}". Set "debuggerProfile" to the same Regolith profile that contains this tscompile filter entry, and make sure that profile exists in "config.json" with an "export" object.`);
        }
    }
    /**
     * Applies the filter's internal esbuild entry points.
     *
     * @throws If no supported script files are found for a split build.
     */
    configureEntryPoint() {
        if (this.settings.buildOptions.bundle !== false) {
            this.settings.buildOptions.entryPoints = [this.getSourceEntryProjectPath()];
            this.entrySourceAnalysis = null;
            return;
        }
        const entryPattern = FilterPaths_1.default.joinRelativePath(this.settings.sourceDir, "**/*.{cjs,cts,js,mjs,mts,ts}");
        const entryPoints = (0, glob_1.globSync)(entryPattern, {
            cwd: this.projectRoot,
            nodir: true,
        })
            .map((match) => FilterPaths_1.default.normalizeRelativePath(match))
            .filter((entryPoint) => this.isScriptEntryPath(entryPoint));
        if (entryPoints.length === 0) {
            throw new Error(`No supported script files were found inside "${this.settings.sourceDir}". Tscompile looks for ${TsCompileFilter.SUPPORTED_SCRIPT_EXTENSION_LIST}.`);
        }
        this.settings.buildOptions.entryPoints = [...new Set(entryPoints)];
        this.entrySourceAnalysis = null;
    }
    /**
     * Reads split-build source entries once and caches their validation metadata.
     *
     * @returns Cached entry analysis records.
     */
    analyzeSplitBuildEntries() {
        if (this.settings.buildOptions.bundle !== false) {
            return [];
        }
        if (this.entrySourceAnalysis) {
            return this.entrySourceAnalysis;
        }
        const entryPoints = Array.isArray(this.settings.buildOptions.entryPoints)
            ? this.settings.buildOptions.entryPoints
            : [];
        this.entrySourceAnalysis = entryPoints.map((entryPoint) => {
            const sourcePath = path_1.default.resolve(this.projectRoot, entryPoint);
            const sourceContent = fs_1.default.readFileSync(sourcePath, "utf8");
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
    validateSplitBuildEntries() {
        if (this.settings.buildOptions.bundle !== false) {
            return;
        }
        for (const entryAnalysis of this.analyzeSplitBuildEntries()) {
            if (entryAnalysis.hasJsonImport) {
                throw new Error(`Found a ".json" import in "${entryAnalysis.entryPoint}" while "buildOptions.bundle" is false. JSON imports require bundling, so either remove the import or set "buildOptions.bundle" to true.`);
            }
            if (entryAnalysis.hasCommonJs) {
                this.logger.warn(`Possible CommonJS syntax detected in "${entryAnalysis.entryPoint}" while "buildOptions.bundle" is false. Minecraft behavior pack scripts are expected to use ESM. The file may compile but still fail to load in game.`);
            }
        }
    }
    /**
     * Applies module dependencies to build externals.
     */
    applyExternalModules() {
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
    parseModules() {
        if (this.parsedModules) {
            return this.parsedModules;
        }
        this.parsedModules = this.settings.modules.map((moduleDefinition) => {
            const match = /^(@minecraft\/[A-Za-z0-9-]+)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$/.exec(moduleDefinition);
            if (!match) {
                throw new Error(`Invalid module entry "${moduleDefinition}" in "modules". Use the format "@minecraft/<name>@<version>", for example "@minecraft/server@2.0.0".`);
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
    updateManifest() {
        if (this.settings.disableManifestModification) {
            this.logger.info("Skipping manifest modification.");
            return;
        }
        this.logger.info(`Updating manifest "${TsCompileFilter.MANIFEST_PATH}".`);
        const manifestPath = FilterPaths_1.default.toAbsolutePath(this.cwd, TsCompileFilter.MANIFEST_PATH);
        const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, "utf8"));
        const originalManifest = JSON.stringify(manifest);
        const parsedModules = this.parseModules();
        if (!Array.isArray(manifest.dependencies)) {
            manifest.dependencies = [];
        }
        const dependencyList = manifest.dependencies;
        for (const moduleDefinition of parsedModules) {
            const existingDependency = dependencyList.find((dependency) => {
                return dependency && typeof dependency === "object" && dependency.module_name === moduleDefinition.name;
            });
            if (existingDependency) {
                if (existingDependency.version !== moduleDefinition.version) {
                    throw new Error(`BP/manifest.json already lists "${moduleDefinition.name}" with version "${existingDependency.version}", but tscompile was asked for version "${moduleDefinition.version}". Update one side so they match.`);
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
        const moduleList = manifest.modules;
        const manifestEntry = FilterPaths_1.default.toManifestPath(this.toScriptsProjectPath(this.getDerivedOutputPath()));
        const existingModule = moduleList.find((moduleDefinition) => moduleDefinition.type === TsCompileFilter.MODULE_TYPE);
        if (existingModule) {
            if (existingModule.uuid !== this.settings.moduleUUID || existingModule.entry !== manifestEntry) {
                throw new Error(`BP/manifest.json already contains a "${TsCompileFilter.MODULE_TYPE}" module, but its "uuid" or "entry" does not match this filter's settings.`);
            }
        }
        else {
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
        fs_1.default.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    /**
     * Determines whether source cleanup should run.
     *
     * @returns `true` when the source directory exists and should be removed.
     */
    shouldRemoveSourceDirectory() {
        if (this.settings.keepSource) {
            return false;
        }
        const sourceDirectory = this.getWorkspaceSourceDirectoryPath();
        return fs_1.default.existsSync(sourceDirectory);
    }
    /**
     * Removes the source directory after compilation when configured.
     */
    removeSourceDirectory() {
        const sourceDirectory = this.getWorkspaceSourceDirectoryPath();
        if (!fs_1.default.existsSync(sourceDirectory)) {
            return;
        }
        fs_1.default.rmSync(sourceDirectory, { force: true, recursive: true });
        this.logger.info(`Removed source directory "${this.settings.sourceDir}".`);
    }
    /**
     * Gets the absolute compiled output path.
     *
     * @returns Absolute output file path.
     */
    getCompiledOutputPath() {
        return this.ensureResolvedPaths().compiledOutputPath;
    }
    /**
     * Gets the absolute compiled output directory.
     *
     * @returns Absolute output directory path.
     */
    getCompiledOutputDirectoryPath() {
        return FilterPaths_1.default.toAbsolutePath(this.cwd, this.toScriptsProjectPath(this.getActiveDistDir()));
    }
    /**
     * Gets the active distribution directory for the current settings.
     *
     * @returns Active distribution directory path.
     */
    getActiveDistDir() {
        return this.ensureResolvedPaths().activeDistDir;
    }
    /**
     * Derives the runtime JavaScript output path from the configured source entry.
     *
     * @returns Derived output path relative to `BP/scripts`.
     */
    getDerivedOutputPath() {
        return this.ensureResolvedPaths().derivedOutputPath;
    }
    /**
     * Gets the compiled JavaScript outputs that need debugger post-processing.
     *
     * @returns Absolute output file paths.
     */
    getDebuggerOutputPaths() {
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
    getDerivedOutputPathForCompiledOutput(compiledOutputPath) {
        const scriptsRootPath = FilterPaths_1.default.toAbsolutePath(this.cwd, TsCompileFilter.SCRIPTS_ROOT);
        const relativeOutputPath = this.extractScriptsRelativeOutputPath(compiledOutputPath, scriptsRootPath);
        if (relativeOutputPath === "" || relativeOutputPath.startsWith("../") || path_1.default.isAbsolute(relativeOutputPath)) {
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
    extractScriptsRelativeOutputPath(compiledOutputPath, scriptsRootPath) {
        const directRelativePath = FilterPaths_1.default.normalizeRelativePath(path_1.default.relative(scriptsRootPath, compiledOutputPath));
        if (directRelativePath !== "" && !directRelativePath.startsWith("../") && !path_1.default.isAbsolute(directRelativePath)) {
            return directRelativePath;
        }
        const normalizedCompiledOutputPath = FilterPaths_1.default.normalizeRelativePath(compiledOutputPath);
        const scriptsRootMarker = `${TsCompileFilter.SCRIPTS_ROOT}/`;
        const scriptsRootIndex = normalizedCompiledOutputPath.lastIndexOf(scriptsRootMarker);
        if (scriptsRootIndex === -1) {
            return directRelativePath;
        }
        return FilterPaths_1.default.normalizeRelativePath(normalizedCompiledOutputPath.slice(scriptsRootIndex + scriptsRootMarker.length));
    }
    /**
     * Gets the full project-relative source entry path.
     *
     * @returns Project-relative source entry path.
     */
    getSourceEntryProjectPath() {
        return this.ensureResolvedPaths().sourceEntryProjectPath;
    }
    /**
     * Gets the absolute source directory path from the project root.
     *
     * @returns Absolute source directory path.
     */
    getSourceDirectoryPath() {
        return path_1.default.resolve(this.projectRoot, this.settings.sourceDir);
    }
    /**
     * Gets the absolute source entry path from the project root.
     *
     * @returns Absolute source entry path.
     */
    getSourceEntryPath() {
        return path_1.default.resolve(this.projectRoot, this.getSourceEntryProjectPath());
    }
    /**
     * Gets the source directory path inside the temp export workspace.
     *
     * @returns Absolute workspace source directory path.
     */
    getWorkspaceSourceDirectoryPath() {
        return FilterPaths_1.default.toAbsolutePath(this.cwd, this.settings.sourceDir);
    }
    /**
     * Gets the configured behavior-pack root path from the project config.
     *
     * @returns Project-relative behavior-pack root path.
     */
    getBehaviorPackProjectRoot() {
        return this.exportResolver.resolveBehaviorPackProjectPath();
    }
    /**
     * Gets the configured scripts root inside the local behavior pack.
     *
     * @returns Project-relative scripts root path.
     */
    getScriptsProjectRoot() {
        return this.exportResolver.normalizeBehaviorPackProjectPath(TsCompileFilter.SCRIPTS_ROOT);
    }
    /**
     * Converts a scripts-relative path into a local project path.
     *
     * @param relativePath - Path relative to the local scripts root.
     *
     * @returns Project-relative local path.
     */
    toProjectScriptsPath(relativePath) {
        return FilterPaths_1.default.joinRelativePath(this.getScriptsProjectRoot(), relativePath);
    }
    /**
     * Determines whether a path is a supported script source file.
     *
     * @param relativePath - Relative path to validate.
     *
     * @returns `true` when the path is a supported script source file.
     */
    isScriptEntryPath(relativePath) {
        return (TsCompileFilter.SCRIPT_ENTRY_PATTERN.test(relativePath) && !TsCompileFilter.TYPESCRIPT_DECLARATION_PATTERN.test(relativePath));
    }
    /**
     * Converts a scripts-relative path into a project-relative path.
     *
     * @param relativePath - Path relative to the output `BP/scripts` root.
     *
     * @returns Project-relative path.
     */
    toScriptsProjectPath(relativePath) {
        return FilterPaths_1.default.joinRelativePath(TsCompileFilter.SCRIPTS_ROOT, relativePath);
    }
}
exports.default = TsCompileFilter;
