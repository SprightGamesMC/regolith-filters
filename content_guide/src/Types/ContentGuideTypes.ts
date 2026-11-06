/**
 * Shared type definitions for the content guide filter.
 */

/** Content types that need a content guide. */
export type ContentType = "addon" | "world" | "mash_up" | "texture_pack";

/** Resolved filter settings. */
export interface ContentGuideSettings {
    contentName: string;
    contentType: ContentType;
    contentVersion: string;
    creatorTeamName: string | null;
    partnerName: string | null;
    outputPath: string;
    strict: boolean;
    autoBlankOptionalNotes: boolean;
    style: GuideStyleSettings;
}

/** One authored list entry with optional coordinates and nested notes. */
export interface GuideEntry {
    text: string;
    locations: string[];
    notes: GuideEntry[];
}

/** One authored completion guide step. */
export interface CompletionStep extends GuideEntry {
    requirement: string | null;
    skip: string | null;
    returnTo: string | null;
}

/** Authored navigation subsections. `null` marks a subsection that is not written yet. Only maps write `endPortal`. */
export interface GuideNavigation {
    general: GuideEntry[] | null;
    keyLocations: GuideEntry[] | null;
    endPortal: GuideEntry[] | null;
    landmarks: GuideEntry[] | null;
    containers: GuideEntry[] | null;
    hiddenElements: GuideEntry[] | null;
}

/** Authored gameplay subsections. `null` marks a subsection that is not written yet. */
export interface GuideGameplay {
    mechanics: GuideEntry[] | null;
    userInterface: GuideEntry[] | null;
    keyBindings: GuideEntry[] | null;
}

/** Authored additions to one generated item, entity, or sound. `null` notes are not written yet. */
export interface ContentNotes {
    name: string | null;
    playerAccessible: boolean | null;
    tags: string[] | null;
    notes: GuideEntry[] | null;
}

/** Authored changelog release. */
export interface ChangelogRelease {
    version: string;
    date: string | null;
    changes: GuideEntry[];
}

/** Normalized guide data. `null` marks a section that is not written yet. */
export interface GuideData {
    completionGuide: CompletionStep[] | null;
    navigation: GuideNavigation;
    characters: GuideEntry[] | null;
    gameplay: GuideGameplay;
    vanillaChanges: GuideEntry[] | null;
    items: Map<string, ContentNotes>;
    entities: Map<string, ContentNotes>;
    sounds: Map<string, ContentNotes>;
    changelog: ChangelogRelease[] | null;
}

/** Crafting grid of a crafting table recipe. */
export interface RecipeGrid {
    station: string;
    rows: string[];
    legend: { symbol: string; name: string }[];
    makes: number | null;
}

/** One generated fact. A tag is a short label, and a crafting table recipe also has a crafting grid. */
export interface CatalogFact {
    text: string;
    isTag: boolean;
    recipe: RecipeGrid | null;
}

/** One item, entity, or sound found in the packs. `isNotesOptional` marks content that the packs fully describe. */
export interface CatalogEntry {
    identifier: string;
    name: string;
    playerAccessible: boolean;
    facts: CatalogFact[];
    isNotesOptional?: boolean;
}

/** Parts of the catalog that have an entry for each identifier in the guide data. */
export type CatalogSection = "items" | "entities" | "sounds";

/** Everything the guide generates from the packs. `uncertainSections` may be missing content, so their entries are not removed. */
export interface PackCatalog {
    items: CatalogEntry[];
    entities: CatalogEntry[];
    sounds: CatalogEntry[];
    vanillaEdits: string[];
    hasJsonUi: boolean;
    uncertainSections: CatalogSection[];
}

/** One JSON file read from a pack. */
export interface PackFile {
    relativePath: string;
    data: Record<string, unknown>;
}

/** Results and readable text of one recipe. */
export interface RecipeDescription {
    results: string[];
    text: string;
    grid: RecipeGrid | null;
}

/** Item or block definition found in the behavior pack, or a spawn egg that the filter generates. */
export interface ItemDefinition {
    identifier: string;
    name: string;
    isInCreativeMenu: boolean;
    lootTables: string[];
    isGeneratedEgg?: boolean;
}

/** Entity definition found in the behavior pack. */
export interface EntityDefinition {
    identifier: string;
    name: string;
    isSpawnable: boolean;
    isProjectile: boolean;
    isRideable: boolean;
    lootTables: string[];
    tradeTables: string[];
}

/** Writes one recipe or fact block of a PDF card at a position and width. */
export type PdfBlockWriter = (x: number, width: number) => void;

/** One heading listed on the PDF contents page. */
export interface ContentsLine {
    title: string;
    level: number;
    pageIndex: number;
    destination: string;
}

/** One rendered list line. Backticks in `text` mark code. */
export interface GuideLine {
    text: string;
    children: GuideLine[];
    label?: string;
    identifier?: string;
    isHeading?: boolean;
    isFact?: boolean;
    isTag?: boolean;
    recipe?: RecipeGrid;
}

/** One guide section with its content and nested sections. */
export interface GuideSection {
    title: string;
    paragraphs: string[];
    ordered: boolean;
    lines: GuideLine[];
    sections: GuideSection[];
    isCompact?: boolean;
}

/** One count shown on the PDF contents page. */
export interface GuideStat {
    value: string;
    label: string;
}

/** Complete guide, ready to render. */
export interface GuideDocument {
    title: string;
    contentTypeLabel: string;
    version: string;
    date: string | null;
    credits: string[];
    introduction: string;
    stats: GuideStat[];
    sections: GuideSection[];
}

/** Colors of a guide. */
export interface PdfColors {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    onPrimary: string;
    surface: string;
    surfaceSoft: string;
    surfaceLine: string;
    text: string;
    textMuted: string;
}

/** Style of a guide with absolute file paths. */
export interface PdfStyle {
    colors: PdfColors;
    wordmark: string | null;
    logo: string | null;
    fonts: {
        brand: string;
        brandUppercase: boolean;
        brandLetterSpacing: number;
        brandLineHeight: number | null;
        secondaryLetterSpacing: number;
        regular: string;
        bold: string;
        monospace: string;
    };
}

/** Style that the filter settings set, with file names relative to the guide data folder. */
export interface GuideStyleSettings {
    colors: Partial<PdfColors>;
    wordmark: string | null;
    logo: string | null;
    fonts: {
        brand: string | null;
        brandUppercase: boolean;
        brandLetterSpacing: number;
        brandLineHeight: number | null;
        secondaryLetterSpacing: number;
        regular: string | null;
        bold: string | null;
        monospace: string | null;
    };
}

/** Part of a font file that gives the shape of a letter. */
export interface PdfFontFile {
    unitsPerEm: number;
    hasGlyphForCodePoint(codePoint: number): boolean;
    layout(text: string): { glyphs: { bbox: { minX: number } }[] };
}

/** Style of wrapped text. */
export interface PdfTextStyle {
    size: number;
    lineHeight: number;
    color: string;
    font?: string;
}

/** One run of text with one font on a wrapped line. */
export interface PdfTextRun {
    text: string;
    isCode: boolean;
    width: number;
}

/** One wrapped line. */
export interface PdfTextLine {
    runs: PdfTextRun[];
    width: number;
}

/** One run of inline text. */
export interface InlineSegment {
    text: string;
    isCode: boolean;
}
