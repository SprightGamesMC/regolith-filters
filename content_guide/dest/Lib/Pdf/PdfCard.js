"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PdfTheme_1 = __importDefault(require("../../Data/PdfTheme"));
const PdfArtwork_1 = __importDefault(require("./PdfArtwork"));
const PdfRecipeGrid_1 = __importDefault(require("./PdfRecipeGrid"));
/**
 * Writes an item or entity with its name, identifier, tags, notes, recipes, and facts.
 */
class PdfCard {
    /** Space on each side of the rule between items. */
    static ITEM_GAP = 9;
    /** Line height of the name. */
    static NAME_LINE_HEIGHT = 16;
    /** Smallest space between the name and the identifier on one row. */
    static ID_CLEARANCE = 12;
    /** Space between the name and tags on one row. */
    static NAME_TAG_GAP = 9;
    /** Height of a tag. */
    static TAG_HEIGHT = 18;
    /** Space between tags on one row. */
    static TAG_GAP = 5;
    /** Space above a row of tags, and between rows of tags. */
    static TAG_ROW_GAP = 3;
    /** Space above the details. */
    static DETAILS_GAP = 3;
    /** Number of recipe and fact blocks on one row. */
    static COLUMNS = 2;
    /** Space between columns. */
    static COLUMN_GAP = 18;
    /** Space between rows of blocks. */
    static BLOCK_ROW_GAP = 8;
    /** Space between facts. */
    static FACT_GAP = 2;
    /** Thickness of the rule between items. */
    static RULE_THICKNESS = 0.75;
    /** Canvas being written to. */
    canvas;
    /** Writer of text. */
    flow;
    /** Writer of notes. */
    list;
    /** Writer of recipes. */
    recipeGrid;
    /**
     * Creates the card writer.
     *
     * @param canvas - Canvas being written to.
     * @param flow - Writer of text.
     * @param list - Writer of notes.
     */
    constructor(canvas, flow, list) {
        this.canvas = canvas;
        this.flow = flow;
        this.list = list;
        this.recipeGrid = new PdfRecipeGrid_1.default(canvas);
    }
    /**
     * Writes a card on one page, with a rule that separates it from the next one.
     *
     * @param line - Line with an identifier.
     * @param isLast - `true` if no item follows it, `false` otherwise.
     */
    write(line, isLast) {
        const { canvas } = this;
        canvas.keepBlockTogether(() => this.writeContent(line), PdfCard.ITEM_GAP);
        this.writeContent(line);
        canvas.y += PdfCard.ITEM_GAP;
        if (!isLast) {
            canvas.drawRule(PdfTheme_1.default.MARGIN, canvas.y, canvas.contentWidth(), PdfCard.RULE_THICKNESS, canvas.theme.colors.surfaceLine);
            canvas.y += PdfCard.ITEM_GAP;
        }
    }
    /**
     * Writes the content of a card. A name or identifier that is too long wraps.
     *
     * @param line - Line with an identifier.
     */
    writeContent(line) {
        const { canvas } = this;
        const { text, theme } = canvas;
        const left = PdfTheme_1.default.MARGIN;
        const width = canvas.contentWidth();
        const identifier = line.identifier ?? "";
        const idSize = PdfTheme_1.default.SMALL_SIZE * PdfTheme_1.default.CODE_RATIO;
        const nameStyle = {
            size: PdfTheme_1.default.MINOR_HEADING_SIZE,
            lineHeight: PdfCard.NAME_LINE_HEIGHT,
            color: theme.colors.text,
            font: PdfTheme_1.default.BOLD_FONT,
        };
        const tags = line.children.filter((child) => child.isTag).map((child) => child.text);
        const nameWidth = text.width(line.text, PdfTheme_1.default.BOLD_FONT, nameStyle.size);
        const idWidth = text.width(identifier, PdfTheme_1.default.CODE_FONT, idSize);
        const isStacked = nameWidth + PdfCard.ID_CLEARANCE + idWidth > width;
        const tagsWidth = tags.reduce((total, tag) => total + this.tagWidth(tag) + PdfCard.TAG_GAP, 0);
        const tagsFitOnRow = !isStacked && nameWidth + PdfCard.NAME_TAG_GAP + tagsWidth + PdfCard.ID_CLEARANCE + idWidth <= width;
        const rowCenter = canvas.y + nameStyle.lineHeight / 2;
        canvas.isAfterHeading = false;
        canvas.writeLines(text.layout(line.text, width, nameStyle), left, nameStyle);
        if (isStacked) {
            for (const idLine of text.wrapCode(identifier, PdfTheme_1.default.CODE_FONT, idSize, width)) {
                const baseline = text.baselineFor(canvas.y + theme.small.lineHeight / 2, PdfTheme_1.default.CODE_FONT, idSize);
                canvas.paint(() => text.write(idLine, left, baseline, PdfTheme_1.default.CODE_FONT, idSize, theme.colors.textMuted));
                canvas.y += theme.small.lineHeight;
            }
        }
        else {
            canvas.paint(() => {
                const baseline = text.baselineFor(rowCenter, PdfTheme_1.default.BOLD_FONT, nameStyle.size);
                text.write(identifier, left + width - idWidth, baseline, PdfTheme_1.default.CODE_FONT, idSize, theme.colors.textMuted);
            });
        }
        if (tagsFitOnRow) {
            this.writeTagsOnRow(tags, left + nameWidth + PdfCard.NAME_TAG_GAP, rowCenter - PdfCard.TAG_HEIGHT / 2);
        }
        else if (tags.length > 0) {
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
    writeTagsOnRow(tags, x, y) {
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
    writeWrappedTags(tags) {
        const { canvas } = this;
        const left = PdfTheme_1.default.MARGIN;
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
    writeTag(tag, x, y) {
        const { canvas } = this;
        const { pdf, text, theme } = canvas;
        const height = PdfCard.TAG_HEIGHT;
        const width = this.tagWidth(tag);
        const font = PdfTheme_1.default.BODY_FONT;
        const size = PdfTheme_1.default.MICRO_SIZE;
        canvas.paint(() => {
            PdfArtwork_1.default.control(pdf, x, y, width, height, theme.colors.surfaceLine);
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
    fitTag(tag) {
        return this.canvas.text.fit(tag, PdfTheme_1.default.BODY_FONT, PdfTheme_1.default.MICRO_SIZE, this.canvas.contentWidth() - PdfCard.TAG_HEIGHT);
    }
    /**
     * Finds the width of a tag.
     *
     * @param tag - Tag text.
     *
     * @returns Width in points.
     */
    tagWidth(tag) {
        return this.canvas.text.width(this.fitTag(tag), PdfTheme_1.default.BODY_FONT, PdfTheme_1.default.MICRO_SIZE) + PdfCard.TAG_HEIGHT;
    }
    /**
     * Writes the notes across the full width, then recipes and facts side by side.
     *
     * @param line - Line with an identifier.
     */
    writeDetails(line) {
        const { canvas } = this;
        const left = PdfTheme_1.default.MARGIN;
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
    createBlocks(recipes, facts) {
        const { canvas } = this;
        const blocks = recipes.flatMap(({ recipe }) => recipe ? [(x, width) => this.recipeGrid.write(recipe, x, width)] : []);
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
    writeBlocks(blocks) {
        const { canvas } = this;
        const left = PdfTheme_1.default.MARGIN;
        const width = canvas.contentWidth();
        const usableHeight = canvas.pdf.page.height - PdfTheme_1.default.MARGIN - PdfTheme_1.default.BOTTOM_MARGIN;
        for (let start = 0; start < blocks.length; start += PdfCard.COLUMNS) {
            const row = blocks.slice(start, start + PdfCard.COLUMNS);
            canvas.y += start > 0 ? PdfCard.BLOCK_ROW_GAP : 0;
            const rowHeight = canvas.measure(() => this.writeBlockRow(row, left, width));
            if (rowHeight <= usableHeight) {
                canvas.keepTogether(rowHeight);
                this.writeBlockRow(row, left, width);
            }
            else {
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
    writeBlockRow(row, left, width) {
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
exports.default = PdfCard;
