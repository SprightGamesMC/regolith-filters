// @ts-check
const BrarchiveFilter = require("./BrarchiveFilter.js");

/**
 * Runs the brarchive filter entrypoint.
 */
class Main {
  /**
   * Parses CLI settings JSON.
   *
   * @returns {Record<string, any>} Parsed settings object.
   *
   * @throws {Error} Thrown when the settings JSON is invalid.
   * @throws {TypeError} Thrown when the parsed settings value is not an object.
   */
  parseSettings() {
    if (!process.argv[2]) {
      return {};
    }

    const settings = JSON.parse(process.argv[2]);

    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      throw new TypeError("Brarchive settings must be a JSON object.");
    }

    return settings;
  }

  /**
   * Executes the filter.
   */
  async run() {
    const filter = new BrarchiveFilter(process.cwd(), this.parseSettings());
    await filter.run();
  }

  /**
   * Handles uncaught execution failures.
   *
   * @param {unknown} error - Error raised during execution.
   */
  fail(error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(message);
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
