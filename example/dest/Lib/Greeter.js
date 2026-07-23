"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Writes a configured message to standard output.
 */
class Greeter {
    /** Greeters constructed during the current run. Mutable, so `camelCase`. */
    static instanceCount = 0;
    /** Resolved filter settings. */
    settings;
    /**
     * Creates a greeter for the resolved settings.
     *
     * @param settings - Validated filter settings.
     */
    constructor(settings) {
        this.settings = settings;
        Greeter.instanceCount += 1;
    }
    /**
     * Writes the configured message once per repeat count.
     */
    greet() {
        for (let index = 0; index < this.settings.repeat; index += 1) {
            process.stdout.write(`${this.settings.message}\n`);
        }
    }
}
exports.default = Greeter;
