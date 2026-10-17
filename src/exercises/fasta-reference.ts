// Exercises and standalone snippets for L04 (FASTA: the reference everyone is compared against),
// content/lessons/02-sequences/04-fasta-reference.md. Sources: docs/research/sequences.md (seq)
// 3.1, 5, 10, EX-01, EX-04 and its Verification log; docs/PLAN.md 5 (L04.1-L04.3).
// Write TAB and CR inside snippet text as \t and \r. Pure TypeScript: no DOM or Vite imports.
import type {
  FieldExplorerExercise,
  FixItExercise,
  RegisteredSnippet,
  SpotTheErrorExercise,
} from "./types.ts";

/** seq 3.1: the first 60 bp of GRCh38 chrM (the rCRS) [verified: GRCh38]. */
const CHRM_60 = "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT";

/**
 * seq 3.1: `toy.fa`, real GRCh38 sequence: chrM 1-60, and chr1:10,001-10,036 in UCSC's
 * soft-masked form. Its .fai is `chrM_demo 60 38 20 21` and `chr1_tel 36 147 20 21`.
 */
export const toyFa = {
  id: "fasta-reference/toy-fa",
  filename: "toy.fa",
  format: "fasta",
  kind: "text",
  provenance: "toy",
  text:
    ">chrM_demo first 60 bp of GRCh38 chrM\n" +
    "GATCACAGGTCTATCACCCT\n" +
    "ATTAACCACTCACGGGAGCT\n" +
    "CTCCATGCATTTGGTATTTT\n" +
    ">chr1_tel GRCh38 chr1:10001-10036 soft-masked\n" +
    "taaccctaaccctaacccta\n" +
    "accctaaccctaaccc\n",
  caption:
    "Two records of real GRCh38 sequence. Each name is the first word of its header; the rest is a description.",
} satisfies RegisteredSnippet;

// ---------------------------------------------------------------------------------------------
// L04.1 Quick check · field-explorer (seq 10: the real Broad chr1 header)

/** seq 10: the separators between key:value pairs are two spaces, not TABs [verified: GRCh38]. */
const BROAD_CHR1_HEADER =
  ">chr1  AC:CM000663.2  gi:568336023  LN:248956422  rl:Chromosome  M5:6aef897c3d6ff0c78aff06ac189178dd  AS:GRCh38";
const span = (token: string): [number, number] => {
  const start = BROAD_CHR1_HEADER.indexOf(token);
  if (start < 0) throw new Error(`fasta-reference: "${token}" is not in the chr1 header`);
  return [start, start + token.length];
};
const HEADER_CITE = "Broad GRCh38 analysis-set FASTA header";

export const broadChr1Header = {
  id: "fasta-reference/broad-chr1-header",
  kind: "field-explorer",
  title: "What does the chr1 header say?",
  prompt:
    "This is the real header line of chr1 in the Broad reference. Its fields are separated by two spaces, not TABs.",
  source: "seq 10 (Broad chr1 header); PLAN L04.1",
  tags: ["concept", "LO1"],
  formats: ["fasta"],
  concepts: ["fasta.record", "fasta.header-metadata", "ref.md5"],
  snippet: {
    filename: "Homo_sapiens_assembly38.fasta",
    format: "fasta",
    kind: "text",
    provenance: "real-file",
    text: `${BROAD_CHR1_HEADER}\n`,
    download: "none",
    view: { whitespace: true },
  },
  fields: [
    {
      line: 1,
      span: span("chr1"),
      name: "name",
      meaning:
        "The sequence name: the first word after `>`. The `.fai` NAME column, SAM `@SQ SN`, VCF `CHROM` and BED `chrom` all refer to it.",
      allowed: "Everything up to the first space or TAB",
      cite: "faidx(5)",
    },
    {
      line: 1,
      span: span("AC:CM000663.2"),
      name: "AC",
      meaning:
        "The GenBank accession of this sequence, `CM000663.2`. It is description text, so tools ignore it.",
      cite: HEADER_CITE,
    },
    {
      line: 1,
      span: span("gi:568336023"),
      name: "gi",
      meaning: "An older NCBI record number for the same sequence. Description text.",
      cite: HEADER_CITE,
    },
    {
      line: 1,
      span: span("LN:248956422"),
      name: "LN",
      meaning: "The length: 248,956,422 bases. A SAM `@SQ` line carries the same tag and value.",
      cite: "SAMv1 v1.6 §1.3 (`@SQ LN`)",
    },
    {
      line: 1,
      span: span("rl:Chromosome"),
      name: "rl",
      meaning: "The sequence's role in the assembly: here a whole chromosome. Description text.",
      cite: HEADER_CITE,
    },
    {
      line: 1,
      span: span("M5:6aef897c3d6ff0c78aff06ac189178dd"),
      name: "M5",
      meaning:
        "The MD5 digest of the bases, computed after uppercasing and removing line breaks. SAM `@SQ M5` carries it, and CRAM uses it to check the reference.",
      cite: "SAMv1 v1.6 §1.3, §1.3.2",
    },
    {
      line: 1,
      span: span("AS:GRCh38"),
      name: "AS",
      meaning: "The genome assembly, GRCh38. SAM `@SQ AS` uses the same tag.",
      cite: "SAMv1 v1.6 §1.3",
    },
  ],
  check: {
    id: "check",
    kind: "mcq",
    prompt: "",
    multi: false,
    stem: "Which token does samtools use as the sequence name, and which value would a CRAM check this sequence against?",
    options: [
      {
        id: "a",
        text: "`chr1`, and the `M5` digest",
        correct: true,
        explanation:
          "Correct. The name ends at the first space. `M5` is the MD5 of the bases, which `@SQ` lines carry and CRAM checks.",
      },
      {
        id: "b",
        text: "The whole header line, and the `LN` length",
        correct: false,
        explanation:
          "Not quite. The name stops at the first whitespace. Equal lengths do not prove equal bases; the `M5` digest does.",
      },
      {
        id: "c",
        text: "`CM000663.2`, and the `M5` digest",
        correct: false,
        explanation: "Not quite. `AC:CM000663.2` is an accession in the description, which tools ignore.",
      },
      {
        id: "d",
        text: "`chr1`, and the `gi` number",
        correct: false,
        explanation:
          "The name is right, but `gi:568336023` is a record number. It says nothing about the bases.",
      },
    ],
  },
} satisfies FieldExplorerExercise;

// ---------------------------------------------------------------------------------------------
// L04.2 Try it · spot-the-error (seq EX-01, plus toy.fa's soft-masked chr1_tel record)

export const whyWontThisIndex = {
  id: "fasta-reference/why-wont-this-index",
  kind: "spot-the-error",
  title: "Why won't this index?",
  prompt: "`samtools faidx` refuses to index this file. Pick the line that breaks it.",
  source: "seq EX-01 (with toy.fa's chr1_tel record as a distractor)",
  tags: ["validity", "LO2"],
  formats: ["fasta"],
  concepts: ["fasta.line-width", "fasta.soft-masking"],
  hints: [
    "Count the bases on each sequence line. The line descriptions show the counts.",
    "Only a record's last line may be shorter than its other lines (FA-S02).",
  ],
  rounds: [
    {
      id: "a",
      snippet: {
        filename: "ref.fa",
        format: "fasta",
        kind: "text",
        provenance: "toy",
        text:
          ">chrM_demo first 60 bp of GRCh38 chrM\n" +
          "GATCACAGGTCTATCACCCT\n" +
          "ATTAACCACTCACGGG\n" +
          "AGCTCTCCATGCATTTGGTA\n" +
          "TTTT\n" +
          ">chr1_tel GRCh38 chr1:10001-10036 soft-masked\n" +
          "taaccctaaccctaacccta\n" +
          "accctaaccctaaccc\n",
      },
      granularity: "line",
      validation: { format: "fasta", profile: {} },
      answers: [
        {
          line: 3,
          rule: "FA-S02",
          explanation:
            "Line 3 has 16 bases, but the full lines of `chrM_demo` have 20. Only a record's last line may be shorter, so the byte arithmetic breaks after it.",
        },
      ],
      fineHere: {
        "1": "The description after `chrM_demo` can say anything; tools ignore it.",
        "4": "Line 4 has 20 bases, like line 2.",
        "5": "Line 5 is the last line of `chrM_demo`, so it may be shorter.",
        "6": "A header line. Its description mentions soft-masking, which is allowed.",
        "7": "Lowercase means a soft-masked repeat: the same bases, flagged. It is not an error.",
        "8": "Line 8 is the last line of `chr1_tel`, so 16 bases is fine here.",
      },
      toolsSay:
        'samtools faidx 1.24 reports `Format error, unexpected "A" at line 4`. It took the short line as the end of the record, so read its message one line back.',
    },
  ],
} satisfies SpotTheErrorExercise;

// ---------------------------------------------------------------------------------------------
// L04.3 Quick check · fix-it (seq EX-04: FA-S01, FA-S03, FA-M01)

export const makeItIndexable = {
  id: "fasta-reference/make-it-indexable",
  kind: "fix-it",
  title: "Make this reference indexable",
  prompt:
    "Edit the file until it has no errors, and keep all 60 bases of `chrM_demo`. Then decide what to do with the second record.",
  source: "seq EX-04",
  tags: ["validity", "LO2"],
  formats: ["fasta"],
  concepts: ["fasta.structure-rules", "validity.severities"],
  starter: {
    filename: "ref.fa",
    format: "fasta",
    kind: "text",
    provenance: "toy",
    text:
      "# reference for case 042\n" +
      ">chrM_demo first 60 bp of GRCh38 chrM\n" +
      "GATCACAGGTCTATCACCCT\n" +
      "ATTAACCACTCACGGGAGCT\n" +
      "\n" +
      "CTCCATGCATTTGGTATTTT\n" +
      ">chrM_demo duplicate copy\n" +
      "GATCACAGGT\n",
  },
  // FA-M01 is a warning, so the key check counts warnings too; the goal makes it count.
  validation: {
    format: "fasta",
    profile: { include: ["FA-S01", "FA-S03", "FA-M01"] },
    severities: ["error", "warning"],
  },
  goals: [
    {
      id: "bases",
      text: "Keeps all 60 bases of `chrM_demo`",
      check: "fastaKeepsBases",
      args: { name: "chrM_demo", bases: CHRM_60 },
    },
    {
      id: "unique",
      text: "Uses each sequence name once",
      check: "fastaUniqueNames",
    },
  ],
  solution:
    ">chrM_demo first 60 bp of GRCh38 chrM\n" +
    "GATCACAGGTCTATCACCCT\n" +
    "ATTAACCACTCACGGGAGCT\n" +
    "CTCCATGCATTTGGTATTTT\n",
  expectStarterRules: ["FA-S01", "FA-M01", "FA-S03"],
  hints: [
    "Look at line 1, the blank line 5 and the header on line 7.",
    "A FASTA file starts with a `>` header (FA-S01), a record's sequence has no blank lines (FA-S03), and names are unique (FA-M01).",
    "Delete line 1 and the blank line. Then delete the last record, or rename it, for example to `>chrM_demo2`.",
  ],
} satisfies FixItExercise;
