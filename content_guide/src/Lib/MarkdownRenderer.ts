import type { GuideDocument, GuideLine, GuideSection } from "../Types/ContentGuideTypes";
import InlineText from "./InlineText";

/**
 * Writes the guide as Markdown.
 */
export default abstract class MarkdownRenderer {
    /** Spaces for each list level. */
    static readonly INDENT = "    ";

    /** Heading level of the top sections. */
    static readonly FIRST_SECTION_LEVEL = 2;

    /** Characters with a meaning in Markdown text. */
    static readonly SPECIAL_CHARACTERS = /[\\*_[\]<>]/g;

    /**
     * Renders the guide.
     *
     * @param document - Built guide.
     *
     * @returns Markdown text.
     */
    static render(document: GuideDocument): string {
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
    private static renderSection(section: GuideSection, level: number): string[] {
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
    private static renderLine(line: GuideLine, depth: number, marker: string): string {
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
    private static renderInline(text: string): string {
        return InlineText.split(text)
            .map((segment) => (segment.isCode ? `\`${segment.text}\`` : segment.text.replace(MarkdownRenderer.SPECIAL_CHARACTERS, "\\$&")))
            .join("");
    }
}
