"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
/**
 * Provides shared path utilities for the tscompile filter.
 */
class FilterPaths {
    /**
     * Normalizes a relative project path to forward slashes.
     *
     * @param relativePath - Relative path to normalize.
     *
     * @returns Normalized relative path.
     */
    static normalizeRelativePath(relativePath) {
        return path_1.default.posix.normalize(relativePath.replace(/\\/g, "/"));
    }
    /**
     * Resolves a project-relative path from the current working directory.
     *
     * @param cwd - Current working directory.
     * @param relativePath - Relative path to resolve.
     *
     * @returns Absolute filesystem path.
     */
    static toAbsolutePath(cwd, relativePath) {
        return path_1.default.resolve(cwd, relativePath);
    }
    /**
     * Determines whether one relative path is inside another.
     *
     * @param parentPath - Candidate parent path.
     * @param childPath - Candidate child path.
     *
     * @returns `true` when the child is within the parent.
     */
    static isSubPath(parentPath, childPath) {
        const normalizedParent = this.normalizeRelativePath(parentPath);
        const normalizedChild = this.normalizeRelativePath(childPath);
        const relativePath = path_1.default.posix.relative(normalizedParent, normalizedChild);
        return relativePath === "" || (!relativePath.startsWith("..") && !path_1.default.posix.isAbsolute(relativePath));
    }
    /**
     * Converts a behavior pack path into a manifest entry path.
     *
     * @param relativePath - Behavior pack file path.
     *
     * @returns Manifest entry path relative to the behavior pack root.
     *
     * @throws If the path is not inside `BP`.
     */
    static toManifestPath(relativePath) {
        const normalizedPath = this.normalizeRelativePath(relativePath);
        if (!normalizedPath.startsWith("BP/")) {
            throw new Error(`Expected a behavior pack path that starts with "BP/". Received "${relativePath}", which is outside the behavior pack root.`);
        }
        return normalizedPath.slice("BP/".length);
    }
    /**
     * Adds a trailing slash to a path string when needed.
     *
     * @param value - Path string to adjust.
     *
     * @returns Path string with trailing slash.
     */
    static ensureTrailingSlash(value) {
        return value.endsWith("/") ? value : `${value}/`;
    }
    /**
     * Joins relative project path segments with normalized separators.
     *
     * @param pathSegments - Relative path segments to join.
     *
     * @returns Joined relative path.
     */
    static joinRelativePath(...pathSegments) {
        return this.normalizeRelativePath(path_1.default.posix.join(...pathSegments));
    }
}
exports.default = FilterPaths;
