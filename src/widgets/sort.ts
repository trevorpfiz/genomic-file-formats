// gf-sort (docs/PLAN.md 7.3; ux 8.8): place items into labelled bins. Three ways to move an item,
// so dragging is never required (WCAG 2.5.7):
//   - drag from the grip handle (4 px threshold; dropping outside a bin or Esc cancels);
//   - the handle as a button: Space or Enter picks the item up, arrow keys choose a bin, Enter
//     drops, Esc cancels; with a pointer, select the handle, then a bin's "Move here" button;
//   - a "Place in" select on each item: the primary control below 600 px and whenever a sort
//     has more than 4 bins.
// Moves are announced in the card's live region. Check grades only when every item is placed:
// correct items lock, wrong ones go back to Unsorted marked "Belongs elsewhere"; each item has a
// "Why?" disclosure once it is settled. The ordered variant uses Move up and Move down (and
// Alt+Arrow keys); the matrix variant is a table with one select per row.
import type { SortExercise, SortItem } from "../exercises/types.ts";
import { icon, type IconName } from "../shell/icons.ts";
import {
  ExerciseCard,
  resolveExercise,
  type CardHooks,
  type CheckOutcome,
  type ExerciseHost,
} from "./card.ts";
import { button, el, uid } from "./dom.ts";
import { composeHooks, followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { inlineNodes } from "./inline.ts";
import { renderSnippet } from "./snippet-viewer.ts";

type ItemState = "placed" | "correct" | "incorrect" | "shown";

const plain = (text: string) =>
  text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/\^\{([^}]*)\}/g, "^$1");

/** An item's accessible name: its label, its text, or "Item 3". */
export function itemLabel(item: SortItem, index: number): string {
  if (item.label) return item.label;
  if (typeof item.content === "string") return plain(item.content);
  return `Item ${index + 1}`;
}

function itemContent(doc: Document, item: SortItem): HTMLElement {
  const box = el(doc, "div", "sort-item-content");
  if (typeof item.content === "string") box.append(inlineNodes(item.content, doc));
  else box.append(renderSnippet(item.content, { compact: true }));
  return box;
}

function option(doc: Document, label: string, value: string): HTMLOptionElement {
  const node = el(doc, "option", "", label);
  node.value = value;
  return node;
}

function why(doc: Document, item: SortItem): HTMLDetailsElement {
  const details = el(doc, "details", "sort-why");
  details.append(el(doc, "summary", "", "Why?"));
  const p = el(doc, "p");
  p.append(inlineNodes(item.why, doc));
  details.append(p);
  if (item.toolsSay) {
    const tools = el(doc, "p", "sort-tools");
    tools.append(inlineNodes(item.toolsSay, doc));
    details.append(tools);
  }
  details.hidden = true;
  return details;
}

const BADGES: Record<Exclude<ItemState, "placed">, { text: string; icon: IconName }> = {
  correct: { text: "Correct", icon: "circle-check" },
  incorrect: { text: "Belongs elsewhere", icon: "circle-x" },
  shown: { text: "Shown", icon: "eye" },
};

function setBadge(badge: HTMLElement, state: ItemState, extra = ""): void {
  if (state === "placed") {
    badge.hidden = true;
    badge.replaceChildren();
    return;
  }
  const b = BADGES[state];
  badge.dataset.state = state;
  badge.innerHTML = icon(b.icon);
  badge.append(" ", `${b.text}${extra}`);
  badge.hidden = false;
}

/** A deterministic shuffle (for the ordered variant's starting order). */
function seededOrder(ids: string[], seed: string): string[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  if (out.length > 1 && out.every((id, i) => id === ids[i])) out.push(out.shift()!);
  return out;
}

interface SortView {
  element: HTMLElement;
  hooks: CardHooks;
}

// ---------------------------------------------------------------------------------------------
// Bins

class BinsSort implements SortView {
  readonly element: HTMLDivElement;
  readonly hooks: CardHooks;
  #doc: Document;
  #ex: SortExercise;
  #card: () => ExerciseCard | undefined;
  #zones: {
    id: string;
    label: string;
    root: HTMLElement;
    list: HTMLUListElement;
    count: HTMLElement;
    here: HTMLButtonElement;
  }[] = [];
  #items = new Map<
    string,
    {
      item: SortItem;
      index: number;
      li: HTMLLIElement;
      handle: HTMLButtonElement;
      select: HTMLSelectElement;
      badge: HTMLElement;
      why: HTMLDetailsElement;
    }
  >();
  #place = new Map<string, string>();
  #state = new Map<string, ItemState>();
  #picked: string | null = null;
  #target = 0;
  #locked = false;
  #suppressClick = false;
  #instructions: string;

  constructor(doc: Document, ex: SortExercise, card: () => ExerciseCard | undefined) {
    this.#doc = doc;
    this.#ex = ex;
    this.#card = card;
    const root = el(doc, "div", "sort");
    root.dataset.variant = "bins";
    if (ex.bins.length > 4) root.dataset.select = "always";
    this.#instructions = uid("sort-help");
    const help = el(
      doc,
      "p",
      "visually-hidden",
      "Press Space or Enter to pick up, arrow keys to choose a bin, Enter to drop, Escape to cancel.",
    );
    help.id = this.#instructions;
    root.append(help);

    const pool = this.#zone("", "Unsorted", "sort-pool");
    const bins = el(doc, "div", "sort-bins");
    for (const bin of ex.bins) bins.append(this.#zone(bin.id, bin.label, "sort-bin").root);
    root.append(pool.root, bins);
    ex.items.forEach((item, index) => this.#addItem(item, index));
    this.element = root;
    this.#refresh();
    this.hooks = this.#hooks();
  }

  #zone(id: string, label: string, className: string) {
    const doc = this.#doc;
    const root = el(doc, "section", `sort-zone ${className}`);
    root.dataset.bin = id;
    const title = el(doc, "p", "sort-zone-title");
    title.id = uid("sort-zone");
    const count = el(doc, "span", "sort-count");
    title.append(el(doc, "span", "sort-zone-label", label), " ", count);
    root.setAttribute("aria-labelledby", title.id);
    const here = button(
      doc,
      id ? `Move here: ${label}` : "Move back to Unsorted",
      "button-secondary sort-move-here",
      () => this.#dropPicked(id),
    );
    here.hidden = true;
    const list = el(doc, "ul", "sort-list");
    list.setAttribute("aria-labelledby", title.id);
    const empty = el(doc, "p", "sort-empty", id ? "Drop here" : "All items are placed.");
    root.append(title, here, list, empty);
    const zone = { id, label, root, list, count, here };
    this.#zones.push(zone);
    return zone;
  }

  #addItem(item: SortItem, index: number): void {
    const doc = this.#doc;
    const li = el(doc, "li", "sort-item");
    li.dataset.item = item.id;
    const row = el(doc, "div", "sort-item-row");
    const handle = el(doc, "button", "sort-handle");
    handle.type = "button";
    handle.innerHTML = icon("grip-vertical");
    handle.setAttribute("aria-pressed", "false");
    handle.setAttribute("aria-describedby", this.#instructions);
    row.append(handle, itemContent(doc, item));
    const foot = el(doc, "div", "sort-item-foot");
    const place = el(doc, "label", "sort-place");
    const select = el(doc, "select");
    select.append(option(doc, "Unsorted", ""), ...this.#ex.bins.map((b) => option(doc, b.label, b.id)));
    place.append(el(doc, "span", "", "Place in"), " ", select);
    const badge = el(doc, "span", "sort-badge");
    badge.hidden = true;
    foot.append(place, badge);
    const details = why(doc, item);
    li.append(row, foot, details);
    this.#items.set(item.id, { item, index, li, handle, select, badge, why: details });
    this.#state.set(item.id, "placed");

    handle.addEventListener("click", () => this.#onHandleClick(item.id));
    handle.addEventListener("keydown", (event) => this.#onHandleKey(event, item.id));
    handle.addEventListener("pointerdown", (event) => this.#onPointerDown(event, item.id));
    select.addEventListener("change", () => this.#move(item.id, select.value, true));
    li.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "button, select, label, summary, details, a, input, [tabindex], .snippet-viewer, .hex-viewer, .compressed-text-viewer",
        )
      )
        return;
      this.#onHandleClick(item.id);
    });
    this.#zones[0]!.list.append(li);
  }

  #zoneOf(id: string) {
    return this.#zones.find((z) => z.id === (this.#place.get(id) ?? ""))!;
  }

  #lockedItem(id: string): boolean {
    const s = this.#state.get(id);
    return this.#locked || s === "correct" || s === "shown";
  }

  #say(text: string): void {
    this.#card()?.announce(text);
  }

  // Picking up, moving and dropping.

  #onHandleClick(id: string): void {
    if (this.#suppressClick) {
      this.#suppressClick = false;
      return;
    }
    if (this.#lockedItem(id)) return;
    if (this.#picked === id) {
      const target = this.#zones[this.#target]!;
      if (target.id !== (this.#place.get(id) ?? "")) this.#dropPicked(target.id);
      else {
        this.#unpick();
        this.#say("Move cancelled.");
      }
      return;
    }
    this.#pick(id);
  }

  #pick(id: string): void {
    this.#unpick();
    this.#picked = id;
    this.#target = this.#zones.indexOf(this.#zoneOf(id));
    const entry = this.#items.get(id)!;
    entry.handle.setAttribute("aria-pressed", "true");
    entry.li.dataset.picked = "";
    this.element.dataset.picking = "";
    for (const zone of this.#zones) zone.here.hidden = zone === this.#zoneOf(id);
    this.#markTarget();
    this.#say(
      `Picked up: ${itemLabel(entry.item, entry.index)}. Use the arrow keys to choose a bin, then press Enter to drop it, or Escape to cancel.`,
    );
  }

  #unpick(): void {
    if (!this.#picked) return;
    const entry = this.#items.get(this.#picked);
    entry?.handle.setAttribute("aria-pressed", "false");
    if (entry) delete entry.li.dataset.picked;
    this.#picked = null;
    delete this.element.dataset.picking;
    for (const zone of this.#zones) {
      zone.here.hidden = true;
      delete zone.root.dataset.target;
    }
  }

  #markTarget(): void {
    this.#zones.forEach((zone, i) => {
      if (i === this.#target && this.#picked) zone.root.dataset.target = "";
      else delete zone.root.dataset.target;
    });
  }

  #onHandleKey(event: KeyboardEvent, id: string): void {
    if (this.#picked !== id) return;
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (step) {
      event.preventDefault();
      const n = this.#zones.length;
      this.#target = (this.#target + step + n) % n;
      this.#markTarget();
      const zone = this.#zones[this.#target]!;
      const count = this.#countIn(zone.id);
      this.#say(`${zone.id ? `${zone.label} bin` : "Unsorted"}, ${count} ${count === 1 ? "item" : "items"}.`);
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.#unpick();
      this.#say("Move cancelled.");
    }
  }

  #dropPicked(binId: string): void {
    const id = this.#picked;
    if (!id) return;
    this.#unpick();
    this.#move(id, binId, true);
    this.#items.get(id)!.handle.focus();
  }

  #countIn(binId: string): number {
    return [...this.#items.keys()].filter((id) => (this.#place.get(id) ?? "") === binId).length;
  }

  /**
   * Move an item to a bin ("" is Unsorted). A learner's move clears a "Belongs elsewhere" mark,
   * marks the card attempted and is announced; Check and Show answer move items silently.
   */
  #move(id: string, binId: string, user: boolean): void {
    const entry = this.#items.get(id)!;
    if (user && this.#lockedItem(id)) return;
    const focused = this.#doc.activeElement as HTMLElement | null;
    const hadFocus = focused !== null && entry.li.contains(focused);
    if (binId) this.#place.set(id, binId);
    else this.#place.delete(id);
    this.#zoneOf(id).list.append(entry.li);
    if (hadFocus) focused.focus();
    if (!user) {
      this.#refresh();
      return;
    }
    if (this.#state.get(id) === "incorrect") this.#setState(id, "placed");
    this.#refresh();
    this.#card()?.markAttempted();
    const left = this.#countIn("");
    const zone = this.#zoneOf(id);
    this.#say(
      `${zone.id ? `Placed in ${zone.label}` : "Moved back to Unsorted"}. ${left} ${left === 1 ? "item" : "items"} left unsorted.`,
    );
  }

  #setState(id: string, state: ItemState, extra = ""): void {
    const entry = this.#items.get(id)!;
    this.#state.set(id, state);
    entry.li.dataset.state = state;
    setBadge(entry.badge, state, extra);
    const locked = state === "correct" || state === "shown";
    entry.why.hidden = !(locked || (this.#locked && state !== "placed"));
    if (state === "shown") entry.why.open = true;
    this.#refresh();
  }

  #refresh(): void {
    for (const zone of this.#zones) {
      const n = this.#countIn(zone.id);
      zone.count.textContent = `· ${n}`;
      zone.root.toggleAttribute("data-empty", n === 0);
    }
    for (const [id, entry] of this.#items) {
      const zone = this.#zoneOf(id);
      const locked = this.#lockedItem(id);
      const where = zone.id ? `in ${zone.label}` : "in Unsorted";
      const suffix =
        this.#state.get(id) === "correct"
          ? ", correct, locked"
          : this.#state.get(id) === "shown"
            ? ", answer shown"
            : "";
      entry.handle.setAttribute(
        "aria-label",
        `Item ${entry.index + 1}: ${itemLabel(entry.item, entry.index)}, ${where}${suffix}`,
      );
      if (locked) entry.handle.setAttribute("aria-disabled", "true");
      else entry.handle.removeAttribute("aria-disabled");
      entry.select.disabled = locked;
      entry.select.value = this.#place.get(id) ?? "";
      entry.select.setAttribute(
        "aria-label",
        `Place in, for item ${entry.index + 1}: ${itemLabel(entry.item, entry.index)}`,
      );
    }
  }

  // Pointer drag from the grip handle.

  #onPointerDown(event: PointerEvent, id: string): void {
    if (event.button !== 0 || this.#lockedItem(id)) return;
    const doc = this.#doc;
    const handle = this.#items.get(id)!.handle;
    const start = { x: event.clientX, y: event.clientY };
    let ghost: HTMLElement | undefined;
    let over: HTMLElement | undefined;
    const zoneAt = (x: number, y: number) =>
      (doc.elementFromPoint?.(x, y) as HTMLElement | null)?.closest<HTMLElement>(".sort-zone") ?? undefined;
    const cleanup = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      doc.removeEventListener("keydown", escape, true);
      ghost?.remove();
      if (over) delete over.dataset.drop;
      delete this.#items.get(id)!.li.dataset.dragging;
    };
    const move = (e: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
        ghost = el(
          doc,
          "div",
          "sort-ghost",
          itemLabel(this.#items.get(id)!.item, this.#items.get(id)!.index),
        );
        ghost.setAttribute("aria-hidden", "true");
        doc.body.append(ghost);
        this.#items.get(id)!.li.dataset.dragging = "";
      }
      ghost.style.left = `${e.clientX + 8}px`;
      ghost.style.top = `${e.clientY + 8}px`;
      const zone = zoneAt(e.clientX, e.clientY);
      if (zone !== over) {
        if (over) delete over.dataset.drop;
        over = zone && this.element.contains(zone) ? zone : undefined;
        if (over) over.dataset.drop = "";
      }
      const win = doc.defaultView;
      if (win && e.clientY < 40) win.scrollBy(0, -12);
      else if (win && e.clientY > win.innerHeight - 40) win.scrollBy(0, 12);
    };
    const up = (e: PointerEvent) => {
      const dragged = Boolean(ghost);
      const zone = dragged ? zoneAt(e.clientX, e.clientY) : undefined;
      cleanup();
      if (!dragged) return;
      this.#suppressClick = true;
      setTimeout(() => (this.#suppressClick = false), 0);
      if (zone && this.element.contains(zone)) this.#move(id, zone.dataset.bin ?? "", true);
      else this.#say("Move cancelled.");
    };
    const cancel = () => cleanup();
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !ghost) return;
      e.preventDefault();
      cleanup();
      this.#suppressClick = true;
      this.#say("Move cancelled.");
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events in tests have no active pointer.
    }
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
    doc.addEventListener("keydown", escape, true);
  }

  // Card hooks.

  #hooks(): CardHooks {
    const ex = this.#ex;
    const quiz = () => this.#card()?.mode === "quiz";
    return {
      check: (): CheckOutcome => {
        this.#unpick();
        const left = this.#countIn("");
        if (left)
          return {
            result: "incomplete",
            message: `Place all items first: ${left} ${left === 1 ? "is" : "are"} still in Unsorted.`,
          };
        let right = 0;
        for (const [id, { item }] of this.#items) {
          if (this.#state.get(id) === "correct") {
            right += 1;
            continue;
          }
          if (this.#place.get(id) === item.bin) {
            right += 1;
            this.#setState(id, "correct");
          } else {
            if (!quiz()) this.#move(id, "", false);
            this.#setState(id, "incorrect");
          }
        }
        const n = this.#items.size;
        if (right === n) return { result: "correct", message: `All ${n} items are in the right bin.` };
        const wrong = n - right;
        return {
          result: "incorrect",
          message: quiz()
            ? `${right} of ${n} are in the right bin.`
            : `${right} of ${n} are in the right bin. The ${wrong === 1 ? "one" : wrong} marked Belongs elsewhere went back to Unsorted.`,
        };
      },
      reveal: () => {
        this.#unpick();
        for (const [id, { item }] of this.#items) {
          if (this.#state.get(id) === "correct") continue;
          const label = ex.bins.find((b) => b.id === item.bin)?.label ?? item.bin;
          if (quiz()) {
            this.#setState(
              id,
              this.#state.get(id) === "incorrect" ? "incorrect" : "shown",
              `: belongs in ${label}`,
            );
          } else {
            this.#move(id, item.bin, false);
            this.#setState(id, "shown");
          }
          this.#items.get(id)!.why.open = true;
        }
        for (const { why: details } of this.#items.values()) details.hidden = false;
        return { message: "Every item is in its bin, with why it belongs there." };
      },
      reset: () => {
        this.#unpick();
        this.#place.clear();
        for (const id of this.#items.keys()) {
          this.#state.set(id, "placed");
          const entry = this.#items.get(id)!;
          entry.li.dataset.state = "placed";
          setBadge(entry.badge, "placed");
          entry.why.hidden = true;
          entry.why.open = false;
          this.#zones[0]!.list.append(entry.li);
        }
        this.#refresh();
      },
      restore: (record) => {
        const saved = (record.answer ?? {}) as { placement?: Record<string, string>; correct?: string[] };
        for (const [id, bin] of Object.entries(saved.placement ?? {})) {
          if (!this.#items.has(id) || !ex.bins.some((b) => b.id === bin)) continue;
          this.#place.set(id, bin);
          this.#zoneOf(id).list.append(this.#items.get(id)!.li);
        }
        const complete = record.state === "correct" || record.state === "revealed";
        for (const [id, { item }] of this.#items) {
          if (saved.correct?.includes(id) && this.#place.get(id) === item.bin) this.#setState(id, "correct");
          else if (complete) {
            this.#place.set(id, item.bin);
            this.#zoneOf(id).list.append(this.#items.get(id)!.li);
            this.#setState(id, record.state === "correct" ? "correct" : "shown");
          }
        }
        this.#refresh();
      },
      answer: () => ({
        placement: Object.fromEntries(this.#place),
        correct: [...this.#state].filter(([, s]) => s === "correct").map(([id]) => id),
      }),
      lock: (locked) => {
        this.#locked = locked;
        if (locked) this.#unpick();
        this.#refresh();
      },
      hasAnswer: () => this.#countIn("") === 0,
      focusFirst: () => this.#items.values().next().value?.handle.focus(),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Ordered

class OrderedSort implements SortView {
  readonly element: HTMLOListElement;
  readonly hooks: CardHooks;
  #order: string[];
  #entries = new Map<
    string,
    {
      item: SortItem;
      index: number;
      li: HTMLLIElement;
      up: HTMLButtonElement;
      down: HTMLButtonElement;
      badge: HTMLElement;
      pos: HTMLElement;
      why: HTMLDetailsElement;
    }
  >();
  #locked = false;

  constructor(doc: Document, ex: SortExercise, card: () => ExerciseCard | undefined) {
    const list = el(doc, "ol", "sort-ordered");
    const key = ex.items.map((i) => i.id);
    this.#order = seededOrder(key, ex.id);
    ex.items.forEach((item, index) => {
      const li = el(doc, "li", "sort-item");
      li.dataset.item = item.id;
      const pos = el(doc, "span", "sort-pos");
      pos.setAttribute("aria-hidden", "true");
      const label = itemLabel(item, index);
      const up = button(doc, "Move up", "button-secondary sort-up", () => this.#shift(item.id, -1, card));
      const down = button(doc, "Move down", "button-secondary sort-down", () =>
        this.#shift(item.id, 1, card),
      );
      up.setAttribute("aria-label", `Move up: ${label}`);
      down.setAttribute("aria-label", `Move down: ${label}`);
      const badge = el(doc, "span", "sort-badge");
      badge.hidden = true;
      const row = el(doc, "div", "sort-item-row");
      const moves = el(doc, "span", "sort-moves");
      moves.append(up, down);
      row.append(pos, itemContent(doc, item), moves);
      const details = why(doc, item);
      li.append(row, badge, details);
      li.addEventListener("keydown", (event) => {
        if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
        event.preventDefault();
        this.#shift(item.id, event.key === "ArrowUp" ? -1 : 1, card);
      });
      this.#entries.set(item.id, { item, index, li, up, down, badge, pos, why: details });
    });
    this.element = list;
    this.#draw();
    this.hooks = {
      check: () => {
        let inPlace = 0;
        this.#order.forEach((id, i) => {
          const want = key.indexOf(id);
          const entry = this.#entries.get(id)!;
          if (want === i) {
            inPlace += 1;
            this.#badge(entry.badge, "circle-check", "In place", "correct");
          } else {
            this.#badge(
              entry.badge,
              "circle-x",
              want < i ? "Should come earlier" : "Should come later",
              "incorrect",
            );
          }
        });
        const n = key.length;
        return inPlace === n
          ? { result: "correct", message: `All ${n} items are in order.` }
          : { result: "incorrect", message: `${inPlace} of ${n} are in place.` };
      },
      reveal: () => {
        this.#order = [...key];
        this.#draw();
        for (const entry of this.#entries.values()) {
          if (entry.badge.dataset.state !== "correct") this.#badge(entry.badge, "eye", "Shown", "shown");
          entry.why.hidden = false;
          entry.why.open = true;
        }
        return { message: "The items are in order, with why each one goes where it does." };
      },
      reset: () => {
        this.#order = seededOrder(key, ex.id);
        for (const entry of this.#entries.values()) {
          entry.badge.hidden = true;
          entry.why.hidden = true;
          entry.why.open = false;
        }
        this.#draw();
      },
      restore: (record) => {
        const saved = Array.isArray(record.answer) ? record.answer.map(String) : [];
        if (saved.length === key.length && key.every((id) => saved.includes(id))) this.#order = saved;
        this.#draw();
        if (record.state === "correct" || record.state === "revealed") {
          for (const entry of this.#entries.values()) {
            entry.why.hidden = false;
            this.#badge(entry.badge, "circle-check", "In place", "correct");
          }
        }
      },
      answer: () => [...this.#order],
      lock: (locked) => {
        this.#locked = locked;
        this.#draw();
        if (locked) for (const entry of this.#entries.values()) entry.why.hidden = false;
      },
      hasAnswer: () => true,
      focusFirst: () => this.#entries.get(this.#order[0]!)?.down.focus(),
    };
  }

  #badge(badge: HTMLElement, iconName: IconName, text: string, state: string): void {
    badge.dataset.state = state;
    badge.innerHTML = icon(iconName);
    badge.append(" ", text);
    badge.hidden = false;
  }

  #shift(id: string, by: number, card: () => ExerciseCard | undefined): void {
    if (this.#locked) return;
    const i = this.#order.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= this.#order.length) return;
    const entry = this.#entries.get(id)!;
    const focused = this.element.ownerDocument.activeElement;
    [this.#order[i], this.#order[j]] = [this.#order[j]!, this.#order[i]!];
    for (const other of this.#entries.values()) other.badge.hidden = true;
    this.#draw();
    // Focus stays on the moved item: on the same button, or its other one at either end.
    if (entry.li.contains(focused)) {
      const same = focused === entry.up ? entry.up : entry.down;
      (same.disabled ? (same === entry.up ? entry.down : entry.up) : (focused as HTMLElement)).focus();
    }
    card()?.markAttempted();
    card()?.announce(
      `Moved ${itemLabel(entry.item, entry.index)} to position ${j + 1} of ${this.#order.length}.`,
    );
  }

  #draw(): void {
    this.#order.forEach((id, i) => {
      const entry = this.#entries.get(id)!;
      entry.pos.textContent = String(i + 1);
      entry.up.disabled = this.#locked || i === 0;
      entry.down.disabled = this.#locked || i === this.#order.length - 1;
      this.element.append(entry.li);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Matrix

class MatrixSort implements SortView {
  readonly element: HTMLDivElement;
  readonly hooks: CardHooks;

  constructor(doc: Document, ex: SortExercise, card: () => ExerciseCard | undefined) {
    const wrap = el(doc, "div", "sort-matrix-wrap");
    const table = el(doc, "table", "sort-matrix");
    table.append(el(doc, "caption", "visually-hidden", ex.title));
    const head = el(doc, "tr");
    for (const name of ["Item", "Place in", "Result"]) {
      const th = el(doc, "th", "", name);
      th.scope = "col";
      head.append(th);
    }
    const thead = el(doc, "thead");
    thead.append(head);
    const tbody = el(doc, "tbody");
    const rows = ex.items.map((item, index) => {
      const tr = el(doc, "tr");
      tr.dataset.item = item.id;
      const th = el(doc, "th");
      th.scope = "row";
      th.append(itemContent(doc, item));
      const select = el(doc, "select");
      select.append(option(doc, "Choose", ""), ...ex.bins.map((b) => option(doc, b.label, b.id)));
      select.setAttribute("aria-label", `Place in, for ${itemLabel(item, index)}`);
      select.addEventListener("change", () => {
        badge.hidden = true;
        card()?.markAttempted();
      });
      const result = el(doc, "td", "sort-matrix-result");
      const badge = el(doc, "span", "sort-badge");
      badge.hidden = true;
      const details = why(doc, item);
      result.append(badge, details);
      const td = el(doc, "td");
      td.append(select);
      tr.append(th, td, result);
      tbody.append(tr);
      return { item, select, badge, why: details, settled: false };
    });
    table.append(thead, tbody);
    wrap.append(table);
    this.element = wrap;
    const mark = (row: (typeof rows)[number], state: ItemState, extra = "") => {
      setBadge(row.badge, state, extra);
      row.why.hidden = state === "incorrect" && card()?.mode !== "quiz";
    };
    this.hooks = {
      check: () => {
        const empty = rows.filter((r) => !r.select.value).length;
        if (empty)
          return {
            result: "incomplete",
            message: `Choose a bin for every row first: ${empty} ${empty === 1 ? "is" : "are"} empty.`,
          };
        let right = 0;
        for (const row of rows) {
          if (row.select.value === row.item.bin) {
            right += 1;
            row.settled = true;
            row.select.disabled = true;
            mark(row, "correct");
          } else mark(row, "incorrect");
        }
        return right === rows.length
          ? { result: "correct", message: `All ${rows.length} rows are right.` }
          : { result: "incorrect", message: `${right} of ${rows.length} rows are right.` };
      },
      reveal: () => {
        for (const row of rows) {
          if (row.settled) continue;
          const label = ex.bins.find((b) => b.id === row.item.bin)?.label ?? row.item.bin;
          if (card()?.mode === "quiz") mark(row, "incorrect", `: belongs in ${label}`);
          else {
            row.select.value = row.item.bin;
            mark(row, "shown");
          }
          row.why.hidden = false;
          row.why.open = true;
        }
        return { message: "Every row shows its answer, with why." };
      },
      reset: () => {
        for (const row of rows) {
          row.select.value = "";
          row.settled = false;
          row.select.disabled = false;
          mark(row, "placed");
          row.why.hidden = true;
          row.why.open = false;
        }
      },
      restore: (record) => {
        const saved = (record.answer ?? {}) as Record<string, string>;
        const complete = record.state === "correct" || record.state === "revealed";
        for (const row of rows) {
          row.select.value = complete ? row.item.bin : (saved[row.item.id] ?? "");
          if (complete) mark(row, record.state === "correct" ? "correct" : "shown");
        }
      },
      answer: () => Object.fromEntries(rows.map((r) => [r.item.id, r.select.value])),
      lock: (locked) => {
        for (const row of rows) row.select.disabled = locked || row.settled;
      },
      hasAnswer: () => rows.every((r) => r.select.value),
      focusFirst: () => rows[0]?.select.focus(),
    };
  }
}

// ---------------------------------------------------------------------------------------------

export class SortElement extends HTMLElement {
  data?: SortExercise;
  card?: ExerciseCard<SortExercise>;

  connectedCallback(): void {
    if (this.card) return;
    const exercise = resolveExercise(this as ExerciseHost, "sort");
    if (!exercise) return;
    const doc = this.ownerDocument;
    let card: ExerciseCard<SortExercise> | undefined;
    let followUps: FollowUpSet | undefined;
    const getCard = () => card;
    const view: SortView = exercise.ordered
      ? new OrderedSort(doc, exercise, getCard)
      : exercise.matrix
        ? new MatrixSort(doc, exercise, getCard)
        : new BinsSort(doc, exercise, getCard);
    const howTo = exercise.ordered
      ? "Put the items in order with Move up and Move down (or Alt with the arrow keys), then select Check."
      : exercise.matrix
        ? "Choose where each row belongs, then select Check."
        : undefined;
    card = new ExerciseCard(
      this,
      exercise,
      composeHooks(view.hooks, () => followUps),
      howTo ? { howTo: exercise.howTo ?? howTo } : {},
    );
    this.card = card;
    card.body.append(view.element);
    followUps = followUpsFor(card, exercise.followUps);
    card.ready();
  }
}

if (!customElements.get("gf-sort")) customElements.define("gf-sort", SortElement);
