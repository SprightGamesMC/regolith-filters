const fsSync = require("fs");
const fs = fsSync.promises;
const os = require("os");
const path = require("path");
const { TextDecoder } = require("util");

/**
 * Coordinates brarchive pack discovery, encoding, and manifest updates.
 */
class BrarchiveFilter {
  static FILTER_IDENTIFIER = "brarchive";

  static ARCHIVE_DIRECTORY_NAME = "__brarchive";

  static PACK_DIRECTORY_NAME_LIST = ["BP", "RP"];

  static PACK_OPTIMIZATION_VERSION = "0.1.0";

  static DEFAULT_SETTINGS = Object.freeze({
    mode: "replace",
    minify: true
  });

  static VALID_MODE_SET = new Set(["replace", "keep_both"]);

  static BANNED_ROOT_DIRECTORY_SET = new Set([
    "font",
    "loot_tables",
    "materials",
    "scripts",
    "sounds",
    "subpacks",
    "texts",
    "textures"
  ]);

  /**
   * Paths relative to a pack root. Each subpack is processed as its own root,
   * so these exclusions apply within the main pack and every subpack.
   */
  static EXCLUDED_PATH_SET = new Set(["ui/_global_variables.json"]);

  static MAGIC = 0x267052a0b125277dn;

  static VERSION = 1;

  static ENTRY_NAME_LENGTH_MAX = 247;

  static HEADER_SIZE = 16;

  static DESCRIPTOR_SIZE = 1 + BrarchiveFilter.ENTRY_NAME_LENGTH_MAX + 8;

  static UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

  /**
   * Creates the filter instance.
   *
   * @param {string} cwd - Current working directory.
   * @param {Record<string, any>} rawSettings - Raw JSON settings passed to the filter.
   */
  constructor(cwd, rawSettings) {
    this.cwd = cwd;
    this.rawSettings = rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings) ? rawSettings : {};
    this.settings = this.createSettings(this.rawSettings);
  }

  /**
   * Runs the full filter pipeline.
   */
  async run() {
    this.validateSettings();

    const packRootList = this.getPackRoots();

    if (packRootList.length === 0) {
      throw new Error(
        `${BrarchiveFilter.FILTER_IDENTIFIER}: no BP or RP directory found. Run from Regolith's filter context (cwd = temp directory with BP/RP).`
      );
    }

    const options = {
      isRootPack: true,
      minify: this.settings.minify,
      removeArchivedFiles: this.settings.mode === "replace"
    };

    await Promise.all(packRootList.map((packRoot) => this.processPackInPlace(packRoot, options)));
  }

  /**
   * Creates merged settings with canonical defaults.
   *
   * @param {Record<string, any>} rawSettings - Raw JSON settings passed to the filter.
   *
   * @returns {{ mode: "replace" | "keep_both"; minify: boolean }} Merged filter settings.
   */
  createSettings(rawSettings) {
    return {
      ...BrarchiveFilter.DEFAULT_SETTINGS,
      ...rawSettings
    };
  }

  /**
   * Validates the current filter settings.
   *
   * @throws {Error} Thrown when setting values are invalid.
   * @throws {TypeError} Thrown when setting types are invalid.
   */
  validateSettings() {
    if (!BrarchiveFilter.VALID_MODE_SET.has(this.settings.mode)) {
      throw new Error(
        `${BrarchiveFilter.FILTER_IDENTIFIER}: unknown mode "${this.settings.mode}". Expected "replace" or "keep_both".`
      );
    }

    if (typeof this.settings.minify !== "boolean") {
      throw new TypeError(`"${BrarchiveFilter.FILTER_IDENTIFIER}" setting "minify" must be a boolean.`);
    }
  }

  /**
   * Resolves existing pack roots from the current Regolith temp workspace.
   *
   * @returns {string[]} Absolute paths to existing pack directories.
   */
  getPackRoots() {
    return BrarchiveFilter.PACK_DIRECTORY_NAME_LIST.map((directoryName) =>
      path.resolve(this.cwd, directoryName)
    ).filter((packRoot) => {
      try {
        return fsSync.statSync(packRoot).isDirectory();
      } catch {
        return false;
      }
    });
  }

  /**
   * Normalizes a path to lowercase forward-slash form.
   *
   * @param {string} filePath - Path to normalize.
   *
   * @returns {string} Normalized path string.
   */
  toNormalizedPath(filePath) {
    return path.normalize(filePath).split(path.sep).join("/").toLowerCase();
  }

  /**
   * Partitions directory entries into child directories and files.
   *
   * @param {import("fs").Dirent[]} entryList - Directory entries to partition.
   *
   * @returns {{ directoryNameList: string[]; fileNameList: string[] }} Partitioned entry names.
   */
  partitionEntries(entryList) {
    return entryList.reduce(
      (result, entry) => {
        if (entry.isDirectory()) {
          result.directoryNameList.push(entry.name);
          return result;
        }

        if (entry.isFile()) {
          result.fileNameList.push(entry.name);
        }

        return result;
      },
      {
        directoryNameList: [],
        fileNameList: []
      }
    );
  }

  /**
   * Determines whether a file contains valid UTF-8 content.
   *
   * @param {string} filePath - Absolute file path to validate.
   *
   * @returns {Promise<boolean>} Resolves to `true` when the file decodes as UTF-8.
   */
  async isValidUtf8(filePath) {
    try {
      const data = await fs.readFile(filePath);
      BrarchiveFilter.UTF8_DECODER.decode(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Finds directories whose file contents can be archived.
   *
   * @param {string} sourceRoot - Absolute pack root path.
   *
   * @returns {Promise<{ targets: Array<{ directoryPath: string; relativePath: string }>; archivedFiles: Set<string> }>} Archive targets and tracked files.
   */
  async findTargets(sourceRoot) {
    const targets = [];
    const archivedFiles = new Set();

    await this.walkArchiveTargets(sourceRoot, sourceRoot, targets, archivedFiles);

    return {
      targets,
      archivedFiles
    };
  }

  /**
   * Walks pack directories and collects archive targets.
   *
   * @param {string} sourceRoot - Absolute pack root path.
   * @param {string} currentDirectory - Absolute directory currently being scanned.
   * @param {Array<{ directoryPath: string; relativePath: string }>} targets - Mutable target collection.
   * @param {Set<string>} archivedFiles - Mutable archived file set.
   *
   * @returns {Promise<void>} Resolves after the directory tree is scanned.
   */
  async walkArchiveTargets(sourceRoot, currentDirectory, targets, archivedFiles) {
    const absoluteDirectoryPath = path.resolve(currentDirectory);
    const normalizedDirectoryParts = path.normalize(absoluteDirectoryPath).split(path.sep);

    if (normalizedDirectoryParts.includes(BrarchiveFilter.ARCHIVE_DIRECTORY_NAME)) {
      return;
    }

    const relativeDirectoryPath = path.relative(sourceRoot, absoluteDirectoryPath) || ".";
    const entryList = await fs.readdir(absoluteDirectoryPath, { withFileTypes: true });
    const { directoryNameList, fileNameList } = this.partitionEntries(entryList);

    if (relativeDirectoryPath === ".") {
      const rootDirectoryNameList = directoryNameList.filter((directoryName) => {
        return (
          directoryName !== BrarchiveFilter.ARCHIVE_DIRECTORY_NAME &&
          !BrarchiveFilter.BANNED_ROOT_DIRECTORY_SET.has(directoryName)
        );
      });

      await Promise.all(
        rootDirectoryNameList.map((directoryName) => {
          return this.walkArchiveTargets(
            sourceRoot,
            path.join(absoluteDirectoryPath, directoryName),
            targets,
            archivedFiles
          );
        })
      );

      return;
    }

    if (relativeDirectoryPath.split(path.sep)[0] === "subpacks") {
      return;
    }

    const fileNameListToArchive = fileNameList.filter((fileName) => {
      const relativeFilePath = this.toNormalizedPath(path.join(relativeDirectoryPath, fileName));
      return !BrarchiveFilter.EXCLUDED_PATH_SET.has(relativeFilePath);
    });

    if (fileNameListToArchive.length > 0) {
      const isUtf8List = await Promise.all(
        fileNameListToArchive.map((fileName) => {
          return this.isValidUtf8(path.join(absoluteDirectoryPath, fileName));
        })
      );
      const canArchiveDirectory = isUtf8List.every(Boolean);

      if (canArchiveDirectory) {
        targets.push({
          directoryPath: absoluteDirectoryPath,
          relativePath: relativeDirectoryPath
        });

        fileNameListToArchive.forEach((fileName) => {
          archivedFiles.add(path.resolve(absoluteDirectoryPath, fileName));
        });
      }
    }

    await Promise.all(
      directoryNameList.map((directoryName) => {
        return this.walkArchiveTargets(
          sourceRoot,
          path.join(absoluteDirectoryPath, directoryName),
          targets,
          archivedFiles
        );
      })
    );
  }

  /**
   * Serializes archive entries into `.brarchive` binary format.
   *
   * @param {Map<string, string> | Iterable<[string, string]>} entries - Archive entries keyed by filename.
   *
   * @returns {Buffer} Serialized archive buffer.
   *
   * @throws {Error} Thrown when an entry name exceeds the format limit.
   */
  serializeBrarchive(entries) {
    const sortedEntries = [...entries].sort((leftEntry, rightEntry) => {
      return leftEntry[0].localeCompare(rightEntry[0]);
    });
    const entryCount = sortedEntries.length;
    let totalContentLength = 0;

    const descriptorList = sortedEntries.map(([entryName, entryContents]) => {
      const nameBuffer = Buffer.from(String(entryName), "utf8");

      if (nameBuffer.length > BrarchiveFilter.ENTRY_NAME_LENGTH_MAX) {
        throw new Error(
          `Entry name too long (${nameBuffer.length} bytes), max is ${BrarchiveFilter.ENTRY_NAME_LENGTH_MAX}.`
        );
      }

      const contentBuffer = Buffer.from(String(entryContents), "utf8");
      const offset = totalContentLength >>> 0;
      const length = contentBuffer.length >>> 0;
      totalContentLength += length;

      return {
        contentBuffer,
        length,
        nameBuffer,
        offset
      };
    });

    const outputBuffer = Buffer.allocUnsafe(
      BrarchiveFilter.HEADER_SIZE + BrarchiveFilter.DESCRIPTOR_SIZE * entryCount + totalContentLength
    );
    let position = 0;

    outputBuffer.writeBigUInt64LE(BrarchiveFilter.MAGIC, position);
    position += 8;
    outputBuffer.writeUInt32LE(entryCount >>> 0, position);
    position += 4;
    outputBuffer.writeUInt32LE(BrarchiveFilter.VERSION >>> 0, position);
    position += 4;

    for (const descriptor of descriptorList) {
      outputBuffer.writeUInt8(descriptor.nameBuffer.length, position);
      position += 1;

      descriptor.nameBuffer.copy(outputBuffer, position);

      if (descriptor.nameBuffer.length < BrarchiveFilter.ENTRY_NAME_LENGTH_MAX) {
        outputBuffer.fill(0, position + descriptor.nameBuffer.length, position + BrarchiveFilter.ENTRY_NAME_LENGTH_MAX);
      }

      position += BrarchiveFilter.ENTRY_NAME_LENGTH_MAX;
      outputBuffer.writeUInt32LE(descriptor.offset, position);
      position += 4;
      outputBuffer.writeUInt32LE(descriptor.length, position);
      position += 4;
    }

    for (const descriptor of descriptorList) {
      descriptor.contentBuffer.copy(outputBuffer, position);
      position += descriptor.contentBuffer.length;
    }

    return outputBuffer;
  }

  /**
   * Minifies JSON content by removing comments and extraneous whitespace.
   *
   * @param {string} fileName - File name to inspect.
   * @param {string} contents - Raw text file contents.
   * @param {boolean} shouldMinify - Whether minification is enabled.
   *
   * @returns {string} Minified contents or the original input.
   */
  maybeMinifyContent(fileName, contents, shouldMinify) {
    if (!shouldMinify || !fileName.toLowerCase().endsWith(".json")) {
      return contents;
    }

    try {
      const tokenizer = /("(?:[^"\\]|\\.)*")|(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+)/g;
      return contents.replace(tokenizer, (_, stringLiteral) => stringLiteral || "");
    } catch {
      return contents;
    }
  }

  /**
   * Encodes a directory into a single `.brarchive` file.
   *
   * @param {string} directoryPath - Absolute directory path to archive.
   * @param {string} outputRoot - Absolute archive output root.
   * @param {string} relativePath - Directory path relative to the pack root.
   * @param {boolean} shouldMinify - Whether JSON files should be minified.
   *
   * @returns {Promise<void>} Resolves after the archive file is written.
   */
  async encodeDirectoryToBrarchive(directoryPath, outputRoot, relativePath, shouldMinify) {
    const archivePath = path.join(outputRoot, relativePath) + ".brarchive";
    const entryList = await fs.readdir(directoryPath, { withFileTypes: true });
    const fileEntryList = entryList.filter((entry) => {
      if (!entry.isFile()) {
        return false;
      }

      const relativeFilePath = this.toNormalizedPath(path.join(relativePath, entry.name));
      return !BrarchiveFilter.EXCLUDED_PATH_SET.has(relativeFilePath);
    });

    if (fileEntryList.length === 0) {
      return;
    }

    const archiveEntryMap = new Map();

    await Promise.all(
      fileEntryList.map(async (entry) => {
        const filePath = path.join(directoryPath, entry.name);
        const contents = await fs.readFile(filePath, "utf8");
        const storedContents = this.maybeMinifyContent(entry.name, contents, shouldMinify);
        archiveEntryMap.set(entry.name, storedContents);
      })
    );

    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.writeFile(archivePath, this.serializeBrarchive(archiveEntryMap));
  }

  /**
   * Removes empty directories under a root while skipping named directories.
   *
   * @param {string} root - Absolute root directory path.
   * @param {Set<string>} skipDirectoryNameSet - Directory names that should never be removed.
   *
   * @returns {Promise<void>} Resolves after empty directory cleanup completes.
   */
  async cleanupEmptyDirectories(root, skipDirectoryNameSet = new Set()) {
    await this.walkEmptyDirectoryCleanup(root, root, skipDirectoryNameSet);
  }

  /**
   * Recursively removes empty directories and reports whether a directory is empty.
   *
   * @param {string} root - Absolute cleanup root.
   * @param {string} currentDirectory - Absolute directory currently being checked.
   * @param {Set<string>} skipDirectoryNameSet - Directory names that should never be removed.
   *
   * @returns {Promise<boolean>} Resolves to `true` when the current directory is empty.
   */
  async walkEmptyDirectoryCleanup(root, currentDirectory, skipDirectoryNameSet) {
    const entryList = await fs.readdir(currentDirectory, { withFileTypes: true });
    let hasContent = false;

    for (const entry of entryList) {
      const entryPath = path.join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        if (skipDirectoryNameSet.has(entry.name)) {
          hasContent = true;
          continue;
        }

        const childIsEmpty = await this.walkEmptyDirectoryCleanup(root, entryPath, skipDirectoryNameSet);

        if (!childIsEmpty) {
          hasContent = true;
        }

        continue;
      }

      hasContent = true;
    }

    if (currentDirectory !== root && !hasContent) {
      try {
        await fs.rmdir(currentDirectory);
      } catch {
        return false;
      }

      return true;
    }

    return !hasContent;
  }

  /**
   * Copies files that were not archived into a destination tree.
   *
   * @param {string} sourceRoot - Absolute source pack root.
   * @param {string} destinationRoot - Absolute destination root.
   * @param {Set<string>} archivedFiles - Absolute file paths already stored in archives.
   * @param {boolean} skipSubpacks - Whether the root-level `subpacks` directory should be skipped.
   *
   * @returns {Promise<void>} Resolves after file copying completes.
   */
  async copyNonArchivedFiles(sourceRoot, destinationRoot, archivedFiles, skipSubpacks = true) {
    await this.walkNonArchivedFileCopy(sourceRoot, destinationRoot, sourceRoot, archivedFiles, skipSubpacks);
  }

  /**
   * Recursively copies files that were not archived into a destination tree.
   *
   * @param {string} sourceRoot - Absolute source pack root.
   * @param {string} destinationRoot - Absolute destination root.
   * @param {string} currentDirectory - Absolute directory currently being copied.
   * @param {Set<string>} archivedFiles - Absolute file paths already stored in archives.
   * @param {boolean} skipSubpacks - Whether the root-level `subpacks` directory should be skipped.
   *
   * @returns {Promise<void>} Resolves after the directory subtree is copied.
   */
  async walkNonArchivedFileCopy(sourceRoot, destinationRoot, currentDirectory, archivedFiles, skipSubpacks) {
    const absoluteDirectoryPath = path.resolve(currentDirectory);

    if (path.normalize(absoluteDirectoryPath).split(path.sep).includes(BrarchiveFilter.ARCHIVE_DIRECTORY_NAME)) {
      return;
    }

    const relativeDirectoryPath = path.relative(sourceRoot, absoluteDirectoryPath) || ".";
    const entryList = await fs.readdir(absoluteDirectoryPath, { withFileTypes: true });
    const { directoryNameList, fileNameList } = this.partitionEntries(entryList);
    const childDirectoryNameList =
      relativeDirectoryPath === "." && skipSubpacks
        ? directoryNameList.filter((directoryName) => directoryName !== "subpacks")
        : directoryNameList;
    const destinationDirectoryPath =
      relativeDirectoryPath === "." ? destinationRoot : path.join(destinationRoot, relativeDirectoryPath);
    const fileNameListToCopy = fileNameList.filter((fileName) => {
      return !archivedFiles.has(path.resolve(absoluteDirectoryPath, fileName));
    });

    if (fileNameListToCopy.length > 0) {
      await fs.mkdir(destinationDirectoryPath, { recursive: true });
      await Promise.all(
        fileNameListToCopy.map((fileName) => {
          return fs.copyFile(path.join(absoluteDirectoryPath, fileName), path.join(destinationDirectoryPath, fileName));
        })
      );
    }

    await Promise.all(
      childDirectoryNameList.map((directoryName) => {
        return this.walkNonArchivedFileCopy(
          sourceRoot,
          destinationRoot,
          path.join(absoluteDirectoryPath, directoryName),
          archivedFiles,
          skipSubpacks
        );
      })
    );
  }

  /**
   * Runs archive encoding jobs in parallel with a worker pool.
   *
   * @param {Array<{ directoryPath: string; relativePath: string; outputRoot: string; shouldMinify: boolean }>} jobList - Archive encoding jobs.
   *
   * @returns {Promise<void>} Resolves after all jobs complete.
   */
  async runEncodeWorkers(jobList) {
    if (jobList.length === 0) {
      return;
    }

    const workerCount = Math.min(os.cpus()?.length ?? 4, jobList.length);
    let nextJobIndex = 0;

    const worker = async () => {
      while (nextJobIndex < jobList.length) {
        const currentJobIndex = nextJobIndex;
        nextJobIndex += 1;

        const currentJob = jobList[currentJobIndex];

        await this.encodeDirectoryToBrarchive(
          currentJob.directoryPath,
          currentJob.outputRoot,
          currentJob.relativePath,
          currentJob.shouldMinify
        );
      }
    };

    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  /**
   * Sets `header.pack_optimization_version` in a manifest when present.
   *
   * @param {string} packRoot - Absolute pack root path.
   * @param {{ requireManifest?: boolean }} options - Manifest requirements for the current pack.
   *
   * @returns {Promise<void>} Resolves after the manifest is updated or skipped.
   *
   * @throws {Error} Thrown when a required manifest is missing.
   */
  async setPackOptimizationVersion(packRoot, options = {}) {
    const requireManifest = options.requireManifest !== false;
    const manifestPath = path.join(packRoot, "manifest.json");
    let rawManifest;

    try {
      rawManifest = await fs.readFile(manifestPath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        if (requireManifest) {
          throw new Error(
            `${BrarchiveFilter.FILTER_IDENTIFIER}: manifest.json not found at ${manifestPath}. Ensure the pack has a manifest.`
          );
        }

        return;
      }

      throw error;
    }

    const manifest = JSON.parse(rawManifest);
    const header = manifest.header ?? (manifest.header = {});

    header.pack_optimization_version = BrarchiveFilter.PACK_OPTIMIZATION_VERSION;

    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  /**
   * Archives a source pack into a separate destination tree.
   *
   * @param {string} sourceRoot - Absolute source pack root.
   * @param {string} destinationRoot - Absolute destination pack root.
   *
   * @returns {Promise<void>} Resolves after the destination tree is written.
   */
  async processPack(sourceRoot, destinationRoot) {
    const absoluteSourceRoot = path.resolve(sourceRoot);
    const absoluteDestinationRoot = path.resolve(destinationRoot);
    const archiveOutputRoot = path.join(absoluteDestinationRoot, BrarchiveFilter.ARCHIVE_DIRECTORY_NAME);

    await fs.mkdir(archiveOutputRoot, { recursive: true });

    const { targets, archivedFiles } = await this.findTargets(absoluteSourceRoot);
    const jobList = targets.map((target) => {
      return {
        directoryPath: target.directoryPath,
        outputRoot: archiveOutputRoot,
        relativePath: target.relativePath,
        shouldMinify: false
      };
    });

    await this.runEncodeWorkers(jobList);
    await this.cleanupEmptyDirectories(archiveOutputRoot);
    await this.copyNonArchivedFiles(absoluteSourceRoot, absoluteDestinationRoot, archivedFiles, true);

    await this.processSubpacks(absoluteSourceRoot, async (subpackDirectoryName) => {
      const sourceSubpackRoot = path.join(absoluteSourceRoot, "subpacks", subpackDirectoryName);
      const destinationSubpackRoot = path.join(absoluteDestinationRoot, "subpacks", subpackDirectoryName);

      await this.processPack(sourceSubpackRoot, destinationSubpackRoot);
    });
  }

  /**
   * Processes a pack root in place by creating `__brarchive` files beside source content.
   *
   * @param {string} root - Absolute pack root path.
   * @param {{ removeArchivedFiles?: boolean; minify?: boolean; isRootPack?: boolean }} options - Pack processing options.
   *
   * @returns {Promise<void>} Resolves after the pack and its subpacks are processed.
   */
  async processPackInPlace(root, options = {}) {
    const removeArchivedFiles = options.removeArchivedFiles === true;
    const shouldMinify = options.minify === true;
    const isRootPack = options.isRootPack !== false;
    const absoluteRoot = path.resolve(root);

    await this.setPackOptimizationVersion(absoluteRoot, { requireManifest: isRootPack });

    const archiveOutputRoot = path.join(absoluteRoot, BrarchiveFilter.ARCHIVE_DIRECTORY_NAME);

    await fs.mkdir(archiveOutputRoot, { recursive: true });

    const { targets, archivedFiles } = await this.findTargets(absoluteRoot);
    const jobList = targets.map((target) => {
      return {
        directoryPath: target.directoryPath,
        outputRoot: archiveOutputRoot,
        relativePath: target.relativePath,
        shouldMinify
      };
    });

    await this.runEncodeWorkers(jobList);
    await this.cleanupEmptyDirectories(archiveOutputRoot);

    if (removeArchivedFiles && archivedFiles.size > 0) {
      await Promise.all(
        [...archivedFiles].map(async (archivedFilePath) => {
          try {
            await fs.unlink(archivedFilePath);
          } catch (error) {
            if (!error || typeof error !== "object" || error.code !== "ENOENT") {
              throw error;
            }
          }
        })
      );

      await this.cleanupEmptyDirectories(absoluteRoot, new Set([BrarchiveFilter.ARCHIVE_DIRECTORY_NAME]));
    }

    await this.processSubpacks(absoluteRoot, async (subpackDirectoryName) => {
      await this.processPackInPlace(path.join(absoluteRoot, "subpacks", subpackDirectoryName), {
        ...options,
        isRootPack: false
      });
    });
  }

  /**
   * Resolves subpack directory names beneath a pack root.
   *
   * @param {string} packRoot - Absolute pack root path.
   *
   * @returns {Promise<string[]>} Resolves to child subpack directory names.
   */
  async getSubpackDirectoryNameList(packRoot) {
    const subpacksPath = path.join(packRoot, "subpacks");

    try {
      const entryList = await fs.readdir(subpacksPath, { withFileTypes: true });
      return entryList.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  /**
   * Runs an async callback for each direct subpack of a pack root.
   *
   * @param {string} packRoot - Absolute pack root path.
   * @param {(subpackDirectoryName: string) => Promise<void>} handler - Async callback for each subpack.
   *
   * @returns {Promise<void>} Resolves after all subpacks are processed.
   */
  async processSubpacks(packRoot, handler) {
    const subpackDirectoryNameList = await this.getSubpackDirectoryNameList(packRoot);
    await Promise.all(subpackDirectoryNameList.map((subpackDirectoryName) => handler(subpackDirectoryName)));
  }
}

module.exports = BrarchiveFilter;
