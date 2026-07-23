import fs from "fs";
import os from "os";
import path from "path";
import { TextDecoder } from "util";
import type {
    ArchiveScan,
    ArchiveTarget,
    BrarchiveMode,
    BrarchiveSettings,
    EncodeJob,
    PackProcessOptions,
    PartitionedEntries,
} from "../Types/BrarchiveTypes";
import JsonTools from "./JsonTools";

/** Serialized descriptor for a single archive entry. */
interface EntryDescriptor {
    contentBuffer: Buffer;
    length: number;
    nameBuffer: Buffer;
    offset: number;
}

/**
 * Coordinates brarchive pack discovery, encoding, and manifest updates.
 */
export default class BrarchiveFilter {
    static readonly FILTER_IDENTIFIER = "brarchive";

    static readonly ARCHIVE_DIRECTORY_NAME = "__brarchive";

    static readonly PACK_DIRECTORY_NAME_LIST = ["BP", "RP"];

    static readonly PACK_OPTIMIZATION_VERSION = "0.1.0";

    static readonly DEFAULT_SETTINGS: BrarchiveSettings = Object.freeze({
        mode: "replace",
        minify: true,
    });

    static readonly VALID_MODE_SET = new Set<string>(["replace", "keep_both"]);

    static readonly BANNED_ROOT_DIRECTORY_SET = new Set([
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
    static readonly EXCLUDED_PATH_SET = new Set(["ui/_global_variables.json"]);

    static readonly MAGIC = 0x267052a0b125277dn;

    static readonly VERSION = 1;

    static readonly ENTRY_NAME_LENGTH_MAX = 247;

    static readonly HEADER_SIZE = 16;

    static readonly DESCRIPTOR_SIZE = 1 + BrarchiveFilter.ENTRY_NAME_LENGTH_MAX + 8;

    static readonly UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

    /** Current working directory. */
    private readonly cwd: string;

    /** Resolved filter settings. */
    private readonly settings: BrarchiveSettings;

    /**
     * Creates the filter instance.
     *
     * @param cwd - Current working directory.
     * @param rawSettings - Raw JSON settings passed to the filter.
     */
    constructor(cwd: string, rawSettings: Record<string, unknown>) {
        this.cwd = cwd;
        this.settings = this.createSettings(rawSettings);
    }

    /**
     * Runs the full filter pipeline.
     *
     * @throws If no pack directory is found.
     */
    async run(): Promise<void> {
        this.validateSettings();

        const packRootList = this.getPackRoots();

        if (packRootList.length === 0) {
            throw new Error(
                `${BrarchiveFilter.FILTER_IDENTIFIER}: no BP or RP directory found. Run from Regolith's filter context (cwd = temp directory with BP/RP).`
            );
        }

        const options: PackProcessOptions = {
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
    createSettings(rawSettings: Record<string, unknown>): BrarchiveSettings {
        return {
            mode: (rawSettings.mode ?? BrarchiveFilter.DEFAULT_SETTINGS.mode) as BrarchiveMode,
            minify: (rawSettings.minify ?? BrarchiveFilter.DEFAULT_SETTINGS.minify) as boolean,
        };
    }

    /**
     * Validates the current filter settings.
     *
     * @throws If setting values or types are invalid.
     */
    validateSettings(): void {
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
     * @returns Absolute paths to existing pack directories.
     */
    getPackRoots(): string[] {
        return BrarchiveFilter.PACK_DIRECTORY_NAME_LIST.map((directoryName) => path.resolve(this.cwd, directoryName)).filter((packRoot) => {
            try {
                return fs.statSync(packRoot).isDirectory();
            } catch {
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
    toNormalizedPath(filePath: string): string {
        return path.normalize(filePath).split(path.sep).join("/").toLowerCase();
    }

    /**
     * Partitions directory entries into child directories and files.
     *
     * @param entryList - Directory entries to partition.
     *
     * @returns Partitioned entry names.
     */
    partitionEntries(entryList: fs.Dirent[]): PartitionedEntries {
        const result: PartitionedEntries = {
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
    async isValidUtf8(filePath: string): Promise<boolean> {
        try {
            const data = await fs.promises.readFile(filePath);
            BrarchiveFilter.UTF8_DECODER.decode(data);
            return true;
        } catch {
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
    async findTargets(sourceRoot: string): Promise<ArchiveScan> {
        const targets: ArchiveTarget[] = [];
        const archivedFiles = new Set<string>();

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
    async walkArchiveTargets(
        sourceRoot: string,
        currentDirectory: string,
        targets: ArchiveTarget[],
        archivedFiles: Set<string>
    ): Promise<void> {
        const absoluteDirectoryPath = path.resolve(currentDirectory);
        const normalizedDirectoryParts = path.normalize(absoluteDirectoryPath).split(path.sep);

        if (normalizedDirectoryParts.includes(BrarchiveFilter.ARCHIVE_DIRECTORY_NAME)) {
            return;
        }

        const relativeDirectoryPath = path.relative(sourceRoot, absoluteDirectoryPath) || ".";
        const entryList = await fs.promises.readdir(absoluteDirectoryPath, { withFileTypes: true });
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
                    return this.walkArchiveTargets(sourceRoot, path.join(absoluteDirectoryPath, directoryName), targets, archivedFiles);
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
                    relativePath: relativeDirectoryPath,
                });

                fileNameListToArchive.forEach((fileName) => {
                    archivedFiles.add(path.resolve(absoluteDirectoryPath, fileName));
                });
            }
        }

        await Promise.all(
            directoryNameList.map((directoryName) => {
                return this.walkArchiveTargets(sourceRoot, path.join(absoluteDirectoryPath, directoryName), targets, archivedFiles);
            })
        );
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
    serializeBrarchive(entries: Iterable<[string, string]>): Buffer {
        const sortedEntries = [...entries].sort((leftEntry, rightEntry) => {
            return leftEntry[0].localeCompare(rightEntry[0]);
        });
        const entryCount = sortedEntries.length;
        let totalContentLength = 0;

        const descriptorList: EntryDescriptor[] = sortedEntries.map(([entryName, entryContents]) => {
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
     * @param fileName - File name to inspect.
     * @param contents - Raw text file contents.
     * @param shouldMinify - Whether minification is enabled.
     *
     * @returns Minified contents or the original input.
     */
    maybeMinifyContent(fileName: string, contents: string, shouldMinify: boolean): string {
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
     * @param directoryPath - Absolute directory path to archive.
     * @param outputRoot - Absolute archive output root.
     * @param relativePath - Directory path relative to the pack root.
     * @param shouldMinify - Whether JSON files should be minified.
     */
    async encodeDirectoryToBrarchive(
        directoryPath: string,
        outputRoot: string,
        relativePath: string,
        shouldMinify: boolean
    ): Promise<void> {
        const archivePath = path.join(outputRoot, relativePath) + ".brarchive";
        const entryList = await fs.promises.readdir(directoryPath, { withFileTypes: true });
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

        const archiveEntryMap = new Map<string, string>();

        await Promise.all(
            fileEntryList.map(async (entry) => {
                const filePath = path.join(directoryPath, entry.name);
                const contents = await fs.promises.readFile(filePath, "utf8");
                const storedContents = this.maybeMinifyContent(entry.name, contents, shouldMinify);
                archiveEntryMap.set(entry.name, storedContents);
            })
        );

        await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
        await fs.promises.writeFile(archivePath, this.serializeBrarchive(archiveEntryMap));
    }

    /**
     * Removes empty directories under a root while skipping named directories.
     *
     * @param root - Absolute root directory path.
     * @param skipDirectoryNameSet - Directory names that should never be removed.
     */
    async cleanupEmptyDirectories(root: string, skipDirectoryNameSet: Set<string> = new Set()): Promise<void> {
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
    async walkEmptyDirectoryCleanup(root: string, currentDirectory: string, skipDirectoryNameSet: Set<string>): Promise<boolean> {
        const entryList = await fs.promises.readdir(currentDirectory, { withFileTypes: true });
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
                await fs.promises.rmdir(currentDirectory);
            } catch {
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
    async runEncodeWorkers(jobList: EncodeJob[]): Promise<void> {
        if (jobList.length === 0) {
            return;
        }

        const workerCount = Math.min(os.cpus()?.length ?? 4, jobList.length);
        let nextJobIndex = 0;

        const worker = async (): Promise<void> => {
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
     * @param packRoot - Absolute pack root path.
     * @param requireManifest - Whether a missing manifest is an error.
     *
     * @throws If a required manifest is missing.
     */
    async setPackOptimizationVersion(packRoot: string, requireManifest: boolean = true): Promise<void> {
        const manifestPath = path.join(packRoot, "manifest.json");
        let rawManifest: string;

        try {
            rawManifest = await fs.promises.readFile(manifestPath, "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
                if (requireManifest) {
                    throw new Error(
                        `${BrarchiveFilter.FILTER_IDENTIFIER}: manifest.json not found at ${manifestPath}. Ensure the pack has a manifest.`,
                        { cause: error }
                    );
                }

                return;
            }

            throw error;
        }

        const manifest = JsonTools.parse(rawManifest) as Record<string, unknown>;

        if (!manifest.header || typeof manifest.header !== "object" || Array.isArray(manifest.header)) {
            manifest.header = {};
        }

        (manifest.header as Record<string, unknown>).pack_optimization_version = BrarchiveFilter.PACK_OPTIMIZATION_VERSION;

        await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    }

    /**
     * Processes a pack root in place by creating `__brarchive` files beside source content.
     *
     * @param root - Absolute pack root path.
     * @param options - Pack processing options.
     */
    async processPackInPlace(root: string, options: PackProcessOptions = {}): Promise<void> {
        const removeArchivedFiles = options.removeArchivedFiles === true;
        const shouldMinify = options.minify === true;
        const isRootPack = options.isRootPack !== false;
        const absoluteRoot = path.resolve(root);

        await this.setPackOptimizationVersion(absoluteRoot, isRootPack);

        const archiveOutputRoot = path.join(absoluteRoot, BrarchiveFilter.ARCHIVE_DIRECTORY_NAME);

        await fs.promises.mkdir(archiveOutputRoot, { recursive: true });

        const { targets, archivedFiles } = await this.findTargets(absoluteRoot);
        const jobList: EncodeJob[] = targets.map((target) => {
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
            await Promise.all(
                [...archivedFiles].map(async (archivedFilePath) => {
                    try {
                        await fs.promises.unlink(archivedFilePath);
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
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
    async getSubpackDirectoryNameList(packRoot: string): Promise<string[]> {
        const subpacksPath = path.join(packRoot, "subpacks");

        try {
            const entryList = await fs.promises.readdir(subpacksPath, { withFileTypes: true });
            return entryList.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
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
    async processSubpacks(packRoot: string, handler: (subpackDirectoryName: string) => Promise<void>): Promise<void> {
        const subpackDirectoryNameList = await this.getSubpackDirectoryNameList(packRoot);
        await Promise.all(subpackDirectoryNameList.map((subpackDirectoryName) => handler(subpackDirectoryName)));
    }
}
