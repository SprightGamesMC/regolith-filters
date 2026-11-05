import type { GuideLine, PdfBlockWriter, PdfTextStyle } from "../../Types/ContentGuideTypes";
import type PdfCanvas from "./PdfCanvas";
import type PdfFlow from "./PdfFlow";
import type PdfList from "./PdfList";
import PdfTheme from "../../Data/PdfTheme";
import PdfArtwork from "./PdfArtwork";
import PdfRecipeGrid from "./PdfRecipeGrid";

/**
 * Writes an item or entity with its name, identifier, tags, notes, recipes, and facts.
 */
export default class PdfCard {
    /** Space on each side of the rule between items. */
    static readonly ITEM_GAP = 9;

    /** Line height of the name. */
    static readonly NAME_LINE_HEIGHT = 16;

    /** Smallest space between the name and the identifier on one row. */
    static readonly ID_CLEARANCE = 12;

    /** Space between the name and tags on one row. */
    static readonly NAME_TAG_GAP = 9;

    /** Height of a tag. */
    static readonly TAG_HEIGHT = 18;

    /** Space between tags on one row. */
    static readonly TAG_GAP = 5;

    /** Space above a row of tags, and between rows of tags. */
    static readonly TAG_ROW_GAP = 3;

    /** Space above the details. */
    static readonly DETAILS_GAP = 3;

    /** Number of recipe and fact blocks on one row. */
    static readonly COLUMNS = 2;

    /** Space between columns. */
    static readonly COLUMN_GAP = 18;

    /** Space between rows of blocks. */
    static readonly BLOCK_ROW_GAP = 8;

    /** Space between facts. */
    static readonly FACT_GAP = 2;

    /** Thickness of the rule between items. */
    static readonly RULE_THICKNESS = 0.75;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /** Writer of text. */
    private readonly flow: PdfFlow;

    /** Writer of notes. */
    private readonly list: PdfList;

    /** Writer of recipes. */
    private readonly recipeGrid: PdfRecipeGrid;

    /**
     * Creates the card writer.
     *
     * @param canvas - Canvas being written to.
     * @param flow - Writer of text.
     * @param list - Writer of notes.
     */
    constructor(canvas: PdfCanvas, flow: PdfFlow, list: PdfList) {
        this.canvas = canvas;
        this.flow = flow;
        this.list = list;
        this.recipeGrid = new PdfRecipeGrid(canvas);
    }

    /**
     * Writes a card on one page, with a rule that separates it from the next one.
     *
     * @param line - Line with an identifier.
     * @param isLast - `true` if no item follows it, `false` otherwise.
     */
    write(line: GuideLine, isLast: boolean): void {
        const { canvas } = this;

        canvas.keepBlockTogether(() => this.writeContent(line), PdfCard.ITEM_GAP);
        this.writeContent(line);
        canvas.y += PdfCard.ITEM_GAP;

        if (!isLast) {
            canvas.drawRule(PdfTheme.MARGIN, canvas.y, canvas.contentWidth(), PdfCard.RULE_THICKNESS, canvas.theme.colors.surfaceLine);
            canvas.y += PdfCard.ITEM_GAP;
        }
    }

    /**
     * Writes the content of a card. A name or identifier that is too long wraps.
     *
     * @param line - Line with an identifier.
     */
    writeContent(line: GuideLine): void {
        const { canvas } = this;
        const { text, theme } = canvas;
        const left = PdfTheme.MARGIN;
        const width = canvas.contentWidth();
        const identifier = line.identifier ?? "";
        const idSize = PdfTheme.SMALL_SIZE * PdfTheme.CODE_RATIO;
        const nameStyle: PdfTextStyle = {
            size: PdfTheme.MINOR_HEADING_SIZE,
            lineHeight: PdfCard.NAME_LINE_HEIGHT,
            color: theme.colors.text,
            font: PdfTheme.BOLD_FONT,
        };
        const tags = line.children.filter((child) => child.isTag).map((child) => child.text);
        const nameWidth = text.width(line.text, PdfTheme.BOLD_FONT, nameStyle.size);
        const idWidth = text.width(identifier, PdfTheme.CODE_FONT, idSize);
        const isStacked = nameWidth + PdfCard.ID_CLEARANCE + idWidth > width;
        const tagsWidth = tags.reduce((total, tag) => total + this.tagWidth(tag) + PdfCard.TAG_GAP, 0);
        const tagsFitOnRow = !isStacked && nameWidth + PdfCard.NAME_TAG_GAP + tagsWidth + PdfCard.ID_CLEARANCE + idWidth <= width;
        const rowCenter = canvas.y + nameStyle.lineHeight / 2;

        canvas.isAfterHeading = false;
        canvas.writeLines(text.layout(line.text, width, nameStyle), left, nameStyle);

        if (isStacked) {
            for (const idLine of text.wrapCode(identifier, PdfTheme.CODE_FONT, idSize, width)) {
                const baseline = text.baselineFor(canvas.y + theme.small.lineHeight / 2, PdfTheme.CODE_FONT, idSize);

                canvas.paint(() => text.write(idLine, left, baseline, PdfTheme.CODE_FONT, idSize, theme.colors.textMuted));
                canvas.y += theme.small.lineHeight;
            }
        } else {
            canvas.paint(() => {
                const baseline = text.baselineFor(rowCenter, PdfTheme.BOLD_FONT, nameStyle.size);

                text.write(identifier, left + width - idWidth, baseline, PdfTheme.CODE_FONT, idSize, theme.colors.textMuted);
            });
        }

        if (tagsFitOnRow) {
            this.writeTagsOnRow(tags, left + nameWidth + PdfCard.NAME_TAG_GAP, rowCenter - PdfCard.TAG_HEIGHT / 2);
        } else if (tags.length > 0) {
            this.writeWrappedTags(tags);
        }

        canvas.trailingSpace = 0;
        this.writeDetails(line);
    }

    /**
     * Writes tags on the row of the name.
     *
     * @param tags - Tag texts.
     * @param x - Left position.
     * @param y - Top position.
     */
    private writeTagsOnRow(tags: string[], x: number, y: number): void {
        let tagX = x;

        for (const tag of tags) {
            tagX += this.writeTag(tag, tagX, y) + PdfCard.TAG_GAP;
        }
    }

    /**
     * Writes tags below the name, across as many rows as they need.
     *
     * @param tags - Tag texts.
     */
    private writeWrappedTags(tags: string[]): void {
        const { canvas } = this;
        const left = PdfTheme.MARGIN;
        const right = left + canvas.contentWidth();
        let tagX = left;

        canvas.y += PdfCard.TAG_ROW_GAP;

        for (const tag of tags) {
            if (tagX > left && tagX + this.tagWidth(tag) > right) {
                tagX = left;
                canvas.y += PdfCard.TAG_HEIGHT + PdfCard.TAG_ROW_GAP;
            }

            canvas.keepTogether(PdfCard.TAG_HEIGHT);
            tagX += this.writeTag(tag, tagX, canvas.y) + PdfCard.TAG_GAP;
        }

        canvas.y += PdfCard.TAG_HEIGHT;
    }

    /**
     * Draws one tag.
     *
     * @param tag - Tag text.
     * @param x - Left position.
     * @param y - Top position.
     *
     * @returns Tag width in points.
     */
    private writeTag(tag: string, x: number, y: number): number {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const height = PdfCard.TAG_HEIGHT;
        const width = this.tagWidth(tag);
        const font = PdfTheme.BODY_FONT;
        const size = PdfTheme.MICRO_SIZE;

        canvas.paint(() => {
            PdfArtwork.control(pdf, x, y, width, height, theme.colors.surfaceLine);
            text.write(this.fitTag(tag), x + height / 2, text.baselineFor(y + height / 2, font, size), font, size, theme.colors.text);
        });

        return width;
    }

    /**
     * Shortens a tag that is wider than the page, since a tag has one line.
     *
     * @param tag - Tag text.
     *
     * @returns Text that fits.
     */
    private fitTag(tag: string): string {
        return this.canvas.text.fit(tag, PdfTheme.BODY_FONT, PdfTheme.MICRO_SIZE, this.canvas.contentWidth() - PdfCard.TAG_HEIGHT);
    }

    /**
     * Finds the width of a tag.
     *
     * @param tag - Tag text.
     *
     * @returns Width in points.
     */
    private tagWidth(tag: string): number {
        return this.canvas.text.width(this.fitTag(tag), PdfTheme.BODY_FONT, PdfTheme.MICRO_SIZE) + PdfCard.TAG_HEIGHT;
    }

    /**
     * Writes the notes across the full width, then recipes and facts side by side.
     *
     * @param line - Line with an identifier.
     */
    private writeDetails(line: GuideLine): void {
        const { canvas } = this;
        const left = PdfTheme.MARGIN;
        const width = canvas.contentWidth();
        const notes = line.children.filter((child) => !child.isTag && !child.isFact);
        const recipes = line.children.filter((child) => child.recipe);
        const facts = line.children.filter((child) => child.isFact && !child.isTag && !child.recipe);

        if (notes.length + recipes.length + facts.length > 0) {
            canvas.y += PdfCard.DETAILS_GAP;
        }

        for (const note of notes) {
            this.list.writeBullet(note, left, width, 0);
        }

        this.writeBlocks(this.createBlocks(recipes, facts));
        canvas.y -= canvas.trailingSpace;
        canvas.trailingSpace = 0;
    }

    /**
     * Creates the writers of the recipe and fact blocks.
     *
     * @param recipes - Lines with a recipe.
     * @param facts - Lines with a fact.
     *
     * @returns One writer for each recipe, and one for all facts.
     */
    private createBlocks(recipes: GuideLine[], facts: GuideLine[]): PdfBlockWriter[] {
        const { canvas } = this;
        const blocks: PdfBlockWriter[] = recipes.flatMap(({ recipe }) =>
            recipe ? [(x: number, width: number) => this.recipeGrid.write(recipe, x, width)] : []
        );

        if (facts.length > 0) {
            blocks.push((x, width) => {
                for (const fact of facts) {
                    this.flow.writeText(fact.text, x, width, canvas.theme.small);
                    canvas.y += PdfCard.FACT_GAP;
                }

                canvas.y -= PdfCard.FACT_GAP;
            });
        }

        return blocks;
    }

    /**
     * Writes blocks in rows of columns. Columns cannot cross a page, so a row taller than a page writes one block after another.
     *
     * @param blocks - Writers of the blocks.
     */
    private writeBlocks(blocks: PdfBlockWriter[]): void {
        const { canvas } = this;
        const left = PdfTheme.MARGIN;
        const width = canvas.contentWidth();
        const usableHeight = canvas.pdf.page.height - PdfTheme.MARGIN - PdfTheme.BOTTOM_MARGIN;

        for (let start = 0; start < blocks.length; start += PdfCard.COLUMNS) {
            const row = blocks.slice(start, start + PdfCard.COLUMNS);

            canvas.y += start > 0 ? PdfCard.BLOCK_ROW_GAP : 0;

            const rowHeight = canvas.measure(() => this.writeBlockRow(row, left, width));

            if (rowHeight <= usableHeight) {
                canvas.keepTogether(rowHeight);
                this.writeBlockRow(row, left, width);
            } else {
                for (const block of row) {
                    block(left, width);
                }
            }

            canvas.trailingSpace = 0;
        }
    }

    /**
     * Writes blocks side by side in equal columns, with the position after the tallest one.
     *
     * @param row - Writers of the blocks.
     * @param left - Left position.
     * @param width - Available width.
     */
    private writeBlockRow(row: PdfBlockWriter[], left: number, width: number): void {
        const { canvas } = this;
        const gap = PdfCard.COLUMN_GAP;
        const columnWidth = (width - gap * (row.length - 1)) / row.length;
        const top = canvas.y;
        let bottom = top;

        row.forEach((block, index) => {
            canvas.y = top;
            block(left + index * (columnWidth + gap), columnWidth);
            bottom = Math.max(bottom, canvas.y);
        });

        canvas.y = bottom;
    }
}
