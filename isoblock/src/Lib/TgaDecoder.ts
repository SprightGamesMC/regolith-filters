import type { DecodedImage } from "../Types/IsoBlockTypes";

/**
 * Decodes Targa (.tga) images into top-down RGBA pixel data.
 */
export default abstract class TgaDecoder {
    static readonly HEADER_SIZE = 18;

    static readonly TYPE_TRUE_COLOR = 2;

    static readonly TYPE_GRAYSCALE = 3;

    static readonly TYPE_RLE_TRUE_COLOR = 10;

    static readonly TYPE_RLE_GRAYSCALE = 11;

    static readonly TOP_ORIGIN_FLAG = 0x20;

    /**
     * Decodes a TGA file.
     *
     * @param file - Raw TGA file contents.
     *
     * @returns DecodedImage.
     *
     * @throws If the image type or pixel depth is unsupported.
     */
    static decode(file: Buffer): DecodedImage {
        const identifierLength = file[0];
        const imageType = file[2];
        const width = file.readUInt16LE(12);
        const height = file.readUInt16LE(14);
        const pixelDepth = file[16];
        const topOrigin = (file[17] & TgaDecoder.TOP_ORIGIN_FLAG) !== 0;

        const isTrueColor = imageType === TgaDecoder.TYPE_TRUE_COLOR || imageType === TgaDecoder.TYPE_RLE_TRUE_COLOR;
        const isGrayscale = imageType === TgaDecoder.TYPE_GRAYSCALE || imageType === TgaDecoder.TYPE_RLE_GRAYSCALE;

        if (!isTrueColor && !isGrayscale) {
            throw new Error(`Unsupported TGA image type ${imageType}. Only true-color and grayscale images are supported.`);
        }
        if (isTrueColor && pixelDepth !== 24 && pixelDepth !== 32) {
            throw new Error(`Unsupported TGA pixel depth ${pixelDepth}. Only 24-bit and 32-bit true-color images are supported.`);
        }
        if (isGrayscale && pixelDepth !== 8) {
            throw new Error(`Unsupported TGA pixel depth ${pixelDepth}. Only 8-bit grayscale images are supported.`);
        }

        const isRunLength = imageType === TgaDecoder.TYPE_RLE_TRUE_COLOR || imageType === TgaDecoder.TYPE_RLE_GRAYSCALE;
        const bytesPerPixel = pixelDepth / 8;
        const pixelStart = TgaDecoder.HEADER_SIZE + identifierLength;
        const pixels = isRunLength
            ? TgaDecoder.decodeRunLength(file, pixelStart, width * height * bytesPerPixel, bytesPerPixel)
            : file.subarray(pixelStart, pixelStart + width * height * bytesPerPixel);

        return { width, height, data: TgaDecoder.toRgba(pixels, width, height, bytesPerPixel, topOrigin) };
    }

    /**
     * Expands run-length encoded pixel packets.
     *
     * @param file - Raw TGA file contents.
     * @param offset - Byte offset where pixel packets begin.
     * @param byteCount - Total decoded pixel byte count.
     * @param bytesPerPixel - Bytes per stored pixel.
     *
     * @returns Decoded pixel bytes.
     */
    private static decodeRunLength(file: Buffer, offset: number, byteCount: number, bytesPerPixel: number): Buffer {
        const pixels = Buffer.alloc(byteCount);
        let readOffset = offset;
        let writeOffset = 0;

        while (writeOffset < byteCount) {
            const packet = file[readOffset++];
            const pixelCount = (packet & 0x7f) + 1;

            if (packet & 0x80) {
                for (let repeat = 0; repeat < pixelCount; repeat++) {
                    file.copy(pixels, writeOffset, readOffset, readOffset + bytesPerPixel);
                    writeOffset += bytesPerPixel;
                }
                readOffset += bytesPerPixel;
            } else {
                const packetBytes = pixelCount * bytesPerPixel;
                file.copy(pixels, writeOffset, readOffset, readOffset + packetBytes);
                readOffset += packetBytes;
                writeOffset += packetBytes;
            }
        }

        return pixels;
    }

    /**
     * Converts stored BGR(A) or grayscale rows into top-down RGBA rows.
     *
     * @param pixels - Decoded pixel bytes in storage order.
     * @param width - Image width in pixels.
     * @param height - Image height in pixels.
     * @param bytesPerPixel - Bytes per stored pixel. One byte means grayscale.
     * @param topOrigin - Whether rows are stored top-down.
     *
     * @returns RGBA pixel bytes.
     */
    private static toRgba(pixels: Buffer, width: number, height: number, bytesPerPixel: number, topOrigin: boolean): Buffer {
        const data = Buffer.alloc(width * height * 4);
        const grayscale = bytesPerPixel === 1;

        for (let y = 0; y < height; y++) {
            const sourceRow = topOrigin ? y : height - 1 - y;

            for (let x = 0; x < width; x++) {
                const sourceOffset = (sourceRow * width + x) * bytesPerPixel;
                const targetOffset = (y * width + x) * 4;

                data[targetOffset] = grayscale ? pixels[sourceOffset] : pixels[sourceOffset + 2];
                data[targetOffset + 1] = grayscale ? pixels[sourceOffset] : pixels[sourceOffset + 1];
                data[targetOffset + 2] = pixels[sourceOffset];
                data[targetOffset + 3] = bytesPerPixel === 4 ? pixels[sourceOffset + 3] : 255;
            }
        }

        return data;
    }
}
