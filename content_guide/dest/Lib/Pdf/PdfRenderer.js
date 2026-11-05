"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pdfkit_1 = __importDefault(require("pdfkit"));
const DefaultStyle_1 = __importDefault(require("../../Data/DefaultStyle"));
const PdfTheme_1 = __importDefault(require("../../Data/PdfTheme"));
const PdfBand_1 = __importDefault(require("./PdfBand"));
const PdfCanvas_1 = __importDefault(require("./PdfCanvas"));
const PdfCard_1 = __importDefault(require("./PdfCard"));
const PdfCompactTable_1 = __importDefault(require("./PdfCompactTable"));
const PdfContents_1 = __importDefault(require("./PdfContents"));
const PdfCover_1 = __importDefault(require("./PdfCover"));
const PdfFlow_1 = __importDefault(require("./PdfFlow"));
const PdfFonts_1 = __importDefault(require("./PdfFonts"));
const PdfList_1 = __importDefault(require("./PdfList"));
const PdfPageMarks_1 = __importDefault(require("./PdfPageMarks"));
/**
 * Writes the guide as a PDF with a cover, linked contents, bookmarks, and page numbers.
 */
class PdfRenderer {
    /** Share of a page that must be free for a section band to start on that page. */
    static BAND_FREE_SHARE = 0.4;
    /** Height that a band and the start of its content need, on top of the free share. */
    static BAND_MIN_SPACE = 150;
    /** Space between the content above a band and its wave. */
    static BAND_SPACE_ABOVE = 22;
    /** Space below a paragraph. */
    static PARAGRAPH_GAP = 4;
    /** Thickness of the rule below a major heading. */
    static HEADING_RULE_THICKNESS = 1.5;
    /** Space that the rule below a major heading adds, past its offset. */
    static HEADING_RULE_SPACE = 9;
    /** Space above a heading by level, for levels 1, 2, and deeper. */
    static HEADING_SPACE_ABOVE = [30, 18, 14];
    /** Space below a major heading. */
    static HEADING_SPACE_BELOW = 10;
    /** Space below other headings. */
    static MINOR_HEADING_SPACE_BELOW = 7;
    /** Height of the table rows that must fit under a heading. */
    static TABLE_KEEP_ROWS = 2;
    /** Guide to render. */
    guide;
    /** PDF being written. */
    pdf;
    /** Shared state of the writers. */
    canvas;
    /** Writer of section bands. */
    band;
    /** Writer of the contents page. */
    contents;
    /** Writer of running text. */
    flow;
    /** Writer of lists. */
    list;
    /** Writer of items and entities. */
    card;
    /** Number of section bands written, which alternates their wave. */
    bandCount = 0;
    /**
     * Creates a renderer for one guide.
     *
     * @param guide - Built guide.
     * @param style - Colors, logos, and fonts of the guide.
     */
    constructor(guide, style = DefaultStyle_1.default.create()) {
        this.guide = guide;
        this.pdf = new pdfkit_1.default({
            size: "A4",
            margins: {
                top: PdfTheme_1.default.MARGIN,
                bottom: PdfTheme_1.default.BOTTOM_MARGIN,
                left: PdfTheme_1.default.MARGIN,
                right: PdfTheme_1.default.MARGIN,
            },
            bufferPages: true,
            displayTitle: true,
            lang: "en",
            info: { Title: `${guide.title} Content Guide`, Subject: `${guide.contentTypeLabel} content guide, version ${guide.version}` },
        });
        PdfFonts_1.default.register(this.pdf, style.fonts);
        this.canvas = new PdfCanvas_1.default(this.pdf, style);
        this.band = new PdfBand_1.default(this.canvas);
        this.contents = new PdfContents_1.default(this.canvas);
        this.flow = new PdfFlow_1.default(this.canvas);
        this.list = new PdfList_1.default(this.canvas, this.flow);
        this.card = new PdfCard_1.default(this.canvas, this.flow, this.list);
    }
    /**
     * Renders the guide.
     *
     * @returns PDF file contents.
     */
    render() {
        const { canvas, pdf } = this;
        const chunks = [];
        const finished = new Promise((resolve, reject) => {
            pdf.on("data", (chunk) => chunks.push(chunk));
            pdf.on("end", () => resolve(Buffer.concat(chunks)));
            pdf.on("error", reject);
        });
        new PdfCover_1.default(canvas).write(this.guide);
        pdf.addPage();
        const contentsPage = canvas.currentPageIndex();
        canvas.y = pdf.page.height;
        for (const section of this.guide.sections) {
            this.writeSection(section, 0, pdf.outline);
        }
        this.contents.write(contentsPage, this.guide, this.band);
        new PdfPageMarks_1.default(canvas).write(this.guide, contentsPage);
        pdf.end();
        return finished;
    }
    /**
     * Lists the characters that the fonts could not show, which are blank in the PDF.
     *
     * @returns Characters with no glyph.
     */
    missingCharacters() {
        return this.canvas.text.missingCharacters();
    }
    /**
     * Writes one section and its nested sections.
     *
     * @param section - Section to write.
     * @param level - Heading level, starting at 0.
     * @param outline - Parent bookmark.
     */
    writeSection(section, level, outline) {
        const { canvas } = this;
        const isSummaryInBand = level === 0 && section.lines.length + section.sections.length > 0;
        const bookmark = level === 0 ? this.writeBand(section, outline, isSummaryInBand) : this.writeHeading(section, level, outline);
        if (!isSummaryInBand) {
            for (const paragraph of section.paragraphs) {
                this.flow.writeText(paragraph, PdfTheme_1.default.MARGIN, canvas.contentWidth(), canvas.theme.body);
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
    writeBand(section, outline, showSummary) {
        const { canvas, pdf } = this;
        const usesFreeSpace = canvas.y < pdf.page.height * (1 - PdfRenderer.BAND_FREE_SHARE) - PdfRenderer.BAND_MIN_SPACE;
        if (!usesFreeSpace) {
            pdf.addPage();
        }
        const top = usesFreeSpace ? canvas.y + PdfTheme_1.default.WAVE_HEIGHT + PdfRenderer.BAND_SPACE_ABOVE : 0;
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
    writeHeading(section, level, outline) {
        const { canvas } = this;
        const { text, theme } = canvas;
        const isMajor = level === 1;
        const style = this.headingStyle(level);
        const spaceAbove = canvas.isAfterHeading ? 0 : PdfRenderer.HEADING_SPACE_ABOVE[Math.min(level, 3) - 1];
        const ruleSpace = isMajor ? canvas.ruleOffset() + PdfRenderer.HEADING_RULE_SPACE : 0;
        const spaceBelow = isMajor ? PdfRenderer.HEADING_SPACE_BELOW : PdfRenderer.MINOR_HEADING_SPACE_BELOW;
        const lines = text.layout(section.title, canvas.contentWidth(), style);
        const height = lines.length * style.lineHeight + ruleSpace + spaceBelow;
        canvas.keepTogether(spaceAbove + height + Math.min(this.firstContentHeight(section), PdfCanvas_1.default.BLOCK_KEEP_LIMIT));
        if (!canvas.isAtPageTop()) {
            canvas.y += spaceAbove;
        }
        canvas.headingPath.length = level;
        canvas.headingPath.push(section.title);
        if (canvas.isAtPageTop()) {
            canvas.recordRunningHead();
        }
        this.contents.addLine(section.title, level, canvas.y);
        canvas.writeLines(lines, PdfTheme_1.default.MARGIN, style, isMajor);
        if (isMajor) {
            canvas.drawRule(PdfTheme_1.default.MARGIN, canvas.y + canvas.ruleOffset(), canvas.contentWidth(), PdfRenderer.HEADING_RULE_THICKNESS, theme.colors.primary);
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
    headingStyle(level) {
        const { colors } = this.canvas.theme;
        if (level === 1) {
            return { size: PdfTheme_1.default.HEADING_SIZE, lineHeight: 26, color: colors.text, font: PdfTheme_1.default.DISPLAY_FONT };
        }
        return level === 2
            ? { size: PdfTheme_1.default.SUBHEADING_SIZE, lineHeight: 19, color: colors.text, font: PdfTheme_1.default.BOLD_FONT }
            : { size: PdfTheme_1.default.MINOR_HEADING_SIZE, lineHeight: 17, color: colors.textMuted, font: PdfTheme_1.default.BOLD_FONT };
    }
    /**
     * Finds the height of the first content under a heading.
     *
     * @param section - Section of the heading.
     *
     * @returns Height in points.
     */
    firstContentHeight(section) {
        const { canvas } = this;
        const line = section.lines[0];
        if (section.paragraphs.length > 0) {
            return canvas.theme.body.lineHeight;
        }
        if (line) {
            if (section.isCompact) {
                return PdfCompactTable_1.default.ROW_HEIGHT * PdfRenderer.TABLE_KEEP_ROWS;
            }
            if (line.identifier) {
                return canvas.measure(() => this.card.writeContent(line));
            }
            if (section.ordered) {
                return canvas.measure(() => this.list.writeStep(line, 0, false));
            }
            return canvas.measure(() => this.list.writeBullet(line, PdfTheme_1.default.MARGIN, canvas.contentWidth(), 0));
        }
        const child = section.sections[0];
        return child ? this.headingStyle(2).lineHeight + PdfRenderer.MINOR_HEADING_SPACE_BELOW + this.firstContentHeight(child) : 0;
    }
    /**
     * Writes the list of a section in the style that fits its content.
     *
     * @param section - Section to write.
     */
    writeLines(section) {
        if (section.lines.length === 0) {
            return;
        }
        if (section.isCompact) {
            new PdfCompactTable_1.default(this.canvas).write(section.lines);
            return;
        }
        if (section.ordered) {
            this.list.writeSteps(section.lines);
            return;
        }
        section.lines.forEach((line, index) => {
            if (line.identifier) {
                this.card.write(line, index === section.lines.length - 1);
            }
            else if (line.isHeading) {
                this.list.writeRelease(line);
            }
            else {
                this.list.writeTopBullet(line);
            }
        });
    }
}
exports.default = PdfRenderer;
