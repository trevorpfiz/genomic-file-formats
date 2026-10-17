// What each route shows (docs/PLAN.md D-22, 10.1, 11.3; ux 2, 4, 13, 14): `resolveView` maps a
// route to a view (titles, switcher labels, the top bar text), and the builders make the
// contents of <main>. Progress-dependent parts are "regions" the shell rebuilds when progress
// changes, so the page itself (and every widget's state) is never re-rendered for that.
import ISC_LUCIDE from "../../LICENSES/ISC-lucide.txt?raw";
import MIT_PREACT from "../../LICENSES/MIT-preact.txt?raw";
import OFL from "../../LICENSES/OFL-1.1.txt?raw";
import MIT_COURSE from "../../LICENSE?raw";
import { getQuiz } from "../exercises/registry.ts";
import { breadcrumb, exercisePill, pager, pills, quizPassedPill, statusLine } from "./chrome.ts";
import {
  hoursAndMinutes,
  itemLabel,
  minutesLabel,
  sectionOf,
  SITE,
  type CourseModel,
  type OutlineEntry,
  type ShellPage,
} from "./course-model.ts";
import { h, iconSpan, type Attrs, type Child } from "./dom.ts";
import { renderOutline } from "./outline.ts";
import { badgeEarned, continueTarget, courseCounts, quizInfo } from "./progress-derived.ts";
import type { CourseStore } from "./progress-store.ts";
import { progressTools } from "./progress-tools.ts";
import type { Route } from "./router.ts";
import { themeRadios } from "./theme.ts";

export type ViewKind = "home" | "lesson" | "quiz" | "capstone" | "badge" | "about" | "planned" | "not-found";

export interface View {
  kind: ViewKind;
  /** Same key, same page: a hash change between its headings scrolls instead of re-rendering. */
  key: string;
  entry?: OutlineEntry;
  page?: ShellPage;
  /** The H1. */
  title: string;
  /** document.title (ux 2). */
  docTitle: string;
  /** The outline row marked aria-current="page". */
  currentId?: string;
  switcher: { overline: string; title: string };
  /** Top bar: "4/22" and the page title. */
  barCount?: string;
  barText: string;
  sheetTitle: string;
  skipLabel: string;
  /** A heading or exercise DOM id to scroll to (lesson deep links). */
  target?: string;
  /** For not-found: the hash that did not match. */
  hash?: string;
}

const general = (title: string, overline = SITE) => ({
  title,
  docTitle: title === SITE ? SITE : `${title} · ${SITE}`,
  switcher: { overline, title },
  barText: title,
  sheetTitle: title,
  skipLabel: "Skip to content",
});

export function resolveView(route: Route, model: CourseModel): View {
  switch (route.name) {
    case "home":
      return {
        kind: "home",
        key: "home",
        page: model.extra.get("home"),
        ...general(SITE, "Course overview"),
        barText: "Course overview",
        sheetTitle: "Course overview",
      };
    case "about":
      return { kind: "about", key: "about", page: model.extra.get("about"), ...general("About this course") };
    case "badge":
      return { kind: "badge", key: "badge", currentId: "badge", ...general("Completion badge") };
    case "lesson": {
      const entry = model.byId.get(route.slug);
      if (!entry || entry.kind !== "lesson") return notFound(location.hash);
      return outlineView(model, entry, route.target);
    }
    case "quiz": {
      const entry = model.entries.find((e) => e.kind === "quiz" && e.section === route.section);
      return entry ? outlineView(model, entry) : notFound(location.hash);
    }
    case "capstone": {
      const entry = model.entries.find((e) => e.kind === "capstone");
      return entry ? outlineView(model, entry) : notFound(location.hash);
    }
    default:
      return notFound(route.hash);
  }
}

function notFound(hash: string): View {
  return { kind: "not-found", key: `not-found:${hash}`, hash, ...general("Not found") };
}

function outlineView(model: CourseModel, entry: OutlineEntry, target?: string): View {
  const section = sectionOf(model, entry.section);
  const base = {
    key: `${entry.kind}:${entry.id}`,
    entry,
    page: entry.page,
    title: entry.title,
    currentId: entry.id,
    target,
  };
  if (entry.kind === "lesson") {
    const n = entry.lesson ?? 0;
    return {
      ...base,
      kind: entry.page ? "lesson" : "planned",
      docTitle: `${entry.title} · Lesson ${n} · ${SITE}`,
      switcher: {
        overline: `Lesson ${n} of ${model.lessonCount} · ${section?.short ?? ""}`,
        title: entry.title,
      },
      barCount: `${n}/${model.lessonCount}`,
      barText: entry.title,
      sheetTitle: `Lesson ${n} of ${model.lessonCount}`,
      skipLabel: "Skip to lesson content",
    };
  }
  if (entry.kind === "quiz") {
    return {
      ...base,
      kind: entry.page ? "quiz" : "planned",
      docTitle: `${entry.title} · ${SITE}`,
      switcher: { overline: `Section quiz · ${section?.short ?? ""}`, title: entry.title },
      barText: `Section quiz · ${section?.short ?? ""}`,
      sheetTitle: "Section quiz",
      skipLabel: "Skip to the quiz",
    };
  }
  return {
    ...base,
    kind: entry.page ? "capstone" : "planned",
    docTitle: `${entry.title} · ${SITE}`,
    switcher: { overline: "Capstone", title: entry.title },
    barText: "Capstone",
    sheetTitle: "Capstone",
    skipLabel: "Skip to content",
  };
}

// ---------------------------------------------------------------------------------------------
// Builders

/** A progress-dependent part of the page, rebuilt by the shell when progress changes. */
export interface Region {
  el: HTMLElement;
  build: () => Child[];
}

export interface BuildContext {
  model: CourseModel;
  store: CourseStore;
  version: string;
  regions: Region[];
}

function region<K extends keyof HTMLElementTagNameMap>(
  ctx: BuildContext,
  tag: K,
  attrs: Attrs,
  build: () => Child[],
): HTMLElementTagNameMap[K] {
  const el = h(tag, attrs, build());
  ctx.regions.push({ el, build });
  return el;
}

const h1 = (text: string) => h("h1", { id: "page-title", tabindex: "-1" }, text);

/** The compiled page HTML (trusted output of the lessons plugin). */
function article(page: ShellPage): HTMLElement {
  const el = h("article", { class: "prose", "aria-labelledby": "page-title" });
  el.innerHTML = page.html;
  return el;
}

const printDate = () => new Date().toISOString().slice(0, 10);

function printHeader(text: string): HTMLElement {
  return h(
    "p",
    { class: "print-header", "aria-hidden": "true" },
    `${SITE} · ${text} · Printed ${printDate()}`,
  );
}

export function buildMain(view: View, ctx: BuildContext): Child[] {
  switch (view.kind) {
    case "home":
      return homeMain(view, ctx);
    case "lesson":
      return lessonMain(view, ctx);
    case "quiz":
      return quizMain(view, ctx);
    case "capstone":
      return genericMain(view, ctx);
    case "about":
      return aboutMain(view, ctx);
    case "badge":
      return badgeMain(ctx);
    case "planned":
      return plannedMain(view, ctx);
    case "not-found":
      return notFoundMain(view, ctx);
  }
}

function lessonMain(view: View, ctx: BuildContext): Child[] {
  const entry = view.entry!;
  const section = sectionOf(ctx.model, entry.section);
  return [
    printHeader(`Lesson ${entry.lesson}: ${entry.title}`),
    breadcrumb(section),
    h1(entry.title),
    region(ctx, "div", { class: "meta" }, () => [
      pills(
        [
          { icon: "book-open", text: `Lesson ${entry.lesson}` },
          entry.minutes ? { icon: "clock", text: `${entry.minutes} min` } : null,
          exercisePill(entry, ctx.store.state),
        ],
        "Lesson details",
      ),
    ]),
    article(view.page!),
    entry.graded.length
      ? region(ctx, "div", { class: "lesson-status", "aria-label": "Lesson status", role: "group" }, () =>
          statusLine(entry, ctx.store.state),
        )
      : null,
    pager(ctx.model, entry),
  ];
}

function quizMain(view: View, ctx: BuildContext): Child[] {
  const entry = view.entry!;
  const section = sectionOf(ctx.model, entry.section);
  const quiz = getQuiz(entry.section ?? "");
  const count = quiz?.slots.length || 6;
  const passMark = quiz?.slots.length ? quiz.passMark : 5;
  return [
    printHeader(entry.title),
    breadcrumb(section),
    h1(entry.title),
    region(ctx, "div", { class: "meta" }, () => [
      pills(
        [
          { icon: "list-checks", text: "Section quiz" },
          { text: `${count} questions` },
          entry.minutes ? { icon: "clock", text: `About ${entry.minutes} min` } : null,
          { text: `Pass mark ${passMark} of ${count}` },
          quizPassedPill(entry, ctx.store.state),
        ],
        "Quiz details",
      ),
    ]),
    article(view.page!),
    pager(ctx.model, entry),
  ];
}

function genericMain(view: View, ctx: BuildContext): Child[] {
  const entry = view.entry!;
  return [
    breadcrumb(),
    h1(entry.title),
    pills([entry.minutes ? { icon: "clock", text: minutesLabel(entry) } : null], "Details"),
    article(view.page!),
    pager(ctx.model, entry),
  ];
}

function plannedMain(view: View, ctx: BuildContext): Child[] {
  const entry = view.entry!;
  const section = entry.kind === "capstone" ? undefined : sectionOf(ctx.model, entry.section);
  const what = entry.kind === "lesson" ? "This lesson" : entry.kind === "quiz" ? "This quiz" : "The capstone";
  return [
    breadcrumb(section),
    h1(entry.title),
    pills(
      [
        {
          icon:
            entry.kind === "quiz" ? "list-checks" : entry.kind === "capstone" ? "folder-open" : "book-open",
          text: itemLabel(entry),
        },
        entry.minutes ? { icon: "clock", text: minutesLabel(entry) } : null,
      ],
      "Details",
    ),
    h(
      "div",
      { class: "prose" },
      h("p", null, `${what} is not built yet. It arrives in a later version of the course.`),
    ),
    h("p", null, h("a", { href: "#/" }, "Go to the course home")),
  ];
}

function notFoundMain(view: View, ctx: BuildContext): Child[] {
  return [
    h1("Not found"),
    h(
      "div",
      { class: "prose" },
      h(
        "p",
        null,
        "There is no page at ",
        h("code", null, view.hash || "this address"),
        ". The link may be mistyped, or the page may have moved.",
      ),
      h("p", null, h("a", { href: "#/" }, "Go to the course home"), ", or choose a page from the outline."),
    ),
    h("h2", { id: "not-found-outline", class: "section-heading" }, "Course outline"),
    renderOutline(ctx.model, ctx.store.state, { idPrefix: "main-outline", variant: "home" }),
  ];
}

function continueLink(ctx: BuildContext): Child[] {
  const state = ctx.store.state;
  const target = continueTarget(ctx.model, state);
  const counts = courseCounts(ctx.model, state);
  const label = (e: OutlineEntry) =>
    `${itemLabel(e)} · ${e.kind === "quiz" ? (sectionOf(ctx.model, e.section)?.short ?? "") : e.title}`;
  const action = target
    ? h(
        "a",
        { class: "button-link button-primary home-continue", href: target.entry.route },
        target.started ? `Continue: ${label(target.entry)}` : "Start the course",
        iconSpan("arrow-right"),
      )
    : h(
        "p",
        null,
        "You have completed every part of the course that is built so far. ",
        h("a", { href: "#/badge" }, "See your badge requirements"),
        ".",
      );
  return [
    action,
    h(
      "p",
      { class: "home-counts" },
      `${counts.done} of ${counts.total} items complete · ${counts.quizzesPassed} of ${counts.quizzes} quizzes passed`,
    ),
  ];
}

function homeMain(view: View, ctx: BuildContext): Child[] {
  const lessons = ctx.model.entries.filter((e) => e.kind === "lesson");
  const minutes = lessons.reduce((n, e) => n + (e.minutes ?? 0), 0);
  return [
    h1(SITE),
    pills(
      [
        { icon: "book-open", text: `${lessons.length} lessons` },
        { icon: "clock", text: `About ${hoursAndMinutes(minutes)} of lessons` },
        { icon: "list-checks", text: `${ctx.model.quizCount} section quizzes` },
        { icon: "folder-open", text: "Capstone" },
      ],
      "Course details",
    ),
    region(ctx, "div", { class: "home-progress" }, () => continueLink(ctx)),
    view.page
      ? article(view.page)
      : h("div", { class: "prose" }, h("p", null, "An interactive course on the file formats of genomics.")),
    h("h2", { id: "home-outline", class: "section-heading" }, "Course outline"),
    renderOutline(ctx.model, ctx.store.state, { idPrefix: "home-outline", variant: "home" }),
    h("h2", { id: "home-progress", class: "section-heading" }, "Your progress"),
    progressTools(ctx.store, "home-progress-tools"),
    h("h2", { id: "home-settings", class: "section-heading" }, "Settings"),
    themeRadios("home-theme"),
  ];
}

const LICENSE_TEXTS: readonly { title: string; text: string }[] = [
  { title: "MIT License: the course code and text", text: MIT_COURSE },
  { title: "SIL Open Font License 1.1: Source Serif 4, Public Sans and IBM Plex Mono", text: OFL },
  { title: "ISC License: Lucide icons", text: ISC_LUCIDE },
  { title: "MIT License: Preact", text: MIT_PREACT },
];

/** A disclosure in the compiled READ MORE style, holding one license text. */
function licenseCard(title: string, text: string): HTMLElement {
  return h(
    "details",
    { class: "disclosure disclosure-read-more license-card" },
    h(
      "summary",
      { class: "disclosure-summary" },
      iconSpan("scroll-text", "gf-icon disclosure-icon"),
      h(
        "span",
        { class: "disclosure-text" },
        h("span", { class: "disclosure-overline" }, "License", h("span", { class: "visually-hidden" }, ":")),
        " ",
        h("span", { class: "disclosure-title" }, title),
      ),
      iconSpan("chevron-down", "gf-icon disclosure-chevron"),
    ),
    h(
      "div",
      { class: "disclosure-body" },
      h("pre", { class: "license-text", tabindex: "0", "aria-label": title }, text.trim()),
    ),
  );
}

function aboutMain(view: View, ctx: BuildContext): Child[] {
  return [
    breadcrumb(),
    h1("About this course"),
    pills([{ icon: "info", text: `Version ${ctx.version}` }], "Course version"),
    view.page ? article(view.page) : null,
    h("h2", { id: "about-license-texts", class: "section-heading" }, "License texts"),
    h(
      "div",
      { class: "license-list" },
      LICENSE_TEXTS.map((l) => licenseCard(l.title, l.text)),
    ),
    h("h2", { id: "about-progress", class: "section-heading" }, "Your progress"),
    progressTools(ctx.store, "about-progress-tools"),
    h("h2", { id: "about-settings", class: "section-heading" }, "Settings"),
    themeRadios("about-theme"),
  ];
}

function requirement(done: boolean, text: Child, detail?: string, nested?: Child): HTMLLIElement {
  return h(
    "li",
    { class: "requirement", "data-done": done ? "" : null },
    h(
      "span",
      { class: "requirement-line" },
      iconSpan(done ? "circle-check" : "circle"),
      h(
        "span",
        null,
        text,
        h("span", { class: "visually-hidden" }, done ? ", done" : ", not yet"),
        detail ? h("span", { class: "requirement-detail" }, ` (${detail})`) : null,
      ),
    ),
    nested,
  );
}

function badgeMain(ctx: BuildContext): Child[] {
  return [
    breadcrumb(),
    h1("Completion badge"),
    region(ctx, "div", { class: "badge-requirements" }, () => {
      const state = ctx.store.state;
      const counts = courseCounts(ctx.model, state);
      const earned = badgeEarned(ctx.model, state);
      const quizzes = ctx.model.entries.filter((e) => e.kind === "quiz");
      const capstone = ctx.model.entries.find((e) => e.kind === "capstone");
      const earnedAt = state.badge.earnedAt;
      return [
        h(
          "p",
          { class: "badge-state" },
          iconSpan(earned ? "award" : "lock"),
          earned
            ? `Badge earned${earnedAt ? ` on ${earnedAt.slice(0, 10)}` : ""}.`
            : "Your badge unlocks when you finish these:",
        ),
        h(
          "ul",
          { class: "requirements" },
          requirement(
            counts.quizzesPassed === counts.quizzes,
            `Pass all ${counts.quizzes} section quizzes`,
            `${counts.quizzesPassed} of ${counts.quizzes} passed`,
            h(
              "ul",
              { class: "requirements requirements-quizzes", "aria-label": "Section quizzes" },
              quizzes.map((q) => {
                const info = quizInfo(q, state);
                const title = q.page ? h("a", { href: q.route }, q.title) : q.title;
                return requirement(
                  info.passed,
                  title,
                  info.passed ? `best ${info.best} of ${info.of}` : q.page ? undefined : "not built yet",
                );
              }),
            ),
          ),
          requirement(
            Boolean(state.capstone.completedAt),
            capstone?.page
              ? h("a", { href: "#/capstone" }, "Complete the capstone")
              : "Complete the capstone",
            capstone?.page ? undefined : "not built yet",
          ),
        ),
        h(
          "p",
          { class: "badge-context" },
          `Lessons complete: ${counts.lessonsDone} of ${counts.lessons}. Lessons are not required for the badge.`,
        ),
      ];
    }),
    h("p", { class: "badge-honesty" }, "Self-issued course completion; not an accredited credential."),
  ];
}
