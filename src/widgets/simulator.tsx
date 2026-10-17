// gf-simulator: the host custom element that mounts a simulator's Preact island (D-21) inside
// an exercise card. Light DOM, so the theme tokens and prose styles apply.
//
// The card has no Check button: the host completes it when every goal has been reached
// (docs/PLAN.md 7.5; ux 8.4), and, when the exercise has follow-ups (L06.2's predicts), once
// they are answered too. Views report goals through `onGoal` and may use `card` to announce
// readouts. A goal the learner had shown ("Show me") still counts as reached, but the card then
// ends as "Answer shown" rather than Correct. Reset remounts the island, so the view starts
// again from `init`. Measured in M0: Preact 10.29.8 with hooks and jsx-runtime adds 13,164
// bytes raw (about 5.3 KB gzip) to dist/index.html.
import { render, type FunctionComponent } from "preact";
import type { SimulatorExercise, SimulatorId } from "../exercises/types.ts";
import { ExerciseCard, resolveExercise, type ExerciseHost } from "./card.ts";
import { followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { BgzfDemoView } from "./simulators/bgzf-demo/view.tsx";
import { RulerView } from "./simulators/coordinate-ruler/view.tsx";
import { FaiCalculatorView } from "./simulators/fai-calculator/view.tsx";
import { PhredConverterView } from "./simulators/phred-converter/view.tsx";
import type { GoalOutcome, SimulatorViewProps } from "./simulators/types.ts";

/** Views by simulator id. A simulator's owner replaces its stub view and keeps this entry. */
export const VIEWS: Partial<Record<SimulatorId, FunctionComponent<SimulatorViewProps>>> = {
  "coordinate-ruler": RulerView,
  "fai-calculator": FaiCalculatorView,
  "bgzf-demo": BgzfDemoView,
  "phred-converter": PhredConverterView,
};

export class SimulatorElement extends HTMLElement {
  data?: SimulatorExercise;
  card?: ExerciseCard<SimulatorExercise>;
  followUps?: FollowUpSet;
  #mount: HTMLDivElement | null = null;
  #reached = new Set<string>();
  #shown = new Set<string>();

  connectedCallback(): void {
    if (!this.card) {
      const exercise = resolveExercise(this as ExerciseHost, "simulator");
      if (!exercise) return;
      this.card = new ExerciseCard(
        this,
        exercise,
        {
          reset: () => {
            this.#unmount();
            this.#reached.clear();
            this.#shown.clear();
            this.followUps?.reset();
            this.#mountIsland();
          },
          answer: () => (this.followUps ? { followUps: this.followUps.answer() } : undefined),
          restore: (record) => {
            const saved = record.answer as { followUps?: unknown } | undefined;
            if (saved?.followUps) this.followUps?.restore(saved.followUps);
          },
        },
        { showCheck: false },
      );
      if (!VIEWS[exercise.simulator]) {
        const note = this.ownerDocument.createElement("p");
        note.className = "widget-stub";
        note.setAttribute("role", "note");
        note.textContent = `The ${exercise.simulator} simulator is not built yet.`;
        this.card.body.append(note);
      }
      this.#mountIsland();
      this.followUps = followUpsFor(this.card, exercise.followUps);
      this.card.ready();
      return;
    }
    this.#mountIsland(); // reconnected after a move
  }

  #mountIsland(): void {
    const card = this.card;
    const View = card ? VIEWS[card.exercise.simulator] : undefined;
    if (!card || !View || this.#mount) return;
    const exercise = card.exercise;
    this.#mount = this.ownerDocument.createElement("div");
    this.#mount.className = "island";
    card.body.append(this.#mount);
    const onGoal = (goal: string, outcome?: GoalOutcome) => this.#goal(exercise, goal, outcome);
    render(<View exercise={exercise} card={card} onGoal={onGoal} />, this.#mount);
  }

  disconnectedCallback(): void {
    this.#unmount();
  }

  #unmount(): void {
    if (!this.#mount) return;
    render(null, this.#mount);
    this.#mount.remove();
    this.#mount = null;
  }

  #goal(exercise: SimulatorExercise, goal: string, outcome: GoalOutcome = "reached"): void {
    const card = this.card;
    if (!card || card.done || !exercise.goals.some((g) => g.id === goal)) return;
    if (this.#reached.has(goal)) return;
    this.#reached.add(goal);
    if (outcome === "shown") this.#shown.add(goal);
    if (this.#reached.size === 1 && card.state === "idle") card.markAttempted();
    if (!exercise.goals.every((g) => this.#reached.has(g.id))) return;
    const result = this.#shown.size ? "revealed" : "correct";
    if (this.followUps) {
      this.followUps.setMain(result, result === "correct");
      if (!card.done) card.announce("Every goal reached. Now answer the follow-up questions below.");
      return;
    }
    card.complete(
      result,
      { message: result === "correct" ? "Every goal reached." : "Every goal reached; some were shown." },
      { focus: false },
    );
  }
}

if (!customElements.get("gf-simulator")) customElements.define("gf-simulator", SimulatorElement);
