// The multiple-choice question (docs/PLAN.md 7.7; ux 8.12), shared by gf-mcq, embedded checks
// (field-explorer) and follow-ups. A fieldset with the stem as its legend; native radios
// (APG radio group: arrows move and select) or checkboxes with "Select all that apply"; option
// rows are the click targets. After a check each relevant option gets a result line (icon and
// words, never colour alone) and its explanation, linked to the input with aria-describedby.
// Formative checks show only the chosen options' notes; Show answer, a correct answer and
// "Submit quiz" show all of them.
import type { McqOption, Snippet } from "../exercises/types.ts";
import { icon, type IconName } from "../shell/icons.ts";
import type { CardHooks } from "./card.ts";
import { el } from "./dom.ts";
import { inlineNodes } from "./inline.ts";
import { renderSnippet } from "./snippet-viewer.ts";

/** The fields an mcq question needs (an exercise, an embedded check or a follow-up). */
export interface McqLike {
  multi: boolean;
  stem: string;
  snippet?: Snippet;
  options: McqOption[];
}

export interface McqGrade {
  answered: boolean;
  correct: boolean;
  /** Correct options chosen, and how many there are. */
  chosenCorrect: number;
  totalCorrect: number;
  chosenWrong: number;
}

export class McqQuestion {
  readonly element: HTMLFieldSetElement;
  readonly data: McqLike;
  #inputs: HTMLInputElement[] = [];
  #results: HTMLDivElement[] = [];

  constructor(doc: Document, data: McqLike, name: string, onInput: () => void) {
    this.data = data;
    const fieldset = el(doc, "fieldset", "mcq");
    const legend = el(doc, "legend", "mcq-stem");
    legend.append(inlineNodes(data.stem, doc));
    if (data.multi) legend.append(" ", el(doc, "span", "mcq-instruction", "Select all that apply."));
    fieldset.append(legend);
    if (data.snippet) fieldset.append(renderSnippet(data.snippet));
    const list = el(doc, "div", "mcq-options");
    data.options.forEach((option, i) => {
      const row = el(doc, "div", "mcq-option");
      row.dataset.option = option.id;
      const label = el(doc, "label", "mcq-option-label");
      const input = el(doc, "input");
      input.type = data.multi ? "checkbox" : "radio";
      input.name = name;
      input.value = option.id;
      input.id = `${name}-${i}`;
      const text = el(doc, "span", "mcq-option-text");
      text.append(inlineNodes(option.text, doc));
      label.append(input, text);
      row.append(label);
      if (option.snippet) row.append(renderSnippet(option.snippet, { compact: true }));
      const result = el(doc, "div", "mcq-result");
      result.id = `${name}-${i}-result`;
      result.hidden = true;
      row.append(result);
      list.append(row);
      this.#inputs.push(input);
      this.#results.push(result);
    });
    fieldset.append(list);
    fieldset.addEventListener("change", (event) => {
      if (!this.#inputs.includes(event.target as HTMLInputElement)) return;
      this.#syncSelected();
      this.clearResults();
      onInput();
    });
    this.element = fieldset;
  }

  value(): string[] {
    return this.#inputs.filter((i) => i.checked).map((i) => i.value);
  }

  setValue(value: unknown): void {
    const chosen = Array.isArray(value) ? value.map(String) : [];
    for (const input of this.#inputs) input.checked = chosen.includes(input.value);
    this.#syncSelected();
  }

  hasAnswer(): boolean {
    return this.value().length > 0;
  }

  grade(): McqGrade {
    const chosen = new Set(this.value());
    const correctIds = this.data.options.filter((o) => o.correct).map((o) => o.id);
    const chosenCorrect = correctIds.filter((id) => chosen.has(id)).length;
    const chosenWrong = [...chosen].filter((id) => !correctIds.includes(id)).length;
    return {
      answered: chosen.size > 0,
      correct: chosenWrong === 0 && chosenCorrect === correctIds.length,
      chosenCorrect,
      totalCorrect: correctIds.length,
      chosenWrong,
    };
  }

  /** Result lines: under the chosen options only, or under every option. */
  showResults(scope: "chosen" | "all"): void {
    const doc = this.element.ownerDocument;
    this.data.options.forEach((option, i) => {
      const input = this.#inputs[i]!;
      const result = this.#results[i]!;
      const chosen = input.checked;
      if (scope === "chosen" && !chosen) {
        result.hidden = true;
        input.removeAttribute("aria-describedby");
        return;
      }
      let line: { text: string; icon: IconName; tone: string } | undefined;
      if (chosen && option.correct)
        line = { text: "Your choice: correct", icon: "circle-check", tone: "success" };
      else if (chosen) line = { text: "Your choice: incorrect", icon: "circle-x", tone: "error" };
      else if (option.correct && this.data.multi)
        line = { text: "Missed: this is also correct", icon: "circle-dashed", tone: "warning" };
      else if (option.correct) line = { text: "Correct answer", icon: "circle-check", tone: "success" };
      result.replaceChildren();
      result.dataset.tone = line?.tone ?? "neutral";
      if (line) {
        const p = el(doc, "p", "mcq-result-line");
        p.innerHTML = icon(line.icon);
        p.append(" ", el(doc, "strong", "", line.text));
        result.append(p);
      }
      const why = el(doc, "p", "mcq-explanation");
      why.append(inlineNodes(option.explanation, doc));
      result.append(why);
      result.hidden = false;
      input.setAttribute("aria-describedby", result.id);
      input.closest(".mcq-option")!.setAttribute("data-result", line?.tone ?? "neutral");
    });
  }

  clearResults(): void {
    this.#results.forEach((result, i) => {
      result.hidden = true;
      this.#inputs[i]!.removeAttribute("aria-describedby");
      this.#inputs[i]!.closest(".mcq-option")!.removeAttribute("data-result");
    });
  }

  /** Lock the choices only; the stem's snippet tools (Copy, View as table) stay usable. */
  lock(locked: boolean): void {
    for (const input of this.#inputs) input.disabled = locked;
    this.element.toggleAttribute("data-locked", locked);
  }

  reset(): void {
    this.setValue([]);
    this.clearResults();
  }

  focusFirst(): void {
    (this.#inputs.find((i) => i.checked) ?? this.#inputs[0])?.focus();
  }

  #syncSelected(): void {
    for (const input of this.#inputs) {
      input.closest(".mcq-option")!.toggleAttribute("data-selected", input.checked);
    }
  }
}

/** Card hooks for an mcq question (formative or quiz: `isQuiz` drops the "try again" advice). */
export function mcqHooks(question: McqQuestion, isQuiz: () => boolean = () => false): CardHooks {
  const data = question.data;
  return {
    check: () => {
      const grade = question.grade();
      if (!grade.answered) {
        return {
          result: "incomplete",
          message: data.multi ? "Choose at least one answer first." : "Choose an answer first.",
        };
      }
      if (grade.correct) {
        question.showResults("all");
        return { result: "correct" };
      }
      question.showResults("chosen");
      if (!data.multi) {
        return isQuiz()
          ? { result: "incorrect" }
          : { result: "incorrect", message: "Read the note under your choice, then try again." };
      }
      const wrong = grade.chosenWrong ? `, ${grade.chosenWrong} incorrect` : "";
      return {
        result: "incorrect",
        message: `${grade.chosenCorrect} of ${grade.totalCorrect} correct choices${wrong}.`,
      };
    },
    reveal: () => {
      question.showResults("all");
      return { message: "The correct answer is marked, with why each option is right or wrong." };
    },
    reset: () => question.reset(),
    restore: (record) => {
      question.setValue(record.answer);
      if (record.state === "correct" || record.state === "revealed") question.showResults("all");
    },
    answer: () => question.value(),
    lock: (locked) => question.lock(locked),
    hasAnswer: () => question.hasAnswer(),
    focusFirst: () => question.focusFirst(),
  };
}
