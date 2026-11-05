import type { InlineSegment } from "../Types/ContentGuideTypes";

/**
 * Splits guide text into plain runs and code runs, which backticks mark.
 */
export default abstract class InlineText {
    /**
     * Splits text at its backticks. A backtick without a partner is treated as plain text.
     *
     * @param text - Guide text.
     *
     * @returns Non-empty segments in order.
     */
    static split(text: string): InlineSegment[] {
        const parts = text.split("`");
        const hasUnmatchedBacktick = parts.length % 2 === 0;
        const segments = parts.map((part, index) => ({ text: part, isCode: index % 2 === 1 }));

        if (hasUnmatchedBacktick) {
            const last = segments.pop();
            const previous = segments.pop();

            segments.push({ text: `${previous?.text ?? ""}\`${last?.text ?? ""}`, isCode: false });
        }

        return segments.filter((segment) => segment.text !== "");
    }
}
