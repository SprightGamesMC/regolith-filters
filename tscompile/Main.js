// @ts-check
const path = require("path");
const FilterLogger = require("./FilterLogger.js");
const TsCompileFilter = require("./TsCompileFilter.js");

/**
 * Runs the tscompile filter entrypoint.
 */
class Main {
  static PROJECT_ROOT_FALLBACK_DEPTH = 2;

  /**
   * Parses CLI settings JSON.
   *
   * @returns {Record<string, any>} Parsed settings object.
   *
   * @throws {Error} Thrown when the settings JSON is invalid.
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
   * @returns {string} Absolute project root path.
   */
  resolveProjectRoot() {
    if (typeof process.env.ROOT_DIR === "string" && process.env.ROOT_DIR.trim() !== "") {
      return path.resolve(process.env.ROOT_DIR);
    }

    return path.resolve(process.cwd(), ...new Array(Main.PROJECT_ROOT_FALLBACK_DEPTH).fill(".."));
  }

  /**
   * Executes the filter.
   */
  async run() {
    const filter = new TsCompileFilter(process.cwd(), this.resolveProjectRoot(), this.parseSettings());
    await filter.run();
  }

  /**
   * Handles uncaught execution failures.
   *
   * @param {unknown} error - Error raised during execution.
   */
  fail(error) {
    const logger = new FilterLogger();
    const message = error instanceof Error ? error.stack || error.message : String(error);
    logger.error(message);
    process.exit(1);
  }
}

module.exports = Main;

if (require.main === module) {
  const main = new Main();

  main.run().catch((error) => {
    main.fail(error);
  });
}
