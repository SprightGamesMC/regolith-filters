declare module "svg-to-pdfkit" {
    /** Options of the SVG drawing. */
    interface SvgToPdfKitOptions {
        width: number;
        height: number;
        preserveAspectRatio: string;
        assumePt: boolean;
        warningCallback: (message: string) => void;
    }

    /**
     * Draws an SVG document in a PDF.
     *
     * @param pdf - PDF being written.
     * @param svg - SVG text.
     * @param x - Left position.
     * @param y - Top position.
     * @param options - Drawing options.
     */
    export default function SvgToPdfKit(pdf: PDFKit.PDFDocument, svg: string, x: number, y: number, options: SvgToPdfKitOptions): void;
}
