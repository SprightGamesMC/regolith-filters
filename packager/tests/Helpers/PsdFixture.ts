/** Options controlling generated PSD buffers. */
interface PsdOptions {
    height?: number;
    horizontalDpi?: number;
    resolutionUnit?: number;
    verticalDpi?: number;
    version?: number;
    width?: number;
    withResolution?: boolean;
}

/**
 * Builds synthetic PSD buffers for metadata reader tests.
 */
export default abstract class PsdFixture {
    /**
     * Creates a minimal valid PSD buffer.
     *
     * @param options - PSD generation options.
     *
     * @returns Serialized PSD file contents.
     */
    static create(options: PsdOptions = {}): Buffer {
        const width = options.width ?? 1920;
        const height = options.height ?? 1080;
        const version = options.version ?? 1;
        const withResolution = options.withResolution !== false;
        const header = Buffer.alloc(26);

        header.write("8BPS", 0, "ascii");
        header.writeUInt16BE(version, 4);
        header.writeUInt16BE(3, 12);
        header.writeUInt32BE(height, 14);
        header.writeUInt32BE(width, 18);
        header.writeUInt16BE(8, 22);
        header.writeUInt16BE(3, 24);

        const colorModeLength = Buffer.alloc(4);
        const resourcesData = withResolution
            ? this.createResolutionBlock(
                  options.horizontalDpi ?? 300,
                  options.verticalDpi ?? options.horizontalDpi ?? 300,
                  options.resolutionUnit ?? 1
              )
            : Buffer.alloc(0);
        const resourcesLength = Buffer.alloc(4);

        resourcesLength.writeUInt32BE(resourcesData.length, 0);

        return Buffer.concat([header, colorModeLength, resourcesLength, resourcesData]);
    }

    /**
     * Creates an `8BIM` ResolutionInfo image-resource block.
     *
     * @param horizontalDpi - Horizontal resolution value.
     * @param verticalDpi - Vertical resolution value.
     * @param resolutionUnit - PSD resolution unit identifier.
     *
     * @returns Serialized image-resource block.
     */
    static createResolutionBlock(horizontalDpi: number, verticalDpi: number, resolutionUnit: number): Buffer {
        const block = Buffer.alloc(6 + 2 + 4 + 16);

        block.write("8BIM", 0, "ascii");
        block.writeUInt16BE(1005, 4);
        block.writeUInt8(0, 6);
        block.writeUInt8(0, 7);
        block.writeUInt32BE(16, 8);
        block.writeInt32BE(Math.round(horizontalDpi * 65536), 12);
        block.writeUInt16BE(resolutionUnit, 16);
        block.writeUInt16BE(1, 18);
        block.writeInt32BE(Math.round(verticalDpi * 65536), 20);
        block.writeUInt16BE(resolutionUnit, 24);
        block.writeUInt16BE(1, 26);

        return block;
    }
}
