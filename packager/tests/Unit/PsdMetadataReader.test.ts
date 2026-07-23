import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import ProjectFixture from "../Helpers/ProjectFixture";
import PsdFixture from "../Helpers/PsdFixture";
import PsdMetadataReader from "../../src/Lib/PsdMetadataReader";

describe("PsdMetadataReader.read", () => {
    let fixture: ProjectFixture;

    before(() => {
        fixture = new ProjectFixture();
    });

    after(() => {
        fixture.dispose();
    });

    test("reads dimensions and DPI from a valid PSD", () => {
        const filePath = fixture.writeFile("art.psd", PsdFixture.create({ width: 1920, height: 1080, horizontalDpi: 300 }));

        assert.deepEqual(PsdMetadataReader.read(filePath), {
            format: "psd",
            height: 1080,
            horizontalDpi: 300,
            verticalDpi: 300,
            width: 1920,
        });
    });

    test("reads distinct horizontal and vertical DPI", () => {
        const filePath = fixture.writeFile("mixed.psd", PsdFixture.create({ width: 100, height: 50, horizontalDpi: 72, verticalDpi: 300 }));

        const metadata = PsdMetadataReader.read(filePath);
        assert.equal(metadata.horizontalDpi, 72);
        assert.equal(metadata.verticalDpi, 300);
    });

    test("returns undefined DPI when no resolution block exists", () => {
        const filePath = fixture.writeFile("bare.psd", PsdFixture.create({ withResolution: false }));

        const metadata = PsdMetadataReader.read(filePath);
        assert.equal(metadata.horizontalDpi, undefined);
        assert.equal(metadata.verticalDpi, undefined);
    });

    test("accepts PSD version 2 files", () => {
        const filePath = fixture.writeFile("big.psd", PsdFixture.create({ version: 2, width: 30000, height: 20000 }));

        const metadata = PsdMetadataReader.read(filePath);
        assert.equal(metadata.width, 30000);
        assert.equal(metadata.height, 20000);
    });

    test("rejects an invalid signature", () => {
        const buffer = PsdFixture.create();
        buffer.write("XXXX", 0, "ascii");
        const filePath = fixture.writeFile("bad-signature.psd", buffer);

        assert.throws(() => PsdMetadataReader.read(filePath), /Invalid PSD signature/);
    });

    test("rejects an unsupported version", () => {
        const filePath = fixture.writeFile("bad-version.psd", PsdFixture.create({ version: 9 }));

        assert.throws(() => PsdMetadataReader.read(filePath), /Unsupported PSD version/);
    });

    test("rejects a truncated file", () => {
        const filePath = fixture.writeFile("short.psd", PsdFixture.create().subarray(0, 10));

        assert.throws(() => PsdMetadataReader.read(filePath), /Unexpected end of PSD file/);
    });
});

describe("PsdMetadataReader.readResolutionInfo", () => {
    test("rejects a block with a bad resource signature", () => {
        const block = PsdFixture.createResolutionBlock(300, 300, 1);
        block.write("NOPE", 0, "ascii");

        assert.throws(() => PsdMetadataReader.readResolutionInfo(block), /Invalid PSD image resource signature/);
    });

    test("returns null when no resolution resource is present", () => {
        assert.equal(PsdMetadataReader.readResolutionInfo(Buffer.alloc(0)), null);
    });

    test("rejects a truncated resource block", () => {
        const block = PsdFixture.createResolutionBlock(300, 300, 1).subarray(0, 8);

        assert.throws(() => PsdMetadataReader.readResolutionInfo(block), /Invalid PSD image resource block/);
    });
});

describe("PsdMetadataReader.parseResolutionInfo", () => {
    test("rejects a short payload", () => {
        assert.throws(() => PsdMetadataReader.parseResolutionInfo(Buffer.alloc(8)), /Invalid PSD ResolutionInfo payload/);
    });
});

describe("PsdMetadataReader.toDpi", () => {
    test("passes through pixels-per-inch", () => {
        assert.equal(PsdMetadataReader.toDpi(300, PsdMetadataReader.PIXELS_PER_INCH_UNIT), 300);
    });

    test("converts pixels-per-centimeter", () => {
        assert.equal(PsdMetadataReader.toDpi(100, PsdMetadataReader.PIXELS_PER_CENTIMETER_UNIT), 254);
    });

    test("rejects unknown units", () => {
        assert.throws(() => PsdMetadataReader.toDpi(100, 9), /Unsupported PSD resolution unit/);
    });
});
