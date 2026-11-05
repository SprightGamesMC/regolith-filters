# Content Guide

Generates the Marketplace content guide as a PDF to host for reviewers and a Markdown file to compare between versions.

## Getting the Filter

Install with `regolith install github.com/SprightGamesMC/regolith-filters/content_guide`. Then add the filter to a profile.

```json
{
    "filter": "content_guide",
    "settings": {
        "content_name": "My Content",
        "content_type": "addon",
        "content_version": [1, 0, 0],
        "creator_team_name": "My Team",
        "partner_name": "My Partner"
    }
}
```

## Documentation

The filter:

- reads content from `data/content_guide/content_guide.json`, and creates a blank file when it is missing
- generates items, blocks, spawn eggs, entities, sounds, recipes, drops, trades, and vanilla edits from `BP` and `RP`
- keeps the items, entities, and sounds of that file matched to the packs
- checks the guide against the content guide requirements and reports all problems together
- writes `<content_name> Content Guide <version>.pdf` and `.md` to the output folder

### content_guide.json

`null` or a missing section is not written, which is an error. Use `[]` when a section does not apply. The guide then prints "None."

| Key                                                                                 | Content                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `completion_guide`                                                                  | Entries with `requirement`, `skip`, and `return`.       |
| `navigation.general`, `key_locations`, `landmarks`, `containers`, `hidden_elements` | Entries.                                                |
| `characters`                                                                        | Entries. Each one needs `locations`.                    |
| `gameplay.mechanics`, `user_interface`, `key_bindings`                              | Entries.                                                |
| `vanilla_changes`                                                                   | Entries, listed above the generated vanilla edits.      |
| `items`, `entities`, `sounds`                                                       | `name`, `player_accessible`, `tags`, and `notes` by ID. |
| `changelog`                                                                         | Releases with `version`, `date`, and `changes`.         |

`content_guide.schema.json` gives editors autocomplete and checks for this file through its `$schema` key.

An entry is a string or an object. Text in backticks is formatted as code.

```json
{
    "text": "Farmer Joe",
    "locations": ["150 70 0"],
    "notes": ["Sells golden potatoes", { "text": "Trades", "notes": ["Nested note"] }]
}
```

### Sync With the Packs

Each run updates `items`, `entities`, and `sounds` in the project file and prints every change.

- New content gets `"notes": null`, which is an error until a person writes the notes or sets `[]`.
- Content that left the packs loses its entry and notes. Nothing is removed when a pack is absent or a pack file was skipped.

Names, recipes, and generated tags come from the packs on each run. `name`, `player_accessible`, and `tags` replace what the filter
generates.

## Settings

| Setting                     | Type                                                | Default               | Description                                                                                                   |
| --------------------------- | --------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `content_name`              | string                                              | Required              | Title on the guide and in the file name.                                                                      |
| `content_type`              | `"addon" \| "world" \| "mash_up" \| "texture_pack"` | Required              | Sets the Add-On and map checks.                                                                               |
| `content_version`           | `[int, int, int]`                                   | Required              | Version on the guide and in the file name. The changelog needs a release for it.                              |
| `creator_team_name`         | string                                              | None                  | Creator team name on the guide cover.                                                                         |
| `partner_name`              | string                                              | None                  | Partner name on the guide cover.                                                                              |
| `output_path`               | string                                              | `build/content_guide` | Output folder relative to the project. It must stay inside the project root.                                  |
| `strict`                    | boolean                                             | `true`                | When `true`, errors stop the run. When `false`, they print and the files are written with `TODO` text.        |
| `auto_blank_optional_notes` | boolean                                             | `false`               | When `true`, notes start as `[]` for sounds, generated spawn eggs, and vanilla items that only gain a recipe. |
| `style`                     | object                                              | Default style         | Colors, logos, and fonts. See below.                                                                          |

#### Style

Each part replaces only its own default. Files are relative to `data/content_guide`. Fonts are TTF, OTF, or WOFF.

| Key               | Content                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `colors`          | `primary`, `primary_dark`, `primary_light`, `on_primary`, `surface`, `surface_soft`, `surface_line`, `text`, `text_muted`, as `#rrggbb`. |
| `wordmark`        | SVG, PNG, or JPEG at the cover top, on `primary`.                                                                                        |
| `logo`            | SVG, PNG, or JPEG in the footer of each page.                                                                                            |
| `fonts.brand`     | `file`, `uppercase`, and `letter_spacing` and `line_height` as shares of the size. Used for titles.                                      |
| `fonts.secondary` | `regular` and `bold` files, and `letter_spacing`. Used for all other text. `bold` uses `regular` when omitted.                           |
| `fonts.monospace` | `file`. Used for coordinates, commands, and identifiers.                                                                                 |

#### Default Settings

```json
{
    "content_name": "",
    "content_type": "",
    "content_version": [],
    "output_path": "build/content_guide",
    "strict": true,
    "auto_blank_optional_notes": false
}
```

## Notes

- Run the filter in a packaging profile. Errors stop the profile, and a guide is not needed on every save.
- With `strict` set to `false`, do not submit a guide that shows `TODO` text.
- A step can have `skip`, how to get past it, and `return`, how to go back to it. A step with `locations` gets `/tp @s x y z` as its return,
  unless `return` replaces it. Each step needs locations, `skip`, or `return`.
- A world or mash-up lists each end portal with coordinates in `navigation.end_portal`, or uses `[]` when it has none. The filter adds the
  key, not written, for these content types.
- Default fonts are Poppins, Inter, and JetBrains Mono, under the SIL Open Font License. They cover Latin text only.

## Changelog

### 1.0.0

- Initial release.
