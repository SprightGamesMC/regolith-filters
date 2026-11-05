import type { GuideDocument } from "../../Types/ContentGuideTypes";
import type PdfCanvas from "./PdfCanvas";
import PdfTheme from "../../Data/PdfTheme";
import PdfImage from "./PdfImage";

/**
 * Writes the running head and footer of each page.
 */
export default class PdfPageMarks {
    /** Distance from the page bottom to the center of the footer. */
    static readonly FOOTER_OFFSET = 34;

    /** Baseline of the running head. */
    static readonly HEAD_BASELINE = 36;

    /** Largest share of the content width for the footer label. */
    static readonly LABEL_WIDTH_SHARE = 0.7;

    /** Width of the logo box. */
    static readonly LOGO_WIDTH = 14;

    /** Height of the logo box. */
    static readonly LOGO_HEIGHT = 16;

    /** Width that the logo and its gap add before the footer label. */
    static readonly LOGO_SPACE = 18;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /**
     * Creates the page marks writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas: PdfCanvas) {
        this.canvas = canvas;
    }

    /**
     * Writes the marks after all pages exist. The cover has none, and pages with a title have no running head.
     *
     * @param guide - Built guide.
     * @param contentsPage - Index of the contents page.
     */
    write(guide: GuideDocument, contentsPage: number): void {
        const { start, count } = this.canvas.pdf.bufferedPageRange();

        for (let index = start + 1; index < start + count; index++) {
            this.writePage(guide, index, count, index === contentsPage);
        }
    }

    /**
     * Writes the marks of one page. The footer is under the bottom margin, which is removed so it does not start a new page.
     *
     * @param guide - Built guide.
     * @param index - Page index.
     * @param count - Number of pages.
     * @param isContentsPage - `true` if this is the contents page, `false` otherwise.
     */
    private writePage(guide: GuideDocument, index: number, count: number, isContentsPage: boolean): void {
        const { canvas } = this;
        const { pdf, runningHeads, style, text, theme } = canvas;
        const font = PdfTheme.BODY_FONT;
        const size = PdfTheme.MICRO_SIZE;
        const left = PdfTheme.MARGIN;
        const color = theme.colors.textMuted;
        const width = canvas.contentWidth();

        pdf.switchToPage(index);
        pdf.page.margins.bottom = 0;

        const centerY = pdf.page.height - PdfPageMarks.FOOTER_OFFSET;
        const baseline = text.baselineFor(centerY, font, size);
        const label = text.fit(`${guide.title} Content Guide ${guide.version}`, font, size, width * PdfPageMarks.LABEL_WIDTH_SHARE);
        const pageLabel = `Page ${index + 1} of ${count}`;
        const head = runningHeads.get(index);

        if (style.logo) {
            PdfImage.fit(pdf, style.logo, left, centerY - PdfPageMarks.LOGO_HEIGHT / 2, PdfPageMarks.LOGO_WIDTH, PdfPageMarks.LOGO_HEIGHT);
        }

        text.write(label, left + (style.logo ? PdfPageMarks.LOGO_SPACE : 0), baseline, font, size, color);
        text.write(pageLabel, left + width - text.width(pageLabel, font, size), baseline, font, size, color);

        if (head && !isContentsPage) {
            text.write(text.fit(head, font, size, width), left, PdfPageMarks.HEAD_BASELINE, font, size, color);
        }
    }
}
