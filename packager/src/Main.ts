import path from "path";
import Packager from "./Lib/Packager";

/**
 * Runs the packager filter entry point.
 */
export default class Main {
    /**
     * Executes the filter.
     */
    async run(): Promise<void> {
        const packager = new Packager(process.cwd(), this.resolveProjectRoot());
        const packagedFiles = await packager.run(process.argv[2]);

        process.stdout.write(`Submission file created: ${packagedFiles.submissionFilePath}\n`);
        process.stdout.write(`Game file created: ${packagedFiles.gameFilePath}\n`);
    }

    /**
     * Handles uncaught execution failures.
     */
    fail(error: unknown): void {
        const message = error instanceof Error ? error.stack || error.message : String(error);

        console.error(message);
        process.exit(1);
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

        return path.resolve(process.cwd(), "../../");
    }
}

if (require.main === module) {
    const main = new Main();

    main.run().catch((error) => {
        main.fail(error);
    });
}
