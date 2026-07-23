import path from "path";
import FilterLogger from "./Lib/FilterLogger";
import IsoBlockFilter from "./Lib/IsoBlockFilter";

/**
 * Runs the isoblock filter entry point.
 */
export default class Main {
    static readonly PROJECT_ROOT_FALLBACK_DEPTH = 2;

    /**
     * Parses the raw settings JSON from process arguments.
     *
     * @returns Parsed settings value.
     *
     * @throws If the settings JSON is invalid.
     */
    parseSettings(): unknown {
        if (!process.argv[2]) {
            return {};
        }

        return JSON.parse(process.argv[2]);
    }

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
     * Executes the filter.
     */
    async run(): Promise<void> {
        const filter = new IsoBlockFilter(process.cwd(), this.resolveProjectRoot(), this.parseSettings());

        await filter.run();
    }

    /**
     * Handles uncaught execution failures.
     *
     * @param error - Error raised during execution.
     */
    fail(error: unknown): void {
        const logger = new FilterLogger();
        const message = error instanceof Error ? error.stack || error.message : String(error);

        logger.error(message);
        process.exit(1);
    }
}

if (require.main === module) {
    const main = new Main();

    main.run().catch((error) => {
        main.fail(error);
    });
}
