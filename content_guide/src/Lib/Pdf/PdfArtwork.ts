import type { PdfColors } from "../../Types/ContentGuideTypes";
import BrandArt from "../../Data/BrandArt";
import PdfTheme from "../../Data/PdfTheme";

/**
 * Draws the skyline and the hand cut silhouettes that give the guide its character. All of it takes its colors from the palette.
 */
export default abstract class PdfArtwork {
    /** Height in points that the control outline was drawn at. */
    static readonly CONTROL_ART_HEIGHT = 44;

    /** Height in points of the wave artwork, of which only the top part is the wave. */
    static readonly WAVE_ARTWORK_HEIGHT = PdfTheme.WAVE_HEIGHT * 5.26;

    /**
     * Draws the large skyline of the cover.
     *
     * @param pdf - PDF being written.
     * @param baseY - Line that the towers stand on.
     * @param colors - Palette of the guide.
     */
    static coverSkyline(pdf: PDFKit.PDFDocument, baseY: number, colors: PdfColors): void {
        const back = colors.primaryDark;
        const front = colors.primaryLight;
        const bright = colors.onPrimary;

        this.tower(pdf, 3, -86, baseY, 0.98, back);
        this.tower(pdf, 1, 124, baseY, 0.74, back);
        this.tower(pdf, 3, 468, baseY, 1.02, back);
        this.tower(pdf, 0, 12, baseY, 0.62, front);
        this.tower(pdf, 2, 214, baseY, 0.64, front);
        this.tower(pdf, 1, 358, baseY, 0.5, front);
        this.tower(pdf, 3, 522, baseY, 0.54, front);

        this.star(pdf, 92, baseY - 272, 20, back);
        this.star(pdf, 58, baseY - 306, 9, back);
        this.star(pdf, 300, baseY - 268, 12, bright);
        this.star(pdf, 330, baseY - 288, 6, bright);
        this.star(pdf, 431, baseY - 232, 15, back);
        this.star(pdf, 548, baseY - 324, 22, back);
        this.star(pdf, 511, baseY - 356, 9, bright);
        this.star(pdf, 148, baseY - 158, 9, bright);
    }

    /**
     * Draws the skyline of a section title band in the corner of the band, scaled to its height so the text has the rest of the width.
     *
     * @param pdf - PDF being written.
     * @param baseY - Line that the towers stand on.
     * @param width - Page width.
     * @param height - Band height.
     * @param colors - Palette of the guide.
     */
    static bandSkyline(pdf: PDFKit.PDFDocument, baseY: number, width: number, height: number, colors: PdfColors): void {
        const scale = Math.min((height - 24) / 272, 0.6);

        this.tower(pdf, 3, width - 104, baseY, scale, colors.primaryDark);
        this.tower(pdf, 2, width - 86, baseY, scale * 0.6, colors.primaryLight);
        this.star(pdf, width - 122, baseY - height * 0.62, 7, colors.onPrimary);
    }

    /**
     * Fills a shape with a wavy top edge, which runs from a position down past it.
     *
     * @param pdf - PDF being written.
     * @param y - Top position of the wave.
     * @param width - Page width.
     * @param isLeft - `true` for the left silhouette, `false` for the right one.
     * @param color - Fill color.
     */
    static wave(pdf: PDFKit.PDFDocument, y: number, width: number, isLeft: boolean, color: string): void {
        pdf.save();
        pdf.translate(0, y).scale(width / 100, this.WAVE_ARTWORK_HEIGHT / 100);
        pdf.path(isLeft ? BrandArt.WAVE_LEFT : BrandArt.WAVE_RIGHT).fill(color);
        pdf.restore();
    }

    /**
     * Fills the control outline, where no two corners match. Corners keep their structure at any width.
     *
     * @param pdf - PDF being written.
     * @param x - Left position.
     * @param y - Top position.
     * @param width - Width in points.
     * @param height - Height in points.
     * @param color - Fill color.
     * @param cornerHeight - Height that sets the corner size. A tall box needs small corners, or they would cut across its text.
     */
    static control(
        pdf: PDFKit.PDFDocument,
        x: number,
        y: number,
        width: number,
        height: number,
        color: string,
        cornerHeight = height
    ): void {
        const scale = cornerHeight / this.CONTROL_ART_HEIGHT;
        const points = BrandArt.CONTROL_OUTLINE.map(([fromLeft, fromRight, fromTop, fromBottom]) => {
            const pointX = fromRight === null ? x + (fromLeft ?? 0) * scale : x + width - fromRight * scale;
            const pointY = fromBottom === null ? y + (fromTop ?? 0) * scale : y + height - fromBottom * scale;

            return `${pointX.toFixed(2)},${pointY.toFixed(2)}`;
        });

        pdf.path(`M${points.join("L")}Z`).fill(color);
    }

    /**
     * Strokes a rule with small smooth bends, as if drawn by a steady hand.
     *
     * @param pdf - PDF being written.
     * @param x - Left position.
     * @param y - Vertical position.
     * @param width - Width in points.
     * @param thickness - Line thickness in points.
     * @param color - Line color.
     * @param isFlipped - `true` to mirror the bends, so rules near each other do not match.
     */
    static handRule(
        pdf: PDFKit.PDFDocument,
        x: number,
        y: number,
        width: number,
        thickness: number,
        color: string,
        isFlipped = false
    ): void {
        const points = BrandArt.RULE_BENDS.map(([share, offset]) => [x + share * width, y + (isFlipped ? -offset : offset)]);

        pdf.moveTo(points[0][0], points[0][1]);

        for (let index = 1; index < points.length - 1; index++) {
            const [pointX, pointY] = points[index];
            const [nextX, nextY] = points[index + 1];
            const isLastBend = index === points.length - 2;

            pdf.quadraticCurveTo(pointX, pointY, isLastBend ? nextX : (pointX + nextX) / 2, isLastBend ? nextY : (pointY + nextY) / 2);
        }

        pdf.lineWidth(thickness).lineCap("round").stroke(color);
    }

    /**
     * Draws one stepped tower.
     *
     * @param pdf - PDF being written.
     * @param towerIndex - Index in the tower list.
     * @param x - Left position.
     * @param baseY - Line that the tower stands on.
     * @param scale - Size multiplier.
     * @param color - Fill color.
     */
    private static tower(pdf: PDFKit.PDFDocument, towerIndex: number, x: number, baseY: number, scale: number, color: string): void {
        const { path, originX } = BrandArt.TOWERS[towerIndex];

        pdf.save();
        pdf.translate(x - originX * scale, baseY - BrandArt.TOWER_BASE_Y * scale).scale(scale);
        pdf.path(path).fill(color);
        pdf.restore();
    }

    /**
     * Draws a four point star.
     *
     * @param pdf - PDF being written.
     * @param x - Center position across.
     * @param y - Center position down.
     * @param radius - Radius in points.
     * @param color - Fill color.
     */
    private static star(pdf: PDFKit.PDFDocument, x: number, y: number, radius: number, color: string): void {
        const { centerX, centerY, radius: artRadius } = BrandArt.STAR_BOUNDS;
        const scale = radius / artRadius;

        pdf.save();
        pdf.translate(x - centerX * scale, y - centerY * scale).scale(scale);
        pdf.path(BrandArt.STAR).fill(color);
        pdf.restore();
    }
}
