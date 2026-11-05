import type { GuideDocument } from "../../src/Types/ContentGuideTypes";
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import MarkdownRenderer from "../../src/Lib/MarkdownRenderer";

describe("MarkdownRenderer.render", () => {
    const document: GuideDocument = {
        title: "My_Pack",
        contentTypeLabel: "Add-On",
        version: "1.0.0",
        date: null,
        credits: [],
        introduction: "Intro",
        stats: [],
        sections: [
            {
                title: "Design",
                paragraphs: [],
                ordered: false,
                lines: [],
                sections: [
                    {
                        title: "Steps",
                        paragraphs: ["None_yet"],
                        ordered: true,
                        lines: [
                            { text: "First (`1 2 3`)", children: [{ text: "Keep `my_pack:id` and escape my_word", children: [] }] },
                            { text: "Second", children: [] },
                        ],
                        sections: [],
                    },
                ],
            },
        ],
    };

    test("writes headings, numbered lists, and nested bullets", () => {
        assert.equal(
            MarkdownRenderer.render(document),
            [
                "# My\\_Pack",
                "",
                "Add-On Content Guide | Version 1.0.0",
                "",
                "Intro",
                "",
                "## Design",
                "",
                "### Steps",
                "",
                "None\\_yet",
                "",
                "1. First (`1 2 3`)",
                "    - Keep `my_pack:id` and escape my\\_word",
                "2. Second",
                "",
            ].join("\n")
        );
    });

    test("writes labels before text and identifiers after it", () => {
        const section = {
            title: "List",
            paragraphs: [],
            ordered: false,
            lines: [
                { label: "Requires", text: "A sword", children: [] },
                { text: "Gem", identifier: "test:gem", children: [] },
            ],
            sections: [],
        };

        assert.match(MarkdownRenderer.render({ ...document, sections: [section] }), /- Requires: A sword\n- Gem \(`test:gem`\)/);
    });

    test("adds the date when present", () => {
        assert.match(MarkdownRenderer.render({ ...document, date: "2026-11-04" }), /Version 1\.0\.0 \| 2026-11-04/);
    });

    test("adds credits when present", () => {
        const markdown = MarkdownRenderer.render({ ...document, credits: ["Creator Team: Team", "Partner: Spright"] });

        assert.match(markdown, /Version 1\.0\.0\n\nCreator Team: Team \| Partner: Spright\n\nIntro/);
    });
});
