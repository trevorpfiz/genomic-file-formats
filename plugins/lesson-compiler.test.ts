// Compiler unit tests (docs/PLAN.md 11.1, 11.6): text-directive round trips, the raw-HTML
// policy, frontmatter schemas per kind, every directive's HTML (the contract documented in
// docs/ARCHITECTURE.md), the Try-it/Quick-check rule, the TOC, quiz pages and build errors.
import { describe, expect, test } from "vite-plus/test";
import { compileLesson, RAW_HTML_MESSAGE, routeOf, type RegistryEntry } from "./lesson-compiler.ts";

const PAGE = "---\nkind: page\nid: test-page\ntitle: Test page\n---\n\n";
const LESSON_FM = [
  "---",
  "kind: lesson",
  "id: test-lesson",
  "section: sequences",
  "title: Test lesson",
  "minutes: 9",
  "objectives: [LO1]",
  "introduces: [test.concept]",
  "requires: []",
  'caseBeat: "test"',
  "specs: []",
  "---",
  "",
].join("\n");
const QUIZ_FM = "---\nkind: quiz\nid: quiz-sequences\nsection: sequences\ntitle: Section quiz\n---\n\n";
const RECAP = "\n## Recap\n\n:::recap\n- **One.** Two.\n:::\n";

const registry = new Map<string, RegistryEntry>([
  ["test-lesson/guess", { kind: "predict", title: "Guess the base" }],
  ["test-lesson/sim", { kind: "simulator", title: "Step the ruler" }],
  ["test-lesson/extra", { kind: "predict", title: "An optional extra" }],
  ["test-lesson/pick", { kind: "mcq", title: "Pick one" }],
  ["test-lesson/toy-fa", { kind: "snippet", title: "toy.fa" }],
  ["other-lesson/guess", { kind: "predict", title: "Elsewhere" }],
  ["sequences", { kind: "quiz", title: "Section quiz: Sequences" }],
]);

/** Compile one paragraph as a page and return the inner HTML of its <p>. */
async function paragraph(markdown: string): Promise<string> {
  const { html } = await compileLesson(PAGE + markdown, "test.md");
  const m = /^<p>([\s\S]*)<\/p>$/.exec(html.trim());
  if (!m) throw new Error(`not a single paragraph: ${html}`);
  return m[1] ?? "";
}

/** Compile a lesson body (a Recap is appended unless the body has one). */
const lesson = (body: string, options: { release?: boolean; sections?: ReadonlySet<string> } = {}) =>
  compileLesson(LESSON_FM + body + (body.includes("## Recap") ? "" : RECAP), "lesson.md", {
    registry,
    ...options,
  });

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

describe("frontmatter, per kind", () => {
  test("a lesson's meta and route", async () => {
    const page = await lesson("Intro.\n");
    expect(page.meta).toMatchObject({ kind: "lesson", id: "test-lesson", minutes: 9 });
    expect(page.route).toBe("#/lesson/test-lesson");
  });

  test.each([
    ["minutes out of range", LESSON_FM.replace("minutes: 9", "minutes: 15"), /minutes/],
    ["an unknown key", LESSON_FM.replace("specs: []", "spec: []"), 'Unknown frontmatter key "spec"'],
    ["a missing key", LESSON_FM.replace('caseBeat: "test"\n', ""), 'missing "caseBeat"'],
    ["an unknown objective", LESSON_FM.replace("[LO1]", "[LO9]"), /Unknown objective "LO9"/],
    ["a malformed concept id", LESSON_FM.replace("[test.concept]", "[TestConcept]"), /area.name/],
    ["a non-slug id", LESSON_FM.replace("id: test-lesson", "id: Test Lesson"), /lowercase slug/],
    ["a wrong type", LESSON_FM.replace("objectives: [LO1]", "objectives: LO1"), /must be a string\[\]/],
  ])("%s fails", async (_label, frontmatter, message) => {
    await expect(compileLesson(frontmatter + RECAP, "lesson.md")).rejects.toThrow(message);
  });

  test("a section must be listed when the course's sections are given", async () => {
    await expect(lesson("Intro.\n", { sections: new Set(["foundations"]) })).rejects.toThrow(
      'Unknown section "sequences"',
    );
    await expect(lesson("Intro.\n", { sections: new Set(["sequences"]) })).resolves.toBeTruthy();
  });

  test("a quiz page's id is quiz-<section>", async () => {
    const wrong = QUIZ_FM.replace("id: quiz-sequences", "id: sequences-quiz");
    await expect(
      compileLesson(`${wrong}::quiz{section="sequences"}\n`, "q.md", { registry }),
    ).rejects.toThrow('must be "quiz-sequences"');
  });

  test("routes per kind (D-22)", () => {
    expect(routeOf({ kind: "page", id: "home", title: "x" })).toBe("#/");
    expect(routeOf({ kind: "page", id: "about", title: "x" })).toBe("#/about");
    expect(routeOf({ kind: "capstone", id: "capstone", title: "x" })).toBe("#/capstone");
    expect(routeOf({ kind: "quiz", id: "quiz-sequences", section: "sequences", title: "x" })).toBe(
      "#/quiz/sequences",
    );
  });
});

describe("exercise directives: Try it versus Quick check", () => {
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
    ':::read-more{title="Optional practice: one more"}',
    "Optional detail.",
    "",
    '::predict{exercise="test-lesson/extra"}',
    ":::",
    RECAP,
  ].join("\n");

  test("TOC, widget modes and links", async () => {
    const page = await lesson(body);
    expect(page.toc).toEqual([
      { id: "first-section", text: "First section" },
      { id: "try-it-step-the-ruler", text: "Try it: step the ruler", exercise: "test-lesson/sim" },
      { id: "recap", text: "Recap" },
    ]);
    expect(page.widgets.map((w) => [w.directive, w.ref, w.mode, w.optional])).toEqual([
      ["predict", "test-lesson/guess", "quick-check", false],
      ["simulator", "test-lesson/sim", "try-it", false],
      ["predict", "test-lesson/extra", "optional", true],
    ]);
    expect(page.links).toEqual([{ href: "#/lesson/test-lesson/recap", line: 17, column: 13 }]);
    expect(page.html).toContain('<a href="#/lesson/test-lesson/recap">');
  });

  test("a Quick check carries an H3 with the exercise title", async () => {
    expect((await lesson(body)).html).toContain(
      '<gf-predict exercise="test-lesson/guess" id="test-lesson--guess" data-mode="quick-check"><h3 class="quick-check-title" id="guess-the-base">Guess the base</h3></gf-predict>',
    );
  });

  test("a Try it card renders no heading and is labelled by its H2", async () => {
    expect((await lesson(body)).html).toContain(
      '<h2 id="try-it-step-the-ruler">Try it: step the ruler</h2>\n<gf-simulator exercise="test-lesson/sim" id="test-lesson--sim" data-mode="try-it" data-labelledby="try-it-step-the-ruler"></gf-simulator>',
    );
  });

  test("an exercise inside :::read-more is optional, with a title that is not a heading", async () => {
    const page = await lesson(body);
    expect(page.html).toContain(
      '<gf-predict exercise="test-lesson/extra" id="test-lesson--extra" data-mode="optional" data-optional=""><p class="exercise-title" id="test-lesson--extra-title">An optional extra</p></gf-predict>',
    );
    expect(page.headings).not.toContain("an-optional-extra");
  });

  test.each([
    [
      "an unknown exercise id",
      'exercise="test-lesson/sim"',
      'exercise="test-lesson/simm"',
      'Unknown simulator id "test-lesson/simm" in ::simulator.',
    ],
    [
      "an id of another kind",
      '::simulator{exercise="test-lesson/sim"}',
      '::simulator{exercise="test-lesson/pick"}',
      /is a mcq, but ::simulator needs a simulator/,
    ],
    [
      "an id from another lesson",
      'exercise="test-lesson/guess"',
      'exercise="other-lesson/guess"',
      /belongs to another lesson/,
    ],
    [
      "an exercise used twice",
      'exercise="test-lesson/extra"',
      'exercise="test-lesson/guess"',
      /appears twice/,
    ],
    ["an unknown directive", "::predict{", "::predcit{", 'Unknown directive "::predcit"'],
    [
      "an unknown attribute",
      '::predict{exercise="test-lesson/guess"}',
      '::predict{exercise="test-lesson/guess" mode="x"}',
      /does not take a "mode" attribute/,
    ],
    ["a missing id", '::predict{exercise="test-lesson/guess"}', "::predict", /needs exercise="..."/],
    [
      "a directive label",
      '::predict{exercise="test-lesson/guess"}',
      '::predict[Label]{exercise="test-lesson/guess"}',
      /does not take a \[label\]/,
    ],
  ])("%s fails", async (_label, from, to, message) => {
    await expect(lesson(body.replace(from, to))).rejects.toThrow(message);
  });

  test('a "Try it:" H2 must be followed directly by its exercise', async () => {
    await expect(
      lesson(body.replace("## Try it: step the ruler\n", "## Try it: step the ruler\n\nText.\n")),
    ).rejects.toThrow(/must be followed directly by its exercise/);
  });

  test("a lesson has at most two Try it H2s", async () => {
    const three = [1, 2, 3]
      .map(
        (n) =>
          `## Try it: number ${n}\n\n::${n === 1 ? 'predict{exercise="test-lesson/guess"}' : n === 2 ? 'simulator{exercise="test-lesson/sim"}' : 'mcq{exercise="test-lesson/pick"}'}\n`,
      )
      .join("\n");
    await expect(lesson(three)).rejects.toThrow(/at most two "Try it:" H2s/);
  });

  test("exercises cannot sit inside callouts or lists", async () => {
    await expect(lesson(':::note\n::predict{exercise="test-lesson/guess"}\n:::\n')).rejects.toThrow(
      /not inside :::note/,
    );
    await expect(lesson('- item\n\n  ::predict{exercise="test-lesson/guess"}\n')).rejects.toThrow(
      /cannot sit inside a list/,
    );
  });

  test("exercises belong to lessons only", async () => {
    await expect(
      compileLesson(`${PAGE}::predict{exercise="test-lesson/guess"}\n`, "p.md", { registry }),
    ).rejects.toThrow(/not allowed in a page page/);
  });
});

describe("other leaf directives", () => {
  test("::snippet and ::pipeline-map", async () => {
    const page = await lesson(
      '::snippet{id="test-lesson/toy-fa"}\n\n::pipeline-map{highlight="fasta,fastq"}\n',
    );
    expect(page.html).toContain('<gf-snippet snippet="test-lesson/toy-fa"></gf-snippet>');
    expect(page.html).toContain('<gf-pipeline-map highlight="fasta,fastq"></gf-pipeline-map>');
    expect(page.widgets.map((w) => w.mode)).toEqual(["inline", "inline"]);
  });

  test("an unknown pipeline node fails", async () => {
    await expect(lesson('::pipeline-map{highlight="fasta,bam"}\n')).rejects.toThrow(
      'Unknown pipeline node "bam"',
    );
  });

  test("a snippet id must be a snippet", async () => {
    await expect(lesson('::snippet{id="test-lesson/guess"}\n')).rejects.toThrow(
      /is a predict, but ::snippet/,
    );
  });
});

describe("quiz pages", () => {
  test("compile to the gf-quiz element at #/quiz/<section>", async () => {
    const page = await compileLesson(`${QUIZ_FM}Intro.\n\n::quiz{section="sequences"}\n`, "q.md", {
      registry,
    });
    expect(page.route).toBe("#/quiz/sequences");
    expect(page.html).toContain('<gf-quiz section="sequences" id="quiz-sequences"></gf-quiz>');
  });

  test.each([
    ["no ::quiz", "Intro.\n", /exactly one ::quiz/],
    ["another section's quiz", '::quiz{section="regions"}\n', /Unknown quiz id "regions"/],
  ])("%s fails", async (_label, body, message) => {
    await expect(compileLesson(QUIZ_FM + body, "q.md", { registry })).rejects.toThrow(message);
  });

  test("::quiz belongs on quiz pages", async () => {
    await expect(lesson('::quiz{section="sequences"}\n')).rejects.toThrow(/not allowed in a lesson page/);
  });
});

describe("containers", () => {
  test("read-more, spec-detail and why-it-matters are disclosures", async () => {
    const page = await lesson(
      ':::read-more{title="Why 33?"}\nText.\n:::\n\n:::spec-detail{title="SAMv1 §1.4"}\nRule.\n:::\n\n:::why-it-matters{title="Dosage"}\nWhy.\n:::\n',
    );
    expect(page.html).toContain(
      '<details class="disclosure disclosure-read-more" data-container="read-more"><summary class="disclosure-summary"><span class="gf-icon disclosure-icon" data-icon="book-open" aria-hidden="true"></span><span class="disclosure-text"><span class="disclosure-overline">Read more<span class="visually-hidden">:</span></span> <span class="disclosure-title">Why 33?</span></span><span class="gf-icon disclosure-chevron" data-icon="chevron-down" aria-hidden="true"></span></summary><div class="disclosure-body"><p>Text.</p></div></details>',
    );
    expect(page.html).toContain('data-icon="scroll-text"');
    expect(page.html).toContain('<details class="disclosure disclosure-why-it-matters"');
  });

  test("callouts are notes with an icon and an overline; a [label] becomes the title", async () => {
    const page = await lesson(":::tip\nShort.\n:::\n\n:::watch-out[Off by one]\nCareful.\n:::\n");
    expect(page.html).toContain(
      '<div class="callout callout-tip" role="note" data-container="tip"><p class="callout-label"><span class="gf-icon" data-icon="lightbulb" aria-hidden="true"></span><span class="callout-overline">Tip</span></p><div class="callout-body"><p>Short.</p></div></div>',
    );
    expect(page.html).toContain(
      '<p class="callout-label"><span class="callout-label-lead"><span class="gf-icon" data-icon="triangle-alert" aria-hidden="true"></span><span class="callout-overline">Watch out</span></span> <span class="callout-title">Off by one</span></p>',
    );
  });

  test("from-the-spec ends with its citation", async () => {
    const page = await lesson(':::from-the-spec{cite="SAMv1 §1.4"}\nQuote.\n:::\n');
    expect(page.html).toContain(
      '<div class="callout-body"><p>Quote.</p></div><p class="callout-cite">SAMv1 §1.4</p></div>',
    );
  });

  test("case-file shows the step in presentation order", async () => {
    const page = await lesson(':::case-file{step="2"}\nStory.\n:::\n');
    expect(page.html).toContain(
      '<div class="callout callout-case-file" role="note" data-container="case-file" data-step="2"><p class="callout-label"><span class="gf-icon" data-icon="folder-open" aria-hidden="true"></span><span class="callout-overline">Case file</span><span class="case-pedigree" data-pedigree="trio"></span></p><p class="case-step">Case step 2 of 5 · Exome reanalysis</p>',
    );
    await expect(lesson(':::case-file{step="6"}\nStory.\n:::\n')).rejects.toThrow(/step="1" to step="5"/);
  });

  test("at-a-glance becomes a definition list with the four pipeline rows", async () => {
    const card = [
      ':::at-a-glance{format="fasta"}',
      "- **Extensions:** `.fa`, `.fasta`",
      '- **Answers:** "Compared with what?"',
      "- **Keeps:** one strand's bases, with names",
      "- **Drops:** qualities",
      "- **Next file:** FASTQ",
      ":::",
    ].join("\n");
    const page = await lesson(`## Recap\n\n:::recap\n- **One.** Two.\n:::\n\n${card}\n`);
    expect(page.html).toContain(
      '<div class="at-a-glance" data-container="at-a-glance" data-format="fasta" role="group" aria-labelledby="at-a-glance-fasta"><p class="at-a-glance-title" id="at-a-glance-fasta"><span class="gf-icon" data-icon="file-text" aria-hidden="true"></span>At a glance: FASTA</p><dl class="at-a-glance-rows"><div class="at-a-glance-row" data-row="extensions"><dt>Extensions</dt><dd><code>.fa</code>, <code>.fasta</code></dd></div>',
    );
    expect(page.html).toContain(
      '<div class="at-a-glance-row" data-row="next-file"><dt>Next file</dt><dd>FASTQ</dd></div>',
    );
    await expect(
      lesson(`## Recap\n\n:::recap\n- x\n:::\n\n${card.replace("- **Drops:** qualities\n", "")}\n`),
    ).rejects.toThrow(/needs a "Drops:" row/);
    await expect(
      lesson(`## Recap\n\n:::recap\n- x\n:::\n\n${card.replace("Keeps:", "Holds:")}\n`),
    ).rejects.toThrow(/Each At-a-glance row/);
    await expect(
      lesson(`## Recap\n\n:::recap\n- x\n:::\n\n${card.replace('"fasta"', '"fsta"')}\n`),
    ).rejects.toThrow('Unknown format "fsta"');
  });

  test("several formats and a title override", async () => {
    const page = await lesson(
      '## Recap\n\n:::recap\n- x\n:::\n\n:::at-a-glance{format="fai,gzi,bgzf"}\n- **Answers:** a\n- **Keeps:** b\n- **Drops:** c\n- **Next file:** d\n:::\n',
    );
    expect(page.html).toContain('data-format="fai,gzi,bgzf"');
    expect(page.html).toContain("At a glance: .fai, .gzi, BGZF</p>");
  });

  test("recap: exactly one, under the Recap heading", async () => {
    await expect(lesson(":::recap\n- x\n:::\n")).rejects.toThrow(/goes under the "## Recap" heading/);
    await expect(
      compileLesson(`${LESSON_FM}## Recap\n\nNo block.\n`, "lesson.md", { registry }),
    ).rejects.toThrow(/exactly one :::recap/);
    await expect(
      compileLesson(`${LESSON_FM}## Summary\n\n:::recap\n- x\n:::\n`, "lesson.md", { registry }),
    ).rejects.toThrow(/goes under the "## Recap" heading/);
  });

  test("a lesson's last H2 is Recap", async () => {
    await expect(lesson(`${RECAP}\n## After\n\nText.\n`)).rejects.toThrow('last H2 must be "Recap"');
  });

  test(":::unverified renders in dev builds and fails release builds", async () => {
    const body = ':::unverified{ref="V-06"}\nClaim.\n:::\n';
    expect((await lesson(body)).html).toContain(
      '<div class="unverified" data-container="unverified" data-ref="V-06"><p class="unverified-label">To be verified (V-06)</p><p>Claim.</p></div>',
    );
    await expect(lesson(body, { release: true })).rejects.toThrow(/release build/);
    await expect(lesson(':::unverified{ref="06"}\nClaim.\n:::\n')).rejects.toThrow(/ref="V-xx"/);
  });

  test.each([
    ["an unknown container", ":::sidebar\nx\n:::\n", 'Unknown container ":::sidebar"'],
    ["a missing attribute", ":::read-more\nx\n:::\n", /needs a title="..." attribute/],
    ["an unexpected attribute", ':::note{title="x"}\nx\n:::\n', /does not take a "title" attribute/],
    ["a label on a disclosure", ':::read-more[x]{title="y"}\nz\n:::\n', /does not take a \[label\]/],
    [
      "an H2 inside a container",
      ':::read-more{title="x"}\n## Inside\n:::\n',
      /move this heading out of :::read-more/,
    ],
  ])("%s fails", async (_label, body, message) => {
    await expect(lesson(body)).rejects.toThrow(message);
  });
});

describe("blocks and links", () => {
  test("tables scroll in a labelled, focusable region", async () => {
    const page = await lesson("| Part | Meaning |\n|---|---|\n| `>` | header |\n");
    expect(page.html).toContain(
      '<div class="table-scroll" role="region" tabindex="0" aria-label="Table: Part, Meaning"><table>',
    );
  });

  test("code blocks are wrapped, with an optional title", async () => {
    const page = await lesson('```sh title="Shell"\nsamtools faidx ref.fa\n```\n');
    expect(page.html).toContain(
      '<div class="code-block" data-lang="sh"><p class="code-block-title">Shell</p><pre><code class="language-sh">samtools faidx ref.fa\n</code></pre></div>',
    );
  });

  test("bare anchors must resolve on the page", async () => {
    await expect(lesson("See [x](#recapp).\n")).rejects.toThrow('Link "#recapp" does not match');
  });

  test("relative file links fail", async () => {
    await expect(lesson("See [x](other.md).\n")).rejects.toThrow(/would break in the single-file build/);
  });

  test("an H1 fails", async () => {
    await expect(lesson("# Title\n")).rejects.toThrow(/Do not use a # heading/);
  });

  test("duplicate headings fail", async () => {
    await expect(lesson("## Same\n\n## Same\n")).rejects.toThrow(/Duplicate heading/);
  });
});
