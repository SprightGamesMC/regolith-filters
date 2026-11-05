import type { ContentsLine, GuideDocument } from "../../Types/ContentGuideTypes";
import type PdfBand from "./PdfBand";
import type PdfCanvas from "./PdfCanvas";
import PdfTheme from "../../Data/PdfTheme";

/**
 * Records the headings and writes the linked contents page.
 */
export default class PdfContents {
    /** Largest share by which rows grow to fill the page. */
    static readonly MAX_GROWTH = 1.7;

    /** Height of a top level row, without its rule offset. */
    static readonly TOP_ROW_HEIGHT = 27;

    /** Height of a second level row. */
    static readonly ROW_HEIGHT = 20;

    /** Height of a deeper row. */
    static readonly NESTED_ROW_HEIGHT = 16;

    /** Space above a top level row. */
    static readonly TOP_ROW_GAP = 14;

    /** Indent of each level below the second. */
    static readonly LEVEL_INDENT = 16;

    /** Smallest space between a title and its page number. */
    static readonly PAGE_NUMBER_CLEARANCE = 12;

    /** Space kept above the note at the page bottom. */
    static readonly NOTE_GAP = 16;

    /** Space below the rule of a top level row. */
    static readonly RULE_GAP = 4;

    /** Thickness of the rule of a top level row. */
    static readonly RULE_THICKNESS = 1.5;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /** Headings to list. */
    private readonly lines: ContentsLine[] = [];

    /**
     * Creates the contents writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas: PdfCanvas) {
        this.canvas = canvas;
    }

    /**
     * Records a heading and adds its link target.
     *
     * @param title - Heading text.
     * @param level - Heading level.
     * @param y - Top of the heading.
     */
    addLine(title: string, level: number, y: number): void {
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
    write(pageIndex: number, guide: GuideDocument, band: PdfBand): void {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const left = PdfTheme.MARGIN;
        const width = canvas.contentWidth();

        pdf.switchToPage(pageIndex);
        band.write("Contents", "", 0, false);

        const counts = new Intl.ListFormat("en").format(guide.stats.map((stat) => `${stat.value} ${stat.label.toLowerCase()}`));
        const noteLines = text.layout(`This guide lists ${counts}.`, width, theme.small);
        const noteHeight = noteLines.length * theme.small.lineHeight;
        const bottom = pdf.page.height - PdfTheme.BOTTOM_MARGIN;
        const available = bottom - canvas.y - noteHeight - PdfContents.NOTE_GAP;
        const natural = this.lines.reduce(
            (total, line, index) => total + this.rowHeight(line) + (line.level === 0 && index > 0 ? PdfContents.TOP_ROW_GAP : 0),
            0
        );
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
    private rowHeight(line: ContentsLine): number {
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
    private writeRow(line: ContentsLine, growth: number): void {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const { colors } = theme;
        const left = PdfTheme.MARGIN;
        const width = canvas.contentWidth();
        const isTop = line.level === 0;
        const rowHeight = this.rowHeight(line) * growth;

        if (isTop && this.lines[0] !== line) {
            canvas.y += PdfContents.TOP_ROW_GAP * growth;
        }

        const size = isTop ? PdfTheme.HEADING_SIZE : line.level === 1 ? PdfTheme.BODY_SIZE : PdfTheme.SMALL_SIZE;
        const font = isTop ? PdfTheme.DISPLAY_FONT : PdfTheme.BODY_FONT;
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
