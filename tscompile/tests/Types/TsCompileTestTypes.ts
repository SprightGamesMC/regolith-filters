/**
 * Shared type definitions for tscompile tests.
 */

/** Captured standard output and error text. */
export interface CapturedStreams {
    stderrLines: string[];
    stderrText: string;
    stdoutLines: string[];
    stdoutText: string;
}
