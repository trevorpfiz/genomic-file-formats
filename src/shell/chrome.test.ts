// @vitest-environment happy-dom
// Page chrome: the exercise pill, the lesson status line with links to the remaining exercises
// (stable exercise ids, docs/PLAN.md 11.3), and previous/next across built items (ux 4.12).
import { describe, expect, test } from "vite-plus/test";
import { exercisePill, pager, statusLine } from "./chrome.ts";
import { buildModel, type ShellPage } from "./course-model.ts";
import { emptyState } from "./progress-merge.ts";

const widget = (ref: string, mode: "try-it" | "quick-check" | "optional") => ({
  directive: "mcq",
  tag: "gf-mcq",
  ref,
  mode,
  optional: mode === "optional",
  line: 1,
  column: 1,
});
const lesson = (id: string, refs: string[]): ShellPage => ({
  meta: { kind: "lesson", id, title: id, section: "sequences" } as ShellPage["meta"],
  route: `#/lesson/${id}`,
  html: "",
  toc: [],
  widgets: refs.map((r) => widget(r, "quick-check")),
});
const model = buildModel([
  lesson("fasta-reference", ["fasta-reference/a", "fasta-reference/b"]),
  lesson("random-access", []),
  lesson("fastq-reads", []),
]);
const fasta = model.byId.get("fasta-reference")!;

describe("lesson chrome", () => {
  test("the exercise pill counts graded exercises, then reads Completed", () => {
    expect(exercisePill(fasta, emptyState())).toMatchObject({ text: "0 of 2 exercises" });
    const state = emptyState();
    state.lessons["fasta-reference"] = {
      exercises: {
        "fasta-reference/a": { state: "correct", attempts: 1, firstTry: true, revealed: false },
        "fasta-reference/b": { state: "revealed", attempts: 2, firstTry: false, revealed: true },
      },
    };
    expect(exercisePill(fasta, state)).toMatchObject({ text: "Completed", tone: "success" });
    expect(exercisePill(model.byId.get("random-access")!, state)).toBeNull();
    document.body.replaceChildren(...statusLine(fasta, state));
    expect(document.body.textContent).toBe("Lesson complete");
  });

  test("the status line links each remaining exercise by its stable id", () => {
    const state = emptyState();
    state.lessons["fasta-reference"] = {
      exercises: { "fasta-reference/a": { state: "correct", attempts: 1, firstTry: true, revealed: false } },
    };
    document.body.replaceChildren(...statusLine(fasta, state));
    expect(document.querySelector(".lesson-status-text")!.textContent).toBe(
      "1 exercise left in this lesson:",
    );
    const links = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["#/lesson/fasta-reference/fasta-reference--b"]);
  });

  test("previous and next walk the built items in course order", () => {
    const nav = pager(model, model.byId.get("random-access")!)!;
    expect(nav.querySelector("a[rel=prev]")!.getAttribute("href")).toBe("#/lesson/fasta-reference");
    expect(nav.querySelector("a[rel=next]")!.getAttribute("href")).toBe("#/lesson/fastq-reads");
    expect(nav.querySelector(".pager-next .pager-meta")!.textContent).toBe("Lesson 6 · 8 min");
    const first = pager(model, fasta)!;
    expect(first.querySelector("a[rel=prev]")).toBeNull();
    expect(first.querySelector(".pager-spacer")).not.toBeNull();
  });
});
