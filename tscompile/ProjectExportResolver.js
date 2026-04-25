const fs = require("fs");
const path = require("path");
const FilterPaths = require("./FilterPaths.js");
const JsoncDocument = require("./JsoncDocument.js");

/**
 * Resolves Regolith export paths for debugger support.
 */
class ProjectExportResolver {
  static DEFAULT_BEHAVIOR_PACK_ROOT = "BP";

  /**
   * Creates the export resolver.
   *
   * @param {{
   *   projectRoot: string;
   *   settings: Record<string, any>;
   * }} options - Resolver dependencies and runtime state.
   */
  constructor(options) {
    this.projectRoot = options.projectRoot;
    this.settings = options.settings;
    this.hasLoadedProjectConfig = false;
    this.projectConfig = null;
  }

  /**
   * Resolves the exported behavior pack root for the active profile.
   *
   * @throws {Error} Thrown when `target` is `exact` but `bpPath` is not configured.
   *
   * @returns {string | null} Absolute behavior pack root path when available.
   */
  resolveBehaviorPackExportRoot() {
    const exportConfig = this.resolveDebuggerExportConfig();

    if (!exportConfig) {
      return null;
    }

    const target = typeof exportConfig.target === "string" ? exportConfig.target : null;

    if (target === "exact") {
      if (typeof exportConfig.bpPath !== "string" || exportConfig.bpPath.trim() === "") {
        throw new Error('Exact export target requires "bpPath" to be defined.');
      }

      return this.resolveConfiguredPath(exportConfig.bpPath);
    }

    if (target === "development") {
      const comMojangRoot = this.resolveComMojangRoot(this.resolveExportBuild(exportConfig), target);

      if (!comMojangRoot) {
        return null;
      }

      return path.resolve(comMojangRoot, "development_behavior_packs", this.resolveBehaviorPackName(exportConfig));
    }

    if (target === "world") {
      const worldRoot = this.resolveWorldExportRoot(exportConfig);

      if (!worldRoot) {
        return null;
      }

      return path.resolve(worldRoot, "behavior_packs", this.resolveBehaviorPackName(exportConfig));
    }

    return null;
  }

  /**
   * Resolves a project-relative behavior pack path into the active export target.
   *
   * @param {string} projectRelativePath - Project-relative path inside `BP`.
   *
   * @returns {string | null} Absolute exported path when debugger export settings are available.
   */
  resolveBehaviorPackExportPath(projectRelativePath) {
    const behaviorPackRoot = this.resolveBehaviorPackExportRoot();

    if (!behaviorPackRoot) {
      return null;
    }

    const normalizedProjectPath = this.normalizeBehaviorPackProjectPath(projectRelativePath);
    const behaviorPackProjectPath = this.resolveBehaviorPackProjectPath();

    if (normalizedProjectPath === behaviorPackProjectPath) {
      return behaviorPackRoot;
    }

    if (!FilterPaths.isSubPath(behaviorPackProjectPath, normalizedProjectPath)) {
      return null;
    }

    const relativeBehaviorPackPath = FilterPaths.normalizeRelativePath(
      path.posix.relative(behaviorPackProjectPath, normalizedProjectPath)
    );

    if (relativeBehaviorPackPath === "") {
      return behaviorPackRoot;
    }

    return path.resolve(behaviorPackRoot, ...relativeBehaviorPackPath.split("/"));
  }

  /**
   * Resolves a local project path and expands the configured behavior-pack route.
   *
   * @param {string} projectRelativePath - Project-relative path or `BP`-relative alias.
   *
   * @returns {string} Absolute local project path.
   */
  resolveLocalProjectPath(projectRelativePath) {
    const normalizedProjectPath = this.normalizeBehaviorPackProjectPath(projectRelativePath);

    return path.resolve(this.projectRoot, normalizedProjectPath);
  }

  /**
   * Resolves debugger export settings from an explicit Regolith profile name.
   *
   * @returns {Record<string, any> | null} Export settings when debugger configuration is available.
   */
  resolveDebuggerExportConfig() {
    const debuggerProfile =
      typeof this.settings.debuggerProfile === "string" ? this.settings.debuggerProfile.trim() : "";

    if (debuggerProfile === "") {
      return null;
    }

    const projectConfig = this.readProjectConfig();
    const profiles = projectConfig?.regolith?.profiles || projectConfig?.profiles;

    if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
      return null;
    }

    const profile = profiles[debuggerProfile];

    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      return null;
    }

    if (!profile.export || typeof profile.export !== "object" || Array.isArray(profile.export)) {
      return null;
    }

    return profile.export;
  }

  /**
   * Reads the Regolith project configuration file.
   *
   * @returns {Record<string, any> | null} Parsed project config, when available.
   */
  readProjectConfig() {
    if (this.hasLoadedProjectConfig) {
      return this.projectConfig;
    }

    this.hasLoadedProjectConfig = true;

    const configPath = path.resolve(this.projectRoot, "config.json");

    if (!fs.existsSync(configPath)) {
      this.projectConfig = null;
      return this.projectConfig;
    }

    const configContent = fs.readFileSync(configPath, "utf8");
    this.projectConfig = JsoncDocument.parseDocument(configContent, configPath);

    return this.projectConfig;
  }

  /**
   * Resolves the configured local behavior-pack route from `config.json`.
   *
   * @returns {string} Project-relative behavior-pack root path.
   */
  resolveBehaviorPackProjectPath() {
    const projectConfig = this.readProjectConfig();
    const configuredPackPath = projectConfig?.packs?.behaviorPack;

    if (typeof configuredPackPath !== "string" || configuredPackPath.trim() === "") {
      return ProjectExportResolver.DEFAULT_BEHAVIOR_PACK_ROOT;
    }

    return FilterPaths.normalizeRelativePath(configuredPackPath);
  }

  /**
   * Rewrites `BP`-relative aliases to the configured local behavior-pack route.
   *
   * @param {string} projectRelativePath - Project-relative path or `BP`-relative alias.
   *
   * @returns {string} Normalized local project path.
   */
  normalizeBehaviorPackProjectPath(projectRelativePath) {
    const normalizedProjectPath = FilterPaths.normalizeRelativePath(projectRelativePath);
    const localBehaviorPackPath = this.resolveBehaviorPackProjectPath();

    if (normalizedProjectPath === ProjectExportResolver.DEFAULT_BEHAVIOR_PACK_ROOT) {
      return localBehaviorPackPath;
    }

    if (!FilterPaths.isSubPath(ProjectExportResolver.DEFAULT_BEHAVIOR_PACK_ROOT, normalizedProjectPath)) {
      return normalizedProjectPath;
    }

    const relativeBehaviorPackPath = FilterPaths.normalizeRelativePath(
      path.posix.relative(ProjectExportResolver.DEFAULT_BEHAVIOR_PACK_ROOT, normalizedProjectPath)
    );

    return FilterPaths.joinRelativePath(localBehaviorPackPath, relativeBehaviorPackPath);
  }

  /**
   * Resolves the export build name with a standard fallback.
   *
   * @param {Record<string, any>} exportConfig - Export configuration.
   *
   * @returns {string} Export build identifier.
   */
  resolveExportBuild(exportConfig) {
    return exportConfig.build === "preview" || exportConfig.build === "education" ? exportConfig.build : "standard";
  }

  /**
   * Resolves the exported behavior pack folder name.
   *
   * @param {Record<string, any>} exportConfig - Export configuration.
   *
   * @throws {Error} Thrown when `bpName` is configured with an unsupported expression.
   *
   * @returns {string} Behavior pack folder name.
   */
  resolveBehaviorPackName(exportConfig) {
    const projectConfig = this.readProjectConfig();
    const projectName =
      typeof projectConfig?.name === "string" && projectConfig.name.trim() !== ""
        ? projectConfig.name
        : path.basename(this.projectRoot);
    const configuredName = this.evaluateSimpleStringExpression(exportConfig.bpName, {
      project: {
        name: projectName
      }
    });

    if (typeof exportConfig.bpName === "string" && exportConfig.bpName.trim() !== "" && configuredName === null) {
      throw new Error(
        `Unsupported "export.bpName" expression "${exportConfig.bpName}". Tscompile debugger path resolution only supports string literals, "project.name", and string concatenation with "+".`
      );
    }

    return configuredName || `${projectName}_bp`;
  }

  /**
   * Evaluates a minimal string subset of go-simple-eval expressions.
   *
   * @param {unknown} expression - Expression to evaluate.
   * @param {Record<string, any>} context - Supported context values.
   *
   * @returns {string | null} Evaluated string when supported.
   */
  evaluateSimpleStringExpression(expression, context) {
    if (typeof expression !== "string") {
      return null;
    }

    const trimmedExpression = expression.trim();

    if (trimmedExpression === "") {
      return null;
    }

    const expressionParts = [];
    let currentPart = "";
    let quoteCharacter = null;

    for (const character of trimmedExpression) {
      if ((character === '"' || character === "'") && quoteCharacter === null) {
        quoteCharacter = character;
        currentPart += character;
        continue;
      }

      if (quoteCharacter === character) {
        quoteCharacter = null;
        currentPart += character;
        continue;
      }

      if (character === "+" && quoteCharacter === null) {
        expressionParts.push(currentPart.trim());
        currentPart = "";
        continue;
      }

      currentPart += character;
    }

    if (quoteCharacter !== null) {
      return null;
    }

    expressionParts.push(currentPart.trim());
    const resolvedParts = [];

    for (const part of expressionParts) {
      if (part === "project.name") {
        resolvedParts.push(context.project?.name || "");
        continue;
      }

      if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'"))) {
        resolvedParts.push(part.slice(1, -1));
        continue;
      }

      return null;
    }

    return resolvedParts.join("");
  }

  /**
   * Resolves the world export root directory.
   *
   * @param {Record<string, any>} exportConfig - Export configuration.
   *
   * @throws {Error} Thrown when neither `worldPath` nor `worldName` is configured.
   * @throws {Error} Thrown when both `worldPath` and `worldName` are configured.
   * @throws {Error} Thrown when `worldPath` is configured but does not exist.
   * @throws {Error} Thrown when `worldPath` is configured but is not a directory.
   * @throws {Error} Thrown when `worldName` cannot be resolved to a world directory.
   * @throws {Error} Thrown when `worldName` matches more than one world directory.
   *
   * @returns {string | null} Absolute world directory when available.
   */
  resolveWorldExportRoot(exportConfig) {
    const hasWorldPath = typeof exportConfig.worldPath === "string" && exportConfig.worldPath.trim() !== "";
    const hasWorldName = typeof exportConfig.worldName === "string" && exportConfig.worldName.trim() !== "";

    if (!hasWorldPath && !hasWorldName) {
      throw new Error('World export target requires exactly one of "worldPath" or "worldName".');
    }

    if (hasWorldPath && hasWorldName) {
      throw new Error('World export target must not define both "worldPath" and "worldName".');
    }

    if (hasWorldPath) {
      const resolvedWorldPath = this.resolveConfiguredPath(exportConfig.worldPath);

      if (!fs.existsSync(resolvedWorldPath)) {
        throw new Error(`Configured "worldPath" does not exist: "${exportConfig.worldPath}".`);
      }

      if (!fs.statSync(resolvedWorldPath).isDirectory()) {
        throw new Error(`Configured "worldPath" is not a directory: "${exportConfig.worldPath}".`);
      }

      return resolvedWorldPath;
    }

    const comMojangRoot = this.resolveComMojangRoot(this.resolveExportBuild(exportConfig), "world");

    if (!comMojangRoot) {
      return null;
    }

    const worldsRoot = path.resolve(comMojangRoot, "minecraftWorlds");

    if (!fs.existsSync(worldsRoot)) {
      throw new Error(`Could not find the Minecraft worlds directory at "${worldsRoot}".`);
    }

    const expectedWorldName = exportConfig.worldName.trim();
    const matchingWorldPaths = [];

    for (const directoryEntry of fs.readdirSync(worldsRoot, { withFileTypes: true })) {
      if (!directoryEntry.isDirectory()) {
        continue;
      }

      const candidateWorldPath = path.resolve(worldsRoot, directoryEntry.name);
      const levelNamePath = path.resolve(candidateWorldPath, "levelname.txt");

      if (!fs.existsSync(levelNamePath)) {
        continue;
      }

      const levelName = fs.readFileSync(levelNamePath, "utf8").trim();

      if (levelName === expectedWorldName) {
        matchingWorldPaths.push(candidateWorldPath);
      }
    }

    if (matchingWorldPaths.length === 0) {
      throw new Error(`Could not find a world named "${expectedWorldName}" in "${worldsRoot}".`);
    }

    if (matchingWorldPaths.length > 1) {
      throw new Error(
        `Found multiple worlds named "${expectedWorldName}" in "${worldsRoot}". Set "worldPath" instead of "worldName" to disambiguate the export target.`
      );
    }

    return matchingWorldPaths[0];
  }

  /**
   * Resolves the com.mojang root for a given build and export target.
   *
   * @param {string} build - Export build identifier.
   * @param {string} target - Export target identifier.
   *
   * @returns {string | null} Absolute com.mojang root when available.
   */
  resolveComMojangRoot(build, target) {
    const environmentOverrides = {
      education: process.env.COM_MOJANG_EDU,
      preview: process.env.COM_MOJANG_PREVIEW,
      standard: process.env.COM_MOJANG
    };
    const environmentOverride = environmentOverrides[build];

    if (typeof environmentOverride === "string" && environmentOverride.trim() !== "") {
      return path.resolve(environmentOverride);
    }

    if (process.platform !== "win32") {
      return null;
    }

    const appDataPath = process.env.APPDATA;

    if (!appDataPath) {
      return null;
    }

    if (build === "education") {
      return path.resolve(appDataPath, "Minecraft Education Edition", "games", "com.mojang");
    }

    const editionDirectory = build === "preview" ? "Minecraft Bedrock Preview" : "Minecraft Bedrock";

    if (target === "development") {
      return path.resolve(appDataPath, editionDirectory, "Users", "Shared", "games", "com.mojang");
    }

    const usersRoot = path.resolve(appDataPath, editionDirectory, "Users");
    const worldUserDirectory = this.findWorldUserDirectory(usersRoot);

    if (!worldUserDirectory) {
      return null;
    }

    return path.resolve(worldUserDirectory, "games", "com.mojang");
  }

  /**
   * Finds the first Minecraft Bedrock user directory used for world exports.
   *
   * @param {string} usersRoot - Root `Users` directory.
   *
   * @returns {string | null} Absolute user directory path when found.
   */
  findWorldUserDirectory(usersRoot) {
    if (!fs.existsSync(usersRoot)) {
      return null;
    }

    for (const directoryEntry of fs.readdirSync(usersRoot, { withFileTypes: true })) {
      if (!directoryEntry.isDirectory() || directoryEntry.name === "Shared") {
        continue;
      }

      // Assume that the first directory found is the active Bedrock user
      return path.resolve(usersRoot, directoryEntry.name);
    }

    return null;
  }

  /**
   * Resolves a config-defined path with environment variable expansion.
   *
   * @param {string} configuredPath - Configured path expression.
   *
   * @returns {string} Absolute resolved path.
   */
  resolveConfiguredPath(configuredPath) {
    const expandedPath = this.expandEnvironmentVariables(configuredPath.trim());

    return path.isAbsolute(expandedPath) ? path.resolve(expandedPath) : path.resolve(this.projectRoot, expandedPath);
  }

  /**
   * Expands supported environment variable syntax in a path string.
   *
   * @param {string} value - Path string to expand.
   *
   * @returns {string} Expanded path string.
   */
  expandEnvironmentVariables(value) {
    return value
      .replace(/%([^%]+)%/g, (_match, variableName) => process.env[variableName] || "")
      .replace(/\$\{([^}]+)\}/g, (_match, variableName) => process.env[variableName] || "")
      .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, variableName) => process.env[variableName] || "");
  }

  /**
   * Converts an absolute filesystem path into a VS Code launch path.
   *
   * @param {string} absolutePath - Absolute filesystem path.
   *
   * @returns {string} VS Code-compatible launch path.
   */
  toVsCodePath(absolutePath) {
    const relativePath = path.relative(this.projectRoot, absolutePath);

    if (relativePath === "") {
      return "${workspaceFolder}";
    }

    if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
      return `\${workspaceFolder}/${FilterPaths.normalizeRelativePath(relativePath)}`;
    }

    return FilterPaths.normalizeRelativePath(absolutePath);
  }
}

module.exports = ProjectExportResolver;
