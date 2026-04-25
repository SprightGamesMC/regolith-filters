const jsoncParser = require("jsonc-parser");

/**
 * Provides JSONC parsing and editing helpers.
 */
class JsoncDocument {
  static FORMATTING_OPTIONS = {
    eol: "\n",
    insertSpaces: true,
    tabSize: 2
  };

  /**
   * Applies a JSONC property update while preserving surrounding comments and formatting.
   *
   * @param {string} documentText - Existing JSONC document text.
   * @param {(string | number)[]} propertyPath - Property path to update.
   * @param {unknown} value - Value to write.
   *
   * @returns {string} Updated JSONC document text.
   *
   * @throws {Error} Thrown when the property update cannot be applied.
   */
  static updateProperty(documentText, propertyPath, value) {
    const edits = jsoncParser.modify(documentText, propertyPath, value, {
      formattingOptions: JsoncDocument.FORMATTING_OPTIONS
    });

    if (!edits.length) {
      throw new Error(`Could not update the JSONC property "${propertyPath.join(".")}".`);
    }

    return jsoncParser.applyEdits(documentText, edits);
  }

  /**
   * Parses a JSONC document with trailing-comma support.
   *
   * @param {string} documentText - JSONC document text.
   * @param {string} filePath - Source file path for diagnostics.
   *
   * @returns {any} Parsed JSON-compatible value.
   *
   * @throws {Error} Thrown when the document contains invalid JSONC syntax.
   */
  static parseDocument(documentText, filePath) {
    const errors = [];
    const parsed = jsoncParser.parse(documentText, errors, {
      allowTrailingComma: true
    });

    if (errors.length > 0) {
      throw new Error(`"${filePath}" contains invalid JSONC near character ${errors[0].offset}.`);
    }

    return parsed;
  }

  /**
   * Ensures persisted JSONC files end with a newline.
   *
   * @param {string} documentText - Document text to normalize.
   *
   * @returns {string} Normalized document text.
   */
  static ensureTrailingNewline(documentText) {
    return documentText.endsWith("\n") ? documentText : `${documentText}\n`;
  }
}

module.exports = JsoncDocument;
