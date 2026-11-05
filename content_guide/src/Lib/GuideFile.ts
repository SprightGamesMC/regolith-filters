import type GuideIssues from "./GuideIssues";
import fs from "fs";
import path from "path";
import GuideTemplate from "../Data/GuideTemplate";
import JsonTools from "./JsonTools";

/**
 * Loads and saves the guide data file. Regolith discards changes to the data folder of the working directory, so changes are saved in the project.
 */
export default class GuideFile {
    /** Name of the guide data file. */
    static readonly NAME = "content_guide.json";

    /** Folder of the guide data, relative to the data folder. */
    static readonly FOLDER = "content_guide";

    /** Data folder of the working directory, and of a project with no setting for it. */
    static readonly DATA_FOLDER = "data";

    /** Guide data file relative to the working directory. */
    static readonly WORKING_PATH = `${GuideFile.DATA_FOLDER}/${GuideFile.FOLDER}/${GuideFile.NAME}`;

    /** Regolith working directory. */
    private readonly workingDirectory: string;

    /** Regolith project root. */
    private readonly projectRoot: string;

    /** Collector for every problem found. */
    private readonly issues: GuideIssues;

    /**
     * Creates access to the guide data file of one run.
     *
     * @param workingDirectory - Regolith working directory.
     * @param projectRoot - Regolith project root.
     * @param issues - Collector for every problem found.
     */
    constructor(workingDirectory: string, projectRoot: string, issues: GuideIssues) {
        this.workingDirectory = workingDirectory;
        this.projectRoot = projectRoot;
        this.issues = issues;
    }

    /**
     * Loads the guide data with its comments. A missing file is created from the blank template.
     *
     * @returns Parsed guide data.
     *
     * @throws If the file is not valid JSON.
     */
    load(): unknown {
        const filePath = path.join(this.workingDirectory, GuideFile.WORKING_PATH);

        if (!fs.existsSync(filePath)) {
            return this.create();
        }

        try {
            return JsonTools.loadFileWithComments(filePath);
        } catch (error) {
            throw new Error(JsonTools.describeLoadError(GuideFile.WORKING_PATH, error), { cause: error });
        }
    }

    /**
     * Saves changed guide data in the project.
     *
     * @param guide - Guide data with its comments.
     */
    save(guide: unknown): void {
        const filePath = this.findProjectFile();

        try {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            JsonTools.writeWithComments(filePath, guide);
        } catch (error) {
            this.issues.warning(filePath, `Cannot save the changes to this file, so the next run makes them again: ${String(error)}`);
        }
    }

    /**
     * Creates the guide data from the blank template and saves it in the project.
     *
     * @returns Parsed guide data.
     */
    private create(): unknown {
        const guide = JsonTools.parseWithComments(GuideTemplate.TEXT);

        this.save(guide);
        this.issues.warning(this.findProjectFile(), "Missing, so a blank one was created. Write its sections to finish the guide.");

        return guide;
    }

    /**
     * Finds the guide data file in the project.
     *
     * @returns Absolute file path.
     */
    private findProjectFile(): string {
        return path.join(this.projectRoot, this.readDataFolder(), GuideFile.FOLDER, GuideFile.NAME);
    }

    /**
     * Reads the data folder from the project config.
     *
     * @returns Data folder relative to the project root.
     */
    private readDataFolder(): string {
        try {
            const config = JsonTools.loadFile(path.join(this.projectRoot, "config.json")) as { regolith?: { dataPath?: unknown } } | null;
            const dataPath = config?.regolith?.dataPath;

            return typeof dataPath === "string" ? dataPath : GuideFile.DATA_FOLDER;
        } catch {
            return GuideFile.DATA_FOLDER;
        }
    }
}
