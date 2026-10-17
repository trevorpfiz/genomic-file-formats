// Monotonic merges for stored progress (D-36; docs/PLAN.md 11.4). The shell's store applies
// them on every flush (stored JSON + memory), on storage events from other pages and on
// progress-code imports; the cards' in-memory store uses the exercise merge too.
//
// Rules: a complete exercise state never reverts, and correct beats revealed; attempts and best
// scores take the maximum; firstTry and revealed stick once true; passedAt, earnedAt, solvedAt
// and completedAt take the earliest date; unknown keys, at any level, are preserved verbatim.
import type { ExerciseState } from "../exercises/types.ts";
import { mergeQuizProgress } from "../widgets/quiz-progress.ts";
import {
  PROGRESS_SCHEMA,
  type BadgeProgress,
  type CapstoneFileProgress,
  type CapstoneProgress,
  type ExerciseProgress,
  type IsoDate,
  type LessonProgress,
  type Prefs,
  type ProgressState,
  type QuizProgress,
} from "./progress-types.ts";

const COMPLETE: ReadonlySet<ExerciseState> = new Set(["correct", "revealed"]);
const STATES: ReadonlySet<string> = new Set(["idle", "attempted", "incorrect", "correct", "revealed"]);

/** True for the states that count toward completion. */
export const isComplete = (state: ExerciseState): boolean => COMPLETE.has(state);

const earliest = (a?: IsoDate, b?: IsoDate): IsoDate | undefined =>
  a === undefined ? b : b === undefined ? a : a <= b ? a : b;
const latest = (a?: IsoDate, b?: IsoDate): IsoDate | undefined =>
  a === undefined ? b : b === undefined ? a : a >= b ? a : b;
const earliestOrNull = (a: IsoDate | null, b: IsoDate | null): IsoDate | null =>
  a === null ? b : b === null ? a : a <= b ? a : b;

/** Set an optional key, or delete it when the value is undefined (keeps records minimal). */
function setOptional<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

/**
 * Merge two records for the same exercise. Commutative and idempotent:
 * - a complete state wins over an incomplete one, and correct wins over revealed;
 * - between two incomplete states the more recently updated record wins;
 * - attempts take the maximum; firstTry and revealed are sticky once true;
 * - solvedAt takes the earliest date, updatedAt the latest;
 * - the answer travels with the winning state; unknown keys of both are kept.
 */
export function mergeExerciseProgress(a: ExerciseProgress, b: ExerciseProgress): ExerciseProgress {
  const winner = pickWinner(a, b);
  const loser = winner === a ? b : a;
  const merged: ExerciseProgress = {
    ...loser,
    ...winner,
    state: winner.state,
    attempts: Math.max(a.attempts, b.attempts),
    firstTry: a.firstTry || b.firstTry,
    revealed: a.revealed || b.revealed,
  };
  setOptional(merged, "solvedAt", earliest(a.solvedAt, b.solvedAt));
  setOptional(merged, "updatedAt", latest(a.updatedAt, b.updatedAt));
  if (winner.answer === undefined && loser.answer !== undefined) merged.answer = loser.answer;
  return merged;
}

function pickWinner<T extends { state: ExerciseState; updatedAt?: IsoDate }>(a: T, b: T): T {
  const ac = isComplete(a.state);
  const bc = isComplete(b.state);
  if (ac !== bc) return ac ? a : b;
  if (ac && bc && a.state !== b.state) return a.state === "correct" ? a : b;
  // Same completeness: the newer record wins; ties keep a stable order by state name.
  const au = a.updatedAt ?? "";
  const bu = b.updatedAt ?? "";
  if (au !== bu) return au > bu ? a : b;
  return a.state >= b.state ? a : b;
}

/** One capstone file: the same monotonic rules as an exercise. */
export function mergeCapstoneFile(a: CapstoneFileProgress, b: CapstoneFileProgress): CapstoneFileProgress {
  const winner = pickWinner<CapstoneFileProgress & { updatedAt?: IsoDate }>(a, b);
  const loser = winner === a ? b : a;
  const merged: CapstoneFileProgress = {
    ...loser,
    ...winner,
    state: winner.state,
    attempts: Math.max(a.attempts, b.attempts),
    revealed: a.revealed || b.revealed,
  };
  if (winner.answer === undefined && loser.answer !== undefined) merged.answer = loser.answer;
  return merged;
}

/**
 * Merge two maps: keys on one side only are kept verbatim (an older or newer copy may own
 * them); keys on both sides are merged with `merge`.
 */
export function mergeMaps<T>(
  a: Readonly<Record<string, T>> | undefined,
  b: Readonly<Record<string, T>> | undefined,
  merge: (x: T, y: T) => T,
): Record<string, T> {
  const out: Record<string, T> = { ...a, ...b };
  if (a && b) {
    for (const key of Object.keys(a)) {
      if (Object.hasOwn(b, key)) out[key] = merge(a[key] as T, b[key] as T);
    }
  }
  return out;
}

/** visitedAt is the latest visit (it chooses "Continue"); exercises merge one by one. */
export function mergeLessonProgress(a: LessonProgress, b: LessonProgress): LessonProgress {
  const merged: LessonProgress = {
    ...a,
    ...b,
    exercises: mergeMaps(a.exercises, b.exercises, mergeExerciseProgress),
  };
  setOptional(merged, "visitedAt", latest(a.visitedAt, b.visitedAt));
  return merged;
}

export function mergeCapstone(a: CapstoneProgress, b: CapstoneProgress): CapstoneProgress {
  const merged: CapstoneProgress = { ...a, ...b, files: mergeMaps(a.files, b.files, mergeCapstoneFile) };
  setOptional(merged, "completedAt", earliest(a.completedAt, b.completedAt));
  return merged;
}

/** earnedAt is the earliest date; the name on the badge comes from the newer state. */
export function mergeBadge(older: BadgeProgress, newer: BadgeProgress): BadgeProgress {
  return { ...older, ...newer, earnedAt: earliestOrNull(older.earnedAt, newer.earnedAt) };
}

/** Quizzes: best, of and attempts take the maximum, passedAt the earliest (src/widgets/quiz-progress.ts). */
export const mergeQuiz = (a: QuizProgress, b: QuizProgress): QuizProgress => mergeQuizProgress(a, b);

/**
 * Merge two whole states. Preferences and the badge name follow the newer state (by
 * `updatedAt`; `b` wins a tie); everything else merges monotonically, whichever side is newer.
 */
export function mergeProgressState(a: ProgressState, b: ProgressState): ProgressState {
  const bNewer = b.updatedAt >= a.updatedAt;
  const older = bNewer ? a : b;
  const newer = bNewer ? b : a;
  return {
    ...older,
    ...newer,
    schema: PROGRESS_SCHEMA,
    updatedAt: newer.updatedAt,
    lessons: mergeMaps(a.lessons, b.lessons, mergeLessonProgress),
    quizzes: mergeMaps(a.quizzes, b.quizzes, mergeQuiz),
    capstone: mergeCapstone(a.capstone, b.capstone),
    badge: mergeBadge(older.badge, newer.badge),
    prefs: { ...older.prefs, ...newer.prefs },
  };
}

// ---------------------------------------------------------------------------------------------
// Reading stored JSON

export const DEFAULT_PREFS: Prefs = { whitespace: false, colorBases: false, tabMovesFocus: false };

/** A fresh, empty state. */
export function emptyState(now: IsoDate = new Date(0).toISOString()): ProgressState {
  return {
    schema: PROGRESS_SCHEMA,
    updatedAt: now,
    lessons: {},
    quizzes: {},
    capstone: { files: {} },
    badge: { earnedAt: null, name: "" },
    prefs: { ...DEFAULT_PREFS },
  };
}

type Loose = Record<string, unknown>;
const isObject = (v: unknown): v is Loose => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const date = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const dateOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Map a loose record's entries through `fix`, dropping entries that are not objects. */
function mapEntries<T>(v: unknown, fix: (x: Loose) => T): Record<string, T> {
  const out: Record<string, T> = {};
  if (!isObject(v)) return out;
  for (const [key, value] of Object.entries(v)) if (isObject(value)) out[key] = fix(value);
  return out;
}

function fixExercise(x: Loose): ExerciseProgress {
  const out = {
    ...x,
    state: STATES.has(x.state as string) ? (x.state as ExerciseState) : "idle",
    attempts: num(x.attempts),
    firstTry: x.firstTry === true,
    revealed: x.revealed === true,
  } as ExerciseProgress;
  setOptional(out, "updatedAt", date(x.updatedAt));
  setOptional(out, "solvedAt", date(x.solvedAt));
  return out;
}

function fixQuiz(x: Loose): QuizProgress {
  return {
    ...x,
    best: num(x.best),
    of: num(x.of),
    passedAt: dateOrNull(x.passedAt),
    attempts: num(x.attempts),
  };
}

function fixCapstoneFile(x: Loose): CapstoneFileProgress {
  return {
    ...x,
    state: STATES.has(x.state as string) ? (x.state as ExerciseState) : "idle",
    attempts: num(x.attempts),
    revealed: x.revealed === true,
  } as CapstoneFileProgress;
}

export type ParseResult =
  | { ok: true; state: ProgressState }
  | { ok: false; reason: "empty" | "invalid" | "newer-schema" };

/**
 * Read a stored or imported value into a well-formed state. Unknown keys are kept; malformed
 * known fields are repaired (a number that is not a number counts as 0), so a merge never
 * produces NaN. A newer schema is refused: it is not ours to rewrite.
 */
export function parseProgress(raw: string | null | undefined): ParseResult {
  if (raw === null || raw === undefined || raw === "") return { ok: false, reason: "empty" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  return normalizeProgress(value);
}

export function normalizeProgress(value: unknown): ParseResult {
  if (!isObject(value)) return { ok: false, reason: "invalid" };
  if (typeof value.schema === "number" && value.schema > PROGRESS_SCHEMA)
    return { ok: false, reason: "newer-schema" };
  if (value.schema !== PROGRESS_SCHEMA) return { ok: false, reason: "invalid" };
  const base = emptyState(date(value.updatedAt));
  const capstone = isObject(value.capstone) ? value.capstone : {};
  const badge = isObject(value.badge) ? value.badge : {};
  const state: ProgressState = {
    ...value,
    schema: PROGRESS_SCHEMA,
    updatedAt: base.updatedAt,
    lessons: mapEntries(value.lessons, (l) => {
      const lesson: LessonProgress = { ...l, exercises: mapEntries(l.exercises, fixExercise) };
      setOptional(lesson, "visitedAt", date(l.visitedAt));
      return lesson;
    }),
    quizzes: mapEntries(value.quizzes, fixQuiz),
    capstone: (() => {
      const out: CapstoneProgress = { ...capstone, files: mapEntries(capstone.files, fixCapstoneFile) };
      setOptional(out, "completedAt", date(capstone.completedAt));
      return out;
    })(),
    badge: {
      ...badge,
      earnedAt: dateOrNull(badge.earnedAt),
      name: typeof badge.name === "string" ? badge.name : "",
    },
    prefs: { ...DEFAULT_PREFS, ...(isObject(value.prefs) ? value.prefs : {}) } as Prefs,
  };
  return { ok: true, state };
}
