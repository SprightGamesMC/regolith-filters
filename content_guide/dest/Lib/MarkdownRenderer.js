"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const InlineText_1 = __importDefault(require("./InlineText"));
/**
 * Writes the guide as Markdown.
 */
class MarkdownRenderer {
    /** Spaces for each list level. */
    static INDENT = "    ";
    /** Heading level of the top sections. */
    static FIRST_SECTION_LEVEL = 2;
    /** Characters with a meaning in Markdown text. */
    static SPECIAL_CHARACTERS = /[\\*_[\]<>]/g;
    /**
     * Renders the guide.
     *
     * @param document - Built guide.
     *
     * @returns Markdown text.
     */
    static render(document) {
        const details = [`${document.contentTypeLabel} Content Guide`, `Version ${document.version}`];
        const blocks = [
            `# ${this.renderInline(document.title)}`,
            this.renderInline([...details, ...(document.date ? [document.date] : [])].join(" | ")),
            ...(document.credits.length > 0 ? [this.renderInline(document.credits.join(" | "))] : []),
            this.renderInline(document.introduction),
            ...document.sections.flatMap((section) => this.renderSection(section, MarkdownRenderer.FIRST_SECTION_LEVEL)),
        ];
        return `${blocks.join("\n\n")}\n`;
    }
    /**
     * Renders one section and its nested sections.
     *
     * @param section - Section to render.
     * @param level - Heading level.
     *
     * @returns Markdown blocks.
     */
    static renderSection(section, level) {
        const lines = section.lines.map((line, index) => this.renderLine(line, 0, section.ordered ? `${index + 1}.` : "-")).join("\n");
        return [
            `${"#".repeat(level)} ${this.renderInline(section.title)}`,
            ...section.paragraphs.map((paragraph) => this.renderInline(paragraph)),
            ...(lines === "" ? [] : [lines]),
            ...section.sections.flatMap((child) => this.renderSection(child, level + 1)),
        ];
    }
    /**
     * Renders one list line and its children.
     *
     * @param line - Line to render.
     * @param depth - List depth.
     * @param marker - List marker.
     *
     * @returns Markdown lines.
     */
    static renderLine(line, depth, marker) {
        const content = `${line.label ? `${line.label}: ` : ""}${line.text}${line.identifier ? ` (\`${line.identifier}\`)` : ""}`;
        const text = `${MarkdownRenderer.INDENT.repeat(depth)}${marker} ${this.renderInline(content)}`;
        return [text, ...line.children.map((child) => this.renderLine(child, depth + 1, "-"))].join("\n");
    }
    /**
     * Renders inline text and escapes plain runs.
     *
     * @param text - Guide text.
     *
     * @returns Markdown text.
     */
    static renderInline(text) {
        return InlineText_1.default.split(text)
            .map((segment) => (segment.isCode ? `\`${segment.text}\`` : segment.text.replace(MarkdownRenderer.SPECIAL_CHARACTERS, "\\$&")))
            .join("");
    }
}
exports.default = MarkdownRenderer;
