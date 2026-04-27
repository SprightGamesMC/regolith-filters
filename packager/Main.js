const path = require("path");
const Packager = require("./lib/Packager.js");

/**
 * Runs the packager filter entry point.
 */
class Main {
  /**
   * Executes the filter.
   */
  async run() {
    const packager = new Packager(process.cwd(), this.resolveProjectRoot());
    const packagedFiles = await packager.run(process.argv[2]);

    console.log(`Submission file created: ${packagedFiles.submissionFilePath}`);
    console.log(`Game file created: ${packagedFiles.gameFilePath}`);
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
   * @returns {string} Absolute project root path.
   */
  resolveProjectRoot() {
    if (typeof process.env.ROOT_DIR === "string" && process.env.ROOT_DIR.trim() !== "") {
      return path.resolve(process.env.ROOT_DIR);
    }

    return path.resolve(process.cwd(), "../../");
  }
}

module.exports = Main;

if (require.main === module) {
  const main = new Main();

  main.run().catch((error) => {
    main.fail(error);
  });
}
