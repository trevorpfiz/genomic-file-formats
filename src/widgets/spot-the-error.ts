// gf-spot-the-error (docs/PLAN.md 7.1; ux 8.6): find the line or field that makes a snippet
// invalid, in one or more rounds. Hints after 2 checks, "Show answer" after 3 (REVEAL_POLICY).
// The question is SpotQuestion (spot-question.ts), shared with follow-ups and quiz single-pick
// slots (`singlePick`).
import type { SpotTheErrorExercise } from "../exercises/types.ts";
import { ExerciseCard, resolveExercise, type ExerciseHost } from "./card.ts";
import { composeHooks, followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { SpotQuestion, spotHooks } from "./spot-question.ts";

export class SpotTheErrorElement extends HTMLElement {
  data?: SpotTheErrorExercise;
  card?: ExerciseCard<SpotTheErrorExercise>;
  question?: SpotQuestion;

  connectedCallback(): void {
    if (this.card) return;
    const exercise = resolveExercise(this as ExerciseHost, "spot-the-error");
    if (!exercise) return;
    let card: ExerciseCard<SpotTheErrorExercise> | undefined;
    let followUps: FollowUpSet | undefined;
    const question = new SpotQuestion(
      this.ownerDocument,
      exercise,
      () => card?.markAttempted(),
      (text) => card?.announce(text),
    );
    this.question = question;
    const unit = exercise.rounds.every((r) => r.granularity === "field") ? "field" : "line";
    const howTo = exercise.singlePick
      ? `Select the ${unit} you think is wrong.`
      : `Select each ${unit} you think is wrong (arrow keys move, Space selects), then select Check.`;
    card = new ExerciseCard(
      this,
      exercise,
      composeHooks(
        spotHooks(question, () => card?.mode === "quiz"),
        () => followUps,
      ),
      {
        howTo: exercise.howTo ?? howTo,
      },
    );
    this.card = card;
    card.body.append(question.element);
    followUps = followUpsFor(card, exercise.followUps);
    card.ready();
  }
}

if (!customElements.get("gf-spot-the-error")) customElements.define("gf-spot-the-error", SpotTheErrorElement);
