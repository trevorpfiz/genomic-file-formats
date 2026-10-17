// @vitest-environment happy-dom
// gf-fix-it (docs/PLAN.md 7.2, D-26; ux 8.7) against the real runtime FASTA rules (seq EX-04):
// the overlay mirrors the textarea exactly, Tab inserts a TAB and Esc then Tab leaves, live
// validation is debounced and never moves focus, goals stop a pass by deletion, the cap, a
// warning-level pass, "Show solution" with a diff, gf:solved exactly once and restore.
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { FixItExercise } from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { diffLines, typingProblems } from "./fix-it.ts";
import { mount, press, type } from "./test-utils.ts";

const BASES = "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT";
const STARTER = [
  "# reference for case 042",
  ">chrM_demo first 60 bp of GRCh38 chrM",
  "GATCACAGGTCTATCACCCT",
  "ATTAACCACTCACGGGAGCT",
  "",
  "CTCCATGCATTTGGTATTTT",
  ">chrM_demo duplicate copy",
  "GATCACAGGT",
  "",
].join("\n");
const SOLUTION = [
  ">chrM_demo first 60 bp of GRCh38 chrM",
  "GATCACAGGTCTATCACCCT",
  "ATTAACCACTCACGGGAGCT",
  "CTCCATGCATTTGGTATTTT",
  "",
].join("\n");

const FIX: FixItExercise = {
  id: "test-lesson/make-it-indexable",
  kind: "fix-it",
  title: "Make this reference indexable",
  prompt: "Fix the file so that samtools can index it. Keep the chrM_demo bases.",
  source: "test",
  tags: ["validity"],
  formats: ["fasta"],
  concepts: ["fasta.structure-rules"],
  starter: { filename: "ref.fa", format: "fasta", kind: "text", provenance: "toy", text: STARTER },
  validation: { format: "fasta", profile: { include: ["FA-S01", "FA-S03", "FA-M01"] } },
  goals: [
    {
      id: "bases",
      text: "Keeps all 60 bases of `chrM_demo`",
      check: "fastaKeepsBases",
      args: { name: "chrM_demo", bases: BASES },
    },
  ],
  solution: SOLUTION,
  expectStarterRules: ["FA-S01", "FA-S03", "FA-M01"],
  hints: ["Look at lines 1 and 5.", "FA-S01 and FA-S03.", "Delete line 1 and the blank line."],
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const area = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>("textarea")!;
const overlayText = (host: HTMLElement) =>
  host.querySelector(".fixit-overlay")!.textContent!.replace(/ $/, "");
const problems = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>(".fixit-problem")].map((p) => p.dataset.severity);

describe("editor", () => {
  test("a native textarea with editing hints off, over an aria-hidden overlay of the same text", async () => {
    await import("./fix-it.ts");
    const { host, q } = mount("gf-fix-it", FIX);
    const editor = area(host);
    expect(editor.value).toBe(STARTER);
    expect(editor.getAttribute("aria-label")).toBe("Editor: ref.fa");
    expect(editor.spellcheck).toBe(false);
    expect(editor.getAttribute("autocapitalize")).toBe("off");
    expect(editor.getAttribute("autocorrect")).toBe("off");
    expect(editor.maxLength).toBe(64 * 1024);
    expect(q(".fixit-overlay")?.getAttribute("aria-hidden")).toBe("true");
    expect(overlayText(host)).toBe(STARTER);
    expect(q(".card-howto")?.textContent).toBe(
      "Edit the text until it is valid. Tab inserts a tab; press Esc, then Tab, to move on.",
    );
  });

  test("the starter shows its problems: two errors and the duplicate-name warning", async () => {
    await import("./fix-it.ts");
    const { host, q } = mount("gf-fix-it", FIX);
    expect(q(".fixit-pill")?.textContent?.trim()).toBe("2 problems");
    expect(problems(host)).toEqual(["error", "error", "warning"]);
    expect(q(".fixit-problem")?.textContent).toContain("FA-S01 · faidx(5).");
    const gutter = [...host.querySelectorAll<HTMLElement>(".fixit-gutter-line")].map(
      (g) => g.dataset.severity ?? "",
    );
    expect(gutter).toEqual(["error", "", "", "", "error", "", "warning", "", ""]);
    expect(q('.fixit-goal[data-passed="true"]')?.textContent).toContain("Keeps all 60 bases of chrM_demo");
  });

  test("Tab inserts a TAB; Esc then Tab moves on; Shift+Tab is never captured", async () => {
    await import("./fix-it.ts");
    const { host } = mount("gf-fix-it", FIX);
    const editor = area(host);
    editor.focus();
    editor.setSelectionRange(0, 0);
    const tab = press(editor, "Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(editor.value.startsWith("\t# reference")).toBe(true);
    expect(overlayText(host).startsWith("\t# reference")).toBe(true);
    expect(host.querySelector(".fixit-overlay .ws-tab")).not.toBeNull();
    press(editor, "Escape");
    expect(press(editor, "Tab").defaultPrevented).toBe(false);
    expect(press(editor, "Tab", { shiftKey: true }).defaultPrevented).toBe(false);
    expect(host.dataset.state).toBe("attempted");
  });

  test("Insert tab inserts at the caret for touch keyboards", async () => {
    await import("./fix-it.ts");
    const { host, buttonNamed } = mount("gf-fix-it", FIX);
    const editor = area(host);
    editor.setSelectionRange(1, 1);
    buttonNamed("Insert tab")!.click();
    expect(editor.value.slice(0, 3)).toBe("#\t ");
  });

  test("typed smart quotes and no-break spaces are flagged", () => {
    expect(typingProblems("a b\n“x")).toMatchObject([
      { line: 1, col: 2, severity: "warning" },
      { line: 2, col: 1, severity: "warning" },
    ]);
  });
});

describe("live validation and Check", () => {
  test("validation is debounced; becoming valid is announced once and focus never moves", async () => {
    vi.useFakeTimers();
    await import("./fix-it.ts");
    const { host, q, live } = mount("gf-fix-it", FIX);
    const editor = area(host);
    editor.focus();
    type(editor, SOLUTION);
    expect(q(".fixit-pill")?.textContent?.trim()).toBe("2 problems");
    vi.advanceTimersByTime(250);
    expect(q(".fixit-pill")?.textContent?.trim()).toBe("Valid FASTA");
    expect(live()).toBe("");
    vi.advanceTimersByTime(1000);
    expect(live()).toBe("No problems found.");
    expect(document.activeElement).toBe(editor);
  });

  test("Check with errors is incorrect and names the first; Show solution then shows a diff", async () => {
    await import("./fix-it.ts");
    const { host, action, verdict, q, solved } = mount("gf-fix-it", FIX);
    expect(action("Show solution")!.hidden).toBe(true);
    action("Check")!.click();
    expect(verdict()).toBe(
      "Not quite. 2 problems remain. First: Line 1: a FASTA file starts with a > header line.",
    );
    expect(action("Show solution")!.hidden).toBe(false);
    action("Show solution")!.click();
    const lines = [...host.querySelectorAll<HTMLElement>(".fixit-diff-line")].map(
      (l) => `${l.dataset.op} ${l.textContent}`,
    );
    expect(lines).toEqual([
      "removed -Removed: # reference for case 042",
      "same  >chrM_demo first 60 bp of GRCh38 chrM",
      "same  GATCACAGGTCTATCACCCT",
      "same  ATTAACCACTCACGGGAGCT",
      "removed -Removed: (empty line)",
      "same  CTCCATGCATTTGGTATTTT",
      "removed -Removed: >chrM_demo duplicate copy",
      "removed -Removed: GATCACAGGT",
    ]);
    expect(area(host).readOnly).toBe(true);
    q<HTMLButtonElement>(".fixit-diff button")!.click();
    expect(area(host).value).toBe(SOLUTION);
    expect(solved.mock.calls[0]![0]).toMatchObject({ state: "revealed" });
  });

  test("deleting the content is valid but fails its goal", async () => {
    await import("./fix-it.ts");
    const { host, action, verdict } = mount("gf-fix-it", FIX);
    type(area(host), ">chrM_demo\nGATC\n");
    action("Check")!.click();
    expect(verdict()).toBe(
      "Not quite. The text is valid, but a goal is not met: Keeps all 60 bases of chrM_demo.",
    );
  });

  test("a warning-level pass: fixing the two errors is correct, and the warning is explained", async () => {
    await import("./fix-it.ts");
    const { host, action, verdict, q, solved } = mount("gf-fix-it", FIX);
    type(area(host), STARTER.replace("# reference for case 042\n", "").replace("AGCT\n\nCTCC", "AGCT\nCTCC"));
    action("Check")!.click();
    expect(verdict()).toBe("Correct. Valid FASTA. The goal is met.");
    expect(q(".card-explanation")?.textContent).toContain("A warning remains, which does not block");
    expect(q(".card-explanation")?.textContent).toContain("FA-M01");
    expect(solved).toHaveBeenCalledTimes(1);
    expect(store.getExercise(FIX.id)?.answer).toBe(area(host).value);
  });

  test("text over the snippet cap is not validated and Check says why", async () => {
    await import("./fix-it.ts");
    const { host, action, verdict, q } = mount("gf-fix-it", FIX);
    type(area(host), `>big\n${"ACGT\n".repeat(320)}`);
    action("Check")!.click();
    expect(verdict()).toBe("This exercise checks small snippets; use real tools for whole files.");
    expect(q(".fixit-notice")?.hidden).toBe(false);
    expect(q(".fixit-pill")?.textContent?.trim()).toBe("Too long to check");
  });

  test("a saved answer is restored into the editor and the overlay", async () => {
    await import("./fix-it.ts");
    store.putExercise(FIX.id, {
      state: "incorrect",
      attempts: 1,
      firstTry: false,
      revealed: false,
      answer: SOLUTION,
    });
    const { host, q } = mount("gf-fix-it", FIX);
    expect(area(host).value).toBe(SOLUTION);
    expect(overlayText(host)).toBe(SOLUTION);
    expect(q(".fixit-pill")?.textContent?.trim()).toBe("Valid FASTA");
  });

  test("diffLines is a minimal line diff", () => {
    expect(diffLines("a\nb\nc\n", "a\nc\nd\n")).toEqual([
      { op: " ", text: "a" },
      { op: "-", text: "b" },
      { op: " ", text: "c" },
      { op: "+", text: "d" },
    ]);
  });
});
