// Exercises and standalone snippets for L07 (FASTQ in the wild),
// content/lessons/02-sequences/07-fastq-in-the-wild.md (docs/PLAN.md 5, L07.1-L07.3). One
// exported const per item; every export is registered by src/exercises/registry.ts. Pure
// TypeScript.
//
// Sources: seq 5, 6, 7, EX-05, EX-09, EX-10, EX-12. Every FASTQ and FASTA outcome below was
// checked by the research note with samtools 1.24 and Biopython 1.88; the content tests check
// the spot-the-error keys against src/validators/fastq.ts and recompute the predict keys.
import type { PredictExercise, Snippet, SortExercise, SpotTheErrorExercise } from "./types.ts";

// ---------------------------------------------------------------------------------------------
// L07.1 Quick check · predict (seq EX-10): a wrapped file whose quality lines start with `@`
// and `+`. The snippet is shown inside the predict card. A fourth item cuts the same file inside
// `r2` (FQ-S06), so the Recap's "A file that ends inside a record is Invalid" has practice.

const WRAPPED = [
  "@r1",
  "GATCACAGGTCTATCACC",
  "CTATTAACCACT",
  "+",
  "FFFFFFFFFF:FFFFFFF",
  "@FFFFFFFFFFF",
  "@r2",
  "GATGAGGCAGGAATCAAA",
  "+",
  "+FFFFFFFFFFFFFFFFF",
  "",
].join("\n");

/** Shown inside the L07.1 card. */
const WRAPPED_SNIPPET = {
  filename: "wrapped.fastq",
  format: "fastq",
  kind: "text",
  text: WRAPPED,
  provenance: "toy",
  caption: "A wrapped FASTQ file: its bases and qualities run over more than one line.",
} satisfies Snippet;

export const howManyRecords = {
  id: "fastq-in-the-wild/how-many-records",
  kind: "predict",
  title: "How many records are in this file?",
  prompt:
    "Read `wrapped.fastq` the way a FASTQ parser does: a record ends when its quality is as long as its sequence.",
  source: "seq EX-10",
  tags: ["application"],
  formats: ["fastq"],
  concepts: ["fastq.wrapped", "fastq.record", "fastq.truncation", "validity.verdicts"],
  snippet: WRAPPED_SNIPPET,
  items: [
    {
      id: "records",
      label: "Number of records",
      input: { type: "number", answer: 2, tolerance: 0 },
      computeWith: { helper: "fastqRecordCount", args: { text: WRAPPED } },
      reveal: "Two: `r1` and `r2`. Lines 6 and 10 only look like a title and a separator.",
    },
    {
      id: "r1-length",
      label: "Number of bases in `r1`",
      input: { type: "number", answer: 30, tolerance: 0 },
      computeWith: { helper: "fastqReadLength", args: { text: WRAPPED, record: 1 } },
      reveal: "18 + 12 = 30 bases on lines 2 and 3, so its quality also runs over two lines.",
    },
    {
      id: "line-6",
      label: "Line 6 starts with `@`. What is it?",
      input: {
        type: "choice",
        options: ["The title of a new record", "The rest of r1's quality", "A line parsers skip"],
        answer: 1,
      },
      reveal: "`r1` still needs 12 quality characters after line 5, so line 6 is quality: `@` is Q31.",
    },
    {
      id: "cut",
      label: "A transfer cuts the file after line 8, the bases of `r2`. What is its verdict?",
      input: { type: "choice", options: ["Valid", "Valid but unusable here", "Invalid"], answer: 2 },
      reveal:
        "Invalid: the file ends inside `r2`, after its bases and before its `+` line (FQ-S06). A lenient parser may still return both reads without an error.",
    },
  ],
  reveal:
    'A script that cuts every four lines gets nonsense here: its second "record" starts with qualities. Count quality characters until they match the bases; line 10\'s `+` is Q10.',
} satisfies PredictExercise;

// ---------------------------------------------------------------------------------------------
// L07.2 Try it · spot-the-error, three rounds (seq EX-09): FQ-S04, FQ-S03, FQ-S01.
// The record is seq 3.3's R1 (GRCh38 chrM:1-36). Round (b) repeats the whole title on the `+`
// line with only `1001` changed (seq verification log, correction 5).

const TITLE = "A00123:8:H7KJ2DSXY:2:1101:10004:1000 1:N:0:ACGTACGT+TGCATGCA";
const BASES = "GATCACAGGTCTATCACCCTATTAACCACTCACGGG";
const QUALITY = "FFFFFFFFFFFFFFF:FFFFFFFFFFFFFFF,FFFF";

const record = (filename: string, lines: string[]): Snippet => ({
  filename,
  format: "fastq",
  kind: "text",
  text: `${lines.join("\n")}\n`,
  provenance: "toy",
});
const FASTQ = { format: "fastq", profile: {} } as const;
const TITLE_FINE = "A well-formed title: `@`, the read ID, a space and the comment.";

export const threeBrokenRecords = {
  id: "fastq-in-the-wild/three-broken-records",
  kind: "spot-the-error",
  title: "Three broken records",
  prompt: "Each record has one line that breaks the FASTQ rules. Select that line, then select Check.",
  source: "seq EX-09",
  tags: ["validity", "LO2", "LO4"],
  formats: ["fastq"],
  concepts: ["fastq.structure-rules", "fastq.record", "validity.tools-say"],
  hints: [
    "Compare each record with the pattern: an `@` title, the bases, a `+` line that is bare or repeats the title, then one quality character per base.",
    "Compare the character counts of lines 2 and 4. Then compare line 3 with line 1, character by character.",
  ],
  rounds: [
    {
      id: "a",
      label: "Record (a)",
      snippet: record("record_a.fastq", [`@${TITLE}`, BASES, "+", QUALITY.slice(0, -1)]),
      granularity: "line",
      validation: FASTQ,
      answers: [
        {
          line: 4,
          rule: "FQ-S04",
          explanation:
            "Line 4 has 35 quality characters for 36 bases. Every base needs exactly one quality character (FQ-S04).",
        },
      ],
      fineHere: {
        "1": TITLE_FINE,
        "2": "36 bases, all from `ACGT`.",
        "3": "A bare `+` is the usual separator.",
      },
      toolsSay: "Biopython 1.88 and samtools 1.24 both reject this record.",
    },
    {
      id: "b",
      label: "Record (b)",
      snippet: record("record_b.fastq", [
        `@${TITLE}`,
        BASES,
        `+${TITLE.replace(":1000 ", ":1001 ")}`,
        QUALITY,
      ]),
      granularity: "line",
      validation: FASTQ,
      answers: [
        {
          line: 3,
          rule: "FQ-S03",
          explanation:
            "Line 3 repeats the title with `1001` where line 1 has `1000`. A repeated title must be identical (FQ-S03).",
        },
      ],
      fineHere: {
        "1": TITLE_FINE,
        "2": "36 bases, all from `ACGT`.",
        "4": "36 quality characters for 36 bases.",
      },
      toolsSay:
        "Biopython 1.88 rejects this record (`Sequence and quality captions differ`); samtools fqidx 1.24 accepts it.",
      toolsDisagree: true,
    },
    {
      id: "c",
      label: "Record (c)",
      snippet: record("record_c.fastq", [`>${TITLE}`, BASES, "+", QUALITY]),
      granularity: "line",
      validation: FASTQ,
      answers: [
        {
          line: 1,
          rule: "FQ-S01",
          explanation:
            "Line 1 starts with `>`, the FASTA header mark. A FASTQ record starts with `@` (FQ-S01).",
        },
      ],
      fineHere: {
        "2": "36 bases, all from `ACGT`.",
        "3": "A bare `+` is the usual separator.",
        "4": "36 quality characters for 36 bases.",
      },
      toolsSay: "Biopython 1.88 and samtools 1.24 both reject this record.",
    },
  ],
} satisfies SpotTheErrorExercise;

// ---------------------------------------------------------------------------------------------
// L07.3 Try it · sort (seq EX-05): eight files into seven bins. More than four bins, so each item
// has a "Place in" select (docs/PLAN.md 7.3). Items hide their identity (file_1.txt ...).

const item = (n: number, text: string): Snippet => ({
  filename: `file_${n}.txt`,
  format: "other",
  kind: "text",
  text,
  provenance: "toy",
  hideIdentity: true,
  // Markers show TABs as arrows and spaces as dots: separators are one of the cues.
  view: { whitespace: true },
});

export const whichFileIsThis = {
  id: "fastq-in-the-wild/which-file-is-this",
  kind: "sort",
  title: "Which file is this?",
  prompt:
    "Place each file in the bin that names what it is. Use the first character, the separators and the alphabet.",
  source: "seq EX-05",
  tags: ["recognition", "LO1"],
  formats: ["fasta", "fastq", "fai", "bed", "bgzf"],
  concepts: [
    "recognition.first-bytes",
    "fasta.record",
    "fastq.record",
    "fai.columns",
    "compression.gzip-vs-bgzf",
    "coords.zero-based",
  ],
  hints: [
    "Start with the first character. `>` and `@` each begin more than one kind of file here.",
    "Count the TAB-separated columns. A `.fai` row has five, and its last two differ by one.",
  ],
  bins: [
    { id: "fasta-nt", label: "Nucleotide FASTA" },
    { id: "fasta-protein", label: "Protein FASTA" },
    { id: "fastq", label: "FASTQ" },
    { id: "fai", label: ".fai index" },
    { id: "tab-header", label: "Not FASTA or FASTQ (TAB-separated header)" },
    { id: "bed", label: "BED" },
    { id: "invalid", label: "Invalid or can't tell" },
  ],
  items: [
    {
      id: "nucleotide",
      label: "File 1",
      content: item(
        1,
        ">chr1_tel GRCh38 chr1:10001-10036 soft-masked\ntaaccctaaccctaacccta\naccctaaccctaaccc\n",
      ),
      bin: "fasta-nt",
      why: "`>` starts a FASTA header, and the lines below use only `acgt`. Lowercase is soft-masked repeat sequence, not protein.",
    },
    {
      id: "protein",
      label: "File 2",
      content: item(2, ">sp|P69905|HBA_HUMAN Hemoglobin subunit alpha\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMF\n"),
      bin: "fasta-protein",
      why: "A FASTA header, but `E`, `F`, `L` and `P` are not nucleotide codes. This is the start of a UniProt protein record.",
    },
    {
      id: "sam-header",
      label: "File 3",
      content: item(3, "@SQ\tSN:chr1\tLN:248956422\tM5:6aef897c3d6ff0c78aff06ac189178dd\n"),
      bin: "tab-header",
      why: "It starts with `@`, but a two-letter code and TABs follow, and no bases. It is a SAM `@SQ` header line, which the SAM lesson covers.",
    },
    {
      id: "fai",
      label: "File 4",
      content: item(4, "chr1\t248956422\t112\t100\t101\n"),
      bin: "fai",
      why: "Five TAB-separated columns: a name, the length, the offset, bases per line and bytes per line. Read as BED, its start would exceed its end.",
    },
    {
      id: "bed",
      label: "File 5",
      content: item(5, "chr1\t10000\t10036\n"),
      bin: "bed",
      why: "Three TAB-separated columns: a name, then a 0-based start below the end. It is a BED interval covering chr1:10,001-10,036.",
    },
    {
      id: "fastq",
      label: "File 6",
      content: item(
        6,
        "@A00123:8:H7KJ2DSXY:2:1101:10004:1000 2:N:0:ACGTACGT+TGCATGCA\nGATGAGGCAGGAATCAAAGACAGATACTGCGACATA\n+\nFFFFF:FFFFFFFFFFFFFFFFFF:FFFF,FFF::F\n",
      ),
      bin: "fastq",
      why: "An `@` title with a space and a comment, then bases, a `+` line and one quality character per base.",
    },
    {
      id: "invalid",
      label: "File 7",
      content: item(7, ">r1\nACGT\n+\nIIII\n"),
      bin: "invalid",
      why: "It has FASTQ's four lines, but its title starts with `>`. It is neither valid FASTA nor valid FASTQ.",
      toolsSay: "Biopython 1.88 and samtools 1.24 both reject it.",
    },
    {
      id: "bgzf",
      label: "File 8",
      content: {
        filename: "file_8.bin",
        format: "bgzf",
        kind: "hex",
        hex: {
          head: "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00",
          annotations: [
            { from: 0, to: 2, label: "gzip magic" },
            { from: 2, to: 3, label: "method 8: DEFLATE" },
            { from: 12, to: 16, label: "BC extra subfield" },
          ],
        },
        provenance: "toy",
        hideIdentity: true,
      },
      bin: "invalid",
      why: "These bytes are BGZF: the gzip magic `1f 8b`, method `08`, then a `BC` subfield. BGZF can hold FASTA, FASTQ or BAM; decompress it to find out.",
    },
  ],
} satisfies SortExercise;
