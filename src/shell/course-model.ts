// The course as the shell sees it: the manifest's 30 outline items (content/course.ts, D-37)
// joined with the compiled pages from `virtual:lessons`, plus each lesson's graded exercises.
// Pure: no DOM, so the derived progress values can be unit-tested.
import { outlineItems, sections, type PlannedPage, type Section } from "../../content/course.ts";
import type { CompiledPage } from "../../plugins/lesson-compiler.ts";

/** A compiled page as the shell receives it (`virtual:lessons`). */
export type ShellPage = Pick<CompiledPage, "meta" | "route" | "html" | "toc" | "widgets">;

export interface OutlineEntry extends PlannedPage {
  /** The compiled page, when the item is built. */
  page?: ShellPage;
  /** Graded exercise ids on the page: "Try it" and Quick checks, never optional practice. */
  graded: readonly string[];
}

export interface CourseModel {
  sections: readonly Section[];
  /** The 30 outline items in course order (22 lessons, 7 quizzes, the capstone). */
  entries: readonly OutlineEntry[];
  /** Entries whose page is built, in order: prev/next and "Continue" walk these. */
  built: readonly OutlineEntry[];
  lessonCount: number;
  quizCount: number;
  /** Compiled pages outside the outline, by id ("home", "about"). */
  extra: ReadonlyMap<string, ShellPage>;
  byId: ReadonlyMap<string, OutlineEntry>;
}

export const SITE = "Genomic File Formats";

export function gradedExercises(page: Pick<ShellPage, "widgets">): string[] {
  return page.widgets
    .filter((w) => w.ref && (w.mode === "try-it" || w.mode === "quick-check"))
    .map((w) => w.ref);
}

export function buildModel(pages: readonly ShellPage[]): CourseModel {
  const byPageId = new Map(pages.map((p) => [p.meta.id, p]));
  const entries: OutlineEntry[] = outlineItems.map((item) => {
    const page = byPageId.get(item.id);
    return { ...item, page, graded: page ? gradedExercises(page) : [] };
  });
  const extra = new Map(pages.filter((p) => p.meta.kind === "page").map((p) => [p.meta.id, p]));
  return {
    sections,
    entries,
    built: entries.filter((e) => e.page),
    lessonCount: entries.filter((e) => e.kind === "lesson").length,
    quizCount: entries.filter((e) => e.kind === "quiz").length,
    extra,
    byId: new Map(entries.map((e) => [e.id, e])),
  };
}

export const sectionOf = (model: CourseModel, id: string | undefined): Section | undefined =>
  model.sections.find((s) => s.id === id);

/** "Lesson 4" / "Section quiz" / "Capstone": the short label of an outline item. */
export function itemLabel(entry: OutlineEntry): string {
  if (entry.kind === "lesson") return `Lesson ${entry.lesson}`;
  if (entry.kind === "quiz") return "Section quiz";
  return "Capstone";
}

/** "9 min" for lessons; "about 8 min" for quizzes and the capstone (docs/PLAN.md 10.5). */
export function minutesLabel(entry: OutlineEntry): string {
  if (!entry.minutes) return "";
  return entry.kind === "lesson" ? `${entry.minutes} min` : `About ${entry.minutes} min`;
}

/** "3 h 13 min" */
export function hoursAndMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
