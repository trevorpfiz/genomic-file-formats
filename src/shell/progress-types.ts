// The stored progress schema (ux-design.md 12.1, docs/PLAN.md 11.4, D-23, D-36) and the store
// interface exercise cards write through. Type-only, plus the storage key constants.
//
// Storage: one JSON value under PROGRESS_KEY in localStorage; the theme lives separately under
// THEME_KEY (src/shell/theme.ts). Chromium shares one file:// store across copies, so:
// - writes are merges, never overwrites: each flush reads the stored JSON, merges it with memory
//   and writes the result (debounced at 300 ms); storage events and progress-code imports merge
//   the same way ("replace" only as an explicit choice);
// - unknown keys, at any level, are preserved verbatim (an older or newer copy may own them);
// - merges are monotonic (see mergeExerciseProgress in src/shell/progress-merge.ts):
//   correct and revealed never revert; attempts and best scores take the maximum; firstTry and
//   revealed are sticky once true; passedAt, earnedAt and solvedAt take the earliest date.
// Every storage access is wrapped in try/catch; without storage the store keeps state in memory
// and the shell shows the notice and offers the progress code (D-29).

import type { ExerciseId, ExerciseState, SectionId } from "../exercises/types.ts";

export const PROGRESS_KEY = "genomic-file-formats:v1:progress";
export const THEME_KEY = "genomic-file-formats:theme";
/** Bumped only with a migration (a major course version, docs/PLAN.md 11.7). */
export const PROGRESS_SCHEMA = 1;

/** An ISO 8601 timestamp, UTC: "2026-10-16T12:00:00.000Z". */
export type IsoDate = string;

/** One exercise card's record. Stored for optional exercises too; they never count. */
export interface ExerciseProgress {
  state: ExerciseState;
  /** Checks made (a predict lock counts as one). */
  attempts: number;
  /** Correct on the first check, without a reveal. */
  firstTry: boolean;
  /** "Show answer" (or a predict reveal) was used at least once. */
  revealed: boolean;
  /** The widget's last answer, JSON-serializable, to restore the card after a reload. */
  answer?: unknown;
  updatedAt?: IsoDate;
  /** When the card first reached correct or revealed. */
  solvedAt?: IsoDate;
}

export interface LessonProgress {
  visitedAt?: IsoDate;
  /**
   * Keyed by the full exercise id ("fasta-reference/why-wont-this-index"). Ids that no longer
   * exist after a content edit are kept (unknown keys are preserved) and ignored.
   */
  exercises: Record<ExerciseId, ExerciseProgress>;
}

/** One quiz attempt in progress or just submitted; enough to redraw it after a reload. */
export interface QuizAttempt {
  startedAt: IsoDate;
  /** Attempt number, 1-based; it chooses each slot's authored variant (cycling). */
  number: number;
  /** Seed for parametric slots and option shuffles. */
  seed: number;
  /** Slot id -> chosen variant id (authored) or "<generator-id>:<seed>" (parametric). */
  variants: Record<string, string>;
  /** Slot id -> the widget's answer. */
  answers: Record<string, unknown>;
  submittedAt?: IsoDate;
  /** Correct slots, once submitted. */
  score?: number;
}

export interface QuizProgress {
  /** Best score over submitted attempts. */
  best: number;
  /** Number of scored questions (6). */
  of: number;
  /** First time best reached the pass mark; permanent ("Passed" never disappears). */
  passedAt: IsoDate | null;
  /** Submitted attempts. */
  attempts: number;
  current?: QuizAttempt;
}

export interface CapstoneFileProgress {
  state: ExerciseState;
  attempts: number;
  revealed: boolean;
  /** Format, verdict and reason as last submitted. */
  answer?: { format?: string; verdict?: string; reason?: string };
}

export interface CapstoneProgress {
  /** Keyed by file id: "F01" ... "F15". */
  files: Record<string, CapstoneFileProgress>;
  completedAt?: IsoDate;
}

export interface BadgeProgress {
  /** Set the first time the badge rule (D-10) holds; derived, but the date is kept. */
  earnedAt: IsoDate | null;
  /** "Name on badge", stored locally only. */
  name: string;
}

/** Viewer and editor preferences (the theme is stored separately, under THEME_KEY). */
export interface Prefs {
  whitespace: boolean;
  colorBases: boolean;
  /** Fix-it: Tab moves focus instead of inserting a TAB. */
  tabMovesFocus: boolean;
}

/** The whole stored value. Unknown keys at any level are preserved by merges. */
export interface ProgressState {
  schema: typeof PROGRESS_SCHEMA;
  updatedAt: IsoDate;
  /** Keyed by lesson id ("fasta-reference"). */
  lessons: Record<string, LessonProgress>;
  /** Keyed by section id ("sequences"). */
  quizzes: Record<SectionId, QuizProgress>;
  capstone: CapstoneProgress;
  badge: BadgeProgress;
  prefs: Prefs;
}

/**
 * What exercise cards read and write. The shell implements it over ProgressState with the
 * merge rules above and installs it with `setProgressStore` (src/widgets/card.ts) before the
 * first render; until then cards use an in-memory store.
 */
export interface ProgressStore {
  /** The stored record for an exercise, if any. */
  getExercise(id: ExerciseId): ExerciseProgress | undefined;
  /** Merge a record into the store (never a plain overwrite: correct and revealed never revert). */
  putExercise(id: ExerciseId, record: ExerciseProgress): void;
}

// Derived values (never stored, docs/PLAN.md 11.4, D-10):
// - lesson complete: every non-optional exercise on the page is correct or revealed;
// - quiz passed: passedAt !== null;
// - capstone complete: every file is correct or revealed;
// - badge earned: all 7 quizzes passed and the capstone complete.
// Course progress counts 30 outline items: 22 lessons, 7 quizzes and the capstone.
