import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Greeter from "../../src/Lib/Greeter";
import OutputCapture from "../Helpers/OutputCapture";

describe("Greeter.greet", () => {
    test("writes the message once per repeat count", async () => {
        const output = await OutputCapture.record(() => {
            new Greeter({ message: "hi", repeat: 3 }).greet();
        });

        assert.deepEqual(output.lines, ["hi", "hi", "hi"]);
    });

    test("increments the instance count on construction", () => {
        const before = Greeter.instanceCount;

        new Greeter({ message: "hi", repeat: 1 });

        assert.equal(Greeter.instanceCount, before + 1);
    });
});
