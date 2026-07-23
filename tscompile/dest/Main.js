"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const FilterLogger_1 = __importDefault(require("./Lib/FilterLogger"));
const TsCompileFilter_1 = __importDefault(require("./Lib/TsCompileFilter"));
/**
 * Runs the tscompile filter entry point.
 */
class Main {
    static PROJECT_ROOT_FALLBACK_DEPTH = 2;
    /**
     * Parses the raw settings JSON from process arguments.
     *
     * @returns Parsed settings value.
     *
     * @throws If the settings JSON is invalid.
     */
    parseSettings() {
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
    resolveProjectRoot() {
        if (typeof process.env.ROOT_DIR === "string" && process.env.ROOT_DIR.trim() !== "") {
            return path_1.default.resolve(process.env.ROOT_DIR);
        }
        return path_1.default.resolve(process.cwd(), ...new Array(Main.PROJECT_ROOT_FALLBACK_DEPTH).fill(".."));
    }
    /**
     * Executes the filter.
     */
    async run() {
        const filter = new TsCompileFilter_1.default(process.cwd(), this.resolveProjectRoot(), this.parseSettings());
        await filter.run();
    }
    /**
     * Handles uncaught execution failures.
     *
     * @param error - Error raised during execution.
     */
    fail(error) {
        const logger = new FilterLogger_1.default();
        const message = error instanceof Error ? error.stack || error.message : String(error);
        logger.error(message);
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
