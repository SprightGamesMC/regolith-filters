import fs from "fs";
import os from "os";
import path from "path";
import archiver from "archiver";
import Arguments from "./Arguments";
import AssetOutputNames from "./AssetOutputNames";
import AssetValidator from "./AssetValidator";
import JsonTools from "./JsonTools";
import PackManifest from "./PackManifest";
import { CONTENT_TYPE_PACK_RULES } from "../Data/AssetRequirements";
import type {
    ArtAsset,
    BuildState,
    ManifestState,
    PackReference,
    PackSourceState,
    PackagedFiles,
    ResolvedArgs,
    StageState,
} from "../Types/PackagerTypes";

type Archive = archiver.Archiver;

/**
 * Orchestrates the full packaging pipeline.
 */
export default class Packager {
    static readonly ARCHIVE_COMPRESSION_LEVEL = 0;

    static readonly ARCHIVE_STAT_CONCURRENCY = 32;

    static readonly STORED_ARCHIVE_EXTENSION_SET = new Set([
        ".jpeg",
        ".jpg",
        ".mcaddon",
        ".mcpack",
        ".mctemplate",
        ".ogg",
        ".psd",
        ".png",
        ".zip",
    ]);

    cwd: string;

    projectRoot: string;

    /**
     * Creates the packager instance.
     *
     * @param cwd - Current Regolith workspace path.
     * @param projectRoot - Absolute project root path.
     */
    constructor(cwd: string, projectRoot: string) {
        this.cwd = cwd;
        this.projectRoot = projectRoot;
    }

    /**
     * Executes the full packaging workflow.
     *
     * @param rawJson - Raw filter settings JSON.
     *
     * @returns Generated output file paths.
     */
    async run(rawJson: string): Promise<PackagedFiles> {
        const args = Arguments.resolve(rawJson, {
            cwd: this.cwd,
            projectRoot: this.projectRoot,
        });
        const assetErrors = await AssetValidator.validate(args);
        const packErrors = this.collectPackErrors(args);
        let stageState: StageState | null = null;

        if (assetErrors.length > 0 || packErrors.length > 0) {
            throw new Error(this.formatValidationErrors(assetErrors, packErrors));
        }

        try {
            stageState = this.stage(args);
            const buildState = this.createBuildState(stageState.buildTempPath, args);
            const submissionFilePath = await this.createSubmissionZip(stageState, buildState.submissionTempPath, args);

            this.publishBuiltFile(submissionFilePath, buildState.submissionOutputPath);

            const gameFilePath = await this.createGameFile(stageState, buildState.gameTempPath, args);

            this.publishBuiltFile(gameFilePath, buildState.gameOutputPath);

            return {
                gameFilePath: buildState.gameOutputPath,
                submissionFilePath: buildState.submissionOutputPath,
            };
        } finally {
            if (stageState) {
                fs.rmSync(stageState.buildTempPath, { force: true, recursive: true });
            }
        }
    }

    /**
     * Collects missing pack-input errors before staging starts.
     *
     * @param args - Validated packager arguments.
     *
     * @returns Pack validation error messages.
     */
    collectPackErrors(args: ResolvedArgs): string[] {
        const errors: string[] = [];
        const packRules = CONTENT_TYPE_PACK_RULES[args.contentType];

        if (packRules.requiresBehaviorPack && !this.isExistingDirectory(args.packPaths.behaviorPackPath)) {
            errors.push(`[Pack Content] missing required behavior pack folder: ${args.packPaths.behaviorPackPath}`);
        }

        if (packRules.requiresResourcePack && !this.isExistingDirectory(args.packPaths.resourcePackPath)) {
            errors.push(`[Pack Content] missing required resource pack folder: ${args.packPaths.resourcePackPath}`);
        }

        if (packRules.requiresWorldTemplate && !this.isExistingDirectory(args.packPaths.worldPath)) {
            errors.push(`[Pack Content] missing required world template folder: ${args.packPaths.worldPath}`);
        }

        if (packRules.requiresSkinPack && !this.isExistingDirectory(args.packPaths.skinPackPath)) {
            errors.push(`[Pack Content] missing required skin pack folder: ${args.packPaths.skinPackPath}`);
        }

        this.collectManifestErrors(errors, args.packPaths.behaviorPackPath, "behavior pack");
        this.collectManifestErrors(errors, args.packPaths.resourcePackPath, "resource pack");
        this.collectManifestErrors(errors, args.packPaths.skinPackPath, "skin pack");
        this.collectManifestErrors(errors, args.packPaths.worldPath, "world template");

        return errors;
    }

    /**
     * Adds a validation error when an existing pack folder is missing `manifest.json`.
     *
     * @param errors - Mutable validation error list.
     * @param packPath - Candidate pack directory path.
     * @param packLabel - Human-readable pack label.
     */
    collectManifestErrors(errors: string[], packPath: string | null, packLabel: string): void {
        if (!this.isExistingDirectory(packPath)) {
            return;
        }

        const manifestState = this.resolvePackManifestState(packPath as string);

        if (manifestState.status === "exact") {
            return;
        }

        errors.push(`[Pack Content] missing required manifest.json for ${packLabel}: ${manifestState.expectedPath}`);
    }

    /**
     * Creates the archive source state for packaging.
     *
     * @param args - Validated packager arguments.
     *
     * @returns Archive source state used for archive generation.
     */
    stage(args: ResolvedArgs): StageState {
        const buildTempPath = fs.mkdtempSync(path.resolve(os.tmpdir(), "packager-build-"));

        try {
            return {
                behaviorPack: this.createPackSourceState(args.packPaths.behaviorPackPath, args, "behavior_pack"),
                buildTempPath,
                resourcePack: this.createPackSourceState(args.packPaths.resourcePackPath, args, "resource_pack"),
                skinPack: this.createPackSourceState(args.packPaths.skinPackPath, args, "skin_pack"),
                worldTemplate: this.createPackSourceState(args.packPaths.worldPath, args, "world_template"),
            };
        } catch (error) {
            fs.rmSync(buildTempPath, { force: true, recursive: true });
            throw error;
        }
    }

    /**
     * Creates archive source metadata for a pack directory.
     *
     * @param sourcePath - Absolute source directory path.
     * @param args - Validated packager arguments.
     * @param packKind - Pack kind identifier.
     *
     * @returns Pack source metadata.
     */
    createPackSourceState(sourcePath: string | null, args: ResolvedArgs, packKind: string): PackSourceState | null {
        if (!this.isExistingDirectory(sourcePath)) {
            return null;
        }

        const resolvedSourcePath = sourcePath as string;
        const manifestState = this.resolvePackManifestState(resolvedSourcePath);
        const manifestPath = manifestState.expectedPath;
        const hasManifest = manifestState.status === "exact";
        const manifestOptions = {
            contentType: args.contentType,
            contentVersion: args.contentVersion,
            minEngineVersion: args.minEngineVersion,
            packKind,
        };
        const manifestData = hasManifest ? PackManifest.createUpdatedManifestData(manifestPath, manifestOptions) : null;
        const manifestContent = manifestData ? JSON.stringify(manifestData) : null;
        const packReference =
            manifestData && args.contentType === "world" && this.isWorldPackKind(packKind)
                ? PackManifest.createWorldPackReference(manifestData, args.contentVersion, manifestPath)
                : null;

        return {
            filePathList: this.listFilesRecursive(resolvedSourcePath, this.createExcludedPackFilePathSet(args, packKind)),
            manifestContent,
            packReference,
            sourcePath: resolvedSourcePath,
        };
    }

    /**
     * Creates temporary and final archive paths for the build phase.
     *
     * @param buildTempPath - Absolute temporary build output path.
     * @param args - Validated packager arguments.
     *
     * @returns Archive path state.
     */
    createBuildState(buildTempPath: string, args: ResolvedArgs): BuildState {
        const extension = CONTENT_TYPE_PACK_RULES[args.contentType].gameExtension;

        return {
            gameOutputPath: path.resolve(args.buildPath, `${args.archiveContentName}.${extension}`),
            gameTempPath: path.resolve(buildTempPath, `${args.archiveContentName}.${extension}`),
            submissionOutputPath: path.resolve(args.buildPath, `${args.archiveContentName}.zip`),
            submissionTempPath: path.resolve(buildTempPath, `${args.archiveContentName}.zip`),
        };
    }

    /**
     * Creates the submission zip archive.
     *
     * @param stageState - Archive source state.
     * @param outputPath - Absolute submission zip output path.
     * @param args - Validated packager arguments.
     *
     * @returns Absolute submission zip path.
     */
    async createSubmissionZip(stageState: StageState, outputPath: string, args: ResolvedArgs): Promise<string> {
        await this.createArchive(outputPath, async (archive) => {
            if (args.contentType === "addon") {
                this.appendPackDirectory(
                    archive,
                    stageState.behaviorPack,
                    this.joinArchivePath("Content/behavior_packs", `BP_${args.contentAcronym}`)
                );
                this.appendPackDirectory(
                    archive,
                    stageState.resourcePack,
                    this.joinArchivePath("Content/resource_packs", `RP_${args.contentAcronym}`)
                );
            } else if (args.contentType === "world") {
                this.appendPackDirectory(archive, stageState.worldTemplate, "Content/world_template");

                if (stageState.behaviorPack) {
                    this.appendPackDirectory(
                        archive,
                        stageState.behaviorPack,
                        this.joinArchivePath("Content/world_template/behavior_packs", `BP_${args.contentAcronym}`)
                    );
                }

                if (stageState.resourcePack) {
                    this.appendPackDirectory(
                        archive,
                        stageState.resourcePack,
                        args.isStandaloneRp
                            ? this.joinArchivePath("Content/resource_packs", `RP_${args.contentAcronym}`)
                            : this.joinArchivePath("Content/world_template/resource_packs", `RP_${args.contentAcronym}`)
                    );
                }

                if (stageState.skinPack) {
                    this.appendPackDirectory(archive, stageState.skinPack, "Content/skin_pack");
                }

                this.appendWorldPackReferenceFiles(archive, stageState, "Content/world_template");
            } else if (args.contentType === "texture_pack") {
                this.appendPackDirectory(
                    archive,
                    stageState.resourcePack,
                    this.joinArchivePath("Content/resource_packs", `RP_${args.contentAcronym}`)
                );
            } else if (args.contentType === "skin_pack") {
                this.appendPackDirectory(archive, stageState.skinPack, "Content/skin_pack");
            }

            await this.appendMarketingArt(archive, args);
            await this.appendStoreArt(archive, args);
        });

        return outputPath;
    }

    /**
     * Creates the in-game package file for the selected content type.
     *
     * @param stageState - Archive source state returned by `stage()`.
     * @param outputPath - Absolute game package output path.
     * @param args - Validated packager arguments.
     *
     * @returns Absolute game package file path.
     */
    async createGameFile(stageState: StageState, outputPath: string, args: ResolvedArgs): Promise<string> {
        await this.createArchive(outputPath, (archive) => {
            if (args.contentType === "addon") {
                this.appendPackDirectory(archive, stageState.behaviorPack, "BP");
                this.appendPackDirectory(archive, stageState.resourcePack, "RP");
                return;
            }

            if (args.contentType === "world") {
                this.appendPackDirectory(archive, stageState.worldTemplate, "");

                if (stageState.behaviorPack) {
                    this.appendPackDirectory(
                        archive,
                        stageState.behaviorPack,
                        this.joinArchivePath("behavior_packs", `BP_${args.contentAcronym}`)
                    );
                }

                if (stageState.resourcePack) {
                    this.appendPackDirectory(
                        archive,
                        stageState.resourcePack,
                        this.joinArchivePath("resource_packs", `RP_${args.contentAcronym}`)
                    );
                }

                this.appendWorldPackReferenceFiles(archive, stageState, "");

                return;
            }

            if (args.contentType === "texture_pack") {
                this.appendPackDirectory(archive, stageState.resourcePack, "");
                return;
            }

            this.appendPackDirectory(archive, stageState.skinPack, "");
        });

        return outputPath;
    }

    /**
     * Appends marketing art entries directly from source files.
     *
     * @param archive - Active archive instance.
     * @param args - Validated packager arguments.
     */
    async appendMarketingArt(archive: Archive, args: ResolvedArgs): Promise<void> {
        await this.appendArtAsset(
            archive,
            args.art.marketing.key_art,
            this.joinArchivePath(
                "Marketing Art",
                AssetOutputNames.createMarketingKeyArtName(args.marketingAssetContentName, args.art.marketing.key_art)
            )
        );

        if (Array.isArray(args.art.marketing.screenshots)) {
            for (let index = 0; index < args.art.marketing.screenshots.length; index += 1) {
                await this.appendArtAsset(
                    archive,
                    args.art.marketing.screenshots[index],
                    this.joinArchivePath(
                        "Marketing Art",
                        AssetOutputNames.createMarketingScreenshotName(
                            args.marketingAssetContentName,
                            index,
                            args.art.marketing.screenshots[index]
                        )
                    )
                );
            }
        }

        if (args.art.marketing.partner_art) {
            await this.appendArtAsset(
                archive,
                args.art.marketing.partner_art,
                this.joinArchivePath(
                    "Marketing Art",
                    AssetOutputNames.createMarketingPartnerArtName(args.marketingAssetContentName, args.art.marketing.partner_art)
                )
            );
        }
    }

    /**
     * Appends store art entries directly from source files.
     *
     * @param archive - Active archive instance.
     * @param args - Validated packager arguments.
     */
    async appendStoreArt(archive: Archive, args: ResolvedArgs): Promise<void> {
        await this.appendArtAsset(
            archive,
            args.art.store.key_art,
            this.joinArchivePath("Store Art", AssetOutputNames.createStoreKeyArtName(args.storeAssetContentName))
        );

        if (Array.isArray(args.art.store.screenshots)) {
            for (let index = 0; index < args.art.store.screenshots.length; index += 1) {
                await this.appendArtAsset(
                    archive,
                    args.art.store.screenshots[index],
                    this.joinArchivePath("Store Art", AssetOutputNames.createStoreScreenshotName(args.storeAssetContentName, index))
                );
            }
        }

        if (args.art.store.panorama) {
            await this.appendArtAsset(
                archive,
                args.art.store.panorama,
                this.joinArchivePath("Store Art", AssetOutputNames.createStorePanoramaName(args.storeAssetContentName))
            );
        }

        if (args.art.store.pack_icon) {
            await this.appendArtAsset(
                archive,
                args.art.store.pack_icon,
                this.joinArchivePath("Store Art", AssetOutputNames.createStorePackIconName(args.storeAssetContentName))
            );
        }
    }

    /**
     * Appends a single art asset.
     *
     * @param archive - Active archive instance.
     * @param asset - Asset source metadata.
     * @param archivePath - Archive-relative output path.
     */
    async appendArtAsset(archive: Archive, asset: ArtAsset | undefined, archivePath: string): Promise<void> {
        if (!asset) {
            return;
        }

        archive.file(asset.sourcePath, {
            name: archivePath,
            store: this.shouldStoreArchiveEntry(archivePath),
        } as archiver.ZipEntryData);
    }

    /**
     * Appends a pack directory to an archive, replacing `manifest.json` when needed.
     *
     * @param archive - Active archive instance.
     * @param packState - Pack source metadata.
     * @param archiveRootPath - Archive-relative pack root path.
     */
    appendPackDirectory(archive: Archive, packState: PackSourceState | null, archiveRootPath: string): void {
        if (!packState) {
            return;
        }

        for (const relativePath of packState.filePathList) {
            const normalizedRelativePath = this.normalizeArchivePath(relativePath);
            const destinationPath = this.joinArchivePath(archiveRootPath, normalizedRelativePath);

            if (normalizedRelativePath === "manifest.json" && typeof packState.manifestContent === "string") {
                archive.append(packState.manifestContent, {
                    name: destinationPath,
                });
                continue;
            }

            if (normalizedRelativePath.toLowerCase().endsWith(".json")) {
                archive.append(JSON.stringify(JsonTools.loadFile(path.resolve(packState.sourcePath, relativePath))), {
                    name: destinationPath,
                });
                continue;
            }

            archive.file(path.resolve(packState.sourcePath, relativePath), {
                name: destinationPath,
                store: this.shouldStoreArchiveEntry(destinationPath),
            } as archiver.ZipEntryData);
        }
    }

    /**
     * Appends generated world pack-reference files for the active world template.
     *
     * @param archive - Active archive instance.
     * @param stageState - Archive source state returned by `stage()`.
     * @param archiveRootPath - Archive-relative world-template root path.
     */
    appendWorldPackReferenceFiles(archive: Archive, stageState: StageState, archiveRootPath: string): void {
        this.appendWorldPackReferenceFile(
            archive,
            stageState.behaviorPack?.packReference || null,
            this.joinArchivePath(archiveRootPath, "world_behavior_packs.json")
        );
        this.appendWorldPackReferenceFile(
            archive,
            stageState.resourcePack?.packReference || null,
            this.joinArchivePath(archiveRootPath, "world_resource_packs.json")
        );
    }

    /**
     * Appends a generated world pack-reference file when reference data exists.
     *
     * @param archive - Active archive instance.
     * @param packReference - World pack reference entry.
     * @param archivePath - Archive-relative JSON file path.
     */
    appendWorldPackReferenceFile(archive: Archive, packReference: PackReference | null, archivePath: string): void {
        if (!packReference) {
            return;
        }

        archive.append(JSON.stringify([packReference]), {
            name: archivePath,
        });
    }

    /**
     * Creates the file-exclusion set for a staged pack directory.
     *
     * @param args - Validated packager arguments.
     * @param packKind - Pack kind identifier.
     *
     * @returns Normalized excluded file paths.
     */
    createExcludedPackFilePathSet(args: ResolvedArgs, packKind: string): Set<string> | null {
        if (args.contentType !== "world" || packKind !== "world_template") {
            return null;
        }

        return new Set(["world_behavior_packs.json", "world_resource_packs.json"]);
    }

    /**
     * Determines whether a pack kind should produce a world pack reference.
     *
     * @param packKind - Pack kind identifier.
     *
     * @returns `true` when the pack kind is a world-linked BP or RP.
     */
    isWorldPackKind(packKind: string): boolean {
        return packKind === "behavior_pack" || packKind === "resource_pack";
    }

    /**
     * Recursively lists all files under a directory.
     *
     * @param rootPath - Absolute source directory path.
     * @param excludePathSet - Normalized relative file paths to skip.
     *
     * @returns Relative file paths.
     */
    listFilesRecursive(rootPath: string, excludePathSet: Set<string> | null = null): string[] {
        const filePathList: string[] = [];
        const directoryStack: string[] = [""];

        while (directoryStack.length > 0) {
            const currentRelativePath = directoryStack.pop() as string;
            const currentAbsolutePath = currentRelativePath ? path.resolve(rootPath, currentRelativePath) : rootPath;
            const entries = fs.readdirSync(currentAbsolutePath, {
                withFileTypes: true,
            });

            for (const entry of entries) {
                const entryRelativePath = currentRelativePath ? path.join(currentRelativePath, entry.name) : entry.name;

                if (entry.isDirectory()) {
                    directoryStack.push(entryRelativePath);
                    continue;
                }

                if (entry.isFile()) {
                    const normalizedEntryRelativePath = this.normalizeArchivePath(entryRelativePath);

                    if (excludePathSet && excludePathSet.has(normalizedEntryRelativePath.toLowerCase())) {
                        continue;
                    }

                    filePathList.push(entryRelativePath);
                }
            }
        }

        return filePathList;
    }

    /**
     * Normalizes an archive path to forward slashes.
     *
     * @param value - Candidate archive path.
     *
     * @returns Normalized archive path.
     */
    normalizeArchivePath(value: string): string {
        return value.replace(/\\/g, "/");
    }

    /**
     * Joins archive-relative path segments.
     *
     * @param segments - Path segments to join.
     *
     * @returns Joined archive path.
     */
    joinArchivePath(...segments: string[]): string {
        const filteredSegments = segments.filter((segment) => typeof segment === "string" && segment !== "");

        if (filteredSegments.length === 0) {
            return "";
        }

        return path.posix.join(...filteredSegments.map((segment) => this.normalizeArchivePath(segment)));
    }

    /**
     * Determines whether an archive entry should be stored without deflate compression.
     *
     * @param archivePath - Archive-relative path.
     *
     * @returns `true` when the file extension is already compressed.
     */
    shouldStoreArchiveEntry(archivePath: string): boolean {
        return Packager.STORED_ARCHIVE_EXTENSION_SET.has(path.extname(archivePath).toLowerCase());
    }

    /**
     * Moves a built temp archive into its final output path.
     *
     * @param sourcePath - Temporary built archive path.
     * @param destinationPath - Final archive destination path.
     */
    publishBuiltFile(sourcePath: string, destinationPath: string): void {
        const replacementPath = this.createTemporarySiblingPath(destinationPath, "replacement");
        let backupPath: string | null;

        try {
            this.moveBuiltFile(sourcePath, replacementPath);

            if (!fs.existsSync(destinationPath)) {
                fs.renameSync(replacementPath, destinationPath);
                return;
            }

            backupPath = this.createTemporarySiblingPath(destinationPath, "backup");

            fs.renameSync(destinationPath, backupPath);

            try {
                fs.renameSync(replacementPath, destinationPath);
            } catch (error) {
                if (!fs.existsSync(destinationPath) && fs.existsSync(backupPath)) {
                    fs.renameSync(backupPath, destinationPath);
                }

                throw error;
            }

            this.cleanupTemporaryArtifact(backupPath);
        } catch (error) {
            fs.rmSync(replacementPath, { force: true });
            throw error;
        }
    }

    /**
     * Moves a built archive to a destination path, handling cross-device moves safely.
     *
     * @param sourcePath - Temporary built archive path.
     * @param destinationPath - Destination path in the output directory.
     */
    moveBuiltFile(sourcePath: string, destinationPath: string): void {
        try {
            fs.renameSync(sourcePath, destinationPath);
        } catch (error) {
            if (!error || (error as NodeJS.ErrnoException).code !== "EXDEV") {
                throw error;
            }

            fs.copyFileSync(sourcePath, destinationPath);
            fs.rmSync(sourcePath, { force: true });
        }
    }

    /**
     * Creates a unique temporary sibling path beside the destination artifact.
     *
     * @param destinationPath - Final artifact path.
     * @param label - Label describing the temporary file role.
     *
     * @returns Unique sibling temp file path.
     */
    createTemporarySiblingPath(destinationPath: string, label: string): string {
        const destinationDirectoryPath = path.dirname(destinationPath);
        const destinationBaseName = path.basename(destinationPath);
        const uniqueToken = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        return path.resolve(destinationDirectoryPath, `.${destinationBaseName}.${label}.${uniqueToken}.tmp`);
    }

    /**
     * Removes a temporary artifact without treating cleanup failure as a publish failure.
     *
     * @param filePath - Temporary artifact path.
     */
    cleanupTemporaryArtifact(filePath: string | null): void {
        if (!filePath || !fs.existsSync(filePath)) {
            return;
        }

        try {
            fs.rmSync(filePath, { force: true });
        } catch {
            console.warn(`Could not remove temporary packager artifact: ${filePath}`);
        }
    }

    /**
     * Writes a zip archive using a caller-provided builder callback.
     *
     * @param outputPath - Absolute archive output path.
     * @param archiveBuilder - Callback that populates the archive.
     */
    createArchive(outputPath: string, archiveBuilder: (archive: Archive) => Promise<void> | void): Promise<void> {
        return new Promise((resolve, reject) => {
            const outputStream = fs.createWriteStream(outputPath);
            const archive = archiver("zip", {
                statConcurrency: Packager.ARCHIVE_STAT_CONCURRENCY,
                zlib: {
                    level: Packager.ARCHIVE_COMPRESSION_LEVEL,
                },
            });

            outputStream.on("close", resolve);
            outputStream.on("error", reject);
            archive.on("error", reject);

            archive.pipe(outputStream);
            Promise.resolve()
                .then(() => archiveBuilder(archive))
                .then(() => archive.finalize())
                .catch(reject);
        });
    }

    /**
     * Formats grouped validation errors into a single failure message.
     *
     * @param assetErrors - Asset validation failures.
     * @param packErrors - Pack validation failures.
     *
     * @returns Combined error message.
     */
    formatValidationErrors(assetErrors: string[], packErrors: string[]): string {
        const errors = [...assetErrors, ...packErrors];

        return `${errors.length} packaging validation failure(s):\n${errors.map((entry) => `  ${entry}`).join("\n")}`;
    }

    /**
     * Determines whether a path points to an existing directory.
     *
     * @param directoryPath - Candidate directory path.
     *
     * @returns `true` when the directory exists.
     */
    isExistingDirectory(directoryPath: string | null): boolean {
        if (!directoryPath) {
            return false;
        }

        return fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
    }

    /**
     * Resolves manifest state for a pack directory, enforcing exact filename casing.
     *
     * @param packPath - Absolute pack directory path.
     *
     * @returns Manifest lookup result.
     */
    resolvePackManifestState(packPath: string): ManifestState {
        const exactManifestPath = path.resolve(packPath, "manifest.json");
        const manifestEntries = fs.readdirSync(packPath, {
            withFileTypes: true,
        });
        const exactManifestEntry = manifestEntries.find((entry) => entry.isFile() && entry.name === "manifest.json");

        if (exactManifestEntry) {
            return {
                actualPath: exactManifestPath,
                expectedPath: exactManifestPath,
                status: "exact",
            };
        }

        const manifestEntry = manifestEntries.find((entry) => entry.isFile() && entry.name.toLowerCase() === "manifest.json");

        if (!manifestEntry) {
            return {
                actualPath: null,
                expectedPath: exactManifestPath,
                status: "missing",
            };
        }

        return {
            actualPath: path.resolve(packPath, manifestEntry.name),
            expectedPath: exactManifestPath,
            status: "case_mismatch",
        };
    }
}
