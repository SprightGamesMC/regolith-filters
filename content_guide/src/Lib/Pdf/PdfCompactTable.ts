import type { GuideLine, PdfTextStyle } from "../../Types/ContentGuideTypes";
import type PdfCanvas from "./PdfCanvas";
import PdfTheme from "../../Data/PdfTheme";

/**
 * Writes a dense table of names and identifiers.
 */
export default class PdfCompactTable {
    /** Height of a row. */
    static readonly ROW_HEIGHT = 18;

    /** Line height of a row. */
    static readonly LINE_HEIGHT = 13;

    /** Corner radius of a tinted row. */
    static readonly ROW_RADIUS = 3;

    /** Smallest space between the name and the identifier on one line. */
    static readonly ID_CLEARANCE = 12;

    /** Space below the table. */
    static readonly SPACE_BELOW = 4;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /**
     * Creates the table writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas: PdfCanvas) {
        this.canvas = canvas;
    }

    /**
     * Writes all rows.
     *
     * @param lines - Lines with identifiers.
     */
    write(lines: GuideLine[]): void {
        lines.forEach((line, index) => this.writeRow(line, index % 2 === 0));
        this.canvas.y += PdfCompactTable.SPACE_BELOW;
        this.canvas.isAfterHeading = false;
    }

    /**
     * Writes one row. It stacks and wraps when the name and identifier do not fit on one line, so neither can overflow.
     *
     * @param line - Line with an identifier.
     * @param isTinted - `true` if the row has a tinted background, `false` otherwise.
     */
    private writeRow(line: GuideLine, isTinted: boolean): void {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const { colors } = theme;
        const left = PdfTheme.MARGIN;
        const width = canvas.contentWidth();
        const bleed = PdfTheme.SURFACE_BLEED;
        const nameStyle: PdfTextStyle = { size: PdfTheme.SMALL_SIZE, lineHeight: PdfCompactTable.LINE_HEIGHT, color: colors.text };
        const codeFont = PdfTheme.CODE_FONT;
        const codeSize = PdfTheme.SMALL_SIZE * PdfTheme.CODE_RATIO;
        const rowHeight = PdfCompactTable.ROW_HEIGHT;
        const identifier = line.identifier ?? "";
        const identifierWidth = text.width(identifier, codeFont, codeSize);
        const nameWidth = text.width(line.text, PdfTheme.BODY_FONT, nameStyle.size);
        const isStacked = nameWidth + identifierWidth + PdfCompactTable.ID_CLEARANCE > width;
        const nameLines = isStacked ? text.layout(line.text, width, nameStyle) : [];
        const identifierLines = isStacked ? text.wrapCode(identifier, codeFont, codeSize, width) : [];
        const padding = (rowHeight - nameStyle.lineHeight) / 2;
        const height = isStacked ? padding * 2 + (nameLines.length + identifierLines.length) * nameStyle.lineHeight : rowHeight;

        canvas.keepTogether(height);

        const rowTop = canvas.y;

        if (isTinted) {
            pdf.roundedRect(left - bleed, rowTop, width + bleed * 2, height, PdfCompactTable.ROW_RADIUS).fill(colors.surfaceSoft);
        }

        if (isStacked) {
            canvas.y += padding;
            canvas.writeLines(nameLines, left, nameStyle);

            for (const identifierLine of identifierLines) {
                const baseline = text.baselineFor(canvas.y + nameStyle.lineHeight / 2, codeFont, codeSize);

                text.write(identifierLine, left, baseline, codeFont, codeSize, colors.textMuted);
                canvas.y += nameStyle.lineHeight;
            }
        } else {
            const baseline = text.baselineFor(rowTop + rowHeight / 2, PdfTheme.BODY_FONT, nameStyle.size);

            text.write(line.text, left, baseline, PdfTheme.BODY_FONT, nameStyle.size, colors.text);
            text.write(identifier, left + width - identifierWidth, baseline, codeFont, codeSize, colors.textMuted);
        }

        canvas.y = rowTop + height;
    }
}
