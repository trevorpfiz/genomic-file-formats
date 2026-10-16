// Shared exercise data types (docs/PLAN.md section 7). This module is pure TypeScript with
// type-only exports: the lesson plugin loads exercise modules through Vite's module runner,
// the browser bundle imports them, and node tests import them directly.

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
/** "BED-S17", "CASE-03", "XF-12", ... */
export type RuleId = string;
export type Severity = "error" | "warning" | "convention";
export type Verdict = "valid" | "invalid" | "unusable-here";
export type Kind = "spot-the-error" | "fix-it" | "sort" | "field-explorer" | "simulator" | "predict" | "mcq";
export type Tag = "recognition" | "validity" | "application" | "concept" | "LO7";
/** Named goal checks that simulators and fix-its implement ("keepsRecords", "strands", ...). */
export type GoalCheckId = string;

/** Validator profiles and contexts are defined with the validators (M1+); kept open here. */
export type ValidatorProfile = string;
export interface ValidationContext {
  reference?: string;
  contigs?: Record<string, number>;
  folder?: string[];
}

export interface HexView {
  head: string;
  tail?: string;
  omittedBytes?: number;
  /** "gzip magic", "BC subfield", "EOF block" */
  annotations: { from: number; to: number; label: string }[];
  /** A short chip, e.g. "BAM\1..." or the decoded header text. */
  decoded?: string;
}

export interface Snippet {
  /** Shown in the viewer header; genericized when hideIdentity. */
  filename: string;
  format: FormatId;
  kind: "text" | "hex" | "compressed-text";
  /** Exact characters. TAB and CR are written as \t and \r escapes (docs/PLAN.md 11.2). */
  text?: string;
  /** Binaries, and the container view of compressed text (D-20). */
  hex?: HexView;
  /** compressed-text: the full decompressed text, precomputed. */
  decodedText?: string;
  /** Drives the "illustrative" label. */
  provenance: "toy" | "case" | "spec-example" | "real-file";
  /** Recognition items: no badge, file_07.txt. */
  hideIdentity?: boolean;
  /** D-27; "bytes" only for small toy binaries. */
  download?: "text" | "decompressed" | "bytes" | "none";
  view?: { whitespace?: boolean; aligned?: boolean; headerCollapsed?: boolean; lineInfo?: boolean };
}

export interface Validation {
  format: FormatId;
  profile: ValidatorProfile;
  context?: ValidationContext;
  /** In scope for key checks; default ["error"]. */
  severities?: Severity[];
}

export interface ExerciseBase {
  /** "<lesson-id>/<slug>", stable across reordering. */
  id: string;
  kind: Kind;
  /** Also the Quick check's H3 text. */
  title: string;
  prompt: string;
  /** "case EX-03", "seq EX-01 (re-keyed)" */
  source: string;
  tags: Tag[];
  formats: FormatId[];
  concepts: string[];
  hints?: string[];
  /** V-ids this item depends on (docs/PLAN.md 12.3). */
  verification?: string[];
  /** One card, one status. */
  followUps?: (PredictExercise | McqExercise | SpotTheErrorExercise)[];
  /** Set by the compiler inside :::read-more. */
  optional?: boolean;
}

export interface SpotTheErrorExercise extends ExerciseBase {
  kind: "spot-the-error";
  rounds: {
    snippet: Snippet;
    granularity: "line" | "field";
    validation: Validation;
    answers: { line: number; field?: string; rule: RuleId; explanation: string }[];
    acceptAlso?: { line: number; field?: string; note: string }[];
    /** "line:field" -> note */
    fineHere?: Record<string, string>;
    toolsSay?: string;
  }[];
}

export interface FixItExercise extends ExerciseBase {
  kind: "fix-it";
  starter: Snippet;
  validation: Validation;
  goals: { id: string; text: string; check: GoalCheckId; args?: unknown }[];
  /** A minimal valid answer; content tests validate it. */
  solution: string;
  /** The starter must fail with exactly these. */
  expectStarterRules: RuleId[];
  hints: [string, string, string];
}

export interface SortExercise extends ExerciseBase {
  kind: "sort";
  ordered?: boolean;
  matrix?: boolean;
  bins: { id: string; label: string }[];
  items: {
    id: string;
    content: string | Snippet;
    bin: string;
    why: string;
    validityFromValidator?: boolean;
    validation?: Validation;
  }[];
}

export interface FieldExplorerExercise extends ExerciseBase {
  kind: "field-explorer";
  snippet: Snippet;
  fields: { line: number; col: number; name: string; meaning: string; allowed?: string; cite: string }[];
  /** Required unless followUps are present. */
  check?: McqExercise;
}

export type PredictInput =
  | { type: "choice"; options: string[]; answer: number | number[] }
  | { type: "number"; answer: number; tolerance: number; unit?: string }
  | { type: "text"; answer: string; normalize?: ("case" | "whitespace")[] }
  | { type: "region"; answer: [number, number] };

export interface PredictExercise extends ExerciseBase {
  kind: "predict";
  items: { label: string; input: PredictInput }[];
  reveal: string;
  /** Required for number and region items, and for computable text. */
  computeWith?: string;
}

export interface McqExercise extends ExerciseBase {
  kind: "mcq";
  multi: boolean;
  stem: string;
  snippet?: Snippet;
  options: {
    id: string;
    text: string;
    correct: boolean;
    explanation: string;
    snippet?: Snippet;
    validation?: Validation;
    validityFromValidator?: boolean;
  }[];
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
  init: Record<string, unknown>;
  presets?: { label: string; state: Record<string, unknown> }[];
  /** e.g. L13.3 commits before the reveal. */
  predictGate?: PredictExercise;
  goals: {
    id: string;
    text: string;
    when: GoalCheckId;
    args?: unknown;
    explanation: string;
    /** Actions that reach the goal from init. */
    witness: unknown[];
  }[];
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

/** The five-state model shared by every exercise card (docs/PLAN.md section 7). */
export type ExerciseState = "idle" | "attempted" | "incorrect" | "correct" | "revealed";

/** Detail of the one bubbling `gf:solved` event a widget fires. */
export interface SolvedDetail {
  id: string;
  state: "correct" | "revealed";
  attempts: number;
  firstTry: boolean;
  revealed: boolean;
}
