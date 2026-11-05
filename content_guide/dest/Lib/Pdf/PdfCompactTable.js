"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PdfTheme_1 = __importDefault(require("../../Data/PdfTheme"));
/**
 * Writes a dense table of names and identifiers.
 */
class PdfCompactTable {
    /** Height of a row. */
    static ROW_HEIGHT = 18;
    /** Line height of a row. */
    static LINE_HEIGHT = 13;
    /** Corner radius of a tinted row. */
    static ROW_RADIUS = 3;
    /** Smallest space between the name and the identifier on one line. */
    static ID_CLEARANCE = 12;
    /** Space below the table. */
    static SPACE_BELOW = 4;
    /** Canvas being written to. */
    canvas;
    /**
     * Creates the table writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas) {
        this.canvas = canvas;
    }
    /**
     * Writes all rows.
     *
     * @param lines - Lines with identifiers.
     */
    write(lines) {
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
    writeRow(line, isTinted) {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const { colors } = theme;
        const left = PdfTheme_1.default.MARGIN;
        const width = canvas.contentWidth();
        const bleed = PdfTheme_1.default.SURFACE_BLEED;
        const nameStyle = { size: PdfTheme_1.default.SMALL_SIZE, lineHeight: PdfCompactTable.LINE_HEIGHT, color: colors.text };
        const codeFont = PdfTheme_1.default.CODE_FONT;
        const codeSize = PdfTheme_1.default.SMALL_SIZE * PdfTheme_1.default.CODE_RATIO;
        const rowHeight = PdfCompactTable.ROW_HEIGHT;
        const identifier = line.identifier ?? "";
        const identifierWidth = text.width(identifier, codeFont, codeSize);
        const nameWidth = text.width(line.text, PdfTheme_1.default.BODY_FONT, nameStyle.size);
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
        }
        else {
            const baseline = text.baselineFor(rowTop + rowHeight / 2, PdfTheme_1.default.BODY_FONT, nameStyle.size);
            text.write(line.text, left, baseline, PdfTheme_1.default.BODY_FONT, nameStyle.size, colors.text);
            text.write(identifier, left + width - identifierWidth, baseline, codeFont, codeSize, colors.textMuted);
        }
        canvas.y = rowTop + height;
    }
}
exports.default = PdfCompactTable;
