// Content lint (docs/PLAN.md 11.6, 12.6; D-05, D-06; section 5 conventions) and the minutes
// model (scripts/minutes-lint.ts). Real lessons are judged once written (a stub has no graded
// interaction); the style lint applies to every content file and to all exercise and quiz data.
// The second half proves each rule bites on a small synthetic lesson.
import { globSync, readFileSync } from "node:fs";
import type { Nodes } from "mdast";
import { describe, expect, test } from "vite-plus/test";
import { pages as manifest, sections as courseSections } from "../content/course.ts";
import {
  analyzeAll,
  analyzeLesson,
  countWords,
  exerciseMinutes,
  lintMinutes,
  PROSE_CAP,
  proseCap,
  type Analysis,
} from "../scripts/minutes-lint.ts";
import { exercises, quizzes } from "../src/exercises/registry.ts";
import type { Exercise, Quiz, QuizVariant } from "../src/exercises/types.ts";
import { GENERATOR_SEEDS, seededRng } from "../src/validators/keys.ts";

// ---------------------------------------------------------------------------------------------
// Rules

/** Lessons that open a section with the narrative pipeline map (docs/PLAN.md 5; D-04). */
const OPENERS = new Set(
  courseSections
    .filter((s) => s.id !== "foundations" && s.id !== "capstone-and-conclusion")
    .map((s) => manifest.find((p) => p.kind === "lesson" && p.section === s.id)?.id)
    .filter((id): id is string => !!id),
);
/** Lessons whose Recap has an At-a-glance card, and the formats it names (section 5 Recaps). */
const AT_A_GLANCE: Readonly<Record<string, readonly string[]>> = {
  "fasta-reference": ["fasta"],
  "random-access": ["fai", "gzi", "bgzf"],
  "fastq-reads": ["fastq"],
  "bed-targets": ["bed"],
  "sam-records": ["sam"],
  "bam-cram": ["bam", "cram"],
  "wig-coverage": ["wig", "bedgraph"],
  "vcf-records": ["vcf"],
  "gvcf-blocks": ["gvcf"],
  "gene-models": ["gtf", "gff3"],
  "bedpe-breakpoints": ["bedpe"],
  "paf-long-reads": ["paf"],
  "gfa-graphs": ["gfa"],
};
const LIMITS = {
  firstWithin: 300,
  between: 450,
  afterLast: 300,
  minGraded: 3,
  maxGraded: 5,
  maxRun: 2,
} as const;

const isPractice = (title = "") => title.startsWith("Optional practice");

interface Findings {
  errors: string[];
  warnings: string[];
}

/** Word budgets and placement for a written lesson (11.6; D-05, D-06; section 5). */
function structureFindings(a: Analysis): Findings {
  const errors: string[] = [];
  const warnings: string[] = [];
  const at = (line: number) => `${a.file}:${line}`;
  const recapIndex = a.sections.findIndex((s) => s.recap);
  const content = a.sections.map((s, i) => ({ s, i })).filter(({ s }) => s.heading !== null && !s.recap);
  const firstContent = content[0]?.i ?? -1;

  // D-06: 3-5 graded interactions, one or two of them under "Try it:" H2s.
  if (a.graded.length < LIMITS.minGraded || a.graded.length > LIMITS.maxGraded)
    errors.push(
      `${a.file}: ${a.graded.length} graded interactions; a lesson has ${LIMITS.minGraded}-${LIMITS.maxGraded}`,
    );
  if (!a.sections.some((s) => s.tryIt)) errors.push(`${a.file}: no "Try it:" H2`);

  // D-05: the 600-word ceiling, raised to the 8-minute floor when the interactions are short.
  const cap = proseCap(a);
  if (a.proseWords > cap)
    errors.push(`${a.file}: ${a.proseWords} prose words outside Read-more; the cap is ${cap}`);
  else if (a.proseWords > PROSE_CAP)
    warnings.push(
      `${a.file}: ${a.proseWords} prose words, over ${PROSE_CAP} but within the 8-minute floor (${cap})`,
    );

  // Spacing of graded interactions.
  const first = a.graded[0];
  if (first && first.wordsBefore > LIMITS.firstWithin && first.section !== firstContent)
    errors.push(
      `${a.file}: ${first.wordsBefore} words before the first graded interaction, which is not in the first content H2`,
    );
  for (const g of a.graded.slice(1))
    if (g.wordsBefore > LIMITS.between)
      errors.push(`${a.file}: ${g.wordsBefore} prose words before ${g.ref} (at most ${LIMITS.between})`);
  let after = 0;
  let seen = false;
  a.sections.forEach((s, si) => {
    if (recapIndex >= 0 && si >= recapIndex) return;
    for (const b of s.blocks) {
      if (b.kind === "exercise") {
        after = 0;
        seen = true;
      } else if (seen) after += b.words;
    }
  });
  if (after > LIMITS.afterLast)
    errors.push(`${a.file}: ${after} prose words between the last graded interaction and the Recap`);

  // An interaction in every content H2 except at most one concept-primer section.
  const bare = content.filter(({ s }) => !s.blocks.some((b) => b.kind === "exercise"));
  if (bare.length > 1)
    errors.push(
      `${a.file}: ${bare.length} content H2s without a graded interaction (${bare.map(({ s }) => `"${s.heading}"`).join(", ")}); at most one`,
    );

  // Read-more cards.
  const beforeRecap = recapIndex > 0 ? a.sections[recapIndex - 1]?.blocks.at(-1) : undefined;
  if (beforeRecap?.kind === "disclosure" && beforeRecap.name === "read-more")
    errors.push(`${at(beforeRecap.line)}: a Read-more card is the last block before the Recap`);
  for (const s of a.sections) {
    let run = 0;
    let gradedSoFar = false;
    s.blocks.forEach((b, i) => {
      const readMore = b.kind === "disclosure" && b.name === "read-more";
      run = readMore ? run + 1 : 0;
      if (run > LIMITS.maxRun)
        errors.push(`${at(b.line)}: more than ${LIMITS.maxRun} Read-more cards in a row`);
      if (b.kind === "exercise") gradedSoFar = true;
      if (!readMore) return;
      const practice = isPractice(b.title);
      if (practice && !b.exercises?.length)
        errors.push(`${at(b.line)}: an "Optional practice" card holds no exercise`);
      if (!practice && b.exercises?.length)
        errors.push(
          `${at(b.line)}: a Read-more card with an exercise must be titled "Optional practice: ..."`,
        );
      if (practice) return;
      const prev = s.blocks[i - 1];
      if (!prev || !(prev.kind === "prose" || (prev.kind === "disclosure" && prev.name === "read-more")))
        errors.push(`${at(b.line)}: a Read-more card sits directly after the paragraph it deepens`);
      if (!s.tryIt && gradedSoFar)
        errors.push(`${at(b.line)}: a Read-more card comes before its section's exercises`);
    });
  }

  // Section openers: the pipeline map in the opening section (D-04).
  if (OPENERS.has(a.id)) {
    const opening = a.sections.filter((s) => !s.recap).slice(0, a.sections[0]?.heading === null ? 2 : 1);
    if (!opening.some((s) => s.blocks.some((b) => b.name === "pipeline-map")))
      errors.push(`${a.file}: a section's first lesson opens with ::pipeline-map`);
  }

  // Recap: 3-4 bold lead-ins, a "Next:" line, and an At-a-glance card for a new format.
  const recap = a.sections[recapIndex];
  if (recap) {
    const recapNode = findContainer(a, "recap");
    const list = recapNode?.children.find((c) => c.type === "list");
    const items = list?.type === "list" ? list.children : [];
    if (items.length < 3 || items.length > 4)
      errors.push(`${a.file}: the Recap has ${items.length} bullets; it has 3-4`);
    for (const item of items) {
      const lead = item.children[0]?.type === "paragraph" ? item.children[0].children[0] : undefined;
      if (lead?.type !== "strong")
        errors.push(`${at(item.position?.start.line ?? 0)}: a Recap bullet starts with a bold lead-in`);
    }
    const recapText = a.source.split("\n").slice(recap.line).join("\n");
    if (!/^\s*(?:\*\*)?Next:/m.test(recapText))
      errors.push(`${a.file}: the Recap ends with a one-line "Next:" hook`);
    const formats = AT_A_GLANCE[a.id];
    if (formats) {
      const glance = findContainer(a, "at-a-glance");
      const declared = (glance?.attributes?.format ?? "").split(",").map((f) => f.trim());
      for (const f of formats)
        if (!declared.includes(f))
          errors.push(`${a.file}: the Recap's At-a-glance card names ${f} (format="${formats.join(",")}")`);
    }
  }
  return { errors, warnings };
}

function findContainer(
  a: Analysis,
  name: string,
): Extract<Nodes, { type: "containerDirective" }> | undefined {
  let found: Extract<Nodes, { type: "containerDirective" }> | undefined;
  const walk = (n: Nodes) => {
    if (found) return;
    if (n.type === "containerDirective" && n.name === name) found = n;
    else if ("children" in n) for (const c of n.children as Nodes[]) walk(c);
  };
  walk(a.root);
  return found;
}

// 12.6 style.
const GLYPHS = /[✓✔✗✘→≤≥≈¹²³⁰-₟]|\p{Extended_Pictographic}/u;
const HYPE = /\b(?:simply|obviously|just)\b/i;
const GENES = /\bSCN[19]A\b/;
const BARE_BIG_NUMBER = /(?<![\w.,:/-])\d{5,}(?![\w,])/;
const SENTENCE_MAX = 40;
const SENTENCE_AVERAGE = 22;
const outsideCode = (s: string) => s.replace(/`[^`]*`/g, "");

/** Sentences of a paragraph text (inline code is already one word). */
const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9"'(*[])/)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);

/** Prose style of one content file: glyphs, hype words, exclamation marks, genes, numbers, sentences. */
function styleFindings(a: Pick<Analysis, "file" | "source" | "root" | "sentences">): string[] {
  const out: string[] = [];
  a.source.split("\n").forEach((line, i) => {
    const m = GLYPHS.exec(line);
    if (m)
      out.push(
        `${a.file}:${i + 1}: "${m[0]}" (U+${m[0].codePointAt(0)!.toString(16).toUpperCase()}) is not allowed; use words or a Lucide icon`,
      );
  });
  const walk = (n: Nodes, italic: boolean) => {
    if (n.type === "code" || n.type === "inlineCode" || n.type === "html" || n.type === "yaml") return;
    if (n.type === "text") {
      const line = n.position?.start.line ?? 0;
      if (HYPE.test(n.value))
        out.push(`${a.file}:${line}: "${HYPE.exec(n.value)![0]}" (12.6: no "simply", "obviously" or "just")`);
      if (n.value.includes("!")) out.push(`${a.file}:${line}: an exclamation mark (12.6)`);
      if (!italic && GENES.test(n.value))
        out.push(`${a.file}:${line}: gene symbols are italic in prose (*${GENES.exec(n.value)![0]}*)`);
      const big = BARE_BIG_NUMBER.exec(n.value);
      if (big)
        out.push(
          `${a.file}:${line}: write ${big[0]} with thousands separators in prose, or put exact bytes in a code chip`,
        );
      return;
    }
    if ("children" in n) for (const c of n.children as Nodes[]) walk(c, italic || n.type === "emphasis");
  };
  walk(a.root, false);
  const sentences = a.sentences.flatMap((p) => sentencesOf(p.text).map((s) => ({ s, line: p.line })));
  for (const { s, line } of sentences)
    if (countWords(s) > SENTENCE_MAX)
      out.push(
        `${a.file}:${line}: a ${countWords(s)}-word sentence (at most ${SENTENCE_MAX}): "${s.slice(0, 60)}..."`,
      );
  const words = sentences.reduce((n, { s }) => n + countWords(s), 0);
  if (sentences.length && words / sentences.length > SENTENCE_AVERAGE)
    out.push(
      `${a.file}: sentences average ${(words / sentences.length).toFixed(1)} words (at most ${SENTENCE_AVERAGE})`,
    );
  return out;
}

/** Keys whose strings are file content or identifiers, not UI copy. */
const NOT_COPY = new Set([
  "id",
  "kind",
  "source",
  "check",
  "helper",
  "rule",
  "field",
  "filename",
  "format",
  "granularity",
  "solution",
  "verification",
  "tags",
  "formats",
  "concepts",
  "section",
  "tests",
  "bin",
  "simulator",
  "when",
  "textView",
  "label_",
]);
/** Feedback strings and their word limits (7; ux 8.3). */
const FEEDBACK: Readonly<Record<string, number>> = { explanation: 40, why: 40, note: 40, reveal: 40 };

/** UI copy in exercise and quiz data: glyphs, hype words, exclamation marks, feedback length. */
function dataFindings(value: unknown, where: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown, key: string, inOptions: boolean) => {
    if (typeof v === "string") {
      if (NOT_COPY.has(key) || key === "answer") return;
      if (GLYPHS.test(v)) out.push(`${where} ${key}: "${GLYPHS.exec(v)![0]}" is not allowed`);
      if (HYPE.test(outsideCode(v))) out.push(`${where} ${key}: "${HYPE.exec(outsideCode(v))![0]}" (12.6)`);
      if (outsideCode(v).includes("!")) out.push(`${where} ${key}: an exclamation mark (12.6)`);
      const limit =
        key === "explanation" && inOptions ? 30 : (FEEDBACK[key] ?? (key === "fineHere" ? 40 : undefined));
      if (limit !== undefined && countWords(v) > limit)
        out.push(`${where} ${key}: ${countWords(v)} words (at most ${limit}): "${v.slice(0, 50)}..."`);
      return;
    }
    if (typeof v !== "object" || v === null) return;
    if ("provenance" in v && "kind" in v) {
      // A Snippet: file content, except its caption, which is copy.
      const caption = (v as { caption?: unknown }).caption;
      if (typeof caption === "string") walk(caption, "caption", inOptions);
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, key, inOptions));
    else
      for (const [k, x] of Object.entries(v))
        walk(x, key === "fineHere" ? "fineHere" : k, inOptions || k === "options");
  };
  walk(value, "", false);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The real course

const analyses = analyzeAll();
const written = analyses.filter((a) => a.written);
const contentFiles = globSync(["content/**/*.md"]).sort();

test("the lint sees every lesson file", () => {
  expect(analyses.map((a) => a.file).sort()).toEqual(
    manifest
      .filter((p) => p.kind === "lesson" && p.status === "built")
      .map((p) => p.file)
      .sort(),
  );
});

describe.each(contentFiles)("%s style (12.6)", (file) => {
  test("no glyphs, hype words or exclamation marks; italic genes; separators; sentence length", () => {
    expect(styleFindings(analyzeLesson(readFileSync(file, "utf8"), file))).toEqual([]);
  });
});

if (!written.length) test("lesson structure: no lesson written yet (stubs pass vacuously)", () => {});
describe.each(written)("$file structure", (a) => {
  test("word budgets, interactions, Read-more placement, opener and Recap", () => {
    const { errors, warnings } = structureFindings(a);
    for (const w of warnings) console.warn(`content-lint: warning: ${w}`);
    expect(errors).toEqual([]);
  });
});

test("the minutes model keeps written lessons at 8-12 minutes and the course at 185-195 (D-05)", () => {
  const report = lintMinutes(analyses);
  for (const w of report.warnings) console.warn(`minutes-lint: warning: ${w}`);
  expect(report.errors).toEqual([]);
});

test("exercise and quiz data use plain copy and short feedback (12.6; ux 8.3)", () => {
  const items: [string, Exercise | Quiz][] = [
    ...Object.values(exercises).map((e) => [e.id, e] as [string, Exercise]),
    ...Object.values(quizzes).map((q) => [q.section, q] as [string, Quiz]),
  ];
  expect(items.flatMap(([where, v]) => dataFindings(v, where))).toEqual([]);
});

test("generated quiz variants use plain copy and short feedback too (a sample of seeds)", () => {
  const generated: [string, QuizVariant][] = Object.values(quizzes).flatMap((quiz) =>
    quiz.slots.flatMap((slot) =>
      slot.generator
        ? GENERATOR_SEEDS.slice(0, 8).map(
            (seed) =>
              [`${quiz.section} ${slot.id} seed ${seed}`, slot.generator!.generate(seededRng(seed))] as [
                string,
                QuizVariant,
              ],
          )
        : [],
    ),
  );
  expect(generated.length).toBeGreaterThan(0);
  expect(generated.flatMap(([where, v]) => dataFindings(v, where))).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// The rules bite (a synthetic lesson)

const mcq = (id: string): Exercise => ({
  id,
  kind: "mcq",
  title: id,
  prompt: "P",
  source: "s",
  tags: [],
  formats: ["fasta"],
  concepts: [],
  multi: false,
  stem: "S",
  options: [
    { id: "a", text: "A", correct: true, explanation: "Right." },
    { id: "b", text: "B", correct: false, explanation: "Wrong." },
  ],
});
const byId: Record<string, Exercise> = Object.fromEntries(
  ["x/a", "x/b", "x/c", "x/d"].map((id) => [id, mcq(id)]),
);
const words = (n: number, w = "word") =>
  `${Array.from({ length: n }, (_, i) => (i % 10 === 9 ? `${w}.` : w)).join(" ")}`;
const lesson = (body: string, id = "fasta-reference") =>
  analyzeLesson(`---\nkind: lesson\nid: ${id}\nminutes: 8\n---\n\n${body}`, "x.md", byId);
const RECAP = `## Recap\n\n:::recap\n\n- **One.** a\n- **Two.** b\n- **Three.** c\n\n:::\n\n:::at-a-glance{format="fasta"}\n- **Answers:** a\n:::\n\nNext: more.\n`;
const GOOD = [
  '## The reference\n\n::pipeline-map{highlight="fasta"}',
  `${words(100, "alpha")}\n\n:::read-more{title="Counts"}\n${words(500, "beta")}\n:::\n\n::mcq{exercise="x/a"}`,
  `## Try it: one\n\n::mcq{exercise="x/b"}\n\n${words(200, "gamma")}\n\n::mcq{exercise="x/c"}`,
  RECAP,
].join("\n\n");

describe("structure rules", () => {
  test("a sound lesson passes; Read-more text does not count", () => {
    const a = lesson(GOOD);
    // 100 + 200 words, plus the Recap's 10 (bullets, the At-a-glance row and "Next:").
    expect(a.proseWords).toBe(310);
    expect(structureFindings(a)).toEqual({ errors: [], warnings: [] });
  });

  test("the 600-word cap and the 8-minute floor (D-05)", () => {
    const over = lesson(GOOD.replace(words(200, "gamma"), `${words(200, "gamma")}\n\n${words(400)}`));
    expect(over.proseWords).toBe(710);
    // Three mcqs are 2.25 min, so the floor allows (8 - 2.25) * 150 = 863 words: a warning.
    expect(structureFindings(over).warnings[0]).toMatch(/over 600 but within the 8-minute floor \(863\)/);
    const way = lesson(GOOD.replace(words(200, "gamma"), `${words(200, "gamma")}\n\n${words(800)}`));
    expect(structureFindings(way).errors.join("\n")).toMatch(
      /1110 prose words outside Read-more; the cap is 863/,
    );
  });

  test("spacing: first, between and after", () => {
    expect(structureFindings(lesson(GOOD.replace(words(200, "gamma"), words(460)))).errors.join()).toMatch(
      /460 prose words before x\/c/,
    );
    const late = `## Intro\n\n${words(310)}\n\n## Second\n\n::mcq{exercise="x/d"}\n\n${GOOD.replace('## The reference\n\n::pipeline-map{highlight="fasta"}', "")}`;
    expect(structureFindings(lesson(late)).errors.join()).toMatch(
      /310 words before the first graded interaction/,
    );
    expect(structureFindings(lesson(GOOD.replace(RECAP, `${words(310)}\n\n${RECAP}`))).errors.join()).toMatch(
      /310 prose words between the last/,
    );
  });

  test("Read-more placement, runs and optional practice", () => {
    const rm = (t: string, body = "x") => `:::read-more{title="${t}"}\n${body}\n:::`;
    const lastBeforeRecap = lesson(GOOD.replace(RECAP, `${rm("A")}\n\n${RECAP}`));
    expect(structureFindings(lastBeforeRecap).errors.join()).toMatch(/last block before the Recap/);
    const three = lesson(
      GOOD.replace(`${words(100, "alpha")}\n\n`, `${words(100, "alpha")}\n\n${rm("A")}\n\n${rm("B")}\n\n`),
    );
    expect(structureFindings(three).errors.join()).toMatch(/more than 2 Read-more cards in a row/);
    const afterHeading = lesson(
      GOOD.replace(
        '## Try it: one\n\n::mcq{exercise="x/b"}',
        `## Try it: one\n\n::mcq{exercise="x/b"}\n\n${rm("A")}`,
      ),
    );
    expect(structureFindings(afterHeading).errors.join()).toMatch(/directly after the paragraph it deepens/);
    const afterExercise = lesson(
      GOOD.replace('::mcq{exercise="x/a"}', `::mcq{exercise="x/a"}\n\n${words(5)}\n\n${rm("A")}`),
    );
    expect(structureFindings(afterExercise).errors.join()).toMatch(/comes before its section's exercises/);
    const untitled = lesson(
      GOOD.replace(
        `${words(100, "alpha")}\n\n`,
        `${words(100, "alpha")}\n\n${rm("Deeper", '::mcq{exercise="x/d"}')}\n\n`,
      ),
    );
    expect(structureFindings(untitled).errors.join()).toMatch(/titled "Optional practice: \.\.\."/);
  });

  test("interactions per lesson, Try it, bare sections, opener and Recap", () => {
    const two = lesson(GOOD.replace('\n\n::mcq{exercise="x/c"}', ""));
    expect(structureFindings(two).errors.join()).toMatch(/2 graded interactions/);
    const noTry = lesson(GOOD.replace("## Try it: one", "## One"));
    expect(structureFindings(noTry).errors.join()).toMatch(/no "Try it:" H2/);
    const bare = lesson(
      GOOD.replace(RECAP, `## Aside\n\n${words(5)}\n\n## Aside two\n\n${words(5)}\n\n${RECAP}`),
    );
    expect(structureFindings(bare).errors.join()).toMatch(/content H2s without a graded interaction/);
    expect(
      structureFindings(lesson(GOOD.replace('::pipeline-map{highlight="fasta"}', words(3)))).errors.join(),
    ).toMatch(/opens with ::pipeline-map/);
    expect(structureFindings(lesson(GOOD.replace("Next: more.", "More."))).errors.join()).toMatch(
      /"Next:" hook/,
    );
    expect(structureFindings(lesson(GOOD.replace("- **Three.** c\n", ""))).errors.join()).toMatch(
      /2 bullets/,
    );
    expect(structureFindings(lesson(GOOD.replace('format="fasta"', 'format="fastq"'))).errors.join()).toMatch(
      /At-a-glance card names fasta/,
    );
  });
});

describe("style rules", () => {
  const style = (body: string) => styleFindings(lesson(body));

  test("each rule bites; code is exempt", () => {
    expect(style("Q30 → Q40.")[0]).toMatch(/U\+2192/);
    expect(style("Simply index it.")[0]).toMatch(/simply/);
    expect(style("It works!")[0]).toMatch(/exclamation/);
    expect(style("The gene SCN1A is long.")[0]).toMatch(/italic/);
    expect(style("chr1 has 248956422 bases.")[0]).toMatch(/thousands separators/);
    expect(style(`${words(41).replace(/\./g, "")}.`)[0]).toMatch(/41-word sentence/);
    expect(style("The gene *SCN1A* has `248956422` bytes and `!` is Q0. It is 248,956,422 bp.")).toEqual([]);
  });

  test("data copy: glyphs, hype, exclamation, feedback length; file content is exempt", () => {
    const e = mcq("x/z") as Extract<Exercise, { kind: "mcq" }>;
    e.options[0]!.explanation = words(31);
    e.prompt = "Just pick one!";
    expect(dataFindings(e, "x/z")).toEqual([
      'x/z prompt: "Just" (12.6)',
      "x/z prompt: an exclamation mark (12.6)",
      `x/z explanation: 31 words (at most 30): "${words(31).slice(0, 50)}..."`,
    ]);
    expect(dataFindings({ solution: "Just! →", stem: "Use `!`." }, "y")).toEqual([]);
  });
});

describe("minutes model", () => {
  test("allowances per type (11.6)", () => {
    expect(exerciseMinutes(mcq("x/a"))).toBe(0.75);
    const sort = {
      ...mcq("x/s"),
      kind: "sort",
      bins: [],
      items: Array.from({ length: 8 }, () => ({})),
    } as unknown as Exercise;
    expect(exerciseMinutes(sort)).toBeCloseTo(1.6);
    const tiny = { ...sort, items: [{}] } as unknown as Exercise;
    expect(exerciseMinutes(tiny)).toBe(0.5);
  });

  test("a written lesson outside 8-12, and the course total, fail", () => {
    const a = lesson(GOOD);
    expect(a.estimate).toBeCloseTo(310 / 150 + 2.25);
    const report = lintMinutes([{ ...a, id: "fasta-reference" }]);
    expect(report.errors.join()).toMatch(/outside 8-12/);
    expect(report.total).toBeCloseTo(193 - 9 + a.estimate);
  });
});
