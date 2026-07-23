# Example

A minimal reference filter that shows the repository's conventions. Not meant for production use.

## Getting the Filter

Install with `regolith install github.com/SprightGamesMC/regolith-filters/example`. Then add the filter to a profile.

```json
{
    "filter": "example",
    "settings": {
        "message": "Hello, world",
        "repeat": 3
    }
}
```

## Documentation

This filter shows the shape of a filter in this repository. It:

- parses and validates its Regolith settings in a `Settings` class with only static members
- writes the configured `message` to standard output once per `repeat` count

Read its `src` folder as the reference for file layout, class shape, naming, JSDoc, and import order.

## Settings

| Setting   | Type    | Default  | Description                                                     |
| --------- | ------- | -------- | --------------------------------------------------------------- |
| `message` | string  | Required | Text written to standard output.                                |
| `repeat`  | integer | `1`      | Number of times to write the message. Must be between 1 and 10. |

#### Default Settings

```json
{
    "message": "",
    "repeat": 1
}
```

## Notes

- The `src` folder is the reference for conventions, so keep it building and passing lint.

## Changelog

### 1.0.0

- Initial release.
