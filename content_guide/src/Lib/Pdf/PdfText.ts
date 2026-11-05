import type { PdfFontFile, PdfTextLine, PdfTextRun, PdfTextStyle } from "../../Types/ContentGuideTypes";
import PdfTheme from "../../Data/PdfTheme";
import InlineText from "../InlineText";
import PdfArtwork from "./PdfArtwork";

/**
 * Measures, wraps, and places text. Every line is placed by its baseline, so mixed fonts share one line and text centers on its capitals.
 */
export default class PdfText {
    /** Share of the width below which a last line counts as very short. */
    static readonly SHORT_LINE_SHARE = 0.2;

    /** Share of the width to try when a last line is very short. */
    static readonly NARROWER_SHARE = 0.86;

    /** OpenType features that are off in code. Coding fonts join sequences such as ".." into one glyph, which crashes pdfkit. */
    static readonly CODE_FEATURES = { calt: false, liga: false, clig: false };

    /** Space in points on each side of inline code, inside its box. */
    static readonly CODE_PADDING = 2.5;

    /** Extra space in points between inline code and the text next to it, so its box does not touch the text. */
    static readonly CODE_SPACE = 3;

    /** Space in points between the code boxes of two lines. */
    static readonly CODE_LINE_GAP = 2;

    /** PDF being written. */
    private readonly pdf: PDFKit.PDFDocument;

    /** Type scale and brand font rules. */
    private readonly theme: PdfTheme;

    /** Characters that were written with a font that has no glyph for them. */
    private readonly missing = new Set<string>();

    /**
     * Creates text tools for one PDF.
     *
     * @param pdf - PDF being written.
     * @param theme - Type scale and brand font rules.
     */
    constructor(pdf: PDFKit.PDFDocument, theme: PdfTheme) {
        this.pdf = pdf;
        this.theme = theme;
    }

    /**
     * Finds the capital height of a font.
     *
     * @param font - Font name.
     * @param size - Text size in points.
     *
     * @returns Height in points.
     */
    capHeight(font: string, size: number): number {
        this.pdf.font(font);

        return (this.currentFont().capHeight / 1000) * size;
    }

    /**
     * Finds the empty space on the left of the first letter. It grows with the text size, so large text looks further right than small text at the same position.
     *
     * @param text - Plain text.
     * @param font - Font name.
     * @param size - Text size in points.
     *
     * @returns Distance in points.
     */
    leftBearing(text: string, font: string, size: number): number {
        const first = this.prepare(text, font).trimStart()[0];

        if (!first) {
            return 0;
        }

        this.pdf.font(font);

        const fontFile = this.currentFont().font;

        return (fontFile.layout(first).glyphs[0].bbox.minX / fontFile.unitsPerEm) * size;
    }

    /**
     * Finds the width of text on one line.
     *
     * @param text - Plain text.
     * @param font - Font name.
     * @param size - Text size in points.
     *
     * @returns Width in points.
     */
    width(text: string, font: string, size: number): number {
        return this.pdf.font(font).fontSize(size).widthOfString(this.prepare(text, font), this.fontOptions(font, size));
    }

    /**
     * Finds the largest whole step below a size at which text fits on one line.
     *
     * @param text - Plain text.
     * @param font - Font name.
     * @param size - Largest size in points.
     * @param minSize - Smallest size in points.
     * @param width - Available width.
     *
     * @returns Size in points.
     */
    fitSize(text: string, font: string, size: number, minSize: number, width: number): number {
        let fitted = size;

        while (fitted > minSize && this.width(text, font, fitted) > width) {
            fitted -= 1;
        }

        return fitted;
    }

    /**
     * Writes one line of text on a baseline.
     *
     * @param text - Plain text.
     * @param x - Left position.
     * @param baseline - Baseline position.
     * @param font - Font name.
     * @param size - Text size in points.
     * @param color - Text color.
     */
    write(text: string, x: number, baseline: number, font: string, size: number, color: string): void {
        const prepared = this.prepare(text, font);

        this.pdf.font(font).fontSize(size).fillColor(color);
        this.recordMissing(prepared);
        this.pdf.text(prepared, x, baseline, {
            lineBreak: false,
            baseline: "alphabetic",
            ...this.fontOptions(font, size),
        });
    }

    /**
     * Lists the characters that the fonts could not show.
     *
     * @returns Characters written so far with no glyph.
     */
    missingCharacters(): string[] {
        return [...this.missing];
    }

    /**
     * Finds the baseline that centers capitals on a position.
     *
     * @param centerY - Vertical center.
     * @param font - Font name.
     * @param size - Text size in points.
     *
     * @returns Baseline position.
     */
    baselineFor(centerY: number, font: string, size: number): number {
        return centerY + this.capHeight(font, size) / 2;
    }

    /**
     * Wraps text with plain and code runs into lines.
     *
     * @param text - Guide text. Backticks mark code.
     * @param width - Available width.
     * @param style - Text style.
     *
     * @returns Lines of runs.
     */
    layout(text: string, width: number, style: PdfTextStyle): PdfTextLine[] {
        const lines: PdfTextLine[] = [];
        let runs: PdfTextRun[] = [];
        let lineWidth = 0;

        const finishLine = (): void => {
            lines.push(this.trimLine(runs, lineWidth, style));
            runs = [];
            lineWidth = 0;
        };

        for (const segment of InlineText.split(text)) {
            for (const word of this.splitLongWords(segment.text, segment.isCode, width, style)) {
                const boxPadding = segment.isCode ? PdfText.CODE_PADDING : 0;
                const wordWidth = this.runWidth(word.trimEnd(), segment.isCode, style) + boxPadding;

                if (lineWidth > 0 && lineWidth + this.gapBefore(runs[runs.length - 1], segment.isCode) + wordWidth > width) {
                    finishLine();
                }

                const fullWidth = this.runWidth(word, segment.isCode, style);
                const last = runs[runs.length - 1];
                const gap = this.gapBefore(last, segment.isCode);

                if (last?.isCode === segment.isCode) {
                    last.text += word;
                    last.width += fullWidth;
                } else {
                    runs.push({ text: word, isCode: segment.isCode, width: fullWidth });
                }

                lineWidth += gap + fullWidth;
            }
        }

        if (runs.length > 0) {
            finishLine();
        }

        return lines;
    }

    /**
     * Wraps an identifier or command, which has few spaces, at its spaces and separators. A part that is still too long breaks anywhere.
     *
     * @param text - Plain text.
     * @param font - Font name.
     * @param size - Text size in points.
     * @param width - Available width.
     *
     * @returns Lines of text.
     */
    wrapCode(text: string, font: string, size: number, width: number): string[] {
        const lines: string[] = [];
        let current = "";

        for (const part of text.split(/(?<=[\s._:/-])/)) {
            for (const piece of this.breakToWidth(part, font, size, width)) {
                if (current && this.width(`${current}${piece}`.trimEnd(), font, size) > width) {
                    lines.push(current.trimEnd());
                    current = "";
                }

                current += piece;
            }
        }

        return current ? [...lines, current.trimEnd()] : lines;
    }

    /**
     * Shortens text with three dots when it is too wide for one line.
     *
     * @param text - Plain text.
     * @param font - Font name.
     * @param size - Text size in points.
     * @param width - Available width.
     *
     * @returns Text that fits.
     */
    fit(text: string, font: string, size: number, width: number): string {
        if (this.width(text, font, size) <= width) {
            return text;
        }

        let fitted = text;

        while (fitted.length > 0 && this.width(`${fitted}...`, font, size) > width) {
            fitted = fitted.slice(0, -1);
        }

        return `${fitted.trimEnd()}...`;
    }

    /**
     * Wraps text and avoids a last line with a very short width, by making the lines slightly narrower when the line count stays the same.
     *
     * @param text - Guide text.
     * @param width - Available width.
     * @param style - Text style.
     *
     * @returns Lines of runs.
     */
    layoutWithoutShortLastLine(text: string, width: number, style: PdfTextStyle): PdfTextLine[] {
        const lines = this.layout(text, width, style);
        const lastLine = lines[lines.length - 1];

        if (lines.length < 2 || lastLine.width > width * PdfText.SHORT_LINE_SHARE) {
            return lines;
        }

        const narrower = this.layout(text, width * PdfText.NARROWER_SHARE, style);

        return narrower.length === lines.length ? narrower : lines;
    }

    /**
     * Finds the narrowest width that keeps the same number of lines, which removes a short last line.
     *
     * @param text - Guide text.
     * @param width - Largest width.
     * @param style - Text style.
     *
     * @returns Width in points.
     */
    balancedWidth(text: string, width: number, style: PdfTextStyle): number {
        const lineCount = this.layout(text, width, style).length;
        let balanced = width;

        while (balanced > 40 && this.layout(text, balanced - 4, style).length === lineCount) {
            balanced -= 4;
        }

        return balanced;
    }

    /**
     * Writes one wrapped line, with its capitals centered in the line height.
     *
     * @param line - Line of runs.
     * @param x - Left position.
     * @param top - Top position of the line.
     * @param style - Text style.
     * @param isFlush - `true` to line up the ink of the first letter with the left position, `false` otherwise.
     */
    writeLine(line: PdfTextLine, x: number, top: number, style: PdfTextStyle, isFlush = false): void {
        const plain = this.runFont(false, style);
        const baseline = this.baselineFor(top + style.lineHeight / 2, plain.font, plain.size);
        let runX = isFlush && line.runs[0] ? x - this.leftBearing(line.runs[0].text, plain.font, plain.size) : x;

        line.runs.forEach((run, index) => {
            const { font, size } = this.runFont(run.isCode, style);

            runX += this.gapBefore(line.runs[index - 1], run.isCode);

            if (run.isCode) {
                this.drawCodeBackground(run.text, runX, top, style);
            }

            this.write(run.text, runX, baseline, font, size, style.color);
            runX += run.width;
        });
    }

    /**
     * Finds the extra space before a run, which keeps the box of inline code clear of the text next to it.
     *
     * @param previous - Run before, or `undefined` at the start of a line.
     * @param isCode - `true` if the run is code, `false` otherwise.
     *
     * @returns Space in points.
     */
    private gapBefore(previous: PdfTextRun | undefined, isCode: boolean): number {
        return previous && previous.isCode !== isCode ? PdfText.CODE_SPACE : 0;
    }

    /**
     * Draws the box behind inline code, the same structure as the box of a command on its own line.
     *
     * @param text - Code run text.
     * @param x - Left position of the text.
     * @param top - Top position of the line.
     * @param style - Text style.
     */
    private drawCodeBackground(text: string, x: number, top: number, style: PdfTextStyle): void {
        const { font, size } = this.runFont(true, style);
        const width = this.width(text.trimEnd(), font, size);

        if (width === 0) {
            return;
        }

        const height = style.lineHeight - PdfText.CODE_LINE_GAP;
        const padding = PdfText.CODE_PADDING;

        PdfArtwork.control(
            this.pdf,
            x - padding,
            top + PdfText.CODE_LINE_GAP / 2,
            width + padding * 2,
            height,
            this.theme.colors.surfaceLine
        );
    }

    /**
     * Splits text into words, with any word wider than the line broken into pieces that fit. Code breaks at its separators, so an identifier stays readable.
     *
     * @param text - Text of one segment.
     * @param isCode - `true` if the text is code, `false` otherwise.
     * @param width - Available width.
     * @param style - Text style.
     *
     * @returns Words with their following space.
     */
    private splitLongWords(text: string, isCode: boolean, width: number, style: PdfTextStyle): string[] {
        const { font, size } = this.runFont(isCode, style);

        return (text.match(/\S+\s*|\s+/g) ?? []).flatMap((word) => {
            const isTooWide = this.width(word.trimEnd(), font, size) > width;

            return isCode && isTooWide ? this.wrapCode(word, font, size, width) : this.breakToWidth(word, font, size, width);
        });
    }

    /**
     * Breaks text that is wider than a width into pieces that fit.
     *
     * @param text - Plain text.
     * @param font - Font name.
     * @param size - Text size in points.
     * @param width - Available width.
     *
     * @returns Pieces of the text.
     */
    private breakToWidth(text: string, font: string, size: number, width: number): string[] {
        if (this.width(text.trimEnd(), font, size) <= width) {
            return [text];
        }

        const pieces: string[] = [];
        let current = "";

        for (const character of text) {
            if (current && this.width(`${current}${character}`, font, size) > width) {
                pieces.push(current);
                current = "";
            }

            current += character;
        }

        return current ? [...pieces, current] : pieces;
    }

    /**
     * Removes the space at the end of a line and finds its width.
     *
     * @param runs - Runs of the line.
     * @param lineWidth - Width with the end space.
     * @param style - Text style.
     *
     * @returns PdfTextLine.
     */
    private trimLine(runs: PdfTextRun[], lineWidth: number, style: PdfTextStyle): PdfTextLine {
        const last = runs[runs.length - 1];

        if (!last) {
            return { runs, width: 0 };
        }

        const trimmed = last.text.trimEnd();
        const trimmedWidth = this.runWidth(trimmed, last.isCode, style);
        const width = lineWidth - last.width + trimmedWidth;

        last.text = trimmed;
        last.width = trimmedWidth;

        return { runs, width };
    }

    /**
     * Finds the width of one run.
     *
     * @param text - Run text.
     * @param isCode - `true` if the run is code, `false` otherwise.
     * @param style - Text style.
     *
     * @returns Width in points.
     */
    private runWidth(text: string, isCode: boolean, style: PdfTextStyle): number {
        const { font, size } = this.runFont(isCode, style);

        return this.width(text, font, size);
    }

    /**
     * Finds the font and size of a run.
     *
     * @param isCode - `true` if the run is code, `false` otherwise.
     * @param style - Text style.
     *
     * @returns Font name and size in points.
     */
    private runFont(isCode: boolean, style: PdfTextStyle): { font: string; size: number } {
        return isCode
            ? { font: PdfTheme.CODE_FONT, size: style.size * PdfTheme.CODE_RATIO }
            : { font: style.font ?? PdfTheme.BODY_FONT, size: style.size };
    }

    /**
     * Finds the current font, because pdfkit has no public access to its metrics and glyphs.
     *
     * @returns Internal font of pdfkit.
     */
    private currentFont(): { capHeight: number; font: PdfFontFile } {
        return (this.pdf as unknown as { _font: { capHeight: number; font: PdfFontFile } })._font;
    }

    /**
     * Changes text to what a font must show.
     *
     * @param text - Plain text.
     * @param font - Font name.
     *
     * @returns Text with each line break or tab as a space and no invisible characters, in uppercase when the brand font requires it.
     */
    private prepare(text: string, font: string): string {
        const singleLine = text.replace(/[\t\r\n]+/g, " ").replace(/[\p{Cc}\p{Cf}]/gu, "");

        return font === PdfTheme.DISPLAY_FONT && this.theme.brandUppercase ? singleLine.toUpperCase() : singleLine;
    }

    /**
     * Records the characters of text that the current font cannot show.
     *
     * @param text - Text about to be written.
     */
    private recordMissing(text: string): void {
        const fontFile = this.currentFont().font;

        for (const character of text) {
            if (character.trim() && !fontFile.hasGlyphForCodePoint(character.codePointAt(0) ?? 0)) {
                this.missing.add(character);
            }
        }
    }

    /**
     * Creates the options that a font needs on every measure and write.
     *
     * @param font - Font name.
     * @param size - Text size in points.
     *
     * @returns pdfkit text options.
     */
    private fontOptions(font: string, size: number): PDFKit.Mixins.TextOptions {
        if (font === PdfTheme.CODE_FONT) {
            return { characterSpacing: 0, features: PdfText.CODE_FEATURES as unknown as PDFKit.Mixins.TextOptions["features"] };
        }

        const share = font === PdfTheme.DISPLAY_FONT ? this.theme.brandLetterSpacing : this.theme.secondaryLetterSpacing;

        return { characterSpacing: size * share };
    }
}
