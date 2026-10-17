// The course's progress store (docs/PLAN.md 11.4, D-23, D-29, D-36). It keeps the whole
// ProgressState in memory and writes it to localStorage under PROGRESS_KEY:
//
// - every write is a merge: a flush (debounced at 300 ms) reads the stored JSON, merges it with
//   memory (src/shell/progress-merge.ts) and writes the result, so two pages or two copies of the
//   course sharing Chromium's one file:// store never erase each other's progress;
// - a `storage` event from another page merges the same way (receive);
// - a progress-code import merges too; "replace" is an explicit choice (importState);
// - unknown keys are preserved verbatim;
// - without storage, or after a failed write, it keeps state in memory and says so
//   (`persistent` is false), and the shell shows the notice and "Progress not saved".
//
// Cards read and write exercise records through ProgressStore, and the quiz page quiz records
// (getQuiz/putQuiz).
import {
  emptyState,
  mergeExerciseProgress,
  mergeProgressState,
  mergeQuizProgress,
  parseProgress,
} from "./progress-merge.ts";
import {
  PROGRESS_KEY,
  type ExerciseProgress,
  type IsoDate,
  type ProgressState,
  type ProgressStore,
  type QuizProgress,
} from "./progress-types.ts";
import { readItem, writeItem, type StorageLike } from "./storage.ts";

/** Where an unreadable stored value is copied before the first write replaces it. */
export const UNREADABLE_KEY = `${PROGRESS_KEY}:unreadable`;

/** Why progress is kept in memory only. */
export type MemoryReason = "unavailable" | "write-failed" | "newer-schema";

export interface CourseStoreOptions {
  /** A probed storage (src/shell/storage.ts), or null for memory only. */
  storage: StorageLike | null;
  now?: () => IsoDate;
  /** Flush debounce in ms (300). */
  delay?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** The lesson an exercise belongs to: exercise ids start with "<lesson-id>/" (D-22). */
export const lessonIdOf = (exerciseId: string): string => exerciseId.split("/")[0] ?? exerciseId;

export class CourseStore implements ProgressStore {
  #state: ProgressState;
  #storage: StorageLike | null;
  #reason: MemoryReason | null = null;
  #now: () => IsoDate;
  #delay: number;
  #setTimer: (fn: () => void, ms: number) => unknown;
  #clearTimer: (handle: unknown) => void;
  #timer: unknown = undefined;
  #listeners = new Set<(state: ProgressState) => void>();
  #persistenceListeners = new Set<(persistent: boolean, reason: MemoryReason | null) => void>();

  constructor(options: CourseStoreOptions) {
    this.#storage = options.storage;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#delay = options.delay ?? 300;
    this.#setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.#clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.#state = emptyState();
    if (!this.#storage) {
      this.#reason = "unavailable";
      return;
    }
    const raw = readItem(this.#storage, PROGRESS_KEY);
    const parsed = parseProgress(raw);
    if (parsed.ok) this.#state = parsed.state;
    else if (parsed.reason === "newer-schema") this.#reason = "newer-schema";
    else if (parsed.reason === "invalid" && raw) this.#keepUnreadable(raw);
  }

  // --- Reading -------------------------------------------------------------------------------

  /** The current state. Treat it as read-only; change it through the methods below. */
  get state(): ProgressState {
    return this.#state;
  }

  /** False when progress lives in memory only (no storage, a failed write, a newer schema). */
  get persistent(): boolean {
    return this.#reason === null;
  }

  get memoryReason(): MemoryReason | null {
    return this.#reason;
  }

  getExercise(id: string): ExerciseProgress | undefined {
    return this.#state.lessons[lessonIdOf(id)]?.exercises[id];
  }

  getQuiz(section: string): QuizProgress | undefined {
    return this.#state.quizzes[section];
  }

  // --- Writing -------------------------------------------------------------------------------

  putExercise(id: string, record: ExerciseProgress): void {
    const lessonId = lessonIdOf(id);
    const lessons = this.#state.lessons;
    const lesson = lessons[lessonId] ?? { exercises: {} };
    const old = lesson.exercises[id];
    lessons[lessonId] = {
      ...lesson,
      exercises: { ...lesson.exercises, [id]: old ? mergeExerciseProgress(old, record) : record },
    };
    this.#touch();
  }

  putQuiz(section: string, record: QuizProgress): void {
    this.#state.quizzes[section] = mergeQuizProgress(this.#state.quizzes[section], record);
    this.#touch();
  }

  /** Record a visit to a lesson (the latest visit chooses "Continue" on the home page). */
  visit(lessonId: string): void {
    const lesson = this.#state.lessons[lessonId] ?? { exercises: {} };
    this.#state.lessons[lessonId] = { ...lesson, visitedAt: this.#now() };
    this.#touch();
  }

  /** The badge's earned date is kept once set (D-10, D-36). */
  markBadgeEarned(): void {
    if (this.#state.badge.earnedAt) return;
    this.#state.badge = { ...this.#state.badge, earnedAt: this.#now() };
    this.#touch();
  }

  /**
   * Merge an imported state (a progress code) into this one, or replace it when the learner
   * chose "replace". Writes immediately.
   */
  importState(imported: ProgressState, mode: "merge" | "replace" = "merge"): void {
    const now = this.#now();
    // A progress code carries neither preferences nor the badge name (progress-code.ts), so
    // both stay as they are here, whichever state is newer and in either mode.
    const keep = { prefs: this.#state.prefs, name: this.#state.badge.name };
    const next = mode === "replace" ? { ...imported } : { ...mergeProgressState(this.#state, imported) };
    this.#state = {
      ...next,
      prefs: keep.prefs,
      badge: { ...next.badge, name: keep.name },
      updatedAt: now,
    };
    if (mode === "replace") this.#write(this.#state);
    else this.flush();
    this.#emit();
  }

  // --- Persistence ---------------------------------------------------------------------------

  /** Merge with the stored JSON and write the result now. */
  flush(): void {
    if (this.#timer !== undefined) {
      this.#clearTimer(this.#timer);
      this.#timer = undefined;
    }
    if (!this.persistent || !this.#storage) return;
    const raw = readItem(this.#storage, PROGRESS_KEY);
    const parsed = parseProgress(raw);
    let merged = this.#state;
    if (parsed.ok) merged = mergeProgressState(parsed.state, this.#state);
    else if (parsed.reason === "newer-schema") return this.#toMemory("newer-schema");
    else if (parsed.reason === "invalid" && raw) this.#keepUnreadable(raw);
    if (!this.#write(merged)) return;
    if (JSON.stringify(merged) !== JSON.stringify(this.#state)) {
      this.#state = merged;
      this.#emit();
    }
  }

  /** A `storage` event: another page wrote PROGRESS_KEY. Merge it into memory. */
  receive(raw: string | null): void {
    const parsed = parseProgress(raw);
    if (!parsed.ok) return;
    const merged = mergeProgressState(parsed.state, this.#state);
    if (JSON.stringify(merged) === JSON.stringify(this.#state)) return;
    this.#state = merged;
    this.#emit();
  }

  /** Call `fn` after every change, local or from another page. Returns an unsubscribe. */
  subscribe(fn: (state: ProgressState) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Call `fn` when the store falls back to memory. */
  onPersistence(fn: (persistent: boolean, reason: MemoryReason | null) => void): () => void {
    this.#persistenceListeners.add(fn);
    return () => this.#persistenceListeners.delete(fn);
  }

  /** The full state as JSON, answers included ("Download progress (.json)"). */
  toJson(): string {
    return `${JSON.stringify(this.#state, null, 2)}\n`;
  }

  // --- Internals -----------------------------------------------------------------------------

  #touch(): void {
    this.#state.updatedAt = this.#now();
    this.#schedule();
    this.#emit();
  }

  #schedule(): void {
    if (!this.persistent || this.#timer !== undefined) return;
    this.#timer = this.#setTimer(() => {
      this.#timer = undefined;
      this.flush();
    }, this.#delay);
  }

  #write(state: ProgressState): boolean {
    if (writeItem(this.#storage, PROGRESS_KEY, JSON.stringify(state))) return true;
    this.#toMemory("write-failed");
    return false;
  }

  #toMemory(reason: MemoryReason): void {
    if (this.#reason) return;
    this.#reason = reason;
    for (const fn of this.#persistenceListeners) fn(false, reason);
  }

  /** Keep a copy of a value this version cannot read before it is overwritten (D-36). */
  #keepUnreadable(raw: string): void {
    if (readItem(this.#storage, UNREADABLE_KEY) === null) writeItem(this.#storage, UNREADABLE_KEY, raw);
  }

  #emit(): void {
    for (const fn of this.#listeners) fn(this.#state);
  }
}
