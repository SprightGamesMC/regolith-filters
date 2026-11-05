"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const DefaultStyle_1 = __importDefault(require("../Data/DefaultStyle"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Reads the `style` setting and finds the files it names, so each team can use its own brand.
 */
class StyleSettings {
    /** Setting names of the colors, by their name in code. */
    static COLOR_KEYS = {
        primary: "primary",
        primaryDark: "primary_dark",
        primaryLight: "primary_light",
        onPrimary: "on_primary",
        surface: "surface",
        surfaceSoft: "surface_soft",
        surfaceLine: "surface_line",
        text: "text",
        textMuted: "text_muted",
    };
    /** Accepted color format. */
    static COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
    /** Accepted extensions of a logo or word mark. */
    static IMAGE_EXTENSIONS = [".svg", ".png", ".jpg", ".jpeg"];
    /** Accepted extensions of a font. */
    static FONT_EXTENSIONS = [".ttf", ".otf", ".woff"];
    /** Accepted letter spacing as a share of the text size. */
    static LETTER_SPACING_RANGE = [-0.1, 0.5];
    /** Accepted title line height as a share of the text size. */
    static LINE_HEIGHT_RANGE = [0.7, 2];
    /** Lowest contrast at which text is still readable at all. Spright's white on brand blue is 2.91, which is a deliberate choice. */
    static MIN_CONTRAST = 2;
    /**
     * Finds color pairs with so little contrast that the text would be close to invisible.
     *
     * @param colors - Colors of the guide.
     *
     * @returns One message for each pair.
     */
    static contrastWarnings(colors) {
        const pairs = [
            ["on_primary", colors.onPrimary, "primary", colors.primary],
            ["text", colors.text, "surface", colors.surface],
            ["text_muted", colors.textMuted, "surface", colors.surface],
        ];
        return pairs
            .filter(([, foreground, , background]) => this.contrast(foreground, background) < this.MIN_CONTRAST)
            .map(([foreground, , background]) => `Text in "${foreground}" is close to invisible on "${background}". Change one of these colors in "style".`);
    }
    /**
     * Finds the contrast ratio of two colors, as WCAG defines it.
     *
     * @param first - Color as `#rrggbb`.
     * @param second - Color as `#rrggbb`.
     *
     * @returns Ratio from 1 to 21.
     */
    static contrast(first, second) {
        const luminance = (color) => {
            const [red, green, blue] = [1, 3, 5].map((start) => {
                const channel = parseInt(color.slice(start, start + 2), 16) / 255;
                return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        };
        const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
    }
    /**
     * Creates the settings of a guide that sets no style.
     *
     * @returns GuideStyleSettings.
     */
    static empty() {
        return {
            colors: {},
            wordmark: null,
            logo: null,
            fonts: {
                brand: null,
                brandUppercase: false,
                brandLetterSpacing: 0,
                brandLineHeight: null,
                secondaryLetterSpacing: 0,
                regular: null,
                bold: null,
                monospace: null,
            },
        };
    }
    /**
     * Reads the raw `style` setting.
     *
     * @param raw - Raw value, or `undefined` when omitted.
     *
     * @returns GuideStyleSettings.
     *
     * @throws If a value has the wrong type, a color is not `#rrggbb`, or a key is unknown.
     */
    static read(raw) {
        if (raw === undefined) {
            return this.empty();
        }
        const style = this.readObject(raw, "style", ["colors", "wordmark", "logo", "fonts"]);
        return {
            colors: this.readColors(style.colors ?? {}),
            wordmark: this.readFileName(style.wordmark, "style.wordmark", this.IMAGE_EXTENSIONS),
            logo: this.readFileName(style.logo, "style.logo", this.IMAGE_EXTENSIONS),
            fonts: this.readFonts(style.fonts ?? {}),
        };
    }
    /**
     * Applies the defaults and finds each named file in the guide data folder.
     *
     * @param settings - Read style settings.
     * @param folder - Absolute guide data folder.
     *
     * @returns PdfStyle.
     *
     * @throws If a named file is missing or outside the folder.
     */
    static resolve(settings, folder) {
        const defaults = DefaultStyle_1.default.create();
        const { fonts } = settings;
        const find = (file) => (file ? this.findFile(file, folder) : null);
        const regular = find(fonts.regular);
        return {
            colors: { ...defaults.colors, ...settings.colors },
            wordmark: find(settings.wordmark),
            logo: find(settings.logo),
            fonts: {
                brand: find(fonts.brand) ?? defaults.fonts.brand,
                brandUppercase: fonts.brandUppercase,
                brandLetterSpacing: fonts.brandLetterSpacing,
                brandLineHeight: fonts.brandLineHeight,
                secondaryLetterSpacing: fonts.secondaryLetterSpacing,
                regular: regular ?? defaults.fonts.regular,
                bold: find(fonts.bold) ?? regular ?? defaults.fonts.bold,
                monospace: find(fonts.monospace) ?? defaults.fonts.monospace,
            },
        };
    }
    /**
     * Reads the colors.
     *
     * @param raw - Raw `style.colors` value.
     *
     * @returns Colors that the guide sets.
     *
     * @throws If a color is not `#rrggbb` or a key is unknown.
     */
    static readColors(raw) {
        const keys = Object.entries(this.COLOR_KEYS);
        const colors = this.readObject(raw, "style.colors", keys.map(([, key]) => key));
        const result = {};
        for (const [name, key] of keys) {
            const value = colors[key];
            if (value === undefined) {
                continue;
            }
            if (typeof value !== "string" || !this.COLOR_PATTERN.test(value)) {
                throw new Error(`Setting "style.colors.${key}" must be a color such as "#399ee6".`);
            }
            result[name] = value;
        }
        return result;
    }
    /**
     * Reads the fonts.
     *
     * @param raw - Raw `style.fonts` value.
     *
     * @returns Font settings.
     *
     * @throws If a value has the wrong type or a key is unknown.
     */
    static readFonts(raw) {
        const fonts = this.readObject(raw, "style.fonts", ["brand", "secondary", "monospace"]);
        const brand = this.readObject(fonts.brand ?? {}, "style.fonts.brand", ["file", "uppercase", "letter_spacing", "line_height"]);
        const secondary = this.readObject(fonts.secondary ?? {}, "style.fonts.secondary", ["regular", "bold", "letter_spacing"]);
        const monospace = this.readObject(fonts.monospace ?? {}, "style.fonts.monospace", ["file"]);
        const uppercase = brand.uppercase ?? false;
        if (typeof uppercase !== "boolean") {
            throw new Error('Setting "style.fonts.brand.uppercase" must be a boolean.');
        }
        return {
            brand: this.readFileName(brand.file, "style.fonts.brand.file", this.FONT_EXTENSIONS),
            brandUppercase: uppercase,
            brandLetterSpacing: this.readNumber(brand.letter_spacing, "style.fonts.brand.letter_spacing", this.LETTER_SPACING_RANGE) ?? 0,
            brandLineHeight: this.readNumber(brand.line_height, "style.fonts.brand.line_height", this.LINE_HEIGHT_RANGE),
            secondaryLetterSpacing: this.readNumber(secondary.letter_spacing, "style.fonts.secondary.letter_spacing", this.LETTER_SPACING_RANGE) ?? 0,
            regular: this.readFileName(secondary.regular, "style.fonts.secondary.regular", this.FONT_EXTENSIONS),
            bold: this.readFileName(secondary.bold, "style.fonts.secondary.bold", this.FONT_EXTENSIONS),
            monospace: this.readFileName(monospace.file, "style.fonts.monospace.file", this.FONT_EXTENSIONS),
        };
    }
    /**
     * Reads an optional number in a range.
     *
     * @param raw - Raw value.
     * @param where - Setting path for messages.
     * @param range - Lowest and highest accepted values.
     *
     * @returns Number, or `null` when omitted.
     *
     * @throws If the value is not a number in the range.
     */
    static readNumber(raw, where, [lowest, highest]) {
        if (raw === undefined) {
            return null;
        }
        if (typeof raw !== "number" || raw < lowest || raw > highest) {
            throw new Error(`Setting "${where}" must be a number from ${lowest} to ${highest}.`);
        }
        return raw;
    }
    /**
     * Reads an object and rejects unknown keys.
     *
     * @param raw - Raw value.
     * @param where - Setting path for messages.
     * @param keys - Accepted keys.
     *
     * @returns Object.
     *
     * @throws If the value is not an object or has an unknown key.
     */
    static readObject(raw, where, keys) {
        if (!JsonTools_1.default.isObject(raw)) {
            throw new Error(`Setting "${where}" must be an object.`);
        }
        for (const key of Object.keys(raw)) {
            if (!keys.includes(key)) {
                throw new Error(`Setting "${where}" has an unknown key "${key}".`);
            }
        }
        return raw;
    }
    /**
     * Reads an optional file name.
     *
     * @param raw - Raw value.
     * @param where - Setting path for messages.
     * @param extensions - Accepted extensions.
     *
     * @returns File name, or `null` when omitted.
     *
     * @throws If the value is not a string with an accepted extension.
     */
    static readFileName(raw, where, extensions) {
        if (raw === undefined) {
            return null;
        }
        if (typeof raw !== "string" || !extensions.includes(path_1.default.extname(raw).toLowerCase())) {
            throw new Error(`Setting "${where}" must be a file name that ends with one of: ${extensions.join(", ")}.`);
        }
        return raw;
    }
    /**
     * Finds one file in the guide data folder.
     *
     * @param file - File name relative to the folder.
     * @param folder - Absolute guide data folder.
     *
     * @returns Absolute path.
     *
     * @throws If the file is missing or outside the folder.
     */
    static findFile(file, folder) {
        const fullPath = path_1.default.resolve(folder, file);
        const relative = path_1.default.relative(folder, fullPath);
        if (relative.startsWith("..") || path_1.default.isAbsolute(relative)) {
            throw new Error(`Style file must stay inside data/content_guide: ${file}.`);
        }
        if (!fs_1.default.existsSync(fullPath) || !fs_1.default.statSync(fullPath).isFile()) {
            throw new Error(`Style file not found in data/content_guide: ${file}.`);
        }
        return fullPath;
    }
}
exports.default = StyleSettings;
