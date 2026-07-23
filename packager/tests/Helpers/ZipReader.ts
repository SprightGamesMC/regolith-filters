import fs from "node:fs";
import zlib from "node:zlib";

/** Parsed central-directory entry. */
interface ZipEntry {
    compressedSize: number;
    compressionMethod: number;
    localHeaderOffset: number;
    name: string;
}

/**
 * Reads zip archive entries for verification without external dependencies.
 */
export default abstract class ZipReader {
    static readonly END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

    static readonly CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;

    static readonly LOCAL_HEADER_SIGNATURE = 0x04034b50;

    static readonly STORED_METHOD = 0;

    static readonly DEFLATED_METHOD = 8;

    /**
     * Lists entry names stored in a zip archive.
     *
     * @param filePath - Absolute zip file path.
     *
     * @returns Entry names in central-directory order.
     */
    static listEntryNames(filePath: string): string[] {
        return this.readCentralDirectory(fs.readFileSync(filePath)).map((entry) => entry.name);
    }

    /**
     * Reads a single zip entry as UTF-8 text.
     *
     * @param filePath - Absolute zip file path.
     * @param entryName - Archive-relative entry name.
     *
     * @returns Decompressed entry text.
     *
     * @throws If the entry is missing or uses an unsupported compression method.
     */
    static readEntryText(filePath: string, entryName: string): string {
        const buffer = fs.readFileSync(filePath);
        const entry = this.readCentralDirectory(buffer).find((candidate) => candidate.name === entryName);

        if (!entry) {
            throw new Error(`Zip entry not found: ${entryName}`);
        }

        if (buffer.readUInt32LE(entry.localHeaderOffset) !== ZipReader.LOCAL_HEADER_SIGNATURE) {
            throw new Error(`Invalid local header for zip entry: ${entryName}`);
        }

        const nameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
        const extraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
        const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;
        const compressedData = buffer.subarray(dataStart, dataStart + entry.compressedSize);

        if (entry.compressionMethod === ZipReader.STORED_METHOD) {
            return compressedData.toString("utf8");
        }

        if (entry.compressionMethod === ZipReader.DEFLATED_METHOD) {
            return zlib.inflateRawSync(compressedData).toString("utf8");
        }

        throw new Error(`Unsupported zip compression method ${entry.compressionMethod} for entry: ${entryName}`);
    }

    /**
     * Parses central-directory entries from a zip buffer.
     *
     * @param buffer - Full zip file contents.
     *
     * @returns Parsed entries in central-directory order.
     *
     * @throws If the end-of-central-directory record is missing.
     */
    static readCentralDirectory(buffer: Buffer): ZipEntry[] {
        let endRecordOffset = -1;

        for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
            if (buffer.readUInt32LE(offset) === ZipReader.END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
                endRecordOffset = offset;
                break;
            }
        }

        if (endRecordOffset === -1) {
            throw new Error("Zip end-of-central-directory record not found.");
        }

        const entryCount = buffer.readUInt16LE(endRecordOffset + 10);
        const entryList: ZipEntry[] = [];
        let offset = buffer.readUInt32LE(endRecordOffset + 16);

        for (let index = 0; index < entryCount; index += 1) {
            if (buffer.readUInt32LE(offset) !== ZipReader.CENTRAL_DIRECTORY_SIGNATURE) {
                throw new Error("Invalid zip central-directory entry.");
            }

            const compressionMethod = buffer.readUInt16LE(offset + 10);
            const compressedSize = buffer.readUInt32LE(offset + 20);
            const nameLength = buffer.readUInt16LE(offset + 28);
            const extraLength = buffer.readUInt16LE(offset + 30);
            const commentLength = buffer.readUInt16LE(offset + 32);
            const localHeaderOffset = buffer.readUInt32LE(offset + 42);
            const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

            entryList.push({ compressedSize, compressionMethod, localHeaderOffset, name });
            offset += 46 + nameLength + extraLength + commentLength;
        }

        return entryList;
    }
}
