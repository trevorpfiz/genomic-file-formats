// The case FASTQ records (src/case/generated/fastq.ts; docs/PLAN.md 9.2, D-18, 13 M1): names,
// quality bins, pairing and the SNP alleles each read carries, checked against case.md 3.2.
import { describe, expect, test } from "vite-plus/test";
import {
  CASE_FASTQ_FILES,
  CASE_FRAGMENTS,
  fastqFileText,
  QUALITY_BINS,
  type CaseFastqFile,
} from "../src/case/generated/fastq.ts";

const NAME = /^A00123:8:H7KJ2DSXY:(\d):(\d{4}):(\d+):(\d+)$/;
const FILE = /^fastq\/(P042-(?:proband|mother|father))_S(\d)_L00(\d)_R([12])_001\.fastq\.gz$/;
const SAMPLE_NUMBER = { "P042-proband": "1", "P042-mother": "2", "P042-father": "3" };
/** case.md 3.2: alleles per haplotype at the two SNPs the fragments cover. */
const SITES = { rs2298771: 166_036_278, rs6432860: 166_041_354 } as const;
const ALLELES = {
  M1: { rs2298771: "C", rs6432860: "A" },
  M2: { rs2298771: "T", rs6432860: "G" },
  F1: { rs2298771: "T", rs6432860: "G" },
  F2: { rs2298771: "T", rs6432860: "G" },
} as const;
const revcomp = (s: string) =>
  s
    .split("")
    .reverse()
    .map((c) => ({ A: "T", C: "G", G: "C", T: "A", N: "N" })[c] ?? "?")
    .join("");

const fileFor = (sample: string, read: 1 | 2): CaseFastqFile =>
  CASE_FASTQ_FILES.find((f) => f.sample === sample && f.read === read)!;

test("six files: R1 and R2 for each of the three samples", () => {
  expect(CASE_FASTQ_FILES.map((f) => f.path)).toEqual([
    "fastq/P042-proband_S1_L001_R1_001.fastq.gz",
    "fastq/P042-proband_S1_L001_R2_001.fastq.gz",
    "fastq/P042-mother_S2_L001_R1_001.fastq.gz",
    "fastq/P042-mother_S2_L001_R2_001.fastq.gz",
    "fastq/P042-father_S3_L001_R1_001.fastq.gz",
    "fastq/P042-father_S3_L001_R2_001.fastq.gz",
  ]);
});

describe.each(CASE_FASTQ_FILES)("$path", (file) => {
  const [, sample, sNumber, lane, read] = FILE.exec(file.path) ?? [];

  test("the path matches the sample and read", () => {
    expect(sample).toBe(file.sample);
    expect(sNumber).toBe(SAMPLE_NUMBER[file.sample]);
    expect(Number(read)).toBe(file.read);
  });

  test.each(file.records)("record $id: D-18 name, comment, 2x150 and the 4-level alphabet", (record) => {
    const name = NAME.exec(record.id);
    expect(name, record.id).not.toBeNull();
    expect(name?.[1]).toBe(lane);
    expect(record.comment).toMatch(new RegExp(`^${file.read}:N:0:[ACGT]{8}\\+[ACGT]{8}$`));
    expect(record.sequence).toMatch(/^[ACGTN]{150}$/);
    expect(record.quality).toHaveLength(150);
    for (const c of record.quality) expect(Object.keys(QUALITY_BINS)).toContain(c);
  });

  test("the text is strict four-line FASTQ with a bare + line", () => {
    const lines = fastqFileText(file).split("\n");
    expect(lines.at(-1)).toBe("");
    expect(lines.length - 1).toBe(file.records.length * 4);
    lines.slice(0, -1).forEach((line, i) => {
      if (i % 4 === 0) expect(line.startsWith("@")).toBe(true);
      if (i % 4 === 2) expect(line).toBe("+");
    });
  });
});

test("mates are in the same order with the same ids and index in R1 and R2", () => {
  for (const sample of ["P042-proband", "P042-mother", "P042-father"] as const) {
    const r1 = fileFor(sample, 1).records;
    const r2 = fileFor(sample, 2).records;
    expect(r1.map((r) => r.id)).toEqual(r2.map((r) => r.id));
    expect(r1.map((r) => r.comment.slice(2))).toEqual(r2.map((r) => r.comment.slice(2)));
  }
});

describe.each(CASE_FRAGMENTS)("fragment $id ($sample, exon $exon)", (fragment) => {
  const r1 = fileFor(fragment.sample, 1).records.find((r) => r.id === fragment.id)!;
  const r2 = fileFor(fragment.sample, 2).records.find((r) => r.id === fragment.id)!;
  // Forward-strand reads of the fragment's two ends.
  const left = fragment.strand === "+" ? r1.sequence : r2.sequence;
  const right = revcomp(fragment.strand === "+" ? r2.sequence : r1.sequence);

  test("is a 2x150 exome fragment with a plausible insert", () => {
    const length = fragment.end - fragment.start + 1;
    expect(length).toBeGreaterThanOrEqual(250);
    expect(length).toBeLessThanOrEqual(400);
  });

  test("overlapping mates agree", () => {
    const length = fragment.end - fragment.start + 1;
    const overlap = 300 - length;
    if (overlap > 0) expect(left.slice(150 - overlap)).toBe(right.slice(0, overlap));
  });

  test("a read carries the haplotype's allele at the SNP (case.md 3.2)", () => {
    const pos = SITES[fragment.covers];
    const allele =
      pos - fragment.start < 150 ? left[pos - fragment.start] : right[pos - (fragment.end - 149)];
    expect(allele).toBe(ALLELES[fragment.haplotype][fragment.covers]);
  });
});

test("the proband carries no paternal allele inside the deletion (rs2298771 reads come from M1)", () => {
  const inDeletion = CASE_FRAGMENTS.filter(
    (f) => f.sample === "P042-proband" && f.start >= 166_014_903 && f.end <= 166_040_115,
  );
  expect(inDeletion.length).toBeGreaterThan(0);
  for (const f of inDeletion) expect(f.haplotype).toBe("M1");
});
