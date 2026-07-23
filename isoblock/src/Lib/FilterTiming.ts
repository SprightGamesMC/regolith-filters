import type FilterLogger from "./FilterLogger";

/**
 * Tracks and logs filter execution timings.
 */
export default class FilterTiming {
    /** Logger used for timing output. */
    private readonly logger: FilterLogger;

    /**
     * Creates the timing helper.
     *
     * @param logger - Logger used for timing output.
     */
    constructor(logger: FilterLogger) {
        this.logger = logger;
    }

    /**
     * Captures a high-resolution start time.
     *
     * @returns Start time from `process.hrtime.bigint()`.
     */
    createTimer(): bigint {
        return process.hrtime.bigint();
    }

    /**
     * Measures and logs a single filter stage.
     *
     * @param label - Human-readable stage label.
     * @param callback - Stage callback to execute.
     *
     * @returns Callback result.
     */
    async timeStage<T>(label: string, callback: () => T | Promise<T>): Promise<T> {
        const stageStartedAt = this.createTimer();
        let failed = true;

        try {
            const result = await callback();
            failed = false;
            return result;
        } finally {
            const duration = this.formatDuration(this.getElapsedMilliseconds(stageStartedAt));
            const status = failed ? "failed" : "completed";
            this.logger.info(`Stage "${label}" ${status} in ${duration}.`);
        }
    }

    /**
     * Logs the duration for a completed task.
     *
     * @param label - Task label to include in the log message.
     * @param startedAt - Start time from `process.hrtime.bigint()`.
     */
    logDuration(label: string, startedAt: bigint): void {
        this.logger.info(`${label} in ${this.formatDuration(this.getElapsedMilliseconds(startedAt))}.`);
    }

    /**
     * Converts a high-resolution timer start point into milliseconds.
     *
     * @param startedAt - Start time from `process.hrtime.bigint()`.
     *
     * @returns Elapsed milliseconds.
     */
    getElapsedMilliseconds(startedAt: bigint): number {
        return Number(process.hrtime.bigint() - startedAt) / 1000000;
    }

    /**
     * Formats a duration for human-readable logging.
     *
     * @param milliseconds - Duration in milliseconds.
     *
     * @returns Formatted duration string.
     */
    formatDuration(milliseconds: number): string {
        if (milliseconds >= 1000) {
            return `${(milliseconds / 1000).toFixed(2)}s`;
        }

        return `${milliseconds.toFixed(1)}ms`;
    }
}
