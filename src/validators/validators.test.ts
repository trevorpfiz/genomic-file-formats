// Validator contract tests (docs/PLAN.md 8.1-8.4, 11.6): every implemented rule has a failing
// and a passing fixture from the notes; rule metadata is consistent; runtime modules never reach
// test-only code; test-only messages are listed for check-dist; messages follow 8.4 and 12.6.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { RULES, validate, VALIDATORS } from "./all.ts";
import { formatDiagnostic } from "./core.ts";
import { EX01, EX04, EX09A, EX09B, EX09C, RULE_FIXTURES, type Expected } from "./fixtures.ts";
import { RUNTIME_RULES } from "./runtime/index.ts";
import type { Diagnostic } from "./types.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const shape = (d: Diagnostic, e: Expected) => ({
  rule: d.rule,
  line: d.line,
  ...(e.col === undefined ? {} : { col: d.col }),
  ...(e.field === undefined ? {} : { field: d.field }),
  ...(e.severity === undefined ? {} : { severity: d.severity }),
});

describe.each(RULE_FIXTURES)("$rule ($source)", (f) => {
  const run = (input: typeof f.fail) =>
    validate({ format: f.format, profile: {}, ...(f.ctx ? { context: f.ctx } : {}) }, input);

  test("the failing fixture gives exactly the expected diagnostics", () => {
    const got = run(f.fail);
    expect(got.length, JSON.stringify(got, null, 1)).toBe(f.expect.length);
    got.forEach((d, i) => expect(shape(d, f.expect[i]!)).toEqual(f.expect[i]));
  });

  test("the passing fixture gives no diagnostic", () => {
    expect(run(f.pass)).toEqual([]);
  });
});

test("every implemented format rule has a fixture (CASE rules are covered in gzip.test.ts)", () => {
  const covered = new Set(RULE_FIXTURES.map((f) => f.rule));
  const missing = Object.keys(RULES).filter((id) => !covered.has(id) && !id.startsWith("CASE-"));
  expect(missing).toEqual([]);
});

describe("rule metadata", () => {
  test.each(Object.values(RULES))("$id", (rule) => {
    expect(rule.id).toMatch(/^(?:FA|FAI|FQ|GZ)-[SMC]\d{2}$|^CASE-\d{2}$/);
    expect(rule.summary).toMatch(/^[A-Z`].*\.$/);
    expect(rule.spec.length).toBeGreaterThan(0);
    if (rule.severity === "warning") expect(rule.verdict).toBe("none");
    expect(rule.runtime).toBe(rule.id in RUNTIME_RULES);
  });

  test("D-11 and 8.3 calls: the verdicts this plan makes", () => {
    const verdict = (id: string) => [RULES[id]?.severity, RULES[id]?.verdict];
    expect(verdict("FA-M01")).toEqual(["warning", "none"]); // samtools keeps the first
    expect(verdict("FA-S02")).toEqual(["error", "invalid"]);
    expect(verdict("FQ-S03")).toEqual(["error", "invalid"]); // Cock 2010; tools disagree
    expect(verdict("FQ-S06")).toEqual(["error", "invalid"]);
    expect(verdict("GZ-S01")).toEqual(["error", "unusable-here"]); // BGZF + index is a tool convention
    expect(verdict("GZ-S02")).toEqual(["error", "invalid"]); // presumed truncated (CASE-14)
    expect(verdict("CASE-14")).toEqual(["error", "invalid"]);
    expect(verdict("FAI-M02")).toEqual(["convention", "none"]);
  });

  test("the runtime rules are exactly the L04.3 fix-it's (seq EX-04)", () => {
    expect(Object.keys(RUNTIME_RULES).sort()).toEqual(["FA-M01", "FA-S01", "FA-S03"]);
  });

  test("each format has a validator", () => {
    expect(Object.keys(VALIDATORS).sort()).toEqual(["bgzf", "fai", "fasta", "fastq", "gzip"]);
  });
});

// ---------------------------------------------------------------------------------------------
// Runtime vs test-only (8.2)

const TEST_ONLY = new Set(
  ["fasta", "fai", "fastq", "gzip", "folder", "all", "fixtures", "keys"].map((m) =>
    join(ROOT, `src/validators/${m}.ts`),
  ),
);
const importsOf = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/(?:import|export)\s[^;]*?from\s+"(\.{1,2}\/[^"]+)"/g)].map((m) =>
    resolve(dirname(file), m[1]!),
  );

function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...importsOf(file));
  }
  return seen;
}

const srcFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => join(dir, f));

test("the runtime entry point reaches no test-only module", () => {
  const reached = [...closure(join(ROOT, "src/validators/runtime/index.ts"))].map((f) => relative(ROOT, f));
  expect(reached.filter((f) => TEST_ONLY.has(join(ROOT, f)))).toEqual([]);
  expect(reached.every((f) => /^src\/(validators|formats|exercises)\//.test(f))).toBe(true);
});

test("no shipped module under src/ imports a test-only validator module", () => {
  const offenders = srcFiles(join(ROOT, "src"))
    .filter((f) => !TEST_ONLY.has(f))
    .flatMap((f) =>
      importsOf(f)
        .filter((i) => TEST_ONLY.has(i))
        .map((i) => `${relative(ROOT, f)} -> ${relative(ROOT, i)}`),
    );
  expect(offenders).toEqual([]);
});

/**
 * The canary strings check-dist looks for: each test-only rule's summary. They ship exactly when
 * a test-only rule table ships. ("Tools say" texts are not canaries: exercise data may quote
 * them.) tests/content.test.ts checks that no content string contains a canary.
 */
function testOnlyCanaries(): string[] {
  const runtime = new Set(Object.values(RUNTIME_RULES).map((r) => r.summary));
  return [
    ...new Set(
      Object.values(RULES)
        .filter((r) => !r.runtime)
        .map((r) => r.summary)
        .filter((s) => !runtime.has(s)),
    ),
  ].sort();
}

test("src/validators/test-only-messages.json lists every test-only canary (check-dist, 8.2)", () => {
  const listed = JSON.parse(
    readFileSync(join(ROOT, "src/validators/test-only-messages.json"), "utf8"),
  ) as string[];
  expect(listed, "regenerate the JSON from testOnlyCanaries() in this test").toEqual(testOnlyCanaries());
});

test("each canary is in a test-only module's source and in no runtime-reachable source", () => {
  const runtimeSource = [...closure(join(ROOT, "src/validators/runtime/index.ts"))]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const testOnlySource = [...TEST_ONLY].map((f) => readFileSync(f, "utf8")).join("\n");
  for (const s of testOnlyCanaries()) {
    expect(testOnlySource.includes(JSON.stringify(s).slice(1, -1)), s).toBe(true);
    expect(runtimeSource.includes(s), s).toBe(false);
  }
});

// ---------------------------------------------------------------------------------------------
// Message style (8.4; 12.6)

const corpus: Diagnostic[] = [
  ...RULE_FIXTURES.flatMap((f) =>
    validate({ format: f.format, profile: {}, ...(f.ctx ? { context: f.ctx } : {}) }, f.fail),
  ),
  ...[EX01, EX04].flatMap((t) => validate({ format: "fasta", profile: {} }, t)),
  ...[EX09A, EX09B, EX09C].flatMap((t) => validate({ format: "fastq", profile: {} }, t)),
];
const GLYPHS = /[✓✗→≤≥≈¹²³⁰-₟]|\p{Extended_Pictographic}/u;
const outsideCode = (s: string) => s.replace(/`[^`]*`/g, "");

test("8.4: messages lead with a location and end with a full stop", () => {
  for (const d of corpus) {
    expect(d.message, d.rule).toMatch(
      /^(?:Line \d+(?:, (?:column \d+|[A-Z]+))?|Bytes? \d+(?:-\d+)?(?: \(FLG\))?(?: on)?|End of file|The \.fai)[:]/,
    );
    expect(d.message, d.rule).toMatch(/\.$/);
  }
});

test("12.6: rule texts and messages use no glyphs, emoji, hype words or exclamation marks", () => {
  const texts = [
    ...Object.values(RULES).flatMap((r) => [r.summary, r.toolsSay ?? ""]),
    ...corpus.map(formatDiagnostic),
  ];
  for (const t of texts) {
    expect(GLYPHS.test(t), t).toBe(false);
    expect(outsideCode(t), t).not.toMatch(/\b(?:simply|obviously|just)\b/i);
    expect(outsideCode(t), t).not.toMatch(/!/);
  }
});

test("8.4: the formatted line carries rule, spec and Tools say", () => {
  const d = validate({ format: "fastq", profile: {} }, EX09A)[0]!;
  expect(formatDiagnostic(d)).toBe(
    "Line 4: quality has 35 characters for 36 bases. FQ-S04 · Cock et al. 2010. Tools say: Biopython and samtools both reject this.",
  );
});
