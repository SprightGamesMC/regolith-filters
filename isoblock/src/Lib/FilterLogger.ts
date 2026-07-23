/**
 * Creates a standardized console logger for filter output.
 */
export default class FilterLogger {
    /**
     * Normalizes a log message so severity labels are not duplicated.
     *
     * @param message - Raw message value.
     * @param prefix - Severity prefix to enforce.
     *
     * @returns Formatted message string.
     */
    formatMessage(message: unknown, prefix: string): string {
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
    info(message: unknown): void {
        process.stdout.write(`${String(message)}\n`);
    }

    /**
     * Logs a warning message to standard error.
     *
     * @param message - Message to write.
     */
    warn(message: unknown): void {
        console.warn(this.formatMessage(message, "Warning"));
    }

    /**
     * Logs an error message to standard error.
     *
     * @param message - Message to write.
     */
    error(message: unknown): void {
        console.error(this.formatMessage(message, "Error"));
    }
}
