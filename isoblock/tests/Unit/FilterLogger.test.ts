import assert from "node:assert/strict";
import { describe, test } from "node:test";
import FilterLogger from "../../src/Lib/FilterLogger";
import OutputCapture from "../Helpers/OutputCapture";

describe("FilterLogger.formatMessage", () => {
    const logger = new FilterLogger();

    test("adds the severity prefix", () => {
        assert.equal(logger.formatMessage("boom", "Error"), "Error: boom");
    });

    test("does not duplicate an existing prefix", () => {
        assert.equal(logger.formatMessage("Error: boom", "Error"), "Error: boom");
    });

    test("stringifies non-string messages", () => {
        assert.equal(logger.formatMessage(42, "Warning"), "Warning: 42");
    });
});

describe("FilterLogger output streams", () => {
    const logger = new FilterLogger();

    test("info writes to standard output with a newline", async () => {
        const output = await OutputCapture.record(() => logger.info("hello"));

        assert.equal(output.stdoutText, "hello\n");
        assert.equal(output.stderrText, "");
    });

    test("warn writes a prefixed message to standard error", async () => {
        const output = await OutputCapture.record(() => logger.warn("careful"));

        assert.deepEqual(output.stderrLines, ["Warning: careful"]);
    });

    test("error writes a prefixed message to standard error", async () => {
        const output = await OutputCapture.record(() => logger.error("boom"));

        assert.deepEqual(output.stderrLines, ["Error: boom"]);
    });
});
