import path from "path";
import ContentGuideFilter from "./Lib/ContentGuideFilter";
import Settings from "./Lib/Settings";

/**
 * Runs the content guide filter entry point.
 */
export default class Main {
    /** Levels above the working directory where the project root is when `ROOT_DIR` is unset. */
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
    async run(): Promise<void> {
        const settings = Settings.resolve(process.argv[2]);
        const files = await new ContentGuideFilter(process.cwd(), this.resolveProjectRoot(), settings).run();

        for (const file of files) {
            process.stdout.write(`content_guide: wrote ${file}\n`);
        }
    }

    /**
     * Reports an execution failure to standard error and exits.
     *
     * @param error - Error raised during execution.
     */
    fail(error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);

        process.stderr.write(`content_guide: ${message}\n`);
        process.exit(1);
    }
}

if (require.main === module) {
    const main = new Main();

    main.run().catch((error: unknown) => main.fail(error));
}
