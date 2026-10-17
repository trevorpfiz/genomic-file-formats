// Exercises and standalone snippets for L06 (From molecules to reads: FASTQ),
// content/lessons/02-sequences/06-fastq-reads.md (docs/PLAN.md 5, L06.1-L06.3). One exported
// const per item; every export is registered by src/exercises/registry.ts. Pure TypeScript.
//
// Sources: found 3.3-3.4, EX-05, EX-11; seq 2, 3.3, EX-06, EX-07; D-18 (case read names and
// quality bins). Field meanings in the read-name explorer stay generic until V-06 is checked.
import { CASE_FASTQ_FILES, fastqRecordText } from "../case/generated/fastq.ts";
import type {
  ExplorerField,
  FieldExplorerExercise,
  PredictExercise,
  RegisteredSnippet,
  SimulatorExercise,
} from "./types.ts";

// ---------------------------------------------------------------------------------------------
// L06.1 Quick check · predict (found EX-11): depth arithmetic, genome or exome?

export const genomeOrExome = {
  id: "fastq-reads/genome-or-exome",
  kind: "predict",
  title: "Genome or exome?",
  prompt:
    "One sample yields 60 million read pairs of 2×150 bases. Is it a genome or an exome? Use C = N·L/G over both sizes.",
  source: "found EX-11",
  tags: ["application"],
  formats: ["fastq"],
  concepts: ["sequencing.depth", "sequencing.exome-vs-genome"],
  items: [
    {
      id: "genome-depth",
      label: "Mean depth if these reads were spread over a 3.1-Gb genome",
      input: { type: "number", answer: 5.8, tolerance: 0.3, unit: "×" },
      computeWith: {
        helper: "meanDepth",
        args: { pairs: 60_000_000, readLength: 150, size: 3_100_000_000 },
      },
      reveal: "60 M pairs × 2 × 150 = 18 Gb, and 18 Gb ÷ 3.1 Gb is about 5.8×.",
    },
    {
      id: "exome-depth",
      label: "Raw mean depth if they were spread over a 40-Mb exome target",
      input: { type: "number", answer: 450, tolerance: 10, unit: "×" },
      computeWith: {
        helper: "meanDepth",
        args: { pairs: 60_000_000, readLength: 150, size: 40_000_000 },
      },
      reveal:
        "18 Gb ÷ 40 Mb = 450× raw. Off-target reads and duplicates bring the usable target depth well below that.",
    },
  ],
  reveal:
    "An exome: 5.8× is far too shallow for a genome. Depth is bases sequenced over the size of what was sequenced; a 30× genome needs about 620 M reads of 150 bases.",
} satisfies PredictExercise;

// ---------------------------------------------------------------------------------------------
// L06.2 Try it · simulator (found EX-05; seq EX-07): the Phred converter, then two predicts.
// `sum: false` hides the converter's quality-string sum, so the tool does not answer the
// follow-ups; their reveals give the sums (helpers recompute them).

export const qualityAsProbability = {
  id: "fastq-reads/quality-as-probability",
  kind: "simulator",
  simulator: "phred-converter",
  title: "Quality as probability",
  prompt:
    "Each quality character stands for a Phred score Q = −10·log10(P), where P is the chance that the base call is wrong. Enter `I`, `5`, `?` and `#` one at a time, and read each one's Q and P.",
  source: "found EX-05; seq EX-07",
  tags: ["application", "LO6"],
  formats: ["fastq"],
  concepts: ["quality.phred", "quality.phred33", "quality.expected-errors"],
  init: { q: 10, sum: false },
  goals: [
    {
      id: "decode",
      text: "Decode `I`, `5`, `?` and `#`.",
      when: "decoded",
      args: { chars: "I5?#" },
      explanation:
        "`I` is Q40, `?` Q30, `5` Q20 and `#` Q2. Each step of 10 in Q is ten times fewer errors: P = 0.0001, 0.001, 0.01 and 0.63.",
      witness: [
        { type: "char", char: "I" },
        { type: "char", char: "5" },
        { type: "char", char: "?" },
        { type: "char", char: "#" },
      ],
    },
  ],
  followUps: [
    {
      id: "twenty-bases",
      kind: "predict",
      prompt:
        "The expected number of errors in a read is the sum of its bases' error probabilities. Predict it for this quality string.",
      items: [
        {
          id: "sum",
          label: "Expected errors in `IIIIIIIIII5555555555`",
          input: { type: "number", answer: 0.101, tolerance: 0.005 },
          computeWith: { helper: "expectedErrors", args: { quality: "IIIIIIIIII5555555555" } },
        },
      ],
      reveal:
        "10 × 0.0001 + 10 × 0.01 = 0.101. The ten Q20 bases contribute 99% of it, although they are only half the read.",
    },
    {
      id: "one-bad-base",
      kind: "predict",
      prompt: "Now a read of five bases, four of them excellent.",
      items: [
        {
          id: "sum",
          label: "Expected errors in `IIII#`",
          input: { type: "number", answer: 0.6314, tolerance: 0.005 },
          computeWith: { helper: "expectedErrors", args: { quality: "IIII#" } },
        },
      ],
      reveal:
        "`#` is Q2, so P = 0.631. The four Q40 bases add only 0.0004, giving 0.6314. One bad base outweighs many good ones, so never average Q values.",
    },
  ],
  textView: "table",
} satisfies SimulatorExercise;

// ---------------------------------------------------------------------------------------------
// L06.3 Quick check · field-explorer (seq EX-06): the R1 record of seq 3.3's chrM pair.
// R1 = GRCh38 chrM:1-36; R2 (in the check) = the reverse complement of chrM:115-150.

const R1_TITLE = "@A00123:8:H7KJ2DSXY:2:1101:10004:1000 1:N:0:ACGTACGT+TGCATGCA";
const R2_TITLE = "@A00123:8:H7KJ2DSXY:2:1101:10004:1000 2:N:0:ACGTACGT+TGCATGCA";
const R1_RECORD = `${R1_TITLE}\nGATCACAGGTCTATCACCCTATTAACCACTCACGGG\n+\nFFFFFFFFFFFFFFF:FFFFFFFFFFFFFFF,FFFF\n`;

/**
 * Character spans of the title's parts, 0-based half-open: the read id's seven colon fields
 * (x and y as one "x:y" part), then the comment's four.
 */
function titleSpans(title: string): [number, number][] {
  const space = title.indexOf(" ");
  const spans: [number, number][] = [];
  const split = (from: number, to: number) => {
    let start = from;
    for (let i = from; i <= to; i += 1) {
      if (i === to || title[i] === ":") {
        spans.push([start, i]);
        start = i + 1;
      }
    }
  };
  split(1, space); // after the "@"
  const xy = spans.splice(5, 2);
  spans.splice(5, 0, [xy[0]![0], xy[1]![1]]);
  split(space + 1, title.length);
  return spans;
}

const ILLUMINA = "Illumina read names (CASAVA 1.8 and later)";
const [instrument, run, flowcell, lane, tile, xy, read, filtered, control, index] = titleSpans(R1_TITLE);
const titleField = (
  span: [number, number] | undefined,
  name: string,
  meaning: string,
  extra: { allowed?: string; cite?: string; verification?: string[] } = {},
): ExplorerField => ({
  line: 1,
  span: span ?? [0, 1],
  name,
  meaning,
  cite: extra.cite ?? ILLUMINA,
  verification: extra.verification ?? ["V-06"],
  ...(extra.allowed ? { allowed: extra.allowed } : {}),
});

export const readPairTitles = {
  id: "fastq-reads/read-pair-titles",
  kind: "field-explorer",
  title: "What must match between R1 and R2?",
  prompt: "Explore each part of this R1 record, then answer the question below it.",
  source: "seq EX-06; seq 3.3",
  tags: ["concept", "LO1"],
  formats: ["fastq"],
  concepts: ["fastq.record", "fastq.read-id", "sequencing.paired-end"],
  snippet: {
    filename: "chrM_R1.fastq",
    format: "fastq",
    kind: "text",
    text: R1_RECORD,
    provenance: "toy",
  },
  fields: [
    titleField(instrument, "instrument", "The sequencing instrument's serial number. This one is fictional."),
    titleField(run, "run", "The run number on that instrument."),
    titleField(flowcell, "flow cell", "The ID of the flow cell, the slide the run used."),
    titleField(lane, "lane", "The lane of the flow cell that held this library."),
    titleField(tile, "tile", "One imaged area of the lane."),
    titleField(
      xy,
      "x:y",
      "Where the read's cluster sat on the tile. Duplicate markers use these to spot optical duplicates.",
    ),
    titleField(read, "read number", "`1` for R1. Its mate in the R2 file has `2` here.", {
      allowed: "`1` or `2`",
    }),
    titleField(
      filtered,
      "is filtered",
      "`N`: the read passed the instrument's filter. `Y` marks a read that failed it.",
      {
        allowed: "`Y` or `N`",
        cite: `${ILLUMINA}; \`samtools import\` sets the QCFAIL flag for \`Y\``,
        verification: [],
      },
    ),
    titleField(control, "control", "`0` when no control bits are set."),
    titleField(
      index,
      "index",
      "The index (barcode) reads that tell the samples of a multiplexed run apart. Two indexes are joined by `+`.",
    ),
    {
      line: 2,
      span: [0, 36],
      name: "sequence",
      meaning: "36 bases: the first 36 of GRCh38 chrM.",
      allowed: "IUPAC letters, usually `ACGTN`; no spaces or TABs",
      cite: "Cock et al. 2010",
    },
    {
      line: 3,
      span: [0, 1],
      name: "separator",
      meaning: "Ends the bases. It may repeat the title exactly, but it is usually a bare `+`.",
      cite: "Cock et al. 2010",
    },
    {
      line: 4,
      span: [0, 36],
      name: "quality",
      meaning: "One character per base: `F` is Q37, `:` Q25 and `,` Q11.",
      allowed: "`!` to `~`, exactly as many characters as bases",
      cite: "Cock et al. 2010; SAMv1 §1.4 (QUAL)",
    },
  ],
  check: {
    id: "check",
    kind: "mcq",
    prompt: `Its mate, the first record of the R2 file, has the title \`${R2_TITLE}\`.`,
    multi: true,
    stem: "Which parts must be identical in the two reads of a pair?",
    options: [
      {
        id: "read-id",
        text: "The read ID: everything before the space",
        correct: true,
        explanation:
          "Both reads come from one DNA fragment, so the read ID matches. Aligners such as bwa compare it to check the pairing.",
      },
      {
        id: "index",
        text: "The index at the end of the comment",
        correct: true,
        explanation: "Both reads belong to the same library, so they carry the same index reads.",
      },
      {
        id: "read-number",
        text: "The read number at the start of the comment",
        correct: false,
        explanation: "This is the one part that differs: `1` in R1 and `2` in R2.",
      },
      {
        id: "sequence",
        text: "The sequence line",
        correct: false,
        explanation: "R1 and R2 read opposite ends of the fragment, so their bases differ.",
      },
    ],
  },
} satisfies FieldExplorerExercise;

// ---------------------------------------------------------------------------------------------
// Case: the first record of Noa's R1 file (src/case/generated/fastq.ts; D-18 names and bins).

const probandR1 = CASE_FASTQ_FILES.find((f) => f.sample === "P042-proband" && f.read === 1);

export const noaFirstRead = {
  id: "fastq-reads/noa-first-read",
  filename: "P042-proband_S1_L001_R1_001.fastq",
  format: "fastq",
  kind: "text",
  text: probandR1?.records[0] ? fastqRecordText(probandR1.records[0]) : "",
  provenance: "case",
  caption:
    "The first record of Noa's R1 file, `P042-proband_S1_L001_R1_001.fastq.gz`, decompressed: 150 bases with binned qualities, the same layout as above. Read names and qualities are illustrative. This read happens to show only three of the four quality values: no base drew `#`.",
} satisfies RegisteredSnippet;
