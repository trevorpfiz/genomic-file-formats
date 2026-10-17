// The browser's validator entry point (docs/PLAN.md 8.2, 8.5): what fix-it widgets import.
// RUNTIME modules only: never import a test-only validator (src/validators/{fasta,fai,fastq,keys,
// gzip,folder,all}.ts) from here or from any shipped module. tests/ and the validator unit tests
// check this import graph, and check-dist checks that no test-only message ships.
//
// Fix-it usage:
//   const diags = validateRuntime(exercise.validation, text);   // live, debounced 250 ms
//   const blocking = diags.filter((d) => d.severity === "error"); // correct needs none of these
//   const goals = checkGoals(exercise.goals, text, exercise.validation.context);
//   formatDiagnostic(d) gives the 8.4 line for the Problems list.
import type { FixItGoal, FormatId, RuleId, Validation } from "../../exercises/types.ts";
import { withinSnippetLimits } from "../core.ts";
import type { Diagnostic, RuleMeta, ValidationContext, Validator } from "../types.ts";
import { FASTA_RUNTIME_RULES, validateFastaRuntime } from "./fasta.ts";
import { GOAL_CHECKS } from "./goals.ts";

export { formatDiagnostic, SNIPPET_LIMITS, withinSnippetLimits } from "../core.ts";
export { verdictOf } from "../types.ts";
export { GOAL_CHECKS } from "./goals.ts";

/** Every rule that ships in the browser. */
export const RUNTIME_RULES: Readonly<Record<RuleId, RuleMeta>> = { ...FASTA_RUNTIME_RULES };

/** Runtime validators by format: the formats some fix-it uses (8.2). */
export const RUNTIME_VALIDATORS: Readonly<Partial<Record<FormatId, Validator>>> = {
  fasta: validateFastaRuntime,
};

/**
 * Validate learner text for a fix-it with its exercise's validation (profile and context),
 * using runtime rules only. Returns [] above the snippet cap (the widget shows its notice) and
 * for a format without runtime rules (content tests make that impossible for shipped fix-its).
 */
export function validateRuntime(validation: Validation, text: string): Diagnostic[] {
  const validator = RUNTIME_VALIDATORS[validation.format];
  if (!validator || !withinSnippetLimits(text)) return [];
  return validator(text, validation.context, validation.profile);
}

export interface GoalResult {
  id: string;
  text: string;
  passed: boolean;
}

/** Run a fix-it's goals on learner text. An unknown check fails its goal. */
export function checkGoals(goals: readonly FixItGoal[], text: string, ctx?: ValidationContext): GoalResult[] {
  return goals.map((g) => ({
    id: g.id,
    text: g.text,
    passed: GOAL_CHECKS[g.check]?.(text, g.args, ctx) ?? false,
  }));
}
