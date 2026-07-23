# Brarchive

This filter archives eligible UTF-8 text directories into `.brarchive` format.

## Getting the Filter

Install with `regolith install github.com/SprightGamesMC/regolith-filters/brarchive`. Then add the filter to the profile that exports your
pack.

```json
{
    "filter": "brarchive",
    "settings": {
        "mode": "replace",
        "minify": true
    }
}
```

## Documentation

The filter:

- finds directories whose files are all valid UTF-8. The font, materials, scripts, sounds, texts, and textures folders are excluded, and
  `ui/_global_variables.json` is excluded by path. Subpacks are processed as separate roots.
- creates `.brarchive` files under `__brarchive` for each eligible directory
- sets `header.pack_optimization_version` to `0.1.0` in manifest.json. Root packs only, since subpacks have no manifest.
- removes original files in replace mode or keeps both in keep_both mode
- minifies JSON content stored inside archives when `minify` is on

## Settings

| Setting  | Type    | Default   | Description                                                          |
| -------- | ------- | --------- | -------------------------------------------------------------------- |
| `mode`   | string  | "replace" | "replace" removes originals after archiving. "keep_both" keeps both. |
| `minify` | boolean | true      | Minifies JSON content stored in .brarchive files.                    |

### Default Settings

```json
{
    "mode": "replace",
    "minify": true
}
```

## Changelog

### 1.0.3

- Refactored filter.

### 1.0.2

- Added `loot_tables` folder to `BANNED_ROOT_DIRECTORY_SET`
- Refactored filter

### 1.0.1

- Fixed issue with JSON formatter truncating data.

### 1.0.0

- Initial release.
