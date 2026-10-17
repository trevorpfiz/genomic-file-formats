// The coverage matrix (docs/PLAN.md 3.3) over built pages plus the manifest (D-37): each written
// lesson the matrix names holds a graded, main-path exercise of the right kind for its format
// row, and each written quiz has a slot for it. Optional practice never counts. The "all built"
// assertion switches on in M7.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { pages as manifest, sections } from "../content/course.ts";
import { compileLesson, type CompiledPage, type RegistryEntry } from "../plugins/lesson-compiler.ts";
import { exercises, quizzes, registry as registryRecord } from "../src/exercises/registry.ts";
import type { FormatId } from "../src/exercises/types.ts";
import { isFormatId } from "../src/formats/names.ts";

/** Switches on in M7 (D-37): every outline page built. */
const ALL_BUILT = false;

interface Row {
  row: string;
  /** Format ids that count for the row. */
  formats: readonly FormatId[];
  introduced: string;
  /** Lessons holding the row's recognition and validity exercises (3.3). */
  recognition: readonly string[];
  validity: readonly string[];
  /** Quiz slots that cover the row. */
  quiz: readonly { section: string; slots: readonly string[] }[];
  /** Capstone files (6.2). */
  capstone: readonly string[];
}

const COMPANIONS: FormatId[] = ["fai", "gzi", "bai", "csi", "tbi", "crai", "gzip", "bgzf"];

/** docs/PLAN.md 3.3, one row per format (GTF and GFF3, PAF and GFA are separate rows, D-07). */
const MATRIX: readonly Row[] = [
  {
    row: "FASTA",
    formats: ["fasta"],
    introduced: "fasta-reference",
    recognition: ["fastq-in-the-wild"],
    validity: ["fasta-reference"],
    quiz: [{ section: "sequences", slots: ["2.1", "2.2"] }],
    capstone: ["F01"],
  },
  {
    row: "FASTQ",
    formats: ["fastq"],
    introduced: "fastq-reads",
    recognition: ["fastq-in-the-wild"],
    validity: ["fastq-in-the-wild"],
    quiz: [{ section: "sequences", slots: ["2.4", "2.5", "2.6"] }],
    capstone: ["F02"],
  },
  {
    row: "BED",
    formats: ["bed"],
    introduced: "bed-targets",
    recognition: ["fastq-in-the-wild", "wig-coverage"],
    validity: ["coordinates", "bed-targets", "bed-in-practice"],
    quiz: [{ section: "regions", slots: ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6"] }],
    capstone: ["F03"],
  },
  {
    row: "BEDPE",
    formats: ["bedpe"],
    introduced: "bedpe-breakpoints",
    recognition: ["gfa-graphs"],
    validity: ["bedpe-breakpoints"],
    quiz: [{ section: "sv-and-graphs", slots: ["7.1", "7.2"] }],
    capstone: ["F10"],
  },
  {
    row: "WIG",
    formats: ["wig", "bedgraph"],
    introduced: "wig-coverage",
    recognition: ["wig-coverage"],
    validity: ["wig-coverage"],
    quiz: [{ section: "coverage-and-variants", slots: ["5.1"] }],
    capstone: ["F06"],
  },
  {
    row: "GTF",
    formats: ["gtf"],
    introduced: "gene-models",
    recognition: ["gene-models"],
    validity: ["gene-models"],
    quiz: [{ section: "annotation", slots: ["6.1", "6.4"] }],
    capstone: ["F11"],
  },
  {
    row: "GFF3",
    formats: ["gff3"],
    introduced: "gene-models",
    recognition: ["gene-models"],
    validity: ["frame-and-phase"],
    quiz: [{ section: "annotation", slots: ["6.3", "6.5"] }],
    capstone: ["F12"],
  },
  {
    row: "SAM",
    formats: ["sam"],
    introduced: "sam-records",
    recognition: ["gfa-graphs"],
    validity: ["sam-records"],
    quiz: [{ section: "alignments", slots: ["4.1", "4.2", "4.6"] }],
    capstone: ["F15"],
  },
  {
    row: "BAM",
    formats: ["bam"],
    introduced: "bam-cram",
    recognition: ["bam-cram"],
    validity: ["bam-cram"],
    quiz: [{ section: "alignments", slots: ["4.5"] }],
    capstone: ["F04"],
  },
  {
    row: "CRAM",
    formats: ["cram"],
    introduced: "bam-cram",
    recognition: ["bam-cram"],
    validity: ["bam-cram"],
    quiz: [{ section: "alignments", slots: ["4.4", "4.5"] }],
    capstone: ["F05"],
  },
  {
    row: "gVCF",
    formats: ["gvcf"],
    introduced: "gvcf-blocks",
    recognition: ["gvcf-blocks"],
    validity: ["gvcf-blocks"],
    quiz: [{ section: "coverage-and-variants", slots: ["5.2", "5.5"] }],
    capstone: ["F07", "F08"],
  },
  {
    row: "VCF",
    formats: ["vcf"],
    introduced: "vcf-records",
    recognition: ["gvcf-blocks"],
    validity: ["vcf-records"],
    quiz: [{ section: "coverage-and-variants", slots: ["5.3", "5.4", "5.6"] }],
    capstone: ["F09"],
  },
  {
    row: "PAF",
    formats: ["paf"],
    introduced: "paf-long-reads",
    recognition: ["gfa-graphs"],
    validity: ["paf-long-reads"],
    quiz: [{ section: "sv-and-graphs", slots: ["7.3", "7.4"] }],
    capstone: ["F13"],
  },
  {
    row: "GFA",
    formats: ["gfa"],
    introduced: "gfa-graphs",
    recognition: ["gfa-graphs"],
    validity: ["gfa-graphs"],
    quiz: [{ section: "sv-and-graphs", slots: ["7.5"] }],
    capstone: ["F14"],
  },
  {
    row: "Companions",
    formats: COMPANIONS,
    introduced: "random-access",
    recognition: ["fastq-in-the-wild", "bam-cram"],
    validity: ["random-access", "bam-cram"],
    quiz: [
      { section: "sequences", slots: ["2.3"] },
      { section: "alignments", slots: ["4.5"] },
    ],
    capstone: [],
  },
];

const registry = new Map<string, RegistryEntry>(Object.entries(registryRecord));
const sectionIds = new Set(sections.map((s) => s.id));
const built = manifest.filter((p) => p.status === "built");
const compiled = new Map<string, CompiledPage>(
  await Promise.all(
    built.map(
      async (p) =>
        [
          p.id,
          await compileLesson(readFileSync(p.file, "utf8"), p.file, { registry, sections: sectionIds }),
        ] as const,
    ),
  ),
);

/** Graded, main-path exercises of a lesson (optional practice never counts, 3.3). */
const graded = (lessonId: string) =>
  (compiled.get(lessonId)?.widgets ?? [])
    .filter((w) => (w.mode === "try-it" || w.mode === "quick-check") && !w.optional)
    .map((w) => exercises[w.ref])
    .filter((e) => e !== undefined);
/** A lesson is judged once it is written: built, with a graded interaction. */
const written = (lessonId: string) => graded(lessonId).length > 0;

test("the matrix names 14 formats plus the companions (D-07), introduced by lessons in the manifest", () => {
  expect(MATRIX.filter((r) => r.row !== "Companions")).toHaveLength(14);
  for (const r of MATRIX) {
    const lessons = [r.introduced, ...r.recognition, ...r.validity];
    for (const id of lessons)
      expect(manifest.find((p) => p.id === id)?.kind, `${r.row}: ${id}`).toBe("lesson");
    for (const f of r.formats) expect(isFormatId(f), f).toBe(true);
  }
});

describe.each(MATRIX)("$row", (r) => {
  const has = (lessonId: string, tag: "recognition" | "validity") =>
    graded(lessonId).some((e) => e.tags.includes(tag) && e.formats.some((f) => r.formats.includes(f)));

  test.each(r.recognition)("recognition exercise in %s (when written)", (lessonId) => {
    if (!written(lessonId)) return;
    expect(
      has(lessonId, "recognition"),
      `${lessonId} needs a graded exercise tagged "recognition" with format ${r.formats.join(" or ")}`,
    ).toBe(true);
  });

  test.each(r.validity)("validity exercise in %s (when written)", (lessonId) => {
    if (!written(lessonId)) return;
    expect(
      has(lessonId, "validity"),
      `${lessonId} needs a graded exercise tagged "validity" with format ${r.formats.join(" or ")}`,
    ).toBe(true);
  });

  test("appears in its section quiz (when written)", () => {
    for (const { section, slots } of r.quiz) {
      const quiz = quizzes[section];
      if (!quiz?.slots.length) continue;
      const covering = quiz.slots.filter(
        (s) =>
          slots.includes(s.id) &&
          s.variants.length > 0 &&
          s.variants.every((v) => v.formats.some((f) => r.formats.includes(f))),
      );
      expect(
        covering.length,
        `${section}: none of slots ${slots.join(", ")} has every variant covering ${r.row}`,
      ).toBeGreaterThan(0);
    }
  });
});

test("exercise formats and tags use the course vocabularies", () => {
  for (const e of Object.values(exercises)) {
    for (const f of e.formats) expect(isFormatId(f), `${e.id}: ${f}`).toBe(true);
    expect(e.formats.length, `${e.id}: no formats`).toBeGreaterThan(0);
  }
});

test("the capstone's coverage column is checked once the capstone is built (M7)", () => {
  const capstone = manifest.find((p) => p.id === "capstone");
  if (capstone?.status !== "built") return;
  expect.fail("M7: extend tests/coverage.test.ts to check each row's capstone files (docs/PLAN.md 3.3, 6.2)");
});

test.runIf(ALL_BUILT)("every outline page is built (M7, D-37)", () => {
  expect(manifest.filter((p) => p.outline && p.status !== "built").map((p) => p.id)).toEqual([]);
});
