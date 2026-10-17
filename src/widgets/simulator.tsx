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
//
// A `predictGate` (7.5: "commits before the reveal") is an embedded predict card above the
// island. The island mounts only once the prediction is locked in (or skipped), so the learner
// computes before the simulator shows its readout. As with follow-ups, a prediction that did
// not match ends the card as "Answer shown". The gate's record is saved inside the card's
// answer (`{ gate, followUps }`), and Reset clears it.
import { render, type FunctionComponent } from "preact";
import type { EmbeddedPredict, Exercise, SimulatorExercise, SimulatorId } from "../exercises/types.ts";
import { isComplete } from "../shell/progress-merge.ts";
import type { ExerciseProgress } from "../shell/progress-types.ts";
import { ExerciseCard, resolveExercise, TYPE_LABELS, type ExerciseHost } from "./card.ts";
import { el } from "./dom.ts";
import { followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { PredictQuestion, predictHooks } from "./predict-question.ts";
import { BgzfDemoView } from "./simulators/bgzf-demo/view.tsx";
import { FaiCalculatorView } from "./simulators/fai-calculator/view.tsx";
import { PhredConverterView } from "./simulators/phred-converter/view.tsx";
import type { GoalOutcome, SimulatorViewProps } from "./simulators/types.ts";

/** Views by simulator id. A simulator's owner adds its view here; ids without one show a notice. */
export const VIEWS: Partial<Record<SimulatorId, FunctionComponent<SimulatorViewProps>>> = {
  "fai-calculator": FaiCalculatorView,
  "bgzf-demo": BgzfDemoView,
  "phred-converter": PhredConverterView,
};

/** What a simulator card saves as its answer. */
interface SimulatorSaved {
  gate?: ExerciseProgress;
  followUps?: unknown;
}

interface Gate {
  card: ExerciseCard;
  answer: () => unknown;
  /** "Lock in your prediction to open the simulator." Hidden once the gate is open. */
  note: HTMLParagraphElement;
}

export class SimulatorElement extends HTMLElement {
  data?: SimulatorExercise;
  card?: ExerciseCard<SimulatorExercise>;
  followUps?: FollowUpSet;
  #mount: HTMLDivElement | null = null;
  #gate: Gate | undefined;
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
            this.#gate?.card.clear();
            this.followUps?.reset();
            this.#mountIsland();
          },
          answer: () => {
            const saved: SimulatorSaved = {};
            if (this.#gate) saved.gate = this.#gateRecord(this.#gate);
            if (this.followUps) saved.followUps = this.followUps.answer();
            return Object.keys(saved).length ? saved : undefined;
          },
          restore: (record) => {
            const saved = record.answer as SimulatorSaved | undefined;
            if (saved?.gate && this.#gate && typeof saved.gate.state === "string")
              this.#gate.card.restore(saved.gate);
            if (saved?.followUps) this.followUps?.restore(saved.followUps);
            this.#mountIsland(isComplete(record.state));
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
      if (exercise.predictGate && this.card.mode === "lesson")
        this.#gate = this.#buildGate(this.card, exercise.predictGate);
      this.#mountIsland();
      this.followUps = followUpsFor(this.card, exercise.followUps);
      this.card.ready();
      return;
    }
    this.#mountIsland(); // reconnected after a move
  }

  /** The predict card above the island; locking it in (or skipping) opens the simulator. */
  #buildGate(parent: ExerciseCard, gate: EmbeddedPredict): Gate {
    const doc = this.ownerDocument;
    const host = el(doc, "div", "sim-gate");
    host.id = `${parent.domId}--${gate.id}`;
    let card: ExerciseCard | undefined;
    const question = new PredictQuestion(
      doc,
      gate,
      host.id,
      () => card?.markAttempted(),
      () => card?.check(),
    );
    const hooks = predictHooks(question);
    const exercise = { ...gate, title: gate.title ?? "" } as unknown as Exercise;
    card = new ExerciseCard(host, exercise, hooks, {
      embedded: true,
      overline: `Predict first · ${TYPE_LABELS.predict}`,
      checkLabel: "Lock in my prediction",
      onStateChange: () => this.#gateChanged(),
    });
    card.body.append(question.element);
    const note = el(doc, "p", "sim-gate-note", "Lock in your prediction to open the simulator.");
    parent.body.append(host, note);
    return { card, answer: () => hooks.answer?.(), note };
  }

  #gateRecord(gate: Gate): ExerciseProgress {
    const value = gate.answer();
    return {
      state: gate.card.state,
      attempts: gate.card.attempts,
      firstTry: gate.card.firstTry,
      revealed: gate.card.revealed,
      ...(value === undefined ? {} : { answer: value }),
    };
  }

  #gateChanged(): void {
    const card = this.card;
    const gate = this.#gate;
    if (!card || !gate) return;
    if (card.state === "idle") card.markAttempted();
    if (!gate.card.done || this.#mount) return;
    this.#mountIsland();
    card.save(); // the locked prediction survives a reload
    card.announce("The simulator is open below the prediction.");
  }

  /** `force`: mount even with the gate closed (a card restored as complete). */
  #mountIsland(force = false): void {
    const card = this.card;
    const View = card ? VIEWS[card.exercise.simulator] : undefined;
    if (!card || !View || this.#mount) return;
    const gate = this.#gate;
    const open = !gate || gate.card.done || force || card.done;
    if (gate) gate.note.hidden = open;
    if (!open) return;
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
    const missed = this.#gate !== undefined && this.#gate.card.state !== "correct";
    const result = this.#shown.size || missed ? "revealed" : "correct";
    if (this.followUps) {
      this.followUps.setMain(result, result === "correct");
      if (!card.done) card.announce("Every goal reached. Now answer the follow-up questions below.");
      return;
    }
    const message =
      result === "correct"
        ? "Every goal reached."
        : this.#shown.size
          ? "Every goal reached; some were shown."
          : "Every goal reached; your prediction did not match.";
    card.complete(result, { message }, { focus: false });
  }
}

if (!customElements.get("gf-simulator")) customElements.define("gf-simulator", SimulatorElement);
