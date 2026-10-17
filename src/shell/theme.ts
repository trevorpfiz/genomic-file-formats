// Theme control (docs/PLAN.md 10.3; ux 6.5): System, Light or Dark. The inline script in
// index.html applies a saved Light or Dark before first paint (no flash); System removes
// `data-theme` so the CSS follows `prefers-color-scheme`. The choice is stored under THEME_KEY,
// apart from progress, and other open pages follow it through the storage event.
//
// Three forms: a menu button in the aside ("Theme: System"), an icon button in the mobile top
// bar (sun, moon or monitor; accessible name "Theme: System"), and a segmented radio group on
// the home and About pages. Every control on the page stays in step.
import { radioMenu, type RadioMenuItem } from "../ui/menu-button.ts";
import { h } from "./dom.ts";
import { icon } from "./icons.ts";
import { THEME_KEY } from "./progress-types.ts";
import { readItem, removeItem, writeItem, type StorageLike } from "./storage.ts";

export { THEME_KEY };

export type ThemeChoice = "system" | "light" | "dark";

export const THEME_ITEMS: readonly RadioMenuItem<ThemeChoice>[] = [
  { value: "system", label: "System", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

const EVENT = "gf:themechange";
let storage: StorageLike | null = null;

const isChoice = (v: unknown): v is ThemeChoice => v === "system" || v === "light" || v === "dark";

export function themeChoice(): ThemeChoice {
  const set = document.documentElement.dataset.theme;
  return set === "light" || set === "dark" ? set : "system";
}

const labelOf = (choice: ThemeChoice) => THEME_ITEMS.find((i) => i.value === choice)?.label ?? "System";

/** Apply a choice to this page (and remember it when `persist`). */
export function setTheme(choice: ThemeChoice, persist = true): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
  if (persist) {
    if (choice === "system") removeItem(storage, THEME_KEY);
    else writeItem(storage, THEME_KEY, choice);
  }
  document.dispatchEvent(new CustomEvent<ThemeChoice>(EVENT, { detail: choice }));
}

/** Once at boot: the storage used for the choice, and other pages' changes. */
export function initTheme(win: Window, store: StorageLike | null): void {
  storage = store;
  const saved = readItem(storage, THEME_KEY);
  if (isChoice(saved) && saved !== themeChoice()) setTheme(saved, false);
  win.addEventListener("storage", (event) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    const next = event.key === null ? null : event.newValue;
    setTheme(isChoice(next) ? next : "system", false);
  });
}

/**
 * The live controls, one per placement (its id prefix): a control built for a new route
 * replaces the previous route's, so the shell rebuilding the aside and the sheet on every
 * navigation never piles up listeners or keeps detached pages alive. One document listener
 * updates them all.
 */
const controls = new Map<string, { element: HTMLElement; update: (choice: ThemeChoice) => void }>();
let listening = false;

/** Keep a control in step with the current choice while it is in the document. */
function follow(key: string, element: HTMLElement, update: (choice: ThemeChoice) => void): void {
  controls.set(key, { element, update });
  if (listening) return;
  listening = true;
  document.addEventListener(EVENT, (event) => {
    const choice = (event as CustomEvent<ThemeChoice>).detail;
    for (const [id, control] of controls) {
      if (control.element.isConnected) control.update(choice);
      else controls.delete(id);
    }
  });
}

/** How many theme controls are tracked (tests). */
export const trackedThemeControls = (): number => controls.size;

/** "Theme: System" menu button (aside), or the icon-only form (top bar). */
export function themeMenu(idPrefix: string, variant: "aside" | "icon"): HTMLElement {
  const menu = radioMenu<ThemeChoice>({
    idPrefix,
    items: THEME_ITEMS,
    value: themeChoice(),
    menuLabel: "Theme",
    className: `theme-menu theme-menu-${variant}`,
    renderButton: (button, item) => {
      if (variant === "icon") {
        button.innerHTML = icon(item.icon ?? "monitor");
        button.setAttribute("aria-label", `Theme: ${item.label}`);
      } else {
        button.innerHTML = `${icon(item.icon ?? "monitor")}<span>Theme: ${item.label}</span>${icon("chevron-down", { className: "menu-button-chevron" })}`;
      }
    },
    onChange: (choice) => setTheme(choice),
  });
  follow(idPrefix, menu.element, (choice) => menu.set(choice));
  return menu.element;
}

/** A visible segmented radio group (home and About). */
export function themeRadios(idPrefix: string): HTMLElement {
  const current = themeChoice();
  const group = h(
    "fieldset",
    { class: "segmented", id: idPrefix },
    h("legend", { class: "segmented-legend" }, "Theme"),
    h(
      "div",
      { class: "segmented-options" },
      THEME_ITEMS.map((item) => {
        const input = h("input", {
          type: "radio",
          name: `${idPrefix}-choice`,
          value: item.value,
          id: `${idPrefix}-${item.value}`,
          checked: item.value === current,
          onchange: () => setTheme(item.value),
        });
        const label = h("label", { for: input.id, class: "segmented-option" });
        label.innerHTML = icon(item.icon ?? "monitor");
        label.append(item.label);
        return [input, label];
      }),
    ),
  );
  follow(idPrefix, group, (choice) => {
    for (const input of group.querySelectorAll<HTMLInputElement>("input"))
      input.checked = input.value === choice;
  });
  return group;
}

export const themeLabel = labelOf;
