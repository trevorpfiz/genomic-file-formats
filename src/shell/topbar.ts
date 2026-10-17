// The mobile and tablet top bar (ux 10.3; docs/PLAN.md 10.1), shown below 1080px: a button with
// the list icon and "4/22 · <current H2>" that opens a modal sheet, and the theme icon button.
// The sheet is a <dialog> opened with showModal() (the page behind is inert), with two APG tabs,
// "On this page" and "Course outline". Esc, Close or a tap on the backdrop closes it and focus
// returns to the bar button; choosing an item closes it, then scrolls or navigates.
import type { CourseModel } from "./course-model.ts";
import { h, iconSpan } from "./dom.ts";
import { icon } from "./icons.ts";
import { renderOutline } from "./outline.ts";
import type { ProgressState } from "./progress-types.ts";
import { themeMenu } from "./theme.ts";

export interface TopbarOptions {
  model: CourseModel;
  state: ProgressState;
  /** "4/22" on lessons; dropped below 360px. */
  count?: string;
  /** The page title, replaced by the active H2 as the learner scrolls. */
  text: string;
  /** The sheet's heading: "Lesson 4 of 22", "Course overview". */
  sheetTitle: string;
  currentId?: string;
  /** The sheet's copy of the TOC (its own id prefix), or null. */
  toc: HTMLElement | null;
  tocItems: number;
}

export interface Topbar {
  bar: HTMLElement;
  sheet: HTMLDialogElement;
  setText(text: string): void;
}

export function renderTopbar(options: TopbarOptions): Topbar {
  const text = h("span", { class: "topbar-current" }, options.text);
  const open = h(
    "button",
    { type: "button", class: "topbar-menu", "aria-haspopup": "dialog", "aria-controls": "nav-sheet" },
    iconSpan("list"),
    h(
      "span",
      { class: "topbar-label" },
      options.count ? h("span", { class: "topbar-count" }, `${options.count} · `) : null,
      text,
      h("span", { class: "visually-hidden" }, ", course navigation"),
    ),
    iconSpan("chevron-down", "gf-icon topbar-chevron"),
  );
  const bar = h("div", { class: "topbar-inner" }, open, themeMenu("topbar-theme", "icon"));

  const outline = renderOutline(options.model, options.state, {
    idPrefix: "sheet-outline",
    currentId: options.currentId,
    variant: "panel",
  });
  const close = h("button", { type: "button", class: "sheet-close", "aria-label": "Close" });
  close.innerHTML = icon("x");
  const titleId = "nav-sheet-title";
  const inner = h("div", { class: "sheet-inner" });
  inner.append(
    h(
      "div",
      { class: "sheet-header" },
      h("p", { class: "sheet-title", id: titleId }, options.sheetTitle),
      close,
    ),
  );

  const tabs: { tab: HTMLButtonElement; panel: HTMLElement }[] = [];
  if (options.toc) {
    const tablist = h("div", { class: "sheet-tabs", role: "tablist", "aria-label": "Navigation" });
    const panels: [string, HTMLElement][] = [
      ["On this page", options.toc],
      ["Course outline", outline],
    ];
    panels.forEach(([label, content], i) => {
      const tab = h("button", {
        type: "button",
        role: "tab",
        id: `sheet-tab-${i}`,
        class: "sheet-tab",
        "aria-controls": `sheet-panel-${i}`,
      });
      tab.textContent = label;
      const panel = h(
        "div",
        { role: "tabpanel", id: `sheet-panel-${i}`, class: "sheet-panel", "aria-labelledby": tab.id },
        content,
      );
      tablist.append(tab);
      tabs.push({ tab, panel });
    });
    inner.append(tablist, ...tabs.map((t) => t.panel));
  } else {
    inner.append(h("div", { class: "sheet-panel" }, outline));
  }
  const select = (index: number, focus = false) => {
    tabs.forEach(({ tab, panel }, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panel.hidden = i !== index;
    });
    if (focus) tabs[index]?.tab.focus();
  };
  tabs.forEach(({ tab }, i) => {
    tab.addEventListener("click", () => select(i));
    tab.addEventListener("keydown", (event) => {
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select((next + tabs.length) % tabs.length, true);
    });
  });
  const defaultTab = options.tocItems >= 2 ? 0 : 1;
  select(defaultTab);

  const sheet = h("dialog", { class: "sheet", id: "nav-sheet", "aria-labelledby": titleId }, inner);
  const modal = typeof sheet.showModal === "function";
  const closeSheet = () => {
    if (!sheet.open) return;
    if (modal) sheet.close();
    else {
      sheet.removeAttribute("open");
      open.focus();
    }
  };
  open.addEventListener("click", () => {
    if (modal) sheet.showModal();
    else sheet.setAttribute("open", "");
    (tabs.length ? tabs.find((t) => t.tab.tabIndex === 0)?.tab : close)?.focus();
  });
  close.addEventListener("click", closeSheet);
  // Return focus to the bar button, unless an item chosen in the sheet has already moved it.
  sheet.addEventListener("close", () => {
    const active = document.activeElement;
    if (!active || active === document.body || sheet.contains(active)) open.focus();
  });
  // A click on the dialog element itself is a click on the backdrop (the content is .sheet-inner).
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) closeSheet();
    else if ((event.target as Element).closest("a[href]")) closeSheet();
  });
  sheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal) closeSheet();
  });

  return { bar, sheet, setText: (value) => (text.textContent = value) };
}
