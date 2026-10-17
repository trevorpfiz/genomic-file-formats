// Values derived from stored progress, never stored themselves (docs/PLAN.md 11.4, D-10;
// ux 12.1): lesson completion, quiz status, course counts, the badge rule and the home page's
// "Continue" target. Pure.
import type { CourseModel, OutlineEntry } from "./course-model.ts";
import { isComplete } from "./progress-merge.ts";
import type { ProgressState } from "./progress-types.ts";

export type ItemStatus = "planned" | "not-started" | "in-progress" | "complete";

export interface LessonProgressInfo {
  status: ItemStatus;
  /** Graded exercises correct or revealed. */
  done: number;
  total: number;
  /** Graded exercise ids not yet complete, in page order. */
  remaining: string[];
}

/**
 * A lesson is complete when every graded exercise is correct or revealed (optional practice
 * never counts). A lesson without graded exercises counts as complete once visited.
 */
export function lessonProgress(entry: OutlineEntry, state: ProgressState): LessonProgressInfo {
  if (!entry.page) return { status: "planned", done: 0, total: 0, remaining: [] };
  const record = state.lessons[entry.id];
  const exercises = record?.exercises ?? {};
  const remaining = entry.graded.filter((id) => {
    const r = exercises[id];
    return !r || !isComplete(r.state);
  });
  const total = entry.graded.length;
  const done = total - remaining.length;
  let status: ItemStatus;
  if (total === 0) status = record?.visitedAt ? "complete" : "not-started";
  else if (done === total) status = "complete";
  else if (done > 0 || record?.visitedAt || entry.graded.some((id) => exercises[id])) status = "in-progress";
  else status = "not-started";
  return { status, done, total, remaining };
}

export interface QuizInfo {
  status: ItemStatus;
  passed: boolean;
  best: number;
  of: number;
  attempts: number;
}

export function quizInfo(entry: OutlineEntry, state: ProgressState): QuizInfo {
  const section = entry.section ?? "";
  const q = state.quizzes[section];
  const passed = Boolean(q?.passedAt);
  const base = { passed, best: q?.best ?? 0, of: q?.of ?? 0, attempts: q?.attempts ?? 0 };
  if (!entry.page) return { status: "planned", ...base };
  if (passed) return { status: "complete", ...base };
  if (q && (q.attempts > 0 || q.current)) return { status: "in-progress", ...base };
  return { status: "not-started", ...base };
}

export function capstoneStatus(entry: OutlineEntry, state: ProgressState): ItemStatus {
  if (!entry.page) return "planned";
  if (state.capstone.completedAt) return "complete";
  return Object.keys(state.capstone.files).length ? "in-progress" : "not-started";
}

/** The status of any outline item. */
export function itemStatus(entry: OutlineEntry, state: ProgressState): ItemStatus {
  if (entry.kind === "lesson") return lessonProgress(entry, state).status;
  if (entry.kind === "quiz") return quizInfo(entry, state).status;
  return capstoneStatus(entry, state);
}

export interface CourseCounts {
  /** Outline items complete, of 30. */
  done: number;
  total: number;
  quizzesPassed: number;
  quizzes: number;
  lessonsDone: number;
  lessons: number;
}

export function courseCounts(model: CourseModel, state: ProgressState): CourseCounts {
  let done = 0;
  let quizzesPassed = 0;
  let lessonsDone = 0;
  for (const entry of model.entries) {
    if (entry.kind === "quiz" && state.quizzes[entry.section ?? ""]?.passedAt) quizzesPassed += 1;
    const complete =
      entry.kind === "quiz"
        ? Boolean(state.quizzes[entry.section ?? ""]?.passedAt)
        : itemStatus(entry, state) === "complete";
    if (complete) done += 1;
    if (complete && entry.kind === "lesson") lessonsDone += 1;
  }
  return {
    done,
    total: model.entries.length,
    quizzesPassed,
    quizzes: model.quizCount,
    lessonsDone,
    lessons: model.lessonCount,
  };
}

/** D-10: every section quiz passed and the capstone complete. Lessons are not required. */
export function badgeEarned(model: CourseModel, state: ProgressState): boolean {
  const quizzes = model.entries.filter((e) => e.kind === "quiz");
  return (
    quizzes.length > 0 &&
    quizzes.every((q) => Boolean(state.quizzes[q.section ?? ""]?.passedAt)) &&
    Boolean(state.capstone.completedAt)
  );
}

/**
 * Where "Continue" leads: the most recently visited lesson while it is incomplete, else the
 * first built item after it that is not complete, else the first incomplete built item. Null
 * for a learner with no progress (the button then reads "Start the course").
 */
export function continueTarget(
  model: CourseModel,
  state: ProgressState,
): { entry: OutlineEntry; started: boolean } | null {
  const built = model.built;
  if (!built.length) return null;
  let lastIndex = -1;
  let lastAt = "";
  built.forEach((entry, i) => {
    const at = state.lessons[entry.id]?.visitedAt ?? "";
    if (at && at > lastAt) {
      lastAt = at;
      lastIndex = i;
    }
  });
  const anyProgress =
    lastIndex >= 0 ||
    Object.keys(state.quizzes).length > 0 ||
    Object.values(state.lessons).some((l) => Object.keys(l.exercises ?? {}).length > 0);
  if (!anyProgress) return { entry: built[0]!, started: false };
  const incomplete = (e: OutlineEntry) => itemStatus(e, state) !== "complete";
  const last = built[lastIndex];
  if (last && incomplete(last)) return { entry: last, started: true };
  const after = built.slice(lastIndex + 1).find(incomplete) ?? built.find(incomplete);
  return after ? { entry: after, started: true } : null;
}
