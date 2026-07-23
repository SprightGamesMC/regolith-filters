import type { CapturedOutput } from "../Types/ExampleTestTypes";

/**
 * Captures writes to standard output for the duration of a callback.
 */
export default abstract class OutputCapture {
    /**
     * Runs a callback while intercepting `process.stdout.write`.
     *
     * @param action - Callback executed while output is captured.
     *
     * @returns Captured stdout text and its non-empty lines.
     */
    static async record(action: () => void | Promise<void>): Promise<CapturedOutput> {
        const original = process.stdout.write.bind(process.stdout);
        let text = "";

        process.stdout.write = ((chunk: string | Uint8Array): boolean => {
            text += typeof chunk === "string" ? chunk : chunk.toString();

            return true;
        }) as typeof process.stdout.write;

        try {
            await action();
        } finally {
            process.stdout.write = original;
        }

        const lines = text.split("\n").filter((line) => line.length > 0);

        return { lines, text };
    }
}
