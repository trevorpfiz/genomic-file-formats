// TEST-ONLY: the key checks of the content harness (docs/PLAN.md 7.1-7.7, 6.1, 8.5, 11.6). Each
// function returns problems as plain sentences (empty when the item is sound), so
// tests/content.test.ts can assert over real content and keys.test.ts can prove each check
// bites on broken fixtures. Never import it from a shipped module.
//
// Key conventions:
// - spot-the-error: answers ⊆ diagnostics ⊆ answers ∪ acceptAlso, matched on (line, rule) and,
//   when the answer names one, field (schema names: src/formats/schemas.ts), within the round's
//   severities (default errors).
// - fix-it: the starter fails with exactly expectStarterRules (within severities); the solution
//   has no error and passes every goal (src/validators/runtime/goals.ts); only runtime rules can
//   fire, and the browser's runtime validator gives the same diagnostics as the full one.
// - sort items and mcq options with validityFromValidator: verdictOf(diagnostics) decides; a
//   sort bin's `verdict` is the key; an mcq's correct options share one verdict that no
//   incorrect option has.
// - predict number and region items name a helper (src/formats/helpers.ts) in computeWith, and
//   choice and text items may; an mcq may carry `computeWith` too (read when present): a number
//   result must appear in the correct option, at its shown precision, and in no other option.
import type {
  ComputeRef,
  Exercise,
  FixItExercise,
  FollowUp,
  McqExercise,
  PredictExercise,
  Quiz,
  QuizSlot,
  QuizVariant,
  Rng,
  Snippet,
  SortExercise,
  SpotTheErrorExercise,
} from "../exercises/types.ts";
import { hexBytes } from "../formats/gzip.ts";
import { HELPERS, type HelperResult } from "../formats/helpers.ts";
import { splitLines } from "../formats/lines.ts";
import { inScope, RULES, validate, validateSnippet, verdictOf } from "./all.ts";
import { GOAL_CHECKS, RUNTIME_RULES, validateRuntime } from "./runtime/index.ts";
import type { Diagnostic } from "./types.ts";

export type Question = Exercise | FollowUp | QuizVariant;
export interface Located {
  where: string;
  q: Question;
}

/** An exercise and the questions inside its card: follow-ups, an embedded check, a predict gate. */
export function questionsOf(e: Exercise | QuizVariant, where: string = e.id): Located[] {
  const out: Located[] = [{ where, q: e }];
  for (const f of e.followUps ?? []) out.push({ where: `${where} follow-up "${f.id}"`, q: f });
  if (e.kind === "field-explorer" && e.check) out.push({ where: `${where} check`, q: e.check });
  if (e.kind === "simulator" && e.predictGate) out.push({ where: `${where} predict gate`, q: e.predictGate });
  return out;
}

export const isSnippet = (v: unknown): v is Snippet =>
  typeof v === "object" &&
  v !== null &&
  "provenance" in v &&
  ["text", "hex", "compressed-text"].includes((v as { kind?: string }).kind ?? "");

/** Every Snippet inside a value (rounds, items, options, starters, checks...). */
export function snippetsIn(value: unknown, out: Snippet[] = []): Snippet[] {
  if (isSnippet(value)) out.push(value);
  else if (Array.isArray(value)) for (const v of value) snippetsIn(v, out);
  else if (typeof value === "object" && value !== null)
    for (const v of Object.values(value)) snippetsIn(v, out);
  return out;
}

/** Every string inside a value, except snippet contents. */
export function stringsIn(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (isSnippet(value)) return out;
  else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
  else if (typeof value === "object" && value !== null)
    for (const v of Object.values(value)) stringsIn(v, out);
  return out;
}

const lineCount = (s: Snippet): number => splitLines(s.text ?? s.decodedText ?? "").lines.length;

/** Numbers as written in a text: "251,446,312", "0.79", "`84`". */
export const numbersIn = (text: string): { value: number; decimals: number }[] =>
  [...text.matchAll(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g)].map((m) => ({
    value: Number(m[0].replaceAll(",", "")),
    decimals: m[0].split(".")[1]?.length ?? 0,
  }));
/** Whether a text shows `value` at the precision it is written with. */
export const shows = (text: string, value: number): boolean =>
  numbersIn(text).some((n) => Math.abs(n.value - value) <= 0.5 * 10 ** -n.decimals + 1e-12);

function compute(ref: ComputeRef, where: string, problems: string[]): HelperResult | undefined {
  const helper = HELPERS[ref.helper];
  if (!helper) {
    problems.push(`${where}: unknown helper "${ref.helper}" (src/formats/helpers.ts)`);
    return undefined;
  }
  try {
    return helper(ref.args ?? {});
  } catch (err) {
    problems.push(`${where}: helper "${ref.helper}" failed: ${(err as Error).message}`);
    return undefined;
  }
}

/** Run a check that may throw (a validator for a format that has none yet, malformed hex). */
function guarded(where: string, problems: string[], fn: () => void): void {
  try {
    fn();
  } catch (err) {
    problems.push(`${where}: ${(err as Error).message}`);
  }
}

const matches = (d: Diagnostic, line: number, rule: string, field?: string) =>
  d.line === line && d.rule === rule && (field === undefined || d.field === field);
const brief = (ds: readonly Diagnostic[]) => JSON.stringify(ds.map((d) => [d.rule, d.line, d.field ?? null]));

// ---------------------------------------------------------------------------------------------
// Per kind

export function spotProblems(
  q: Pick<SpotTheErrorExercise, "rounds" | "singlePick">,
  where: string,
): string[] {
  const p: string[] = [];
  if (!q.rounds.length) p.push(`${where}: no rounds`);
  if (new Set(q.rounds.map((r) => r.id)).size !== q.rounds.length) p.push(`${where}: round ids repeat`);
  if (q.singlePick && (q.rounds.length !== 1 || q.rounds[0]?.answers.length !== 1))
    p.push(`${where}: a single pick has one round with one answer`);
  for (const round of q.rounds) {
    const at = `${where} round ${round.id}`;
    const lines = lineCount(round.snippet);
    if (!round.answers.length) p.push(`${at}: no answers`);
    for (const a of [...round.answers, ...(round.acceptAlso ?? [])])
      if (a.line < 1 || a.line > lines)
        p.push(`${at}: line ${a.line} is outside the snippet (${lines} lines)`);
    for (const key of Object.keys(round.fineHere ?? {})) {
      const line = Number(key.split(":")[0]);
      if (!(line >= 1 && line <= lines)) p.push(`${at}: fineHere "${key}" is outside the snippet`);
    }
    guarded(at, p, () => {
      const diags = validateSnippet(
        round.validation,
        round.snippet,
        round.validation.severities ?? ["error"],
      );
      for (const a of round.answers)
        if (!diags.some((d) => matches(d, a.line, a.rule, a.field)))
          p.push(
            `${at}: the validators do not report ${a.rule} on line ${a.line}${a.field ? ` (${a.field})` : ""}; they report ${brief(diags)}`,
          );
      for (const d of diags) {
        const keyed =
          round.answers.some((a) => matches(d, a.line, a.rule, a.field)) ||
          (round.acceptAlso ?? []).some(
            (x) => x.line === d.line && (x.field === undefined || x.field === d.field),
          );
        if (!keyed) p.push(`${at}: unkeyed diagnostic ${d.rule} on line ${d.line}: ${d.message}`);
      }
    });
  }
  return p;
}

export function fixItProblems(q: FixItExercise, where: string): string[] {
  const p: string[] = [];
  const v = q.validation;
  const severities = v.severities ?? ["error"];
  if (q.starter.kind !== "text" || q.starter.text === undefined)
    return [`${where}: the starter must be a text snippet`];
  const starterText = q.starter.text;
  guarded(where, p, () => {
    const starter = validate(v, starterText);
    const got = inScope(starter, severities)
      .map((d) => d.rule)
      .sort();
    const want = [...q.expectStarterRules].sort();
    if (got.join() !== want.join())
      p.push(
        `${where}: the starter fails with ${JSON.stringify(got)}, not expectStarterRules ${JSON.stringify(want)}`,
      );
    const solution = validate(v, q.solution);
    for (const d of inScope(solution, ["error"]))
      p.push(`${where}: the solution has an error: ${d.rule} on line ${d.line}`);
    for (const d of [...starter, ...solution])
      if (!(d.rule in RUNTIME_RULES))
        p.push(`${where}: test-only rule ${d.rule} can fire here; narrow the profile`);
    if (JSON.stringify(validateRuntime(v, starterText)) !== JSON.stringify(starter))
      p.push(`${where}: the runtime validator differs from the full one on the starter`);
    if (JSON.stringify(validateRuntime(v, q.solution)) !== JSON.stringify(solution))
      p.push(`${where}: the runtime validator differs from the full one on the solution`);
  });
  for (const id of v.profile.include ?? [])
    if (!(id in RUNTIME_RULES)) p.push(`${where}: the profile includes ${id}, which is not a runtime rule`);
  if (new Set(q.goals.map((g) => g.id)).size !== q.goals.length) p.push(`${where}: goal ids repeat`);
  for (const goal of q.goals) {
    const check = GOAL_CHECKS[goal.check];
    if (!check) p.push(`${where}: unknown goal check "${goal.check}" (src/validators/runtime/goals.ts)`);
    else if (!check(q.solution, goal.args, v.context))
      p.push(`${where}: the solution fails goal "${goal.id}"`);
  }
  if (q.solution === starterText) p.push(`${where}: the solution equals the starter`);
  return p;
}

export function sortProblems(q: Pick<SortExercise, "bins" | "items" | "ordered">, where: string): string[] {
  const p: string[] = [];
  if (new Set(q.bins.map((b) => b.id)).size !== q.bins.length) p.push(`${where}: bin ids repeat`);
  if (new Set(q.items.map((i) => i.id)).size !== q.items.length) p.push(`${where}: item ids repeat`);
  if (q.ordered && q.bins.length !== 1) p.push(`${where}: an ordered sort has one bin`);
  for (const item of q.items) {
    const at = `${where} item ${item.id}`;
    const bin = q.bins.find((b) => b.id === item.bin);
    if (!bin) p.push(`${at}: keys unknown bin "${item.bin}"`);
    if (!item.why.trim()) p.push(`${at}: no "why"`);
    if (!item.validityFromValidator) continue;
    if (!item.validation) {
      p.push(`${at}: validityFromValidator needs a validation`);
      continue;
    }
    if (!bin?.verdict) p.push(`${at}: bin "${item.bin}" needs a verdict`);
    const validation = item.validation;
    guarded(at, p, () => {
      const snippet: Snippet =
        typeof item.content === "string"
          ? {
              filename: item.id,
              format: validation.format,
              kind: "text",
              text: item.content,
              provenance: "toy",
            }
          : item.content;
      const verdict = verdictOf(validateSnippet(validation, snippet));
      if (bin?.verdict && verdict !== bin.verdict)
        p.push(`${at}: the validators say ${verdict}, the key says ${bin.verdict}`);
    });
  }
  return p;
}

export function mcqProblems(
  q: Pick<McqExercise, "multi" | "options" | "stem" | "computeWith">,
  where: string,
): string[] {
  const p: string[] = [];
  if (q.options.length < 2) p.push(`${where}: fewer than 2 options`);
  if (new Set(q.options.map((o) => o.id)).size !== q.options.length) p.push(`${where}: option ids repeat`);
  for (const o of q.options) if (!o.explanation.trim()) p.push(`${where}: option ${o.id} has no explanation`);
  const correct = q.options.filter((o) => o.correct).length;
  if (q.multi && correct === 0) p.push(`${where}: no correct option`);
  if (!q.multi && correct !== 1)
    p.push(`${where}: a single-select needs exactly one correct option, not ${correct}`);

  const backed = q.options.filter((o) => o.validityFromValidator);
  const verdicts: { id: string; correct: boolean; verdict: string }[] = [];
  for (const o of backed) {
    if (!o.validation || !o.snippet) {
      p.push(`${where}: option ${o.id} needs a validation and a snippet`);
      continue;
    }
    const { validation, snippet } = o;
    guarded(`${where} option ${o.id}`, p, () =>
      verdicts.push({
        id: o.id,
        correct: o.correct,
        verdict: verdictOf(validateSnippet(validation, snippet)),
      }),
    );
  }
  const keyed = new Set(verdicts.filter((x) => x.correct).map((x) => x.verdict));
  if (keyed.size > 1)
    p.push(`${where}: the correct options have different verdicts ${JSON.stringify([...keyed])}`);
  for (const x of verdicts.filter((x) => !x.correct))
    if (keyed.has(x.verdict))
      p.push(`${where}: option ${x.id} has the keyed verdict ${x.verdict} but is not correct`);

  const ref = q.computeWith;
  if (ref) {
    const result = compute(ref, where, p);
    if (result !== undefined)
      for (const o of q.options) {
        const has =
          typeof result === "number"
            ? shows(o.text, result)
            : o.text.toLowerCase().includes(String(result).toLowerCase());
        if (has !== o.correct)
          p.push(
            `${where}: option ${o.id} ${o.correct ? "does not show" : "also shows"} the computed key ${String(result)}`,
          );
      }
  }
  return p;
}

export function predictProblems(q: Pick<PredictExercise, "items">, where: string): string[] {
  const p: string[] = [];
  if (!q.items.length) p.push(`${where}: no items`);
  const ids = q.items.map((it, i) => it.id ?? String(i));
  if (new Set(ids).size !== ids.length) p.push(`${where}: item ids repeat`);
  q.items.forEach((item, i) => {
    const at = `${where} item ${item.id ?? i}`;
    const input = item.input;
    if ((input.type === "number" || input.type === "region") && !item.computeWith)
      p.push(`${at}: number and region items need computeWith`);
    if (input.type === "choice") {
      const keys = Array.isArray(input.answer) ? input.answer : [input.answer];
      for (const k of keys)
        if (!(Number.isInteger(k) && k >= 0 && k < input.options.length)) p.push(`${at}: answer index ${k}`);
    }
    if (input.type === "region" && input.answer[0] > input.answer[1]) p.push(`${at}: region start > end`);
    if (!item.computeWith) return;
    const result = compute(item.computeWith, at, p);
    if (result === undefined) return;
    switch (input.type) {
      case "number":
        if (typeof result !== "number" || Math.abs(result - input.answer) > input.tolerance + 1e-9)
          p.push(`${at}: key ${input.answer} ± ${input.tolerance}, but the helper gives ${String(result)}`);
        break;
      case "region":
        if (JSON.stringify(result) !== JSON.stringify(input.answer))
          p.push(
            `${at}: key ${JSON.stringify(input.answer)}, but the helper gives ${JSON.stringify(result)}`,
          );
        break;
      case "text": {
        const norm = (s: string) => {
          let t = s;
          if (input.normalize?.includes("whitespace")) t = t.replace(/\s+/g, "");
          if (input.normalize?.includes("case")) t = t.toLowerCase();
          return t;
        };
        if (norm(String(result)) !== norm(input.answer))
          p.push(`${at}: key "${input.answer}", but the helper gives "${String(result)}"`);
        break;
      }
      case "choice": {
        if (Array.isArray(input.answer)) {
          p.push(`${at}: computeWith supports single-choice items only`);
          break;
        }
        const option = input.options[input.answer] ?? "";
        const ok = typeof result === "number" ? shows(option, result) : option === String(result);
        if (!ok) p.push(`${at}: option "${option}" does not match the computed key ${String(result)}`);
        break;
      }
    }
  });
  return p;
}

export function fieldExplorerProblems(
  q: Extract<Exercise, { kind: "field-explorer" }>,
  where: string,
): string[] {
  const p: string[] = [];
  const lines = splitLines(q.snippet.text ?? "").lines;
  if (q.check === undefined && !(q.followUps?.length ?? 0)) p.push(`${where}: needs a check or follow-ups`);
  for (const f of q.fields) {
    const line = lines[f.line - 1];
    if (!line) {
      p.push(`${where}: field ${f.name} is on line ${f.line}, outside the snippet`);
      continue;
    }
    if (f.col !== undefined && !(f.col >= 1 && f.col <= line.text.split("\t").length))
      p.push(`${where}: field ${f.name} is in column ${f.col}, which line ${f.line} lacks`);
    if (f.span !== undefined && !(f.span[0] >= 0 && f.span[0] < f.span[1] && f.span[1] <= line.text.length))
      p.push(`${where}: field ${f.name} span ${f.span.join("-")} is outside line ${f.line}`);
  }
  return p;
}

/** The checks for one question of any kind. */
export function questionProblems({ where, q }: Located): string[] {
  switch (q.kind) {
    case "spot-the-error":
      return spotProblems(q, where);
    case "fix-it":
      return fixItProblems(q as FixItExercise, where);
    case "sort":
      return sortProblems(q, where);
    case "mcq":
      return mcqProblems(q, where);
    case "predict":
      return predictProblems(q, where);
    case "field-explorer":
      return fieldExplorerProblems(q as Extract<Exercise, { kind: "field-explorer" }>, where);
    case "simulator":
      return new Set(q.goals.map((g) => g.id)).size === q.goals.length ? [] : [`${where}: goal ids repeat`];
  }
}

export function snippetProblems(s: Snippet, where: string): string[] {
  const p: string[] = [];
  if (s.kind === "text" && s.text === undefined) p.push(`${where}: ${s.filename} has no text`);
  if (s.kind === "compressed-text" && (s.decodedText === undefined || !s.hex))
    p.push(`${where}: ${s.filename} needs decodedText and a container view`);
  if (s.kind === "hex" && !s.hex) p.push(`${where}: ${s.filename} has no hex`);
  if (s.hex) {
    const view = s.hex;
    guarded(where, p, () => {
      const shown = hexBytes(view.head).length + (view.tail ? hexBytes(view.tail).length : 0);
      for (const a of view.annotations)
        if (!(a.from >= 0 && a.from < a.to && a.to <= shown))
          p.push(`${where}: annotation "${a.label}" is outside the shown bytes`);
    });
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// Quizzes (docs/PLAN.md 6.1, D-09)

/** A seeded Rng (mulberry32) for parametric generators. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)]!,
  };
}

/** The formats each section's quiz must cover in every variant combination (6.1). */
export const SECTION_FORMATS: Readonly<Record<string, readonly string[]>> = {
  foundations: [],
  sequences: ["fasta", "fastq"],
  regions: ["bed"],
  alignments: ["sam", "bam", "cram"],
  "coverage-and-variants": ["wig", "vcf", "gvcf"],
  annotation: ["gtf", "gff3"],
  "sv-and-graphs": ["bedpe", "paf", "gfa"],
};
/** LO5 slots never key to the case integers or a case target (6.1). */
export const CASE_VALUES = ["166014902", "166014903", "166040115", "166040116", "SCN1A_e"];
const ALLOWED_QUIZ_KINDS = new Set(["mcq", "predict", "spot-the-error", "sort"]);
export const GENERATOR_SEEDS: readonly number[] = Array.from({ length: 40 }, (_, i) => 1 + i * 7919);

/** What the quiz checks need from the course. */
export interface QuizContext {
  /** Page id -> position in the manifest's outline order. */
  order: ReadonlyMap<string, number>;
  /** Built pages by id. */
  pages: ReadonlyMap<string, { headings: readonly string[]; html: string }>;
  /** Concept -> the page that introduces it (content/course.ts). */
  introducers: Readonly<Record<string, string>>;
  /** Lesson exercises, which no variant may repeat. */
  lessonExercises: readonly Exercise[];
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  [...new Set(a)].sort().join() === [...new Set(b)].sort().join();

/** HTML ranges inside :::read-more disclosures. */
export function readMoreRanges(html: string): [number, number][] {
  const ranges: [number, number][] = [];
  const stack: { start: number; readMore: boolean }[] = [];
  for (const m of html.matchAll(/<details\b[^>]*>|<\/details>/g)) {
    if (m[0].startsWith("</")) {
      const open = stack.pop();
      if (open?.readMore) ranges.push([open.start, m.index + m[0].length]);
    } else stack.push({ start: m.index, readMore: m[0].includes("disclosure-read-more") });
  }
  return ranges;
}

const stemKey = (q: Question): string | undefined => {
  if (q.kind === "mcq")
    return `${q.stem}\n${q.options
      .filter((o) => o.correct)
      .map((o) => o.text)
      .sort()
      .join("\n")}`;
  if (q.kind === "predict") return q.items.map((i) => `${i.label}\n${JSON.stringify(i.input)}`).join("\n");
  return undefined;
};

export function variantProblems(
  quiz: Quiz,
  slot: QuizSlot,
  v: QuizVariant,
  where: string,
  ctx: QuizContext,
): string[] {
  const p: string[] = [];
  if (!ALLOWED_QUIZ_KINDS.has(v.kind)) p.push(`${where}: ${v.kind} is not allowed in quizzes`);
  if (!v.id.startsWith(`quiz-${quiz.section}/${slot.id}/`))
    p.push(`${where}: id ${v.id} does not start with quiz-${quiz.section}/${slot.id}/`);
  if (!sameSet(v.concepts, slot.concepts)) p.push(`${where}: concepts differ from the slot's`);
  if (!sameSet(v.tags, slot.tags)) p.push(`${where}: tags differ from the slot's`);
  if (v.kind === "spot-the-error" && !v.singlePick) p.push(`${where}: quiz spot-the-errors are single picks`);
  if (v.kind === "sort" && v.items.length > 4) p.push(`${where}: quiz sorts have at most 4 items`);
  for (const l of questionsOf(v, where)) p.push(...questionProblems(l));
  const lessonTexts = new Set(
    ctx.lessonExercises
      .flatMap((e) => snippetsIn(e))
      .flatMap((s) => [s.text, s.decodedText].filter((t): t is string => !!t)),
  );
  for (const s of snippetsIn(v)) {
    p.push(...snippetProblems(s, where));
    for (const t of [s.text, s.decodedText])
      if (t && lessonTexts.has(t)) p.push(`${where}: repeats a lesson exercise's snippet`);
  }
  const key = stemKey(v);
  const lessonKeys = new Set(ctx.lessonExercises.flatMap((e) => questionsOf(e)).map((l) => stemKey(l.q)));
  if (key && lessonKeys.has(key)) p.push(`${where}: repeats a lesson exercise's stem and key`);
  if (slot.tags.includes("LO5")) {
    const json = JSON.stringify(v).replace(/(\d),(?=\d{3})/g, "$1");
    for (const n of CASE_VALUES)
      if (json.includes(n)) p.push(`${where}: an LO5 slot uses the case value ${n}`);
  }
  return p;
}

export function slotProblems(quiz: Quiz, slot: QuizSlot, ctx: QuizContext): string[] {
  const p: string[] = [];
  const at = `${quiz.section} slot ${slot.id}`;
  const quizOrder = ctx.order.get(`quiz-${quiz.section}`) ?? -1;
  if (slot.variants.length + (slot.generator ? 1 : 0) < 2)
    p.push(`${at}: needs 2 variants, or 1 and a generator`);
  if (new Set(slot.variants.map((v) => v.id)).size !== slot.variants.length)
    p.push(`${at}: variant ids repeat`);
  for (const v of slot.variants) p.push(...variantProblems(quiz, slot, v, v.id, ctx));
  if (slot.generator) {
    for (const seed of GENERATOR_SEEDS) {
      const v = slot.generator.generate(seededRng(seed));
      const where = `${at} ${slot.generator.id} seed ${seed}`;
      if (JSON.stringify(slot.generator.generate(seededRng(seed))) !== JSON.stringify(v))
        p.push(`${where}: not deterministic`);
      p.push(...variantProblems(quiz, slot, v, where, ctx));
    }
  }
  // The heading it tests: built, earlier in the course, outside Read-more.
  const [lessonId = "", heading = ""] = slot.tests.split("#");
  const page = ctx.pages.get(lessonId);
  if (!page) p.push(`${at}: tests ${slot.tests}, but ${lessonId} is not built`);
  else {
    if ((ctx.order.get(lessonId) ?? Infinity) > quizOrder) p.push(`${at}: tests a lesson after the quiz`);
    if (!page.headings.includes(heading)) p.push(`${at}: ${lessonId} has no heading "${heading}"`);
    else {
      const pos = page.html.indexOf(`id="${heading}"`);
      if (readMoreRanges(page.html).some(([a, b]) => pos > a && pos < b))
        p.push(`${at}: ${slot.tests} is inside Read-more`);
    }
  }
  if (!slot.concepts.length) p.push(`${at}: no concepts`);
  for (const c of slot.concepts) {
    const by = ctx.introducers[c];
    if (!by) p.push(`${at}: unknown concept ${c}`);
    else if ((ctx.order.get(by) ?? Infinity) > quizOrder) p.push(`${at}: ${c} is introduced after the quiz`);
  }
  return p;
}

const isRecognitionVariant = (v: QuizVariant) =>
  snippetsIn(v).some((s) => s.hideIdentity || s.kind === "hex" || s.kind === "compressed-text");
const isValidityVariant = (v: QuizVariant) =>
  (v.kind === "spot-the-error" && v.singlePick === true) ||
  (v.kind === "mcq" && v.options.some((o) => o.validation)) ||
  (v.kind === "sort" && v.items.some((i) => i.validityFromValidator));

/** Composition (6.1) over every combination of variants (sampled when there are very many). */
export function compositionProblems(quiz: Quiz): string[] {
  const p: string[] = [];
  const tagged = (tag: string) => quiz.slots.filter((s) => (s.tags as string[]).includes(tag));
  if (tagged("application").length < 3) p.push(`${quiz.section}: fewer than 3 application slots`);
  if (tagged("LO7").length < 1) p.push(`${quiz.section}: no LO7 slot`);
  const pools = quiz.slots.map((s) => [
    ...s.variants.map((v) => ({ slot: s, v })),
    ...(s.generator
      ? GENERATOR_SEEDS.slice(0, 3).map((seed) => ({ slot: s, v: s.generator!.generate(seededRng(seed)) }))
      : []),
  ]);
  const total = pools.reduce((n, pool) => n * Math.max(1, pool.length), 1);
  const combos: { slot: QuizSlot; v: QuizVariant }[][] = [];
  if (total <= 4096) {
    const walk = (i: number, acc: { slot: QuizSlot; v: QuizVariant }[]) => {
      if (i === pools.length) combos.push(acc);
      else for (const c of pools[i]!) walk(i + 1, [...acc, c]);
    };
    walk(0, []);
  } else {
    const rng = seededRng(42);
    for (let k = 0; k < 4096; k += 1) combos.push(pools.map((pool) => rng.pick(pool)));
  }
  const formats = SECTION_FORMATS[quiz.section] ?? [];
  for (const combo of combos) {
    const ids = combo.map((c) => c.v.id).join(", ");
    const has = new Set<string>(combo.flatMap((c) => c.v.formats));
    for (const f of formats) if (!has.has(f)) p.push(`${ids}: no variant covers ${f}`);
    if (quiz.section === "foundations") continue;
    if (!combo.some((c) => (c.slot.tags as string[]).includes("recognition") && isRecognitionVariant(c.v)))
      p.push(`${ids}: no recognition item (a recognition slot with a hideIdentity snippet or a hex head)`);
    if (!combo.some((c) => (c.slot.tags as string[]).includes("validity") && isValidityVariant(c.v)))
      p.push(
        `${ids}: no validity item (a validity slot with a single-pick spot, or options with validation)`,
      );
    if (p.length > 20) break;
  }
  return [...new Set(p)];
}

/** Every quiz check: structure, slots, variants, generators and composition. */
export function quizProblems(quiz: Quiz, ctx: QuizContext): string[] {
  const p: string[] = [];
  const prefix = quiz.slots[0]?.id.split(".")[0] ?? "";
  const want = Array.from({ length: 6 }, (_, i) => `${prefix}.${i + 1}`);
  if (quiz.slots.map((s) => s.id).join() !== want.join())
    p.push(`${quiz.section}: slots must be ${want.join(", ")}`);
  if (quiz.passMark !== 5) p.push(`${quiz.section}: the pass mark is 5 of 6 (D-09)`);
  if (!quiz.referenceCard.title.trim()) p.push(`${quiz.section}: the Reference card needs a title`);
  for (const slot of quiz.slots) p.push(...slotProblems(quiz, slot, ctx));
  p.push(...compositionProblems(quiz));
  return p;
}

/** Rule ids that content keys name but no validator implements. */
export function unknownRules(e: Exercise | QuizVariant): string[] {
  const named = [
    ...(e.kind === "fix-it" ? [...e.expectStarterRules, ...(e.validation.profile.include ?? [])] : []),
    ...questionsOf(e).flatMap(({ q }) =>
      q.kind === "spot-the-error" ? q.rounds.flatMap((r) => r.answers.map((a) => a.rule)) : [],
    ),
  ];
  return named.filter((r) => !(r in RULES));
}
