import assert from "node:assert/strict";
import { describe, test } from "node:test";
import FilterLogger from "../../src/Lib/FilterLogger";
import FilterTiming from "../../src/Lib/FilterTiming";
import OutputCapture from "../Helpers/OutputCapture";

describe("FilterTiming.formatDuration", () => {
    const timing = new FilterTiming(new FilterLogger());

    test("formats sub-second durations in milliseconds", () => {
        assert.equal(timing.formatDuration(500), "500.0ms");
    });

    test("formats longer durations in seconds", () => {
        assert.equal(timing.formatDuration(1500), "1.50s");
    });
});

describe("FilterTiming.getElapsedMilliseconds", () => {
    const timing = new FilterTiming(new FilterLogger());

    test("returns a non-negative elapsed time", () => {
        assert.ok(timing.getElapsedMilliseconds(timing.createTimer()) >= 0);
    });
});

describe("FilterTiming.timeStage", () => {
    const timing = new FilterTiming(new FilterLogger());

    test("returns the callback result and logs completion", async () => {
        let stageResult = 0;

        const output = await OutputCapture.record(async () => {
            stageResult = await timing.timeStage("Test Stage", () => 42);
        });

        assert.equal(stageResult, 42);
        assert.match(output.stdoutText, /Stage "Test Stage" completed in /);
    });

    test("logs failure and rethrows", async () => {
        const output = await OutputCapture.record(async () => {
            await assert.rejects(
                timing.timeStage("Broken Stage", () => {
                    throw new Error("stage error");
                }),
                /stage error/
            );
        });

        assert.match(output.stdoutText, /Stage "Broken Stage" failed in /);
    });
});

describe("FilterTiming.logDuration", () => {
    const timing = new FilterTiming(new FilterLogger());

    test("logs the label with a formatted duration", async () => {
        const output = await OutputCapture.record(() => timing.logDuration("Task Done", timing.createTimer()));

        assert.match(output.stdoutText, /Task Done in .+(ms|s)\./);
    });
});
