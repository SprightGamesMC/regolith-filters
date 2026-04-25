# Tscompile

This filter compiles behavior pack TypeScript into JavaScript for Minecraft.

## Getting the Filter

Install with: `regolith install github.com/SprightGamesMC/regolith-filters/tscompile`. After that, you can place the filter into one of your profiles.

```json
{
  "filter": "tscompile",
  "settings": {
    "buildOptions": {
      "bundle": false,
      "minify": false
    },
    "modules": [
      "@minecraft/server@2.0.0"
    ],
    "moduleUUID": "00000000-0000-4000-8000-000000000000",
    "sourceDir": "BP/scripts/src",
    "sourceEntry": "main.ts"
  }
}
```

## Documentation

This filter will:

- compile behavior pack TypeScript and JavaScript from `sourceDir`, defaulting to `BP/scripts/src`
- write compiled output to `BP/scripts` or `BP/scripts/dist`, depending on `keepSource`
- update `BP/manifest.json` with the configured script dependencies unless manifest modification is disabled
- enable debugger support on Windows, including sourcemaps and VS Code launch configuration updates, when `enableDebugger` is enabled

## Settings

| Setting                        | Type     | Default                         | Description                                                              |
|--------------------------------|----------|---------------------------------|--------------------------------------------------------------------------|
| `buildOptions`                 | [buildOptions](https://esbuild.github.io/api/#build-api) | See default settings | Esbuild options merged into the filter defaults. Bundled builds use `sourceDir/sourceEntry`; non-bundled builds compile all supported files in `sourceDir`. |
| `modules`                      | string[] | `["@minecraft/server@2.0.0"]`   | Script module dependencies added to `BP/manifest.json`.                  |
| `moduleUUID`                   | string   | Required when `disableManifestModification` is `false` or `enableDebugger` is `true` | UUID v4 used for the script module and debugger launch config. |
| `sourceDir`                    | string   | `BP/scripts/src`                | Project-relative source folder. `sourceEntry` is resolved from here.     |
| `sourceEntry`                  | string   | `main.ts`                       | Entry file relative to `sourceDir`. Supported script extensions compile to `.js`. |
| `keepSource`                   | boolean  | `false`                         | Keep source files and write output to `.regolith/tmp/BP/scripts/dist` instead of `.regolith/tmp/BP/scripts`. |
| `enableDebugger`               | boolean  | `false`                         | Enable Windows debugger support with sourcemaps and VS Code launch config updates. Requires `buildOptions.minify: false` and `debuggerProfile`. |
| `debuggerProfile`              | string   | Required when `enableDebugger` is `true` | Regolith profile name used to resolve debugger export paths. Use the same profile that runs `tscompile`. |
| `disableManifestModification`  | boolean  | `false`                         | Skip script-module and dependency updates in `BP/manifest.json`.         |

#### Default Settings

```json
{
  "buildOptions": {
    "bundle": true,
    "minify": true
  },
  "modules": [
    "@minecraft/server@2.0.0"
  ],
  "moduleUUID": "", // Must be defined (example value: 00000000-0000-4000-8000-000000000000)
  "sourceDir": "BP/scripts/src",
  "sourceEntry": "main.ts",
  "keepSource": false,
  "enableDebugger": false,
  "disableManifestModification": false
}
```

## Config Overrides

You can modify this filter by creating a root-level `tscompile.config.js` beside your Regolith project configuration. The file must export `config(settings)`.

```js
module.exports = {
  config(settings) {
    settings.sourceDir = "BP/scripts/dev_src";
    settings.sourceEntry = "main.ts";
  },
};
```

## Notes

- `sourceEntry` is resolved relative to `sourceDir`, and it must exist inside that directory with a supported script extension.
- `buildOptions.entryPoints` is not supported. Use `sourceEntry` for bundled builds.
- When `buildOptions.bundle` is `false`, tscompile compiles every supported script file under `sourceDir`, and `.json` imports are not supported.
- `moduleUUID` must be a valid UUID v4 when manifest modification is enabled or debugger support is enabled.
- When `keepSource` is `false`, `sourceDir` must stay inside the local behavior-pack scripts folder, and compiled output is written to `.regolith/tmp/BP/scripts`.
- When `keepSource` is `true`, tscompile preserves `sourceDir` and writes compiled output to `.regolith/tmp/BP/scripts/dist`. `sourceDir` cannot overlap that output folder.
- `enableDebugger` is supported only on Windows, requires `debuggerProfile`, and does not support minified builds.

## Changelog

### 1.0.0

- Initial commit for `tscompile`
