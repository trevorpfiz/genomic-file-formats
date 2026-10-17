// Quiz records (docs/PLAN.md 6.1, D-09, D-36; ux 12.1): the monotonic merge and the optional
// store methods the quiz page writes through. Pure; no DOM.
//
// The shell's progress store implements getQuiz/putQuiz over ProgressState.quizzes with this
// merge; until it does, the quiz page keeps records in memory (see quiz.ts).
import type { QuizAttempt, QuizProgress } from "../shell/progress-types.ts";

/** Optional quiz methods on a ProgressStore. */
export interface QuizProgressStore {
  getQuiz?(section: string): QuizProgress | undefined;
  putQuiz?(section: string, record: QuizProgress): void;
}

const earliest = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a <= b ? a : b);

/** The later attempt; the same attempt submitted beats it unsubmitted. */
function laterAttempt(x: QuizAttempt | undefined, y: QuizAttempt | undefined): QuizAttempt | undefined {
  if (!x) return y;
  if (!y) return x;
  if (x.number !== y.number) return x.number > y.number ? x : y;
  if (Boolean(x.submittedAt) !== Boolean(y.submittedAt)) return x.submittedAt ? x : y;
  return y.startedAt >= x.startedAt ? y : x;
}

/**
 * Merge two records for one quiz (D-36): best, of and attempts take the maximum; passedAt the
 * earliest date ("Passed" never disappears); the newer attempt in progress wins; unknown keys of
 * both are kept.
 */
export function mergeQuizProgress(a: QuizProgress | undefined, b: QuizProgress): QuizProgress {
  if (!a) return b;
  const current = laterAttempt(a.current, b.current);
  const merged: QuizProgress = {
    ...a,
    ...b,
    best: Math.max(a.best, b.best),
    of: Math.max(a.of, b.of),
    passedAt: earliest(a.passedAt, b.passedAt),
    attempts: Math.max(a.attempts, b.attempts),
  };
  if (current) merged.current = current;
  else delete merged.current;
  return merged;
}
