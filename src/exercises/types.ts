// Shared exercise and quiz data types: the contract between content modules, widgets, the
// lesson compiler and the content tests (docs/PLAN.md section 7, 6.1; docs/ARCHITECTURE.md).
//
// Type-only module, pure TypeScript. Exercise modules (`src/exercises/<lesson-id>.ts`) and quiz
// modules (`src/quizzes/<section>.ts`) import from here with `import type`; the lesson plugin
// loads them through Vite's module runner, the browser bundle imports them, and node tests
// import them directly. Nothing here may import DOM or Vite-only code.
//
// Conventions used throughout:
// - Line numbers are 1-based and count lines of `Snippet.text` (or of the decoded text).
// - Columns (`col`) are 1-based TAB-separated fields; character spans are 0-based, half-open.
// - Field names (`field`) are the names in the format's schema ("chromStart", "QUAL"), never
//   column numbers, so keys survive a change of column order in an explanation.
// - Prose in data follows the style guide (docs/PLAN.md 12.6): plain, short, second person,
//   no emoji, no text glyphs for marks; explanations at most 40 words, per-option at most 30.

import type { ValidationContext, ValidatorProfile } from "../validators/types.ts";

// ---------------------------------------------------------------------------------------------
// Identifiers and vocabularies

/** The formats and companions the course names (docs/PLAN.md 7, D-07). */
export type FormatId =
  | "fasta"
  | "fai"
  | "gzi"
  | "fastq"
  | "bed"
  | "bedgraph"
  | "bedpe"
  | "wig"
  | "gtf"
  | "gff3"
  | "sam"
  | "bam"
  | "bai"
  | "csi"
  | "cram"
  | "crai"
  | "vcf"
  | "gvcf"
  | "tbi"
  | "paf"
  | "gfa"
  | "gaf"
  | "ped"
  | "gzip"
  | "bgzf"
  | "blast6"
  | "interval_list"
  | "other";

/** A validator rule id from the research notes: "FA-S02", "FQ-S06", "CASE-14", "XF-12". */
export type RuleId = string;
export type Severity = "error" | "warning" | "convention";
/** The three verdicts defined in L02 (D-08, D-11). */
export type Verdict = "valid" | "invalid" | "unusable-here";
export type Kind = "spot-the-error" | "fix-it" | "sort" | "field-explorer" | "simulator" | "predict" | "mcq";

/** Course learning objectives (docs/PLAN.md 3.1). */
export type ObjectiveId = "LO1" | "LO2" | "LO3" | "LO4" | "LO5" | "LO6" | "LO7" | "LO8";

/**
 * Assessment tags (docs/PLAN.md 1.3, 6.1). `recognition`: names a format from its cues.
 * `validity`: judges a file against rules. `application`: a novel snippet or a computation.
 * `concept`: checks understanding of an idea without a file. An objective id marks what the item
 * assesses (every quiz needs a slot tagged LO7; LO5 slots avoid the case integers).
 */
export type Tag = "recognition" | "validity" | "application" | "concept" | ObjectiveId;

/**
 * A concept id, `<area>.<name>` in lowercase kebab parts: "fasta.line-width",
 * "quality.phred". Lessons declare them in frontmatter `introduces`/`requires`;
 * content/course.ts maps each to the page that introduces it (D-37).
 */
export type ConceptId = string;
/** "<lesson-id>/<slug>", stable across reordering: "fasta-reference/why-wont-this-index". */
export type ExerciseId = string;
/** A section id from content/course.ts: "sequences". */
export type SectionId = string;
/** A named goal check that a simulator model or a fix-it goal implements ("keepsRecords"). */
export type GoalCheckId = string;
/** A named arithmetic helper the content tests use to recompute keys ("faiByte", "phredSum"). */
export type HelperId = string;
/** A verification register id (docs/PLAN.md 12.4): "V-06". */
export type VerificationId = string;

// ---------------------------------------------------------------------------------------------
// Snippets (rendered by the snippet, hex and compressed-text viewers, docs/PLAN.md 7.8)

export interface HexAnnotation {
  /** 0-based byte offset into the shown bytes (head, then tail as if contiguous after the gap). */
  from: number;
  /** Exclusive end offset. */
  to: number;
  /** "gzip magic", "BC subfield", "28-byte EOF block". */
  label: string;
}

export interface HexView {
  /** Space-separated lowercase hex bytes: "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00". */
  head: string;
  /** The last bytes, when only head and tail are shown. */
  tail?: string;
  /** Bytes not shown between head and tail. */
  omittedBytes?: number;
  annotations: HexAnnotation[];
  /** A short decoded chip ("BAM\1...") or the decoded header text. */
  decoded?: string;
}

export interface Snippet {
  /** Shown in the viewer header; genericized ("file_07.txt") when hideIdentity is set. */
  filename: string;
  format: FormatId;
  kind: "text" | "hex" | "compressed-text";
  /**
   * Exact characters. TAB and CR are written as `\t` and `\r` escapes (a test rejects raw
   * U+000D under src/). A missing final newline is meaningful and is shown by the viewer.
   */
  text?: string;
  /** Binaries, and the container view of compressed text (D-20). */
  hex?: HexView;
  /** compressed-text only: the full decompressed text, precomputed. */
  decodedText?: string;
  /** Drives the "illustrative" label: toy and case data are illustrative. */
  provenance: "toy" | "case" | "spec-example" | "real-file";
  /** Recognition items: no format badge, a generic filename. */
  hideIdentity?: boolean;
  /** D-27: "bytes" only for small toy binaries. Default "text" for text snippets, "none" otherwise. */
  download?: "text" | "decompressed" | "bytes" | "none";
  /** Author defaults for the viewer toggles (docs/PLAN.md 7.8; ux 7.2). */
  view?: { whitespace?: boolean; aligned?: boolean; headerCollapsed?: boolean; lineInfo?: boolean };
  /**
   * Field names for the aligned view and "View as table", overriding the format schema
   * (for example a `.fai` row or a FASTQ header split on ':').
   */
  columns?: string[];
  /**
   * A caption under the viewer (inline marks render). Shown where the snippet stands as a
   * figure: `::snippet` and a predict's snippet.
   */
  caption?: string;
}

/** A snippet registered on its own for `::snippet{id="..."}` (an export of a lesson module). */
export interface RegisteredSnippet extends Snippet {
  /** "<lesson-id>/<slug>", like an exercise id; the registry kind is "snippet". */
  id: string;
}

// ---------------------------------------------------------------------------------------------
// Validation (the runtime/test-only split is in docs/PLAN.md 8.2)

/** How a snippet is validated, for fix-it live checks and for the content tests' key checks. */
export interface Validation {
  format: FormatId;
  /** Which rules apply (include/exclude/escalate) and in which mode. */
  profile: ValidatorProfile;
  /** Contigs, reference bases, companions or a folder for cross-file rules. */
  context?: ValidationContext;
  /** Severities in scope for key checks; default ["error"]. */
  severities?: Severity[];
}

// ---------------------------------------------------------------------------------------------
// Exercises

export interface ExerciseBase {
  id: ExerciseId;
  kind: Kind;
  /** A Quick check's H3 text, and the card's accessible name; unique within the lesson. */
  title: string;
  /** The task, one or two sentences, shown above the widget body. */
  prompt: string;
  /** Where the item comes from: "seq EX-01", "case EX-03 (re-keyed)". */
  source: string;
  tags: Tag[];
  formats: FormatId[];
  /** Concepts the item practises; each must be introduced at or before its lesson. */
  concepts: ConceptId[];
  /** The hint ladder, revealed one at a time (fix-it needs exactly three). */
  hints?: string[];
  /** V-ids this item depends on; graded items may list only confirmed ones (12.3). */
  verification?: VerificationId[];
  /** Questions in the same card, sharing its status and progress record (one card, one status). */
  followUps?: FollowUp[];
  /** Overrides the card's default how-to line for this type. */
  howTo?: string;
  /**
   * Derived, never authored: the compiler marks exercises inside `:::read-more` as optional
   * (`WidgetRef.optional`, `data-optional` on the element). Leave unset in data.
   */
  optional?: boolean;
}

/** One round of a spot-the-error exercise: one snippet, one or more planted errors. */
export interface SpotRound {
  /** Stable within the exercise ("a", "round-c"); keys the round's saved answer. */
  id: string;
  /** Shown above the round when there are several: "Record (a)", "Round C". */
  label?: string;
  /** Round-specific instruction; defaults to the exercise prompt. */
  prompt?: string;
  snippet: Snippet;
  granularity: "line" | "field";
  /** Content tests: answers ⊆ diagnostics ⊆ answers ∪ acceptAlso, on (line, field, rule). */
  validation: Validation;
  answers: { line: number; field?: string; rule: RuleId; explanation: string }[];
  /** Knock-on errors: picking them is not marked wrong, and the reveal shows them as knock-ons. */
  acceptAlso?: { line: number; field?: string; note: string }[];
  /** Notes for tempting picks that are fine. Keys: "3" (a line) or "3:chromStart" (a field). */
  fineHere?: Record<string, string>;
  /** Shown on reveal: "Tools say: samtools fqidx 1.24 accepts this record." */
  toolsSay?: string;
  /** Shows a "Tools disagree" badge with toolsSay (L07.2 round b). */
  toolsDisagree?: boolean;
}

export interface SpotTheErrorExercise extends ExerciseBase {
  kind: "spot-the-error";
  rounds: SpotRound[];
  /** Quiz variants: one round with exactly one answer, and one selection allowed. */
  singlePick?: boolean;
}

/** A fix-it goal: a named check with arguments, so learners cannot pass by deleting content. */
export interface FixItGoal {
  id: string;
  /** "Keeps both records". */
  text: string;
  check: GoalCheckId;
  args?: unknown;
}

export interface FixItExercise extends ExerciseBase {
  kind: "fix-it";
  starter: Snippet;
  /** Live validation uses runtime rules only (D-11, 8.2). */
  validation: Validation;
  goals: FixItGoal[];
  /** A minimal valid answer; content tests validate it and the "Show solution" diff uses it. */
  solution: string;
  /** The starter must fail with exactly these rules (within validation.severities). */
  expectStarterRules: RuleId[];
  /** 1: where to look; 2: which rule; 3: what to type. */
  hints: [string, string, string];
}

/** A sort bin. Verdict bins carry `verdict` so validator-backed items can be checked. */
export interface SortBin {
  id: string;
  label: string;
  verdict?: Verdict;
}

export interface SortItem {
  id: string;
  /** Plain text (inline code in backticks is rendered as code), or a snippet or hex excerpt. */
  content: string | Snippet;
  /** Accessible name and drag-ghost label when content is a snippet: "Item 3: a TAB-separated line". */
  label?: string;
  /** The key: a bin id. In an ordered sort, the single bin's id. */
  bin: string;
  /** The "Why?" text, at most 40 words. */
  why: string;
  /** Shown on reveal next to why, never as a bin (L09.3). */
  toolsSay?: string;
  /** With validityFromValidator, content tests require verdictOf(diagnostics) = the bin's verdict. */
  validation?: Validation;
  validityFromValidator?: boolean;
}

export interface SortExercise extends ExerciseBase {
  kind: "sort";
  /** Ordered variant: one bin, and the authored item order is the key (Move up/Move down). */
  ordered?: boolean;
  /** Matrix variant: one select per item row instead of bins (L01.3). */
  matrix?: boolean;
  bins: SortBin[];
  items: SortItem[];
}

/** Where a field sits: a TAB-separated column, or a character span for headers and tokens. */
export type FieldAt =
  | { line: number; col: number; span?: never }
  | { line: number; span: [start: number, end: number]; col?: never };

export type ExplorerField = FieldAt & {
  /** Schema name: "QNAME", "lane", "M5". */
  name: string;
  /** What the field means, grounded in this record's value. */
  meaning: string;
  /** Allowed values or type: "a positive integer", "`+`, `-` or `.`". */
  allowed?: string;
  /** "SAMv1 §1.4", "faidx(5)". */
  cite: string;
  verification?: VerificationId[];
};

interface FieldExplorerBase extends ExerciseBase {
  kind: "field-explorer";
  snippet: Snippet;
  fields: ExplorerField[];
}

/**
 * Exploring alone never completes the exercise: it ends with an embedded check, or with
 * follow-ups that apply what the fields mean (docs/PLAN.md 7.4). The type enforces one of them.
 */
export type FieldExplorerExercise = FieldExplorerBase &
  (
    | { check: EmbeddedMcq; followUps?: FollowUp[] }
    | { check?: undefined; followUps: [FollowUp, ...FollowUp[]] }
  );

/** A reference to a content-test helper that recomputes a key (11.6). */
export interface ComputeRef {
  helper: HelperId;
  args?: Record<string, unknown>;
}

export type PredictInput =
  /** Single choice when answer is a number, multi-select when it is an array. */
  | { type: "choice"; options: string[]; answer: number | number[] }
  | { type: "number"; answer: number; tolerance: number; unit?: string }
  | { type: "text"; answer: string; normalize?: ("case" | "whitespace")[] }
  /** 1-based closed [start, end] picked on a ruler, with number inputs as the keyboard path. */
  | { type: "region"; answer: [number, number] };

export interface PredictItem {
  /** Stable within the exercise; defaults to the item index when omitted. */
  id?: string;
  /** The input's visible label. */
  label: string;
  input: PredictInput;
  /** A per-item reveal row (multi-item predicts). */
  reveal?: string;
  /** Required for number and region items and for computable text (content tests). */
  computeWith?: ComputeRef;
}

export interface PredictExercise extends ExerciseBase {
  kind: "predict";
  /** Shown inside the card above the items (the file the prediction is about). */
  snippet?: Snippet;
  items: PredictItem[];
  /** The reveal panel text, shown after "Lock in my prediction". */
  reveal: string;
}

export interface McqOption {
  id: string;
  text: string;
  correct: boolean;
  /** Shown per option after Check or Submit; at most 30 words. */
  explanation: string;
  snippet?: Snippet;
  /** With validityFromValidator, content tests check the option's correctness against verdictOf. */
  validation?: Validation;
  validityFromValidator?: boolean;
}

export interface McqExercise extends ExerciseBase {
  kind: "mcq";
  /** Multi-select ("Select all that apply") when true. A single-select has exactly one correct option. */
  multi: boolean;
  /** The question, rendered as the fieldset legend. */
  stem: string;
  snippet?: Snippet;
  options: McqOption[];
  /**
   * An arithmetic mcq's key: content tests recompute the number with this helper and check that
   * it appears in the correct option only (src/validators/keys.ts).
   */
  computeWith?: ComputeRef;
}

export interface SimulatorGoal {
  id: string;
  /** "Find the byte that holds base 45." */
  text: string;
  /** A goal check of the simulator's model. */
  when: GoalCheckId;
  args?: unknown;
  /** Shown when the goal is reached. */
  explanation: string;
  /** Actions that reach the goal from `init`; content tests replay them through the model. */
  witness: unknown[];
}

export type SimulatorId =
  | "coordinate-ruler"
  | "fai-calculator"
  | "bgzf-demo"
  | "phred-converter"
  | "cigar-drawer"
  | "flag-decoder"
  | "exon-dip-explorer"
  | "gvcf-expander"
  | "exon-frame-calculator"
  | "junction-drawer"
  | "gfa-drawer"
  | "microhomology-slider";

export interface SimulatorExercise extends ExerciseBase {
  kind: "simulator";
  simulator: SimulatorId;
  /** Passed to the model's `init`. */
  init: Record<string, unknown>;
  /** Preset chips with real values: "Broad chr1", "UCSC chr1". */
  presets?: { label: string; state: Record<string, unknown> }[];
  /** A prediction committed before the simulator opens (L13.3). */
  predictGate?: EmbeddedPredict;
  /** One to three goals; the exercise is correct when all are reached. */
  goals: SimulatorGoal[];
  /** Required: the text view that screen readers, print and keyboard users get. */
  textView: "table" | "list" | "log";
}

export type Exercise =
  | SpotTheErrorExercise
  | FixItExercise
  | SortExercise
  | FieldExplorerExercise
  | SimulatorExercise
  | PredictExercise
  | McqExercise;

/** The exercise type for one kind: `ExerciseOf<"mcq">` is McqExercise. */
export type ExerciseOf<K extends Kind> = Extract<Exercise, { kind: K }>;

// ---------------------------------------------------------------------------------------------
// Embedded questions: follow-ups, embedded checks and predict gates

/**
 * A question inside another card. It shares the parent's status and progress record, so it has
 * no source, tags, formats or concepts of its own (the parent's apply), and its `id` is local to
 * the parent ("check", "expected-errors"). Its answer is saved inside the parent's answer.
 */
type Embedded<T extends ExerciseBase> = Omit<
  T,
  "id" | "title" | "source" | "tags" | "formats" | "concepts" | "followUps" | "optional"
> & {
  /** Unique within the parent exercise. */
  id: string;
  /** Optional heading-free label shown above the question. */
  title?: string;
  /** Extra concepts the follow-up practises beyond the parent's. */
  concepts?: ConceptId[];
};

export type EmbeddedPredict = Embedded<PredictExercise>;
export type EmbeddedMcq = Embedded<McqExercise>;
export type EmbeddedSpot = Embedded<SpotTheErrorExercise>;
/** docs/PLAN.md 7: follow-ups are predict, mcq or spot-the-error questions. */
export type FollowUp = EmbeddedPredict | EmbeddedMcq | EmbeddedSpot;

// ---------------------------------------------------------------------------------------------
// Card state and events (docs/PLAN.md 7; ux 8.2)

/** The five-state model shared by every exercise card. */
export type ExerciseState = "idle" | "attempted" | "incorrect" | "correct" | "revealed";

/** Detail of the one bubbling `gf:solved` event a card fires when it first completes. */
export interface SolvedDetail {
  id: ExerciseId;
  state: "correct" | "revealed";
  attempts: number;
  firstTry: boolean;
  revealed: boolean;
}

/** Detail of the bubbling `gf:statechange` event a card fires on every state change. */
export interface StateChangeDetail {
  id: ExerciseId;
  state: ExerciseState;
  attempts: number;
}

// ---------------------------------------------------------------------------------------------
// Quizzes (docs/PLAN.md 6.1, D-09, D-30)

/**
 * Quiz variants are whole questions of the allowed types; no fix-it in quizzes. A variant that
 * tests another heading than its slot's names it in `tests` ("<lesson-id>#<heading-id>"); the
 * results panel's "Review:" link then uses it (quiz.ts), and the quiz checks validate it too.
 */
export type QuizVariant = (McqExercise | PredictExercise | SpotTheErrorExercise | SortExercise) & {
  tests?: string;
};

/** A seeded random source. Same seed, same sequence; the quiz page owns the seeds. */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

/**
 * A parametric slot's generator (computation slots). Pure: the same Rng state gives the same
 * variant. Content tests call it with many seeds and recompute each key with the helpers.
 */
export interface ParametricGenerator<V extends QuizVariant = QuizVariant> {
  /** Stable name, recorded with an attempt so a reload regenerates the same question. */
  id: string;
  generate(rng: Rng): V;
}

export interface QuizSlot {
  /** "2.1" ... "2.6": the slot number within its quiz. */
  id: string;
  /** The lesson heading the slot tests, "<lesson-id>#<heading-id>", for "Review:" links. */
  tests: string;
  tags: Tag[];
  /** Identical across variants; introduced outside Read-more, in this section or earlier. */
  concepts: ConceptId[];
  verification?: VerificationId[];
  /**
   * Authored variants, at least two (retakes cycle through them), or at least one plus a
   * generator. Variant ids: "quiz-<section>/<slot>/<letter>", for example "quiz-sequences/2.1/a".
   */
  variants: QuizVariant[];
  generator?: ParametricGenerator;
}

/** One lookup table or formula on the quiz's Reference card. */
export type ReferenceItem =
  | { kind: "table"; caption: string; columns: string[]; rows: string[][] }
  | { kind: "formula"; label: string; formula: string; note?: string }
  | { kind: "text"; text: string };

/**
 * The collapsible card at the top of a quiz: lookup tables only. Never coordinate conventions,
 * verdict definitions or recognition cues, because those are what the quiz assesses.
 */
export interface ReferenceCard {
  title: string;
  items: ReferenceItem[];
}

export interface Quiz {
  section: SectionId;
  /** "Section quiz: Sequences". */
  title: string;
  /** Six slots in M1+ (an empty array only in a stub). */
  slots: QuizSlot[];
  /** 5 of 6 (D-09). */
  passMark: number;
  referenceCard: ReferenceCard;
}
