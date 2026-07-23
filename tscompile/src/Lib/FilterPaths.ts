import path from "path";

/**
 * Provides shared path utilities for the tscompile filter.
 */
export default abstract class FilterPaths {
    /**
     * Normalizes a relative project path to forward slashes.
     *
     * @param relativePath - Relative path to normalize.
     *
     * @returns Normalized relative path.
     */
    static normalizeRelativePath(relativePath: string): string {
        return path.posix.normalize(relativePath.replace(/\\/g, "/"));
    }

    /**
     * Resolves a project-relative path from the current working directory.
     *
     * @param cwd - Current working directory.
     * @param relativePath - Relative path to resolve.
     *
     * @returns Absolute filesystem path.
     */
    static toAbsolutePath(cwd: string, relativePath: string): string {
        return path.resolve(cwd, relativePath);
    }

    /**
     * Determines whether one relative path is inside another.
     *
     * @param parentPath - Candidate parent path.
     * @param childPath - Candidate child path.
     *
     * @returns `true` when the child is within the parent.
     */
    static isSubPath(parentPath: string, childPath: string): boolean {
        const normalizedParent = this.normalizeRelativePath(parentPath);
        const normalizedChild = this.normalizeRelativePath(childPath);
        const relativePath = path.posix.relative(normalizedParent, normalizedChild);

        return relativePath === "" || (!relativePath.startsWith("..") && !path.posix.isAbsolute(relativePath));
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
    static toManifestPath(relativePath: string): string {
        const normalizedPath = this.normalizeRelativePath(relativePath);

        if (!normalizedPath.startsWith("BP/")) {
            throw new Error(
                `Expected a behavior pack path that starts with "BP/". Received "${relativePath}", which is outside the behavior pack root.`
            );
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
    static ensureTrailingSlash(value: string): string {
        return value.endsWith("/") ? value : `${value}/`;
    }

    /**
     * Joins relative project path segments with normalized separators.
     *
     * @param pathSegments - Relative path segments to join.
     *
     * @returns Joined relative path.
     */
    static joinRelativePath(...pathSegments: string[]): string {
        return this.normalizeRelativePath(path.posix.join(...pathSegments));
    }
}
