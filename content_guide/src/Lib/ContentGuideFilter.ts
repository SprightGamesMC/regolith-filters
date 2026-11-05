import type { ContentGuideSettings, GuideDocument, PdfStyle } from "../Types/ContentGuideTypes";
import fs from "fs";
import path from "path";
import GuideBuilder from "./GuideBuilder";
import GuideDataReader from "./GuideDataReader";
import GuideFile from "./GuideFile";
import GuideIssues from "./GuideIssues";
import GuideSync from "./GuideSync";
import GuideValidator from "./GuideValidator";
import MarkdownRenderer from "./MarkdownRenderer";
import PackScanner from "./PackScanner";
import PdfRenderer from "./Pdf/PdfRenderer";
import StyleSettings from "./StyleSettings";

/**
 * Generates the content guide for one Regolith run.
 */
export default class ContentGuideFilter {
    /** Longest content name in a file name, which keeps the path within Windows limits. */
    static readonly MAX_FILE_NAME_LENGTH = 120;

    /** Characters that are not allowed in Windows file names. */
    static readonly INVALID_FILE_NAME_CHARACTERS = /[<>:"/\\|?*\p{Cc}\p{Cf}]/gu;

    /** Regolith working directory with the built packs. */
    private readonly workingDirectory: string;

    /** Regolith project root. */
    private readonly projectRoot: string;

    /** Filter settings. */
    private readonly settings: ContentGuideSettings;

    /**
     * Creates a filter run.
     *
     * @param workingDirectory - Regolith working directory with the built packs.
     * @param projectRoot - Regolith project root.
     * @param settings - Filter settings.
     */
    constructor(workingDirectory: string, projectRoot: string, settings: ContentGuideSettings) {
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
    async run(): Promise<string[]> {
        const outputFolder = this.resolveOutputFolder();
        const style = StyleSettings.resolve(this.settings.style, path.join(this.workingDirectory, GuideFile.DATA_FOLDER, GuideFile.FOLDER));
        const issues = new GuideIssues();

        for (const warning of StyleSettings.contrastWarnings(style.colors)) {
            issues.warning("style.colors", warning);
        }

        const guideFile = new GuideFile(this.workingDirectory, this.projectRoot, issues);
        const guide = guideFile.load();
        const catalog = new PackScanner(this.workingDirectory, issues).scan();

        if (new GuideSync(issues, this.settings).apply(guide, catalog)) {
            guideFile.save(guide);
        }

        const data = new GuideDataReader(issues).read(guide);
        const document = new GuideBuilder(data, catalog, this.settings).build();

        new GuideValidator(data, catalog, this.settings, issues).validate(document);
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
    resolveOutputFolder(): string {
        const outputFolder = path.resolve(this.projectRoot, this.settings.outputPath);
        const relative = path.relative(this.projectRoot, outputFolder);

        if (relative.startsWith("..") || path.isAbsolute(relative)) {
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
    private report(issues: GuideIssues): void {
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

        process.stderr.write(
            `content_guide: ${issues.errors.length} errors are not stopping the run because "strict" is false:\n${list}\n`
        );
    }

    /**
     * Reports characters that would be blank in the PDF.
     *
     * @param characters - Characters with no glyph.
     *
     * @throws If the run is strict and any character is missing.
     */
    private reportMissingCharacters(characters: string[]): void {
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
    private async write(document: GuideDocument, outputFolder: string, style: PdfStyle): Promise<string[]> {
        const { contentName, contentVersion } = this.settings;
        const safeName = contentName
            .replace(ContentGuideFilter.INVALID_FILE_NAME_CHARACTERS, "")
            .slice(0, ContentGuideFilter.MAX_FILE_NAME_LENGTH)
            .trim();
        const basePath = path.join(outputFolder, `${safeName} Content Guide ${contentVersion}`.trim());
        const markdownPath = `${basePath}.md`;
        const pdfPath = `${basePath}.pdf`;
        const renderer = new PdfRenderer(document, style);
        const pdf = await renderer.render();

        this.reportMissingCharacters(renderer.missingCharacters());
        try {
            fs.mkdirSync(outputFolder, { recursive: true });
            fs.writeFileSync(markdownPath, MarkdownRenderer.render(document));
            fs.writeFileSync(pdfPath, pdf);
        } catch (error) {
            throw new Error(
                `Cannot write the guide to ${outputFolder}. Close the PDF if it is open in another program, and check the "output_path" setting.`,
                {
                    cause: error,
                }
            );
        }

        return [markdownPath, pdfPath];
    }
}
