import type { PdfTextStyle, RecipeGrid } from "../../Types/ContentGuideTypes";
import type PdfCanvas from "./PdfCanvas";
import PdfTheme from "../../Data/PdfTheme";

/**
 * Draws a crafting grid with its station and a key of its ingredients.
 */
export default class PdfRecipeGrid {
    /** Width of one grid slot. */
    static readonly SLOT_SIZE = 18;

    /** Space between grid slots. */
    static readonly SLOT_GAP = 2;

    /** Corner radius of a slot. */
    static readonly SLOT_RADIUS = 3;

    /** Number of slots across and down. */
    static readonly GRID_SLOTS = 3;

    /** Size of the slot beside an ingredient name. */
    static readonly KEY_SLOT_SIZE = 14;

    /** Space between the key slot and the ingredient name. */
    static readonly KEY_SLOT_GAP = 6;

    /** Space between the grid and its text. */
    static readonly TEXT_GAP = 12;

    /** Space between rows of the text. */
    static readonly ROW_GAP = 3;

    /** Space above the grid. */
    static readonly SPACE_ABOVE = 2;

    /** Space below the grid, since it has none inside its lower edge, unlike a line of text. */
    static readonly SPACE_BELOW = 4;

    /** Canvas being written to. */
    private readonly canvas: PdfCanvas;

    /**
     * Creates the grid writer.
     *
     * @param canvas - Canvas being written to.
     */
    constructor(canvas: PdfCanvas) {
        this.canvas = canvas;
    }

    /**
     * Draws one recipe.
     *
     * @param recipe - Crafting grid.
     * @param left - Left position.
     * @param width - Available width.
     */
    write(recipe: RecipeGrid, left: number, width: number): void {
        const { canvas } = this;
        const { text, theme } = canvas;
        const { KEY_SLOT_GAP, KEY_SLOT_SIZE, ROW_GAP, TEXT_GAP } = PdfRecipeGrid;
        const gridSize = this.gridSize();
        const top = canvas.y + PdfRecipeGrid.SPACE_ABOVE;
        const textX = left + gridSize + TEXT_GAP;
        const textWidth = width - gridSize - TEXT_GAP;
        const nameX = textX + KEY_SLOT_SIZE + KEY_SLOT_GAP;
        const nameWidth = textWidth - KEY_SLOT_SIZE - KEY_SLOT_GAP;
        const titleStyle: PdfTextStyle = { ...theme.small, color: theme.colors.text, font: PdfTheme.BOLD_FONT };
        const nameStyle: PdfTextStyle = { ...theme.small, color: theme.colors.text };
        const titleLines = text.layout(`${recipe.station}${recipe.makes ? `, makes ${recipe.makes}` : ""}`, textWidth, titleStyle);
        const keyRows = recipe.legend.map(({ symbol, name }) => {
            const lines = text.layout(name, nameWidth, nameStyle);

            return { symbol, lines, height: Math.max(lines.length * nameStyle.lineHeight, KEY_SLOT_SIZE) + ROW_GAP };
        });
        const keyHeight = keyRows.reduce((total, row) => total + row.height, 0);
        const blockHeight = titleLines.length * titleStyle.lineHeight + keyHeight;

        canvas.paint(() => {
            this.drawGrid(recipe, left, top);

            let textY = top + Math.max(0, (gridSize - blockHeight) / 2);

            for (const line of titleLines) {
                text.writeLine(line, textX, textY, titleStyle);
                textY += titleStyle.lineHeight;
            }

            textY += ROW_GAP;

            for (const row of keyRows) {
                this.drawSlot(row.symbol, textX, textY, KEY_SLOT_SIZE, PdfTheme.SMALL_SIZE);

                row.lines.forEach((line, index) => {
                    text.writeLine(
                        line,
                        nameX,
                        textY + (KEY_SLOT_SIZE - nameStyle.lineHeight) / 2 + index * nameStyle.lineHeight,
                        nameStyle
                    );
                });
                textY += row.height;
            }
        });

        canvas.y = top + Math.max(gridSize, blockHeight) + PdfRecipeGrid.SPACE_BELOW;
    }

    /**
     * Finds the size of the grid.
     *
     * @returns Size in points.
     */
    private gridSize(): number {
        const { SLOT_SIZE, SLOT_GAP, GRID_SLOTS } = PdfRecipeGrid;

        return GRID_SLOTS * SLOT_SIZE + (GRID_SLOTS - 1) * SLOT_GAP;
    }

    /**
     * Draws the slots of the grid.
     *
     * @param recipe - Crafting grid.
     * @param left - Left position.
     * @param top - Top position.
     */
    private drawGrid(recipe: RecipeGrid, left: number, top: number): void {
        const { SLOT_GAP, SLOT_RADIUS, SLOT_SIZE, GRID_SLOTS } = PdfRecipeGrid;
        const { pdf, theme } = this.canvas;

        for (let row = 0; row < GRID_SLOTS; row++) {
            for (let column = 0; column < GRID_SLOTS; column++) {
                const symbol = recipe.rows[row]?.[column] ?? " ";
                const x = left + column * (SLOT_SIZE + SLOT_GAP);
                const y = top + row * (SLOT_SIZE + SLOT_GAP);

                if (symbol === " ") {
                    pdf.roundedRect(x, y, SLOT_SIZE, SLOT_SIZE, SLOT_RADIUS).fill(theme.colors.surfaceLine);
                } else {
                    this.drawSlot(symbol, x, y, SLOT_SIZE, PdfTheme.BODY_SIZE);
                }
            }
        }
    }

    /**
     * Draws one slot with its ingredient letter centered in it.
     *
     * @param symbol - Ingredient letter.
     * @param x - Left position.
     * @param y - Top position.
     * @param size - Slot size.
     * @param letterSize - Letter size.
     */
    private drawSlot(symbol: string, x: number, y: number, size: number, letterSize: number): void {
        const { pdf, text, theme } = this.canvas;
        const font = PdfTheme.BOLD_FONT;

        pdf.roundedRect(x, y, size, size, PdfRecipeGrid.SLOT_RADIUS).fill(theme.colors.primaryDark);
        text.write(
            symbol,
            x + (size - text.width(symbol, font, letterSize)) / 2,
            text.baselineFor(y + size / 2, font, letterSize),
            font,
            letterSize,
            theme.colors.onPrimary
        );
    }
}
