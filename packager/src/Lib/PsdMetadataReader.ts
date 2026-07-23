import fs from "fs";

/**
 * Reads width, height, and resolution metadata from PSD files.
 */
export default class PsdMetadataReader {
    static readonly FILE_SIGNATURE = "8BPS";

    static readonly FILE_HEADER_LENGTH = 26;

    static readonly IMAGE_RESOURCE_SIGNATURE = "8BIM";

    static readonly IMAGE_RESOURCE_RESOLUTION_INFO_ID = 1005;

    static readonly PIXELS_PER_INCH_UNIT = 1;

    static readonly PIXELS_PER_CENTIMETER_UNIT = 2;

    static readonly SHORT_LENGTH = 2;

    static readonly INT_LENGTH = 4;

    /**
     * Reads normalized PSD metadata from disk.
     *
     * @param sourcePath - Absolute PSD source path.
     *
     * @returns Parsed PSD metadata.
     *
     * @throws If the PSD file structure is invalid.
     */
    static read(sourcePath: string): {
        format: string;
        height: number;
        horizontalDpi?: number;
        verticalDpi?: number;
        width: number;
    } {
        const fileHandle = fs.openSync(sourcePath, "r");

        try {
            const header = this.readHeader(fileHandle);
            const imageResourcesBuffer = this.readImageResourcesSection(fileHandle);
            const resolutionInfo = this.readResolutionInfo(imageResourcesBuffer);

            return {
                format: "psd",
                height: header.height,
                horizontalDpi: resolutionInfo ? resolutionInfo.horizontalDpi : undefined,
                verticalDpi: resolutionInfo ? resolutionInfo.verticalDpi : undefined,
                width: header.width,
            };
        } finally {
            fs.closeSync(fileHandle);
        }
    }

    /**
     * Reads the fixed PSD file header.
     *
     * @param fileHandle - Open PSD file handle.
     *
     * @returns Parsed header data.
     *
     * @throws If the PSD header is invalid.
     */
    static readHeader(fileHandle: number): { height: number; width: number } {
        const headerBuffer = this.readBuffer(fileHandle, 0, PsdMetadataReader.FILE_HEADER_LENGTH);
        const signature = headerBuffer.toString("ascii", 0, 4);
        const version = headerBuffer.readUInt16BE(4);
        const height = headerBuffer.readUInt32BE(14);
        const width = headerBuffer.readUInt32BE(18);

        if (signature !== PsdMetadataReader.FILE_SIGNATURE) {
            throw new Error("Invalid PSD signature.");
        }

        if (version !== 1 && version !== 2) {
            throw new Error("Unsupported PSD version.");
        }

        return {
            height,
            width,
        };
    }

    /**
     * Reads the PSD image-resources section from disk.
     *
     * @param fileHandle - Open PSD file handle.
     *
     * @returns Raw image-resources section data.
     *
     * @throws If the PSD section layout is invalid.
     */
    static readImageResourcesSection(fileHandle: number): Buffer {
        let offset = PsdMetadataReader.FILE_HEADER_LENGTH;
        const colorModeDataLength = this.readUInt32(fileHandle, offset);

        offset += PsdMetadataReader.INT_LENGTH + colorModeDataLength;

        const imageResourcesLength = this.readUInt32(fileHandle, offset);

        offset += PsdMetadataReader.INT_LENGTH;

        if (imageResourcesLength === 0) {
            return Buffer.alloc(0);
        }

        return this.readBuffer(fileHandle, offset, imageResourcesLength);
    }

    /**
     * Finds and parses the ResolutionInfo image-resource block.
     *
     * @param imageResourcesBuffer - Raw PSD image-resources data.
     *
     * @returns Parsed resolution metadata.
     *
     * @throws If the image-resource section is malformed.
     */
    static readResolutionInfo(imageResourcesBuffer: Buffer): { horizontalDpi: number; verticalDpi: number } | null {
        let offset = 0;

        while (offset < imageResourcesBuffer.length) {
            if (offset + 10 > imageResourcesBuffer.length) {
                throw new Error("Invalid PSD image resource block.");
            }

            const signature = imageResourcesBuffer.toString("ascii", offset, offset + 4);
            const resourceId = imageResourcesBuffer.readUInt16BE(offset + 4);

            if (signature !== PsdMetadataReader.IMAGE_RESOURCE_SIGNATURE) {
                throw new Error("Invalid PSD image resource signature.");
            }

            offset += 6;

            const nameByteLength = imageResourcesBuffer.readUInt8(offset);
            const paddedNameLength = 1 + nameByteLength + ((1 + nameByteLength) % 2);

            if (offset + paddedNameLength > imageResourcesBuffer.length) {
                throw new Error("Invalid PSD resource name.");
            }

            offset += paddedNameLength;

            if (offset + PsdMetadataReader.INT_LENGTH > imageResourcesBuffer.length) {
                throw new Error("Invalid PSD resource size.");
            }

            const resourceDataLength = imageResourcesBuffer.readUInt32BE(offset);

            offset += PsdMetadataReader.INT_LENGTH;

            if (offset + resourceDataLength > imageResourcesBuffer.length) {
                throw new Error("Invalid PSD resource payload.");
            }

            const resourceData = imageResourcesBuffer.subarray(offset, offset + resourceDataLength);

            offset += resourceDataLength + (resourceDataLength % 2);

            if (resourceId === PsdMetadataReader.IMAGE_RESOURCE_RESOLUTION_INFO_ID) {
                return this.parseResolutionInfo(resourceData);
            }
        }

        return null;
    }

    /**
     * Parses the PSD ResolutionInfo payload.
     *
     * @param resourceData - ResolutionInfo resource payload.
     *
     * @returns Parsed resolution metadata.
     *
     * @throws If the ResolutionInfo payload is invalid.
     */
    static parseResolutionInfo(resourceData: Buffer): { horizontalDpi: number; verticalDpi: number } {
        if (resourceData.length < 16) {
            throw new Error("Invalid PSD ResolutionInfo payload.");
        }

        const horizontalResolution = resourceData.readInt32BE(0) / 65536;
        const horizontalResolutionUnit = resourceData.readUInt16BE(4);
        const verticalResolution = resourceData.readInt32BE(8) / 65536;
        const verticalResolutionUnit = resourceData.readUInt16BE(12);

        return {
            horizontalDpi: this.toDpi(horizontalResolution, horizontalResolutionUnit),
            verticalDpi: this.toDpi(verticalResolution, verticalResolutionUnit),
        };
    }

    /**
     * Converts a PSD resolution value into DPI.
     *
     * @param resolution - Resolution value from the PSD payload.
     * @param resolutionUnit - PSD resolution unit identifier.
     *
     * @returns Resolution converted to DPI.
     *
     * @throws If the resolution unit is unsupported.
     */
    static toDpi(resolution: number, resolutionUnit: number): number {
        if (resolutionUnit === PsdMetadataReader.PIXELS_PER_INCH_UNIT) {
            return resolution;
        }

        if (resolutionUnit === PsdMetadataReader.PIXELS_PER_CENTIMETER_UNIT) {
            return resolution * 2.54;
        }

        throw new Error(`Unsupported PSD resolution unit "${resolutionUnit}".`);
    }

    /**
     * Reads a fixed-length buffer from a file.
     *
     * @param fileHandle - Open file handle.
     * @param position - Absolute read offset.
     * @param length - Number of bytes to read.
     *
     * @returns Filled buffer.
     *
     * @throws If the requested number of bytes cannot be read.
     */
    static readBuffer(fileHandle: number, position: number, length: number): Buffer {
        const buffer = Buffer.alloc(length);
        const bytesRead = fs.readSync(fileHandle, buffer, 0, length, position);

        if (bytesRead < length) {
            throw new Error("Unexpected end of PSD file.");
        }

        return buffer;
    }

    /**
     * Reads a 32-bit unsigned integer from a file.
     *
     * @param fileHandle - Open file handle.
     * @param position - Absolute read offset.
     *
     * @returns Parsed unsigned integer.
     */
    static readUInt32(fileHandle: number, position: number): number {
        return this.readBuffer(fileHandle, position, PsdMetadataReader.INT_LENGTH).readUInt32BE(0);
    }
}
