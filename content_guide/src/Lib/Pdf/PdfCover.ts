import type { GuideDocument, PdfTextLine, PdfTextStyle } from "../../Types/ContentGuideTypes";
import type PdfCanvas from "./PdfCanvas";
import PdfTheme from "../../Data/PdfTheme";
import PdfArtwork from "./PdfArtwork";
import PdfImage from "./PdfImage";

/**
 * Writes the cover page.
 */
export default class PdfCover {
    /** Top of the word mark. */
    static readonly WORDMARK_TOP = 46;

    /** Width of the box for the word mark. */
    static readonly WORDMARK_WIDTH = 210;

    /** Height of the box for the word mark. */
    static readonly WORDMARK_HEIGHT = 66;

    /** Bottom of the area for text, above the highest star. */
    static readonly TEXT_BOTTOM = 476;

    /** Most lines of a title, which keeps the text above the skyline. */
    static readonly TITLE_MAX_LINES = 4;

    /** Most lines of a title at the largest size. */
    static readonly TITLE_IDEAL_LINES = 2;

    /** Smallest title size. */
    static readonly TITLE_MIN_SIZE = 28;

    /** Change in title size between tries. */
    static readonly TITLE_SIZE_STEP = 2;

    /** Most lines of version and credits. */
    static readonly DETAIL_MAX_LINES = 5;

    /** Size and line height of the line below the title. */
    static readonly SUBTITLE = { size: 24, lineHeight: 30 };

    /** Size and line height of the version and credits. */
    static readonly DETAIL = { size: 12, lineHeight: 18 };

    /** Space between the title and the subtitle. */
    static readonly SUBTITLE_GAP = 10;

    /** Space between the subtitle and the details. */
    static readonly DETAIL_GAP = 14;

    /** Smallest space between the word mark and the title. */
    static readonly MIN_TOP_GAP = 12;

    /** Size of the team name on a cover with no word mark. */
    static readonly TEAM_SIZE = 24;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /**
     * Creates the cover writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas: PdfCanvas) {
        this.canvas = canvas;
    }

    /**
     * Writes the cover, with the title block centered between the word mark and the skyline.
     *
     * @param guide - Built guide.
     */
    write(guide: GuideDocument): void {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const { colors } = theme;
        const { width, height } = pdf.page;
        const left = PdfTheme.MARGIN;
        const contentWidth = canvas.contentWidth();
        const titleStyle = canvas.titleStyle(this.fitTitle(guide.title));
        const subtitleStyle: PdfTextStyle = { ...PdfCover.SUBTITLE, color: colors.onPrimary };
        const detailStyle: PdfTextStyle = { ...PdfCover.DETAIL, color: colors.onPrimary };
        const titleLines = this.limitTitle(guide.title, titleStyle);
        const subtitleLines = text.layout(`${guide.contentTypeLabel} Content Guide`, contentWidth, subtitleStyle);
        const detailLines = [[`Version ${guide.version}`, ...(guide.date ? [guide.date] : [])].join(", "), ...guide.credits]
            .flatMap((detail) => text.layout(detail, contentWidth, detailStyle))
            .slice(0, PdfCover.DETAIL_MAX_LINES);
        const blockHeight =
            titleLines.length * titleStyle.lineHeight +
            PdfCover.SUBTITLE_GAP +
            subtitleLines.length * subtitleStyle.lineHeight +
            PdfCover.DETAIL_GAP +
            detailLines.length * detailStyle.lineHeight;
        const areaTop = PdfCover.WORDMARK_TOP + PdfCover.WORDMARK_HEIGHT;

        pdf.rect(0, 0, width, height).fill(colors.primary);
        PdfArtwork.coverSkyline(pdf, height + 2, colors);
        this.writeMark(guide);

        canvas.y = areaTop + Math.max((PdfCover.TEXT_BOTTOM - areaTop - blockHeight) / 2, PdfCover.MIN_TOP_GAP);
        canvas.writeLines(titleLines, left, titleStyle, true);
        canvas.y += PdfCover.SUBTITLE_GAP;
        canvas.writeLines(subtitleLines, left, subtitleStyle, true);
        canvas.y += PdfCover.DETAIL_GAP;
        canvas.writeLines(detailLines, left, detailStyle, true);
    }

    /**
     * Finds the largest title size that fits within the ideal number of lines.
     *
     * @param title - Cover title.
     *
     * @returns Size in points.
     */
    private fitTitle(title: string): number {
        const width = this.canvas.contentWidth();
        let size = PdfTheme.COVER_TITLE_SIZE;

        while (size > PdfCover.TITLE_MIN_SIZE) {
            const lines = this.canvas.text.layout(title, width, this.canvas.titleStyle(size));

            if (lines.length <= PdfCover.TITLE_IDEAL_LINES && lines.every((line) => line.width <= width)) {
                break;
            }

            size -= PdfCover.TITLE_SIZE_STEP;
        }

        return size;
    }

    /**
     * Wraps the title and ends it with three dots if it needs too many lines.
     *
     * @param title - Cover title.
     * @param style - Title style.
     *
     * @returns Lines of the title.
     */
    private limitTitle(title: string, style: PdfTextStyle): PdfTextLine[] {
        const { text } = this.canvas;
        const width = this.canvas.contentWidth();
        const limit = PdfCover.TITLE_MAX_LINES;
        const lines = text.layout(title, width, style);

        if (lines.length <= limit) {
            return lines;
        }

        const rest = lines
            .slice(limit - 1)
            .map((line) => line.runs.map((run) => run.text).join(""))
            .join(" ");

        return [
            ...lines.slice(0, limit - 1),
            ...text.layout(text.fit(rest, style.font ?? PdfTheme.BODY_FONT, style.size, width), width, style),
        ];
    }

    /**
     * Writes the word mark, or the team name when the guide has no word mark.
     *
     * @param guide - Built guide.
     */
    private writeMark(guide: GuideDocument): void {
        const { pdf, style, text, theme } = this.canvas;
        const font = PdfTheme.DISPLAY_FONT;
        const left = PdfTheme.MARGIN;
        const { WORDMARK_TOP, WORDMARK_WIDTH, WORDMARK_HEIGHT } = PdfCover;

        if (style.wordmark) {
            PdfImage.fit(pdf, style.wordmark, left, WORDMARK_TOP, WORDMARK_WIDTH, WORDMARK_HEIGHT);
            return;
        }

        const team = guide.credits[0]?.split(": ")[1];

        if (!team) {
            return;
        }

        const width = this.canvas.contentWidth();
        const size = text.fitSize(team, font, PdfCover.TEAM_SIZE, PdfTheme.SUBHEADING_SIZE, width);
        const baseline = text.baselineFor(WORDMARK_TOP + WORDMARK_HEIGHT / 2, font, size);

        text.write(text.fit(team, font, size, width), left, baseline, font, size, theme.colors.onPrimary);
    }
}
