import type { CapturedStreams } from "../Types/TsCompileTestTypes";

/**
 * Captures writes to standard output and error for the duration of a callback.
 */
export default abstract class OutputCapture {
    /**
     * Runs a callback while intercepting `process.stdout.write` and `process.stderr.write`.
     *
     * @param action - Callback executed while output is captured.
     *
     * @returns CapturedStreams.
     */
    static async record(action: () => void | Promise<void>): Promise<CapturedStreams> {
        const originalStdoutWrite = process.stdout.write.bind(process.stdout);
        const originalStderrWrite = process.stderr.write.bind(process.stderr);
        let stdoutText = "";
        let stderrText = "";

        process.stdout.write = ((chunk: string | Uint8Array): boolean => {
            stdoutText += typeof chunk === "string" ? chunk : chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        process.stderr.write = ((chunk: string | Uint8Array): boolean => {
            stderrText += typeof chunk === "string" ? chunk : chunk.toString();
            return true;
        }) as typeof process.stderr.write;

        try {
            await action();
        } finally {
            process.stdout.write = originalStdoutWrite;
            process.stderr.write = originalStderrWrite;
        }

        return {
            stderrLines: stderrText.split("\n").filter((line) => line.length > 0),
            stderrText,
            stdoutLines: stdoutText.split("\n").filter((line) => line.length > 0),
            stdoutText,
        };
    }
}
