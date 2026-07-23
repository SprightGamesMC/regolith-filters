"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const Packager_1 = __importDefault(require("./Lib/Packager"));
/**
 * Runs the packager filter entry point.
 */
class Main {
    /**
     * Executes the filter.
     */
    async run() {
        const packager = new Packager_1.default(process.cwd(), this.resolveProjectRoot());
        const packagedFiles = await packager.run(process.argv[2]);
        process.stdout.write(`Submission file created: ${packagedFiles.submissionFilePath}\n`);
        process.stdout.write(`Game file created: ${packagedFiles.gameFilePath}\n`);
    }
    /**
     * Handles uncaught execution failures.
     */
    fail(error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        console.error(message);
        process.exit(1);
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
        return path_1.default.resolve(process.cwd(), "../../");
    }
}
exports.default = Main;
if (require.main === module) {
    const main = new Main();
    main.run().catch((error) => {
        main.fail(error);
    });
}
