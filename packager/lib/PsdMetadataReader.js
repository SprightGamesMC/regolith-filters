const fs = require("fs");

/**
 * Reads width, height, and resolution metadata from PSD files.
 */
class PsdMetadataReader {
  static FILE_SIGNATURE = "8BPS";

  static FILE_HEADER_LENGTH = 26;

  static IMAGE_RESOURCE_SIGNATURE = "8BIM";

  static IMAGE_RESOURCE_RESOLUTION_INFO_ID = 1005;

  static PIXELS_PER_INCH_UNIT = 1;

  static PIXELS_PER_CENTIMETER_UNIT = 2;

  static SHORT_LENGTH = 2;

  static INT_LENGTH = 4;

  /**
   * Reads normalized PSD metadata from disk.
   *
   * @param {string} sourcePath - Absolute PSD source path.
   *
   * @returns {{ format: string; height: number; horizontalDpi?: number; verticalDpi?: number; width: number }} Parsed PSD metadata.
   *
   * @throws {Error} If the PSD file structure is invalid.
   */
  static read(sourcePath) {
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
        width: header.width
      };
    } finally {
      fs.closeSync(fileHandle);
    }
  }

  /**
   * Reads the fixed PSD file header.
   *
   * @param {number} fileHandle - Open PSD file handle.
   *
   * @returns {{ height: number; width: number }} Parsed header data.
   *
   * @throws {Error} If the PSD header is invalid.
   */
  static readHeader(fileHandle) {
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
      width
    };
  }

  /**
   * Reads the PSD image-resources section from disk.
   *
   * @param {number} fileHandle - Open PSD file handle.
   *
   * @returns {Buffer} Raw image-resources section data.
   *
   * @throws {Error} If the PSD section layout is invalid.
   */
  static readImageResourcesSection(fileHandle) {
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
   * @param {Buffer} imageResourcesBuffer - Raw PSD image-resources data.
   *
   * @returns {{ horizontalDpi: number; verticalDpi: number } | null} Parsed resolution metadata.
   *
   * @throws {Error} If the image-resource section is malformed.
   */
  static readResolutionInfo(imageResourcesBuffer) {
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
   * @param {Buffer} resourceData - ResolutionInfo resource payload.
   *
   * @returns {{ horizontalDpi: number; verticalDpi: number }} Parsed resolution metadata.
   *
   * @throws {Error} If the ResolutionInfo payload is invalid.
   */
  static parseResolutionInfo(resourceData) {
    if (resourceData.length < 16) {
      throw new Error("Invalid PSD ResolutionInfo payload.");
    }

    const horizontalResolution = resourceData.readInt32BE(0) / 65536;
    const horizontalResolutionUnit = resourceData.readUInt16BE(4);
    const verticalResolution = resourceData.readInt32BE(8) / 65536;
    const verticalResolutionUnit = resourceData.readUInt16BE(12);

    return {
      horizontalDpi: this.toDpi(horizontalResolution, horizontalResolutionUnit),
      verticalDpi: this.toDpi(verticalResolution, verticalResolutionUnit)
    };
  }

  /**
   * Converts a PSD resolution value into DPI.
   *
   * @param {number} resolution - Resolution value from the PSD payload.
   * @param {number} resolutionUnit - PSD resolution unit identifier.
   *
   * @returns {number} Resolution converted to DPI.
   *
   * @throws {Error} If the resolution unit is unsupported.
   */
  static toDpi(resolution, resolutionUnit) {
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
   * @param {number} fileHandle - Open file handle.
   * @param {number} position - Absolute read offset.
   * @param {number} length - Number of bytes to read.
   *
   * @returns {Buffer} Filled buffer.
   *
   * @throws {Error} If the requested number of bytes cannot be read.
   */
  static readBuffer(fileHandle, position, length) {
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
   * @param {number} fileHandle - Open file handle.
   * @param {number} position - Absolute read offset.
   *
   * @returns {number} Parsed unsigned integer.
   */
  static readUInt32(fileHandle, position) {
    return this.readBuffer(fileHandle, position, PsdMetadataReader.INT_LENGTH).readUInt32BE(0);
  }
}

module.exports = PsdMetadataReader;
