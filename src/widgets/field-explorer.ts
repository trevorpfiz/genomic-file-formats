// gf-field-explorer (docs/PLAN.md 7.4; ux 8.9): learn what each field of a record means by
// inspecting it. The snippet viewer in explore mode (colours on, aligned when the fields are
// columns) makes each field a grid cell with a roving tabindex; focus or hover highlights the
// field and its legend row and shows a popover (hoverable, dismissible with Esc, pinned with
// Enter or a click; WCAG 1.4.13). Below 600 px there is no popover: the legend row is
// highlighted and scrolled into view instead. Each field's aria-describedby points to its
// legend row. "Explored 3 of 7 fields" counts visits.
//
// Exploring alone never completes the exercise (7.4): the card's Check grades the embedded
// `check` (an mcq), and `followUps` follow it. An explorer with only follow-ups has no Check.
import type { ExplorerField, FieldExplorerExercise } from "../exercises/types.ts";
import { ExerciseCard, resolveExercise, type CardHooks, type ExerciseHost } from "./card.ts";
import { button, el, isNarrow } from "./dom.ts";
import { composeHooks, followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { inlineNodes } from "./inline.ts";
import { McqQuestion, mcqHooks } from "./mcq-question.ts";
import { SnippetViewer, summarizeValue, type ViewerCell } from "./text-viewer.ts";

const where = (field: ExplorerField) =>
  field.col !== undefined ? `col ${field.col}` : `characters ${field.span[0] + 1} to ${field.span[1]}`;

export class FieldExplorerElement extends HTMLElement {
  data?: FieldExplorerExercise;
  card?: ExerciseCard<FieldExplorerExercise>;
  viewer?: SnippetViewer;

  #visited = new Set<number>();
  #pinned: number | null = null;
  #shown: number | null = null;
  #legendRows: HTMLElement[] = [];
  #popover!: HTMLDivElement;
  #counter!: HTMLParagraphElement;
  #fields: readonly ExplorerField[] = [];

  connectedCallback(): void {
    if (this.card) return;
    const exercise = resolveExercise(this as ExerciseHost, "field-explorer");
    if (!exercise) return;
    const doc = this.ownerDocument;
    this.#fields = exercise.fields;
    const domId = this.id || exercise.id.replaceAll("/", "--");

    const viewer = new SnippetViewer(
      exercise.snippet,
      { mode: "explore", fields: exercise.fields, view: { ...exercise.snippet.view } },
      doc,
    );
    viewer.element.dataset.colors = "on";
    this.viewer = viewer;
    const stage = el(doc, "div", "fe-stage");
    this.#popover = el(doc, "div", "fe-popover");
    this.#popover.setAttribute("aria-hidden", "true");
    this.#popover.hidden = true;
    this.#popover.addEventListener("mouseleave", () => this.#hide(false));
    stage.append(viewer.element, this.#popover);

    this.#counter = el(doc, "p", "fe-counter");
    const legend = el(doc, "dl", "fe-legend");
    legend.setAttribute("aria-label", "Field legend");
    this.#legendRows = exercise.fields.map((field, i) => {
      const row = el(doc, "div", "fe-legend-row");
      row.id = `${domId}-legend-${i}`;
      row.dataset.field = String(i);
      row.dataset.tint = String((i % 8) + 1);
      const dt = el(doc, "dt");
      dt.append(
        el(doc, "span", "fe-swatch", String(i + 1)),
        " ",
        el(doc, "span", "fe-name", field.name),
        " ",
        el(doc, "span", "fe-where", where(field)),
      );
      const dd = el(doc, "dd");
      const value = viewer.cell(`F${i}`)?.value ?? "";
      const valueLine = el(doc, "p", "fe-value");
      valueLine.append(el(doc, "span", "fe-key", "Value: "), el(doc, "code", "", value));
      const meaning = el(doc, "p", "fe-meaning");
      meaning.append(inlineNodes(field.meaning, doc));
      dd.append(valueLine, meaning);
      if (field.allowed) {
        const allowed = el(doc, "p", "fe-allowed");
        allowed.append(el(doc, "span", "fe-key", "Allowed: "), inlineNodes(field.allowed, doc));
        dd.append(allowed);
      }
      const cite = el(doc, "p", "fe-cite");
      cite.append(el(doc, "span", "fe-key", "Source: "), inlineNodes(field.cite, doc));
      dd.append(cite);
      row.append(dt, dd);
      legend.append(row);
      return row;
    });
    for (const cell of viewer.cells) viewer.describeCell(cell.key, `${domId}-legend-${cell.index}`);

    viewer.onFocusCell = (cell, how) => this.#onFocus(cell, how);
    viewer.onActivate = (cell) => this.#togglePin(cell);
    viewer.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.#shown !== null) {
        event.stopPropagation();
        this.#hide(true);
      }
    });
    viewer.element.addEventListener("focusout", (event) => {
      if (!viewer.element.contains(event.relatedTarget as Node | null) && this.#pinned === null)
        this.#hide(false);
    });

    let card: ExerciseCard<FieldExplorerExercise> | undefined;
    let followUps: FollowUpSet | undefined;
    let question: McqQuestion | undefined;
    let base: CardHooks = {};
    const checkBox = el(doc, "div", "fe-check");
    if (exercise.check) {
      question = new McqQuestion(doc, exercise.check, `${domId}-check`, () => card?.markAttempted());
      base = mcqHooks(question);
      if (exercise.check.title) checkBox.append(el(doc, "p", "fe-check-title", exercise.check.title));
      if (exercise.check.prompt) {
        const p = el(doc, "p", "fe-check-prompt");
        p.append(inlineNodes(exercise.check.prompt, doc));
        checkBox.append(p);
      }
      checkBox.append(question.element);
    }
    const hooks = composeHooks(
      {
        ...base,
        reset: () => {
          base.reset?.();
          this.#visited.clear();
          this.#hide(true);
          this.#refresh();
        },
        restore: (record) => {
          const saved = (record.answer ?? {}) as { visited?: number[]; check?: unknown };
          for (const i of saved.visited ?? []) if (exercise.fields[i]) this.#visited.add(i);
          this.#refresh();
          base.restore?.({ ...record, answer: saved.check });
        },
        answer: () => ({ visited: [...this.#visited].sort((a, b) => a - b), check: base.answer?.() }),
      },
      () => followUps,
    );
    card = new ExerciseCard(this, exercise, hooks, {
      showCheck: Boolean(exercise.check),
      howTo:
        exercise.howTo ??
        `Focus or hover over each field to see what it means (arrow keys move between fields; Enter pins a note). Then ${
          exercise.check ? "answer the question and select Check" : "answer the follow-up questions"
        }.`,
    });
    this.card = card;
    const done = button(doc, "Done exploring", "button-text fe-done", () => {
      for (let i = 0; i < exercise.fields.length; i += 1) this.#visited.add(i);
      this.#refresh();
      card?.markAttempted();
      (
        checkBox.querySelector<HTMLElement>("input") ??
        card?.after.querySelector<HTMLElement>("input, [role=gridcell]")
      )?.focus();
    });
    const status = el(doc, "div", "fe-status");
    status.append(this.#counter, done);
    card.body.append(stage, status, legend, checkBox);
    followUps = followUpsFor(card, exercise.followUps, { standalone: !exercise.check });
    this.#refresh();
    card.ready();
  }

  #refresh(): void {
    const total = this.#fields.length;
    this.#counter.textContent = `Explored ${this.#visited.size} of ${total} ${total === 1 ? "field" : "fields"}`;
    for (let i = 0; i < total; i += 1) {
      const visited = this.#visited.has(i);
      this.viewer?.setMark(`F${i}`, visited ? "visited" : null);
      this.#legendRows[i]?.toggleAttribute("data-visited", visited);
    }
  }

  #onFocus(cell: ViewerCell | null, how: "focus" | "hover"): void {
    if (cell?.index === undefined) {
      if (
        how === "hover" &&
        this.#pinned === null &&
        !this.viewer?.element.contains(this.ownerDocument.activeElement)
      ) {
        this.#hide(false);
      }
      return;
    }
    if (this.#pinned !== null && this.#pinned !== cell.index && how === "hover") return;
    if (!this.#visited.has(cell.index)) {
      this.#visited.add(cell.index);
      this.#refresh();
      if (this.card?.state === "idle") this.card.markAttempted();
    }
    this.#show(cell, how === "focus");
  }

  #togglePin(cell: ViewerCell): void {
    if (cell.index === undefined) return;
    if (this.#pinned === cell.index) {
      this.#pinned = null;
      this.#popover.dataset.pinned = "false";
      return;
    }
    this.#pinned = cell.index;
    this.#show(cell, true);
    this.#popover.dataset.pinned = "true";
  }

  #show(cell: ViewerCell, scroll: boolean): void {
    const i = cell.index!;
    const field = this.#fields[i]!;
    const doc = this.ownerDocument;
    this.#shown = i;
    this.#legendRows.forEach((row, k) => row.toggleAttribute("data-active", k === i));
    for (const c of this.viewer?.cells ?? []) {
      this.viewer?.cellElement(c.key)?.toggleAttribute("data-active", c.index === i);
    }
    if (isNarrow(doc)) {
      this.#popover.hidden = true;
      if (scroll) this.#legendRows[i]?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    const title = el(doc, "p", "fe-popover-title", field.name);
    const meta = el(doc, "p", "fe-popover-meta", `${where(field)} · value ${summarizeValue(cell.value)}`);
    const meaning = el(doc, "p", "fe-popover-meaning");
    meaning.append(inlineNodes(field.meaning, doc));
    const more = el(doc, "p", "fe-popover-more", "More in the legend below.");
    this.#popover.replaceChildren(title, meta, meaning, more);
    this.#popover.hidden = false;
    const target = this.viewer?.cellElement(cell.key);
    const stage = this.#popover.parentElement;
    if (target && stage) {
      const t = target.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      this.#popover.style.left = `${Math.max(0, Math.min(t.left - s.left, s.width - 320))}px`;
      this.#popover.style.top = `${t.bottom - s.top + 6}px`;
    }
  }

  #hide(unpin: boolean): void {
    if (unpin) this.#pinned = null;
    if (this.#pinned !== null) return;
    this.#shown = null;
    this.#popover.hidden = true;
    this.#legendRows.forEach((row) => row.removeAttribute("data-active"));
    for (const c of this.viewer?.cells ?? []) this.viewer?.cellElement(c.key)?.removeAttribute("data-active");
  }
}

if (!customElements.get("gf-field-explorer"))
  customElements.define("gf-field-explorer", FieldExplorerElement);
