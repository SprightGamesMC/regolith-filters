"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const GuideBuilder_1 = __importDefault(require("./GuideBuilder"));
const GuideDataReader_1 = __importDefault(require("./GuideDataReader"));
const GuideFile_1 = __importDefault(require("./GuideFile"));
const GuideIssues_1 = __importDefault(require("./GuideIssues"));
const GuideSync_1 = __importDefault(require("./GuideSync"));
const GuideValidator_1 = __importDefault(require("./GuideValidator"));
const MarkdownRenderer_1 = __importDefault(require("./MarkdownRenderer"));
const PackScanner_1 = __importDefault(require("./PackScanner"));
const PdfRenderer_1 = __importDefault(require("./Pdf/PdfRenderer"));
const StyleSettings_1 = __importDefault(require("./StyleSettings"));
/**
 * Generates the content guide for one Regolith run.
 */
class ContentGuideFilter {
    /** Longest content name in a file name, which keeps the path within Windows limits. */
    static MAX_FILE_NAME_LENGTH = 120;
    /** Characters that are not allowed in Windows file names. */
    static INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*\p{Cc}\p{Cf}]/gu;
    /** Regolith working directory with the built packs. */
    workingDirectory;
    /** Regolith project root. */
    projectRoot;
    /** Filter settings. */
    settings;
    /**
     * Creates a filter run.
     *
     * @param workingDirectory - Regolith working directory with the built packs.
     * @param projectRoot - Regolith project root.
     * @param settings - Filter settings.
     */
    constructor(workingDirectory, projectRoot, settings) {
        this.workingDirectory = workingDirectory;
        this.projectRoot = projectRoot;
        this.settings = settings;
    }
    /**
     * Reads the sources, checks the guide, and writes the output files.
     *
     * @returns Absolute paths of the written files.
     *
     * @throws If the run is strict and the guide has errors, or a source file cannot be read.
     */
    async run() {
        const outputFolder = this.resolveOutputFolder();
        const style = StyleSettings_1.default.resolve(this.settings.style, path_1.default.join(this.workingDirectory, GuideFile_1.default.DATA_FOLDER, GuideFile_1.default.FOLDER));
        const issues = new GuideIssues_1.default();
        for (const warning of StyleSettings_1.default.contrastWarnings(style.colors)) {
            issues.warning("style.colors", warning);
        }
        const guideFile = new GuideFile_1.default(this.workingDirectory, this.projectRoot, issues);
        const guide = guideFile.load();
        const catalog = new PackScanner_1.default(this.workingDirectory, issues).scan();
        if (new GuideSync_1.default(issues, this.settings).apply(guide, catalog)) {
            guideFile.save(guide);
        }
        const data = new GuideDataReader_1.default(issues).read(guide);
        const document = new GuideBuilder_1.default(data, catalog, this.settings).build();
        new GuideValidator_1.default(data, catalog, this.settings, issues).validate(document);
        this.report(issues);
        return this.write(document, outputFolder, style);
    }
    /**
     * Finds the output folder.
     *
     * @returns Absolute output folder.
     *
     * @throws If the folder is outside the project root.
     */
    resolveOutputFolder() {
        const outputFolder = path_1.default.resolve(this.projectRoot, this.settings.outputPath);
        const relative = path_1.default.relative(this.projectRoot, outputFolder);
        if (relative.startsWith("..") || path_1.default.isAbsolute(relative)) {
            throw new Error(`Setting "output_path" must stay inside the project root: ${this.settings.outputPath}.`);
        }
        return outputFolder;
    }
    /**
     * Prints warnings and handles errors as the strict setting asks.
     *
     * @param issues - Problems found in this run.
     *
     * @throws If the run is strict and the guide has errors.
     */
    report(issues) {
        for (const warning of issues.warnings) {
            process.stderr.write(`content_guide: warning: ${warning}\n`);
        }
        if (issues.errors.length === 0) {
            return;
        }
        const list = issues.errors.map((error) => `  ${error}`).join("\n");
        if (this.settings.strict) {
            throw new Error(`The guide has ${issues.errors.length} errors:\n${list}`);
        }
        process.stderr.write(`content_guide: ${issues.errors.length} errors are not stopping the run because "strict" is false:\n${list}\n`);
    }
    /**
     * Reports characters that would be blank in the PDF.
     *
     * @param characters - Characters with no glyph.
     *
     * @throws If the run is strict and any character is missing.
     */
    reportMissingCharacters(characters) {
        if (characters.length === 0) {
            return;
        }
        const message = `The PDF fonts cannot show these characters, so they would be blank: ${characters.join(" ")}. Set fonts that have them in "style".`;
        if (this.settings.strict) {
            throw new Error(message);
        }
        process.stderr.write(`content_guide: warning: ${message}\n`);
    }
    /**
     * Writes the Markdown and PDF files.
     *
     * @param document - Built guide.
     * @param outputFolder - Absolute output folder.
     * @param style - Style of the PDF.
     *
     * @returns Absolute paths of the written files.
     */
    async write(document, outputFolder, style) {
        const { contentName, contentVersion } = this.settings;
        const safeName = contentName
            .replace(ContentGuideFilter.INVALID_FILE_NAME_CHARACTERS, "")
            .slice(0, ContentGuideFilter.MAX_FILE_NAME_LENGTH)
            .trim();
        const basePath = path_1.default.join(outputFolder, `${safeName} Content Guide ${contentVersion}`.trim());
        const markdownPath = `${basePath}.md`;
        const pdfPath = `${basePath}.pdf`;
        const renderer = new PdfRenderer_1.default(document, style);
        const pdf = await renderer.render();
        this.reportMissingCharacters(renderer.missingCharacters());
        try {
            fs_1.default.mkdirSync(outputFolder, { recursive: true });
            fs_1.default.writeFileSync(markdownPath, MarkdownRenderer_1.default.render(document));
            fs_1.default.writeFileSync(pdfPath, pdf);
        }
        catch (error) {
            throw new Error(`Cannot write the guide to ${outputFolder}. Close the PDF if it is open in another program, and check the "output_path" setting.`, {
                cause: error,
            });
        }
        return [markdownPath, pdfPath];
    }
}
exports.default = ContentGuideFilter;
