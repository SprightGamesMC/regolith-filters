import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Settings from "../../src/Lib/Settings";

describe("Settings.resolve", () => {
    test("applies the default repeat when omitted", () => {
        assert.deepEqual(Settings.resolve('{"message":"hi"}'), { message: "hi", repeat: 1 });
    });

    test("keeps a provided repeat", () => {
        assert.deepEqual(Settings.resolve('{"message":"hi","repeat":3}'), { message: "hi", repeat: 3 });
    });

    test("trims the message", () => {
        assert.equal(Settings.resolve('{"message":"  hi  "}').message, "hi");
    });
});

describe("Settings.parse", () => {
    test("rejects empty input", () => {
        assert.throws(() => Settings.parse(""), /Missing filter settings/);
    });

    test("rejects invalid JSON", () => {
        assert.throws(() => Settings.parse("{"), /Invalid filter settings/);
    });

    test("rejects non-object JSON", () => {
        assert.throws(() => Settings.parse("[1,2]"), /must be a JSON object/);
    });
});

describe("Settings.readRequiredString", () => {
    test("returns a trimmed value", () => {
        assert.equal(Settings.readRequiredString({ message: " hi " }, "message"), "hi");
    });

    test("rejects missing or empty values", () => {
        assert.throws(() => Settings.readRequiredString({}, "message"), /non-empty string/);
        assert.throws(() => Settings.readRequiredString({ message: "   " }, "message"), /non-empty string/);
    });
});

describe("Settings.readOptionalCount", () => {
    test("returns the fallback when absent", () => {
        assert.equal(Settings.readOptionalCount({}, "repeat", 1), 1);
    });

    test("returns a valid count", () => {
        assert.equal(Settings.readOptionalCount({ repeat: 5 }, "repeat", 1), 5);
    });

    test("rejects out-of-range or non-integer counts", () => {
        assert.throws(() => Settings.readOptionalCount({ repeat: 0 }, "repeat", 1), /between 1 and 10/);
        assert.throws(() => Settings.readOptionalCount({ repeat: 11 }, "repeat", 1), /between 1 and 10/);
        assert.throws(() => Settings.readOptionalCount({ repeat: 2.5 }, "repeat", 1), /between 1 and 10/);
    });
});
