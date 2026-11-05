"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PdfTheme_1 = __importDefault(require("../../Data/PdfTheme"));
const PdfArtwork_1 = __importDefault(require("./PdfArtwork"));
const PdfText_1 = __importDefault(require("./PdfText"));
/**
 * Holds the state that all PDF writers share: the document, the position, and page breaks.
 */
class PdfCanvas {
    /** Space between lines of an all capitals title, as a share of the text size. */
    static CAPITALS_LINE_GAP = 0.21;
    /** Line height of a mixed case title, as a share of the text size. */
    static MIXED_CASE_LEADING = 1.14;
    /** Distance from an all capitals title to its rule. */
    static RULE_OFFSET_CAPITALS = 3;
    /** Distance from a mixed case title to its rule, which clears descenders. */
    static RULE_OFFSET_MIXED_CASE = 8;
    /** Tallest block that moves whole to the next page. A taller one starts in place, which avoids large gaps. */
    static BLOCK_KEEP_LIMIT = 240;
    /** Text between the headings of a running head. */
    static RUNNING_HEAD_SEPARATOR = "   /   ";
    /** PDF being written. */
    pdf;
    /** Style of the guide. */
    style;
    /** Type scale and text styles. */
    theme;
    /** Text tools. */
    text;
    /** Running head text by page index. */
    runningHeads = new Map();
    /** Titles of the headings that contain the current position. */
    headingPath = [];
    /** Top of the next content. */
    y = PdfTheme_1.default.MARGIN;
    /** `true` if a heading was written last, which removes the space above a heading under it. */
    isAfterHeading = false;
    /** Space that the last entry added below itself, which is removed at the end of an item. */
    trailingSpace = 0;
    /** `true` while content only moves the position and draws nothing. */
    isMeasuring = false;
    /** Number of rules written, which alternates their bends. */
    ruleCount = 0;
    /**
     * Creates the canvas of one PDF.
     *
     * @param pdf - PDF being written, with its fonts registered.
     * @param style - Style of the guide.
     */
    constructor(pdf, style) {
        this.pdf = pdf;
        this.style = style;
        this.theme = new PdfTheme_1.default(style);
        this.text = new PdfText_1.default(pdf, this.theme);
    }
    /**
     * Finds the exact height of content by running its writer without drawing.
     *
     * @param write - Writer of the content.
     *
     * @returns Height in points.
     */
    measure(write) {
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
    paint(draw) {
        if (!this.isMeasuring) {
            draw();
        }
    }
    /**
     * Starts a new page when the current page has too little space left. It does nothing while measuring.
     *
     * @param height - Space needed in points.
     */
    keepTogether(height) {
        const bottom = this.pdf.page.height - PdfTheme_1.default.BOTTOM_MARGIN;
        if (!this.isMeasuring && this.y + height > bottom && !this.isAtPageTop()) {
            this.pdf.addPage();
            this.y = PdfTheme_1.default.MARGIN;
            this.recordRunningHead();
        }
    }
    /**
     * Moves content whole to the next page when it does not fit, up to the block limit.
     *
     * @param write - Writer of the content.
     * @param extraHeight - Space needed below the content.
     */
    keepBlockTogether(write, extraHeight = 0) {
        this.keepTogether(Math.min(this.measure(write) + extraHeight, PdfCanvas.BLOCK_KEEP_LIMIT));
    }
    /**
     * Records the running head of the current page from the current headings.
     */
    recordRunningHead() {
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
    writeLines(lines, x, style, isFlush = false) {
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
    drawRule(x, y, width, thickness, color) {
        PdfArtwork_1.default.handRule(this.pdf, x, y, width, thickness, color, this.ruleCount++ % 2 === 1);
    }
    /**
     * Creates the style of a title on the primary color. All capitals have no descenders, so by default their lines are closer together.
     *
     * @param size - Title size in points.
     *
     * @returns PdfTextStyle.
     */
    titleStyle(size) {
        const defaultLineHeight = this.theme.brandUppercase
            ? this.text.capHeight(PdfTheme_1.default.DISPLAY_FONT, size) + size * PdfCanvas.CAPITALS_LINE_GAP
            : size * PdfCanvas.MIXED_CASE_LEADING;
        const lineHeight = this.theme.brandLineHeight === null ? defaultLineHeight : size * this.theme.brandLineHeight;
        return { size, lineHeight, color: this.theme.colors.onPrimary, font: PdfTheme_1.default.DISPLAY_FONT };
    }
    /**
     * Finds the distance from a title line to its rule.
     *
     * @returns Distance in points.
     */
    ruleOffset() {
        return this.theme.brandUppercase ? PdfCanvas.RULE_OFFSET_CAPITALS : PdfCanvas.RULE_OFFSET_MIXED_CASE;
    }
    /**
     * Checks for the top of a page.
     *
     * @returns `true` if nothing is on the page yet, `false` otherwise.
     */
    isAtPageTop() {
        return this.y <= PdfTheme_1.default.MARGIN;
    }
    /**
     * Finds the index of the current page.
     *
     * @returns Zero based page index.
     */
    currentPageIndex() {
        const { start, count } = this.pdf.bufferedPageRange();
        return start + count - 1;
    }
    /**
     * Finds the width between the page margins.
     *
     * @returns Width in points.
     */
    contentWidth() {
        return this.pdf.page.width - PdfTheme_1.default.MARGIN * 2;
    }
}
exports.default = PdfCanvas;
