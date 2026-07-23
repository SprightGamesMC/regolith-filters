"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Creates a standardized console logger for filter output.
 */
class FilterLogger {
    /**
     * Normalizes a log message so severity labels are not duplicated.
     *
     * @param message - Raw message value.
     * @param prefix - Severity prefix to enforce.
     *
     * @returns Formatted message string.
     */
    formatMessage(message, prefix) {
        const normalizedMessage = String(message);
        if (normalizedMessage.startsWith(`${prefix}:`)) {
            return normalizedMessage;
        }
        return `${prefix}: ${normalizedMessage}`;
    }
    /**
     * Logs an informational message to standard output.
     *
     * @param message - Message to write.
     */
    info(message) {
        process.stdout.write(`${String(message)}\n`);
    }
    /**
     * Logs a warning message to standard error.
     *
     * @param message - Message to write.
     */
    warn(message) {
        console.warn(this.formatMessage(message, "Warning"));
    }
    /**
     * Logs an error message to standard error.
     *
     * @param message - Message to write.
     */
    error(message) {
        console.error(this.formatMessage(message, "Error"));
    }
}
exports.default = FilterLogger;
