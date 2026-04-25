const path = require("path");

/**
 * Provides shared path utilities for the tscompile filter.
 */
class FilterPaths {
  /**
   * Normalizes a relative project path to forward slashes.
   *
   * @param {string} relativePath - Relative path to normalize.
   *
   * @returns {string} Normalized relative path.
   */
  static normalizeRelativePath(relativePath) {
    return path.posix.normalize(relativePath.replace(/\\/g, "/"));
  }

  /**
   * Resolves a project-relative path from the current working directory.
   *
   * @param {string} cwd - Current working directory.
   * @param {string} relativePath - Relative path to resolve.
   *
   * @returns {string} Absolute filesystem path.
   */
  static toAbsolutePath(cwd, relativePath) {
    return path.resolve(cwd, relativePath);
  }

  /**
   * Determines whether one relative path is inside another.
   *
   * @param {string} parentPath - Candidate parent path.
   * @param {string} childPath - Candidate child path.
   *
   * @returns {boolean} True when the child is within the parent.
   */
  static isSubPath(parentPath, childPath) {
    const normalizedParent = this.normalizeRelativePath(parentPath);
    const normalizedChild = this.normalizeRelativePath(childPath);
    const relativePath = path.posix.relative(normalizedParent, normalizedChild);

    return relativePath === "" || (!relativePath.startsWith("..") && !path.posix.isAbsolute(relativePath));
  }

  /**
   * Converts a behavior pack path into a manifest entry path.
   *
   * @param {string} relativePath - Behavior pack file path.
   *
   * @returns {string} Manifest entry path relative to the behavior pack root.
   *
   * @throws {Error} Thrown when the path is not inside `BP`.
   */
  static toManifestPath(relativePath) {
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
   * @param {string} value - Path string to adjust.
   *
   * @returns {string} Path string with trailing slash.
   */
  static ensureTrailingSlash(value) {
    return value.endsWith("/") ? value : `${value}/`;
  }

  /**
   * Joins relative project path segments with normalized separators.
   *
   * @param {...string} pathSegments - Relative path segments to join.
   *
   * @returns {string} Joined relative path.
   */
  static joinRelativePath(...pathSegments) {
    return this.normalizeRelativePath(path.posix.join(...pathSegments));
  }
}

module.exports = FilterPaths;
