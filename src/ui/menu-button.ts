// A menu button with radio items (WAI-ARIA APG "menu button" and "menuitemradio"), used by the
// theme control in the aside and the top bar (ux 6.5). Keyboard: Enter, Space or Down opens
// the menu on the checked item, Up opens it on the last; in the menu, Up and Down move (and
// wrap), Home and End jump, Enter or Space chooses, Esc closes and returns focus to the button,
// Tab closes. A click outside closes it.
import { icon, type IconName } from "../shell/icons.ts";

export interface RadioMenuItem<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
}

export interface RadioMenuOptions<V extends string> {
  items: readonly RadioMenuItem<V>[];
  value: V;
  /** Fills the button for the current value (label text, icon, accessible name). */
  renderButton: (button: HTMLButtonElement, item: RadioMenuItem<V>) => void;
  onChange: (value: V) => void;
  /** Accessible name of the menu ("Theme"). */
  menuLabel: string;
  className?: string;
  /** Prefix for element ids, unique per instance. */
  idPrefix: string;
}

export interface RadioMenu<V extends string> {
  element: HTMLElement;
  button: HTMLButtonElement;
  set(value: V): void;
  close(focusButton?: boolean): void;
}

export function radioMenu<V extends string>(options: RadioMenuOptions<V>): RadioMenu<V> {
  const doc = document;
  const root = doc.createElement("div");
  root.className = ["menu-button", options.className].filter(Boolean).join(" ");
  const button = doc.createElement("button");
  button.type = "button";
  button.id = `${options.idPrefix}-button`;
  button.className = "menu-button-trigger";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const menu = doc.createElement("ul");
  menu.id = `${options.idPrefix}-menu`;
  menu.className = "menu-list";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", options.menuLabel);
  menu.hidden = true;
  button.setAttribute("aria-controls", menu.id);

  let value = options.value;
  const items = options.items.map((item) => {
    const li = doc.createElement("li");
    li.setAttribute("role", "menuitemradio");
    li.tabIndex = -1;
    li.dataset.value = item.value;
    li.className = "menu-item";
    li.innerHTML = `${item.icon ? icon(item.icon) : ""}<span>${item.label}</span>${icon("check", { className: "menu-item-check" })}`;
    li.addEventListener("click", () => choose(item.value));
    menu.append(li);
    return li;
  });

  const render = () => {
    for (const li of items) li.setAttribute("aria-checked", String(li.dataset.value === value));
    const current = options.items.find((i) => i.value === value) ?? options.items[0]!;
    options.renderButton(button, current);
  };

  const isOpen = () => !menu.hidden;
  const open = (focus: "checked" | "first" | "last" = "checked") => {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const checked = items.findIndex((li) => li.dataset.value === value);
    const index = focus === "last" ? items.length - 1 : focus === "first" ? 0 : Math.max(0, checked);
    items[index]?.focus();
    doc.addEventListener("pointerdown", onOutside, true);
  };
  const close = (focusButton = false) => {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    doc.removeEventListener("pointerdown", onOutside, true);
    if (focusButton) button.focus();
  };
  const onOutside = (event: Event) => {
    if (!root.contains(event.target as Node)) close();
  };
  const choose = (next: V) => {
    value = next;
    render();
    close(true);
    options.onChange(next);
  };

  button.addEventListener("click", () => (isOpen() ? close() : open()));
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      open("last");
    }
  });
  menu.addEventListener("keydown", (event) => {
    const index = items.indexOf(doc.activeElement as HTMLLIElement);
    const move = (to: number) => items[(to + items.length) % items.length]?.focus();
    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(items.length - 1);
        break;
      case "Enter":
      case " ": {
        const v = items[index]?.dataset.value as V | undefined;
        if (v !== undefined) choose(v);
        break;
      }
      case "Escape":
        close(true);
        break;
      case "Tab":
        close();
        return;
      default:
        return;
    }
    event.preventDefault();
  });

  render();
  root.append(button, menu);
  return {
    element: root,
    button,
    set(next: V) {
      value = next;
      render();
    },
    close,
  };
}
