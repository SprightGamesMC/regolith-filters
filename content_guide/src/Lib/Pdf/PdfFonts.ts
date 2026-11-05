import type { PdfStyle } from "../../Types/ContentGuideTypes";
import PdfTheme from "../../Data/PdfTheme";

/**
 * Registers the fonts of the PDF.
 */
export default abstract class PdfFonts {
    /**
     * Registers the brand, secondary, and monospace fonts.
     *
     * @param pdf - PDF being written.
     * @param fonts - Font files.
     *
     * @throws If a font file cannot be read.
     */
    static register(pdf: PDFKit.PDFDocument, fonts: PdfStyle["fonts"]): void {
        this.registerFont(pdf, PdfTheme.BODY_FONT, fonts.regular);
        this.registerFont(pdf, PdfTheme.BOLD_FONT, fonts.bold);
        this.registerFont(pdf, PdfTheme.CODE_FONT, fonts.monospace);
        this.registerFont(pdf, PdfTheme.DISPLAY_FONT, fonts.brand);
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
    private static registerFont(pdf: PDFKit.PDFDocument, name: string, file: string): void {
        try {
            pdf.registerFont(name, file);
            pdf.font(name);
        } catch (error) {
            throw new Error(`Cannot read font ${file}. Check that it is a valid TTF, OTF, or WOFF file.`, { cause: error });
        }
    }
}
