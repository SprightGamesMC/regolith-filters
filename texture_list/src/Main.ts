import path from "path";
import TextureListFilter from "./Lib/TextureListFilter";

/**
 * Runs the texture list filter entry point.
 */
export default class Main {
    /** Levels above the working directory where the project root sits when `ROOT_DIR` is unset. */
    static readonly PROJECT_ROOT_FALLBACK_DEPTH = 2;

    /**
     * Resolves the Regolith project root for the current run.
     *
     * @returns Absolute project root path.
     */
    resolveProjectRoot(): string {
        if (typeof process.env.ROOT_DIR === "string" && process.env.ROOT_DIR.trim() !== "") {
            return path.resolve(process.env.ROOT_DIR);
        }

        return path.resolve(process.cwd(), ...new Array(Main.PROJECT_ROOT_FALLBACK_DEPTH).fill(".."));
    }

    /**
     * Executes the filter against the current working directory.
     */
    run(): void {
        new TextureListFilter(process.cwd(), this.resolveProjectRoot()).run();
    }

    /**
     * Reports an execution failure to standard error and exits.
     *
     * @param error - Error raised during execution.
     */
    fail(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);

        process.stderr.write(`texture_list: ${message}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    const main = new Main();

    try {
        main.run();
    } catch (error) {
        main.fail(error);
    }
}
