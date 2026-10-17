// The spot-the-error question (docs/PLAN.md 7.1; ux 8.6), shared by gf-spot-the-error, quiz
// single-pick slots and follow-ups. Each round is a snippet viewer in pick-line or pick-field
// mode (a grid with a roving tabindex) and a counter. A selection commits only on Check, so stray
// taps never count. A found error keeps a success mark and gets an explanation row under its
// line; a fine pick stays marked "Checked: fine here" (dashed) with its note, so it is not
// repeated; a knock-on pick (`acceptAlso`) is never marked wrong. Show answer marks the rest.
import type { SpotRound } from "../exercises/types.ts";
import { icon } from "../shell/icons.ts";
import type { CardHooks } from "./card.ts";
import { el } from "./dom.ts";
import { inlineNodes } from "./inline.ts";
import { SnippetViewer, type ViewerCell } from "./text-viewer.ts";

/** Below 600 px (ux 3: phones), where the "Lengths and separators" gutter starts off. */
const isNarrow = (doc: Document): boolean =>
  doc.defaultView?.matchMedia?.("(max-width: 599.98px)").matches ?? false;

export interface SpotLike {
  rounds: SpotRound[];
  singlePick?: boolean;
}

type Where = { line: number; field?: string };

const matchesCell = (round: SpotRound, where: Where, cell: ViewerCell) =>
  where.line === cell.line &&
  (round.granularity === "line" || where.field === undefined || where.field === cell.field);

interface RoundState {
  round: SpotRound;
  viewer: SnippetViewer;
  counter: HTMLParagraphElement;
  tools: HTMLDivElement | undefined;
  /** Indices of found answers. */
  found: Set<number>;
  /** Cell keys checked and fine here. */
  fine: Set<string>;
  /** Cell keys accepted as knock-ons. */
  knock: Set<string>;
  revealed: boolean;
}

export interface SpotSaved {
  [roundId: string]: {
    selected: string[];
    found: number[];
    fine: string[];
    knock: string[];
    revealed?: boolean;
  };
}

export class SpotQuestion {
  readonly element: HTMLDivElement;
  readonly data: SpotLike;
  #rounds: RoundState[];
  #announce: (text: string) => void;

  constructor(doc: Document, data: SpotLike, onInput: () => void, announce: (text: string) => void) {
    this.data = data;
    this.#announce = announce;
    const root = el(doc, "div", "spot");
    const many = data.rounds.length > 1;
    this.#rounds = data.rounds.map((round, r) => {
      const section = el(doc, "div", "spot-round");
      section.dataset.round = round.id;
      if (many)
        section.append(
          el(doc, "p", "spot-round-label", round.label ?? `Round ${r + 1} of ${data.rounds.length}`),
        );
      if (round.prompt) {
        const p = el(doc, "p", "spot-round-prompt");
        p.append(inlineNodes(round.prompt, doc));
        section.append(p);
      }
      const counter = el(doc, "p", "spot-counter");
      const viewer = new SnippetViewer(
        round.snippet,
        {
          mode: round.granularity === "line" ? "pick-line" : "pick-field",
          multi: !data.singlePick,
          // The gutter is on by default, except on phones, where it would take most of the
          // width; its text stays in each line's accessible name and the toggle turns it on.
          view: { lineInfo: round.snippet.view?.lineInfo ?? !isNarrow(doc) },
        },
        doc,
      );
      const state: RoundState = {
        round,
        viewer,
        counter,
        tools: undefined,
        found: new Set(),
        fine: new Set(),
        knock: new Set(),
        revealed: false,
      };
      viewer.onActivate = (cell) => this.#toggle(state, cell, onInput);
      if (round.toolsSay) {
        const tools = el(doc, "div", "spot-tools");
        tools.hidden = true;
        if (round.toolsDisagree) {
          const badge = el(doc, "p", "spot-tools-badge");
          badge.innerHTML = icon("triangle-alert");
          badge.append(" Tools disagree");
          tools.append(badge);
        }
        const say = el(doc, "p", "spot-tools-say");
        say.append(inlineNodes(round.toolsSay, doc));
        tools.append(say);
        state.tools = tools;
      }
      section.append(counter, viewer.element);
      if (state.tools) section.append(state.tools);
      root.append(section);
      return state;
    });
    this.#updateCounters();
    this.element = root;
  }

  get viewers(): SnippetViewer[] {
    return this.#rounds.map((r) => r.viewer);
  }

  #toggle(state: RoundState, cell: ViewerCell, onInput: () => void): void {
    const key = cell.key;
    if (state.viewer.mark(key)) {
      const what = state.round.granularity === "line" ? "line" : "field";
      this.#announce(`You already checked this ${what}.`);
      return;
    }
    const on = !state.viewer.isSelected(key);
    state.viewer.setSelected(key, on);
    onInput();
  }

  hasAnswer(): boolean {
    return this.#rounds.some((r) => r.viewer.selected.length > 0);
  }

  get total(): number {
    return this.#rounds.reduce((n, r) => n + r.round.answers.length, 0);
  }

  get foundCount(): number {
    return this.#rounds.reduce((n, r) => n + r.found.size, 0);
  }

  /** Grade the current selections; returns how many picks were fine (wrong). */
  commit(): { picked: number; wrong: number } {
    let picked = 0;
    let wrong = 0;
    for (const state of this.#rounds) {
      const { round, viewer } = state;
      for (const key of viewer.selected) {
        picked += 1;
        const cell = viewer.cell(key)!;
        viewer.setSelected(key, false);
        const hit = round.answers.findIndex((a, i) => !state.found.has(i) && matchesCell(round, a, cell));
        if (hit >= 0) {
          state.found.add(hit);
          this.#markFound(state, cell, hit, "found");
          continue;
        }
        if (round.answers.some((a) => matchesCell(round, a, cell))) continue;
        const knock = round.acceptAlso?.find((a) => matchesCell(round, a, cell));
        if (knock) {
          state.knock.add(key);
          this.#markKnock(state, cell, knock.note);
          continue;
        }
        wrong += 1;
        state.fine.add(key);
        this.#markFine(state, cell);
      }
      if (state.found.size === round.answers.length && state.tools) state.tools.hidden = false;
    }
    this.#updateCounters();
    return { picked, wrong };
  }

  #markFound(state: RoundState, cell: ViewerCell, index: number, how: "found" | "revealed"): void {
    const answer = state.round.answers[index]!;
    const doc = this.element.ownerDocument;
    const note = doc.createDocumentFragment();
    note.append(
      el(doc, "strong", "", how === "found" ? "Error found. " : "Answer. "),
      inlineNodes(answer.explanation, doc),
    );
    state.viewer.setMark(cell.key, how);
    state.viewer.setNote(cell.key, cell.line, note, how === "found" ? "success" : "neutral");
  }

  #markKnock(state: RoundState, cell: ViewerCell, text: string): void {
    const doc = this.element.ownerDocument;
    const note = doc.createDocumentFragment();
    note.append(el(doc, "strong", "", "Knock-on. "), inlineNodes(text, doc));
    state.viewer.setMark(cell.key, "knock-on");
    state.viewer.setNote(cell.key, cell.line, note, "neutral");
  }

  #markFine(state: RoundState, cell: ViewerCell): void {
    const doc = this.element.ownerDocument;
    const fine = state.round.fineHere ?? {};
    const text = (cell.field && fine[`${cell.line}:${cell.field}`]) || fine[String(cell.line)];
    const note = doc.createDocumentFragment();
    note.append(el(doc, "strong", "", "Checked: fine here. "));
    if (text) note.append(inlineNodes(text, doc));
    state.viewer.setMark(cell.key, "fine");
    state.viewer.setNote(cell.key, cell.line, note, "error");
  }

  /** Mark every answer not yet found, every knock-on, and show the tools notes. */
  revealAll(): void {
    this.#reveal(this.#rounds);
  }

  #reveal(states: RoundState[]): void {
    for (const state of states) {
      const { round, viewer } = state;
      viewer.clearSelection();
      round.answers.forEach((answer, i) => {
        if (state.found.has(i)) return;
        const cell = viewer.cells.find((c) => matchesCell(round, answer, c));
        if (cell) this.#markFound(state, cell, i, "revealed");
      });
      for (const knock of round.acceptAlso ?? []) {
        const cell = viewer.cells.find((c) => matchesCell(round, knock, c));
        if (cell && !viewer.mark(cell.key)) {
          state.knock.add(cell.key);
          this.#markKnock(state, cell, knock.note);
        }
      }
      state.revealed = true;
      if (state.tools) state.tools.hidden = false;
    }
    this.#updateCounters();
  }

  #updateCounters(): void {
    for (const state of this.#rounds) {
      const n = state.round.answers.length;
      const found = state.found.size;
      state.counter.textContent =
        found === 0 && n === 1 && !state.revealed
          ? "Find the 1 error."
          : `Errors found: ${found} of ${n}${state.revealed && found < n ? `; ${n - found} shown` : ""}.`;
    }
  }

  value(): SpotSaved {
    const saved: SpotSaved = {};
    for (const s of this.#rounds) {
      saved[s.round.id] = {
        selected: s.viewer.selected,
        found: [...s.found],
        fine: [...s.fine],
        knock: [...s.knock],
        ...(s.revealed ? { revealed: true } : {}),
      };
    }
    return saved;
  }

  setValue(value: unknown): void {
    this.reset();
    if (!value || typeof value !== "object") return;
    const saved = value as Partial<SpotSaved>;
    for (const state of this.#rounds) {
      const r = saved[state.round.id];
      if (!r) continue;
      const { viewer, round } = state;
      for (const i of r.found ?? []) {
        const answer = round.answers[i];
        const cell = answer && viewer.cells.find((c) => matchesCell(round, answer, c));
        if (!cell) continue;
        state.found.add(i);
        this.#markFound(state, cell, i, "found");
      }
      for (const key of r.fine ?? []) {
        const cell = viewer.cell(key);
        if (!cell) continue;
        state.fine.add(key);
        this.#markFine(state, cell);
      }
      for (const key of r.knock ?? []) {
        const cell = viewer.cell(key);
        const knock = cell && round.acceptAlso?.find((a) => matchesCell(round, a, cell));
        if (!cell || !knock) continue;
        state.knock.add(key);
        this.#markKnock(state, cell, knock.note);
      }
      for (const key of r.selected ?? []) if (viewer.cell(key)) viewer.setSelected(key, true);
      if (r.revealed) this.#reveal([state]);
      if (state.found.size === round.answers.length && state.tools) state.tools.hidden = false;
    }
    this.#updateCounters();
  }

  lock(locked: boolean): void {
    for (const s of this.#rounds) s.viewer.setDisabled(locked);
  }

  reset(): void {
    for (const s of this.#rounds) {
      s.viewer.clearSelection();
      s.viewer.clearMarks();
      s.viewer.clearNotes();
      s.found.clear();
      s.fine.clear();
      s.knock.clear();
      s.revealed = false;
      if (s.tools) s.tools.hidden = true;
    }
    this.#updateCounters();
  }

  focusFirst(): void {
    this.#rounds[0]?.viewer.focusCell();
  }
}

/** Card hooks for a spot-the-error question (`isQuiz` drops the retry advice). */
export function spotHooks(question: SpotQuestion, isQuiz: () => boolean = () => false): CardHooks {
  const unit = question.data.rounds.every((r) => r.granularity === "field") ? "field" : "line";
  return {
    check: () => {
      if (!question.hasAnswer()) {
        return { result: "incomplete", message: `Select the ${unit} you think is wrong first.` };
      }
      const { wrong } = question.commit();
      const total = question.total;
      const found = question.foundCount;
      if (found === total) {
        return {
          result: "correct",
          message: total === 1 ? "You found the error." : `You found all ${total} errors.`,
        };
      }
      const fine =
        wrong && !isQuiz()
          ? " What you picked that is fine stays marked, so you need not check it again."
          : "";
      return { result: "incorrect", message: `Errors found: ${found} of ${total}.${fine}` };
    },
    reveal: () => {
      question.revealAll();
      return { message: "Every error is marked, with the rule it breaks." };
    },
    reset: () => question.reset(),
    restore: (record) => question.setValue(record.answer),
    answer: () => question.value(),
    lock: (locked) => question.lock(locked),
    hasAnswer: () => question.hasAnswer(),
    focusFirst: () => question.focusFirst(),
  };
}
