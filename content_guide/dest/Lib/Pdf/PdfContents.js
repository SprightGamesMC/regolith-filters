"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PdfTheme_1 = __importDefault(require("../../Data/PdfTheme"));
/**
 * Records the headings and writes the linked contents page.
 */
class PdfContents {
    /** Largest share by which rows grow to fill the page. */
    static MAX_GROWTH = 1.7;
    /** Height of a top level row, without its rule offset. */
    static TOP_ROW_HEIGHT = 27;
    /** Height of a second level row. */
    static ROW_HEIGHT = 20;
    /** Height of a deeper row. */
    static NESTED_ROW_HEIGHT = 16;
    /** Space above a top level row. */
    static TOP_ROW_GAP = 14;
    /** Indent of each level below the second. */
    static LEVEL_INDENT = 16;
    /** Smallest space between a title and its page number. */
    static PAGE_NUMBER_CLEARANCE = 12;
    /** Space kept above the note at the page bottom. */
    static NOTE_GAP = 16;
    /** Space below the rule of a top level row. */
    static RULE_GAP = 4;
    /** Thickness of the rule of a top level row. */
    static RULE_THICKNESS = 1.5;
    /** Canvas being written to. */
    canvas;
    /** Headings to list. */
    lines = [];
    /**
     * Creates the contents writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas) {
        this.canvas = canvas;
    }
    /**
     * Records a heading and adds its link target.
     *
     * @param title - Heading text.
     * @param level - Heading level.
     * @param y - Top of the heading.
     */
    addLine(title, level, y) {
        const { canvas } = this;
        const destination = `section-${this.lines.length}`;
        canvas.pdf.addNamedDestination(destination, "XYZ", null, canvas.pdf.page.height - y, null);
        this.lines.push({ title, level, pageIndex: canvas.currentPageIndex(), destination });
    }
    /**
     * Writes the reserved page after all page numbers are known. Rows grow so the page is full.
     *
     * @param pageIndex - Index of the contents page.
     * @param guide - Built guide.
     * @param band - Writer of the title band.
     */
    write(pageIndex, guide, band) {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const left = PdfTheme_1.default.MARGIN;
        const width = canvas.contentWidth();
        pdf.switchToPage(pageIndex);
        band.write("Contents", "", 0, false);
        const counts = new Intl.ListFormat("en").format(guide.stats.map((stat) => `${stat.value} ${stat.label.toLowerCase()}`));
        const noteLines = text.layout(`This guide lists ${counts}.`, width, theme.small);
        const noteHeight = noteLines.length * theme.small.lineHeight;
        const bottom = pdf.page.height - PdfTheme_1.default.BOTTOM_MARGIN;
        const available = bottom - canvas.y - noteHeight - PdfContents.NOTE_GAP;
        const natural = this.lines.reduce((total, line, index) => total + this.rowHeight(line) + (line.level === 0 && index > 0 ? PdfContents.TOP_ROW_GAP : 0), 0);
        const growth = Math.min(Math.max(available / natural, 1), PdfContents.MAX_GROWTH);
        for (const line of this.lines) {
            this.writeRow(line, growth);
        }
        canvas.y = bottom - noteHeight;
        canvas.writeLines(noteLines, left, theme.small);
    }
    /**
     * Finds the natural height of a row.
     *
     * @param line - Heading to list.
     *
     * @returns Height in points.
     */
    rowHeight(line) {
        if (line.level === 0) {
            return PdfContents.TOP_ROW_HEIGHT + this.canvas.ruleOffset();
        }
        return line.level === 1 ? PdfContents.ROW_HEIGHT : PdfContents.NESTED_ROW_HEIGHT;
    }
    /**
     * Writes one linked row. Top level rows have a rule below them.
     *
     * @param line - Heading to list.
     * @param growth - Multiplier of the row height.
     */
    writeRow(line, growth) {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const { colors } = theme;
        const left = PdfTheme_1.default.MARGIN;
        const width = canvas.contentWidth();
        const isTop = line.level === 0;
        const rowHeight = this.rowHeight(line) * growth;
        if (isTop && this.lines[0] !== line) {
            canvas.y += PdfContents.TOP_ROW_GAP * growth;
        }
        const size = isTop ? PdfTheme_1.default.HEADING_SIZE : line.level === 1 ? PdfTheme_1.default.BODY_SIZE : PdfTheme_1.default.SMALL_SIZE;
        const font = isTop ? PdfTheme_1.default.DISPLAY_FONT : PdfTheme_1.default.BODY_FONT;
        const color = line.level > 1 ? colors.textMuted : colors.text;
        const baseline = text.baselineFor(canvas.y + (rowHeight - (isTop ? canvas.ruleOffset() : 0)) / 2, font, size);
        const x = left + Math.max(0, line.level - 1) * PdfContents.LEVEL_INDENT;
        const page = String(line.pageIndex + 1);
        const pageWidth = text.width(page, font, size);
        const title = text.fit(line.title, font, size, left + width - x - pageWidth - PdfContents.PAGE_NUMBER_CLEARANCE);
        text.write(title, isTop ? x - text.leftBearing(title, font, size) : x, baseline, font, size, color);
        text.write(page, left + width - pageWidth, baseline, font, size, color);
        pdf.goTo(left, canvas.y, width, rowHeight, line.destination);
        canvas.y += rowHeight;
        if (isTop) {
            canvas.drawRule(left, canvas.y, width, PdfContents.RULE_THICKNESS, colors.primary);
            canvas.y += PdfContents.RULE_GAP;
        }
    }
}
exports.default = PdfContents;
