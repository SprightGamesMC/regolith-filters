import type { PdfTextStyle } from "../../Types/ContentGuideTypes";
import type PdfCanvas from "./PdfCanvas";
import PdfTheme from "../../Data/PdfTheme";
import PdfArtwork from "./PdfArtwork";

/**
 * Writes the full width title band of a section.
 */
export default class PdfBand {
    /** Space above the title. */
    static readonly PADDING_TOP = 36;

    /** Space below the text, above the wave. */
    static readonly PADDING_BOTTOM = 30;

    /** Largest text width, which keeps text clear of the skyline. */
    static readonly TEXT_WIDTH = 410;

    /** Size and line height of the summary. */
    static readonly SUMMARY = { size: 15, lineHeight: 20 };

    /** Space between the title and the summary. */
    static readonly SUMMARY_GAP = 8;

    /** Space below the band. */
    static readonly SPACE_BELOW = 20;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /**
     * Creates the band writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas: PdfCanvas) {
        this.canvas = canvas;
    }

    /**
     * Draws a band with cut wave edges, with a height that follows its text, and moves the position below it.
     *
     * @param title - Band title.
     * @param summary - Sentence below the title, or empty text.
     * @param top - Top of the band.
     * @param isWaveLeft - `true` to use the left wave at the lower edge, `false` for the right wave.
     */
    write(title: string, summary: string, top: number, isWaveLeft: boolean): void {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const { colors } = theme;
        const { width } = pdf.page;
        const waveHeight = PdfTheme.WAVE_HEIGHT;
        const titleStyle = canvas.titleStyle(PdfTheme.TITLE_SIZE);
        const summaryStyle: PdfTextStyle = { ...PdfBand.SUMMARY, color: colors.onPrimary };
        const titleLines = text.layout(title, PdfBand.TEXT_WIDTH, titleStyle);
        const summaryLines = summary
            ? text.layout(summary, text.balancedWidth(summary, PdfBand.TEXT_WIDTH, summaryStyle), summaryStyle)
            : [];
        const summaryHeight = summaryLines.length > 0 ? PdfBand.SUMMARY_GAP + summaryLines.length * summaryStyle.lineHeight : 0;
        const height =
            PdfBand.PADDING_TOP + titleLines.length * titleStyle.lineHeight + summaryHeight + PdfBand.PADDING_BOTTOM + waveHeight;

        if (top > 0) {
            PdfArtwork.wave(pdf, top - waveHeight, width, !isWaveLeft, colors.primary);
        }

        pdf.rect(0, top, width, height).fill(colors.primary);
        pdf.save();
        pdf.rect(0, top, width, height).clip();
        PdfArtwork.bandSkyline(pdf, top + height + 2, width, height, colors);
        pdf.restore();
        PdfArtwork.wave(pdf, top + height - waveHeight, width, isWaveLeft, colors.surface);

        canvas.y = top + PdfBand.PADDING_TOP;
        canvas.writeLines(titleLines, PdfTheme.MARGIN, titleStyle, true);
        canvas.y += summaryLines.length > 0 ? PdfBand.SUMMARY_GAP : 0;
        canvas.writeLines(summaryLines, PdfTheme.MARGIN, summaryStyle, true);
        canvas.y = top + height + PdfBand.SPACE_BELOW;
    }
}
