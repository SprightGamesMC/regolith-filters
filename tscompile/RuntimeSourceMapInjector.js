const fs = require("fs");
const path = require("path");
const { SourceMapConsumer, SourceMapGenerator } = require("source-map");
const FilterPaths = require("./FilterPaths.js");

/**
 * Injects and adjusts runtime sourcemap metadata for debugger builds.
 */
class RuntimeSourceMapInjector {
  /**
   * Creates the runtime sourcemap helper.
   *
   * @param {{
   *   exportResolver: {
   *     resolveBehaviorPackExportPath: (projectRelativePath: string) => string | null;
   *     resolveLocalProjectPath: (projectRelativePath: string) => string;
   *   };
   *   logger: { info: (message: unknown) => void; warn: (message: unknown) => void };
   *   projectRoot: string;
   *   settings: Record<string, any>;
   *   toScriptsProjectPath: (relativePath: string) => string;
   * }} options - Helper dependencies and runtime state.
   */
  constructor(options) {
    this.exportResolver = options.exportResolver;
    this.logger = options.logger;
    this.projectRoot = options.projectRoot;
    this.settings = options.settings;
    this.toScriptsProjectPath = options.toScriptsProjectPath;
  }

  /**
   * Builds a generated-to-source line mapping and injects it into a compiled output file.
   *
   * @param {string} outputPath - Absolute compiled JavaScript output path.
   * @param {string} derivedOutputPath - Output path relative to `BP/scripts`.
   *
   * @returns {Promise<boolean>} `true` when sourcemap metadata was injected.
   */
  async generateSourceMapping(outputPath, derivedOutputPath) {
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
      const mapping = {};

      consumer.eachMapping((mappingEntry) => {
        if (!mappingEntry.source || mapping[mappingEntry.generatedLine]) {
          return;
        }

        const cleanedSource = this.cleanMappedSourcePath(mappingEntry.source, normalizedSourceDirectory);
        mapping[mappingEntry.generatedLine] = {
          originalLine: mappingEntry.originalLine,
          source: cleanedSource
        };
      });

      mapping.metadata = {
        filePath: FilterPaths.normalizeRelativePath(derivedOutputPath),
        offset: 1
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
   * @param {string} mappedSource - Source path from the sourcemap.
   * @param {string} normalizedSourceDirectory - Normalized source directory.
   *
   * @returns {string} Cleaned source path.
   */
  cleanMappedSourcePath(mappedSource, normalizedSourceDirectory) {
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
   * @param {string} mapPath - Path to the sourcemap file.
   * @param {string} derivedOutputPath - Output path relative to `BP/scripts`.
   * @param {number} lineOffset - Number of lines to offset generated mappings.
   */
  async adjustSourceMap(mapPath, derivedOutputPath, lineOffset) {
    const mapContent = fs.readFileSync(mapPath, "utf8");
    const originalMap = JSON.parse(mapContent);

    await SourceMapConsumer.with(mapContent, null, (consumer) => {
      const rewrittenSourcePathMap = this.createRewrittenSourcePathMap(
        mapPath,
        derivedOutputPath,
        Array.isArray(originalMap.sources) ? originalMap.sources : [],
        consumer.sources
      );
      const generator = new SourceMapGenerator({
        file: consumer.file || originalMap.file || path.basename(mapPath, ".map")
      });

      consumer.eachMapping((mappingEntry) => {
        generator.addMapping({
          generated: {
            column: mappingEntry.generatedColumn,
            line: mappingEntry.generatedLine + lineOffset
          },
          name: mappingEntry.name,
          original:
            mappingEntry.originalLine != null
              ? {
                  column: mappingEntry.originalColumn,
                  line: mappingEntry.originalLine
                }
              : null,
          source:
            mappingEntry.source && rewrittenSourcePathMap.has(mappingEntry.source)
              ? rewrittenSourcePathMap.get(mappingEntry.source)
              : mappingEntry.source
        });
      });

      for (const source of consumer.sources) {
        const content = consumer.sourceContentFor(source, true);

        if (content != null) {
          generator.setSourceContent(rewrittenSourcePathMap.get(source) || source, content);
        }
      }

      fs.writeFileSync(mapPath, generator.toString());
    });
  }

  /**
   * Rewrites consumer source paths to the final generated map location.
   *
   * @param {string} mapPath - Workspace sourcemap path.
   * @param {string} derivedOutputPath - Output path relative to `BP/scripts`.
   * @param {string[]} rawSources - Raw `sources` entries from the sourcemap JSON.
   * @param {string[]} consumerSources - Resolved source paths exposed by `source-map`.
   *
   * @returns {Map<string, string>} Mapping from consumer source path to final generated source path.
   */
  createRewrittenSourcePathMap(mapPath, derivedOutputPath, rawSources, consumerSources) {
    const rewrittenSourcePathMap = new Map();
    const workspaceMapDirectory = path.dirname(mapPath);
    const generatedMapPath = this.resolveGeneratedMapPath(mapPath, derivedOutputPath);
    const generatedMapDirectory = path.dirname(generatedMapPath);

    for (let index = 0; index < consumerSources.length; index += 1) {
      const consumerSource = consumerSources[index];
      const rawSource = typeof rawSources[index] === "string" ? rawSources[index] : consumerSource;
      const absoluteSourcePath = this.resolveOriginalSourcePath(workspaceMapDirectory, rawSource);
      const rewrittenSourcePath = FilterPaths.normalizeRelativePath(
        path.relative(generatedMapDirectory, absoluteSourcePath)
      );

      rewrittenSourcePathMap.set(rawSource, rewrittenSourcePath);
      rewrittenSourcePathMap.set(consumerSource, rewrittenSourcePath);
      rewrittenSourcePathMap.set(absoluteSourcePath, rewrittenSourcePath);
    }

    return rewrittenSourcePathMap;
  }

  /**
   * Resolves the generated sourcemap path for the active export target.
   *
   * @param {string} mapPath - Workspace sourcemap path.
   * @param {string} derivedOutputPath - Output path relative to `BP/scripts`.
   *
   * @returns {string} Absolute generated sourcemap path.
   */
  resolveGeneratedMapPath(mapPath, derivedOutputPath) {
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
   * @param {string} mapDirectory - Absolute directory containing the workspace sourcemap.
   * @param {string} rawSource - Raw `sources` entry from the sourcemap.
   *
   * @returns {string} Absolute local source path.
   */
  resolveOriginalSourcePath(mapDirectory, rawSource) {
    if (path.isAbsolute(rawSource)) {
      return path.resolve(rawSource);
    }

    return path.resolve(mapDirectory, ...FilterPaths.normalizeRelativePath(rawSource).split("/"));
  }
}

module.exports = RuntimeSourceMapInjector;
