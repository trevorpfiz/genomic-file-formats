// TEST-ONLY: every validator and rule, for content tests, unit tests and the capstone key
// builder (docs/PLAN.md 8.1, 8.5, 11.6). Never import it from a shipped module: the browser uses
// src/validators/runtime/index.ts (8.2).
import type { FormatId, HexView, RuleId, Severity, Snippet, Validation } from "../exercises/types.ts";
import { inScope } from "./core.ts";
import { FAI_RULES, validateFai } from "./fai.ts";
import { FASTA_RULES, validateFasta } from "./fasta.ts";
import { FASTQ_RULES, validateFastq } from "./fastq.ts";
import { FOLDER_RULES } from "./folder.ts";
import { GZIP_RULES, validateBgzf, validateGzip } from "./gzip.ts";
import type { Diagnostic, RuleMeta, Validator } from "./types.ts";

export { formatDiagnostic, inScope } from "./core.ts";
export { FOLDER_FORMATS, validateFolder } from "./folder.ts";
export { verdictOf } from "./types.ts";

/** Every implemented rule, runtime and test-only. */
export const RULES: Readonly<Record<RuleId, RuleMeta>> = {
  ...FASTA_RULES,
  ...FAI_RULES,
  ...FASTQ_RULES,
  ...GZIP_RULES,
  ...FOLDER_RULES,
};

/** Every implemented per-format validator. */
export const VALIDATORS: Readonly<Partial<Record<FormatId, Validator>>> = {
  fasta: validateFasta,
  fai: validateFai,
  fastq: validateFastq,
  gzip: validateGzip,
  bgzf: validateBgzf,
};

/** Run a Validation on raw input. Throws when the format has no validator yet. */
export function validate(validation: Validation, input: string | HexView): Diagnostic[] {
  const validator = VALIDATORS[validation.format];
  if (!validator) throw new Error(`No validator for format "${validation.format}" yet`);
  return validator(input, validation.context, validation.profile);
}

/**
 * The input a Validation reads from a snippet: its text; for compressed text, the decompressed
 * text (or the container when the validation's format is gzip/BGZF); for hex, the HexView.
 */
export function snippetInput(validation: Validation, snippet: Snippet): string | HexView {
  const container = validation.format === "gzip" || validation.format === "bgzf";
  const input =
    snippet.kind === "text"
      ? snippet.text
      : snippet.kind === "compressed-text" && !container
        ? snippet.decodedText
        : snippet.hex;
  if (input === undefined)
    throw new Error(`Snippet ${snippet.filename} has no input for a ${validation.format} validation`);
  return input;
}

/** Validate a snippet; with `severities`, keep only those (key checks default to errors). */
export function validateSnippet(
  validation: Validation,
  snippet: Snippet,
  severities?: readonly Severity[],
): Diagnostic[] {
  const all = validate(validation, snippetInput(validation, snippet));
  return severities ? inScope(all, severities) : all;
}
