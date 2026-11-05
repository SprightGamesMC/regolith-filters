"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PdfTheme_1 = __importDefault(require("../../Data/PdfTheme"));
/**
 * Registers the fonts of the PDF.
 */
class PdfFonts {
    /**
     * Registers the brand, secondary, and monospace fonts.
     *
     * @param pdf - PDF being written.
     * @param fonts - Font files.
     *
     * @throws If a font file cannot be read.
     */
    static register(pdf, fonts) {
        this.registerFont(pdf, PdfTheme_1.default.BODY_FONT, fonts.regular);
        this.registerFont(pdf, PdfTheme_1.default.BOLD_FONT, fonts.bold);
        this.registerFont(pdf, PdfTheme_1.default.CODE_FONT, fonts.monospace);
        this.registerFont(pdf, PdfTheme_1.default.DISPLAY_FONT, fonts.brand);
    }
    /**
     * Registers one font and opens it, so a broken file fails here with a clear message.
     *
     * @param pdf - PDF being written.
     * @param name - Font name in the PDF.
     * @param file - Absolute font path.
     *
     * @throws If the font file cannot be read.
     */
    static registerFont(pdf, name, file) {
        try {
            pdf.registerFont(name, file);
            pdf.font(name);
        }
        catch (error) {
            throw new Error(`Cannot read font ${file}. Check that it is a valid TTF, OTF, or WOFF file.`, { cause: error });
        }
    }
}
exports.default = PdfFonts;
