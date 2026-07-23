# Tscompile

This filter compiles behavior pack TypeScript into JavaScript for Minecraft.

## Getting the Filter

Install with `regolith install github.com/SprightGamesMC/regolith-filters/tscompile`. Then add the filter to a profile.

```json
{
    "filter": "tscompile",
    "settings": {
        "buildOptions": {
            "bundle": false,
            "minify": false
        },
        "modules": ["@minecraft/server@2.0.0"],
        "moduleUUID": "00000000-0000-4000-8000-000000000000",
        "sourceDir": "BP/scripts/src",
        "sourceEntry": "main.ts"
    }
}
```

## Documentation

The filter:

- compiles behavior pack TypeScript and JavaScript from `sourceDir`, which defaults to `BP/scripts/src`
- writes compiled output to `BP/scripts` or `BP/scripts/dist`, based on `keepSource`
- updates `BP/manifest.json` with the configured script dependencies unless manifest modification is disabled
- enables debugger support on Windows when `enableDebugger` is on. This includes sourcemaps and VS Code launch config updates.

## Settings

| Setting                       | Type                                                     | Default                                                                              | Description                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildOptions`                | [buildOptions](https://esbuild.github.io/api/#build-api) | See default settings                                                                 | Esbuild options merged into the filter defaults. Bundled builds use `sourceDir/sourceEntry`. Builds without bundling compile all supported files in `sourceDir`. |
| `modules`                     | string[]                                                 | `["@minecraft/server@2.0.0"]`                                                        | Script module dependencies added to `BP/manifest.json`.                                                                                                          |
| `moduleUUID`                  | string                                                   | Required when `disableManifestModification` is `false` or `enableDebugger` is `true` | UUID v4 used for the script module and the debugger launch config.                                                                                               |
| `sourceDir`                   | string                                                   | `BP/scripts/src`                                                                     | Source folder relative to the project. `sourceEntry` is resolved from here.                                                                                      |
| `sourceEntry`                 | string                                                   | `main.ts`                                                                            | Entry file relative to `sourceDir`. Supported script extensions compile to `.js`.                                                                                |
| `keepSource`                  | boolean                                                  | `false`                                                                              | Keep source files and write output to `.regolith/tmp/BP/scripts/dist` instead of `.regolith/tmp/BP/scripts`.                                                     |
| `enableDebugger`              | boolean                                                  | `false`                                                                              | Enable Windows debugger support with sourcemaps and VS Code launch config updates. Requires `buildOptions.minify: false` and `debuggerProfile`.                  |
| `debuggerProfile`             | string                                                   | Required when `enableDebugger` is `true`                                             | Regolith profile name used to resolve debugger export paths. Use the same profile that runs `tscompile`.                                                         |
| `disableManifestModification` | boolean                                                  | `false`                                                                              | Skip script module and dependency updates in `BP/manifest.json`.                                                                                                 |

#### Default Settings

```json
{
    "buildOptions": {
        "bundle": true,
        "minify": true
    },
    "modules": ["@minecraft/server@2.0.0"],
    "moduleUUID": "", // Must be defined (example value: 00000000-0000-4000-8000-000000000000)
    "sourceDir": "BP/scripts/src",
    "sourceEntry": "main.ts",
    "keepSource": false,
    "enableDebugger": false,
    "disableManifestModification": false
}
```

## Config Overrides

You can change filter settings with a `tscompile.config.js` file at the project root, beside your Regolith project configuration. The file
must export `config(settings)`.

```js
module.exports = {
    config(settings) {
        settings.sourceDir = "BP/scripts/dev_src";
        settings.sourceEntry = "main.ts";
    },
};
```

## Notes

- `sourceEntry` is resolved relative to `sourceDir`. It must exist in that folder with a supported script extension.
- `buildOptions.entryPoints` is not supported. Use `sourceEntry` for bundled builds.
- When `buildOptions.bundle` is `false`, tscompile compiles every supported script file under `sourceDir`. `.json` imports are not supported
  in that mode.
- `moduleUUID` must be a valid UUID v4 when manifest modification or debugger support is enabled.
- When `keepSource` is `false`, `sourceDir` must stay inside the local behavior pack scripts folder. Compiled output goes to
  `.regolith/tmp/BP/scripts`.
- When `keepSource` is `true`, tscompile keeps `sourceDir` and writes compiled output to `.regolith/tmp/BP/scripts/dist`. `sourceDir` cannot
  overlap that output folder.
- `enableDebugger` works only on Windows, requires `debuggerProfile`, and does not support minified builds.

## Changelog

### 1.0.1

- Refactored filter.

### 1.0.0

- Initial release.
