import fs from "fs";
import path from "path";
import SvgToPdfKit from "svg-to-pdfkit";

/**
 * Draws a team logo file, which is SVG, PNG, or JPEG, inside a box.
 */
export default abstract class PdfImage {
    /** SVG warnings that mean the file cannot be drawn. */
    static readonly FATAL_SVG_WARNING = /parseXml|does not look like|can't be rendered directly/;

    /**
     * Draws the whole image inside a box, aligned to the left and centered down, without cropping it.
     *
     * @param pdf - PDF being written.
     * @param file - Absolute image path.
     * @param x - Left position.
     * @param y - Top position.
     * @param width - Box width.
     * @param height - Box height.
     *
     * @throws If the file cannot be drawn.
     */
    static fit(pdf: PDFKit.PDFDocument, file: string, x: number, y: number, width: number, height: number): void {
        try {
            if (path.extname(file).toLowerCase() === ".svg") {
                this.drawSvg(pdf, file, x, y, width, height);
            } else {
                pdf.image(file, x, y, { fit: [width, height], valign: "center" });
            }
        } catch (error) {
            throw new Error(`Cannot draw image ${file}. Check that it is a valid SVG, PNG, or JPEG file.`, { cause: error });
        }
    }

    /**
     * Draws an SVG file, which must be well formed, since a broken file would otherwise leave a blank space with no error.
     *
     * @param pdf - PDF being written.
     * @param file - Absolute image path.
     * @param x - Left position.
     * @param y - Top position.
     * @param width - Box width.
     * @param height - Box height.
     *
     * @throws If the file is not valid SVG.
     */
    private static drawSvg(pdf: PDFKit.PDFDocument, file: string, x: number, y: number, width: number, height: number): void {
        const warningCallback = (message: string): void => {
            if (PdfImage.FATAL_SVG_WARNING.test(message)) {
                throw new Error(message);
            }

            process.stderr.write(`content_guide: warning: ${path.basename(file)}: ${message}\n`);
        };

        SvgToPdfKit(pdf, fs.readFileSync(file, "utf8"), x, y, {
            width,
            height,
            preserveAspectRatio: "xMinYMid meet",
            assumePt: true,
            warningCallback,
        });
    }
}
