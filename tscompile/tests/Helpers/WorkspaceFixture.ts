import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Temp workspace for building project fixtures on disk.
 */
export default class WorkspaceFixture {
    /** Absolute workspace root path. */
    readonly workspacePath: string;

    /**
     * Creates a fresh temp workspace directory.
     */
    constructor() {
        this.workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), "tscompile-test-"));
    }

    /**
     * Resolves a workspace-relative path to an absolute path.
     *
     * @param relativePath - Path relative to the workspace root.
     *
     * @returns Absolute path.
     */
    resolve(relativePath: string): string {
        return path.join(this.workspacePath, relativePath);
    }

    /**
     * Creates a directory, including parents.
     *
     * @param relativePath - Directory path relative to the workspace root.
     *
     * @returns Absolute directory path.
     */
    makeDirectory(relativePath: string): string {
        const directoryPath = this.resolve(relativePath);
        fs.mkdirSync(directoryPath, { recursive: true });
        return directoryPath;
    }

    /**
     * Writes a file, creating parent directories as needed.
     *
     * @param relativePath - File path relative to the workspace root.
     * @param contents - File contents to write.
     *
     * @returns Absolute file path.
     */
    writeFile(relativePath: string, contents: string | Buffer): string {
        const filePath = this.resolve(relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, contents);
        return filePath;
    }

    /**
     * Reads a file as UTF-8 text.
     *
     * @param relativePath - File path relative to the workspace root.
     *
     * @returns File contents as text.
     */
    readText(relativePath: string): string {
        return fs.readFileSync(this.resolve(relativePath), "utf8");
    }

    /**
     * Checks whether a workspace-relative path exists.
     *
     * @param relativePath - Path relative to the workspace root.
     *
     * @returns `true` when the path exists, `false` otherwise.
     */
    exists(relativePath: string): boolean {
        return fs.existsSync(this.resolve(relativePath));
    }

    /**
     * Deletes the workspace and everything in it.
     */
    dispose(): void {
        fs.rmSync(this.workspacePath, { force: true, recursive: true });
    }
}
