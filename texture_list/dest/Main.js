"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const TextureListFilter_1 = __importDefault(require("./Lib/TextureListFilter"));
/**
 * Runs the texture list filter entry point.
 */
class Main {
    /** Levels above the working directory where the project root sits when `ROOT_DIR` is unset. */
    static PROJECT_ROOT_FALLBACK_DEPTH = 2;
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
     * Executes the filter against the current working directory.
     */
    run() {
        new TextureListFilter_1.default(process.cwd(), this.resolveProjectRoot()).run();
    }
    /**
     * Reports an execution failure to standard error and exits.
     *
     * @param error - Error raised during execution.
     */
    fail(error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`texture_list: ${message}\n`);
        process.exit(1);
    }
}
exports.default = Main;
if (require.main === module) {
    const main = new Main();
    try {
        main.run();
    }
    catch (error) {
        main.fail(error);
    }
}
