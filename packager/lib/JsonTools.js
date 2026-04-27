const fs = require("fs");
const path = require("path");

/**
 * Utilities for reading Minecraft JSON files with comment support.
 */
class JsonTools {
  static COMMENT_PATTERN = /("(?:\\.|[^"\\])*")|(\/\*.*?\*\/|\/\/[^\n]*)/gms;

  /**
   * Removes line and block comments from a JSON-like string.
   *
   * @param {string} jsonText - Raw JSON text that may contain comments.
   *
   * @returns {string} Comment-free JSON text.
   */
  static stripComments(jsonText) {
    return jsonText.replace(JsonTools.COMMENT_PATTERN, (match, quotedValue) => {
      if (quotedValue) {
        return quotedValue;
      }

      return "";
    });
  }

  /**
   * Parses JSON text after stripping comments.
   *
   * @param {string} jsonText - Raw JSON text.
   *
   * @returns {Record<string, any>} Parsed JSON object.
   */
  static parse(jsonText) {
    try {
      return JSON.parse(jsonText);
    } catch (error) {
      return JSON.parse(this.stripComments(jsonText));
    }
  }

  /**
   * Loads and parses a JSON file with comment support.
   *
   * @param {string} filePath - Absolute JSON file path.
   *
   * @returns {Record<string, any>} Parsed JSON object.
   */
  static loadFile(filePath) {
    return this.parse(fs.readFileSync(filePath, "utf8"));
  }

  /**
   * Writes minified JSON to disk.
   *
   * @param {string} filePath - Absolute output file path.
   * @param {Record<string, any>} data - Parsed JSON data to write.
   */
  static writeMinified(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data));
  }

  /**
   * Minifies every JSON file under a directory tree.
   *
   * @param {string} directoryPath - Absolute directory path to process.
   */
  static compressJsonFiles(directoryPath) {
    if (!fs.existsSync(directoryPath)) {
      return;
    }

    const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.resolve(directoryPath, entry.name);

      if (entry.isDirectory()) {
        this.compressJsonFiles(entryPath);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) {
        continue;
      }

      const parsedJson = this.loadFile(entryPath);
      this.writeMinified(entryPath, parsedJson);
    }
  }
}

module.exports = JsonTools;
