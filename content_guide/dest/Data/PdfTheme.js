"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Type scale and spacing of the PDF, with the text styles of one guide style.
 */
class PdfTheme {
    /** Name of the regular text font. */
    static BODY_FONT = "Body";
    /** Name of the bold text font. */
    static BOLD_FONT = "Bold";
    /** Name of the title font. */
    static DISPLAY_FONT = "Display";
    /** Name of the font for coordinates, commands, and identifiers. */
    static CODE_FONT = "Code";
    /** Code size as a share of the text size, so the lowercase letters of both fonts have the same height. */
    static CODE_RATIO = 0.87;
    /** Space in points between the page edge and the content. */
    static MARGIN = 50;
    /** Space in points kept free at the page bottom for the footer. */
    static BOTTOM_MARGIN = 62;
    /** Distance in points that a tinted surface extends past the text, so text keeps the page margin. */
    static SURFACE_BLEED = 8;
    /** Largest cover title size in points. */
    static COVER_TITLE_SIZE = 84;
    /** Page title size in points. */
    static TITLE_SIZE = 42;
    /** Major heading size in points. */
    static HEADING_SIZE = 21;
    /** Minor heading size in points. */
    static SUBHEADING_SIZE = 14;
    /** Smallest heading size in points. */
    static MINOR_HEADING_SIZE = 12;
    /** Running text size in points. */
    static BODY_SIZE = 11;
    /** Line height in points of running text. */
    static BODY_LINE_HEIGHT = 16;
    /** Generated fact size in points. */
    static SMALL_SIZE = 9.5;
    /** Line height in points of generated facts. */
    static SMALL_LINE_HEIGHT = 13.5;
    /** Smallest text size in points, for tags, labels, identifiers, and page furniture. */
    static MICRO_SIZE = 8.5;
    /** Height in points of a wave edge. */
    static WAVE_HEIGHT = 16.8;
    /** Colors of the guide. */
    colors;
    /** `true` if the brand font is always uppercase, `false` otherwise. */
    brandUppercase;
    /** Brand font letter spacing as a share of the text size. */
    brandLetterSpacing;
    /** Line height of a title as a share of the text size, or `null` when it follows `brandUppercase`. */
    brandLineHeight;
    /** Secondary font letter spacing as a share of the text size. */
    secondaryLetterSpacing;
    /** Running text. */
    body;
    /** Text that names something, such as a step or an item. */
    strong;
    /** Generated facts and values. */
    small;
    /**
     * Creates the theme of one guide style.
     *
     * @param style - Guide style.
     */
    constructor(style) {
        this.colors = style.colors;
        this.brandUppercase = style.fonts.brandUppercase;
        this.brandLetterSpacing = style.fonts.brandLetterSpacing;
        this.brandLineHeight = style.fonts.brandLineHeight;
        this.secondaryLetterSpacing = style.fonts.secondaryLetterSpacing;
        this.body = { size: PdfTheme.BODY_SIZE, lineHeight: PdfTheme.BODY_LINE_HEIGHT, color: style.colors.text };
        this.strong = { ...this.body, font: PdfTheme.BOLD_FONT };
        this.small = { size: PdfTheme.SMALL_SIZE, lineHeight: PdfTheme.SMALL_LINE_HEIGHT, color: style.colors.textMuted };
    }
}
exports.default = PdfTheme;
