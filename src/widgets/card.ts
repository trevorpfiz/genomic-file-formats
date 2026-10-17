// The exercise card (docs/PLAN.md 7; ux-design.md 8.1-8.5): the chrome every exercise widget
// shares, its five-state model, the retry and reveal policy, focus and announcements, progress
// persistence and the `gf:solved` / `gf:statechange` events.
//
// A widget (a custom element) resolves its exercise, creates an ExerciseCard on itself with
// hooks (check, reveal, reset, restore, answer, lock), renders its own UI into `card.body`, and
// then calls `card.ready()`, which restores saved progress. The card owns everything else:
//
//   <gf-mcq id="fasta-reference--which-token" exercise="fasta-reference/which-token"
//           data-mode="quick-check" class="exercise-card" data-kind="mcq" data-state="idle"
//           role="group" aria-labelledby="which-token" aria-describedby="...-howto">
//     <div class="card-header">
//       <p class="card-overline">Quick check · Multiple choice</p>
//       <h3 class="quick-check-title" id="which-token">...</h3>      (compiled; moved here)
//       <p class="card-status" data-state="idle"><svg/> <span>Not started</span></p>
//     </div>
//     <p class="card-howto" id="...-howto">...</p>
//     <p class="card-prompt">...</p>
//     <div class="card-body">  widget UI  </div>
//     <div class="card-actions"> Check, Reset | Hint, Show answer </div>
//     <div class="card-confirm" hidden> Reset this exercise? ... </div>
//     <ol class="card-hints" hidden></ol>
//     <div class="card-feedback" data-tone="success|error|neutral" hidden>
//       <p class="card-verdict" id="...-verdict" tabindex="-1"><svg/> <strong>Correct.</strong> ...</p>
//       <div class="card-explanation"></div>
//     </div>
//     <p class="card-live visually-hidden" role="status"></p>
//   </gf-mcq>
//
// States (ux 8.2): idle -> attempted (input) -> correct | incorrect (Check); incorrect ->
// attempted (edit); any incomplete state -> revealed (Show answer, when the policy allows).
// correct and revealed lock the inputs and count toward completion; Reset returns the card to
// idle but the recorded result stays (the store's merge never reverts it).
//
// Focus (7, ux 8.5): Check and Show answer move focus to the verdict line, which is not a live
// region, so it is announced once. The polite live region is only for messages while focus
// stays put (hints, sort moves, fix-it validity, copy confirmations, reset).
import { getExercise } from "../exercises/registry.ts";
import type {
  Exercise,
  ExerciseOf,
  ExerciseState,
  Kind,
  SolvedDetail,
  StateChangeDetail,
} from "../exercises/types.ts";
import { icon, type IconName } from "../shell/icons.ts";
import { exerciseDomId } from "../shell/ids.ts";
import { isComplete, mergeExerciseProgress } from "../shell/progress-merge.ts";
import type { ExerciseProgress, ProgressStore, QuizProgress } from "../shell/progress-types.ts";
import { inlineNodes } from "./inline.ts";
import { mergeQuizProgress, type QuizProgressStore } from "./quiz-progress.ts";

// ---------------------------------------------------------------------------------------------
// Vocabulary and policy

/** The type label in "QUICK CHECK · <TYPE>" overlines (ux 8.1). */
export const TYPE_LABELS: Readonly<Record<Kind, string>> = {
  "spot-the-error": "Spot the error",
  "fix-it": "Fix it",
  sort: "Sort",
  "field-explorer": "Explore the fields",
  simulator: "Simulator",
  predict: "Predict",
  mcq: "Multiple choice",
};

/** Status label and icon per state; always shown together, never colour alone (7). */
export const STATUS_DISPLAY: Readonly<Record<ExerciseState, { label: string; icon: IconName }>> = {
  idle: { label: "Not started", icon: "circle" },
  attempted: { label: "In progress", icon: "circle-dot-dashed" },
  incorrect: { label: "Not yet", icon: "circle-x" },
  correct: { label: "Correct", icon: "circle-check" },
  revealed: { label: "Answer shown", icon: "eye" },
};

export interface RevealPolicy {
  /** Checks made before the Hint button appears (when the exercise has hints). */
  hintAfter: number;
  /** Checks made before the reveal button appears; 0 means always available. */
  revealAfter: number;
  revealLabel: string;
}

/** ux 8.4, docs/PLAN.md 7: "Show answer" after 2 incorrect attempts, 3 for spot-the-error. */
export const REVEAL_POLICY: Readonly<Record<Kind, RevealPolicy>> = {
  mcq: { hintAfter: 0, revealAfter: 2, revealLabel: "Show answer" },
  sort: { hintAfter: 0, revealAfter: 2, revealLabel: "Show answer" },
  "spot-the-error": { hintAfter: 2, revealAfter: 3, revealLabel: "Show answer" },
  "fix-it": { hintAfter: 0, revealAfter: 1, revealLabel: "Show solution" },
  simulator: { hintAfter: 0, revealAfter: 2, revealLabel: "Show me" },
  predict: { hintAfter: 0, revealAfter: 0, revealLabel: "Skip and show answer" },
  "field-explorer": { hintAfter: 0, revealAfter: 2, revealLabel: "Show answer" },
};

/** The how-to line under the title; an exercise's `howTo` overrides it. */
export const DEFAULT_HOW_TO: Readonly<Record<Kind, string>> = {
  "spot-the-error": "Select the line or field you think is wrong, then select Check.",
  "fix-it": "Edit the text until it is valid. Tab inserts a tab; press Esc, then Tab, to move on.",
  sort: "Place each item in a bin: drag it, or select it and choose a bin. Then select Check.",
  "field-explorer": "Hover over or focus each field to see what it means, then answer the question.",
  simulator: "Use the controls to reach each goal.",
  predict: "Commit to a prediction, then lock it in to see the answer.",
  mcq: "Choose an answer, then select Check.",
};

const MODE_LABELS: Readonly<Record<string, string>> = {
  "try-it": "Try it",
  "quick-check": "Quick check",
  optional: "Optional practice",
};

// ---------------------------------------------------------------------------------------------
// Progress store

/** The in-memory store cards (and the quiz page) use until the shell installs its persistent one. */
export class MemoryProgressStore implements ProgressStore, QuizProgressStore {
  readonly records = new Map<string, ExerciseProgress>();
  readonly quizzes = new Map<string, QuizProgress>();
  getExercise(id: string): ExerciseProgress | undefined {
    return this.records.get(id);
  }
  putExercise(id: string, record: ExerciseProgress): void {
    const old = this.records.get(id);
    this.records.set(id, old ? mergeExerciseProgress(old, record) : record);
  }
  getQuiz(section: string): QuizProgress | undefined {
    return this.quizzes.get(section);
  }
  putQuiz(section: string, record: QuizProgress): void {
    this.quizzes.set(section, mergeQuizProgress(this.quizzes.get(section), record));
  }
}

let progressStore: ProgressStore = new MemoryProgressStore();

/** The shell installs its store once at boot, before the first page renders. */
export function setProgressStore(store: ProgressStore): void {
  progressStore = store;
}

export const getProgressStore = (): ProgressStore => progressStore;

// ---------------------------------------------------------------------------------------------
// Resolving a widget's exercise

/** A widget element. The quiz page (and tests) may set `data` instead of an `exercise` attribute. */
export type ExerciseHost = HTMLElement & { data?: Exercise };

/**
 * The exercise for a widget: `host.data` when set, else the registry entry named by the
 * `exercise` attribute. A missing or mismatched id renders a visible error instead of throwing.
 */
export function resolveExercise<K extends Kind>(host: ExerciseHost, kind: K): ExerciseOf<K> | null {
  const id = host.getAttribute("exercise") ?? "";
  const exercise = host.data ?? getExercise(id);
  if (exercise?.kind === kind) return exercise as ExerciseOf<K>;
  const error = host.ownerDocument.createElement("p");
  error.className = "widget-error";
  error.setAttribute("role", "alert");
  error.textContent = exercise
    ? `Exercise "${exercise.id}" is a ${exercise.kind}, not a ${kind}.`
    : `Missing ${kind} exercise "${id}".`;
  host.replaceChildren(error);
  return null;
}

// ---------------------------------------------------------------------------------------------
// The card

export type CheckOutcome =
  /** Nothing to grade yet; the message says what to do ("Place all items first: ..."). */
  | { result: "incomplete"; message: string }
  /** `firstTry` overrides the card's own rule (a card with follow-ups counts their checks too). */
  | { result: "correct"; message?: string; explanation?: string | Node; firstTry?: boolean }
  | { result: "incorrect"; message?: string; explanation?: string | Node }
  /** Complete without credit: a predict whose prediction did not match. */
  | { result: "revealed"; message?: string; explanation?: string | Node }
  /**
   * The main answer is graded (`verdict`) but parts remain (follow-up questions): the check
   * counts, the main inputs lock and the state stays "attempted" until the widget calls
   * complete(). See hold().
   */
  | {
      result: "pending";
      verdict: "correct" | "revealed";
      message?: string;
      explanation?: string | Node;
    };

export interface Feedback {
  /** Follows the verdict word on the verdict line. Inline marks allowed (inline.ts). */
  message?: string;
  /** The explanation block under the verdict line. Strings use inline marks. */
  explanation?: string | Node;
}

/** What a widget plugs into its card. Every hook is optional. */
export interface CardHooks {
  /** Grade the current answer (Check, Ctrl+Enter, or Submit quiz). */
  check?(): CheckOutcome;
  /** Show the full answer in the body. Without this hook the card offers no reveal button. */
  reveal?(): Feedback | void;
  /** Return the body to its initial, unlocked state. */
  reset?(): void;
  /** Restore a saved answer and its visuals after a reload (ready()). */
  restore?(record: ExerciseProgress): void;
  /** The current answer, JSON-serializable, saved with progress. */
  answer?(): unknown;
  /** Lock (or unlock) the widget's inputs. */
  lock?(locked: boolean): void;
  /** Quiz mode: whether the learner has answered (unanswered cards count as incorrect). */
  hasAnswer?(): boolean;
  /** Where focus goes after Reset; defaults to the first focusable control in the body. */
  focusFirst?(): void;
}

export interface CardOptions {
  /** "lesson" (default) or "quiz": quiz cards have no actions, status, store or events. */
  mode?: "lesson" | "quiz";
  /** Overrides the overline ("Question 3 of 6" on quiz pages). */
  overline?: string;
  /** Overrides the how-to line. */
  howTo?: string;
  /** The primary button's label: "Check" or "Lock in my prediction". */
  checkLabel?: string;
  /** False for cards that complete on their own (simulators, field-explorers). */
  showCheck?: boolean;
  showReset?: boolean;
  /** Overrides the policy's reveal label. */
  revealLabel?: string;
  /** Defaults to the store installed with setProgressStore. */
  store?: ProgressStore;
  /** Clock, for tests. */
  now?: () => string;
  /**
   * An embedded question (a follow-up inside another card): no status pill, no store, no
   * events; the parent hears state changes through `onStateChange` and restores it with
   * restore(). Ctrl+Enter checks this card only.
   */
  embedded?: boolean;
  /** Called on every state change (embedded cards report to their parent this way). */
  onStateChange?: (state: ExerciseState) => void;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]';

export class ExerciseCard<E extends Exercise = Exercise> {
  readonly host: HTMLElement;
  readonly exercise: E;
  readonly domId: string;
  readonly mode: "lesson" | "quiz";
  /** The widget renders its UI here. */
  readonly body: HTMLDivElement;
  /** After the feedback panel: follow-up questions render here (empty otherwise). */
  readonly after: HTMLDivElement;
  readonly embedded: boolean;

  #hooks: CardHooks;
  #store: ProgressStore;
  #now: () => string;
  #policy: RevealPolicy;
  #state: ExerciseState = "idle";
  #attempts = 0;
  #firstTry = false;
  #revealed = false;
  #solvedAt: string | undefined;
  #solvedFired = false;
  #locked = false;
  #hintsShown = 0;
  #restoring = false;
  #onStateChange: ((state: ExerciseState) => void) | undefined;

  #status: HTMLParagraphElement;
  #actions: HTMLDivElement;
  #checkButton: HTMLButtonElement;
  #resetButton: HTMLButtonElement;
  #hintButton: HTMLButtonElement;
  #revealButton: HTMLButtonElement;
  #confirm: HTMLDivElement;
  #hints: HTMLOListElement;
  #feedback: HTMLDivElement;
  #verdict: HTMLParagraphElement;
  #explanation: HTMLDivElement;
  #live: HTMLParagraphElement;

  constructor(host: HTMLElement, exercise: E, hooks: CardHooks = {}, options: CardOptions = {}) {
    this.host = host;
    this.exercise = exercise;
    this.#hooks = hooks;
    this.mode = options.mode ?? (host.dataset.mode === "quiz" ? "quiz" : "lesson");
    this.#store = options.store ?? progressStore;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#policy = REVEAL_POLICY[exercise.kind];
    this.embedded = options.embedded === true;
    this.#onStateChange = options.onStateChange;
    this.domId = host.id || exerciseDomId(exercise.id);
    host.id = this.domId;

    const doc = host.ownerDocument;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
      const node = doc.createElement(tag);
      node.className = className;
      return node;
    };
    const mode = host.dataset.mode ?? "quick-check";

    // Header: overline, title (the compiled H3 or optional title, or one made here), status.
    const header = el("div", "card-header");
    const overline = el("p", "card-overline");
    overline.id = `${this.domId}-overline`;
    overline.textContent =
      options.overline ??
      host.dataset.overline ??
      `${MODE_LABELS[mode] ?? "Quick check"} · ${TYPE_LABELS[exercise.kind]}`;
    header.append(overline);
    let title = host.querySelector<HTMLElement>(":scope > .quick-check-title, :scope > .exercise-title");
    if (!title && !host.dataset.labelledby && exercise.title) {
      title = el("p", "exercise-title");
      title.textContent = exercise.title;
    }
    if (title) {
      title.id ||= `${this.domId}-title`;
      header.append(title);
    }
    this.#status = el("p", "card-status");
    if (this.mode === "lesson" && !this.embedded) header.append(this.#status);

    const howTo = el("p", "card-howto");
    howTo.id = `${this.domId}-howto`;
    howTo.textContent = options.howTo ?? exercise.howTo ?? DEFAULT_HOW_TO[exercise.kind];
    const prompt = el("p", "card-prompt");
    if (exercise.prompt) prompt.append(inlineNodes(exercise.prompt, doc));
    this.body = el("div", "card-body");

    // Actions.
    this.#actions = el("div", "card-actions");
    const primary = el("div", "card-actions-primary");
    const secondary = el("div", "card-actions-secondary");
    this.#checkButton = this.#button(options.checkLabel ?? "Check", "button-primary", () => this.check());
    this.#resetButton = this.#button("Reset", "button-secondary", () => this.reset(), "rotate-ccw");
    this.#hintButton = this.#button("Hint", "button-text", () => this.showHint());
    this.#revealButton = this.#button(options.revealLabel ?? this.#policy.revealLabel, "button-text", () =>
      this.reveal(),
    );
    if (options.showCheck !== false) primary.append(this.#checkButton);
    if (options.showReset ?? !this.embedded) primary.append(this.#resetButton);
    secondary.append(this.#hintButton, this.#revealButton);
    this.#actions.append(primary, secondary);

    this.#confirm = el("div", "card-confirm");
    this.#confirm.hidden = true;
    const question = el("p", "card-confirm-text");
    question.textContent = "Reset this exercise? Your result stays recorded.";
    const confirmReset = this.#button("Reset", "button-secondary", () => this.#doReset());
    const cancel = this.#button("Cancel", "button-text", () => {
      this.#confirm.hidden = true;
      this.#resetButton.focus();
    });
    this.#confirm.append(question, confirmReset, cancel);

    this.#hints = el("ol", "card-hints");
    this.#hints.hidden = true;
    this.#hints.setAttribute("aria-label", "Hints");

    this.#feedback = el("div", "card-feedback");
    this.#feedback.hidden = true;
    this.#verdict = el("p", "card-verdict");
    this.#verdict.id = `${this.domId}-verdict`;
    this.#verdict.tabIndex = -1;
    this.#explanation = el("div", "card-explanation");
    this.#feedback.append(this.#verdict, this.#explanation);

    this.#live = el("p", "card-live visually-hidden");
    this.#live.setAttribute("role", "status");
    this.after = el("div", "card-after");

    const parts: Node[] = [header, howTo];
    if (exercise.prompt) parts.push(prompt);
    parts.push(this.body);
    if (this.mode === "lesson") parts.push(this.#actions, this.#confirm, this.#hints);
    parts.push(this.#feedback, this.after, this.#live);
    host.replaceChildren(...parts);

    host.classList.add("exercise-card");
    host.dataset.kind = exercise.kind;
    host.setAttribute("role", "group");
    const labelledBy = host.dataset.labelledby ?? title?.id ?? overline.id;
    host.setAttribute("aria-labelledby", labelledBy);
    host.setAttribute("aria-describedby", howTo.id);
    if (this.mode === "lesson") {
      host.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && options.showCheck !== false) {
          event.preventDefault();
          if (this.embedded) event.stopPropagation();
          this.check();
        }
      });
    }
    this.#render();
  }

  // --- State --------------------------------------------------------------------------------

  get state(): ExerciseState {
    return this.#state;
  }
  get attempts(): number {
    return this.#attempts;
  }
  get firstTry(): boolean {
    return this.#firstTry;
  }
  get revealed(): boolean {
    return this.#revealed;
  }
  get locked(): boolean {
    return this.#locked;
  }
  /** True once the card is correct or revealed (it counts toward completion). */
  get done(): boolean {
    return isComplete(this.#state);
  }

  /** Call once the widget has rendered its body: restores saved progress (lesson mode). */
  ready(): void {
    if (this.mode !== "lesson" || this.embedded) return;
    const record = this.#store.getExercise(this.exercise.id);
    if (record) this.restore(record);
  }

  /**
   * Restore a saved record: counters, the widget's answer (hooks.restore) and, for a complete
   * record, the locked state and its verdict. Nothing is written back and no gf:solved fires.
   * ready() calls it with the stored record; a parent calls it for its embedded cards, and the
   * quiz page for an attempt in progress (quiz mode restores the answer only).
   */
  restore(record: ExerciseProgress): void {
    this.#restoring = true;
    try {
      if (this.mode === "quiz") {
        this.#hooks.restore?.(record);
        return;
      }
      this.#attempts = record.attempts;
      this.#firstTry = record.firstTry;
      this.#revealed = record.revealed;
      this.#solvedAt = record.solvedAt;
      this.#hooks.restore?.(record);
      if (isComplete(record.state)) {
        this.#solvedFired = true;
        this.#setLocked(true);
        this.#showFeedback(
          record.state === "correct" ? "success" : "neutral",
          record.state === "correct" ? "correct" : "revealed",
          {},
        );
      }
      this.#setState(record.state, { persist: false });
    } finally {
      this.#restoring = false;
    }
  }

  /** The learner changed the answer: idle or incorrect becomes attempted. */
  markAttempted(): void {
    if (this.#locked || this.done || this.mode === "quiz") return;
    if (this.#state === "idle" || this.#state === "incorrect") {
      this.#setState("attempted");
    }
  }

  /** Check (lesson mode). Moves focus to the verdict line. */
  check(): void {
    if (this.mode !== "lesson" || this.#locked || this.done) return;
    const outcome = this.#hooks.check?.() ?? { result: "incomplete", message: "" };
    if (outcome.result === "incomplete") {
      if (this.#state === "idle") this.#setState("attempted");
      this.#showFeedback("neutral", "incomplete", { message: outcome.message });
      this.#verdict.focus();
      return;
    }
    if (outcome.result === "incorrect") {
      this.#attempts += 1;
      this.#setState("incorrect");
      this.#showFeedback("error", "incorrect", outcome);
      this.#verdict.focus();
      return;
    }
    if (outcome.result === "pending") {
      this.#attempts += 1;
      this.hold(outcome.verdict, outcome);
      return;
    }
    this.complete(outcome.result, outcome, {
      attempt: true,
      firstTry: outcome.result === "correct" ? outcome.firstTry : undefined,
    });
  }

  /**
   * The main answer is graded but the card is not complete yet (follow-ups remain): lock the
   * inputs, show the verdict and keep the state "attempted". Check calls it for a "pending"
   * outcome; a widget calls it from its restore hook (focus false) to redraw that state.
   */
  hold(verdict: "correct" | "revealed", feedback: Feedback = {}, options: { focus?: boolean } = {}): void {
    if (this.done) return;
    this.#setLocked(true);
    this.#setState("attempted");
    this.#showFeedback(verdict === "correct" ? "success" : "neutral", verdict, feedback);
    if (options.focus !== false && !this.#restoring) this.#verdict.focus();
  }

  /**
   * Complete the exercise without a Check: a simulator reaching its goals, a field-explorer
   * finished, a predict locked in. `attempt` counts one check (a predict lock does).
   */
  complete(
    state: "correct" | "revealed",
    feedback: Feedback = {},
    options: { attempt?: boolean; focus?: boolean; firstTry?: boolean } = {},
  ): void {
    if (this.done) return;
    if (options.attempt) this.#attempts += 1;
    else this.#attempts = Math.max(this.#attempts, 1);
    if (state === "correct") this.#firstTry = options.firstTry ?? (this.#attempts === 1 && !this.#revealed);
    else this.#revealed = true;
    this.#solvedAt ??= this.#now();
    this.#setLocked(true);
    this.#setState(state);
    if (this.mode === "lesson") {
      this.#showFeedback(state === "correct" ? "success" : "neutral", state, feedback);
      if (options.focus !== false) this.#verdict.focus();
      this.#fireSolved();
    }
  }

  /** Show the answer (when the policy allows). Moves focus to the verdict line. */
  reveal(): void {
    if (this.mode !== "lesson" || this.done || !this.#hooks.reveal) return;
    const feedback = this.#hooks.reveal() ?? {};
    this.#revealed = true;
    this.#solvedAt ??= this.#now();
    this.#setLocked(true);
    this.#setState("revealed");
    this.#showFeedback("neutral", "revealed", feedback);
    this.#verdict.focus();
    this.#fireSolved();
  }

  /** Reset to idle. After a completed state it asks first; the recorded result stays. */
  reset(): void {
    if (this.mode !== "lesson") return;
    if (this.done && this.#confirm.hidden) {
      this.#confirm.hidden = false;
      this.#confirm.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }
    this.#doReset();
  }

  /**
   * Back to a fresh idle card at once, with no question, announcement or focus move: the
   * parent's Reset clears its embedded cards this way. Counters restart too, because an
   * embedded card's record lives inside its parent's answer.
   */
  clear(): void {
    this.#confirm.hidden = true;
    this.#hooks.reset?.();
    this.#setLocked(false);
    this.#feedback.hidden = true;
    this.#attempts = 0;
    this.#firstTry = false;
    this.#revealed = false;
    this.#solvedAt = undefined;
    this.#solvedFired = false;
    this.#setState("idle");
  }

  #doReset(): void {
    this.#confirm.hidden = true;
    this.#hooks.reset?.();
    this.#setLocked(false);
    this.#feedback.hidden = true;
    this.#setState("idle");
    this.announce("Exercise reset.");
    if (this.#hooks.focusFirst) this.#hooks.focusFirst();
    else this.body.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }

  /** Reveal the next hint of the ladder; focus stays on the button, so it is announced. */
  showHint(): void {
    const hints = this.exercise.hints ?? [];
    const next = hints[this.#hintsShown];
    if (next === undefined) return;
    this.#hintsShown += 1;
    const item = this.host.ownerDocument.createElement("li");
    item.append(inlineNodes(`**Hint ${this.#hintsShown}.** ${next}`, this.host.ownerDocument));
    this.#hints.append(item);
    this.#hints.hidden = false;
    this.announce(`Hint ${this.#hintsShown}: ${item.textContent?.replace(/^Hint \d+\. /, "") ?? ""}`);
    this.#render();
  }

  /** A polite announcement, for changes while focus stays put. */
  announce(text: string): void {
    this.#live.textContent = "";
    this.#live.textContent = text;
  }

  /** The widget's current answer (hooks.answer), for the quiz page's saved attempt. */
  answer(): unknown {
    return this.#hooks.answer?.();
  }

  /** Quiz mode: whether the learner answered. */
  hasAnswer(): boolean {
    return this.#hooks.hasAnswer?.() ?? this.#state !== "idle";
  }

  /**
   * Quiz mode: grade once, show the verdict and the full explanations, lock. No events, no
   * store, no focus move (the quiz page moves focus to its results heading). Returns credit.
   */
  submit(): boolean {
    const outcome = this.#hooks.check?.() ?? { result: "incomplete", message: "" };
    const correct = outcome.result === "correct";
    this.#attempts += 1;
    this.#setLocked(true);
    this.#setState(correct ? "correct" : "incorrect");
    const shown = this.#hooks.reveal?.() ?? {};
    const explanation = (outcome.result !== "incomplete" && outcome.explanation) || shown.explanation;
    const message =
      outcome.result === "incomplete" ? "Not answered." : (outcome.message ?? shown.message ?? undefined);
    this.#showFeedback(correct ? "success" : "error", correct ? "correct" : "incorrect", {
      message,
      explanation,
    });
    return correct;
  }

  // --- Rendering ------------------------------------------------------------------------------

  #button(label: string, className: string, onClick: () => void, iconName?: IconName): HTMLButtonElement {
    const button = this.host.ownerDocument.createElement("button");
    button.type = "button";
    button.className = className;
    if (iconName) button.innerHTML = icon(iconName);
    button.append(label);
    button.addEventListener("click", onClick);
    return button;
  }

  #setLocked(locked: boolean): void {
    this.#locked = locked;
    this.#hooks.lock?.(locked);
  }

  #setState(state: ExerciseState, options: { persist?: boolean } = {}): void {
    this.#state = state;
    this.#render();
    if (!this.#restoring) this.#onStateChange?.(state);
    if (this.mode !== "lesson" || this.embedded) return;
    if (options.persist !== false && !this.#restoring) this.#persist();
    this.host.dispatchEvent(
      new CustomEvent<StateChangeDetail>("gf:statechange", {
        bubbles: true,
        detail: { id: this.exercise.id, state, attempts: this.#attempts },
      }),
    );
  }

  #persist(): void {
    const record: ExerciseProgress = {
      state: this.#state,
      attempts: this.#attempts,
      firstTry: this.#firstTry,
      revealed: this.#revealed,
      updatedAt: this.#now(),
    };
    const answer = this.#hooks.answer?.();
    if (answer !== undefined) record.answer = answer;
    if (this.#solvedAt) record.solvedAt = this.#solvedAt;
    this.#store.putExercise(this.exercise.id, record);
  }

  #fireSolved(): void {
    if (this.#solvedFired) return;
    this.#solvedFired = true;
    if (this.embedded) return;
    const state = this.#state === "correct" ? "correct" : "revealed";
    this.host.dispatchEvent(
      new CustomEvent<SolvedDetail>("gf:solved", {
        bubbles: true,
        detail: {
          id: this.exercise.id,
          state,
          attempts: this.#attempts,
          firstTry: this.#firstTry,
          revealed: this.#revealed,
        },
      }),
    );
  }

  #showFeedback(
    tone: "success" | "error" | "neutral",
    kind: "correct" | "incorrect" | "revealed" | "incomplete",
    feedback: Feedback,
  ): void {
    const doc = this.host.ownerDocument;
    const verdicts = {
      correct: { word: "Correct.", icon: "circle-check" },
      incorrect: { word: "Not quite.", icon: "circle-x" },
      revealed: { word: "Answer shown.", icon: "eye" },
      incomplete: { word: "", icon: "info" },
    } as const;
    const { word, icon: iconName } = verdicts[kind];
    this.#feedback.hidden = false;
    this.#feedback.dataset.tone = tone;
    this.#verdict.innerHTML = icon(iconName);
    if (word) {
      const strong = doc.createElement("strong");
      strong.textContent = word;
      this.#verdict.append(" ", strong);
    }
    if (feedback.message) this.#verdict.append(" ", inlineNodes(feedback.message, doc));
    this.#explanation.replaceChildren();
    const explanation = feedback.explanation;
    if (typeof explanation === "string") {
      const p = doc.createElement("p");
      p.append(inlineNodes(explanation, doc));
      this.#explanation.append(p);
    } else if (explanation) {
      this.#explanation.append(explanation);
    }
  }

  #render(): void {
    const state = this.#state;
    this.host.dataset.state = state;
    const display = STATUS_DISPLAY[state];
    this.#status.dataset.state = state;
    this.#status.innerHTML = `${icon(display.icon)} `;
    const text = this.host.ownerDocument.createElement("span");
    text.className = "card-status-text";
    text.textContent = display.label;
    this.#status.append(text);

    const complete = this.done;
    this.#checkButton.disabled = complete || this.#locked;
    this.#checkButton.hidden = complete;
    const hints = this.exercise.hints ?? [];
    this.#hintButton.hidden =
      complete || this.#hintsShown >= hints.length || this.#attempts < this.#policy.hintAfter;
    this.#revealButton.hidden = complete || !this.#hooks.reveal || this.#attempts < this.#policy.revealAfter;
  }
}
