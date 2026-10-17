// The predict question (docs/PLAN.md 7.6; ux 8.11), shared by gf-predict, follow-ups and quiz
// predict slots: choice chips, a number with a tolerance (and unit), text normalised for case
// and whitespace, or a region as two number inputs (the keyboard path of the ruler). One lock
// for all items; after it each item shows "Your prediction" and a reveal row with the answer.
// A match records correct; anything else records revealed; both complete the exercise.
import type { PredictInput, PredictItem, Snippet } from "../exercises/types.ts";
import { icon } from "../shell/icons.ts";
import type { CardHooks } from "./card.ts";
import { el } from "./dom.ts";
import { inlineNodes } from "./inline.ts";
import { renderSnippetFigure } from "./snippet-viewer.ts";

/** A learner's raw value for one item: text, chosen option indices, or [start, end] text. */
export type PredictValue = string | number[] | [string, string];

const normalizeNumber = (raw: string) => Number(raw.replace(/[\s,_]/g, ""));

/** A learner's raw value as text (inputs hold strings; saved answers may hold numbers). */
const asText = (value: unknown): string =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

/** Whether a learner's value matches an item's key. */
export function matches(input: PredictInput, value: unknown): boolean {
  switch (input.type) {
    case "number": {
      const raw = asText(value);
      const n = normalizeNumber(raw);
      return raw.trim() !== "" && Number.isFinite(n) && Math.abs(n - input.answer) <= input.tolerance;
    }
    case "text": {
      let a = asText(value);
      let b = input.answer;
      if (input.normalize?.includes("whitespace"))
        [a, b] = [a.trim().replace(/\s+/g, " "), b.trim().replace(/\s+/g, " ")];
      if (input.normalize?.includes("case")) [a, b] = [a.toLowerCase(), b.toLowerCase()];
      return a === b;
    }
    case "choice": {
      const expected = Array.isArray(input.answer) ? input.answer : [input.answer];
      const chosen = Array.isArray(value) ? value.map(Number) : [];
      return expected.length === chosen.length && expected.every((i) => chosen.includes(i));
    }
    case "region": {
      if (!Array.isArray(value) || value.length !== 2) return false;
      const [start, end] = value.map((v) => normalizeNumber(asText(v)));
      return start === input.answer[0] && end === input.answer[1];
    }
  }
}

const isEmpty = (value: unknown) =>
  Array.isArray(value)
    ? value.length === 0 || value.some((v) => typeof v === "string" && v.trim() === "")
    : asText(value).trim() === "";

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

/** The key in words: "0.101", "chr2 and chr3", "1,001 to 1,003". */
export function answerText(input: PredictInput): string {
  switch (input.type) {
    case "number":
      return `${fmt(input.answer)}${input.unit ? ` ${input.unit}` : ""}`;
    case "text":
      return input.answer;
    case "choice": {
      const keys = Array.isArray(input.answer) ? input.answer : [input.answer];
      return keys.map((k) => input.options[k] ?? "").join("; ");
    }
    case "region":
      return `${fmt(input.answer[0])} to ${fmt(input.answer[1])}`;
  }
}

function valueText(input: PredictInput, value: unknown): string {
  if (input.type === "choice") {
    const chosen = Array.isArray(value) ? value.map(Number) : [];
    return chosen.map((k) => input.options[k] ?? "").join("; ");
  }
  if (input.type === "region" && Array.isArray(value)) return `${value[0]} to ${value[1]}`;
  return `${asText(value)}${input.type === "number" && input.unit ? ` ${input.unit}` : ""}`;
}

export interface PredictLike {
  /** The file the prediction is about, shown above the items; its tools stay usable when locked. */
  snippet?: Snippet;
  items: PredictItem[];
  reveal: string;
}

/**
 * Text for a reveal row. Choice options are authored strings that may use inline marks
 * (`code`, *italic*), so they render through inlineNodes like the chips do; numbers, text keys
 * and the learner's own typing are shown exactly as written.
 */
const rowText = (doc: Document, input: PredictInput, text: string): Node | string =>
  input.type === "choice" ? inlineNodes(text, doc) : text;

interface ItemControl {
  item: PredictItem;
  get: () => unknown;
  set: (value: unknown) => void;
  controls: HTMLInputElement[];
  result: HTMLDivElement;
}

export class PredictQuestion {
  readonly element: HTMLFormElement;
  readonly data: PredictLike;
  #items: ItemControl[];

  constructor(doc: Document, data: PredictLike, idBase: string, onInput: () => void, onSubmit: () => void) {
    this.data = data;
    const form = el(doc, "form", "predict-form");
    form.noValidate = true;
    const figure = data.snippet ? renderSnippetFigure(data.snippet, doc) : undefined;
    if (figure) form.append(figure);
    this.#items = data.items.map((item, i) => {
      const id = `${idBase}-item-${item.id ?? i}`;
      const wrap = el(doc, "div", "predict-item");
      wrap.dataset.type = item.input.type;
      const result = el(doc, "div", "predict-result");
      result.id = `${id}-result`;
      result.hidden = true;
      const control = this.#control(doc, item, id, wrap);
      wrap.append(result);
      form.append(wrap);
      return { ...control, item, result };
    });
    form.addEventListener("input", (event) => {
      // The snippet's own tools (view toggles) are not a prediction.
      if (figure && event.target instanceof Node && figure.contains(event.target)) return;
      onInput();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      onSubmit();
    });
    this.element = form;
  }

  #control(doc: Document, item: PredictItem, id: string, wrap: HTMLElement) {
    const input = item.input;
    if (input.type === "choice") {
      const fieldset = el(doc, "fieldset", "predict-choices");
      const legend = el(doc, "legend", "predict-label");
      legend.append(inlineNodes(item.label, doc));
      fieldset.append(legend);
      const multi = Array.isArray(input.answer);
      if (multi) legend.append(" ", el(doc, "span", "mcq-instruction", "Select all that apply."));
      const boxes = input.options.map((option, o) => {
        const label = el(doc, "label", "chip-option");
        const box = el(doc, "input");
        box.type = multi ? "checkbox" : "radio";
        box.name = id;
        box.value = String(o);
        const text = el(doc, "span", "chip-option-text");
        text.append(inlineNodes(option, doc));
        label.append(box, text);
        fieldset.append(label);
        return box;
      });
      wrap.append(fieldset);
      return {
        controls: boxes,
        get: () => boxes.filter((b) => b.checked).map((b) => Number(b.value)),
        set: (value: unknown) => {
          for (const box of boxes)
            box.checked = Array.isArray(value) && value.map(Number).includes(Number(box.value));
        },
      };
    }
    const field = (fieldId: string, labelText: Node | string, kind: "number" | "text") => {
      const label = el(doc, "label", "predict-label");
      label.htmlFor = fieldId;
      label.append(labelText);
      const box = el(doc, "input", "predict-input");
      box.id = fieldId;
      box.type = "text";
      box.autocomplete = "off";
      box.spellcheck = false;
      box.setAttribute("autocapitalize", "off");
      box.setAttribute("autocorrect", "off");
      if (kind === "number") box.inputMode = "decimal";
      return { label, box };
    };
    if (input.type === "region") {
      const fieldset = el(doc, "fieldset", "predict-region");
      const legend = el(doc, "legend", "predict-label");
      legend.append(inlineNodes(item.label, doc));
      fieldset.append(legend);
      const start = field(`${id}-start`, "Start", "number");
      const end = field(`${id}-end`, "End", "number");
      const row = el(doc, "div", "predict-region-row");
      row.append(start.label, start.box, end.label, end.box);
      fieldset.append(row);
      wrap.append(fieldset);
      return {
        controls: [start.box, end.box],
        get: () => [start.box.value, end.box.value] as [string, string],
        set: (value: unknown) => {
          const [a, b] = Array.isArray(value) ? value : [];
          start.box.value = typeof a === "string" ? a : "";
          end.box.value = typeof b === "string" ? b : "";
        },
      };
    }
    const { label, box } = field(
      id,
      inlineNodes(item.label, doc),
      input.type === "number" ? "number" : "text",
    );
    const row = el(doc, "div", "predict-field");
    row.append(box);
    if (input.type === "number" && input.unit) row.append(el(doc, "span", "predict-unit", input.unit));
    wrap.append(label, row);
    return {
      controls: [box],
      get: () => box.value,
      set: (value: unknown) => {
        box.value = typeof value === "string" ? value : "";
      },
    };
  }

  value(): unknown[] {
    return this.#items.map((i) => i.get());
  }

  setValue(value: unknown): void {
    const saved = Array.isArray(value) ? value : [];
    this.#items.forEach((item, i) => item.set(saved[i]));
  }

  hasAnswer(): boolean {
    return !this.value().some(isEmpty);
  }

  /** Every item matches its key. */
  allMatch(): boolean {
    return this.#items.every((i) => matches(i.item.input, i.get()));
  }

  /** Per-item reveal rows; `withPrediction` adds "Your prediction" (not after a skip). */
  showResults(withPrediction: boolean): void {
    const doc = this.element.ownerDocument;
    for (const { item, get, result, controls } of this.#items) {
      const value = get();
      const answered = !isEmpty(value);
      const match = answered && matches(item.input, value);
      result.replaceChildren();
      result.dataset.tone = withPrediction && match ? "success" : "neutral";
      if (withPrediction && answered) {
        const yours = el(doc, "p", "predict-yours");
        const chosen = el(doc, "strong");
        chosen.append(rowText(doc, item.input, valueText(item.input, value)));
        yours.append(el(doc, "span", "", "Your prediction: "), chosen);
        result.append(yours);
      }
      const key = el(doc, "p", "predict-key");
      key.innerHTML = icon(withPrediction && match ? "circle-check" : "eye");
      const tolerance =
        item.input.type === "number" && item.input.tolerance > 0
          ? ` (answers within ${fmt(item.input.tolerance)} count)`
          : "";
      const keyText = el(doc, "span");
      keyText.append(rowText(doc, item.input, answerText(item.input)), tolerance);
      key.append(
        " ",
        el(doc, "strong", "", withPrediction && match ? "Matches the answer: " : "Answer: "),
        keyText,
      );
      result.append(key);
      if (item.reveal) {
        const why = el(doc, "p", "predict-why");
        why.append(inlineNodes(item.reveal, doc));
        result.append(why);
      }
      result.hidden = false;
      for (const control of controls) control.setAttribute("aria-describedby", result.id);
    }
  }

  clearResults(): void {
    for (const { result, controls } of this.#items) {
      result.hidden = true;
      for (const control of controls) control.removeAttribute("aria-describedby");
    }
  }

  lock(locked: boolean): void {
    for (const { controls } of this.#items) {
      for (const control of controls) {
        if (control.type === "text") control.readOnly = locked;
        else control.disabled = locked;
      }
    }
    this.element.toggleAttribute("data-locked", locked);
  }

  reset(): void {
    this.setValue([]);
    this.clearResults();
  }

  focusFirst(): void {
    this.#items[0]?.controls[0]?.focus();
  }
}

/** Card hooks for a predict question; "Lock in my prediction" is the card's check. */
export function predictHooks(question: PredictQuestion): CardHooks {
  const reveal = question.data.reveal;
  return {
    check: () => {
      if (!question.hasAnswer())
        return { result: "incomplete", message: "Enter a prediction for every item first." };
      question.showResults(true);
      return question.allMatch()
        ? { result: "correct", message: "Your prediction matches.", explanation: reveal }
        : { result: "revealed", message: "Here is the answer.", explanation: reveal };
    },
    reveal: () => {
      question.showResults(question.hasAnswer());
      return { message: "Here is the answer.", explanation: reveal };
    },
    reset: () => question.reset(),
    restore: (record) => {
      question.setValue(record.answer);
      if (record.state === "correct" || record.state === "revealed")
        question.showResults(question.hasAnswer());
    },
    answer: () => question.value(),
    lock: (locked) => question.lock(locked),
    hasAnswer: () => question.hasAnswer(),
    focusFirst: () => question.focusFirst(),
  };
}
