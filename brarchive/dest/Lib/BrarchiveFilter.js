"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const JsonTools_1 = __importDefault(require("./JsonTools"));
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
        minify: true,
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
        "textures",
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
    static UTF8_DECODER = new util_1.TextDecoder("utf-8", { fatal: true });
    /** Current working directory. */
    cwd;
    /** Resolved filter settings. */
    settings;
    /**
     * Creates the filter instance.
     *
     * @param cwd - Current working directory.
     * @param rawSettings - Raw JSON settings passed to the filter.
     */
    constructor(cwd, rawSettings) {
        this.cwd = cwd;
        this.settings = this.createSettings(rawSettings);
    }
    /**
     * Runs the full filter pipeline.
     *
     * @throws If no pack directory is found.
     */
    async run() {
        this.validateSettings();
        const packRootList = this.getPackRoots();
        if (packRootList.length === 0) {
            throw new Error(`${BrarchiveFilter.FILTER_IDENTIFIER}: no BP or RP directory found. Run from Regolith's filter context (cwd = temp directory with BP/RP).`);
        }
        const options = {
            isRootPack: true,
            minify: this.settings.minify,
            removeArchivedFiles: this.settings.mode === "replace",
        };
        await Promise.all(packRootList.map((packRoot) => this.processPackInPlace(packRoot, options)));
    }
    /**
     * Creates merged settings with canonical defaults.
     *
     * @param rawSettings - Raw JSON settings passed to the filter.
     *
     * @returns Merged filter settings.
     */
    createSettings(rawSettings) {
        return {
            mode: (rawSettings.mode ?? BrarchiveFilter.DEFAULT_SETTINGS.mode),
            minify: (rawSettings.minify ?? BrarchiveFilter.DEFAULT_SETTINGS.minify),
        };
    }
    /**
     * Validates the current filter settings.
     *
     * @throws If setting values or types are invalid.
     */
    validateSettings() {
        if (!BrarchiveFilter.VALID_MODE_SET.has(this.settings.mode)) {
            throw new Error(`${BrarchiveFilter.FILTER_IDENTIFIER}: unknown mode "${this.settings.mode}". Expected "replace" or "keep_both".`);
        }
        if (typeof this.settings.minify !== "boolean") {
            throw new TypeError(`"${BrarchiveFilter.FILTER_IDENTIFIER}" setting "minify" must be a boolean.`);
        }
    }
    /**
     * Resolves existing pack roots from the current Regolith temp workspace.
     *
     * @returns Absolute paths to existing pack directories.
     */
    getPackRoots() {
        return BrarchiveFilter.PACK_DIRECTORY_NAME_LIST.map((directoryName) => path_1.default.resolve(this.cwd, directoryName)).filter((packRoot) => {
            try {
                return fs_1.default.statSync(packRoot).isDirectory();
            }
            catch {
                return false;
            }
        });
    }
    /**
     * Normalizes a path to lowercase forward-slash form.
     *
     * @param filePath - Path to normalize.
     *
     * @returns Normalized path string.
     */
    toNormalizedPath(filePath) {
        return path_1.default.normalize(filePath).split(path_1.default.sep).join("/").toLowerCase();
    }
    /**
     * Partitions directory entries into child directories and files.
     *
     * @param entryList - Directory entries to partition.
     *
     * @returns Partitioned entry names.
     */
    partitionEntries(entryList) {
        const result = {
            directoryNameList: [],
            fileNameList: [],
        };
        for (const entry of entryList) {
            if (entry.isDirectory()) {
                result.directoryNameList.push(entry.name);
                continue;
            }
            if (entry.isFile()) {
                result.fileNameList.push(entry.name);
            }
        }
        return result;
    }
    /**
     * Determines whether a file contains valid UTF-8 content.
     *
     * @param filePath - Absolute file path to validate.
     *
     * @returns `true` when the file decodes as UTF-8.
     */
    async isValidUtf8(filePath) {
        try {
            const data = await fs_1.default.promises.readFile(filePath);
            BrarchiveFilter.UTF8_DECODER.decode(data);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Finds directories whose file contents can be archived.
     *
     * @param sourceRoot - Absolute pack root path.
     *
     * @returns Archive targets and tracked files.
     */
    async findTargets(sourceRoot) {
        const targets = [];
        const archivedFiles = new Set();
        await this.walkArchiveTargets(sourceRoot, sourceRoot, targets, archivedFiles);
        return {
            archivedFiles,
            targets,
        };
    }
    /**
     * Walks pack directories and collects archive targets.
     *
     * @param sourceRoot - Absolute pack root path.
     * @param currentDirectory - Absolute directory currently being scanned.
     * @param targets - Mutable target collection.
     * @param archivedFiles - Mutable archived file set.
     */
    async walkArchiveTargets(sourceRoot, currentDirectory, targets, archivedFiles) {
        const absoluteDirectoryPath = path_1.default.resolve(currentDirectory);
        const normalizedDirectoryParts = path_1.default.normalize(absoluteDirectoryPath).split(path_1.default.sep);
        if (normalizedDirectoryParts.includes(BrarchiveFilter.ARCHIVE_DIRECTORY_NAME)) {
            return;
        }
        const relativeDirectoryPath = path_1.default.relative(sourceRoot, absoluteDirectoryPath) || ".";
        const entryList = await fs_1.default.promises.readdir(absoluteDirectoryPath, { withFileTypes: true });
        const { directoryNameList, fileNameList } = this.partitionEntries(entryList);
        if (relativeDirectoryPath === ".") {
            const rootDirectoryNameList = directoryNameList.filter((directoryName) => {
                return (directoryName !== BrarchiveFilter.ARCHIVE_DIRECTORY_NAME &&
                    !BrarchiveFilter.BANNED_ROOT_DIRECTORY_SET.has(directoryName));
            });
            await Promise.all(rootDirectoryNameList.map((directoryName) => {
                return this.walkArchiveTargets(sourceRoot, path_1.default.join(absoluteDirectoryPath, directoryName), targets, archivedFiles);
            }));
            return;
        }
        if (relativeDirectoryPath.split(path_1.default.sep)[0] === "subpacks") {
            return;
        }
        const fileNameListToArchive = fileNameList.filter((fileName) => {
            const relativeFilePath = this.toNormalizedPath(path_1.default.join(relativeDirectoryPath, fileName));
            return !BrarchiveFilter.EXCLUDED_PATH_SET.has(relativeFilePath);
        });
        if (fileNameListToArchive.length > 0) {
            const isUtf8List = await Promise.all(fileNameListToArchive.map((fileName) => {
                return this.isValidUtf8(path_1.default.join(absoluteDirectoryPath, fileName));
            }));
            const canArchiveDirectory = isUtf8List.every(Boolean);
            if (canArchiveDirectory) {
                targets.push({
                    directoryPath: absoluteDirectoryPath,
                    relativePath: relativeDirectoryPath,
                });
                fileNameListToArchive.forEach((fileName) => {
                    archivedFiles.add(path_1.default.resolve(absoluteDirectoryPath, fileName));
                });
            }
        }
        await Promise.all(directoryNameList.map((directoryName) => {
            return this.walkArchiveTargets(sourceRoot, path_1.default.join(absoluteDirectoryPath, directoryName), targets, archivedFiles);
        }));
    }
    /**
     * Serializes archive entries into `.brarchive` binary format.
     *
     * @param entries - Archive entries keyed by filename.
     *
     * @returns Serialized archive buffer.
     *
     * @throws If an entry name exceeds the format limit.
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
                throw new Error(`Entry name too long (${nameBuffer.length} bytes), max is ${BrarchiveFilter.ENTRY_NAME_LENGTH_MAX}.`);
            }
            const contentBuffer = Buffer.from(String(entryContents), "utf8");
            const offset = totalContentLength >>> 0;
            const length = contentBuffer.length >>> 0;
            totalContentLength += length;
            return {
                contentBuffer,
                length,
                nameBuffer,
                offset,
            };
        });
        const outputBuffer = Buffer.allocUnsafe(BrarchiveFilter.HEADER_SIZE + BrarchiveFilter.DESCRIPTOR_SIZE * entryCount + totalContentLength);
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
     * @param fileName - File name to inspect.
     * @param contents - Raw text file contents.
     * @param shouldMinify - Whether minification is enabled.
     *
     * @returns Minified contents or the original input.
     */
    maybeMinifyContent(fileName, contents, shouldMinify) {
        if (!shouldMinify || !fileName.toLowerCase().endsWith(".json")) {
            return contents;
        }
        try {
            const tokenizer = /("(?:[^"\\]|\\.)*")|(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/|\s+)/g;
            return contents.replace(tokenizer, (_, stringLiteral) => stringLiteral || "");
        }
        catch {
            return contents;
        }
    }
    /**
     * Encodes a directory into a single `.brarchive` file.
     *
     * @param directoryPath - Absolute directory path to archive.
     * @param outputRoot - Absolute archive output root.
     * @param relativePath - Directory path relative to the pack root.
     * @param shouldMinify - Whether JSON files should be minified.
     */
    async encodeDirectoryToBrarchive(directoryPath, outputRoot, relativePath, shouldMinify) {
        const archivePath = path_1.default.join(outputRoot, relativePath) + ".brarchive";
        const entryList = await fs_1.default.promises.readdir(directoryPath, { withFileTypes: true });
        const fileEntryList = entryList.filter((entry) => {
            if (!entry.isFile()) {
                return false;
            }
            const relativeFilePath = this.toNormalizedPath(path_1.default.join(relativePath, entry.name));
            return !BrarchiveFilter.EXCLUDED_PATH_SET.has(relativeFilePath);
        });
        if (fileEntryList.length === 0) {
            return;
        }
        const archiveEntryMap = new Map();
        await Promise.all(fileEntryList.map(async (entry) => {
            const filePath = path_1.default.join(directoryPath, entry.name);
            const contents = await fs_1.default.promises.readFile(filePath, "utf8");
            const storedContents = this.maybeMinifyContent(entry.name, contents, shouldMinify);
            archiveEntryMap.set(entry.name, storedContents);
        }));
        await fs_1.default.promises.mkdir(path_1.default.dirname(archivePath), { recursive: true });
        await fs_1.default.promises.writeFile(archivePath, this.serializeBrarchive(archiveEntryMap));
    }
    /**
     * Removes empty directories under a root while skipping named directories.
     *
     * @param root - Absolute root directory path.
     * @param skipDirectoryNameSet - Directory names that should never be removed.
     */
    async cleanupEmptyDirectories(root, skipDirectoryNameSet = new Set()) {
        await this.walkEmptyDirectoryCleanup(root, root, skipDirectoryNameSet);
    }
    /**
     * Recursively removes empty directories and reports whether a directory is empty.
     *
     * @param root - Absolute cleanup root.
     * @param currentDirectory - Absolute directory currently being checked.
     * @param skipDirectoryNameSet - Directory names that should never be removed.
     *
     * @returns `true` when the current directory is empty.
     */
    async walkEmptyDirectoryCleanup(root, currentDirectory, skipDirectoryNameSet) {
        const entryList = await fs_1.default.promises.readdir(currentDirectory, { withFileTypes: true });
        let hasContent = false;
        for (const entry of entryList) {
            const entryPath = path_1.default.join(currentDirectory, entry.name);
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
                await fs_1.default.promises.rmdir(currentDirectory);
            }
            catch {
                return false;
            }
            return true;
        }
        return !hasContent;
    }
    /**
     * Runs archive encoding jobs in parallel with a worker pool.
     *
     * @param jobList - Archive encoding jobs.
     */
    async runEncodeWorkers(jobList) {
        if (jobList.length === 0) {
            return;
        }
        const workerCount = Math.min(os_1.default.cpus()?.length ?? 4, jobList.length);
        let nextJobIndex = 0;
        const worker = async () => {
            while (nextJobIndex < jobList.length) {
                const currentJobIndex = nextJobIndex;
                nextJobIndex += 1;
                const currentJob = jobList[currentJobIndex];
                await this.encodeDirectoryToBrarchive(currentJob.directoryPath, currentJob.outputRoot, currentJob.relativePath, currentJob.shouldMinify);
            }
        };
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
    }
    /**
     * Sets `header.pack_optimization_version` in a manifest when present.
     *
     * @param packRoot - Absolute pack root path.
     * @param requireManifest - Whether a missing manifest is an error.
     *
     * @throws If a required manifest is missing.
     */
    async setPackOptimizationVersion(packRoot, requireManifest = true) {
        const manifestPath = path_1.default.join(packRoot, "manifest.json");
        let rawManifest;
        try {
            rawManifest = await fs_1.default.promises.readFile(manifestPath, "utf8");
        }
        catch (error) {
            if (error?.code === "ENOENT") {
                if (requireManifest) {
                    throw new Error(`${BrarchiveFilter.FILTER_IDENTIFIER}: manifest.json not found at ${manifestPath}. Ensure the pack has a manifest.`, { cause: error });
                }
                return;
            }
            throw error;
        }
        const manifest = JsonTools_1.default.parse(rawManifest);
        if (!manifest.header || typeof manifest.header !== "object" || Array.isArray(manifest.header)) {
            manifest.header = {};
        }
        manifest.header.pack_optimization_version = BrarchiveFilter.PACK_OPTIMIZATION_VERSION;
        await fs_1.default.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }
    /**
     * Processes a pack root in place by creating `__brarchive` files beside source content.
     *
     * @param root - Absolute pack root path.
     * @param options - Pack processing options.
     */
    async processPackInPlace(root, options = {}) {
        const removeArchivedFiles = options.removeArchivedFiles === true;
        const shouldMinify = options.minify === true;
        const isRootPack = options.isRootPack !== false;
        const absoluteRoot = path_1.default.resolve(root);
        await this.setPackOptimizationVersion(absoluteRoot, isRootPack);
        const archiveOutputRoot = path_1.default.join(absoluteRoot, BrarchiveFilter.ARCHIVE_DIRECTORY_NAME);
        await fs_1.default.promises.mkdir(archiveOutputRoot, { recursive: true });
        const { targets, archivedFiles } = await this.findTargets(absoluteRoot);
        const jobList = targets.map((target) => {
            return {
                directoryPath: target.directoryPath,
                outputRoot: archiveOutputRoot,
                relativePath: target.relativePath,
                shouldMinify,
            };
        });
        await this.runEncodeWorkers(jobList);
        await this.cleanupEmptyDirectories(archiveOutputRoot);
        if (removeArchivedFiles && archivedFiles.size > 0) {
            await Promise.all([...archivedFiles].map(async (archivedFilePath) => {
                try {
                    await fs_1.default.promises.unlink(archivedFilePath);
                }
                catch (error) {
                    if (error?.code !== "ENOENT") {
                        throw error;
                    }
                }
            }));
            await this.cleanupEmptyDirectories(absoluteRoot, new Set([BrarchiveFilter.ARCHIVE_DIRECTORY_NAME]));
        }
        await this.processSubpacks(absoluteRoot, async (subpackDirectoryName) => {
            await this.processPackInPlace(path_1.default.join(absoluteRoot, "subpacks", subpackDirectoryName), {
                ...options,
                isRootPack: false,
            });
        });
    }
    /**
     * Resolves subpack directory names beneath a pack root.
     *
     * @param packRoot - Absolute pack root path.
     *
     * @returns Child subpack directory names.
     */
    async getSubpackDirectoryNameList(packRoot) {
        const subpacksPath = path_1.default.join(packRoot, "subpacks");
        try {
            const entryList = await fs_1.default.promises.readdir(subpacksPath, { withFileTypes: true });
            return entryList.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
        }
        catch (error) {
            if (error?.code === "ENOENT") {
                return [];
            }
            throw error;
        }
    }
    /**
     * Runs an async callback for each direct subpack of a pack root.
     *
     * @param packRoot - Absolute pack root path.
     * @param handler - Async callback for each subpack.
     */
    async processSubpacks(packRoot, handler) {
        const subpackDirectoryNameList = await this.getSubpackDirectoryNameList(packRoot);
        await Promise.all(subpackDirectoryNameList.map((subpackDirectoryName) => handler(subpackDirectoryName)));
    }
}
exports.default = BrarchiveFilter;
