// Shared validator machinery (docs/PLAN.md 8.1-8.4): rule tables, the diagnostic factory, rule
// profiles and the 8.4 message format. Runtime-safe: fix-it widgets ship it, so it holds no
// rule of its own and no test-only text.
import type { RuleId, Severity } from "../exercises/types.ts";
import type { Diagnostic, RuleMeta, ValidatorProfile } from "./types.ts";

export type RuleTable = Readonly<Record<RuleId, RuleMeta>>;

/** Build a rule table from metadata keyed by id (the key becomes `id`). */
export function defineRules<K extends string>(rules: Record<K, Omit<RuleMeta, "id">>): Record<K, RuleMeta> {
  const out = {} as Record<K, RuleMeta>;
  for (const id of Object.keys(rules) as K[]) out[id] = { id, ...rules[id] };
  return out;
}

/** Where a diagnostic points. */
export interface At {
  line: number;
  col?: number;
  field?: string;
  file?: string;
  bytes?: [number, number];
}

export interface DiagnosticExtras {
  found?: string;
  expected?: string;
  /** Overrides the rule's default for this instance. */
  toolsSay?: string;
  /** Per-instance severity (FA-S01: a leading blank line is only a warning). */
  severity?: Severity;
  /** Per-instance verdict mapping; defaults to the rule's, or "none" for a warning. */
  verdict?: Diagnostic["verdict"];
  spec?: string;
}

/** Make a diagnostic for `rule`. `message` follows 8.4: "<Location>: <problem>." */
export function diagnostic(
  rule: RuleMeta,
  at: At,
  message: string,
  extras: DiagnosticExtras = {},
): Diagnostic {
  const severity = extras.severity ?? rule.severity;
  const verdict = extras.verdict ?? (severity === "warning" ? "none" : rule.verdict);
  const d: Diagnostic = {
    rule: rule.id,
    severity,
    verdict,
    line: at.line,
    message,
    spec: extras.spec ?? rule.spec,
  };
  if (at.col !== undefined) d.col = at.col;
  if (at.field !== undefined) d.field = at.field;
  if (at.file !== undefined) d.file = at.file;
  if (at.bytes !== undefined) d.bytes = at.bytes;
  if (extras.found !== undefined) d.found = extras.found;
  if (extras.expected !== undefined) d.expected = extras.expected;
  const toolsSay = extras.toolsSay ?? rule.toolsSay;
  if (toolsSay !== undefined) d.toolsSay = toolsSay;
  return d;
}

/** Stable order: file, line, column, rule. */
export function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.sort(
    (a, b) =>
      (a.file ?? "").localeCompare(b.file ?? "") ||
      a.line - b.line ||
      (a.col ?? 0) - (b.col ?? 0) ||
      a.rule.localeCompare(b.rule),
  );
}

/**
 * Apply a profile (types.ts ValidatorProfile) to diagnostics produced with the rules in `rules`.
 * A diagnostic whose rule is not in `rules` is kept unchanged (validators only emit their own).
 */
export function applyProfile(
  diagnostics: readonly Diagnostic[],
  rules: RuleTable,
  profile: ValidatorProfile = {},
): Diagnostic[] {
  const include = profile.include ? new Set(profile.include) : undefined;
  const exclude = new Set(profile.exclude ?? []);
  const escalate = new Set(profile.escalate ?? []);
  const out: Diagnostic[] = [];
  for (const d of diagnostics) {
    if (include && !include.has(d.rule)) continue;
    if (exclude.has(d.rule)) continue;
    if (profile.mode === "tool") {
      const tool = rules[d.rule]?.toolSeverity;
      if (tool === "accepts") continue;
      out.push(tool ? { ...d, severity: tool, verdict: tool === "warning" ? "none" : d.verdict } : d);
      continue;
    }
    if (escalate.has(d.rule) && d.severity !== "error") {
      out.push({ ...d, severity: "error", verdict: "invalid" });
      continue;
    }
    out.push(d);
  }
  return sortDiagnostics(out);
}

/** Diagnostics whose severity is in scope (key checks default to ["error"], docs/PLAN.md 7.1). */
export const inScope = (
  diagnostics: readonly Diagnostic[],
  severities: readonly Severity[] = ["error"],
): Diagnostic[] => diagnostics.filter((d) => severities.includes(d.severity));

/** A file value as an inline code chip, for messages and the formatted line. */
export function chip(value: string): string {
  const visible = value.replace(/\t/g, "\\t").replace(/\r/g, "\\r");
  const fence = visible.includes("`") ? "``" : "`";
  const pad = visible.startsWith("`") || visible.endsWith("`") ? " " : "";
  return `${fence}${pad}${visible}${pad}${fence}`;
}

/**
 * The full 8.4 line for a Problems list or a reveal:
 * "<message> Found `x`; expected `y`. <Rule ID> · <spec>. Tools say: …"
 */
export function formatDiagnostic(d: Diagnostic): string {
  const parts = [d.message.trim()];
  if (d.found !== undefined && d.expected !== undefined)
    parts.push(`Found ${chip(d.found)}; expected ${chip(d.expected)}.`);
  else if (d.found !== undefined) parts.push(`Found ${chip(d.found)}.`);
  else if (d.expected !== undefined) parts.push(`Expected ${chip(d.expected)}.`);
  parts.push(`${d.rule} · ${d.spec.replace(/\.$/, "")}.`);
  if (d.toolsSay) parts.push(`Tools say: ${d.toolsSay.replace(/^Tools say:\s*/i, "")}`);
  return parts.join(" ");
}

/** Plural helper for messages: "1 base", "2 bases". */
export const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** The fix-it input cap (D-26; docs/PLAN.md 7.2): about 300 lines and 64 KB. */
export const SNIPPET_LIMITS = { lines: 300, bytes: 64 * 1024 } as const;

/** Whether text is within the validators' snippet scope. */
export function withinSnippetLimits(text: string): boolean {
  if (new TextEncoder().encode(text).length > SNIPPET_LIMITS.bytes) return false;
  let lines = 1;
  for (const c of text) if (c === "\n") lines += 1;
  return lines <= SNIPPET_LIMITS.lines + 1;
}
