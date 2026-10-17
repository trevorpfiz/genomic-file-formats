// Exercises and standalone snippets for L05 (Random access: indexes and compression),
// content/lessons/02-sequences/05-random-access.md. Sources: docs/research/sequences.md (seq)
// 3.1-3.4, EX-02, EX-03 and its Verification log; docs/research/foundations.md (found) 4.5, Q4;
// SAMv1 §4.1, §4.1.2; docs/PLAN.md 5 (L05.1-L05.3 and the optional BGZF demo).
// Write TAB and CR inside snippet text as \t and \r. Pure TypeScript: no DOM or Vite imports.
import type { McqExercise, PredictExercise, RegisteredSnippet, SimulatorExercise, Snippet } from "./types.ts";

// ---------------------------------------------------------------------------------------------
// Snippets for the concept primer and the predict

/** seq 3.1: toy.fa, real GRCh38 sequence (chrM 1-60; chr1:10,001-10,036, UCSC soft-masked). */
const TOY_HEADER = ">chrM_demo first 60 bp of GRCh38 chrM";
const TOY_CHRM = "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT";

export const toyFa = {
  id: "random-access/toy-fa",
  filename: "toy.fa",
  format: "fasta",
  kind: "text",
  provenance: "toy",
  text:
    `${TOY_HEADER}\n` +
    "GATCACAGGTCTATCACCCT\n" +
    "ATTAACCACTCACGGGAGCT\n" +
    "CTCCATGCATTTGGTATTTT\n" +
    ">chr1_tel GRCh38 chr1:10001-10036 soft-masked\n" +
    "taaccctaaccctaacccta\n" +
    "accctaaccctaaccc\n",
  view: { lineInfo: true },
} satisfies RegisteredSnippet;

/** seq 3.1: its index, written by samtools 1.24 [verified: test]. */
export const toyFai = {
  id: "random-access/toy-fai",
  filename: "toy.fa.fai",
  format: "fai",
  kind: "text",
  provenance: "toy",
  text: "chrM_demo\t60\t38\t20\t21\nchr1_tel\t36\t147\t20\t21\n",
  view: { aligned: true, whitespace: true },
  caption:
    "One row per sequence, columns separated by single TABs: NAME, LENGTH, OFFSET, LINEBASES, LINEWIDTH.",
} satisfies RegisteredSnippet;

/** seq EX-03: a FASTA with an empty middle record [verified: test]. */
const EMPTY_RECORD_FA =
  ">chr1_tel\n" +
  "taaccctaaccctaacccta\n" +
  "accctaaccctaaccc\n" +
  ">chrUn_empty\n" +
  ">chrM_demo\n" +
  "GATCACAGGTCTATCACCCT\n";

/** Shown inside the L05.2 card. */
const EMPTY_RECORD_SNIPPET = {
  filename: "ref.fa",
  format: "fasta",
  kind: "text",
  provenance: "toy",
  text: EMPTY_RECORD_FA,
  caption: "The middle record, `chrUn_empty`, has a header and no bases.",
} satisfies Snippet;

/**
 * SAMv1 §4.1.2: the 28-byte BGZF end-of-file block, itself an empty BGZF block, laid out as in
 * SAMv1 §4.1's block table (seq 11; found 4.5; src/formats/gzip.ts BGZF_EOF).
 */
export const bgzfEofBlock = {
  id: "random-access/bgzf-eof-block",
  filename: "bgzf-eof-block.bin",
  format: "bgzf",
  kind: "hex",
  provenance: "spec-example",
  hex: {
    head: "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00 03 00 00 00 00 00 00 00 00 00",
    annotations: [
      { from: 0, to: 2, label: "gzip magic" },
      { from: 2, to: 3, label: "method 8: DEFLATE" },
      { from: 3, to: 4, label: "flags 04: an extra field follows" },
      { from: 10, to: 12, label: "extra field length: 6 bytes" },
      { from: 12, to: 14, label: "BC: the BGZF subfield" },
      { from: 14, to: 16, label: "subfield length: 2 bytes" },
      { from: 16, to: 18, label: "BSIZE: block size minus 1 (27)" },
      { from: 18, to: 20, label: "compressed data: empty" },
      { from: 20, to: 24, label: "CRC-32" },
      { from: 24, to: 28, label: "uncompressed size: 0" },
    ],
  },
  caption:
    "The 28-byte BGZF end-of-file block (SAMv1 §4.1.2). Every BGZF block has this shape, with flag `04` and a `BC` subfield, and `bgzip` writes these same first 16 bytes. This one holds no data.",
} satisfies RegisteredSnippet;

// ---------------------------------------------------------------------------------------------
// L05.1 Try it · simulator (seq EX-02). A predict gate asks for base 45's byte first, so the
// learner applies the formula by hand before the calculator shows its arithmetic (7.5).

const TOY_ROW = "chrM_demo\t60\t38\t20\t21";
/** seq EX-02: GRCh38 chr1 in the iGenomes UCSC, iGenomes NCBI and Broad copies [verified: GRCh38]. */
const UCSC_CHR1 = "chr1\t248956422\t6\t50\t51";
const NCBI_CHR1 = "chr1\t248956422\t112\t70\t71";
const BROAD_CHR1 = "chr1\t248956422\t112\t100\t101";
/** case 3.7: the Broad chr2 row. */
const BROAD_CHR2 = "chr2\t242193529\t251446211\t100\t101";
/** seq 10: the Broad chr1 header; the iGenomes NCBI copy's chr1 header is identical (seq 12). */
const BROAD_CHR1_HEADER =
  ">chr1  AC:CM000663.2  gi:568336023  LN:248956422  rl:Chromosome  M5:6aef897c3d6ff0c78aff06ac189178dd  AS:GRCh38";
/** seq 3.1, 10: chr1:10,001-10,036, lowercase in the UCSC copy only. */
const TELOMERE = "taaccctaaccctaaccctaaccctaaccctaaccc";

const TOY = { row: TOY_ROW, label: "`toy.fa`", header: TOY_HEADER, sequence: TOY_CHRM };

export const findTheByte = {
  id: "random-access/find-the-byte",
  kind: "simulator",
  simulator: "fai-calculator",
  title: "Find the byte",
  prompt:
    "Predict the byte that holds base 45 of `chrM_demo`, then check it. Then load the three chr1 copies and find chr1:10,001 in each.",
  source: "seq EX-02",
  tags: ["application", "LO3"],
  formats: ["fai", "fasta"],
  concepts: ["fai.columns", "fai.byte-offset", "fai.one-file"],
  init: { ...TOY, position: 1 },
  predictGate: {
    id: "gate",
    kind: "predict",
    prompt: "Use the formula and this row of `toy.fa.fai` before you open the calculator.",
    snippet: {
      filename: "toy.fa.fai",
      format: "fai",
      kind: "text",
      text: `${TOY_ROW}\n`,
      provenance: "toy",
      view: { aligned: true, whitespace: true },
    },
    items: [
      {
        id: "byte",
        label: "Which byte holds base 45 of `chrM_demo`?",
        input: { type: "number", answer: 84, tolerance: 0 },
        computeWith: { helper: "faiByte", args: { row: TOY_ROW, position: 45 } },
      },
    ],
    reveal: "p = 44: two full lines of 21 bytes, then 4 more, so 38 + 2 × 21 + 4 = byte 84.",
  },
  presets: [
    { label: "`toy.fa`", state: TOY },
    {
      label: "UCSC chr1",
      state: {
        row: UCSC_CHR1,
        label: "the iGenomes UCSC hg38 copy",
        header: ">chr1",
        sequence: TELOMERE,
        sequenceStart: 10_001,
      },
    },
    {
      label: "NCBI chr1",
      state: {
        row: NCBI_CHR1,
        label: "the iGenomes NCBI GRCh38 copy",
        header: BROAD_CHR1_HEADER,
        sequence: TELOMERE.toUpperCase(),
        sequenceStart: 10_001,
      },
    },
    {
      label: "Broad chr1",
      state: {
        row: BROAD_CHR1,
        label: "the Broad `Homo_sapiens_assembly38.fasta`",
        header: BROAD_CHR1_HEADER,
        sequence: TELOMERE.toUpperCase(),
        sequenceStart: 10_001,
      },
    },
    {
      label: "Broad chr2",
      state: {
        row: BROAD_CHR2,
        label: "the Broad `Homo_sapiens_assembly38.fasta`",
        position: 165_984_641,
      },
    },
  ],
  goals: [
    {
      id: "base-45",
      text: "Check your byte: show base 45 of `chrM_demo`.",
      when: "showsBase",
      args: { position: 45, row: TOY_ROW },
      explanation:
        "The calculator agrees: 38 + 2 × 21 + 4 = byte 84, an `A`. Each row of its table is one term of the formula.",
      witness: [{ type: "position", position: 45 }],
    },
    {
      id: "three-copies",
      text: "Find chr1:10,001 in the UCSC, NCBI and Broad copies.",
      when: "comparedRows",
      args: { position: 10_001, rows: [UCSC_CHR1, NCBI_CHR1, BROAD_CHR1] },
      explanation:
        "The same base is byte `10206`, `10254` and `10212` in the three files. A `.fai` belongs to exactly one file.",
      witness: [
        { type: "preset", state: { row: UCSC_CHR1 } },
        { type: "position", position: 10_001 },
        { type: "preset", state: { row: NCBI_CHR1 } },
        { type: "preset", state: { row: BROAD_CHR1 } },
      ],
    },
  ],
  hints: [
    "Type 45 in the position field and compare the Byte row with your prediction.",
    "Pick UCSC chr1, set the position to 10001, then pick the NCBI and Broad files. The position stays.",
  ],
  textView: "table",
} satisfies SimulatorExercise;

// ---------------------------------------------------------------------------------------------
// L05.2 Quick check · predict, 2 items (seq EX-03, plus the crosswalk item)

export const whatWillTheIndexHold = {
  id: "random-access/what-will-the-index-hold",
  kind: "predict",
  title: "What will the index hold?",
  prompt: "You run `samtools faidx ref.fa` on this file. Predict what it writes to `ref.fa.fai`.",
  source: "seq EX-03; crosswalk item (PLAN L05.2)",
  tags: ["validity", "LO3", "LO5"],
  formats: ["fasta", "fai"],
  concepts: ["fai.empty-record", "fai.columns", "coords.zero-based"],
  snippet: EMPTY_RECORD_SNIPPET,
  items: [
    {
      id: "rows",
      label: "How many rows does the `.fai` get?",
      input: { type: "number", answer: 2, tolerance: 0, unit: "rows" },
      computeWith: { helper: "faiRowCount", args: { fasta: EMPTY_RECORD_FA } },
      reveal:
        "samtools writes rows for `chr1_tel` and `chrM_demo`, and drops `chrUn_empty` without a warning.",
    },
    {
      id: "offset",
      label: "Which OFFSET does `chr1_tel` get?",
      input: { type: "number", answer: 10, tolerance: 0 },
      computeWith: {
        helper: "faiField",
        args: { fasta: EMPTY_RECORD_FA, name: "chr1_tel", field: "OFFSET" },
      },
      reveal:
        "`>chr1_tel` is 9 characters plus a newline, bytes 0 to 9. OFFSET counts from 0, so the first base is byte 10.",
    },
  ],
  reveal:
    'The rows are `chr1_tel 36 10 20 21` and `chrM_demo 20 72 20 21`. A later lookup of `chrUn_empty` fails with "not found", far from the cause. Like a BED start, OFFSET counts from 0.',
} satisfies PredictExercise;

// ---------------------------------------------------------------------------------------------
// Optional practice (Read more): the BGZF random-access demo (seq 3.4; found 4.5)

export const bgzfDemo = {
  id: "random-access/bgzf-demo",
  kind: "simulator",
  simulator: "bgzf-demo",
  title: "Fetch one base from a compressed FASTA",
  prompt:
    "`chrZ.fa.gz` is a bgzipped 200 kb FASTA. Fetch base 140,001 of `chrZ` with the BGZF index, then from a plain gzip copy. Then remove the EOF block.",
  source: "seq 3.4; found 4.5, Q4",
  tags: ["concept", "LO3"],
  formats: ["bgzf", "gzip", "gzi", "fai"],
  concepts: [
    "compression.gzip-vs-bgzf",
    "compression.virtual-offset",
    "compression.gzi",
    "compression.bgzf-eof",
  ],
  init: { position: 140_001 },
  presets: [
    {
      label: "`bgzip` (default)",
      state: {
        gzi: [
          [20642, 65225],
          [41248, 130495],
          [61931, 195765],
        ],
      },
    },
    {
      label: "`bgzip --binary`",
      state: {
        gzi: [
          [20658, 65280],
          [41263, 130560],
          [61963, 195840],
        ],
      },
    },
  ],
  goals: [
    {
      id: "bgzf",
      text: "Fetch the base from the BGZF file.",
      when: "fetched",
      args: { mode: "bgzf", position: 140_001 },
      explanation: "The `.gzi` named block 3, so only its 65,270 bytes were inflated.",
      witness: [{ type: "step" }, { type: "step" }, { type: "step" }, { type: "step" }],
    },
    {
      id: "gzip",
      text: "Fetch the same base from the gzip copy.",
      when: "comparedModes",
      args: { position: 140_001 },
      explanation: "One gzip stream has no block starts, so all 142,350 bytes up to the base were inflated.",
      witness: [
        { type: "step" },
        { type: "step" },
        { type: "step" },
        { type: "step" },
        { type: "mode", mode: "gzip" },
        { type: "step" },
        { type: "step" },
        { type: "step" },
        { type: "step" },
        { type: "step" },
      ],
    },
    {
      id: "eof",
      text: "Remove the EOF block and check the end of the file.",
      when: "eofChecked",
      args: { present: false },
      explanation:
        "Without the 28-byte EOF block the file is presumed truncated: Invalid, although samtools only warns.",
      witness: [{ type: "eof", present: false }, { type: "checkEof" }],
    },
  ],
  textView: "log",
} satisfies SimulatorExercise;

// ---------------------------------------------------------------------------------------------
// L05.3 Quick check · mcq (found Q4)

export const whyBgzip = {
  id: "random-access/why-bgzip",
  kind: "mcq",
  title: "Why bgzip and not gzip?",
  prompt: "",
  source: "found Q4 (options rebalanced in length; distractor c replaced)",
  tags: ["concept", "validity", "LO2"],
  formats: ["bgzf", "gzip", "tbi"],
  concepts: ["compression.gzip-vs-bgzf", "compression.virtual-offset"],
  multi: false,
  stem: "`tabix` can index `calls.vcf.gz` when `bgzip` wrote it, but not when `gzip` wrote it. Why?",
  options: [
    {
      id: "a",
      text: "gzip uses a different compression algorithm, one that tabix cannot read.",
      correct: false,
      explanation: "Not quite. Both use DEFLATE, and any gzip reader can decompress a BGZF file.",
    },
    {
      id: "b",
      text: "BGZF compresses independent blocks, so an index can point at a block start.",
      correct: true,
      explanation:
        "Correct. A gzip stream can only be read from its beginning. Independent blocks make virtual offsets possible: seek to the block, inflate it alone, skip `uoffset` bytes.",
    },
    {
      id: "c",
      text: "`bgzip` stores the index inside the compressed file, and gzip has nowhere to put it.",
      correct: false,
      explanation: "Not quite. `tabix` writes the index to a separate `.tbi` file. `bgzip` only compresses.",
    },
    {
      id: "d",
      text: "gzip files have no EOF marker, so tabix cannot tell where the data ends.",
      correct: false,
      explanation:
        "Not quite. A gzip stream ends with its own trailer. BGZF's EOF block detects truncation; it does not make random access possible.",
    },
  ],
} satisfies McqExercise;
