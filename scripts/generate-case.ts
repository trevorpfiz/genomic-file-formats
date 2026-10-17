// gen:case, M1 stub (docs/PLAN.md 9.3, 13 M1): writes src/case/generated/fastq.ts, the case
// FASTQ records the owner signs off in M1. M2 replaces this stub with the full generator, which
// must emit these records verbatim (a test pins them).
//
//   node scripts/generate-case.ts             write the module
//   node scripts/generate-case.ts --check     fail (exit 1) if the committed module differs
//   node scripts/generate-case.ts --out <path>   write (or --check) another path instead
//   node scripts/generate-case.ts --slice <path>
//       also check the pinned reference windows against the verified GRCh38 slice: the bare
//       uppercase sequence of chr2:165,980,001-166,150,000 (MD5 d0418b8e..., case.md 3.7)
//
// Deterministic and offline: the GRCh38 bases the six read pairs need are pinned below (two
// windows of the verified slice, with their MD5s); haplotype alleles follow case.md 3.2; read
// names follow D-18; qualities come from a seeded mulberry32 stream over the course's 4-level
// quality alphabet (a design choice; see V-06). Node runs this file directly (type stripping), so it uses only erasable syntax.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const OUTPUT = "src/case/generated/fastq.ts";

/** The verified slice (case.md 3.7) the windows come from. */
const SLICE = { start: 165_980_001, length: 170_000, md5: "d0418b8e69260dafd2133fc10e22f977" } as const;

/** GRCh38 chr2 windows (1-based closed) holding every fragment, pinned from the slice. */
export const WINDOWS = [
  {
    start: 166_036_131,
    end: 166_036_500,
    md5: "b6c14208501c927eeb673890faf8f00c",
    bases:
      "GTACAGTCACAGTAAGACTGGGGTTGTTTATGAATGACATGTAATCACTTTCATCAATAATGTATTTTTCAACACTGCTGCCAGTTCCTATACCACTTGTAGTTCC" +
      "ATTTACATCTTTAAGATAGTCAAGATCTTTCCCAATTTCTGCTGTATGATTGGACATACAACTGTCTTTCTTGTTGTTTAGATCATCAAGTGGTTTAATTTCATCTA" +
      "AAATCTTTTGTTTCCTAATGAAGGACTGTTGAATAAATTCATATATTTTTCTTTTCACATAAGCTACTCCTTTGTGCATCCTATCCACAGCAATTTGGAGATTATTC" +
      "ATTTCATTATCATCATCAGTGGCTGCAAGGTTGTCTGCACTAAATGAGCT",
  },
  {
    start: 166_041_181,
    end: 166_041_560,
    md5: "824752858dfae7c26ccf073d6d1c516d",
    bases:
      "TCAAGCAGAAAATTTGAAGACTAAACACATTTACCTTCCAATATGCTTACCAAGTTTCCTACTGTAAGCACATTATTGAAATGGTCCGTCATTGGATAGTGCTCCA" +
      "TGGCCATGAAAAGAGTATTTAAGACAATACAGATGGTGATGGCCAGGTCAACAAATGGGTCCATCACAACCAGGTTGACAACATGTTTCACTTTTAACCAATATGGA" +
      "GAACAGTCCCAGATTAAGAATATGTTGGAAAATTTATACCAACAGGGTGGGCATTTCTGCCTGGATTCTTCAAGTTCTAGATTAAGAAAAAAAAAAAAAAGAACCAC" +
      "CAAAAGGTATACTTTATACACACACATTTATTTCATATCCACTAAACTTATTTTCAGTAA",
  },
] as const;

type Site = "rs2298771" | "rs6432860";
type Haplotype = "M1" | "M2" | "F1" | "F2";
type Sample = "P042-proband" | "P042-mother" | "P042-father";

/** case.md 3.2: the two SNPs the fragments cover, with GRCh38 REF and ALT. */
const SITES: Record<Site, { pos: number; ref: string; alt: string }> = {
  rs2298771: { pos: 166_036_278, ref: "C", alt: "T" },
  rs6432860: { pos: 166_041_354, ref: "A", alt: "G" },
};
/** Alleles per haplotype at the two sites (case.md 3.2; F2 is the father's intact haplotype). */
const HAPLOTYPES: Record<Haplotype, Record<Site, string>> = {
  M1: { rs2298771: "C", rs6432860: "A" },
  M2: { rs2298771: "T", rs6432860: "G" },
  F1: { rs2298771: "T", rs6432860: "G" },
  F2: { rs2298771: "T", rs6432860: "G" },
};
/** Sample number and an illustrative dual index per sample. */
const SAMPLES: [Sample, number, string][] = [
  ["P042-proband", 1, "ACGTACGT+TGCATGCA"],
  ["P042-mother", 2, "GACTGACT+AGTCAGTC"],
  ["P042-father", 3, "TCAGTCAG+CTGACTGA"],
];

interface Fragment {
  sample: Sample;
  start: number;
  end: number;
  strand: "+" | "-";
  haplotype: Haplotype;
  tile: number;
  x: number;
  y: number;
  covers: Site;
  exon: number;
}

/** The six read pairs, in CASE_FRAGMENTS order (each covers one SNP; MANE exons 16 and 19). */
const FRAGMENTS: Fragment[] = [
  {
    sample: "P042-proband",
    start: 166_041_251,
    end: 166_041_560,
    strand: "+",
    haplotype: "F2",
    tile: 1203,
    // Not case.md's 15410:22045: that x/y belongs to the deletion-junction split read (M2).
    x: 14762,
    y: 20318,
    covers: "rs6432860",
    exon: 16,
  },
  {
    sample: "P042-proband",
    start: 166_036_151,
    end: 166_036_440,
    strand: "-",
    haplotype: "M1",
    tile: 1203,
    x: 16234,
    y: 4711,
    covers: "rs2298771",
    exon: 19,
  },
  {
    sample: "P042-mother",
    start: 166_041_181,
    end: 166_041_490,
    strand: "-",
    haplotype: "M1",
    tile: 1104,
    x: 8711,
    y: 30139,
    covers: "rs6432860",
    exon: 16,
  },
  {
    sample: "P042-mother",
    start: 166_036_171,
    end: 166_036_500,
    strand: "+",
    haplotype: "M2",
    tile: 1104,
    x: 20546,
    y: 12382,
    covers: "rs2298771",
    exon: 19,
  },
  {
    sample: "P042-father",
    start: 166_041_221,
    end: 166_041_530,
    strand: "+",
    haplotype: "F1",
    tile: 2217,
    x: 3195,
    y: 18861,
    covers: "rs6432860",
    exon: 16,
  },
  {
    sample: "P042-father",
    start: 166_036_131,
    end: 166_036_450,
    strand: "-",
    haplotype: "F2",
    tile: 2217,
    x: 25012,
    y: 9407,
    covers: "rs2298771",
    exon: 19,
  },
];

const READ_LENGTH = 150;
const QUALITY_SEED = 0x50303432; // "P042"

const md5 = (s: string): string => createHash("md5").update(s).digest("hex");

/** GRCh38 bases, 1-based closed, from the pinned windows. */
function reference(start: number, end: number): string {
  const w = WINDOWS.find((win) => win.start <= start && end <= win.end);
  if (!w) throw new Error(`gen:case: chr2:${start}-${end} is outside the pinned windows`);
  return w.bases.slice(start - w.start, end - w.start + 1);
}

function haplotypeSequence(haplotype: Haplotype, start: number, end: number): string {
  const bases = reference(start, end).split("");
  for (const [site, { pos, ref }] of Object.entries(SITES) as [Site, (typeof SITES)[Site]][]) {
    if (pos < start || pos > end) continue;
    if (bases[pos - start] !== ref)
      throw new Error(`gen:case: GRCh38 at ${site} is ${bases[pos - start]}, not ${ref}`);
    bases[pos - start] = HAPLOTYPES[haplotype][site];
  }
  return bases.join("");
}

const COMPLEMENT: Record<string, string> = { A: "T", C: "G", G: "C", T: "A", N: "N" };
const reverseComplement = (s: string): string =>
  s
    .split("")
    .reverse()
    .map((c) => COMPLEMENT[c] ?? "N")
    .join("");

/** mulberry32: a small seeded PRNG giving floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One 150-character quality string: F (Q37) 86%, : (Q25) 9%, , (Q11) 5%. */
function quality(seed: number): string {
  const next = mulberry32(seed);
  let out = "";
  for (let i = 0; i < READ_LENGTH; i += 1) {
    const r = next();
    out += r < 0.86 ? "F" : r < 0.95 ? ":" : ",";
  }
  return out;
}

interface RecordOut {
  id: string;
  comment: string;
  sequence: string;
  quality: string;
}
interface FileOut {
  path: string;
  sample: Sample;
  read: 1 | 2;
  records: RecordOut[];
}

/** The records, per file in proband/mother/father then R1/R2 order. */
export function buildFiles(): FileOut[] {
  const files = new Map<string, FileOut>();
  FRAGMENTS.forEach((f, i) => {
    const [, number, index] = SAMPLES.find(([s]) => s === f.sample)!;
    const fragment = haplotypeSequence(f.haplotype, f.start, f.end);
    const pos = SITES[f.covers].pos;
    if (!(pos <= f.start + READ_LENGTH - 1 || pos >= f.end - READ_LENGTH + 1))
      throw new Error(`gen:case: no read of ${f.sample}'s fragment ${i} covers ${f.covers}`);
    const left = fragment.slice(0, READ_LENGTH);
    const right = reverseComplement(fragment.slice(-READ_LENGTH));
    const [r1, r2] = f.strand === "+" ? [left, right] : [right, left];
    const id = `A00123:8:H7KJ2DSXY:1:${f.tile}:${f.x}:${f.y}`;
    const reads: [1 | 2, string, string][] = [
      [1, r1, quality(QUALITY_SEED + 2 * i)],
      [2, r2, quality(QUALITY_SEED + 2 * i + 1)],
    ];
    for (const [read, sequence, q] of reads) {
      const path = `fastq/${f.sample}_S${number}_L001_R${read}_001.fastq.gz`;
      if (!files.has(path)) files.set(path, { path, sample: f.sample, read, records: [] });
      files.get(path)!.records.push({ id, comment: `${read}:N:0:${index}`, sequence, quality: q });
    }
  });
  const order = SAMPLES.map(([s]) => s);
  return [...files.values()].sort(
    (a, b) => order.indexOf(a.sample) - order.indexOf(b.sample) || a.read - b.read,
  );
}

const s = (v: string): string => JSON.stringify(v);

/** The module text, byte for byte. */
export function render(): string {
  const lines: string[] = [];
  const w = (line: string) => lines.push(line);
  w("// GENERATED by the gen:case stub (scripts/generate-case.ts; docs/PLAN.md 9.3, 13 M1). Do not edit.");
  w("// M2's generator must reproduce this file byte for byte (the FASTQ records the owner signs off");
  w("// in M1 are pinned). Source: the GRCh38 slice chr2:165,980,001-166,150,000 (Broad analysis set,");
  w("// MD5 of the bare uppercase sequence d0418b8e69260dafd2133fc10e22f977; case.md 3.7) and the");
  w("// haplotypes of case.md 3.2.");
  w("//");
  w("// Recipe, per fragment in CASE_FRAGMENTS order (index i from 0):");
  w("// - bases: the fragment's haplotype sequence, start..end 1-based closed, with only the listed SNP");
  w('//   sites changed from GRCh38; R1 and R2 are 150 bases: on a "+" fragment R1 is the first 150');
  w('//   bases and R2 the reverse complement of the last 150; on a "-" fragment they swap;');
  w("// - names (D-18): A00123:8:H7KJ2DSXY:<lane>:<tile>:<x>:<y>, lane 1 (the files are _L001_), with");
  w("//   comment <read>:N:0:<i7>+<i5> and an illustrative dual index per sample;");
  w(
    "// - qualities: the course's 4-level quality alphabet (D-18; a design choice, see V-06). For each base a",
  );
  w("//   mulberry32 stream seeded with 0x50303432 + 2i (R1) or + 2i + 1 (R2) gives r in [0, 1):");
  w("//   r < 0.86 -> F (Q37), r < 0.95 -> : (Q25), else , (Q11). # (Q2) is part of the alphabet but no");
  w("//   base here draws it.");
  w("// Library totals are metadata, not records: about 60 M pairs for the proband and the mother and");
  w("// about 32 M for the father (docs/PLAN.md 9.2; illustrative).");
  w("");
  w("export interface CaseFastqRecord {");
  w("  /** The read id: the title's first word, without the @. It becomes the SAM QNAME. */");
  w("  id: string;");
  w("  /** The Illumina comment after the space: <read>:<is filtered>:<control>:<index>. */");
  w("  comment: string;");
  w("  sequence: string;");
  w("  quality: string;");
  w("}");
  w("");
  w("export interface CaseFastqFile {");
  w("  /** Path in the case folder, as the capstone lists it (docs/PLAN.md 6.2). */");
  w("  path: string;");
  w('  sample: "P042-proband" | "P042-mother" | "P042-father";');
  w("  read: 1 | 2;");
  w("  records: readonly CaseFastqRecord[];");
  w("}");
  w("");
  w("/** Where each read pair comes from, so a generator can rebuild it from the slice. */");
  w("export interface CaseFragment {");
  w('  sample: CaseFastqFile["sample"];');
  w("  /** The pair's read id. */");
  w("  id: string;");
  w('  chrom: "chr2";');
  w("  /** 1-based closed. */");
  w("  start: number;");
  w("  end: number;");
  w('  /** "+": R1 reads the fragment forward from start; "-": R1 reads back from end. */');
  w('  strand: "+" | "-";');
  w("  /** The haplotype the fragment was drawn from (case.md 3.2). */");
  w('  haplotype: "M1" | "M2" | "F1" | "F2";');
  w("  /** The case SNP the fragment covers, and the MANE exon it overlaps. */");
  w('  covers: "rs2298771" | "rs6432860";');
  w("  exon: number;");
  w("}");
  w("");
  w("/** The 4-level quality alphabet: # , : F = Q2, Q11, Q25, Q37 (D-18). */");
  w('export const QUALITY_BINS = { "#": 2, ",": 11, ":": 25, F: 37 } as const;');
  w("");
  w("export const CASE_FRAGMENTS: readonly CaseFragment[] = [");
  for (const f of FRAGMENTS) {
    const id = `A00123:8:H7KJ2DSXY:1:${f.tile}:${f.x}:${f.y}`;
    w(
      `  { sample: ${s(f.sample)}, id: ${s(id)}, chrom: "chr2", start: ${f.start}, end: ${f.end}, strand: ${s(f.strand)}, haplotype: ${s(f.haplotype)}, covers: ${s(f.covers)}, exon: ${f.exon} },`,
    );
  }
  w("];");
  w("");
  w("/** The six exome FASTQ files of the case folder, two records each, in file order. */");
  w("export const CASE_FASTQ_FILES: readonly CaseFastqFile[] = [");
  for (const file of buildFiles()) {
    w("  {");
    w(`    path: ${s(file.path)},`);
    w(`    sample: ${s(file.sample)},`);
    w(`    read: ${file.read},`);
    w("    records: [");
    for (const r of file.records) {
      w("      {");
      w(`        id: ${s(r.id)},`);
      w(`        comment: ${s(r.comment)},`);
      w("        sequence:");
      w(`          ${s(r.sequence)},`);
      w("        quality:");
      w(`          ${s(r.quality)},`);
      w("      },");
    }
    w("    ],");
    w("  },");
  }
  w("];");
  w("");
  w("/** One record as its four FASTQ lines (no wrapping; a bare + line), each ending in a newline. */");
  w("export const fastqRecordText = (r: CaseFastqRecord): string =>");
  w("  `@${r.id} ${r.comment}\\n${r.sequence}\\n+\\n${r.quality}\\n`;");
  w("");
  w("/** A file's decompressed text. */");
  w(
    'export const fastqFileText = (file: CaseFastqFile): string => file.records.map(fastqRecordText).join("");',
  );
  w("");
  return lines.join("\n");
}

/** Check the pinned windows: their own MD5s, and optionally the slice they were cut from. */
export function checkWindows(slicePath?: string): string[] {
  const problems: string[] = [];
  for (const w of WINDOWS) {
    if (w.bases.length !== w.end - w.start + 1)
      problems.push(`window ${w.start}-${w.end} has ${w.bases.length} bases`);
    if (md5(w.bases) !== w.md5)
      problems.push(`window ${w.start}-${w.end} MD5 is ${md5(w.bases)}, not ${w.md5}`);
  }
  if (slicePath) {
    const slice = readFileSync(slicePath, "utf8").replace(/\s/g, "").toUpperCase();
    if (slice.length !== SLICE.length || md5(slice) !== SLICE.md5) {
      problems.push(`${slicePath} is not the verified slice (length ${slice.length}, MD5 ${md5(slice)})`);
    } else {
      for (const w of WINDOWS) {
        if (slice.slice(w.start - SLICE.start, w.end - SLICE.start + 1) !== w.bases)
          problems.push(`window ${w.start}-${w.end} differs from the slice`);
      }
    }
  }
  return problems;
}

/** The first line where two texts differ, for --check. */
function firstDifference(a: string, b: string): string {
  const x = a.split("\n");
  const y = b.split("\n");
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] !== y[i])
      return `line ${i + 1}:\n  committed: ${x[i] ?? "(end of file)"}\n  generated: ${y[i] ?? "(end of file)"}`;
  }
  return "no difference";
}

function main(argv: string[]): number {
  const sliceAt = argv.indexOf("--slice");
  const problems = checkWindows(sliceAt >= 0 ? argv[sliceAt + 1] : undefined);
  if (problems.length) {
    for (const p of problems) console.error(`gen:case: ${p}`);
    return 1;
  }
  const outAt = argv.indexOf("--out");
  const out = outAt >= 0 && argv[outAt + 1] ? argv[outAt + 1]! : `${ROOT}${OUTPUT}`;
  const text = render();
  if (argv.includes("--check")) {
    let committed = "";
    try {
      committed = readFileSync(out, "utf8");
    } catch {
      committed = "";
    }
    if (committed !== text) {
      console.error(
        `gen:case: ${out} is out of date; run the gen:case script. First difference at ${firstDifference(committed, text)}`,
      );
      return 1;
    }
    console.log(`gen:case: ${out} is up to date`);
    return 0;
  }
  writeFileSync(out, text);
  console.log(`gen:case: wrote ${out}`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2));
