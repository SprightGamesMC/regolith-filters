import assert from "node:assert/strict";
import { describe, test } from "node:test";
import TgaDecoder from "../../src/Lib/TgaDecoder";
import TgaFixture from "../Helpers/TgaFixture";

describe("TgaDecoder.decode", () => {
    test("decodes 32-bit uncompressed pixels from BGRA to RGBA", () => {
        const file = TgaFixture.create({ width: 2, height: 1, body: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]) });

        const image = TgaDecoder.decode(file);

        assert.equal(image.width, 2);
        assert.equal(image.height, 1);
        assert.deepEqual([...image.data], [3, 2, 1, 4, 7, 6, 5, 8]);
    });

    test("fills alpha for 24-bit pixels", () => {
        const file = TgaFixture.create({ width: 1, height: 1, pixelDepth: 24, body: Buffer.from([1, 2, 3]) });

        assert.deepEqual([...TgaDecoder.decode(file).data], [3, 2, 1, 255]);
    });

    test("flips bottom-origin rows into top-down order", () => {
        const bottomRowFirst = Buffer.from([1, 1, 1, 1, 2, 2, 2, 2]);
        const file = TgaFixture.create({ width: 1, height: 2, topOrigin: false, body: bottomRowFirst });

        assert.deepEqual([...TgaDecoder.decode(file).data], [2, 2, 2, 2, 1, 1, 1, 1]);
    });

    test("skips the identifier field", () => {
        const file = TgaFixture.create({ width: 1, height: 1, identifier: "id", body: Buffer.from([1, 2, 3, 4]) });

        assert.deepEqual([...TgaDecoder.decode(file).data], [3, 2, 1, 4]);
    });

    test("expands run-length and raw packets", () => {
        const runPacket = Buffer.from([0x81, 1, 2, 3, 4]);
        const rawPacket = Buffer.from([0x00, 5, 6, 7, 8]);
        const file = TgaFixture.create({
            width: 3,
            height: 1,
            imageType: TgaDecoder.TYPE_RLE_TRUE_COLOR,
            body: Buffer.concat([runPacket, rawPacket]),
        });

        assert.deepEqual([...TgaDecoder.decode(file).data], [3, 2, 1, 4, 3, 2, 1, 4, 7, 6, 5, 8]);
    });

    test("decodes 8-bit grayscale pixels", () => {
        const file = TgaFixture.create({
            width: 2,
            height: 1,
            imageType: TgaDecoder.TYPE_GRAYSCALE,
            pixelDepth: 8,
            body: Buffer.from([10, 200]),
        });

        assert.deepEqual([...TgaDecoder.decode(file).data], [10, 10, 10, 255, 200, 200, 200, 255]);
    });

    test("expands run-length grayscale packets", () => {
        const runPacket = Buffer.from([0x82, 40]);
        const file = TgaFixture.create({
            width: 3,
            height: 1,
            imageType: TgaDecoder.TYPE_RLE_GRAYSCALE,
            pixelDepth: 8,
            body: runPacket,
        });

        assert.deepEqual([...TgaDecoder.decode(file).data], [40, 40, 40, 255, 40, 40, 40, 255, 40, 40, 40, 255]);
    });

    test("throws on color-mapped image types", () => {
        const file = TgaFixture.create({ width: 1, height: 1, imageType: 1, body: Buffer.from([1]) });

        assert.throws(() => TgaDecoder.decode(file), /Unsupported TGA image type 1/);
    });

    test("throws on unsupported true-color pixel depths", () => {
        const file = TgaFixture.create({ width: 1, height: 1, pixelDepth: 16, body: Buffer.from([1, 2]) });

        assert.throws(() => TgaDecoder.decode(file), /Unsupported TGA pixel depth 16/);
    });

    test("throws on unsupported grayscale pixel depths", () => {
        const file = TgaFixture.create({
            width: 1,
            height: 1,
            imageType: TgaDecoder.TYPE_GRAYSCALE,
            pixelDepth: 16,
            body: Buffer.from([1, 2]),
        });

        assert.throws(() => TgaDecoder.decode(file), /Only 8-bit grayscale/);
    });
});
