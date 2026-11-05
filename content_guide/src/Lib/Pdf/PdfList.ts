import type { GuideLine } from "../../Types/ContentGuideTypes";
import type PdfCanvas from "./PdfCanvas";
import PdfTheme from "../../Data/PdfTheme";
import InlineText from "../InlineText";
import PdfFlow from "./PdfFlow";

/**
 * Writes bullets, numbered steps, labeled lines, and changelog releases.
 */
export default class PdfList {
    /** Distance from the heading edge to a bullet, so a bullet is visibly under its heading. */
    static readonly BULLET_OFFSET = 10;

    /** Distance from a bullet to its text. */
    static readonly BULLET_INDENT = 13;

    /** Space between list entries. */
    static readonly BULLET_GAP = 4;

    /** Radius of a top level bullet. */
    static readonly BULLET_RADIUS = 2.2;

    /** Radius of a nested bullet. */
    static readonly NESTED_BULLET_RADIUS = 1.6;

    /** Tallest bullet that stays on one page. */
    static readonly KEEP_TOGETHER_LIMIT = 120;

    /** Width that nested notes need to keep indenting. */
    static readonly MIN_NESTED_WIDTH = 200;

    /** Distance from a step number to its text. */
    static readonly STEP_INDENT = 34;

    /** Space kept between a step number and its text. */
    static readonly STEP_NUMBER_CLEARANCE = 6;

    /** Largest size of a step number. */
    static readonly STEP_NUMBER_SIZE = 20;

    /** Space between steps with details. */
    static readonly STEP_GAP = 15;

    /** Space between steps in a simple list. */
    static readonly PLAIN_STEP_GAP = 7;

    /** Space between a step and its details. */
    static readonly STEP_DETAIL_GAP = 5;

    /** Width of the label column in a step. */
    static readonly LABEL_WIDTH = 92;

    /** Space kept between a label and its value. */
    static readonly LABEL_CLEARANCE = 8;

    /** Line height of a release title. */
    static readonly RELEASE_LINE_HEIGHT = 19;

    /** Space above a release title. */
    static readonly RELEASE_SPACE_ABOVE = 18;

    /** Space below a release title. */
    static readonly RELEASE_SPACE_BELOW = 6;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /** Writer of text and commands. */
    private readonly flow: PdfFlow;

    /**
     * Creates the list writer.
     *
     * @param canvas - Canvas being written to.
     * @param flow - Writer of text and commands.
     */
    constructor(canvas: PdfCanvas, flow: PdfFlow) {
        this.canvas = canvas;
        this.flow = flow;
    }

    /**
     * Writes a top level bullet, which stays on one page when it is short.
     *
     * @param line - Line to write.
     */
    writeTopBullet(line: GuideLine): void {
        const { canvas } = this;
        const height = canvas.measure(() => this.writeBullet(line, PdfTheme.MARGIN, canvas.contentWidth(), 0));

        canvas.keepTogether(Math.min(height, PdfList.KEEP_TOGETHER_LIMIT));
        this.writeBullet(line, PdfTheme.MARGIN, canvas.contentWidth(), 0);
    }

    /**
     * Writes a bullet and its nested notes.
     *
     * @param line - Line to write.
     * @param x - Left edge of the content that the bullet is under.
     * @param width - Available width.
     * @param depth - List depth.
     */
    writeBullet(line: GuideLine, x: number, width: number, depth: number): void {
        const { canvas } = this;
        const { pdf, theme } = canvas;
        const offset = depth === 0 ? PdfList.BULLET_OFFSET : 0;
        const bulletX = x + offset;
        const textX = bulletX + PdfList.BULLET_INDENT;
        const textWidth = width - offset - PdfList.BULLET_INDENT;

        canvas.keepTogether(theme.body.lineHeight);

        const centerY = canvas.y + theme.body.lineHeight / 2;

        canvas.paint(() => {
            pdf.circle(bulletX + PdfList.BULLET_RADIUS, centerY, depth === 0 ? PdfList.BULLET_RADIUS : PdfList.NESTED_BULLET_RADIUS).fill(
                depth === 0 ? theme.colors.primary : theme.colors.textMuted
            );
        });

        this.flow.writeText(line.text, textX, textWidth, theme.body);
        this.addEntryGap();

        const canIndent = textWidth >= PdfList.MIN_NESTED_WIDTH;

        for (const child of line.children) {
            this.writeBullet(child, canIndent ? textX : x, canIndent ? textWidth : width, depth + 1);
        }
    }

    /**
     * Writes numbered steps in order. Steps with no labeled details are a simple list, which needs no emphasis or wide gaps.
     *
     * @param lines - Step lines.
     */
    writeSteps(lines: GuideLine[]): void {
        const { canvas } = this;
        const isPlainList = lines.every((line) => !line.children.some((child) => child.label));
        const gap = isPlainList ? PdfList.PLAIN_STEP_GAP : PdfList.STEP_GAP;

        lines.forEach((line, index) => {
            canvas.keepBlockTogether(() => this.writeStep(line, index, isPlainList));
            this.writeStep(line, index, isPlainList);
            canvas.y += gap;
        });

        canvas.isAfterHeading = false;
    }

    /**
     * Writes the number, text, and details of one step.
     *
     * @param line - Step line.
     * @param index - Zero based step index.
     * @param isPlainList - `true` if the step is part of a simple list, `false` otherwise.
     */
    writeStep(line: GuideLine, index: number, isPlainList: boolean): void {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const font = PdfTheme.DISPLAY_FONT;
        const top = canvas.y;
        const textX = PdfTheme.MARGIN + PdfList.STEP_INDENT;
        const textWidth = pdf.page.width - PdfTheme.MARGIN - textX;
        const style = isPlainList ? theme.body : theme.strong;

        canvas.paint(() => {
            const number = String(index + 1);
            const size = text.fitSize(
                number,
                font,
                PdfList.STEP_NUMBER_SIZE,
                PdfTheme.MICRO_SIZE,
                PdfList.STEP_INDENT - PdfList.STEP_NUMBER_CLEARANCE
            );

            text.write(
                number,
                PdfTheme.MARGIN,
                text.baselineFor(top + style.lineHeight / 2, font, size),
                font,
                size,
                theme.colors.primaryDark
            );
        });

        this.flow.writeText(line.text, textX, textWidth, style);
        canvas.y += line.children.length > 0 ? PdfList.STEP_DETAIL_GAP : 0;

        for (const child of line.children) {
            if (child.label) {
                this.writeLabeledLine(child, textX, textWidth);
            } else {
                this.writeBullet(child, textX, textWidth, 0);
            }
        }

        canvas.y -= canvas.trailingSpace;
        canvas.trailingSpace = 0;
    }

    /**
     * Writes a changelog release title and its changes.
     *
     * @param line - Release line.
     */
    writeRelease(line: GuideLine): void {
        const { canvas } = this;
        const { text, theme } = canvas;
        const font = PdfTheme.BOLD_FONT;
        const size = PdfTheme.SUBHEADING_SIZE;
        const lineHeight = PdfList.RELEASE_LINE_HEIGHT;
        const spaceAbove = canvas.isAfterHeading ? 0 : PdfList.RELEASE_SPACE_ABOVE;
        const firstHeight = canvas.measure(() => this.writeBullet(line.children[0] ?? line, PdfTheme.MARGIN, canvas.contentWidth(), 0));

        canvas.keepTogether(spaceAbove + lineHeight + PdfList.RELEASE_SPACE_BELOW + firstHeight);

        if (!canvas.isAtPageTop()) {
            canvas.y += spaceAbove;
        }

        text.write(line.text, PdfTheme.MARGIN, text.baselineFor(canvas.y + lineHeight / 2, font, size), font, size, theme.colors.text);
        canvas.y += lineHeight + PdfList.RELEASE_SPACE_BELOW;
        canvas.isAfterHeading = false;

        for (const child of line.children) {
            this.writeBullet(child, PdfTheme.MARGIN, canvas.contentWidth(), 0);
        }
    }

    /**
     * Writes a small label with its value in a second column. The label and the start of its value stay on one page.
     *
     * @param line - Line with a label.
     * @param x - Left position.
     * @param width - Available width.
     */
    private writeLabeledLine(line: GuideLine, x: number, width: number): void {
        const { canvas } = this;
        const { text, theme } = canvas;
        const font = PdfTheme.BOLD_FONT;
        const size = PdfTheme.SMALL_SIZE;
        const valueX = x + PdfList.LABEL_WIDTH;
        const valueWidth = width - PdfList.LABEL_WIDTH;
        const segments = InlineText.split(line.text);
        const isCommand = segments.length === 1 && segments[0].isCode;
        const rowHeight = isCommand ? PdfFlow.COMMAND_HEIGHT : theme.small.lineHeight;

        canvas.keepTogether(rowHeight);

        const baseline = text.baselineFor(canvas.y + rowHeight / 2, font, size);

        canvas.paint(() => {
            text.write(
                text.fit(line.label ?? "", font, size, PdfList.LABEL_WIDTH - PdfList.LABEL_CLEARANCE),
                x,
                baseline,
                font,
                size,
                theme.colors.text
            );
        });

        if (isCommand) {
            this.flow.writeCommand(segments[0].text, valueX, valueWidth);
        } else {
            this.flow.writeText(line.text, valueX, valueWidth, theme.small);
        }

        this.addEntryGap();
    }

    /**
     * Adds the space below a list entry, which the end of an item removes.
     */
    private addEntryGap(): void {
        this.canvas.y += PdfList.BULLET_GAP;
        this.canvas.trailingSpace = PdfList.BULLET_GAP;
    }
}
