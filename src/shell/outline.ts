// The course outline (ux 10.1; docs/PLAN.md 10.1): sections, each with its rows and a status
// icon per row (never colour alone: icon plus visually hidden text), the "Passed" pill on quiz
// rows, "Capstone and conclusion", then the completion badge row (locked until earned).
// Planned items (not built yet) show as muted rows without a link.
//
// Used in three places: the switcher panel in the aside, the mobile sheet, and the home page
// (always expanded, with minutes). `refreshOutline` updates statuses in place, so a progress
// change never moves focus.
import type { CourseModel, OutlineEntry } from "./course-model.ts";
import { minutesLabel } from "./course-model.ts";
import { h, iconSpan, srOnly } from "./dom.ts";
import type { IconName } from "./icons.ts";
import { badgeEarned, itemStatus, quizInfo, type ItemStatus } from "./progress-derived.ts";
import type { ProgressState } from "./progress-types.ts";

export interface OutlineOptions {
  /** Prefix for element ids (each copy of the outline needs its own). */
  idPrefix: string;
  /** The page being shown: its row gets aria-current="page". */
  currentId?: string;
  /** Home page variant: minutes on every row and section anchors. */
  variant: "panel" | "home";
}

const STATUS: Record<ItemStatus, { icon: IconName; text: string }> = {
  planned: { icon: "circle-dashed", text: "not built yet" },
  "not-started": { icon: "circle", text: "not started" },
  "in-progress": { icon: "circle-dot-dashed", text: "in progress" },
  complete: { icon: "circle-check", text: "complete" },
};

function rowTitle(entry: OutlineEntry): string {
  return entry.kind === "quiz" ? "Section quiz" : entry.title;
}

/** The status icon, hidden status text and right-hand extras of a row. */
function statusParts(entry: OutlineEntry, state: ProgressState): { status: ItemStatus; parts: Node[] } {
  const status = itemStatus(entry, state);
  const parts: Node[] = [];
  if (entry.kind === "quiz" && entry.page) {
    const q = quizInfo(entry, state);
    if (q.passed) {
      parts.push(srOnly(`, passed, best score ${q.best} of ${q.of}`));
      parts.push(
        h("span", { class: "pill pill-passed", "aria-hidden": "true" }, iconSpan("badge-check"), "Passed"),
      );
      return { status, parts };
    }
    if (q.attempts > 0) {
      parts.push(srOnly(`, attempted, best score ${q.best} of ${q.of}`));
      parts.push(h("span", { class: "outline-note", "aria-hidden": "true" }, "Retake"));
      return { status, parts };
    }
  }
  parts.push(srOnly(`, ${STATUS[status].text}`));
  return { status, parts };
}

function row(entry: OutlineEntry, state: ProgressState, options: OutlineOptions): HTMLLIElement {
  const { status, parts } = statusParts(entry, state);
  const lead = entry.kind === "quiz" ? "list-checks" : entry.kind === "capstone" ? "folder-open" : null;
  const content = [
    h("span", { class: "outline-status", "data-status": status }, iconSpan(STATUS[status].icon)),
    h(
      "span",
      { class: "outline-title" },
      lead ? iconSpan(lead, "gf-icon outline-kind") : null,
      entry.kind === "quiz" && options.variant === "home" ? entry.title : rowTitle(entry),
    ),
    h("span", { class: "outline-extra" }, parts),
  ];
  if (options.variant === "home" && entry.minutes)
    content.push(h("span", { class: "outline-minutes" }, minutesLabel(entry)));
  const current = entry.id === options.currentId;
  const link = entry.page
    ? h("a", { class: "outline-row", href: entry.route, "aria-current": current ? "page" : null }, content)
    : h("span", { class: "outline-row is-planned" }, content);
  return h("li", { class: "outline-item", "data-item": entry.id, "data-kind": entry.kind }, link);
}

function badgeRow(model: CourseModel, state: ProgressState, options: OutlineOptions): HTMLLIElement {
  const earned = badgeEarned(model, state);
  return h(
    "li",
    { class: "outline-item outline-badge", "data-item": "badge" },
    h(
      "a",
      {
        class: "outline-row",
        href: "#/badge",
        "aria-current": options.currentId === "badge" ? "page" : null,
        "data-earned": earned ? "" : null,
      },
      h(
        "span",
        { class: "outline-status" },
        iconSpan("award", "gf-icon outline-award"),
        earned ? null : iconSpan("lock", "gf-icon outline-lock"),
      ),
      h("span", { class: "outline-title" }, "Completion badge"),
      h("span", { class: "outline-extra" }, srOnly(earned ? ", earned" : ", locked")),
    ),
  );
}

export function renderOutline(
  model: CourseModel,
  state: ProgressState,
  options: OutlineOptions,
): HTMLElement {
  const nav = h("nav", {
    class: `outline outline-${options.variant}`,
    "aria-label": "Course outline",
    "data-outline": "",
  });
  for (const section of model.sections) {
    const entries = model.entries.filter((e) => e.section === section.id);
    if (!entries.length) continue;
    const titleId = `${options.idPrefix}-${section.id}`;
    nav.append(
      h(
        "div",
        { class: "outline-section", "data-section": section.id },
        h("p", { class: "outline-section-title", id: titleId }, section.title),
        h(
          "ol",
          { class: "outline-list", "aria-labelledby": titleId },
          entries.map((e) => row(e, state, options)),
        ),
      ),
    );
  }
  nav.append(
    h(
      "ol",
      { class: "outline-list outline-list-badge", "aria-label": "Completion" },
      badgeRow(model, state, options),
    ),
  );
  return nav;
}

/** Update every outline row's status in place (focus stays where it is). */
export function refreshOutline(root: ParentNode, model: CourseModel, state: ProgressState): void {
  for (const item of root.querySelectorAll<HTMLElement>("[data-outline] .outline-item[data-item]")) {
    const id = item.dataset.item ?? "";
    if (id === "badge") {
      const earned = badgeEarned(model, state);
      const link = item.querySelector<HTMLElement>(".outline-row");
      if (!link || link.hasAttribute("data-earned") === earned) continue;
      link.toggleAttribute("data-earned", earned);
      item.querySelector(".outline-lock")?.remove();
      if (!earned) link.querySelector(".outline-status")?.append(iconSpan("lock", "gf-icon outline-lock"));
      item.querySelector(".outline-extra")?.replaceChildren(srOnly(earned ? ", earned" : ", locked"));
      continue;
    }
    const entry = model.byId.get(id);
    if (!entry) continue;
    const { status, parts } = statusParts(entry, state);
    const holder = item.querySelector<HTMLElement>(".outline-status");
    if (holder && holder.dataset.status !== status) {
      holder.dataset.status = status;
      holder.replaceChildren(iconSpan(STATUS[status].icon));
    }
    item.querySelector(".outline-extra")?.replaceChildren(...parts);
  }
}
