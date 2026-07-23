# Isoblock

This filter makes isometric images of Minecraft Bedrock Edition blocks.

## Getting the Filter

Install with `regolith install github.com/SprightGamesMC/regolith-filters/isoblock`. Then add the filter to a profile.

```json
{
    "filter": "isoblock",
    "settings": {
        "resolution": 128,
        "outputPath": "build/isoblock"
    }
}
```

## Documentation

The filter:

- reads every block definition under `BP/blocks`
- takes geometry from `minecraft:item_visual` when present. Otherwise it renders one part per `minecraft:multi_block` segment
- finds face textures through `RP/textures/terrain_texture.json` and the models in `RP/models`
- downloads vanilla textures from [bedrock-samples](https://github.com/Mojang/bedrock-samples) and caches them in `.regolith/cache/isoblock`
- writes one isometric PNG per block into `outputPath`

## Settings

| Setting      | Type   | Default          | Description                                                               |
| ------------ | ------ | ---------------- | ------------------------------------------------------------------------- |
| `resolution` | number | `128`            | Width and height in pixels of each image.                                 |
| `outputPath` | string | `build/isoblock` | Output directory for the images, resolved from the Regolith project root. |

#### Default Settings

```json
{
    "resolution": 128,
    "outputPath": "build/isoblock"
}
```

## Notes

- Blocks without usable geometry or components are skipped without a message. Render failures are logged and do not stop the run.
- The placement `minecraft:transformation` is not applied. Icons show the raw default geometry, same as Blockbench.
- Orientation permutations such as `cardinal_direction` are ignored. Every render uses the default orientation.
- `bone_visibility` is respected. Bones behind a Molang expression are hidden. The icon shows the block in its default state.
- Models taller than 16 units count one block level per started 16 units. They are framed like blocks with multiple parts, so tall single
  block models are not cropped.
- Blocks that use `minecraft:geometry.cross` turn an extra 45 degrees so both planes face the camera instead of one showing edge on.
- Run this filter after filters that generate content, such as `jsonte`, so generated blocks are included.
- Vanilla textures download once and load from the cache after that. Only the first run needs a network connection. A failed download logs a
  warning and the block renders without that texture.
- Textures load from `.png` or `.tga` files. Vanilla downloads try `.png` first, then `.tga`. TGA decoding supports true color (24 bit and
  32 bit) and grayscale (8 bit) images, plain or run length encoded.

## Changelog

### 1.0.2

- Replaced the unmaintained `gl` package with the maintained `@kmamal/gl` fork to remove deprecated dependencies during install.

### 1.0.1

- Refactored filter.

### 1.0.0

- Initial release of the isoblock filter.
