// predict (docs/PLAN.md 7.6), M0 skeleton: number, text and choice items, "Lock in my
// prediction", then the reveal. A match records "correct"; anything else records "revealed";
// both complete the exercise.
import type { PredictExercise, PredictInput } from "../exercises/types.ts";
import { addOverline, announceSolved, resolveExercise } from "./card.ts";

const normalizeNumber = (raw: string) => Number(raw.replace(/[\s,_]/g, ""));

export function matches(input: PredictInput, value: string | number[]): boolean {
  switch (input.type) {
    case "number": {
      const n = normalizeNumber(String(value));
      return Number.isFinite(n) && Math.abs(n - input.answer) <= input.tolerance;
    }
    case "text": {
      let a = String(value);
      let b = input.answer;
      if (input.normalize?.includes("whitespace"))
        [a, b] = [a.trim().replace(/\s+/g, " "), b.trim().replace(/\s+/g, " ")];
      if (input.normalize?.includes("case")) [a, b] = [a.toLowerCase(), b.toLowerCase()];
      return a === b;
    }
    case "choice": {
      const expected = Array.isArray(input.answer) ? input.answer : [input.answer];
      const chosen = Array.isArray(value) ? value : [];
      return expected.length === chosen.length && expected.every((i) => chosen.includes(i));
    }
    case "region":
      return false; // The ruler input arrives with the coordinate-ruler simulator (M3).
  }
}

export class PredictElement extends HTMLElement {
  #exercise: PredictExercise | null = null;

  connectedCallback(): void {
    if (this.#exercise) return;
    this.#exercise = resolveExercise(this, "predict");
    if (this.#exercise) this.#render(this.#exercise);
  }

  #render(exercise: PredictExercise): void {
    addOverline(this, "Predict");
    const domId = this.id || exercise.id.replaceAll("/", "--");
    const form = document.createElement("form");
    form.className = "predict-form";
    const prompt = document.createElement("p");
    prompt.className = "prompt";
    prompt.textContent = exercise.prompt;
    form.append(prompt);

    const fields = exercise.items.map((item, i) => {
      const id = `${domId}-item-${i}`;
      if (item.input.type === "choice") {
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        legend.textContent = item.label;
        fieldset.append(legend);
        const multi = Array.isArray(item.input.answer);
        item.input.options.forEach((option, o) => {
          const label = document.createElement("label");
          const box = document.createElement("input");
          box.type = multi ? "checkbox" : "radio";
          box.name = id;
          box.value = String(o);
          label.append(box, ` ${option}`);
          fieldset.append(label);
        });
        form.append(fieldset);
        return () =>
          [...fieldset.querySelectorAll<HTMLInputElement>("input:checked")].map((b) => Number(b.value));
      }
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = item.label;
      const input = document.createElement("input");
      input.id = id;
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      if (item.input.type === "number") input.inputMode = "numeric";
      form.append(label, input);
      return () => input.value;
    });

    const lock = document.createElement("button");
    lock.type = "submit";
    lock.textContent = "Lock in my prediction";
    form.append(lock);

    const reveal = document.createElement("div");
    reveal.className = "reveal";
    reveal.hidden = true;
    const verdict = document.createElement("p");
    verdict.className = "verdict";
    verdict.tabIndex = -1;
    const explanation = document.createElement("p");
    explanation.textContent = exercise.reveal;
    reveal.append(verdict, explanation);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.hasAttribute("solved")) return;
      const correct = exercise.items.every((item, i) => matches(item.input, fields[i]!()));
      for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button")) {
        control.disabled = true;
      }
      verdict.textContent = correct ? "Your prediction matches." : "Here is the answer.";
      reveal.hidden = false;
      verdict.focus();
      announceSolved(this, {
        id: exercise.id,
        state: correct ? "correct" : "revealed",
        attempts: 1,
        firstTry: correct,
        revealed: !correct,
      });
    });

    const body = document.createElement("div");
    body.className = "card-body";
    body.append(form, reveal);
    this.append(body);
  }
}

if (!customElements.get("gf-predict")) customElements.define("gf-predict", PredictElement);
