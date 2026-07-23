import type { BuildOptions } from "esbuild";

/**
 * Shared type definitions for the tscompile filter.
 */

/** Resolved tscompile filter settings. */
export interface TsCompileSettings {
    buildOptions: BuildOptions;
    debuggerProfile?: string;
    disableManifestModification: boolean;
    enableDebugger: boolean;
    keepSource: boolean;
    moduleUUID?: string;
    modules: string[];
    sourceDir: string;
    sourceEntry: string;
}

/** Parsed scripting-module dependency. */
export interface ModuleDefinition {
    name: string;
    version: string;
}

/** Cached path values derived from mutable settings. */
export interface ResolvedPaths {
    activeDistDir: string;
    compiledOutputPath: string;
    derivedOutputPath: string;
    sourceEntryProjectPath: string;
}

/** Cached syntax analysis for a single split-build entry. */
export interface EntryAnalysis {
    entryPoint: string;
    hasCommonJs: boolean;
    hasJsonImport: boolean;
}
