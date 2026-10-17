// The validator contract (docs/PLAN.md 8.1-8.5, D-11). Pure TypeScript, DOM-free: content tests,
// unit tests, fix-it widgets and the test-time capstone key builder share it.
//
// One validator per format lives in src/validators/<format>.ts. Rules used by a fix-it profile
// ship in the browser (`runtime: true`); every other rule lives in test-only modules the build
// never imports, and its messages are listed in src/validators/test-only-messages.json so that
// check-dist can prove none of them reaches dist/index.html (8.2).

import type { FormatId, HexView, RuleId, Severity, Snippet, Verdict } from "../exercises/types.ts";

/**
 * What one rule's violation does to a file's verdict (D-11):
 * - "invalid": an error that states something false or breaks the format;
 * - "unusable-here": a missing dependency, a naming-convention mismatch with identical lengths,
 *   or a convention this analysis's tools require (BGZF + index, single TABs);
 * - "none": does not decide a verdict (every warning, and conventions no tool here needs).
 */
export type VerdictEffect = "invalid" | "unusable-here" | "none";

/** One finding. One diagnostic per root cause: knock-on lines produce none (8.2). */
export interface Diagnostic {
  rule: RuleId;
  severity: Severity;
  /**
   * Copied from the rule's RuleMeta when the diagnostic is made, or set per instance where the
   * notes make the mapping depend on context (VCF-M15: "unusable-here" for a naming-only
   * mismatch, "invalid" when a declared length contradicts the data). verdictOf reads it.
   */
  verdict: VerdictEffect;
  /**
   * 1-based line in the validated text (for folder rules, in `file`). 0 when the problem has no
   * line: container and binary summaries, or a row missing from a whole file.
   */
  line: number;
  /** 1-based character column within the line, when the problem has a position. */
  col?: number;
  /** Field name from the format schema ("chromStart", "QUAL"), when the problem is one field. */
  field?: string;
  /** Folder (cross-file) rules: the file the diagnostic is about. */
  file?: string;
  /** Binary summaries: the 0-based, half-open byte range of the shown bytes (as HexAnnotation). */
  bytes?: [from: number, to: number];
  /**
   * Plain-language problem in the 8.4 template, without the rule id and spec, which the UI
   * appends: "Line 4: quality has 35 characters for 36 bases."
   */
  message: string;
  /** Values exactly as they appear in the file; the UI shows them in code chips. */
  found?: string;
  expected?: string;
  /** "Cock et al. 2010", "faidx(5)", "SAMv1 v1.6 §1.4". */
  spec: string;
  /** "Tools say: samtools fqidx 1.24 accepts this." Describes tools; never decides a verdict. */
  toolsSay?: string;
}

/** Static facts about a rule. Every rule a validator can emit has exactly one. */
export interface RuleMeta {
  id: RuleId;
  format: FormatId | "cross-file";
  severity: Severity;
  /** The default verdict mapping (D-11; per-format calls in 8.3). */
  verdict: VerdictEffect;
  /**
   * True when a fix-it profile uses the rule, so its code, message, spec citation and
   * "Tools say" text ship in the browser. False rules are test-only and must never reach dist.
   */
  runtime: boolean;
  /** One line for the rule-usage report and the Problems list: "Quality length equals sequence length". */
  summary: string;
  /** Default citation for diagnostics of this rule. */
  spec: string;
  toolsSay?: string;
  /**
   * What samtools/htslib 1.24 does with a violation, for the "tool" profile mode: a severity it
   * reports, or "accepts" (silently). Unset means the tools agree with the course severity.
   */
  toolSeverity?: Severity | "accepts";
}

/**
 * Which rules apply in one exercise (8.5). With no profile every rule of the format applies at
 * its own severity. `include` narrows to the listed rules; `exclude` removes rules; `escalate`
 * raises the listed warnings or conventions to error (for example FA-M01 against `@SQ`); an
 * escalated diagnostic gets severity "error" and verdict "invalid".
 * "tool" mode reports what samtools/htslib would enforce, for "Tools say" comparisons: rules
 * whose RuleMeta.toolSeverity is "accepts" are dropped, and other toolSeverity values replace
 * the course severity (escalate does not apply in tool mode).
 */
export interface ValidatorProfile {
  include?: RuleId[];
  exclude?: RuleId[];
  escalate?: RuleId[];
  mode?: "strict" | "tool";
}

/** Reference bases over a 0-based half-open range, for REF and rank-0 segment checks. */
export type ReferenceLookup = (chrom: string, start0: number, end0: number) => string | undefined;

/** Facts a validator cannot read from the snippet itself (8.2 "Context"). */
export interface ValidationContext {
  /** Contig name -> length, from a .fai or .dict. */
  contigs?: Record<string, number>;
  /** Contig name -> MD5 (M5). */
  md5?: Record<string, string>;
  reference?: ReferenceLookup;
  /** BED's declared type, e.g. "bed9+1" (BED-S03). */
  declaredType?: string;
  /** VCF or GFA declared version, when not in the snippet. */
  version?: string;
  /**
   * Companion files by role: "fasta" (the FASTA text a .fai indexes), "fai" (a .fai text), a
   * ".tbi" summary, the mate FASTQ.
   */
  companions?: Record<string, string | HexView>;
  /**
   * The analysis needs random access to this compressed file, so it must be BGZF (GZ-S01; D-11:
   * "unusable here" when it is plain gzip). A declared "bgzf" format implies it.
   */
  requireBgzf?: boolean;
  /** Cross-file (XF) rounds: every file in the folder, by filename. */
  folder?: Record<string, Snippet>;
}

/** A format validator. Pure; never throws on bad input (it reports it). */
export type Validator = (
  input: string | HexView,
  ctx?: ValidationContext,
  profile?: ValidatorProfile,
) => Diagnostic[];

/** The cross-file validator for the capstone folder (CASE-01..CASE-14, XF rules). */
export type FolderValidator = (files: Record<string, Snippet>) => Diagnostic[];

/** A fix-it goal check: true when the learner's text meets the goal. */
export type GoalCheck = (text: string, args?: unknown, ctx?: ValidationContext) => boolean;

/**
 * The verdict a set of diagnostics implies (D-11): any "invalid" -> invalid; else any
 * "unusable-here" -> unusable-here; else valid. Warnings never decide a verdict, even if their
 * `verdict` field is set.
 */
export function verdictOf(diagnostics: readonly Diagnostic[]): Verdict {
  let unusable = false;
  for (const d of diagnostics) {
    if (d.severity === "warning") continue;
    if (d.verdict === "invalid") return "invalid";
    if (d.verdict === "unusable-here") unusable = true;
  }
  return unusable ? "unusable-here" : "valid";
}
