# Packager

This filter packages Minecraft Marketplace submissions into validated archives ready for submission and package files for the game.

## Getting the Filter

Install with `regolith install github.com/SprightGamesMC/regolith-filters/packager`. Then add the filter to a profile.

```json
{
    "filter": "packager",
    "settings": {
        "content_name": "My Content",
        "content_acronym": "MC",
        "content_type": "addon",
        "content_version": [1, 0, 0],
        "is_standalone_rp": false,
        "min_engine_version": [1, 20, 0],
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

The filter:

- validates store art, marketing art, and staged pack manifests before packaging starts
- maps art roles from `config.json` into Marketplace output filenames
- stages BP, RP, world template, and skin pack content based on `content_type`
- updates `manifest.json` version fields and keeps the original version format, whether v1, v2, or v3
- generates `world_behavior_packs.json` and `world_resource_packs.json` at the root for `world` content when staged BP or RP folders are
  present
- minifies all `.json` files in the archived output
- writes a submission `.zip` plus a game file to the configured `paths.build_path` folder

## Settings

| Setting                     | Type                                                  | Default                         | Description                                                                                                              |
| --------------------------- | ----------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `content_name`              | string                                                | Required                        | Full Marketplace content name used for archive naming. It must contain at least one letter or number after sanitization. |
| `content_acronym`           | string                                                | Required except for `skin_pack` | Short acronym used in staged BP and RP folder names. Only letters, numbers, underscores, and hyphens are allowed.        |
| `content_type`              | `"addon" \| "world" \| "texture_pack" \| "skin_pack"` | Required                        | Sets required inputs, staged layout, and the game file extension.                                                        |
| `content_version`           | `[int, int, int]`                                     | Required                        | Version written into staged manifests.                                                                                   |
| `is_standalone_rp`          | boolean                                               | `false`                         | For `world` content, set this to `true` only when the RP is a full conversion that can be applied without the world.     |
| `min_engine_version`        | `[int, int, int]`                                     | Required except for `skin_pack` | Minimum engine version written into staged manifests.                                                                    |
| `paths.build_path`          | string                                                | Required                        | Output folder for the generated files, relative to the project. It must stay inside the project root.                    |
| `paths.marketing_art_path`  | string                                                | Required                        | Source folder for marketing art, relative to the project. It must stay inside the project root.                          |
| `paths.store_art_path`      | string                                                | Required                        | Source folder for store art, relative to the project. It must stay inside the project root.                              |
| `paths.world_path`          | string or null                                        | `null`                          | Required for `world` content. It must stay inside the project root.                                                      |
| `paths.skin_pack_path`      | string or null                                        | `null`                          | Required for `skin_pack` content and optional for `world` content. It must stay inside the project root.                 |
| `marketing_art.key_art`     | string                                                | Required                        | Source filename for marketing key art. Supports `.jpg`, `.jpeg`, or `.psd`.                                              |
| `marketing_art.partner_art` | string                                                | Required                        | Source filename for partner art. Supports `.jpg`, `.jpeg`, or `.psd`.                                                    |
| `marketing_art.screenshots` | string[]                                              | Required except for `skin_pack` | Source filenames for marketing screenshots. Supports `.jpg`, `.jpeg`, or `.psd`. At least 5 are required.                |
| `store_art.key_art`         | string                                                | Required                        | Source filename for store thumbnail art.                                                                                 |
| `store_art.panorama`        | string                                                | Required except for `skin_pack` | Source filename for store panorama art.                                                                                  |
| `store_art.pack_icon`       | string                                                | Required except for `skin_pack` | Source filename for store pack icon art.                                                                                 |
| `store_art.screenshots`     | string[]                                              | Required except for `skin_pack` | Source filenames for store screenshots. Exactly 5 are required.                                                          |

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
- Configured `paths.*` values must be relative to the project and cannot escape the project root.
- Art filenames are resolved against their configured art folder and must stay inside that folder.
- For `world` content, the `.mctemplate` always places the RP under `resource_packs/RP_<Acr>`, standalone or not.
- Marketing art keeps its original file extension in the packaged output, so PSD inputs stay PSD and JPEG inputs stay JPEG.

## Changelog

### 1.0.1

- Refactored filter.

### 1.0.0

- Initial release.
