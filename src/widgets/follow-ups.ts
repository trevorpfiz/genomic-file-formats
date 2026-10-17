// Follow-up questions (docs/PLAN.md 7, `followUps`): predict, mcq or spot-the-error questions
// inside another exercise's card, sharing its status and its progress record ("one card, one
// status"). Each follow-up is an embedded card after the parent's feedback panel, with its own
// button, verdict line (focus moves there on its check) and reveal policy, but no status pill,
// store or events. The parent completes when its main part and every follow-up are done:
// correct only when all of them are correct, otherwise "Answer shown" (a predict that did not
// match counts as shown, as it does on its own).
//
// Widgets wire it with composeHooks(): the main check returns "pending" while follow-ups remain,
// and the parent's answer becomes `{ value, followUps }` so a reload restores every part.
import type { Exercise, FollowUp } from "../exercises/types.ts";
import type { ExerciseProgress } from "../shell/progress-types.ts";
import { ExerciseCard, TYPE_LABELS, type CardHooks, type CheckOutcome } from "./card.ts";
import { el } from "./dom.ts";
import { McqQuestion, mcqHooks } from "./mcq-question.ts";
import { PredictQuestion, predictHooks } from "./predict-question.ts";
import { SpotQuestion, spotHooks } from "./spot-question.ts";

type MainResult = "correct" | "revealed";

export interface FollowUpsSaved {
  main: MainResult | null;
  mainFirstTry: boolean;
  items: Record<string, ExerciseProgress>;
}

interface Item {
  followUp: FollowUp;
  card: ExerciseCard;
  answer: () => unknown;
}

const isComplete = (state: string) => state === "correct" || state === "revealed";

export class FollowUpSet {
  readonly element: HTMLElement;
  readonly parent: ExerciseCard;
  #items: Item[];
  #main: MainResult | null = null;
  #mainFirstTry = false;
  #quiet = false;

  #standalone: boolean;

  /**
   * `standalone`: the card has no main question of its own (a field-explorer with follow-ups
   * only), so it completes when the follow-ups do.
   */
  constructor(parent: ExerciseCard, followUps: readonly FollowUp[], options: { standalone?: boolean } = {}) {
    this.parent = parent;
    this.#standalone = options.standalone === true;
    if (this.#standalone) {
      this.#main = "correct";
      this.#mainFirstTry = true;
    }
    const doc = parent.host.ownerDocument;
    const section = el(doc, "section", "follow-ups");
    section.setAttribute("aria-label", followUps.length === 1 ? "Follow-up question" : "Follow-up questions");
    this.#items = followUps.map((followUp, i) => {
      const host = el(doc, "div", "follow-up");
      host.id = `${parent.domId}--${followUp.id}`;
      section.append(host);
      const overline = `Follow-up${followUps.length > 1 ? ` ${i + 1} of ${followUps.length}` : ""} · ${TYPE_LABELS[followUp.kind]}`;
      const exercise = { ...followUp, title: followUp.title ?? "" } as unknown as Exercise;
      let hooks: CardHooks;
      let body: HTMLElement;
      let card: ExerciseCard | undefined;
      const onInput = () => card?.markAttempted();
      if (followUp.kind === "mcq") {
        const q = new McqQuestion(doc, followUp, `${host.id}-options`, onInput);
        hooks = mcqHooks(q);
        body = q.element;
      } else if (followUp.kind === "predict") {
        const q = new PredictQuestion(doc, followUp, host.id, onInput, () => card?.check());
        hooks = predictHooks(q);
        body = q.element;
      } else {
        const q = new SpotQuestion(doc, followUp, onInput, (text) => card?.announce(text));
        hooks = spotHooks(q);
        body = q.element;
      }
      card = new ExerciseCard(host, exercise, hooks, {
        embedded: true,
        overline,
        checkLabel: followUp.kind === "predict" ? "Lock in my prediction" : "Check",
        onStateChange: () => this.#changed(),
      });
      card.body.append(body);
      return { followUp, card, answer: () => hooks.answer?.() };
    });
    parent.after.append(section);
    this.element = section;
  }

  get cards(): ExerciseCard[] {
    return this.#items.map((i) => i.card);
  }

  /** Every follow-up is correct or revealed. */
  get done(): boolean {
    return this.#items.every((i) => i.card.done);
  }

  get allCorrect(): boolean {
    return this.#items.every((i) => i.card.state === "correct");
  }

  get firstTry(): boolean {
    return this.#items.every((i) => i.card.firstTry);
  }

  get main(): MainResult | null {
    return this.#main;
  }

  /**
   * Wrap the main check's outcome: record the main result, and hold the card ("pending") while
   * follow-ups remain. Call before the card counts the attempt.
   */
  settle(outcome: CheckOutcome): CheckOutcome {
    if (outcome.result !== "correct" && outcome.result !== "revealed") return outcome;
    this.#main = outcome.result;
    this.#mainFirstTry = outcome.result === "correct" && this.parent.attempts === 0 && !this.parent.revealed;
    const lead = outcome.message ? `${outcome.message} ` : "";
    if (!this.done) {
      return {
        result: "pending",
        verdict: outcome.result,
        message: `${lead}Now answer the follow-up ${this.#items.length === 1 ? "question" : "questions"} below.`,
        explanation: outcome.explanation,
      };
    }
    const state = this.#finalState();
    return state === "correct"
      ? { ...outcome, result: "correct", firstTry: this.#mainFirstTry && this.firstTry }
      : {
          result: "revealed",
          message: `${lead}A follow-up answer was shown.`,
          explanation: outcome.explanation,
        };
  }

  /** For cards without a main check (simulator goals, explorers with follow-ups only). */
  setMain(result: MainResult, firstTry: boolean): void {
    this.#main = result;
    this.#mainFirstTry = firstTry;
    this.#maybeComplete();
  }

  #finalState(): MainResult {
    return this.#main === "correct" && this.allCorrect ? "correct" : "revealed";
  }

  #changed(): void {
    if (this.#quiet) return;
    if (this.parent.state === "idle") this.parent.markAttempted();
    this.#maybeComplete();
  }

  #maybeComplete(): void {
    if (!this.#main || !this.done || this.parent.done) return;
    const state = this.#finalState();
    this.parent.complete(
      state,
      {
        message:
          state === "correct"
            ? "You answered every part."
            : "Every part is answered; some answers were shown.",
      },
      { focus: false, firstTry: this.#mainFirstTry && this.firstTry },
    );
    this.parent.announce(
      state === "correct" ? "Exercise complete: correct." : "Exercise complete: answer shown.",
    );
  }

  /** Show every follow-up's answer (the parent's Show answer). */
  revealAll(): void {
    this.#quiet = true;
    try {
      for (const { card } of this.#items) if (!card.done) card.reveal();
    } finally {
      this.#quiet = false;
    }
  }

  answer(): FollowUpsSaved {
    const items: Record<string, ExerciseProgress> = {};
    for (const { followUp, card, answer } of this.#items) {
      const value = answer();
      items[followUp.id] = {
        state: card.state,
        attempts: card.attempts,
        firstTry: card.firstTry,
        revealed: card.revealed,
        ...(value === undefined ? {} : { answer: value }),
      };
    }
    return { main: this.#main, mainFirstTry: this.#mainFirstTry, items };
  }

  /** Restore saved follow-ups (from the parent's restore hook) and redraw a held main part. */
  restore(saved: unknown): void {
    if (!saved || typeof saved !== "object") return;
    const s = saved as Partial<FollowUpsSaved>;
    this.#quiet = true;
    try {
      for (const { followUp, card } of this.#items) {
        const record = s.items?.[followUp.id];
        if (record && typeof record.state === "string") card.restore(record);
      }
    } finally {
      this.#quiet = false;
    }
    if (this.#standalone) return;
    this.#main = s.main === "correct" || s.main === "revealed" ? s.main : null;
    this.#mainFirstTry = s.mainFirstTry === true;
  }

  reset(): void {
    this.#quiet = true;
    try {
      for (const { card } of this.#items) card.clear();
    } finally {
      this.#quiet = false;
    }
    if (this.#standalone) return;
    this.#main = null;
    this.#mainFirstTry = false;
  }
}

const wrapped = (answer: unknown): answer is { value: unknown; followUps: unknown } =>
  typeof answer === "object" && answer !== null && "followUps" in answer && "value" in answer;

/**
 * Card hooks for a main question plus optional follow-ups (lesson mode only). The follow-up
 * set is created after the card (it needs it), so it is passed as a getter.
 */
export function composeHooks(base: CardHooks, followUps: () => FollowUpSet | undefined): CardHooks {
  return {
    ...base,
    check: () => {
      const outcome = base.check?.() ?? { result: "incomplete", message: "" };
      const set = followUps();
      return set ? set.settle(outcome) : outcome;
    },
    reveal: base.reveal
      ? () => {
          const feedback = base.reveal!();
          followUps()?.revealAll();
          return feedback;
        }
      : undefined,
    reset: () => {
      base.reset?.();
      followUps()?.reset();
    },
    restore: (record) => {
      const set = followUps();
      if (set && wrapped(record.answer)) {
        base.restore?.({ ...record, answer: record.answer.value });
        set.restore(record.answer.followUps);
        if (!isComplete(record.state) && set.main) {
          set.parent.hold(
            set.main,
            { message: "Now answer the follow-up questions below." },
            { focus: false },
          );
        }
      } else {
        base.restore?.(record);
      }
    },
    answer: () => {
      const value = base.answer?.();
      const set = followUps();
      return set ? { value, followUps: set.answer() } : value;
    },
  };
}

/** Create the follow-up set for a lesson-mode card that has follow-ups. */
export function followUpsFor(
  card: ExerciseCard,
  list: readonly FollowUp[] | undefined,
  options: { standalone?: boolean } = {},
): FollowUpSet | undefined {
  if (card.mode !== "lesson" || card.embedded || !list?.length) return undefined;
  return new FollowUpSet(card, list, options);
}
