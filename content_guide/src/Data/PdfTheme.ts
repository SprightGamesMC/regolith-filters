import type { PdfColors, PdfStyle, PdfTextStyle } from "../Types/ContentGuideTypes";

/**
 * Type scale and spacing of the PDF, with the text styles of one guide style.
 */
export default class PdfTheme {
    /** Name of the regular text font. */
    static readonly BODY_FONT = "Body";

    /** Name of the bold text font. */
    static readonly BOLD_FONT = "Bold";

    /** Name of the title font. */
    static readonly DISPLAY_FONT = "Display";

    /** Name of the font for coordinates, commands, and identifiers. */
    static readonly CODE_FONT = "Code";

    /** Code size as a share of the text size, so the lowercase letters of both fonts have the same height. */
    static readonly CODE_RATIO = 0.87;

    /** Space in points between the page edge and the content. */
    static readonly MARGIN = 50;

    /** Space in points kept free at the page bottom for the footer. */
    static readonly BOTTOM_MARGIN = 62;

    /** Distance in points that a tinted surface extends past the text, so text keeps the page margin. */
    static readonly SURFACE_BLEED = 8;

    /** Largest cover title size in points. */
    static readonly COVER_TITLE_SIZE = 84;

    /** Page title size in points. */
    static readonly TITLE_SIZE = 42;

    /** Major heading size in points. */
    static readonly HEADING_SIZE = 21;

    /** Minor heading size in points. */
    static readonly SUBHEADING_SIZE = 14;

    /** Smallest heading size in points. */
    static readonly MINOR_HEADING_SIZE = 12;

    /** Running text size in points. */
    static readonly BODY_SIZE = 11;

    /** Line height in points of running text. */
    static readonly BODY_LINE_HEIGHT = 16;

    /** Generated fact size in points. */
    static readonly SMALL_SIZE = 9.5;

    /** Line height in points of generated facts. */
    static readonly SMALL_LINE_HEIGHT = 13.5;

    /** Smallest text size in points, for tags, labels, identifiers, and page furniture. */
    static readonly MICRO_SIZE = 8.5;

    /** Height in points of a wave edge. */
    static readonly WAVE_HEIGHT = 16.8;

    /** Colors of the guide. */
    readonly colors: PdfColors;

    /** `true` if the brand font is always uppercase, `false` otherwise. */
    readonly brandUppercase: boolean;

    /** Brand font letter spacing as a share of the text size. */
    readonly brandLetterSpacing: number;

    /** Line height of a title as a share of the text size, or `null` when it follows `brandUppercase`. */
    readonly brandLineHeight: number | null;

    /** Secondary font letter spacing as a share of the text size. */
    readonly secondaryLetterSpacing: number;

    /** Running text. */
    readonly body: PdfTextStyle;

    /** Text that names something, such as a step or an item. */
    readonly strong: PdfTextStyle;

    /** Generated facts and values. */
    readonly small: PdfTextStyle;

    /**
     * Creates the theme of one guide style.
     *
     * @param style - Guide style.
     */
    constructor(style: PdfStyle) {
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
