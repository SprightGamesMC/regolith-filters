/**
 * Shared type definitions for the brarchive filter.
 */

/** Archiving mode. */
export type BrarchiveMode = "replace" | "keep_both";

/** Resolved brarchive filter settings. */
export interface BrarchiveSettings {
    mode: BrarchiveMode;
    minify: boolean;
}

/** Directory eligible for archiving. */
export interface ArchiveTarget {
    directoryPath: string;
    relativePath: string;
}

/** Archive targets discovered under a pack root and the files they cover. */
export interface ArchiveScan {
    archivedFiles: Set<string>;
    targets: ArchiveTarget[];
}

/** Directory entries split into child directories and files. */
export interface PartitionedEntries {
    directoryNameList: string[];
    fileNameList: string[];
}

/** Single archive encoding job. */
export interface EncodeJob {
    directoryPath: string;
    outputRoot: string;
    relativePath: string;
    shouldMinify: boolean;
}

/** Options controlling in-place pack processing. */
export interface PackProcessOptions {
    isRootPack?: boolean;
    minify?: boolean;
    removeArchivedFiles?: boolean;
}
