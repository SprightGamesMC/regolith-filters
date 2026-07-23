/**
 * Shared type definitions for brarchive tests.
 */

/** Parsed brarchive header fields. */
export interface ArchiveHeader {
    entryCount: number;
    magic: bigint;
    version: number;
}

/** Decoded archive entry. */
export interface DecodedEntry {
    content: string;
    name: string;
}
