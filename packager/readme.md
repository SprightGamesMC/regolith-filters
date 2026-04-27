# Packager

This filter packages Minecraft Marketplace submissions into validated submission-ready archives and in-game package files.

## Getting the Filter

Install with: `regolith install github.com/SprightGamesMC/regolith-filters/packager`.

After that, you can place the filter into one of your profiles.

```json
{
  "filter": "packager",
  "settings": {
    "content_name": "My Content",
    "content_acronym": "MC",
    "content_type": "addon",
    "content_version": [
      1,
      0,
      0
    ],
    "is_standalone_rp": false,
    "min_engine_version": [
      1,
      20,
      0
    ],
    "paths": {
      "build_path": "build",
      "marketing_art_path": "assets/marketing_art",
      "store_art_path": "assets/store_art"
    },
    "marketing_art": {
      "key_art": "marketing_key_art.jpg",
      "partner_art": "marketing_partner_art.jpg",
      "screenshots": [
        "marketing_screenshot_1.jpg",
        "marketing_screenshot_2.jpg",
        "marketing_screenshot_3.jpg",
        "marketing_screenshot_4.jpg",
        "marketing_screenshot_5.jpg"
      ]
    },
    "store_art": {
      "key_art": "store_key_art.jpg",
      "panorama": "panorama.jpg",
      "pack_icon": "pack_icon.jpg",
      "screenshots": [
        "store_screenshot_1.jpg",
        "store_screenshot_2.jpg",
        "store_screenshot_3.jpg",
        "store_screenshot_4.jpg",
        "store_screenshot_5.jpg"
      ]
    }
  }
}
```

## Documentation

This filter will:

- validate store art, marketing art, and staged pack manifests before packaging starts
- map art roles from `config.json` into Marketplace output filenames automatically
- stage BP, RP, world template, and skin-pack content based on `content_type`
- update `manifest.json` version fields while preserving v1/v2 versus v3 version formats
- generate root-level `world_behavior_packs.json` and `world_resource_packs.json` for `world` content when staged BP/RP folders are present
- minify all `.json` files in the archived output
- write a submission `.zip` plus a game file to the configured `paths.build_path` folder

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `content_name` | string | Required | Full Marketplace content name used for archive naming. It must contain at least one letter or number after sanitization. |
| `content_acronym` | string | Required except for `skin_pack` | Short acronym used in staged BP/RP folder names. Only letters, numbers, underscores, and hyphens are allowed. |
| `content_type` | `"addon" \| "world" \| "texture_pack" \| "skin_pack"` | Required | Determines required inputs, staged layout, and game-file extension. |
| `content_version` | `[int, int, int]` | Required | Version written into staged manifests. |
| `is_standalone_rp` | boolean | `false` | For `world` content, set this to `true` only when the RP is a full conversion that can be applied independently of the world. |
| `min_engine_version` | `[int, int, int]` | Required except for `skin_pack` | Minimum engine version written into staged manifests. |
| `paths.build_path` | string | Required | Project-relative output folder for the generated submission and game files. It must stay inside the project root. |
| `paths.marketing_art_path` | string | Required | Project-relative source folder for marketing art. It must stay inside the project root. |
| `paths.store_art_path` | string | Required | Project-relative source folder for store art. It must stay inside the project root. |
| `paths.world_path` | string or null | `null` | Required for `world` content. It must stay inside the project root. |
| `paths.skin_pack_path` | string or null | `null` | Required for `skin_pack` content and optional for `world` content. It must stay inside the project root. |
| `marketing_art.key_art` | string | Required | Source filename for marketing key art. Supports `.jpg`, `.jpeg`, or `.psd`. |
| `marketing_art.partner_art` | string | Required | Source filename for partner art. Supports `.jpg`, `.jpeg`, or `.psd`. |
| `marketing_art.screenshots` | string[] | Required except for `skin_pack` | Source filenames for marketing screenshots. Supports `.jpg`, `.jpeg`, or `.psd`. At least 5 are required. |
| `store_art.key_art` | string | Required | Source filename for store thumbnail art. |
| `store_art.panorama` | string | Required except for `skin_pack` | Source filename for store panorama art. |
| `store_art.pack_icon` | string | Required except for `skin_pack` | Source filename for store pack icon art. |
| `store_art.screenshots` | string[] | Required except for `skin_pack` | Source filenames for store screenshots. Exactly 5 are required. |

#### Default Settings

```json
{
  "content_name": "",
  "content_acronym": "",
  "content_type": "",
  "content_version": [],
  "is_standalone_rp": false,
  "min_engine_version": [],
  "paths": {
    "build_path": "build",
    "marketing_art_path": "",
    "store_art_path": "",
    "world_path": null,
    "skin_pack_path": null
  },
  "marketing_art": {
    "key_art": "",
    "partner_art": "",
    "screenshots": []
  },
  "store_art": {
    "key_art": "",
    "panorama": "",
    "pack_icon": "",
    "screenshots": []
  }
}
```

## Notes

- Any staged pack folder that is present must include a root `manifest.json`.
- Configured `paths.*` values must be project-relative and cannot escape the project root.
- Art asset filenames are resolved against their configured art folder and must stay inside that folder.
- For `world` content, the `.mctemplate` always places the RP under `resource_packs/RP_<Acr>`, regardless of whether it is standalone.
- Marketing art keeps its original file extension in the packaged output, so PSD inputs stay PSD and JPEG inputs stay JPEG.

## Changelog

### 1.0.0

- Initial release.
