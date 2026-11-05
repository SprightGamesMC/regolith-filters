"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const GuideTemplate_1 = __importDefault(require("../Data/GuideTemplate"));
const JsonTools_1 = __importDefault(require("./JsonTools"));
/**
 * Loads and saves the guide data file. Regolith discards changes to the data folder of the working directory, so changes are saved in the project.
 */
class GuideFile {
    /** Name of the guide data file. */
    static NAME = "content_guide.json";
    /** Folder of the guide data, relative to the data folder. */
    static FOLDER = "content_guide";
    /** Data folder of the working directory, and of a project with no setting for it. */
    static DATA_FOLDER = "data";
    /** Guide data file relative to the working directory. */
    static WORKING_PATH = `${GuideFile.DATA_FOLDER}/${GuideFile.FOLDER}/${GuideFile.NAME}`;
    /** Regolith working directory. */
    workingDirectory;
    /** Regolith project root. */
    projectRoot;
    /** Collector for every problem found. */
    issues;
    /**
     * Creates access to the guide data file of one run.
     *
     * @param workingDirectory - Regolith working directory.
     * @param projectRoot - Regolith project root.
     * @param issues - Collector for every problem found.
     */
    constructor(workingDirectory, projectRoot, issues) {
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
    load() {
        const filePath = path_1.default.join(this.workingDirectory, GuideFile.WORKING_PATH);
        if (!fs_1.default.existsSync(filePath)) {
            return this.create();
        }
        try {
            return JsonTools_1.default.loadFileWithComments(filePath);
        }
        catch (error) {
            throw new Error(JsonTools_1.default.describeLoadError(GuideFile.WORKING_PATH, error), { cause: error });
        }
    }
    /**
     * Saves changed guide data in the project.
     *
     * @param guide - Guide data with its comments.
     */
    save(guide) {
        const filePath = this.findProjectFile();
        try {
            fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
            JsonTools_1.default.writeWithComments(filePath, guide);
        }
        catch (error) {
            this.issues.warning(filePath, `Cannot save the changes to this file, so the next run makes them again: ${String(error)}`);
        }
    }
    /**
     * Creates the guide data from the blank template and saves it in the project.
     *
     * @returns Parsed guide data.
     */
    create() {
        const guide = JsonTools_1.default.parseWithComments(GuideTemplate_1.default.TEXT);
        this.save(guide);
        this.issues.warning(this.findProjectFile(), "Missing, so a blank one was created. Write its sections to finish the guide.");
        return guide;
    }
    /**
     * Finds the guide data file in the project.
     *
     * @returns Absolute file path.
     */
    findProjectFile() {
        return path_1.default.join(this.projectRoot, this.readDataFolder(), GuideFile.FOLDER, GuideFile.NAME);
    }
    /**
     * Reads the data folder from the project config.
     *
     * @returns Data folder relative to the project root.
     */
    readDataFolder() {
        try {
            const config = JsonTools_1.default.loadFile(path_1.default.join(this.projectRoot, "config.json"));
            const dataPath = config?.regolith?.dataPath;
            return typeof dataPath === "string" ? dataPath : GuideFile.DATA_FOLDER;
        }
        catch {
            return GuideFile.DATA_FOLDER;
        }
    }
}
exports.default = GuideFile;
