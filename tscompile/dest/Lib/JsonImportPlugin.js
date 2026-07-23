"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Creates an esbuild plugin that normalizes JSONC syntax.
 */
class JsonImportPlugin {
    /**
     * Creates the plugin instance.
     *
     * @returns Configured esbuild plugin.
     */
    create() {
        return {
            name: "tscompile-json",
            setup(build) {
                build.onResolve({ filter: /\.json$/ }, (args) => {
                    return {
                        path: path_1.default.resolve(args.resolveDir, args.path),
                        namespace: "tscompile-json",
                    };
                });
                build.onLoad({ filter: /\.json$/, namespace: "tscompile-json" }, (args) => {
                    const contents = fs_1.default.readFileSync(args.path, "utf8");
                    const parsed = JsonImportPlugin.parseJson(contents, args.path);
                    return {
                        contents: JSON.stringify(parsed),
                        loader: "json",
                    };
                });
            },
        };
    }
    /**
     * Parses JSON content with JSONC support.
     *
     * @param contents - Raw imported JSON content.
     * @param filePath - Imported JSON file path.
     *
     * @returns Parsed JSON-compatible value.
     *
     * @throws If the content is not valid JSON or JSONC.
     */
    static parseJson(contents, filePath) {
        try {
            return JsonTools_1.default.parse(contents);
        }
        catch (error) {
            throw new Error(`Imported JSON file "${filePath}" contains invalid JSON.`, { cause: error });
        }
    }
}
exports.default = JsonImportPlugin;
