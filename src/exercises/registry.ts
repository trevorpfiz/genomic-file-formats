// The content registry: every exercise, standalone snippet and section quiz, keyed by the id
// that lesson directives use (docs/PLAN.md 11.1):
//   ::mcq{exercise="fasta-reference/which-token"}   -> an exercise
//   ::snippet{id="fasta-reference/toy-fa"}           -> a RegisteredSnippet
//   ::quiz{section="sequences"}                      -> a Quiz
// Exercise and snippet ids are "<lesson-id>/<slug>"; quiz ids are bare section ids, so the
// namespaces cannot collide.
//
// Pure TypeScript, no Vite-only imports: the lesson plugin loads this module through Vite's
// module runner (dev and build), the browser bundle imports it, and node tests import it.
// Never import it from vite.config.ts (that restarts the dev server on every exercise edit).
import * as fastaReference from "./fasta-reference.ts";
import * as fastqInTheWild from "./fastq-in-the-wild.ts";
import * as fastqReads from "./fastq-reads.ts";
import * as randomAccess from "./random-access.ts";
import { sequences } from "../quizzes/sequences.ts";
import type { Exercise, Kind, Quiz, RegisteredSnippet, SectionId } from "./types.ts";

/**
 * One entry per `src/exercises/<lesson-id>.ts` module, keyed by lesson id. Every export of a
 * registered module is an exercise (it has an exercise `kind`) or a RegisteredSnippet (its
 * `kind` is "text", "hex" or "compressed-text"); anything else is an error. Adding an exported
 * const to a registered module registers it; a new module is added here once.
 */
const modules: Record<string, Record<string, unknown>> = {
  "fasta-reference": fastaReference,
  "random-access": randomAccess,
  "fastq-reads": fastqReads,
  "fastq-in-the-wild": fastqInTheWild,
};

/** One entry per `src/quizzes/<section>.ts` module, keyed by section id. */
const quizModules: Record<SectionId, Quiz> = {
  sequences,
};

const EXERCISE_KINDS: ReadonlySet<string> = new Set<Kind>([
  "spot-the-error",
  "fix-it",
  "sort",
  "field-explorer",
  "simulator",
  "predict",
  "mcq",
]);
const SNIPPET_KINDS: ReadonlySet<string> = new Set(["text", "hex", "compressed-text"]);

/** What the lesson compiler needs to resolve and title a directive. */
export interface RegistryEntry {
  kind: Kind | "snippet" | "quiz";
  title?: string;
}

function register(byLesson: Record<string, Record<string, unknown>>) {
  const exercises: Record<string, Exercise> = {};
  const snippets: Record<string, RegisteredSnippet> = {};
  for (const [lessonId, mod] of Object.entries(byLesson)) {
    for (const [exportName, value] of Object.entries(mod)) {
      const item = value as { id?: unknown; kind?: unknown };
      const where = `src/exercises/${lessonId}.ts export "${exportName}"`;
      if (typeof item?.id !== "string" || typeof item.kind !== "string") {
        throw new Error(`${where} is not an exercise or a snippet (it needs a string id and kind)`);
      }
      if (!item.id.startsWith(`${lessonId}/`)) {
        throw new Error(`${where} has id "${item.id}"; ids in this module start with "${lessonId}/"`);
      }
      if (exercises[item.id] || snippets[item.id]) throw new Error(`Duplicate id "${item.id}" (${where})`);
      if (EXERCISE_KINDS.has(item.kind)) exercises[item.id] = value as Exercise;
      else if (SNIPPET_KINDS.has(item.kind)) snippets[item.id] = value as RegisteredSnippet;
      else throw new Error(`${where} has unknown kind "${item.kind}"`);
    }
  }
  return { exercises: Object.freeze(exercises), snippets: Object.freeze(snippets) };
}

const registered = register(modules);

export const exercises: Readonly<Record<string, Exercise>> = registered.exercises;
export const snippets: Readonly<Record<string, RegisteredSnippet>> = registered.snippets;
export const quizzes: Readonly<Record<SectionId, Quiz>> = Object.freeze({ ...quizModules });

for (const [section, quiz] of Object.entries(quizzes)) {
  if (quiz.section !== section)
    throw new Error(`Quiz module "${section}" declares section "${quiz.section}"`);
}

/** Every id a directive can name, for the lesson compiler (loaded by plugins/vite-plugin-lessons.ts). */
export const registry: Readonly<Record<string, RegistryEntry>> = Object.freeze(
  Object.fromEntries<RegistryEntry>([
    ...Object.values(exercises).map((e): [string, RegistryEntry] => [e.id, { kind: e.kind, title: e.title }]),
    ...Object.values(snippets).map((s): [string, RegistryEntry] => [
      s.id,
      { kind: "snippet", title: s.filename },
    ]),
    ...Object.values(quizzes).map((q): [string, RegistryEntry] => [
      q.section,
      { kind: "quiz", title: q.title },
    ]),
  ]),
);

export const getExercise = (id: string): Exercise | undefined => exercises[id];
export const getSnippet = (id: string): RegisteredSnippet | undefined => snippets[id];
export const getQuiz = (section: string): Quiz | undefined => quizzes[section];
