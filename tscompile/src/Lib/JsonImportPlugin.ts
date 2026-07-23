import fs from "fs";
import path from "path";
import type { Plugin, PluginBuild } from "esbuild";
import JsonTools from "./JsonTools";

/**
 * Creates an esbuild plugin that normalizes JSONC syntax.
 */
export default class JsonImportPlugin {
    /**
     * Creates the plugin instance.
     *
     * @returns Configured esbuild plugin.
     */
    create(): Plugin {
        return {
            name: "tscompile-json",
            setup(build: PluginBuild): void {
                build.onResolve({ filter: /\.json$/ }, (args) => {
                    return {
                        path: path.resolve(args.resolveDir, args.path),
                        namespace: "tscompile-json",
                    };
                });

                build.onLoad({ filter: /\.json$/, namespace: "tscompile-json" }, (args) => {
                    const contents = fs.readFileSync(args.path, "utf8");
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
    static parseJson(contents: string, filePath: string): unknown {
        try {
            return JsonTools.parse(contents);
        } catch (error) {
            throw new Error(`Imported JSON file "${filePath}" contains invalid JSON.`, { cause: error });
        }
    }
}
