"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const PsdMetadataReader_1 = __importDefault(require("./PsdMetadataReader"));
const AssetRequirements_1 = require("../Data/AssetRequirements");
/**
 * Validates image files against Marketplace format, width, height, DPI, and count requirements.
 */
class AssetValidator {
    /**
     * Validates all configured art assets for the selected content type.
     *
     * @param args - Validated packager arguments.
     *
     * @returns Validation error messages.
     */
    static async validate(args) {
        const errors = [];
        const requiredRoles = AssetRequirements_1.REQUIRED_ROLES_BY_TYPE[args.contentType];
        this.validateArtCount(errors, "Store Art", args.art.store, AssetRequirements_1.STORE_ART_SPECS, requiredRoles.store);
        this.validateArtCount(errors, "Marketing Art", args.art.marketing, AssetRequirements_1.MARKETING_ART_SPECS, requiredRoles.marketing);
        const validationGroups = await Promise.all([
            this.validateArtGroup("Store Art", args.art.store, AssetRequirements_1.STORE_ART_SPECS, requiredRoles.store),
            this.validateArtGroup("Marketing Art", args.art.marketing, AssetRequirements_1.MARKETING_ART_SPECS, requiredRoles.marketing),
        ]);
        for (const groupErrors of validationGroups) {
            errors.push(...groupErrors);
        }
        return errors;
    }
    /**
     * Validates count-based requirements for an art group.
     *
     * @param errors - Mutable error list.
     * @param groupName - Display name for the art group.
     * @param artGroup - Resolved art mapping for the group.
     * @param specs - Validation specs for the group.
     * @param requiredRoles - Required role keys for the content type.
     */
    static validateArtCount(errors, groupName, artGroup, specs, requiredRoles) {
        const screenshotList = Array.isArray(artGroup.screenshots) ? artGroup.screenshots : [];
        if (!requiredRoles.includes("screenshots") && screenshotList.length === 0) {
            return;
        }
        const screenshotSpec = specs.screenshots;
        if (typeof screenshotSpec.count === "number" && screenshotList.length !== screenshotSpec.count) {
            errors.push(`[${groupName}] expected exactly ${screenshotSpec.count} screenshot assets, received ${screenshotList.length}`);
        }
        if (typeof screenshotSpec.minCount === "number" && screenshotList.length < screenshotSpec.minCount) {
            errors.push(`[${groupName}] expected at least ${screenshotSpec.minCount} screenshot assets, received ${screenshotList.length}`);
        }
    }
    /**
     * Validates metadata for each asset in an art group.
     *
     * @param groupName - Display name for the art group.
     * @param artGroup - Resolved art mapping for the group.
     * @param specs - Validation specs for the group.
     * @param requiredRoles - Required role keys for the content type.
     *
     * @returns Validation errors for the art group.
     */
    static async validateArtGroup(groupName, artGroup, specs, requiredRoles) {
        const orderedRoleKeys = ["key_art", "screenshots", "panorama", "pack_icon", "partner_art"];
        const roleKeyList = orderedRoleKeys.filter((roleKey) => {
            return requiredRoles.includes(roleKey) || Object.hasOwn(artGroup, roleKey);
        });
        const validationTasks = [];
        for (const roleKey of roleKeyList) {
            if (roleKey === "screenshots") {
                const screenshotList = Array.isArray(artGroup.screenshots) ? artGroup.screenshots : [];
                for (let index = 0; index < screenshotList.length; index += 1) {
                    validationTasks.push(this.validateSingleAsset(groupName, roleKey, screenshotList[index], specs.screenshots, index));
                }
                continue;
            }
            validationTasks.push(this.validateSingleAsset(groupName, roleKey, artGroup[roleKey], specs[roleKey], null));
        }
        const validationResults = await Promise.all(validationTasks);
        return validationResults.flat();
    }
    /**
     * Validates a single asset against its format, width, height, and DPI rules.
     *
     * @param groupName - Display name for the art group.
     * @param roleKey - Role key being validated.
     * @param asset - Resolved asset record.
     * @param spec - Validation specification.
     * @param index - Screenshot index when applicable.
     *
     * @returns Validation errors for the asset.
     */
    static async validateSingleAsset(groupName, roleKey, asset, spec, index) {
        const errors = [];
        if (!asset) {
            return errors;
        }
        let metadata;
        try {
            metadata = await this.readAssetMetadata(asset);
        }
        catch (error) {
            const errorMessage = error instanceof Error && error.message ? error.message : String(error);
            errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): could not read image metadata (${errorMessage})`);
            return errors;
        }
        const detectedFormat = this.resolveFormat(metadata, asset.sourcePath);
        const expectedFormatList = spec.formats.join("/");
        if (!spec.formats.includes(detectedFormat)) {
            errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): expected ${expectedFormatList}, got ${detectedFormat.toUpperCase()}`);
        }
        if (typeof spec.width === "number" && metadata.width !== spec.width) {
            errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): expected ${spec.width}x${spec.height}, got ${metadata.width}x${metadata.height}`);
            return errors;
        }
        if (typeof spec.height === "number" && metadata.height !== spec.height) {
            errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): expected ${spec.width || `${spec.minWidth}-${spec.maxWidth}`}x${spec.height}, got ${metadata.width}x${metadata.height}`);
            return errors;
        }
        if (typeof spec.minWidth === "number" && (typeof metadata.width !== "number" || metadata.width < spec.minWidth)) {
            errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): expected width between ${spec.minWidth} and ${spec.maxWidth}, got ${metadata.width}`);
        }
        if (typeof spec.maxWidth === "number" && (typeof metadata.width !== "number" || metadata.width > spec.maxWidth)) {
            errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): expected width between ${spec.minWidth} and ${spec.maxWidth}, got ${metadata.width}`);
        }
        if (typeof spec.dpi === "number") {
            this.validateDpi(errors, groupName, roleKey, asset, spec.dpi, index, metadata);
        }
        return errors;
    }
    /**
     * Reads image metadata using the appropriate decoder for the asset format.
     *
     * @param asset - Resolved asset record.
     *
     * @returns Normalized metadata object.
     *
     * @throws If the image metadata cannot be read.
     */
    static async readAssetMetadata(asset) {
        const extension = path_1.default.extname(asset.fileName || asset.sourcePath).toLowerCase();
        if (extension === ".psd") {
            return PsdMetadataReader_1.default.read(asset.sourcePath);
        }
        return this.normalizeRasterMetadata(await (0, sharp_1.default)(asset.sourcePath).metadata());
    }
    /**
     * Normalizes sharp metadata into a shared validator shape.
     *
     * @param metadata - Image metadata returned by sharp.
     *
     * @returns Normalized metadata object.
     */
    static normalizeRasterMetadata(metadata) {
        const normalizedMetadata = {
            ...metadata,
        };
        if (typeof metadata.density === "number") {
            normalizedMetadata.horizontalDpi = metadata.density;
            normalizedMetadata.verticalDpi = metadata.density;
        }
        return normalizedMetadata;
    }
    /**
     * Validates asset DPI metadata against the expected requirement.
     *
     * @param errors - Mutable validation error list.
     * @param groupName - Display name for the art group.
     * @param roleKey - Role key being validated.
     * @param asset - Resolved asset record.
     * @param expectedDpi - Required DPI value.
     * @param index - Screenshot index when applicable.
     * @param metadata - Parsed metadata.
     */
    static validateDpi(errors, groupName, roleKey, asset, expectedDpi, index, metadata) {
        if (typeof metadata.horizontalDpi !== "number" || typeof metadata.verticalDpi !== "number") {
            errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): expected DPI metadata, but it was missing`);
            return;
        }
        const horizontalMatches = this.matchesExpectedDpi(metadata.horizontalDpi, expectedDpi);
        const verticalMatches = this.matchesExpectedDpi(metadata.verticalDpi, expectedDpi);
        if (horizontalMatches && verticalMatches) {
            return;
        }
        errors.push(`[${groupName}] "${asset.fileName}" (${this.describeRoleKey(roleKey, index)}): expected ${expectedDpi} DPI, got ${this.formatDpi(metadata)}`);
    }
    /**
     * Compares an actual DPI value to the expected DPI value.
     *
     * @param actualDpi - Parsed PSD DPI value.
     * @param expectedDpi - Required PSD DPI value.
     *
     * @returns `true` when the values match within tolerance.
     */
    static matchesExpectedDpi(actualDpi, expectedDpi) {
        return Math.abs(actualDpi - expectedDpi) < 0.01;
    }
    /**
     * Formats DPI metadata for error messages.
     *
     * @param metadata - Parsed PSD metadata.
     *
     * @returns Human-readable DPI label.
     */
    static formatDpi(metadata) {
        const horizontalDpi = this.roundDpi(metadata.horizontalDpi);
        const verticalDpi = this.roundDpi(metadata.verticalDpi);
        if (horizontalDpi === verticalDpi) {
            return `${horizontalDpi} DPI`;
        }
        return `${horizontalDpi}x${verticalDpi} DPI`;
    }
    /**
     * Rounds a DPI value for display.
     *
     * @param dpi - Parsed DPI value.
     *
     * @returns Rounded DPI label.
     */
    static roundDpi(dpi) {
        if (typeof dpi !== "number" || !Number.isFinite(dpi)) {
            return "unknown";
        }
        return String(Math.round(dpi * 100) / 100);
    }
    /**
     * Normalizes image format names from metadata or file extensions.
     *
     * @param metadata - Image metadata.
     * @param sourcePath - Source image path.
     *
     * @returns Normalized format name.
     */
    static resolveFormat(metadata, sourcePath) {
        const rawFormat = typeof metadata.format === "string" ? metadata.format.toLowerCase() : "";
        const extension = path_1.default.extname(sourcePath).toLowerCase().replace(/^\./, "");
        const format = rawFormat || extension;
        if (format === "jpg") {
            return "jpeg";
        }
        return format;
    }
    /**
     * Formats a role key for error messages.
     *
     * @param roleKey - Role key.
     * @param index - Screenshot index when applicable.
     *
     * @returns Human-readable key label.
     */
    static describeRoleKey(roleKey, index) {
        if (roleKey !== "screenshots" || index === null) {
            return `key: ${roleKey}`;
        }
        return `key: screenshots[${index}]`;
    }
}
exports.default = AssetValidator;
