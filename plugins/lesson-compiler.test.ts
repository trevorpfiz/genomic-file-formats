// Compiler unit tests: text-directive round trips, the raw-HTML policy, directives, links and
// the TOC (docs/PLAN.md 11.1, 11.6).
import { describe, expect, test } from "vite-plus/test";
import { compileLesson, RAW_HTML_MESSAGE, type RegistryEntry } from "./lesson-compiler.ts";

const PAGE = "---\nkind: page\nid: test-page\ntitle: Test page\n---\n\n";
const LESSON_FM = [
  "---",
  "kind: lesson",
  "id: test-lesson",
  "section: placeholder",
  "title: Test lesson",
  "minutes: 9",
  "objectives: [LO1]",
  "introduces: []",
  "requires: []",
  'caseBeat: "test"',
  "specs: []",
  "---",
  "",
].join("\n");

const registry = new Map<string, RegistryEntry>([
  ["test-lesson/guess", { kind: "predict", title: "Guess the base" }],
  ["test-lesson/sim", { kind: "simulator", title: "Step the ruler" }],
  ["test-lesson/extra", { kind: "predict", title: "An optional extra" }],
]);

/** Compile one paragraph as a page and return the inner HTML of its <p>. */
async function paragraph(markdown: string): Promise<string> {
  const { html } = await compileLesson(PAGE + markdown, "test.md");
  const m = /^<p>([\s\S]*)<\/p>$/.exec(html.trim());
  if (!m) throw new Error(`not a single paragraph: ${html}`);
  return m[1] ?? "";
}

const escapeHtml = (s: string) => s.replaceAll("&", "&#x26;").replaceAll("<", "&#x3C;");

describe("text directives are restored to the exact source text", () => {
  test.each([
    ["a region string", "chr2:166,014,902"],
    ["a region range", "chr2:166,014,902-166,040,122"],
    ["a SAM tag", "SA:Z:chr2,166040123,+,75S75M,60,0;"],
    ["a FORMAT string", "GT:AD:DP:GQ:PL"],
    ["an HGVS name", "NM_000546.6:c.215C>G"],
    ["an assembly-qualified contig", "GRCh38:chr17"],
    ["a label and attributes", "x:name[label]{a=b}"],
  ])("%s: %s", async (_label, token) => {
    expect(await paragraph(`Before ${token} after.`)).toBe(`Before ${escapeHtml(token)} after.`);
  });

  test("a label with inline code keeps its code element", async () => {
    expect(await paragraph("See x:tag[`code`]{k=v} here.")).toBe("See x:tag[<code>code</code>]{k=v} here.");
  });

  test("tokens that are plain text stay text", async () => {
    expect(await paragraph("A <NON_REF> block, a <*> allele, {A,C,G,T} and MAPQ <20.")).toBe(
      "A &#x3C;NON_REF> block, a &#x3C;*> allele, {A,C,G,T} and MAPQ &#x3C;20.",
    );
  });
});

describe("raw HTML", () => {
  test.each(["<DEL>", "<INV>", "<DUP>"])("%s in prose fails with the documented error", async (token) => {
    await expect(compileLesson(`${PAGE}A deletion ${token} here.\n`, "test.md")).rejects.toThrow(
      RAW_HTML_MESSAGE,
    );
  });

  test("the error carries file, line and column", async () => {
    const err = await compileLesson(`${PAGE}Line one.\n\nA ${"<INV>"} here.\n`, "lesson.md").catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ file: "lesson.md", line: 9, column: 3 });
  });

  test.each(["`<DEL>`", "`<INV>`", "`<DUP:TANDEM>`"])("%s in backticks is code", async (token) => {
    const inner = token.slice(1, -1).replace("<", "&#x3C;");
    expect(await paragraph(`A deletion ${token} here.`)).toBe(`A deletion <code>${inner}</code> here.`);
  });

  test("a symbolic allele that CommonMark reads as an autolink fails", async () => {
    await expect(compileLesson(`${PAGE}A <DUP:TANDEM> call.\n`, "test.md")).rejects.toThrow(
      /wrap it in backticks/,
    );
  });

  test("a block-level HTML element fails", async () => {
    await expect(compileLesson(`${PAGE}<kbd>Ctrl</kbd>\n`, "test.md")).rejects.toThrow(RAW_HTML_MESSAGE);
  });

  test("source comments are stripped and collected", async () => {
    const page = await compileLesson(
      `${PAGE}A claim. <!-- src: SAMv1 section 1.4 -->\n\n<!-- src: VCFv4.5 section 5 -->\n\nMore.\n`,
      "test.md",
    );
    expect(page.html).not.toContain("<!--");
    expect(page.html).not.toContain("src:");
    expect(page.sources).toEqual([
      { text: "SAMv1 section 1.4", line: 7 },
      { text: "VCFv4.5 section 5", line: 9 },
    ]);
  });
});

describe("lessons", () => {
  const body = [
    "Intro.",
    "",
    "## First section",
    "",
    "Text with a [link to the recap](#recap).",
    "",
    '::predict{exercise="test-lesson/guess"}',
    "",
    "## Try it: step the ruler",
    "",
    '::simulator{exercise="test-lesson/sim"}',
    "",
    ':::read-more{title="Deeper"}',
    "Optional detail.",
    "",
    '::predict{exercise="test-lesson/extra"}',
    ":::",
    "",
    "## Recap",
    "",
    ":::recap",
    "- **One.** Two.",
    ":::",
    "",
  ].join("\n");

  test("compiles frontmatter, TOC, widgets and links", async () => {
    const page = await compileLesson(LESSON_FM + body, "lesson.md", { registry });
    expect(page.meta).toMatchObject({ kind: "lesson", id: "test-lesson", minutes: 9 });
    expect(page.toc).toEqual([
      { id: "first-section", text: "First section" },
      { id: "try-it-step-the-ruler", text: "Try it: step the ruler" },
      { id: "recap", text: "Recap" },
    ]);
    expect(page.widgets.map((w) => [w.directive, w.ref, w.mode, w.optional])).toEqual([
      ["predict", "test-lesson/guess", "quick-check", false],
      ["simulator", "test-lesson/sim", "try-it", false],
      ["predict", "test-lesson/extra", "quick-check", true],
    ]);
    expect(page.links).toEqual([{ href: "#/lesson/test-lesson/recap", line: 17, column: 13 }]);
    expect(page.html).toContain('<a href="#/lesson/test-lesson/recap">');
    expect(page.html).toContain(
      '<gf-predict exercise="test-lesson/guess" id="test-lesson--guess" data-mode="quick-check"><h3 class="quick-check-title" id="guess-the-base">Guess the base</h3></gf-predict>',
    );
    expect(page.html).toContain(
      '<gf-simulator exercise="test-lesson/sim" id="test-lesson--sim" data-mode="try-it" data-labelledby="try-it-step-the-ruler"></gf-simulator>',
    );
    expect(page.html).toContain('<details class="disclosure disclosure-read-more">');
  });

  test("unknown exercise ids fail at build time", async () => {
    const source = LESSON_FM + body.replace('exercise="test-lesson/sim"', 'exercise="test-lesson/simm"');
    await expect(compileLesson(source, "lesson.md", { registry })).rejects.toThrow(
      'Unknown simulator id "test-lesson/simm" in ::simulator.',
    );
  });

  test("a directive whose id has another kind fails", async () => {
    const source =
      LESSON_FM +
      body.replace('::simulator{exercise="test-lesson/sim"}', '::simulator{exercise="test-lesson/guess"}');
    await expect(compileLesson(source, "lesson.md", { registry })).rejects.toThrow(
      /is a predict, but ::simulator/,
    );
  });

  test("an exercise can appear only once per page", async () => {
    const source = LESSON_FM + body.replace('exercise="test-lesson/extra"', 'exercise="test-lesson/guess"');
    await expect(compileLesson(source, "lesson.md", { registry })).rejects.toThrow(/appears twice/);
  });

  test("unknown directives fail", async () => {
    const source = LESSON_FM + body.replace("::predict{", "::predcit{");
    await expect(compileLesson(source, "lesson.md", { registry })).rejects.toThrow(
      'Unknown directive "::predcit"',
    );
  });

  test("a lesson must end with a Recap H2", async () => {
    await expect(
      compileLesson(
        LESSON_FM + body.replace("## Recap", "## Summary").replace("(#recap)", "(#first-section)"),
        "lesson.md",
        { registry },
      ),
    ).rejects.toThrow('last H2 must be "Recap"');
  });

  test("bare anchors must resolve on the page", async () => {
    await expect(
      compileLesson(LESSON_FM + body.replace("(#recap)", "(#recapp)"), "lesson.md", { registry }),
    ).rejects.toThrow('Link "#recapp" does not match');
  });

  test("frontmatter is validated per kind", async () => {
    await expect(
      compileLesson(LESSON_FM.replace("minutes: 9", "minutes: 15") + body, "lesson.md"),
    ).rejects.toThrow(/minutes/);
    await expect(
      compileLesson(LESSON_FM.replace("specs: []", "spec: []") + body, "lesson.md"),
    ).rejects.toThrow('Unknown frontmatter key "spec"');
  });

  test(":::unverified fails only in release builds", async () => {
    const source = LESSON_FM + body.replace("Intro.", ':::unverified{ref="V-06"}\nClaim.\n:::');
    await expect(compileLesson(source, "lesson.md", { registry })).resolves.toBeTruthy();
    await expect(compileLesson(source, "lesson.md", { registry, release: true })).rejects.toThrow(
      /release build/,
    );
  });
});
