import type { ExampleSettings } from "../Types/ExampleTypes";

/**
 * Writes a configured message to standard output.
 */
export default class Greeter {
    /** Greeters constructed during the current run. Mutable, so `camelCase`. */
    static instanceCount = 0;

    /** Resolved filter settings. */
    private readonly settings: ExampleSettings;

    /**
     * Creates a greeter for the resolved settings.
     *
     * @param settings - Validated filter settings.
     */
    constructor(settings: ExampleSettings) {
        this.settings = settings;
        Greeter.instanceCount += 1;
    }

    /**
     * Writes the configured message once per repeat count.
     */
    greet(): void {
        for (let index = 0; index < this.settings.repeat; index += 1) {
            process.stdout.write(`${this.settings.message}\n`);
        }
    }
}
