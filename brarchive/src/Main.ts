import BrarchiveFilter from "./Lib/BrarchiveFilter";
import JsonTools from "./Lib/JsonTools";

/**
 * Runs the brarchive filter entry point.
 */
export default class Main {
    /**
     * Parses the raw settings JSON from process arguments.
     *
     * @returns Parsed settings object.
     *
     * @throws If the settings JSON is not a JSON object.
     */
    parseSettings(): Record<string, unknown> {
        if (!process.argv[2]) {
            return {};
        }

        const settings: unknown = JsonTools.parse(process.argv[2]);

        if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
            throw new TypeError("Brarchive settings must be a JSON object.");
        }

        return settings as Record<string, unknown>;
    }

    /**
     * Executes the filter.
     */
    async run(): Promise<void> {
        const filter = new BrarchiveFilter(process.cwd(), this.parseSettings());

        await filter.run();
    }

    /**
     * Handles uncaught execution failures.
     *
     * @param error - Error raised during execution.
     */
    fail(error: unknown): void {
        const message = error instanceof Error ? error.stack || error.message : String(error);

        console.error(message);
        process.exit(1);
    }
}

if (require.main === module) {
    const main = new Main();

    main.run().catch((error) => {
        main.fail(error);
    });
}
