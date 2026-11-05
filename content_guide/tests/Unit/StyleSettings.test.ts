import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import DefaultStyle from "../../src/Data/DefaultStyle";
import StyleSettings from "../../src/Lib/StyleSettings";

describe("StyleSettings", () => {
    test("uses defaults with licensed fonts when the style is omitted", () => {
        const style = StyleSettings.resolve(StyleSettings.read(undefined), os.tmpdir());

        assert.deepEqual(style, DefaultStyle.create());
        assert.match(style.fonts.monospace, /jetbrains-mono/);
    });

    test("merges colors over the defaults", () => {
        const style = StyleSettings.resolve(StyleSettings.read({ colors: { primary: "#399ee6" } }), os.tmpdir());

        assert.equal(style.colors.primary, "#399ee6");
        assert.equal(style.colors.text, DefaultStyle.create().colors.text);
    });

    test("finds files in the guide data folder", () => {
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), "content_guide_"));

        fs.writeFileSync(path.join(folder, "logo.svg"), "<svg/>");
        fs.writeFileSync(path.join(folder, "body.woff"), "font");

        try {
            const style = StyleSettings.resolve(
                StyleSettings.read({ logo: "logo.svg", fonts: { secondary: { regular: "body.woff" } } }),
                folder
            );

            assert.equal(style.logo, path.join(folder, "logo.svg"));
            assert.equal(style.fonts.bold, path.join(folder, "body.woff"));
            assert.throws(() => StyleSettings.resolve(StyleSettings.read({ logo: "none.svg" }), folder), /not found/);
            assert.throws(() => StyleSettings.resolve(StyleSettings.read({ logo: "../out.svg" }), folder), /must stay inside/);
        } finally {
            fs.rmSync(folder, { recursive: true });
        }
    });

    test("warns about text that would be close to invisible", () => {
        const defaults = DefaultStyle.create().colors;

        assert.deepEqual(StyleSettings.contrastWarnings(defaults), []);
        assert.deepEqual(StyleSettings.contrastWarnings({ ...defaults, primary: "#399ee6", onPrimary: "#ffffff" }), []);
        assert.match(StyleSettings.contrastWarnings({ ...defaults, primary: "#ffffff", onPrimary: "#ffffff" })[0], /on_primary/);
    });

    test("reads font spacing inside its range", () => {
        const { fonts } = StyleSettings.read({
            fonts: { brand: { letter_spacing: 0.02, line_height: 1.1 }, secondary: { letter_spacing: 0.01 } },
        });

        assert.equal(fonts.brandLetterSpacing, 0.02);
        assert.equal(fonts.brandLineHeight, 1.1);
        assert.equal(fonts.secondaryLetterSpacing, 0.01);
        assert.equal(StyleSettings.read({}).fonts.brandLineHeight, null);
        assert.throws(() => StyleSettings.read({ fonts: { brand: { letter_spacing: 5 } } }), /from -0\.1 to 0\.5/);
        assert.throws(() => StyleSettings.read({ fonts: { secondary: { letter_spacing: "wide" } } }), /from -0\.1 to 0\.5/);
        assert.throws(() => StyleSettings.read({ fonts: { brand: { line_height: 9 } } }), /from 0\.7 to 2/);
        assert.throws(() => StyleSettings.read({ fonts: { secondary: { uppercase: true } } }), /unknown key "uppercase"/);
        assert.throws(() => StyleSettings.read({ fonts: { monospace: "code.ttf" } }), /must be an object/);
    });

    test("rejects invalid values", () => {
        assert.throws(() => StyleSettings.read({ colors: { primary: "blue" } }), /style\.colors\.primary/);
        assert.throws(() => StyleSettings.read({ colors: { typo: "#000000" } }), /unknown key "typo"/);
        assert.throws(() => StyleSettings.read({ logo: "logo.gif" }), /style\.logo/);
        assert.throws(() => StyleSettings.read({ fonts: { monospace: { file: "code.txt" } } }), /style\.fonts\.monospace/);
        assert.throws(() => StyleSettings.read({ fonts: { monospace: { file: "code.woff2" } } }), /style\.fonts\.monospace/);
        assert.throws(() => StyleSettings.read({ fonts: { brand: { uppercase: "yes" } } }), /uppercase/);
        assert.throws(() => StyleSettings.read("style"), /must be an object/);
        assert.throws(() => StyleSettings.read({ backgrounds: {} }), /unknown key "backgrounds"/);
    });
});
