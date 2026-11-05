import type { PdfStyle, PdfTextLine, PdfTextStyle } from "../../Types/ContentGuideTypes";
import PdfTheme from "../../Data/PdfTheme";
import PdfArtwork from "./PdfArtwork";
import PdfText from "./PdfText";

/**
 * Holds the state that all PDF writers share: the document, the position, and page breaks.
 */
export default class PdfCanvas {
    /** Space between lines of an all capitals title, as a share of the text size. */
    static readonly CAPITALS_LINE_GAP = 0.21;

    /** Line height of a mixed case title, as a share of the text size. */
    static readonly MIXED_CASE_LEADING = 1.14;

    /** Distance from an all capitals title to its rule. */
    static readonly RULE_OFFSET_CAPITALS = 3;

    /** Distance from a mixed case title to its rule, which clears descenders. */
    static readonly RULE_OFFSET_MIXED_CASE = 8;

    /** Tallest block that moves whole to the next page. A taller one starts in place, which avoids large gaps. */
    static readonly BLOCK_KEEP_LIMIT = 240;

    /** Text between the headings of a running head. */
    static readonly RUNNING_HEAD_SEPARATOR = "   /   ";

    /** PDF being written. */
    readonly pdf: PDFKit.PDFDocument;

    /** Style of the guide. */
    readonly style: PdfStyle;

    /** Type scale and text styles. */
    readonly theme: PdfTheme;

    /** Text tools. */
    readonly text: PdfText;

    /** Running head text by page index. */
    readonly runningHeads = new Map<number, string>();

    /** Titles of the headings that contain the current position. */
    readonly headingPath: string[] = [];

    /** Top of the next content. */
    y: number = PdfTheme.MARGIN;

    /** `true` if a heading was written last, which removes the space above a heading under it. */
    isAfterHeading = false;

    /** Space that the last entry added below itself, which is removed at the end of an item. */
    trailingSpace = 0;

    /** `true` while content only moves the position and draws nothing. */
    private isMeasuring = false;

    /** Number of rules written, which alternates their bends. */
    private ruleCount = 0;

    /**
     * Creates the canvas of one PDF.
     *
     * @param pdf - PDF being written, with its fonts registered.
     * @param style - Style of the guide.
     */
    constructor(pdf: PDFKit.PDFDocument, style: PdfStyle) {
        this.pdf = pdf;
        this.style = style;
        this.theme = new PdfTheme(style);
        this.text = new PdfText(pdf, this.theme);
    }

    /**
     * Finds the exact height of content by running its writer without drawing.
     *
     * @param write - Writer of the content.
     *
     * @returns Height in points.
     */
    measure(write: () => void): number {
        const { y, isAfterHeading, isMeasuring } = this;

        this.isMeasuring = true;
        write();

        const height = this.y - y;

        this.y = y;
        this.isAfterHeading = isAfterHeading;
        this.isMeasuring = isMeasuring;

        return height;
    }

    /**
     * Draws unless the current run only measures.
     *
     * @param draw - Drawing code.
     */
    paint(draw: () => void): void {
        if (!this.isMeasuring) {
            draw();
        }
    }

    /**
     * Starts a new page when the current page has too little space left. It does nothing while measuring.
     *
     * @param height - Space needed in points.
     */
    keepTogether(height: number): void {
        const bottom = this.pdf.page.height - PdfTheme.BOTTOM_MARGIN;

        if (!this.isMeasuring && this.y + height > bottom && !this.isAtPageTop()) {
            this.pdf.addPage();
            this.y = PdfTheme.MARGIN;
            this.recordRunningHead();
        }
    }

    /**
     * Moves content whole to the next page when it does not fit, up to the block limit.
     *
     * @param write - Writer of the content.
     * @param extraHeight - Space needed below the content.
     */
    keepBlockTogether(write: () => void, extraHeight = 0): void {
        this.keepTogether(Math.min(this.measure(write) + extraHeight, PdfCanvas.BLOCK_KEEP_LIMIT));
    }

    /**
     * Records the running head of the current page from the current headings.
     */
    recordRunningHead(): void {
        this.runningHeads.set(this.currentPageIndex(), this.headingPath.join(PdfCanvas.RUNNING_HEAD_SEPARATOR));
    }

    /**
     * Writes wrapped lines at the current position.
     *
     * @param lines - Wrapped lines.
     * @param x - Left position.
     * @param style - Text style.
     * @param isFlush - `true` to line up the ink of the first letter with the left position, `false` otherwise.
     */
    writeLines(lines: PdfTextLine[], x: number, style: PdfTextStyle, isFlush = false): void {
        for (const line of lines) {
            const top = this.y;

            this.paint(() => this.text.writeLine(line, x, top, style, isFlush));
            this.y += style.lineHeight;
        }
    }

    /**
     * Draws a hand drawn rule, with bends that alternate between rules.
     *
     * @param x - Left position.
     * @param y - Vertical position.
     * @param width - Rule width.
     * @param thickness - Line thickness.
     * @param color - Line color.
     */
    drawRule(x: number, y: number, width: number, thickness: number, color: string): void {
        PdfArtwork.handRule(this.pdf, x, y, width, thickness, color, this.ruleCount++ % 2 === 1);
    }

    /**
     * Creates the style of a title on the primary color. All capitals have no descenders, so by default their lines are closer together.
     *
     * @param size - Title size in points.
     *
     * @returns PdfTextStyle.
     */
    titleStyle(size: number): PdfTextStyle {
        const defaultLineHeight = this.theme.brandUppercase
            ? this.text.capHeight(PdfTheme.DISPLAY_FONT, size) + size * PdfCanvas.CAPITALS_LINE_GAP
            : size * PdfCanvas.MIXED_CASE_LEADING;
        const lineHeight = this.theme.brandLineHeight === null ? defaultLineHeight : size * this.theme.brandLineHeight;

        return { size, lineHeight, color: this.theme.colors.onPrimary, font: PdfTheme.DISPLAY_FONT };
    }

    /**
     * Finds the distance from a title line to its rule.
     *
     * @returns Distance in points.
     */
    ruleOffset(): number {
        return this.theme.brandUppercase ? PdfCanvas.RULE_OFFSET_CAPITALS : PdfCanvas.RULE_OFFSET_MIXED_CASE;
    }

    /**
     * Checks for the top of a page.
     *
     * @returns `true` if nothing is on the page yet, `false` otherwise.
     */
    isAtPageTop(): boolean {
        return this.y <= PdfTheme.MARGIN;
    }

    /**
     * Finds the index of the current page.
     *
     * @returns Zero based page index.
     */
    currentPageIndex(): number {
        const { start, count } = this.pdf.bufferedPageRange();

        return start + count - 1;
    }

    /**
     * Finds the width between the page margins.
     *
     * @returns Width in points.
     */
    contentWidth(): number {
        return this.pdf.page.width - PdfTheme.MARGIN * 2;
    }
}
