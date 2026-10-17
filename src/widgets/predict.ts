// gf-predict (docs/PLAN.md 7.6; ux 8.11): commit to a prediction, then see the answer. Number,
// text, choice and region items share one "Lock in my prediction"; each item gets a reveal
// row. A match records correct; anything else records revealed; both complete the exercise
// ("predictions are for thinking"). "Skip and show answer" is always available. The question
// is PredictQuestion (predict-question.ts), shared with follow-ups and quiz slots.
import type { PredictExercise } from "../exercises/types.ts";
import { ExerciseCard, resolveExercise, type ExerciseHost } from "./card.ts";
import { composeHooks, followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { PredictQuestion, predictHooks } from "./predict-question.ts";

export { matches } from "./predict-question.ts";

export class PredictElement extends HTMLElement {
  data?: PredictExercise;
  card?: ExerciseCard<PredictExercise>;

  connectedCallback(): void {
    if (this.card) return;
    const exercise = resolveExercise(this as ExerciseHost, "predict");
    if (!exercise) return;
    const domId = this.id || exercise.id.replaceAll("/", "--");
    let card: ExerciseCard<PredictExercise> | undefined;
    let followUps: FollowUpSet | undefined;
    const question = new PredictQuestion(
      this.ownerDocument,
      exercise,
      domId,
      () => card?.markAttempted(),
      () => card?.check(),
    );
    card = new ExerciseCard(
      this,
      exercise,
      composeHooks(predictHooks(question), () => followUps),
      {
        checkLabel: "Lock in my prediction",
      },
    );
    this.card = card;
    card.body.append(question.element);
    followUps = followUpsFor(card, exercise.followUps);
    card.ready();
  }
}

if (!customElements.get("gf-predict")) customElements.define("gf-predict", PredictElement);
