"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Style of a guide that sets no `style`. All default fonts use the SIL Open Font License.
 */
class DefaultStyle {
    /**
     * Creates the default style.
     *
     * @returns PdfStyle.
     */
    static create() {
        return {
            colors: {
                primary: "#121417",
                primaryDark: "#2d3138",
                primaryLight: "#f5f5f2",
                onPrimary: "#ffffff",
                surface: "#ffffff",
                surfaceSoft: "#f5f5f3",
                surfaceLine: "#e6e6e3",
                text: "#121417",
                textMuted: "#55585e",
            },
            wordmark: null,
            logo: null,
            fonts: {
                brand: require.resolve("@fontsource/poppins/files/poppins-latin-600-normal.woff"),
                brandUppercase: false,
                brandLetterSpacing: 0,
                brandLineHeight: null,
                secondaryLetterSpacing: 0,
                regular: require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff"),
                bold: require.resolve("@fontsource/inter/files/inter-latin-600-normal.woff"),
                monospace: require.resolve("@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff"),
            },
        };
    }
}
exports.default = DefaultStyle;
