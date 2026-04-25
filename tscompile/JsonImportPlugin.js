const fs = require("fs");
const path = require("path");
const jsoncParser = require("jsonc-parser");

/**
 * Creates an esbuild plugin that normalizes JSONC syntax.
 */
class JsonImportPlugin {
  /**
   * Creates the plugin instance.
   *
   * @returns {import("esbuild").Plugin} Configured esbuild plugin.
   */
  create() {
    return {
      name: "tscompile-json",
      setup(build) {
        build.onResolve({ filter: /\.json$/ }, (args) => {
          return {
            path: path.resolve(args.resolveDir, args.path),
            namespace: "tscompile-json"
          };
        });

        build.onLoad({ filter: /\.json$/, namespace: "tscompile-json" }, (args) => {
          const contents = fs.readFileSync(args.path, "utf8");
          const parsed = JsonImportPlugin.parseJson(contents, args.path);

          return {
            contents: JSON.stringify(parsed),
            loader: "json"
          };
        });
      }
    };
  }

  /**
   * Parses JSON content with JSONC support.
   *
   * @param {string} contents - Raw imported JSON content.
   * @param {string} filePath - Imported JSON file path.
   *
   * @returns {any} Parsed JSON-compatible value.
   *
   * @throws {Error} Thrown when the content is not valid JSON or JSONC.
   */
  static parseJson(contents, filePath) {
    const errors = [];
    const parsed = jsoncParser.parse(contents, errors, {
      allowTrailingComma: true
    });

    if (errors.length > 0) {
      throw new Error(`Imported JSON file "${filePath}" contains invalid JSONC near character ${errors[0].offset}.`);
    }

    return parsed;
  }
}

module.exports = JsonImportPlugin;
