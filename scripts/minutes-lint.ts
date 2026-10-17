// The minutes model and lint (docs/PLAN.md 11.6, D-05; v3). `node scripts/minutes-lint.ts`
// prints each lesson's estimate and fails outside the bounds; tests/content-lint.test.ts runs
// the same checks and reuses the lesson analysis for the word-budget and placement rules.
//
// Model: prose words / 150, plus per graded interaction: sort 0.2 min per item (at least 0.5);
// spot-the-error 0.75 per round; predict 0.5 per item; simulator 1 per goal; fix-it 1 per
// expected starter rule; mcq 0.75; field-explorer 1 plus its check; follow-ups (and a predict
// gate) by their own type. Read-more text and optional exercises are excluded.
// Bounds: a written lesson rounds to 8-12 minutes (fail) and stays within 1 minute of its
// frontmatter (warn); the 22 lessons total 185-195 (fail), counting the course-map minutes of
// lessons not written yet. D-05's tie-break: 600 prose words is a ceiling and 8 minutes a floor,
// so a lesson whose interactions leave it under 8 minutes at 600 words may keep the prose that
// brings it to 8 (proseCap, which the content lint applies with a warning).
//
// A lesson is "written" once it has a graded interaction; stubs are reported, not judged.
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Nodes, Root, RootContent } from "mdast";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";
import { pages as manifest } from "../content/course.ts";
import { exercises } from "../src/exercises/registry.ts";
import type { Exercise, FollowUp } from "../src/exercises/types.ts";

export const WORDS_PER_MINUTE = 150;
export const PROSE_CAP = 600;
export const MINUTES = { min: 8, max: 12, drift: 1, totalMin: 185, totalMax: 195 } as const;
export const EXERCISE_DIRECTIVES = new Set([
  "spot-the-error",
  "fix-it",
  "sort",
  "field-explorer",
  "predict",
  "mcq",
  "simulator",
]);
export const DISCLOSURES = new Set(["read-more", "spec-detail", "why-it-matters"]);

/** Minutes one embedded question adds (follow-ups, embedded checks and predict gates). */
function embeddedMinutes(q: FollowUp): number {
  switch (q.kind) {
    case "predict":
      return 0.5 * q.items.length;
    case "mcq":
      return 0.75;
    case "spot-the-error":
      return 0.75 * q.rounds.length;
  }
}

/** The model's minutes for one graded exercise, its follow-ups included. */
export function exerciseMinutes(e: Exercise): number {
  let m = 0;
  switch (e.kind) {
    case "sort":
      m = Math.max(0.5, 0.2 * e.items.length);
      break;
    case "spot-the-error":
      m = 0.75 * e.rounds.length;
      break;
    case "predict":
      m = 0.5 * e.items.length;
      break;
    case "simulator":
      m = e.goals.length + (e.predictGate ? embeddedMinutes(e.predictGate) : 0);
      break;
    case "fix-it":
      m = e.expectStarterRules.length;
      break;
    case "mcq":
      m = 0.75;
      break;
    case "field-explorer":
      m = 1 + (e.check ? embeddedMinutes(e.check) : 0);
      break;
  }
  return m + (e.followUps ?? []).reduce((n, f) => n + embeddedMinutes(f), 0);
}

/** Words as the model counts them: whitespace-separated tokens with a letter or digit. */
export const countWords = (text: string): number =>
  text.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;

export type BlockKind = "prose" | "exercise" | "disclosure" | "code" | "other";

export interface Block {
  kind: BlockKind;
  /** The mdast type, or the directive name for directives. */
  name: string;
  line: number;
  /** Prose words in the block (0 for code, exercises and disclosures). */
  words: number;
  /** Exercise blocks: the exercise id. */
  ref?: string;
  /** Disclosures: the title attribute, and the exercises inside. */
  title?: string;
  exercises?: string[];
}

export interface Section {
  /** The H2 text; null for the blocks before the first H2. */
  heading: string | null;
  line: number;
  tryIt: boolean;
  recap: boolean;
  blocks: Block[];
}

export interface Analysis {
  file: string;
  id: string;
  minutes: number;
  sections: Section[];
  /** Main-text prose words (Read-more and other disclosures, code and headings excluded). */
  proseWords: number;
  /** Graded interactions in page order, with the prose words between them. */
  graded: { ref: string; minutes: number; section: number; wordsBefore: number }[];
  interactionMinutes: number;
  estimate: number;
  written: boolean;
  /** Paragraph, list-item and callout texts (main text and disclosures) for the sentence lint. */
  sentences: { text: string; line: number }[];
  root: Root;
  source: string;
}

const parser = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm).use(remarkDirective);

/** Visible text of a node: text and inline code; text directives as their source (chr2:166,...). */
export function textOf(node: Nodes, source: string): string {
  if (node.type === "code" || node.type === "html" || node.type === "yaml") return "";
  if (node.type === "textDirective") {
    const { start, end } = node.position ?? {};
    return start && end ? source.slice(start.offset, end.offset) : "";
  }
  if (node.type === "text" || node.type === "inlineCode") return node.value;
  if ("children" in node)
    return (node.children as Nodes[])
      .map((c) => textOf(c, source))
      .join(node.type === "list" || node.type === "root" ? "\n" : " ");
  if (node.type === "break") return " ";
  return "";
}

/** Text with inline code replaced by a placeholder word, for sentence splitting. */
function sentenceText(node: Nodes, source: string): string {
  if (node.type === "inlineCode") return "CODE";
  if (node.type === "textDirective") return textOf(node, source);
  if (node.type === "text") return node.value;
  if (node.type === "break") return " ";
  if ("children" in node) return (node.children as Nodes[]).map((c) => sentenceText(c, source)).join("");
  return "";
}

function collectSentences(node: Nodes, source: string, out: { text: string; line: number }[]): void {
  if (
    node.type === "code" ||
    node.type === "table" ||
    node.type === "heading" ||
    node.type === "leafDirective"
  )
    return;
  if (node.type === "paragraph") {
    out.push({
      text: sentenceText(node, source).replace(/\s+/g, " ").trim(),
      line: node.position?.start.line ?? 0,
    });
    return;
  }
  if ("children" in node) for (const c of node.children as Nodes[]) collectSentences(c, source, out);
}

function exercisesInside(node: Nodes): string[] {
  const out: string[] = [];
  const walk = (n: Nodes) => {
    if (n.type === "leafDirective" && EXERCISE_DIRECTIVES.has(n.name)) out.push(n.attributes?.exercise ?? "");
    if ("children" in n) for (const c of n.children as Nodes[]) walk(c);
  };
  walk(node);
  return out;
}

function classify(node: RootContent, source: string): Block {
  const line = node.position?.start.line ?? 0;
  if (node.type === "leafDirective") {
    if (EXERCISE_DIRECTIVES.has(node.name))
      return { kind: "exercise", name: node.name, line, words: 0, ref: node.attributes?.exercise ?? "" };
    return { kind: "other", name: node.name, line, words: 0 };
  }
  if (node.type === "containerDirective") {
    if (DISCLOSURES.has(node.name))
      return {
        kind: "disclosure",
        name: node.name,
        line,
        words: 0,
        title: node.attributes?.title ?? "",
        exercises: exercisesInside(node),
      };
    return { kind: "prose", name: node.name, line, words: countWords(textOf(node, source)) };
  }
  if (node.type === "code") return { kind: "code", name: "code", line, words: 0 };
  if (
    node.type === "paragraph" ||
    node.type === "list" ||
    node.type === "blockquote" ||
    node.type === "table"
  )
    return { kind: "prose", name: node.type, line, words: countWords(textOf(node, source)) };
  return { kind: "other", name: node.type, line, words: 0 };
}

/** Analyse one lesson's Markdown with the exercise data it names. */
export function analyzeLesson(
  source: string,
  file: string,
  byId: Readonly<Record<string, Exercise>> = exercises,
): Analysis {
  const root = parser.parse(source) as Root;
  const yaml =
    root.children[0]?.type === "yaml" ? (parseYaml(root.children[0].value) as Record<string, unknown>) : {};
  const sections: Section[] = [{ heading: null, line: 1, tryIt: false, recap: false, blocks: [] }];
  const sentences: { text: string; line: number }[] = [];
  for (const node of root.children) {
    if (node.type === "yaml") continue;
    if (node.type === "heading" && node.depth === 2) {
      const heading = textOf(node, source).trim();
      sections.push({
        heading,
        line: node.position?.start.line ?? 0,
        tryIt: heading.startsWith("Try it:"),
        recap: heading === "Recap",
        blocks: [],
      });
      continue;
    }
    if (node.type === "heading") continue;
    sections.at(-1)!.blocks.push(classify(node, source));
    collectSentences(node, source, sentences);
  }
  if (!sections[0]!.blocks.length) sections.shift();

  const graded: Analysis["graded"] = [];
  let words = 0;
  let since = 0;
  sections.forEach((section, si) => {
    for (const block of section.blocks) {
      if (block.kind === "prose") {
        words += block.words;
        since += block.words;
      }
      if (block.kind === "exercise" && block.ref) {
        const e = byId[block.ref];
        graded.push({ ref: block.ref, minutes: e ? exerciseMinutes(e) : 0, section: si, wordsBefore: since });
        since = 0;
      }
    }
  });
  const interactionMinutes = graded.reduce((n, g) => n + g.minutes, 0);
  return {
    file,
    id: typeof yaml.id === "string" ? yaml.id : "",
    minutes: Number(yaml.minutes ?? 0),
    sections,
    proseWords: words,
    graded,
    interactionMinutes,
    estimate: words / WORDS_PER_MINUTE + interactionMinutes,
    written: graded.length > 0,
    sentences,
    root,
    source,
  };
}

/** The prose ceiling for a lesson (D-05): 600 words, or what reaches the 8-minute floor. */
export const proseCap = (a: Pick<Analysis, "interactionMinutes">): number =>
  Math.max(PROSE_CAP, Math.ceil((MINUTES.min - a.interactionMinutes) * WORDS_PER_MINUTE));

export interface MinutesReport {
  errors: string[];
  warnings: string[];
  rows: string[];
  total: number;
}

/** Apply the minutes bounds to analysed lessons, over the manifest's 22 lessons (D-37). */
export function lintMinutes(analyses: readonly Analysis[]): MinutesReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: string[] = [];
  let total = 0;
  for (const lesson of manifest.filter((p) => p.kind === "lesson")) {
    const a = analyses.find((x) => x.id === lesson.id);
    if (!a?.written) {
      total += lesson.minutes ?? 0;
      rows.push(`${lesson.id.padEnd(26)} ${a ? "stub" : "planned"}: course map ${lesson.minutes} min`);
      continue;
    }
    total += a.estimate;
    rows.push(
      `${a.id.padEnd(26)} ${a.estimate.toFixed(2)} min (prose ${a.proseWords} words = ${(a.proseWords / WORDS_PER_MINUTE).toFixed(2)}, ${a.graded.length} interactions = ${a.interactionMinutes.toFixed(2)}); frontmatter ${a.minutes}`,
    );
    const rounded = Math.round(a.estimate);
    if (rounded < MINUTES.min || rounded > MINUTES.max)
      errors.push(
        `${a.file}: the model gives ${a.estimate.toFixed(2)} min, outside ${MINUTES.min}-${MINUTES.max}`,
      );
    if (Math.abs(a.estimate - a.minutes) > MINUTES.drift)
      warnings.push(
        `${a.file}: the model gives ${a.estimate.toFixed(2)} min; the frontmatter says ${a.minutes}`,
      );
  }
  if (total < MINUTES.totalMin || total > MINUTES.totalMax)
    errors.push(
      `the 22 lessons total ${total.toFixed(1)} min, outside ${MINUTES.totalMin}-${MINUTES.totalMax} (OQ-2)`,
    );
  return { errors, warnings, rows, total };
}

/** Every lesson file under content/lessons, analysed. */
export function analyzeAll(root = process.cwd()): Analysis[] {
  return globSync("content/lessons/**/*.md", { cwd: root })
    .sort()
    .map((file) => ({ file, source: readFileSync(`${root}/${file}`, "utf8") }))
    .filter(({ source }) => /^---\n(?:[\s\S]*?\n)?kind:\s*lesson\b/.test(source))
    .map(({ file, source }) => analyzeLesson(source, file));
}

function main(): number {
  const report = lintMinutes(analyzeAll());
  for (const row of report.rows) console.log(`minutes-lint: ${row}`);
  console.log(
    `minutes-lint: total ${report.total.toFixed(1)} min (target ${MINUTES.totalMin}-${MINUTES.totalMax})`,
  );
  for (const w of report.warnings) console.warn(`minutes-lint: warning: ${w}`);
  for (const e of report.errors) console.error(`minutes-lint: error: ${e}`);
  return report.errors.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main();
