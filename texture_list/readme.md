# Texture List

Generates `textures/texture_list.json` from the image files in the resource pack.

## Getting the Filter

Install with `regolith install github.com/SprightGamesMC/regolith-filters/texture_list`. Then add the filter to a profile.

```json
{
    "filter": "texture_list"
}
```

## Documentation

The filter:

- finds the resource pack folder from `packs.resourcePack` in the Regolith `config.json`, defaulting to `RP`
- finds every `png`, `jpg`, `jpeg`, and `tga` image under the pack's `textures` folder
- reads every `*.texture_set.json` and drops files named by a `normal`, `heightmap`, `metalness_emissive_roughness`, or
  `metalness_emissive_roughness_subsurface` layer
- keeps a file when some texture set also names it as a `color` layer, or when no set names it at all
- writes the sorted list as JSON without file extensions to `textures/texture_list.json`
- repeats this for each `subpacks/<name>`, writing its own `textures/texture_list.json` from that subpack's textures only

Layer values that are arrays or `#` hex strings are colors, not files, and are ignored. A malformed texture set stops the run with an error
naming the file.

## Settings

This filter has no settings.

## Changelog

### 1.0.1

- Write a separate `texture_list.json` for each subpack from its own textures only. The main pack list no longer includes subpack textures.

### 1.0.0

- Initial release.
