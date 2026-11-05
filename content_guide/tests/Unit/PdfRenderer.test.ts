import type { GuideDocument, GuideLine } from "../../src/Types/ContentGuideTypes";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import DefaultStyle from "../../src/Data/DefaultStyle";
import PdfRenderer from "../../src/Lib/Pdf/PdfRenderer";

describe("PdfRenderer.render", () => {
    const createDocument = (lines: GuideLine[]): GuideDocument => ({
        title: "Test Pack",
        contentTypeLabel: "Add-On",
        version: "1.0.0",
        date: "2026-11-04",
        credits: ["Creator Team: Team", "Partner: Spright"],
        introduction: "Intro",
        stats: [{ value: "1", label: "Items" }],
        sections: [
            {
                title: "Design",
                paragraphs: ["None."],
                ordered: true,
                lines,
                sections: [{ title: "Nested", paragraphs: [], ordered: false, lines, sections: [] }],
            },
            { title: "Changelog", paragraphs: [], ordered: false, lines: [], sections: [] },
        ],
    });

    const countPages = (pdf: Buffer): number => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

    test("writes a PDF with the cover, contents, and section pages", async () => {
        const pdf = await new PdfRenderer(
            createDocument([{ text: "Line (`1 2 3`)", children: [{ text: "Child", children: [] }] }])
        ).render();

        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
        assert.equal(countPages(pdf), 3);
    });

    test("draws every line style", async () => {
        const recipe = { station: "Crafting Table", rows: ["A A", " B "], legend: [{ symbol: "A", name: "Gem" }], makes: 2 };
        const lines: GuideLine[] = [
            {
                text: "Gem",
                identifier: "test:gem",
                children: [
                    { text: "A note", children: [] },
                    { text: "Crafted", children: [], isFact: true, recipe },
                    { text: "Dropped by Ore", children: [], isFact: true },
                    { text: "Cannot be crafted", children: [], isTag: true, isFact: true },
                ],
            },
            { text: "Version 1.0.0", isHeading: true, children: [{ text: "Change", children: [] }] },
            { text: "Load with `/structure load " + "a".repeat(120) + " ~ ~ ~`", children: [] },
        ];
        const document = createDocument(lines);
        const steps = {
            title: "Steps",
            paragraphs: [],
            ordered: true,
            sections: [],
            lines: [{ text: "Go", children: [{ label: "Skip", text: "`/tp @s 1 2 3`", children: [] }] }],
        };
        const sounds = {
            title: "Sounds",
            paragraphs: [],
            ordered: false,
            sections: [],
            isCompact: true,
            lines: [{ text: "Boom", identifier: "test:boom", children: [] }],
        };

        document.sections[0].sections.push(steps, sounds);

        const pdf = await new PdfRenderer(document).render();

        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    });

    test("draws a full team style with SVG and PNG images", async () => {
        const svg = path.join(os.tmpdir(), "content_guide_style_test.svg");
        const png = path.join(os.tmpdir(), "content_guide_style_test.png");

        fs.writeFileSync(
            svg,
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/></svg>'
        );
        fs.writeFileSync(
            png,
            Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64")
        );

        try {
            const style = { ...DefaultStyle.create(), wordmark: svg, logo: png };
            const pdf = await new PdfRenderer(createDocument([]), style).render();

            assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
        } finally {
            fs.rmSync(svg);
            fs.rmSync(png);
        }
    });

    test("wraps names, identifiers, and commands that are too long", async () => {
        const long = `${"very_long_part.".repeat(20)}end`;
        const words = "A very long name with many words ".repeat(8);
        const document = createDocument([
            { text: words, identifier: `test:${long}`, children: [{ text: "Tag", children: [], isTag: true, isFact: true }] },
        ]);

        document.sections[0].sections.push(
            {
                title: "Sounds",
                paragraphs: [],
                ordered: false,
                sections: [],
                isCompact: true,
                lines: [{ text: words, identifier: `test:${long}`, children: [] }],
            },
            {
                title: "Steps",
                paragraphs: [],
                ordered: true,
                sections: [],
                lines: [{ text: "Go", children: [{ label: "Skip", text: `\`/function ${long}\``, children: [] }] }],
            }
        );

        const pdf = await new PdfRenderer(document).render();

        assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    });

    test("survives extreme content without a crash or an extra footer page", async () => {
        const words = "Longword ".repeat(200);
        const nest = (depth: number): GuideLine[] => (depth === 0 ? [] : [{ text: words, children: nest(depth - 1) }]);
        const document = {
            ...createDocument([{ text: "Item", identifier: "test:item", children: nest(40) }]),
            title: words,
            credits: Array.from({ length: 20 }, () => `Credit: ${words}`),
        };

        document.sections[0].sections.push({
            title: "Steps",
            paragraphs: [],
            ordered: true,
            sections: [],
            lines: Array.from({ length: 1200 }, (_, index) => ({ text: `Step ${index}`, children: [] })),
        });

        const pdf = await new PdfRenderer(document).render();

        assert.equal(pdf.toString("latin1").match(/\/Count (\d+)/)?.[1], String(countPages(pdf)));
    });

    test("reports a broken logo or font with the file name", async () => {
        const broken = path.join(os.tmpdir(), "content_guide_broken.svg");
        const brokenFont = path.join(os.tmpdir(), "content_guide_broken.woff");

        fs.writeFileSync(broken, "not svg");
        fs.writeFileSync(brokenFont, "not a font");

        try {
            const defaults = DefaultStyle.create();

            assert.throws(() => new PdfRenderer(createDocument([]), { ...defaults, wordmark: broken }).render(), /Cannot draw image/);
            assert.throws(
                () => new PdfRenderer(createDocument([]), { ...defaults, fonts: { ...defaults.fonts, monospace: brokenFont } }),
                /Cannot read font/
            );
        } finally {
            fs.rmSync(broken);
            fs.rmSync(brokenFont);
        }
    });

    test("starts new pages for long lists without adding footer pages", async () => {
        const lines = Array.from({ length: 300 }, (_, index) => ({ text: `Line ${index} with \`test:id_${index}\``, children: [] }));
        const pdf = await new PdfRenderer(createDocument(lines)).render();

        assert.ok(countPages(pdf) > 10);
        assert.equal(pdf.toString("latin1").match(/\/Count (\d+)/)?.[1], String(countPages(pdf)));
    });
});
