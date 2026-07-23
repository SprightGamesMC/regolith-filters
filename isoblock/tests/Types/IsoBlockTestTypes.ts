/**
 * Shared type definitions for isoblock tests.
 */

/** Captured standard output and error streams. */
export interface CapturedStreams {
    stderrLines: string[];
    stderrText: string;
    stdoutLines: string[];
    stdoutText: string;
}

/** TGA fixture header fields and raw body bytes. */
export interface TgaFixtureOptions {
    body: Buffer;
    height: number;
    identifier?: string;
    imageType?: number;
    pixelDepth?: number;
    topOrigin?: boolean;
    width: number;
}
