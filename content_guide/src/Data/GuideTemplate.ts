/**
 * Blank guide data file, which must match `data/content_guide.json`.
 */
export default abstract class GuideTemplate {
    /** Text of the file, kept in code because an installed filter may not keep its data folder. */
    static readonly TEXT = `{
    "$schema": "https://raw.githubusercontent.com/SprightGamesMC/regolith-filters/main/content_guide/content_guide.schema.json",
    "completion_guide": null,
    "navigation": {
        "general": null,
        "key_locations": null,
        "landmarks": null,
        "containers": null,
        "hidden_elements": null
    },
    "characters": null,
    "gameplay": {
        "mechanics": null,
        "user_interface": null,
        "key_bindings": null
    },
    "vanilla_changes": null,
    "items": {},
    "entities": {},
    "sounds": {},
    "changelog": null
}
`;
}
