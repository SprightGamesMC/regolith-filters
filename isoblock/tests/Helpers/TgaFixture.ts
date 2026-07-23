import type { TgaFixtureOptions } from "../Types/IsoBlockTestTypes";
import TgaDecoder from "../../src/Lib/TgaDecoder";

/**
 * Builds TGA file buffers for tests.
 */
export default abstract class TgaFixture {
    /**
     * Encodes a TGA file from header fields and raw body bytes.
     *
     * @param options - Header fields and raw pixel or packet bytes.
     *
     * @returns Encoded TGA file buffer.
     */
    static create(options: TgaFixtureOptions): Buffer {
        const identifier = Buffer.from(options.identifier ?? "", "ascii");
        const header = Buffer.alloc(TgaDecoder.HEADER_SIZE);

        header[0] = identifier.length;
        header[2] = options.imageType ?? TgaDecoder.TYPE_TRUE_COLOR;
        header.writeUInt16LE(options.width, 12);
        header.writeUInt16LE(options.height, 14);
        header[16] = options.pixelDepth ?? 32;
        header[17] = (options.topOrigin ?? true) ? TgaDecoder.TOP_ORIGIN_FLAG : 0;

        return Buffer.concat([header, identifier, options.body]);
    }
}
