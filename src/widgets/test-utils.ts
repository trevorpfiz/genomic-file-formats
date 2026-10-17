// Helpers for the widget DOM tests (happy-dom). Not imported by shipped code.
import { vi } from "vite-plus/test";
import type { SolvedDetail, StateChangeDetail } from "../exercises/types.ts";
import type { ExerciseCard } from "./card.ts";

export type Host<T = object> = HTMLElement & { data?: T; card?: ExerciseCard };

/** Create a widget element with injected data, as the quiz page does, and watch its events. */
export function mount<T extends object>(tag: string, data: T, attrs: Record<string, string> = {}) {
  const solved = vi.fn<(detail: SolvedDetail) => void>();
  const changes: StateChangeDetail[] = [];
  document.body.addEventListener("gf:solved", (e) => solved((e as CustomEvent<SolvedDetail>).detail));
  document.body.addEventListener("gf:statechange", (e) =>
    changes.push((e as CustomEvent<StateChangeDetail>).detail),
  );
  const host = document.createElement(tag) as Host<T>;
  for (const [k, v] of Object.entries(attrs)) host.setAttribute(k, v);
  host.data = data;
  document.body.append(host);
  return { host, solved, changes, ...queries(host) };
}

export function queries(root: HTMLElement) {
  const q = <E extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<E>(selector);
  const qa = <E extends HTMLElement = HTMLElement>(selector: string) => [
    ...root.querySelectorAll<E>(selector),
  ];
  /** A card action by its visible text (Check, Reset, Hint, Show answer, ...). */
  const action = (name: string) =>
    qa<HTMLButtonElement>(":scope > .card-actions button").find((b) => b.textContent?.trim() === name);
  const buttonNamed = (name: string) =>
    qa<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === name);
  const verdict = () => q(":scope > .card-feedback .card-verdict")?.textContent?.trim();
  const live = () => q(":scope > .card-live")?.textContent;
  return { q, qa, action, buttonNamed, verdict, live };
}

/** Dispatch a keydown (bubbling) on an element. */
export function press(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

/** Set a form control's value and fire input and change, as typing would. */
export function type(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  control.value = value;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Check a radio or checkbox as a click would, firing change. */
export function choose(input: HTMLInputElement, checked = true): void {
  input.checked = checked;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
