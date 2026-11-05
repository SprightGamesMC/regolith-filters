"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const svg_to_pdfkit_1 = __importDefault(require("svg-to-pdfkit"));
/**
 * Draws a team logo file, which is SVG, PNG, or JPEG, inside a box.
 */
class PdfImage {
    /** SVG warnings that mean the file cannot be drawn. */
    static FATAL_SVG_WARNING = /parseXml|does not look like|can't be rendered directly/;
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
    static fit(pdf, file, x, y, width, height) {
        try {
            if (path_1.default.extname(file).toLowerCase() === ".svg") {
                this.drawSvg(pdf, file, x, y, width, height);
            }
            else {
                pdf.image(file, x, y, { fit: [width, height], valign: "center" });
            }
        }
        catch (error) {
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
    static drawSvg(pdf, file, x, y, width, height) {
        const warningCallback = (message) => {
            if (PdfImage.FATAL_SVG_WARNING.test(message)) {
                throw new Error(message);
            }
            process.stderr.write(`content_guide: warning: ${path_1.default.basename(file)}: ${message}\n`);
        };
        (0, svg_to_pdfkit_1.default)(pdf, fs_1.default.readFileSync(file, "utf8"), x, y, {
            width,
            height,
            preserveAspectRatio: "xMinYMid meet",
            assumePt: true,
            warningCallback,
        });
    }
}
exports.default = PdfImage;
