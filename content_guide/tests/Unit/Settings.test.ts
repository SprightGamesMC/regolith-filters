import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Settings from "../../src/Lib/Settings";
import StyleSettings from "../../src/Lib/StyleSettings";

describe("Settings auto_blank_optional_notes", () => {
    const base = { content_name: "Pack", content_type: "addon", content_version: [1, 0, 0] };

    test("is false by default and reads a boolean", () => {
        assert.equal(Settings.resolve(JSON.stringify(base)).autoBlankOptionalNotes, false);
        assert.equal(Settings.resolve(JSON.stringify({ ...base, auto_blank_optional_notes: true })).autoBlankOptionalNotes, true);
    });

    test("rejects other types", () => {
        assert.throws(() => Settings.resolve(JSON.stringify({ ...base, auto_blank_optional_notes: "yes" })), /must be a boolean/);
    });
});

describe("Settings.resolve", () => {
    const valid = { content_name: " My Pack ", content_type: "world", content_version: [1, 2, 0] };

    test("applies defaults and converts the version", () => {
        assert.deepEqual(Settings.resolve(JSON.stringify(valid)), {
            contentName: "My Pack",
            contentType: "world",
            contentVersion: "1.2.0",
            creatorTeamName: null,
            partnerName: null,
            outputPath: "build/content_guide",
            strict: true,
            autoBlankOptionalNotes: false,
            style: StyleSettings.empty(),
        });
    });

    test("reads optional settings", () => {
        const settings = Settings.resolve(
            JSON.stringify({
                ...valid,
                creator_team_name: " Team ",
                partner_name: "Spright",
                output_path: "guides",
                strict: false,
            })
        );

        assert.equal(settings.creatorTeamName, "Team");
        assert.equal(settings.partnerName, "Spright");
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, partner_name: "" })), /partner_name/);
        assert.equal(settings.outputPath, "guides");
        assert.equal(settings.strict, false);
    });

    test("rejects an unknown setting", () => {
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, stye: {} })), /Unknown setting "stye"/);
    });

    test("rejects missing and malformed JSON", () => {
        assert.throws(() => Settings.resolve(undefined), /Missing filter settings/);
        assert.throws(() => Settings.resolve("{"), /Invalid filter settings/);
        assert.throws(() => Settings.resolve("[]"), /must be a JSON object/);
    });

    test("rejects invalid values", () => {
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, content_name: "" })), /content_name/);
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, content_type: "skin_pack" })), /content_type/);
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, content_version: [1, 0] })), /content_version/);
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, content_version: [1, 0, -1] })), /content_version/);
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, strict: "yes" })), /strict/);
        assert.throws(() => Settings.resolve(JSON.stringify({ ...valid, output_path: "" })), /output_path/);
    });
});
