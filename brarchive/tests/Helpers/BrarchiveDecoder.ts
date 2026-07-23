import type { ArchiveHeader, DecodedEntry } from "../Types/BrarchiveTestTypes";
import BrarchiveFilter from "../../src/Lib/BrarchiveFilter";

/**
 * Decodes `.brarchive` buffers back into readable pieces for verification.
 */
export default abstract class BrarchiveDecoder {
    /**
     * Reads the header fields of an archive buffer.
     *
     * @param buffer - Serialized archive buffer.
     *
     * @returns ArchiveHeader.
     */
    static readHeader(buffer: Buffer): ArchiveHeader {
        return {
            entryCount: buffer.readUInt32LE(8),
            magic: buffer.readBigUInt64LE(0),
            version: buffer.readUInt32LE(12),
        };
    }

    /**
     * Decodes an archive buffer into its entries in stored order.
     *
     * @param buffer - Serialized archive buffer.
     *
     * @returns DecodedEntry list.
     */
    static decodeEntries(buffer: Buffer): DecodedEntry[] {
        const { entryCount } = this.readHeader(buffer);
        const contentStart = BrarchiveFilter.HEADER_SIZE + BrarchiveFilter.DESCRIPTOR_SIZE * entryCount;
        const entryList: DecodedEntry[] = [];
        let position = BrarchiveFilter.HEADER_SIZE;

        for (let index = 0; index < entryCount; index += 1) {
            const nameLength = buffer.readUInt8(position);
            position += 1;
            const name = buffer.toString("utf8", position, position + nameLength);
            position += BrarchiveFilter.ENTRY_NAME_LENGTH_MAX;
            const offset = buffer.readUInt32LE(position);
            position += 4;
            const length = buffer.readUInt32LE(position);
            position += 4;
            entryList.push({ content: buffer.toString("utf8", contentStart + offset, contentStart + offset + length), name });
        }

        return entryList;
    }
}
