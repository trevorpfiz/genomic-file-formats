// The content harness's key checks bite (docs/PLAN.md 11.6): sound fixtures built from the
// notes' exercises pass, and each broken variant is reported. tests/content.test.ts runs the
// same checks over the real lessons and quizzes.
import { describe, expect, test } from "vite-plus/test";
import type {
  ExerciseBase,
  FixItExercise,
  McqExercise,
  PredictExercise,
  Quiz,
  QuizSlot,
  Snippet,
  SortExercise,
  SpotTheErrorExercise,
} from "../exercises/types.ts";
import { EX01, EX04, EX04_FIXED, EX09A, TOY_FA } from "./fixtures.ts";
import {
  compositionProblems,
  fixItProblems,
  mcqProblems,
  predictProblems,
  quizProblems,
  readMoreRanges,
  sortProblems,
  spotProblems,
  type QuizContext,
} from "./keys.ts";

const text = (t: string, format: Snippet["format"] = "fasta"): Snippet => ({
  filename: "toy.fa",
  format,
  kind: "text",
  text: t,
  provenance: "toy",
});
const base: Pick<ExerciseBase, "title" | "prompt" | "source" | "tags" | "formats" | "concepts"> = {
  title: "T",
  prompt: "P",
  source: "seq",
  tags: [],
  formats: ["fasta"],
  concepts: ["fasta.record"],
};

describe("spot-the-error", () => {
  const spot = (
    answers: SpotTheErrorExercise["rounds"][number]["answers"],
    snippet = EX01,
    extra = {},
  ): SpotTheErrorExercise => ({
    ...base,
    id: "l/spot",
    kind: "spot-the-error",
    rounds: [
      {
        id: "a",
        snippet: text(snippet),
        granularity: "line",
        validation: { format: "fasta", profile: {} },
        answers,
        ...extra,
      },
    ],
  });

  test("seq EX-01 keyed on line 3 passes", () => {
    expect(spotProblems(spot([{ line: 3, rule: "FA-S02", explanation: "x" }]), "ex")).toEqual([]);
  });

  test("a wrong line, an unkeyed diagnostic and an out-of-range line are reported", () => {
    expect(spotProblems(spot([{ line: 4, rule: "FA-S02", explanation: "x" }]), "ex").join("\n")).toMatch(
      /do not report FA-S02 on line 4[\s\S]*unkeyed diagnostic FA-S02 on line 3/,
    );
    expect(spotProblems(spot([{ line: 9, rule: "FA-S02", explanation: "x" }]), "ex")[0]).toMatch(
      /outside the snippet/,
    );
  });

  test("acceptAlso covers knock-ons; severities widen the key", () => {
    const answers = [{ line: 1, rule: "FA-S01", explanation: "x" }];
    expect(spotProblems(spot(answers, EX04), "ex")).toEqual([
      `ex round a: unkeyed diagnostic FA-S03 on line 5: ${"Line 5: blank line inside the sequence of `chrM_demo` (header on line 2). Only lines between records may be blank."}`,
    ]);
    expect(spotProblems(spot(answers, EX04, { acceptAlso: [{ line: 5, note: "n" }] }), "ex")).toEqual([]);
    const warned = spot([...answers, { line: 5, rule: "FA-S03", explanation: "x" }], EX04);
    warned.rounds[0]!.validation = { format: "fasta", profile: {}, severities: ["error", "warning"] };
    expect(spotProblems(warned, "ex")[0]).toMatch(/unkeyed diagnostic FA-M01 on line 7/);
  });

  test("a single pick has one answer; a field must match when given", () => {
    const two = spot(
      [
        { line: 1, rule: "FA-S01", explanation: "x" },
        { line: 5, rule: "FA-S03", explanation: "x" },
      ],
      EX04,
    );
    expect(spotProblems({ ...two, singlePick: true }, "ex")).toContain(
      "ex: a single pick has one round with one answer",
    );
    expect(
      spotProblems(spot([{ line: 3, rule: "FA-S02", field: "name", explanation: "x" }]), "ex")[0],
    ).toMatch(/do not report/);
  });

  test("a format without a validator is reported, not thrown", () => {
    const bed = spot([{ line: 1, rule: "BED-S01", explanation: "x" }], "chr1\t0\t1\n");
    bed.rounds[0]!.validation = { format: "bed", profile: {} };
    expect(spotProblems(bed, "ex").join()).toMatch(/No validator for format "bed"/);
  });
});

describe("fix-it (seq EX-04, L04.3)", () => {
  const fixIt = (over: Partial<FixItExercise> = {}): FixItExercise => ({
    ...base,
    id: "l/fix",
    kind: "fix-it",
    starter: text(EX04),
    validation: { format: "fasta", profile: { include: ["FA-S01", "FA-S03", "FA-M01"] } },
    goals: [
      {
        id: "keep",
        text: "Keeps chrM_demo's 60 bases",
        check: "fastaKeepsBases",
        args: { name: "chrM_demo", bases: "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT" },
      },
    ],
    solution: EX04_FIXED,
    expectStarterRules: ["FA-S01", "FA-S03"],
    hints: ["a", "b", "c"],
    ...over,
  });

  test("the seq EX-04 design passes", () => {
    expect(fixItProblems(fixIt(), "fx")).toEqual([]);
  });

  test("wrong expected rules, a broken solution, a failed goal", () => {
    expect(fixItProblems(fixIt({ expectStarterRules: ["FA-S01"] }), "fx")[0]).toMatch(
      /not expectStarterRules/,
    );
    expect(fixItProblems(fixIt({ solution: `# x\n${EX04_FIXED}` }), "fx")[0]).toMatch(
      /the solution has an error: FA-S01/,
    );
    expect(fixItProblems(fixIt({ solution: ">chrM_demo\nAC\n" }), "fx")).toEqual([
      'fx: the solution fails goal "keep"',
    ]);
    expect(fixItProblems(fixIt({ goals: [{ id: "g", text: "g", check: "nope" }] }), "fx")[0]).toMatch(
      /unknown goal check/,
    );
  });

  test("a profile that lets a test-only rule fire, or names one, is reported", () => {
    const loose = fixIt({ validation: { format: "fasta", profile: {} }, solution: EX04_FIXED.slice(0, -1) });
    expect(fixItProblems(loose, "fx").join("\n")).toMatch(/test-only rule FA-C04 can fire/);
    const named = fixIt({
      validation: { format: "fasta", profile: { include: ["FA-S01", "FA-S02", "FA-S03"] } },
    });
    expect(fixItProblems(named, "fx")).toContain(
      "fx: the profile includes FA-S02, which is not a runtime rule",
    );
  });

  test("severities widen what the starter must fail with", () => {
    const strict = fixIt({
      validation: {
        format: "fasta",
        profile: { include: ["FA-S01", "FA-S03", "FA-M01"] },
        severities: ["error", "warning"],
      },
      expectStarterRules: ["FA-S01", "FA-S03", "FA-M01"],
    });
    expect(fixItProblems(strict, "fx")).toEqual([]);
  });
});

describe("sort and mcq validity", () => {
  const bins = [
    { id: "valid", label: "Valid", verdict: "valid" as const },
    { id: "invalid", label: "Invalid", verdict: "invalid" as const },
  ];
  const sort = (bin: string): SortExercise => ({
    ...base,
    id: "l/sort",
    kind: "sort",
    bins,
    items: [
      {
        id: "a",
        content: text(EX01),
        bin,
        why: "w",
        validityFromValidator: true,
        validation: { format: "fasta", profile: {} },
      },
      {
        id: "b",
        content: TOY_FA,
        bin: "valid",
        why: "w",
        validityFromValidator: true,
        validation: { format: "fasta", profile: {} },
      },
    ],
  });

  test("bins agree with verdictOf", () => {
    expect(sortProblems(sort("invalid"), "s")).toEqual([]);
    expect(sortProblems(sort("valid"), "s")).toEqual([
      "s item a: the validators say invalid, the key says valid",
    ]);
    expect(
      sortProblems({ ...sort("invalid"), items: [{ id: "x", content: "c", bin: "nope", why: "w" }] }, "s"),
    ).toEqual(['s item x: keys unknown bin "nope"']);
  });

  const mcq = (correct: [boolean, boolean, boolean]): McqExercise => ({
    ...base,
    id: "l/mcq",
    kind: "mcq",
    multi: false,
    stem: "Which file is valid?",
    options: [
      {
        id: "a",
        text: "A",
        correct: correct[0],
        explanation: "e",
        snippet: text(EX01),
        validation: { format: "fasta", profile: {} },
        validityFromValidator: true,
      },
      {
        id: "b",
        text: "B",
        correct: correct[1],
        explanation: "e",
        snippet: text(TOY_FA),
        validation: { format: "fasta", profile: {} },
        validityFromValidator: true,
      },
      {
        id: "c",
        text: "C",
        correct: correct[2],
        explanation: "e",
        snippet: text(EX09A, "fastq"),
        validation: { format: "fastq", profile: {} },
        validityFromValidator: true,
      },
    ],
  });

  test("an mcq's correct options share a verdict no other option has", () => {
    expect(mcqProblems(mcq([false, true, false]), "m")).toEqual([]);
    expect(mcqProblems(mcq([true, false, false]), "m")).toEqual([
      "m: option c has the keyed verdict invalid but is not correct",
    ]);
    expect(mcqProblems(mcq([true, true, false]), "m")).toContain(
      "m: a single-select needs exactly one correct option, not 2",
    );
  });

  test("arithmetic mcqs: the computed key is in the correct option only (seq Q2)", () => {
    const q2 = {
      ...base,
      id: "l/q2",
      kind: "mcq",
      multi: false,
      stem: "At which byte is chr2:101?",
      computeWith: {
        helper: "faiByte",
        args: { row: "chr2\t242193529\t251446211\t100\t101", position: 101 },
      },
      options: [
        { id: "a", text: "251446311", correct: false, explanation: "Forgets the newline." },
        { id: "b", text: "251,446,312", correct: true, explanation: "p = 100." },
        { id: "c", text: "251446211", correct: false, explanation: "That is chr2:1." },
      ],
    } satisfies McqExercise & { computeWith: object };
    expect(mcqProblems(q2, "m")).toEqual([]);
    const wrong = { ...q2, options: q2.options.map((o) => ({ ...o, correct: o.id === "a" })) };
    expect(mcqProblems(wrong, "m")).toEqual([
      "m: option a does not show the computed key 251446312",
      "m: option b also shows the computed key 251446312",
    ]);
    const rounded = {
      ...q2,
      computeWith: { helper: "expectedErrors", args: { quality: ")))))" } },
      options: [
        { id: "a", text: "About 0.79", correct: true, explanation: "e" },
        { id: "b", text: "0.04", correct: false, explanation: "e" },
      ],
    };
    expect(mcqProblems(rounded, "m")).toEqual([]);
  });
});

describe("predict arithmetic", () => {
  const predict = (items: PredictExercise["items"]): PredictExercise => ({
    ...base,
    id: "l/p",
    kind: "predict",
    items,
    reveal: "r",
  });

  test("helpers recompute keys (seq EX-02, EX-03, EX-07; found EX-11)", () => {
    const ok = predict([
      {
        label: "Byte",
        input: { type: "number", answer: 84, tolerance: 0 },
        computeWith: { helper: "faiByte", args: { row: "chrM_demo\t60\t38\t20\t21", position: 45 } },
      },
      {
        label: "Rows",
        input: { type: "number", answer: 2, tolerance: 0 },
        computeWith: {
          helper: "faiRowCount",
          args: {
            fasta:
              ">chr1_tel\ntaaccctaaccctaacccta\naccctaaccctaaccc\n>chrUn_empty\n>chrM_demo\nGATCACAGGTCTATCACCCT\n",
          },
        },
      },
      {
        label: "Errors",
        input: { type: "number", answer: 0.6314, tolerance: 0.0005 },
        computeWith: { helper: "expectedErrors", args: { quality: "IIII#" } },
      },
      {
        label: "Depth",
        input: { type: "number", answer: 450, tolerance: 5 },
        computeWith: { helper: "meanDepth", args: { pairs: 60e6, readLength: 150, size: 40e6 } },
      },
      {
        label: "BED",
        input: { type: "region", answer: [2000, 2050] },
        computeWith: { helper: "toBed", args: { start: 2001, end: 2050 } },
      },
      {
        label: "RC",
        input: { type: "text", answer: "acgtn", normalize: ["case"] },
        computeWith: { helper: "reverseComplement", args: { seq: "NACGT" } },
      },
      { label: "Offset base", input: { type: "choice", options: ["0", "1"], answer: 0 } },
    ]);
    expect(predictProblems(ok, "p")).toEqual([]);
  });

  test("a 1-based p, a missing helper and a wrong key are reported", () => {
    const bad = predict([
      {
        label: "Byte",
        input: { type: "number", answer: 85, tolerance: 0 },
        computeWith: { helper: "faiByte", args: { row: "chrM_demo\t60\t38\t20\t21", position: 45 } },
      },
      { label: "No helper", input: { type: "number", answer: 1, tolerance: 0 } },
      {
        label: "Unknown",
        input: { type: "number", answer: 1, tolerance: 0 },
        computeWith: { helper: "nope" },
      },
      {
        label: "Range",
        input: { type: "number", answer: 1, tolerance: 0 },
        computeWith: { helper: "faiByte", args: { row: "chrM_demo\t60\t38\t20\t21", position: 61 } },
      },
    ]);
    expect(predictProblems(bad, "p")).toEqual([
      "p item 0: key 85 ± 0, but the helper gives 84",
      "p item 1: number and region items need computeWith",
      'p item 2: unknown helper "nope" (src/formats/helpers.ts)',
      'p item 3: helper "faiByte" failed: position is past the sequence end',
    ]);
  });
});

describe("quiz composition (docs/PLAN.md 6.1)", () => {
  const ctx: QuizContext = {
    order: new Map([
      ["fasta-reference", 0],
      ["fastq-in-the-wild", 3],
      ["quiz-sequences", 4],
      ["later-lesson", 9],
    ]),
    pages: new Map([
      [
        "fasta-reference",
        {
          headings: ["the-reference", "deep"],
          html: '<h2 id="the-reference"></h2><details class="disclosure disclosure-read-more"><h3 id="deep"></h3></details>',
        },
      ],
      [
        "fastq-in-the-wild",
        { headings: ["three-broken-records"], html: '<h2 id="three-broken-records"></h2>' },
      ],
    ]),
    introducers: {
      "fasta.record": "fasta-reference",
      "fastq.record": "fastq-in-the-wild",
      "later.concept": "later-lesson",
    },
    lessonExercises: [],
  };
  const mcq = (
    slot: string,
    letter: string,
    formats: string[],
    tags: QuizSlot["tags"],
    concepts: string[],
    extra: Partial<McqExercise> = {},
  ): McqExercise => ({
    id: `quiz-sequences/${slot}/${letter}`,
    kind: "mcq",
    title: "Q",
    prompt: "P",
    source: "fresh",
    tags,
    formats: formats as McqExercise["formats"],
    concepts,
    multi: false,
    stem: `Stem ${slot}${letter}`,
    options: [
      { id: "a", text: "Yes", correct: true, explanation: "e" },
      { id: "b", text: "No", correct: false, explanation: "e" },
    ],
    ...extra,
  });
  const spot = (slot: string, letter: string): SpotTheErrorExercise => ({
    id: `quiz-sequences/${slot}/${letter}`,
    kind: "spot-the-error",
    title: "Q",
    prompt: "P",
    source: "fresh",
    tags: ["validity", "application"],
    formats: ["fastq"],
    concepts: ["fastq.record"],
    singlePick: true,
    rounds: [
      {
        id: "a",
        snippet: { ...text(EX09A, "fastq"), text: EX09A.replace("1000", `100${letter === "a" ? 1 : 2}`) },
        granularity: "line",
        validation: { format: "fastq", profile: {} },
        answers: [{ line: 4, rule: "FQ-S04", explanation: "e" }],
      },
    ],
  });
  const hexMcq = (letter: string) =>
    mcq("2.3", letter, ["bgzf"], ["recognition", "application"], ["fasta.record"], {
      snippet: {
        filename: "file_03.gz",
        format: "bgzf",
        kind: "hex",
        hex: { head: "1f 8b 08 04", annotations: [] },
        provenance: "toy",
        hideIdentity: true,
      },
    });
  const slot = (
    id: string,
    tags: QuizSlot["tags"],
    concepts: string[],
    variants: QuizSlot["variants"],
    tests = "fasta-reference#the-reference",
  ): QuizSlot => ({
    id,
    tests,
    tags,
    concepts,
    variants,
  });
  const quiz = (slots: QuizSlot[]): Quiz => ({
    section: "sequences",
    title: "Q2",
    slots,
    passMark: 5,
    referenceCard: { title: "Reference card", items: [] },
  });
  const good = () => [
    slot(
      "2.1",
      ["application"],
      ["fasta.record"],
      ["a", "b"].map((l) => mcq("2.1", l, ["fasta"], ["application"], ["fasta.record"])),
    ),
    slot(
      "2.2",
      ["application"],
      ["fasta.record"],
      ["a", "b"].map((l) => mcq("2.2", l, ["fasta"], ["application"], ["fasta.record"])),
    ),
    slot("2.3", ["recognition", "application"], ["fasta.record"], [hexMcq("a"), hexMcq("b")]),
    slot(
      "2.4",
      ["concept"],
      ["fastq.record"],
      ["a", "b"].map((l) => mcq("2.4", l, ["fastq"], ["concept"], ["fastq.record"])),
      "fastq-in-the-wild#three-broken-records",
    ),
    slot(
      "2.5",
      ["validity", "application"],
      ["fastq.record"],
      [spot("2.5", "a"), spot("2.5", "b")],
      "fastq-in-the-wild#three-broken-records",
    ),
    slot(
      "2.6",
      ["LO7"],
      ["fastq.record"],
      ["a", "b"].map((l) => mcq("2.6", l, ["fastq"], ["LO7"], ["fastq.record"])),
    ),
  ];

  test("a sound six-slot quiz passes", () => {
    expect(quizProblems(quiz(good()), ctx)).toEqual([]);
  });

  test("each composition rule bites", () => {
    const noApplication = good().map((s) => ({ ...s, tags: s.tags.filter((t) => t !== "application") }));
    expect(compositionProblems(quiz(noApplication))).toContain("sequences: fewer than 3 application slots");
    const noFastq = good().map((s) => ({
      ...s,
      variants: s.variants.map((v) => ({ ...v, formats: v.formats.filter((f) => f !== "fastq") })),
    }));
    expect(compositionProblems(quiz(noFastq)).join("\n")).toMatch(/no variant covers fastq/);
    const noRecognition = good().map((s) =>
      s.id === "2.3" ? { ...s, variants: s.variants.map((v) => ({ ...v, snippet: undefined })) } : s,
    );
    expect(compositionProblems(quiz(noRecognition as QuizSlot[])).join("\n")).toMatch(/no recognition item/);
    const noLo7 = good().map((s) => (s.id === "2.6" ? { ...s, tags: ["concept" as const] } : s));
    expect(compositionProblems(quiz(noLo7))).toContain("sequences: no LO7 slot");
  });

  test("slot rules bite: one variant, concepts, tests anchors, LO5 case values, lesson repeats", () => {
    const slots = good();
    slots[0] = { ...slots[0]!, variants: slots[0]!.variants.slice(0, 1) };
    slots[1] = { ...slots[1]!, tests: "fasta-reference#deep" };
    slots[3] = {
      ...slots[3]!,
      concepts: ["later.concept"],
      variants: slots[3]!.variants.map((v) => ({ ...v, concepts: ["later.concept"] })),
    };
    const lo5 = { ...slots[5]!, tags: ["LO7", "LO5"] as QuizSlot["tags"] };
    lo5.variants = lo5.variants.map((v) => ({ ...v, tags: lo5.tags, stem: "Position 166,014,902?" }));
    slots[5] = lo5;
    const problems = quizProblems(quiz(slots), { ...ctx, lessonExercises: [spot("2.5", "a")] }).join("\n");
    expect(problems).toMatch(/sequences slot 2\.1: needs 2 variants/);
    expect(problems).toMatch(/fasta-reference#deep is inside Read-more/);
    expect(problems).toMatch(/later\.concept is introduced after the quiz/);
    expect(problems).toMatch(/an LO5 slot uses the case value 166014902/);
    expect(problems).toMatch(/quiz-sequences\/2\.5\/a: repeats a lesson exercise's snippet/);
  });

  test("readMoreRanges handles nested disclosures", () => {
    const html =
      '<details class="disclosure disclosure-read-more"><details class="disclosure disclosure-spec-detail"></details><p id="x"></p></details><p id="y"></p>';
    const [range] = readMoreRanges(html);
    expect(html.indexOf('id="x"')).toBeGreaterThan(range![0]);
    expect(html.indexOf('id="x"')).toBeLessThan(range![1]);
    expect(html.indexOf('id="y"')).toBeGreaterThan(range![1]);
  });
});
