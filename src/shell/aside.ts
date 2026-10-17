// The aside (ux 10.1-10.2; docs/PLAN.md 10.1): the lesson switcher card, then the in-page TOC,
// then the theme control. The switcher is a disclosure (APG): one button with aria-expanded; the
// card grows downward into the course outline and the TOC is hidden while it is open. Esc or a
// click outside collapses it and returns focus to the button; choosing a row navigates.
import type { CourseModel } from "./course-model.ts";
import { h, iconSpan } from "./dom.ts";
import { renderOutline } from "./outline.ts";
import { courseCounts } from "./progress-derived.ts";
import type { ProgressState } from "./progress-types.ts";
import { themeMenu } from "./theme.ts";

export interface SwitcherLabels {
  /** "Lesson 4 of 22 · Sequences", "Section quiz · Sequences", "Course overview". */
  overline: string;
  title: string;
}

/** The 2px course progress bar over the 30 outline items, with its text equivalent. */
export function progressBar(model: CourseModel, state: ProgressState): HTMLElement {
  const c = courseCounts(model, state);
  return h(
    "div",
    {
      class: "switcher-progress",
      role: "progressbar",
      "aria-label": "Course progress",
      "aria-valuemin": 0,
      "aria-valuemax": c.total,
      "aria-valuenow": c.done,
      "aria-valuetext": `${c.done} of ${c.total} items complete`,
      style: `--progress: ${c.total ? c.done / c.total : 0}`,
    },
    h("span", { class: "switcher-progress-fill" }),
  );
}

export function updateProgressBars(root: ParentNode, model: CourseModel, state: ProgressState): void {
  const c = courseCounts(model, state);
  for (const bar of root.querySelectorAll<HTMLElement>(".switcher-progress")) {
    bar.setAttribute("aria-valuenow", String(c.done));
    bar.setAttribute("aria-valuetext", `${c.done} of ${c.total} items complete`);
    bar.style.setProperty("--progress", String(c.total ? c.done / c.total : 0));
  }
}

export interface AsideOptions {
  model: CourseModel;
  state: ProgressState;
  labels: SwitcherLabels;
  currentId?: string;
  toc: HTMLElement | null;
}

export function renderAside(options: AsideOptions): HTMLElement {
  const panelId = "aside-outline";
  const button = h(
    "button",
    {
      type: "button",
      class: "switcher-toggle",
      "aria-expanded": "false",
      "aria-controls": panelId,
    },
    h(
      "span",
      { class: "switcher-text" },
      h("span", { class: "switcher-overline" }, options.labels.overline),
      h("span", { class: "switcher-title" }, options.labels.title),
    ),
    iconSpan("chevron-down", "gf-icon switcher-chevron"),
  );
  const panel = h(
    "div",
    { class: "switcher-panel", id: panelId, hidden: true },
    renderOutline(options.model, options.state, {
      idPrefix: "aside-outline",
      currentId: options.currentId,
      variant: "panel",
    }),
  );
  const card = h("div", { class: "switcher" }, button, progressBar(options.model, options.state), panel);
  const inner = h(
    "div",
    { class: "aside-inner" },
    card,
    options.toc,
    h("div", { class: "aside-theme" }, themeMenu("aside-theme", "aside")),
  );

  const isOpen = () => button.getAttribute("aria-expanded") === "true";
  const setOpen = (open: boolean, focusButton = false) => {
    button.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    inner.classList.toggle("is-expanded", open);
    if (open) {
      document.addEventListener("pointerdown", onOutside, true);
      // Scroll the current row to the middle of the panel, without scrolling the page.
      const current = panel.querySelector<HTMLElement>('[aria-current="page"]');
      if (current) {
        const top = current.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
        panel.scrollTop = top - panel.clientHeight / 2;
      }
    } else {
      document.removeEventListener("pointerdown", onOutside, true);
      if (focusButton) button.focus();
    }
  };
  const onOutside = (event: Event) => {
    if (!card.isConnected) return document.removeEventListener("pointerdown", onOutside, true);
    if (!card.contains(event.target as Node)) setOpen(false);
  };
  button.addEventListener("click", () => setOpen(!isOpen()));
  card.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen()) {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  panel.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a[href]")) setOpen(false);
  });
  return inner;
}
