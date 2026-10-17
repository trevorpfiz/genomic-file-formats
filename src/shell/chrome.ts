// Page chrome shared by the routes (ux 4.1-4.3, 4.12; docs/PLAN.md 10.1): the breadcrumb, the
// meta pills, the lesson status line and the previous/next cards.
import { getExercise } from "../exercises/registry.ts";
import { exerciseDomId } from "./ids.ts";
import type { CourseModel, OutlineEntry } from "./course-model.ts";
import { itemLabel, minutesLabel, SITE } from "./course-model.ts";
import { h, iconSpan } from "./dom.ts";
import type { IconName } from "./icons.ts";
import { lessonProgress, quizInfo } from "./progress-derived.ts";
import type { ProgressState } from "./progress-types.ts";

/** `← Genomic File Formats / <Section>`; the current page is not repeated (ux 4.1). */
export function breadcrumb(section?: { id: string; title: string }): HTMLElement {
  return h(
    "nav",
    { class: "breadcrumb", "aria-label": "Breadcrumb" },
    h(
      "ol",
      null,
      h("li", null, h("a", { href: "#/", class: "breadcrumb-home" }, iconSpan("arrow-left"), SITE)),
      section
        ? h(
            "li",
            null,
            h("span", { class: "breadcrumb-sep", "aria-hidden": "true" }, "/"),
            h("a", { href: "#/", "data-home-section": section.id, title: section.title }, section.title),
          )
        : null,
    ),
  );
}

export interface Pill {
  icon?: IconName;
  text: string;
  tone?: "success";
}

export function pill(p: Pill): HTMLLIElement {
  return h("li", { class: "pill", "data-tone": p.tone ?? null }, p.icon ? iconSpan(p.icon) : null, p.text);
}

export function pills(list: readonly (Pill | null)[], label: string): HTMLUListElement {
  return h(
    "ul",
    { class: "meta-pills", "aria-label": label },
    list.filter((p): p is Pill => p !== null).map(pill),
  );
}

/** "0 of 3 exercises", then "Completed" (ux 4.3). Null when the lesson has no graded exercise. */
export function exercisePill(entry: OutlineEntry, state: ProgressState): Pill | null {
  const p = lessonProgress(entry, state);
  if (!p.total) return null;
  if (p.done === p.total) return { icon: "circle-check", text: "Completed", tone: "success" };
  return { icon: "list-checks", text: `${p.done} of ${p.total} exercises` };
}

/** "Passed · 6/6" once a quiz is passed (ux 4.3, 9.2). */
export function quizPassedPill(entry: OutlineEntry, state: ProgressState): Pill | null {
  const q = quizInfo(entry, state);
  return q.passed ? { icon: "badge-check", text: `Passed · ${q.best}/${q.of}`, tone: "success" } : null;
}

/**
 * The lesson status line (ux 4.12): "Lesson complete", or "2 exercises left in this lesson"
 * with a link to each remaining exercise (stable exercise ids, docs/PLAN.md 11.3).
 */
export function statusLine(entry: OutlineEntry, state: ProgressState): Node[] {
  const p = lessonProgress(entry, state);
  if (!p.total) return [];
  if (!p.remaining.length) {
    return [
      h(
        "p",
        { class: "lesson-status-text", "data-tone": "success" },
        iconSpan("circle-check"),
        "Lesson complete",
      ),
    ];
  }
  const n = p.remaining.length;
  return [
    h(
      "p",
      { class: "lesson-status-text" },
      iconSpan("circle-dashed"),
      `${n} ${n === 1 ? "exercise" : "exercises"} left in this lesson:`,
    ),
    h(
      "ul",
      { class: "lesson-status-list" },
      p.remaining.map((id) =>
        h(
          "li",
          null,
          h("a", { href: `#/lesson/${entry.id}/${exerciseDomId(id)}` }, getExercise(id)?.title ?? id),
        ),
      ),
    ),
  ];
}

function pagerCard(
  entry: OutlineEntry | { route: string; title: string; meta: string },
  dir: "prev" | "next",
) {
  const title = entry.title;
  const meta =
    "meta" in entry ? entry.meta : [itemLabel(entry), minutesLabel(entry)].filter(Boolean).join(" · ");
  return h(
    "a",
    { class: `pager-card pager-${dir}`, href: entry.route, rel: dir },
    dir === "prev" ? iconSpan("arrow-left", "gf-icon pager-arrow") : null,
    h(
      "span",
      { class: "pager-text" },
      h("span", { class: "pager-overline" }, dir === "prev" ? "Previous" : "Next"),
      h("span", { class: "pager-title" }, title),
      h("span", { class: "pager-meta" }, meta),
    ),
    dir === "next" ? iconSpan("arrow-right", "gf-icon pager-arrow") : null,
  );
}

/**
 * Previous and next among the built outline items: a section's last lesson leads to its quiz,
 * the last quiz to the capstone, the capstone to the badge (ux 4.12).
 */
export function pager(model: CourseModel, entry: OutlineEntry): HTMLElement | null {
  const i = model.built.indexOf(entry);
  if (i < 0) return null;
  const prev = model.built[i - 1];
  const next = model.built[i + 1];
  const nextCard = next
    ? pagerCard(next, "next")
    : entry.kind === "capstone"
      ? pagerCard({ route: "#/badge", title: "Completion badge", meta: "Your badge" }, "next")
      : null;
  if (!prev && !nextCard) return null;
  return h(
    "nav",
    { class: "pager", "aria-label": entry.kind === "lesson" ? "Lesson navigation" : "Course navigation" },
    prev ? pagerCard(prev, "prev") : h("span", { class: "pager-spacer", "aria-hidden": "true" }),
    nextCard,
  );
}
