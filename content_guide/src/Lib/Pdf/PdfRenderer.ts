import type { GuideDocument, GuideSection, PdfStyle, PdfTextStyle } from "../../Types/ContentGuideTypes";
import PDFDocument from "pdfkit";
import DefaultStyle from "../../Data/DefaultStyle";
import PdfTheme from "../../Data/PdfTheme";
import PdfBand from "./PdfBand";
import PdfCanvas from "./PdfCanvas";
import PdfCard from "./PdfCard";
import PdfCompactTable from "./PdfCompactTable";
import PdfContents from "./PdfContents";
import PdfCover from "./PdfCover";
import PdfFlow from "./PdfFlow";
import PdfFonts from "./PdfFonts";
import PdfList from "./PdfList";
import PdfPageMarks from "./PdfPageMarks";

/**
 * Writes the guide as a PDF with a cover, linked contents, bookmarks, and page numbers.
 */
export default class PdfRenderer {
    /** Share of a page that must be free for a section band to start on that page. */
    static readonly BAND_FREE_SHARE = 0.4;

    /** Height that a band and the start of its content need, on top of the free share. */
    static readonly BAND_MIN_SPACE = 150;

    /** Space between the content above a band and its wave. */
    static readonly BAND_SPACE_ABOVE = 22;

    /** Space below a paragraph. */
    static readonly PARAGRAPH_GAP = 4;

    /** Thickness of the rule below a major heading. */
    static readonly HEADING_RULE_THICKNESS = 1.5;

    /** Space that the rule below a major heading adds, past its offset. */
    static readonly HEADING_RULE_SPACE = 9;

    /** Space above a heading by level, for levels 1, 2, and deeper. */
    static readonly HEADING_SPACE_ABOVE: readonly number[] = [30, 18, 14];

    /** Space below a major heading. */
    static readonly HEADING_SPACE_BELOW = 10;

    /** Space below other headings. */
    static readonly MINOR_HEADING_SPACE_BELOW = 7;

    /** Height of the table rows that must fit under a heading. */
    static readonly TABLE_KEEP_ROWS = 2;

    /** Guide to render. */
    private readonly guide: GuideDocument;

    /** PDF being written. */
    private readonly pdf: PDFKit.PDFDocument;

    /** Shared state of the writers. */
    private readonly canvas: PdfCanvas;

    /** Writer of section bands. */
    private readonly band: PdfBand;

    /** Writer of the contents page. */
    private readonly contents: PdfContents;

    /** Writer of running text. */
    private readonly flow: PdfFlow;

    /** Writer of lists. */
    private readonly list: PdfList;

    /** Writer of items and entities. */
    private readonly card: PdfCard;

    /** Number of section bands written, which alternates their wave. */
    private bandCount = 0;

    /**
     * Creates a renderer for one guide.
     *
     * @param guide - Built guide.
     * @param style - Colors, logos, and fonts of the guide.
     */
    constructor(guide: GuideDocument, style: PdfStyle = DefaultStyle.create()) {
        this.guide = guide;
        this.pdf = new PDFDocument({
            size: "A4",
            margins: {
                top: PdfTheme.MARGIN,
                bottom: PdfTheme.BOTTOM_MARGIN,
                left: PdfTheme.MARGIN,
                right: PdfTheme.MARGIN,
            },
            bufferPages: true,
            displayTitle: true,
            lang: "en",
            info: { Title: `${guide.title} Content Guide`, Subject: `${guide.contentTypeLabel} content guide, version ${guide.version}` },
        });
        PdfFonts.register(this.pdf, style.fonts);
        this.canvas = new PdfCanvas(this.pdf, style);
        this.band = new PdfBand(this.canvas);
        this.contents = new PdfContents(this.canvas);
        this.flow = new PdfFlow(this.canvas);
        this.list = new PdfList(this.canvas, this.flow);
        this.card = new PdfCard(this.canvas, this.flow, this.list);
    }

    /**
     * Renders the guide.
     *
     * @returns PDF file contents.
     */
    render(): Promise<Buffer> {
        const { canvas, pdf } = this;
        const chunks: Buffer[] = [];
        const finished = new Promise<Buffer>((resolve, reject) => {
            pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
            pdf.on("end", () => resolve(Buffer.concat(chunks)));
            pdf.on("error", reject);
        });

        new PdfCover(canvas).write(this.guide);
        pdf.addPage();

        const contentsPage = canvas.currentPageIndex();

        canvas.y = pdf.page.height;

        for (const section of this.guide.sections) {
            this.writeSection(section, 0, pdf.outline);
        }

        this.contents.write(contentsPage, this.guide, this.band);
        new PdfPageMarks(canvas).write(this.guide, contentsPage);
        pdf.end();

        return finished;
    }

    /**
     * Lists the characters that the fonts could not show, which are blank in the PDF.
     *
     * @returns Characters with no glyph.
     */
    missingCharacters(): string[] {
        return this.canvas.text.missingCharacters();
    }

    /**
     * Writes one section and its nested sections.
     *
     * @param section - Section to write.
     * @param level - Heading level, starting at 0.
     * @param outline - Parent bookmark.
     */
    private writeSection(section: GuideSection, level: number, outline: PDFKit.PDFOutline): void {
        const { canvas } = this;
        const isSummaryInBand = level === 0 && section.lines.length + section.sections.length > 0;
        const bookmark = level === 0 ? this.writeBand(section, outline, isSummaryInBand) : this.writeHeading(section, level, outline);

        if (!isSummaryInBand) {
            for (const paragraph of section.paragraphs) {
                this.flow.writeText(paragraph, PdfTheme.MARGIN, canvas.contentWidth(), canvas.theme.body);
                canvas.y += PdfRenderer.PARAGRAPH_GAP;
            }
        }

        this.writeLines(section);

        for (const child of section.sections) {
            this.writeSection(child, level + 1, bookmark);
        }

        canvas.headingPath.length = level;
    }

    /**
     * Writes the band of a top level section. It uses free space on the current page, and otherwise starts a new page.
     *
     * @param section - Top level section.
     * @param outline - Parent bookmark.
     * @param showSummary - `true` if the band shows the section summary, `false` otherwise.
     *
     * @returns Bookmark of this section.
     */
    private writeBand(section: GuideSection, outline: PDFKit.PDFOutline, showSummary: boolean): PDFKit.PDFOutline {
        const { canvas, pdf } = this;
        const usesFreeSpace = canvas.y < pdf.page.height * (1 - PdfRenderer.BAND_FREE_SHARE) - PdfRenderer.BAND_MIN_SPACE;

        if (!usesFreeSpace) {
            pdf.addPage();
        }

        const top = usesFreeSpace ? canvas.y + PdfTheme.WAVE_HEIGHT + PdfRenderer.BAND_SPACE_ABOVE : 0;

        canvas.headingPath.length = 0;
        canvas.headingPath.push(section.title);
        this.contents.addLine(section.title, 0, top);
        this.band.write(section.title, showSummary ? (section.paragraphs[0] ?? "") : "", top, this.bandCount++ % 2 === 0);
        canvas.isAfterHeading = true;

        return outline.addItem(section.title);
    }

    /**
     * Writes a nested heading, which stays on one page with the content under it.
     *
     * @param section - Section of the heading.
     * @param level - Heading level, 1 or deeper.
     * @param outline - Parent bookmark.
     *
     * @returns Bookmark of this heading.
     */
    private writeHeading(section: GuideSection, level: number, outline: PDFKit.PDFOutline): PDFKit.PDFOutline {
        const { canvas } = this;
        const { text, theme } = canvas;
        const isMajor = level === 1;
        const style = this.headingStyle(level);
        const spaceAbove = canvas.isAfterHeading ? 0 : PdfRenderer.HEADING_SPACE_ABOVE[Math.min(level, 3) - 1];
        const ruleSpace = isMajor ? canvas.ruleOffset() + PdfRenderer.HEADING_RULE_SPACE : 0;
        const spaceBelow = isMajor ? PdfRenderer.HEADING_SPACE_BELOW : PdfRenderer.MINOR_HEADING_SPACE_BELOW;
        const lines = text.layout(section.title, canvas.contentWidth(), style);
        const height = lines.length * style.lineHeight + ruleSpace + spaceBelow;

        canvas.keepTogether(spaceAbove + height + Math.min(this.firstContentHeight(section), PdfCanvas.BLOCK_KEEP_LIMIT));

        if (!canvas.isAtPageTop()) {
            canvas.y += spaceAbove;
        }

        canvas.headingPath.length = level;
        canvas.headingPath.push(section.title);

        if (canvas.isAtPageTop()) {
            canvas.recordRunningHead();
        }

        this.contents.addLine(section.title, level, canvas.y);
        canvas.writeLines(lines, PdfTheme.MARGIN, style, isMajor);

        if (isMajor) {
            canvas.drawRule(
                PdfTheme.MARGIN,
                canvas.y + canvas.ruleOffset(),
                canvas.contentWidth(),
                PdfRenderer.HEADING_RULE_THICKNESS,
                theme.colors.primary
            );
            canvas.y += ruleSpace;
        }

        canvas.y += spaceBelow;
        canvas.isAfterHeading = true;

        return outline.addItem(section.title);
    }

    /**
     * Finds the style of a heading.
     *
     * @param level - Heading level, 1 or deeper.
     *
     * @returns PdfTextStyle.
     */
    private headingStyle(level: number): PdfTextStyle {
        const { colors } = this.canvas.theme;

        if (level === 1) {
            return { size: PdfTheme.HEADING_SIZE, lineHeight: 26, color: colors.text, font: PdfTheme.DISPLAY_FONT };
        }

        return level === 2
            ? { size: PdfTheme.SUBHEADING_SIZE, lineHeight: 19, color: colors.text, font: PdfTheme.BOLD_FONT }
            : { size: PdfTheme.MINOR_HEADING_SIZE, lineHeight: 17, color: colors.textMuted, font: PdfTheme.BOLD_FONT };
    }

    /**
     * Finds the height of the first content under a heading.
     *
     * @param section - Section of the heading.
     *
     * @returns Height in points.
     */
    private firstContentHeight(section: GuideSection): number {
        const { canvas } = this;
        const line = section.lines[0];

        if (section.paragraphs.length > 0) {
            return canvas.theme.body.lineHeight;
        }

        if (line) {
            if (section.isCompact) {
                return PdfCompactTable.ROW_HEIGHT * PdfRenderer.TABLE_KEEP_ROWS;
            }

            if (line.identifier) {
                return canvas.measure(() => this.card.writeContent(line));
            }

            if (section.ordered) {
                return canvas.measure(() => this.list.writeStep(line, 0, false));
            }

            return canvas.measure(() => this.list.writeBullet(line, PdfTheme.MARGIN, canvas.contentWidth(), 0));
        }

        const child = section.sections[0];

        return child ? this.headingStyle(2).lineHeight + PdfRenderer.MINOR_HEADING_SPACE_BELOW + this.firstContentHeight(child) : 0;
    }

    /**
     * Writes the list of a section in the style that fits its content.
     *
     * @param section - Section to write.
     */
    private writeLines(section: GuideSection): void {
        if (section.lines.length === 0) {
            return;
        }

        if (section.isCompact) {
            new PdfCompactTable(this.canvas).write(section.lines);
            return;
        }

        if (section.ordered) {
            this.list.writeSteps(section.lines);
            return;
        }

        section.lines.forEach((line, index) => {
            if (line.identifier) {
                this.card.write(line, index === section.lines.length - 1);
            } else if (line.isHeading) {
                this.list.writeRelease(line);
            } else {
                this.list.writeTopBullet(line);
            }
        });
    }
}
