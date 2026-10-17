// Reference exercises for the three M1 simulators, built from the plan's keys (docs/PLAN.md 5:
// L05.1 seq EX-02, the L05 BGZF demo, L06.2 found EX-05 / seq EX-07). The simulator tests
// replay their witnesses and drive them through the DOM. Lesson authors may copy them into
// src/exercises/; this module is imported by tests only and never ships.
import { CASE_FASTQ_FILES } from "../../case/generated/fastq.ts";
import type { SimulatorExercise } from "../../exercises/types.ts";

// --- .fai calculator (L05.1) -----------------------------------------------------------------

/** seq 3.1: toy.fa's first record. */
export const TOY_HEADER = ">chrM_demo first 60 bp of GRCh38 chrM";
export const TOY_SEQUENCE = "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT";
export const TOY_ROW = "chrM_demo\t60\t38\t20\t21";
/** seq EX-02: the three GRCh38 chr1 rows (iGenomes UCSC, iGenomes NCBI, Broad). */
export const UCSC_CHR1 = "chr1\t248956422\t6\t50\t51";
export const NCBI_CHR1 = "chr1\t248956422\t112\t70\t71";
export const BROAD_CHR1 = "chr1\t248956422\t112\t100\t101";
/** case 3.7: the Broad chr2 row. */
export const BROAD_CHR2 = "chr2\t242193529\t251446211\t100\t101";
/** seq 3.1, 10: chr1:10,001-10,036, lowercase in the UCSC copy only. */
const TELOMERE = "taaccctaaccctaaccctaaccctaaccctaaccc";
/** seq 10: the Broad chr1 header (two-space separators). */
export const BROAD_CHR1_HEADER =
  ">chr1  AC:CM000663.2  gi:568336023  LN:248956422  rl:Chromosome  M5:6aef897c3d6ff0c78aff06ac189178dd  AS:GRCh38";

const TOY = { row: TOY_ROW, label: "`toy.fa`", header: TOY_HEADER, sequence: TOY_SEQUENCE };

export const FIND_THE_BYTE = {
  id: "random-access/find-the-byte",
  kind: "simulator",
  simulator: "fai-calculator",
  title: "Find the byte",
  prompt:
    "Use the `.fai` row to find where a base sits in the file. Then load the three `chr1` copies and find chr1:10,001 in each.",
  source: "seq EX-02",
  tags: ["application", "LO2"],
  formats: ["fai", "fasta"],
  concepts: ["fai.columns", "fai.byte-offset", "fai.one-file"],
  init: { ...TOY, position: 1 },
  presets: [
    { label: "`toy.fa`", state: TOY },
    {
      label: "UCSC chr1",
      state: { row: UCSC_CHR1, label: "iGenomes UCSC hg38", sequence: TELOMERE, sequenceStart: 10_001 },
    },
    {
      label: "NCBI chr1",
      state: {
        row: NCBI_CHR1,
        label: "iGenomes NCBI GRCh38",
        sequence: TELOMERE.toUpperCase(),
        sequenceStart: 10_001,
      },
    },
    {
      label: "Broad chr1",
      state: {
        row: BROAD_CHR1,
        label: "Broad `Homo_sapiens_assembly38.fasta`",
        header: BROAD_CHR1_HEADER,
        sequence: TELOMERE.toUpperCase(),
        sequenceStart: 10_001,
      },
    },
  ],
  goals: [
    {
      id: "base-45",
      text: "Find the byte that holds base 45 of `chrM_demo`.",
      when: "showsBase",
      args: { position: 45, row: TOY_ROW },
      explanation: "p = 44: two full lines of 21 bytes, then 4 more, so 38 + 2 × 21 + 4 = byte 84, an `A`.",
      witness: [{ type: "position", position: 45 }],
    },
    {
      id: "three-copies",
      text: "Find chr1:10,001 in the UCSC, NCBI and Broad copies.",
      when: "comparedRows",
      args: { position: 10_001, rows: [UCSC_CHR1, NCBI_CHR1, BROAD_CHR1] },
      explanation: "The same base is byte 10206, 10254 and 10212: a `.fai` belongs to exactly one file.",
      witness: [
        { type: "preset", state: { row: UCSC_CHR1 } },
        { type: "position", position: 10_001 },
        { type: "preset", state: { row: NCBI_CHR1 } },
        { type: "preset", state: { row: BROAD_CHR1 } },
      ],
    },
  ],
  textView: "table",
} satisfies SimulatorExercise;

// --- BGZF demo (L05 optional practice) -------------------------------------------------------

export const BGZF_DEMO = {
  id: "random-access/bgzf-demo",
  kind: "simulator",
  simulator: "bgzf-demo",
  title: "Fetch one base from a compressed FASTA",
  prompt:
    "Fetch base 140,001 of `chrZ` from the BGZF file, then from a plain gzip copy. Then remove the EOF block.",
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
      label: "bgzip (default)",
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

// --- Phred converter (L06.2) -----------------------------------------------------------------

/** The proband's first R1 read (D-18 bins `# , : F`). */
export const CASE_READ_QUALITY = CASE_FASTQ_FILES[0]!.records[0]!.quality;

export const QUALITY_AS_PROBABILITY = {
  id: "fastq-reads/quality-as-probability",
  kind: "simulator",
  simulator: "phred-converter",
  title: "Quality as probability",
  prompt: "Decode the quality characters `I`, `5`, `?` and `#` into Q and an error probability.",
  source: "found EX-05; seq EX-07",
  tags: ["application", "LO6"],
  formats: ["fastq"],
  concepts: ["quality.phred", "quality.phred33", "quality.expected-errors"],
  init: { q: 10 },
  presets: [{ label: "The proband's first read", state: { quality: CASE_READ_QUALITY } }],
  goals: [
    {
      id: "decode",
      text: "Decode `I`, `5`, `?` and `#`.",
      when: "decoded",
      args: { chars: "I5?#" },
      explanation: "`I` is Q40, `5` Q20, `?` Q30 and `#` Q2: each step of 10 is ten times fewer errors.",
      witness: [
        { type: "char", char: "I" },
        { type: "char", char: "5" },
        { type: "char", char: "?" },
        { type: "char", char: "#" },
      ],
    },
  ],
  textView: "table",
} satisfies SimulatorExercise;
