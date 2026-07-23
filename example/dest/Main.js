"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Greeter_1 = __importDefault(require("./Lib/Greeter"));
const Settings_1 = __importDefault(require("./Lib/Settings"));
/**
 * Runs the example filter entry point.
 */
class Main {
    /**
     * Executes the filter.
     */
    run() {
        const settings = Settings_1.default.resolve(process.argv[2]);
        const greeter = new Greeter_1.default(settings);
        greeter.greet();
    }
}
exports.default = Main;
if (require.main === module) {
    new Main().run();
}
