/**
 * Creates a standardized console logger for filter output.
 */
class FilterLogger {
  /**
   * Normalizes a log message so severity labels are not duplicated.
   *
   * @param {unknown} message - Raw message value.
   * @param {string} prefix - Severity prefix to enforce.
   *
   * @returns {string} Formatted message string.
   */
  formatMessage(message, prefix) {
    const normalizedMessage = String(message);

    if (normalizedMessage.startsWith(`${prefix}:`)) {
      return normalizedMessage;
    }

    return `${prefix}: ${normalizedMessage}`;
  }

  /**
   * Logs an informational message.
   *
   * @param {unknown} message - Message to write to stdout.
   */
  info(message) {
    console.log(message);
  }

  /**
   * Logs a warning message.
   *
   * @param {unknown} message - Message to write to stderr.
   */
  warn(message) {
    console.warn(this.formatMessage(message, "Warning"));
  }

  /**
   * Logs an error message.
   *
   * @param {unknown} message - Message to write to stderr.
   */
  error(message) {
    console.error(this.formatMessage(message, "Error"));
  }
}

module.exports = FilterLogger;
