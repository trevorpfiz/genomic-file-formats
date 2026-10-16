// Shared helpers for exercise cards (docs/PLAN.md section 7): lookup, visible errors, the
// "QUICK CHECK · TYPE" overline and the one bubbling `gf:solved` event.
import { getExercise } from "../exercises/registry.ts";
import type { Exercise, Kind, SolvedDetail } from "../exercises/types.ts";

/** Look up the exercise named by the host's `exercise` attribute, or render a visible error. */
export function resolveExercise<K extends Kind>(
  host: HTMLElement,
  kind: K,
): Extract<Exercise, { kind: K }> | null {
  const id = host.getAttribute("exercise") ?? "";
  const exercise = getExercise(id);
  if (exercise?.kind === kind) return exercise as Extract<Exercise, { kind: K }>;
  const error = document.createElement("p");
  error.className = "widget-error";
  error.setAttribute("role", "alert");
  error.textContent = exercise
    ? `Exercise "${id}" is a ${exercise.kind}, not a ${kind}.`
    : `Missing ${kind} exercise "${id}".`;
  host.replaceChildren(error);
  return null;
}

/** A Quick check gets a non-heading overline above its compiled H3 title. */
export function addOverline(host: HTMLElement, type: string): void {
  if (host.dataset.mode !== "quick-check") return;
  const overline = document.createElement("p");
  overline.className = "overline";
  overline.textContent = `Quick check · ${type}`;
  host.prepend(overline);
}

/** Fire `gf:solved` once per element. */
export function announceSolved(host: HTMLElement, detail: SolvedDetail): void {
  if (host.hasAttribute("solved")) return;
  host.setAttribute("solved", detail.state);
  host.dispatchEvent(new CustomEvent<SolvedDetail>("gf:solved", { bubbles: true, detail }));
}
