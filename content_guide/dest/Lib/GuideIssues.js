"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Collects the problems found in one run so all of them are reported together.
 */
class GuideIssues {
    /** Problems that make the guide fail the requirements. */
    errors = [];
    /** Problems the author should review. */
    warnings = [];
    /**
     * Records an error.
     *
     * @param where - Guide section or field with the problem.
     * @param message - Problem description.
     */
    error(where, message) {
        this.errors.push(`${where}: ${message}`);
    }
    /**
     * Records a warning.
     *
     * @param where - Guide section or field with the problem.
     * @param message - Problem description.
     */
    warning(where, message) {
        this.warnings.push(`${where}: ${message}`);
    }
}
exports.default = GuideIssues;
