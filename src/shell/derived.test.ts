// Derived progress (docs/PLAN.md 11.4, D-10): lesson completion counts graded exercises only,
// quiz "Passed", course counts over the 30 outline items, the badge rule and "Continue".
import { describe, expect, test } from "vite-plus/test";
import { buildModel, type ShellPage } from "./course-model.ts";
import { emptyState } from "./progress-merge.ts";
import { badgeEarned, continueTarget, courseCounts, lessonProgress, quizInfo } from "./progress-derived.ts";
import type { ExerciseProgress, ProgressState } from "./progress-types.ts";

const widget = (ref: string, mode: "try-it" | "quick-check" | "optional") => ({
  directive: "mcq",
  tag: "gf-mcq",
  ref,
  mode,
  optional: mode === "optional",
  line: 1,
  column: 1,
});

function page(id: string, kind: "lesson" | "quiz", widgets: ReturnType<typeof widget>[] = []): ShellPage {
  return {
    meta: { kind, id, title: id, section: "sequences" } as ShellPage["meta"],
    route: kind === "lesson" ? `#/lesson/${id}` : "#/quiz/sequences",
    html: "",
    toc: [],
    widgets,
  };
}

const model = buildModel([
  page("fasta-reference", "lesson", [
    widget("fasta-reference/a", "quick-check"),
    widget("fasta-reference/b", "try-it"),
    widget("fasta-reference/opt", "optional"),
  ]),
  page("random-access", "lesson", [widget("random-access/a", "quick-check")]),
  page("quiz-sequences", "quiz"),
]);
const entry = (id: string) => model.byId.get(id)!;
const done: ExerciseProgress = { state: "correct", attempts: 1, firstTry: true, revealed: false };

function with_(build: (s: ProgressState) => void): ProgressState {
  const s = emptyState("2026-10-16T00:00:00.000Z");
  build(s);
  return s;
}

describe("derived progress", () => {
  test("the model joins the manifest's 30 outline items with the built pages", () => {
    expect(model.entries).toHaveLength(30);
    expect(model.built.map((e) => e.id)).toEqual(["fasta-reference", "random-access", "quiz-sequences"]);
    expect(entry("fasta-reference").graded).toEqual(["fasta-reference/a", "fasta-reference/b"]);
  });

  test("a lesson is complete when its graded exercises are; optional practice never counts", () => {
    const fasta = entry("fasta-reference");
    expect(lessonProgress(fasta, emptyState())).toMatchObject({ status: "not-started", done: 0, total: 2 });
    const half = with_(
      (s) =>
        (s.lessons["fasta-reference"] = {
          exercises: { "fasta-reference/a": done, "fasta-reference/opt": done },
        }),
    );
    expect(lessonProgress(fasta, half)).toMatchObject({
      status: "in-progress",
      done: 1,
      remaining: ["fasta-reference/b"],
    });
    const all = with_(
      (s) =>
        (s.lessons["fasta-reference"] = {
          exercises: { "fasta-reference/a": done, "fasta-reference/b": { ...done, state: "revealed" } },
        }),
    );
    expect(lessonProgress(fasta, all).status).toBe("complete");
    expect(lessonProgress(entry("bed-targets"), all).status).toBe("planned");
  });

  test("quizzes pass once and stay passed; counts run over 30 items and 7 quizzes", () => {
    const s = with_((st) => {
      st.quizzes.sequences = { best: 5, of: 6, passedAt: "2026-10-16T01:00:00.000Z", attempts: 3 };
      st.lessons["random-access"] = { exercises: { "random-access/a": done } };
    });
    expect(quizInfo(entry("quiz-sequences"), s)).toMatchObject({ status: "complete", passed: true, best: 5 });
    expect(courseCounts(model, s)).toMatchObject({
      done: 2,
      total: 30,
      quizzesPassed: 1,
      quizzes: 7,
      lessonsDone: 1,
      lessons: 22,
    });
  });

  test("the badge needs every quiz passed and the capstone complete (D-10)", () => {
    const quizzes = model.entries.filter((e) => e.kind === "quiz").map((e) => e.section!);
    const allPassed = with_((s) => {
      for (const q of quizzes)
        s.quizzes[q] = { best: 6, of: 6, passedAt: "2026-10-16T01:00:00.000Z", attempts: 1 };
    });
    expect(badgeEarned(model, allPassed)).toBe(false);
    allPassed.capstone.completedAt = "2026-10-16T02:00:00.000Z";
    expect(badgeEarned(model, allPassed)).toBe(true);
  });

  test("Continue: start, then the last visited lesson, then the next incomplete item", () => {
    expect(continueTarget(model, emptyState())).toMatchObject({
      entry: { id: "fasta-reference" },
      started: false,
    });
    const visited = with_(
      (s) => (s.lessons["fasta-reference"] = { exercises: {}, visitedAt: "2026-10-16T03:00:00.000Z" }),
    );
    expect(continueTarget(model, visited)).toMatchObject({ entry: { id: "fasta-reference" }, started: true });
    visited.lessons["fasta-reference"]!.exercises = { "fasta-reference/a": done, "fasta-reference/b": done };
    expect(continueTarget(model, visited)?.entry.id).toBe("random-access");
  });
});
