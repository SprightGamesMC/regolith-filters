"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const BrarchiveFilter_1 = __importDefault(require("./Lib/BrarchiveFilter"));
const JsonTools_1 = __importDefault(require("./Lib/JsonTools"));
/**
 * Runs the brarchive filter entry point.
 */
class Main {
    /**
     * Parses the raw settings JSON from process arguments.
     *
     * @returns Parsed settings object.
     *
     * @throws If the settings JSON is not a JSON object.
     */
    parseSettings() {
        if (!process.argv[2]) {
            return {};
        }
        const settings = JsonTools_1.default.parse(process.argv[2]);
        if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
            throw new TypeError("Brarchive settings must be a JSON object.");
        }
        return settings;
    }
    /**
     * Executes the filter.
     */
    async run() {
        const filter = new BrarchiveFilter_1.default(process.cwd(), this.parseSettings());
        await filter.run();
    }
    /**
     * Handles uncaught execution failures.
     *
     * @param error - Error raised during execution.
     */
    fail(error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        console.error(message);
        process.exit(1);
    }
}
exports.default = Main;
if (require.main === module) {
    const main = new Main();
    main.run().catch((error) => {
        main.fail(error);
    });
}
