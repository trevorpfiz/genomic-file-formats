// The simulator host: a custom element that mounts a Preact island (D-21). Light DOM, so the
// theme tokens and prose styles apply. The compiled Quick check H3 stays above the island.
// Measured in M0 (vp build, Preact externalized vs bundled): Preact 10.29.8 with hooks and
// jsx-runtime adds 13,164 bytes raw, about 5.3 KB gzip, to dist/index.html.
import { render } from "preact";
import type { SimulatorExercise, SimulatorId } from "../exercises/types.ts";
import { addOverline, announceSolved, resolveExercise } from "./card.ts";
import { RulerView } from "./simulators/coordinate-ruler/view.tsx";

type View = typeof RulerView;
const VIEWS: Partial<Record<SimulatorId, View>> = {
  "coordinate-ruler": RulerView,
};

export class SimulatorElement extends HTMLElement {
  #mount: HTMLDivElement | null = null;

  connectedCallback(): void {
    if (this.#mount) return;
    const exercise = resolveExercise(this, "simulator");
    if (!exercise) return;
    const View = VIEWS[exercise.simulator];
    if (!View) {
      this.textContent = `Simulator "${exercise.simulator}" is not built yet.`;
      return;
    }
    addOverline(this, "Simulator");
    this.#mount = document.createElement("div");
    this.#mount.className = "island";
    this.append(this.#mount);
    render(<View exercise={exercise} onGoal={(goal) => this.#solved(exercise, goal)} />, this.#mount);
  }

  disconnectedCallback(): void {
    if (!this.#mount) return;
    render(null, this.#mount);
    this.#mount.remove();
    this.querySelector(":scope > .overline")?.remove();
    this.#mount = null;
  }

  #solved(exercise: SimulatorExercise, _goal: string): void {
    announceSolved(this, { id: exercise.id, state: "correct", attempts: 1, firstTry: true, revealed: false });
  }
}

if (!customElements.get("gf-simulator")) customElements.define("gf-simulator", SimulatorElement);
