/**
 * Collects the problems found in one run so all of them are reported together.
 */
export default class GuideIssues {
    /** Problems that make the guide fail the requirements. */
    readonly errors: string[] = [];

    /** Problems the author should review. */
    readonly warnings: string[] = [];

    /**
     * Records an error.
     *
     * @param where - Guide section or field with the problem.
     * @param message - Problem description.
     */
    error(where: string, message: string): void {
        this.errors.push(`${where}: ${message}`);
    }

    /**
     * Records a warning.
     *
     * @param where - Guide section or field with the problem.
     * @param message - Problem description.
     */
    warning(where: string, message: string): void {
        this.warnings.push(`${where}: ${message}`);
    }
}
