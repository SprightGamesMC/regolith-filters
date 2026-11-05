"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PdfTheme_1 = __importDefault(require("../../Data/PdfTheme"));
const InlineText_1 = __importDefault(require("../InlineText"));
const PdfArtwork_1 = __importDefault(require("./PdfArtwork"));
/**
 * Writes running text and command boxes, starting new pages when needed.
 */
class PdfFlow {
    /** Height of a one line command box, close to what viewers can select, so the box and the selectable area match. */
    static COMMAND_HEIGHT = 17;
    /** Line height of a command with more than one line. */
    static COMMAND_LINE_HEIGHT = 13.5;
    /** Text size of a command. */
    static COMMAND_SIZE = 10;
    /** Space between command text and the side of its box. */
    static COMMAND_PADDING = 3.5;
    /** Space between text and the command box below it. */
    static COMMAND_GAP = 3;
    /** Canvas being written to. */
    canvas;
    /**
     * Creates the flow writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas) {
        this.canvas = canvas;
    }
    /**
     * Writes wrapped text. A command at the end that does not fit on the line moves to its own box, because a wrapped command is hard to copy.
     *
     * @param text - Guide text.
     * @param x - Left position.
     * @param width - Available width.
     * @param style - Text style.
     */
    writeText(text, x, width, style) {
        const { canvas } = this;
        const segments = InlineText_1.default.split(text);
        const last = segments[segments.length - 1];
        const lines = canvas.text.layoutWithoutShortLastLine(text, width, style);
        if (lines.length > 1 && segments.length >= 2 && last.isCode) {
            const plain = segments
                .slice(0, -1)
                .map((segment) => (segment.isCode ? `\`${segment.text}\`` : segment.text))
                .join("");
            this.writeText(plain.trimEnd(), x, width, style);
            canvas.y += PdfFlow.COMMAND_GAP;
            this.writeCommand(last.text, x, width);
            return;
        }
        for (const line of lines) {
            canvas.keepTogether(style.lineHeight);
            canvas.writeLines([line], x, style);
        }
        canvas.isAfterHeading = false;
    }
    /**
     * Writes a command in a box. A long command wraps at its spaces and separators, and the box grows with it.
     *
     * @param command - Command text.
     * @param x - Left position of the text.
     * @param width - Available width.
     */
    writeCommand(command, x, width) {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const { COMMAND_HEIGHT, COMMAND_LINE_HEIGHT, COMMAND_PADDING, COMMAND_SIZE } = PdfFlow;
        const font = PdfTheme_1.default.CODE_FONT;
        const lines = text.wrapCode(command, font, COMMAND_SIZE, width);
        const height = COMMAND_HEIGHT + (lines.length - 1) * COMMAND_LINE_HEIGHT;
        canvas.keepTogether(height);
        const top = canvas.y;
        const boxWidth = Math.max(...lines.map((line) => text.width(line, font, COMMAND_SIZE)));
        canvas.paint(() => {
            PdfArtwork_1.default.control(pdf, x - COMMAND_PADDING, top, boxWidth + COMMAND_PADDING * 2, height, theme.colors.surfaceLine, COMMAND_HEIGHT);
            lines.forEach((line, index) => {
                const center = top + COMMAND_HEIGHT / 2 + index * COMMAND_LINE_HEIGHT;
                text.write(line, x, text.baselineFor(center, font, COMMAND_SIZE), font, COMMAND_SIZE, theme.colors.text);
            });
        });
        canvas.y += height;
        canvas.isAfterHeading = false;
    }
}
exports.default = PdfFlow;
