import assert from "node:assert/strict";
import { describe, test } from "node:test";
import PDFDocument from "pdfkit";
import DefaultStyle from "../../src/Data/DefaultStyle";
import PdfTheme from "../../src/Data/PdfTheme";
import PdfFonts from "../../src/Lib/Pdf/PdfFonts";
import PdfText from "../../src/Lib/Pdf/PdfText";

describe("PdfText", () => {
    const pdf = new PDFDocument({ size: "A4" });

    PdfFonts.register(pdf, DefaultStyle.create().fonts);

    const theme = new PdfTheme(DefaultStyle.create());
    const text = new PdfText(pdf, theme);
    const style = theme.body;

    test("keeps short text on one line and joins runs of one font", () => {
        const lines = text.layout("One two three", 400, style);

        assert.equal(lines.length, 1);
        assert.deepEqual(
            lines[0].runs.map((run) => run.text),
            ["One two three"]
        );
    });

    test("separates plain and code runs", () => {
        const [line] = text.layout("Use `/tp @s` now", 400, style);

        assert.deepEqual(
            line.runs.map((run) => [run.text, run.isCode]),
            [
                ["Use ", false],
                ["/tp @s", true],
                [" now", false],
            ]
        );
    });

    test("wraps at the width and removes the space at the end of a line", () => {
        const lines = text.layout("alpha beta gamma delta epsilon zeta", 80, style);

        assert.ok(lines.length > 1);

        for (const line of lines) {
            assert.ok(line.width <= 80);
            assert.equal(line.runs[line.runs.length - 1].text.endsWith(" "), false);
        }
    });

    test("avoids a very short last line when the line count stays the same", () => {
        const source = "In the offhand, gives Regeneration to players and to mobs that are not monsters within 11 blocks";
        const lastLineWidth = (width: number): number => {
            const lines = text.layoutWithoutShortLastLine(source, width, style);

            return lines[lines.length - 1].width;
        };
        const plainLines = text.layout(source, 414, style);

        assert.equal(plainLines.length, 2);
        assert.ok(lastLineWidth(414) > plainLines[1].width);
    });

    test("breaks a word that is wider than the line", () => {
        const lines = text.layout("a".repeat(200), 100, style);

        assert.ok(lines.length > 1);
        assert.ok(lines.every((line) => line.width <= 100));
    });

    test("wraps an identifier at its separators and never past the width", () => {
        const font = PdfTheme.CODE_FONT;
        const lines = text.wrapCode("my_pack:item.staff.charge.variant_10.part_2", font, 10, 100);

        assert.ok(lines.length > 1);
        assert.ok(lines.every((line) => text.width(line, font, 10) <= 100));
        assert.equal(lines.join(""), "my_pack:item.staff.charge.variant_10.part_2");
        assert.ok(text.wrapCode("x".repeat(100), font, 10, 50).every((line) => text.width(line, font, 10) <= 50));
    });

    test("shortens text with three dots only when it is too wide", () => {
        const font = PdfTheme.BODY_FONT;

        assert.equal(text.fit("Short", font, 10, 200), "Short");
        assert.match(text.fit("A very long running head", font, 10, 50), /\.\.\.$/);
        assert.ok(text.width(text.fit("A very long running head", font, 10, 50), font, 10) <= 50);
    });

    test("writes code that a coding font would join into one glyph", () => {
        for (const code of ["..", "!=", "==", "->", "//", "&&", "||", "::", "<=", ">=", "--"]) {
            assert.doesNotThrow(() => text.write(code, 0, 0, PdfTheme.CODE_FONT, 10, "#000000"));
            assert.ok(text.width(code, PdfTheme.CODE_FONT, 10) > 0);
        }
    });

    test("finds the empty space on the left of the first letter", () => {
        assert.equal(text.leftBearing("", PdfTheme.DISPLAY_FONT, 40), 0);
        assert.ok(text.leftBearing("Design", PdfTheme.DISPLAY_FONT, 40) > text.leftBearing("Design", PdfTheme.DISPLAY_FONT, 10));
    });

    test("treats a line break or tab as a space", () => {
        const font = PdfTheme.BODY_FONT;

        assert.equal(text.width("one\ntwo", font, 10), text.width("one two", font, 10));
        assert.equal(text.width("one\ttwo", font, 10), text.width("one two", font, 10));
    });

    test("wraps a long identifier inside text at its separators", () => {
        const [, ...lines] = text.layout("See `my_pack:item.staff.charge.variant_10.part_2` here", 100, style);

        assert.ok(lines.length > 1);
        assert.ok(lines.every((line) => line.width <= 100));
    });

    test("records characters that a font cannot show", () => {
        text.write("Plain \u65e5", 0, 0, PdfTheme.BODY_FONT, 10, "#000000");

        assert.deepEqual(text.missingCharacters(), ["\u65e5"]);
    });

    test("finds the largest size that fits, down to the smallest size", () => {
        const font = PdfTheme.BODY_FONT;
        const wide = text.width("Fits", font, 20);

        assert.equal(text.fitSize("Fits", font, 20, 8, wide), 20);
        assert.ok(text.width("Fits", font, text.fitSize("Fits", font, 20, 8, wide / 2)) <= wide / 2);
        assert.equal(text.fitSize("Fits", font, 20, 8, 1), 8);
    });

    test("applies secondary letter spacing to body text and never to code", () => {
        const spacedTheme = new PdfTheme({
            ...DefaultStyle.create(),
            fonts: { ...DefaultStyle.create().fonts, secondaryLetterSpacing: 0.1 },
        });
        const spaced = new PdfText(pdf, spacedTheme);

        assert.ok(spaced.width("body", PdfTheme.BODY_FONT, 10) > text.width("body", PdfTheme.BODY_FONT, 10));
        assert.ok(spaced.width("body", PdfTheme.BOLD_FONT, 10) > text.width("body", PdfTheme.BOLD_FONT, 10));
        assert.equal(spaced.width("code", PdfTheme.CODE_FONT, 10), text.width("code", PdfTheme.CODE_FONT, 10));
    });

    test("narrows the width without adding a line", () => {
        const source = "Every change, item, entity, and sound.";
        const balanced = text.balancedWidth(source, 276, style);

        assert.ok(balanced < 276);
        assert.equal(text.layout(source, balanced, style).length, text.layout(source, 276, style).length);
    });

    test("follows the brand font rules of the style", () => {
        const defaults = DefaultStyle.create();
        const branded = new PdfText(
            pdf,
            new PdfTheme({ ...defaults, fonts: { ...defaults.fonts, brandUppercase: true, brandLetterSpacing: 0.1 } })
        );
        const expected = pdf.font(PdfTheme.DISPLAY_FONT).fontSize(10).widthOfString("TITLE", { characterSpacing: 1 });

        assert.equal(branded.width("title", PdfTheme.DISPLAY_FONT, 10), expected);
        assert.notEqual(text.width("title", PdfTheme.DISPLAY_FONT, 10), expected);
    });

    test("centers capitals on a position", () => {
        const cap = text.capHeight(PdfTheme.BODY_FONT, 10);

        assert.ok(cap > 6 && cap < 8);
        assert.equal(text.baselineFor(100, PdfTheme.BODY_FONT, 10), 100 + cap / 2);
    });
});
