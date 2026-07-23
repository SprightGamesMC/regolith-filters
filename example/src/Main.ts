import Greeter from "./Lib/Greeter";
import Settings from "./Lib/Settings";

/**
 * Runs the example filter entry point.
 */
export default class Main {
    /**
     * Executes the filter.
     */
    run(): void {
        const settings = Settings.resolve(process.argv[2]);
        const greeter = new Greeter(settings);

        greeter.greet();
    }
}

if (require.main === module) {
    new Main().run();
}
