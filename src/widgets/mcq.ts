// gf-mcq (docs/PLAN.md 7.7; ux 8.12): a multiple-choice question on the shared exercise card,
// with optional follow-ups. The question itself is McqQuestion (mcq-question.ts), which the
// field-explorer's embedded check, follow-ups and quiz slots share.
import type { McqExercise } from "../exercises/types.ts";
import { ExerciseCard, resolveExercise, type ExerciseHost } from "./card.ts";
import { composeHooks, followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { McqQuestion, mcqHooks } from "./mcq-question.ts";

export class McqElement extends HTMLElement {
  data?: McqExercise;
  card?: ExerciseCard<McqExercise>;

  connectedCallback(): void {
    if (this.card) return;
    const exercise = resolveExercise(this as ExerciseHost, "mcq");
    if (!exercise) return;
    const domId = this.id || exercise.id.replaceAll("/", "--");
    let card: ExerciseCard<McqExercise> | undefined;
    let followUps: FollowUpSet | undefined;
    const question = new McqQuestion(this.ownerDocument, exercise, `${domId}-options`, () =>
      card?.markAttempted(),
    );
    card = new ExerciseCard(
      this,
      exercise,
      composeHooks(
        mcqHooks(question, () => card?.mode === "quiz"),
        () => followUps,
      ),
    );
    this.card = card;
    card.body.append(question.element);
    followUps = followUpsFor(card, exercise.followUps);
    card.ready();
  }
}

if (!customElements.get("gf-mcq")) customElements.define("gf-mcq", McqElement);
