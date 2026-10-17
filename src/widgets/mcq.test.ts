// @vitest-environment happy-dom
// gf-mcq (docs/PLAN.md 7.7; ux 8.12): native radios and checkboxes, per-option result lines
// (chosen only after a formative miss, all after a correct answer, Show answer or Submit quiz),
// the reveal policy, gf:solved exactly once, restore, quiz mode and the unknown-id error.
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import type { McqExercise } from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { choose, mount, press } from "./test-utils.ts";
import "./mcq.ts";

const SINGLE: McqExercise = {
  id: "test-lesson/which-token",
  kind: "mcq",
  title: "Which token is the name?",
  prompt: "The header reads `>chr1  AC:CM000663.2  LN:248956422`.",
  source: "test",
  tags: ["concept"],
  formats: ["fasta"],
  concepts: ["fasta.record"],
  multi: false,
  stem: "Which token does samtools use as the sequence name?",
  options: [
    { id: "a", text: "`chr1`", correct: true, explanation: "The name is the first word after `>`." },
    {
      id: "b",
      text: "`AC:CM000663.2`",
      correct: false,
      explanation: "That is a description token; tools ignore it.",
    },
    { id: "c", text: "The whole line", correct: false, explanation: "Only the first word is the name." },
  ],
};

const MULTI: McqExercise = {
  ...SINGLE,
  id: "test-lesson/which-match",
  multi: true,
  stem: "Which parts must match between R1 and R2?",
  options: [
    { id: "a", text: "The read ID", correct: true, explanation: "Mates share the read ID." },
    { id: "b", text: "The index", correct: true, explanation: "Both mates carry the sample index." },
    { id: "c", text: "The read number", correct: false, explanation: "It is 1 in R1 and 2 in R2." },
  ],
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => document.body.replaceChildren());

const radios = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>(".mcq input")];
const results = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>(".mcq-result")].map((r) =>
    r.hidden ? null : r.textContent?.trim(),
  );

describe("single select", () => {
  test("a fieldset with the stem as legend and native radios in one group", () => {
    const { host, q } = mount("gf-mcq", SINGLE);
    expect(q("fieldset legend")?.textContent).toBe(SINGLE.stem);
    const inputs = radios(host);
    expect(inputs.map((i) => i.type)).toEqual(["radio", "radio", "radio"]);
    expect(new Set(inputs.map((i) => i.name)).size).toBe(1);
    expect(q(".mcq-option-label code")?.textContent).toBe("chr1");
  });

  test("Check with nothing chosen asks for a choice and counts no attempt", () => {
    const { host, action, verdict } = mount("gf-mcq", SINGLE);
    action("Check")!.click();
    expect(verdict()).toBe("Choose an answer first.");
    expect((host as HTMLElement & { card?: { attempts: number } }).card?.attempts).toBe(0);
  });

  test("a miss shows only the chosen option's note; changing the choice clears it", () => {
    const { host, action, verdict, q } = mount("gf-mcq", SINGLE);
    choose(radios(host)[1]!);
    expect(host.dataset.state).toBe("attempted");
    action("Check")!.click();
    expect(verdict()).toBe("Not quite. Read the note under your choice, then try again.");
    expect(results(host)).toEqual([
      null,
      "Your choice: incorrectThat is a description token; tools ignore it.",
      null,
    ]);
    expect(radios(host)[1]!.getAttribute("aria-describedby")).toBe(
      q(".mcq-option:nth-child(2) .mcq-result")?.id,
    );
    expect(radios(host)[1]!.disabled).toBe(false);
    choose(radios(host)[2]!);
    expect(results(host)).toEqual([null, null, null]);
    expect(host.dataset.state).toBe("attempted");
  });

  test("a correct answer shows every note, locks and fires gf:solved once", () => {
    const { host, action, verdict, solved } = mount("gf-mcq", SINGLE);
    choose(radios(host)[0]!);
    action("Check")!.click();
    expect(verdict()).toBe("Correct.");
    expect(results(host)).toEqual([
      "Your choice: correctThe name is the first word after >.",
      "That is a description token; tools ignore it.",
      "Only the first word is the name.",
    ]);
    expect(radios(host).every((r) => r.disabled)).toBe(true);
    press(host, "Enter", { ctrlKey: true });
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved.mock.calls[0]![0]).toMatchObject({ state: "correct", firstTry: true, attempts: 1 });
  });

  test("Show answer appears after 2 misses and marks the key without changing the choice", () => {
    const { host, action, verdict, solved } = mount("gf-mcq", SINGLE);
    choose(radios(host)[1]!);
    action("Check")!.click();
    expect(action("Show answer")!.hidden).toBe(true);
    choose(radios(host)[2]!);
    action("Check")!.click();
    action("Show answer")!.click();
    expect(verdict()).toBe(
      "Answer shown. The correct answer is marked, with why each option is right or wrong.",
    );
    expect(results(host)[0]).toBe("Correct answerThe name is the first word after >.");
    expect(radios(host)[2]!.checked).toBe(true);
    expect(solved.mock.calls[0]![0]).toMatchObject({ state: "revealed", revealed: true });
  });

  test("a saved answer is restored, locked, with its notes; Reset focuses the first radio", () => {
    store.putExercise(SINGLE.id, {
      state: "correct",
      attempts: 1,
      firstTry: true,
      revealed: false,
      answer: ["a"],
    });
    const { host, solved, buttonNamed } = mount("gf-mcq", SINGLE);
    expect(radios(host)[0]!.checked).toBe(true);
    expect(radios(host)[0]!.disabled).toBe(true);
    expect(results(host)[0]).toContain("Your choice: correct");
    buttonNamed("Reset")!.click();
    host.querySelector<HTMLButtonElement>(".card-confirm button")!.click();
    expect(radios(host).some((r) => r.checked)).toBe(false);
    expect(document.activeElement).toBe(radios(host)[0]);
    expect(solved).not.toHaveBeenCalled();
  });
});

describe("multi select", () => {
  test("checkboxes, the instruction, a partial count and Missed lines on reveal", () => {
    const { host, q, action, verdict } = mount("gf-mcq", MULTI);
    expect(q("legend")?.textContent).toBe(`${MULTI.stem} Select all that apply.`);
    expect(radios(host).map((i) => i.type)).toEqual(["checkbox", "checkbox", "checkbox"]);
    choose(radios(host)[0]!);
    choose(radios(host)[2]!);
    action("Check")!.click();
    expect(verdict()).toBe("Not quite. 1 of 2 correct choices, 1 incorrect.");
    action("Check")!.click();
    action("Show answer")!.click();
    expect(results(host)).toEqual([
      "Your choice: correctMates share the read ID.",
      "Missed: this is also correctBoth mates carry the sample index.",
      "Your choice: incorrectIt is 1 in R1 and 2 in R2.",
    ]);
  });
});

describe("quiz mode and errors", () => {
  test("quiz mode: no actions; submit grades once and shows every note", () => {
    const { host, q } = mount("gf-mcq", SINGLE, { "data-mode": "quiz", "data-overline": "Question 2 of 6" });
    const card = (host as HTMLElement & { card?: { submit(): boolean; hasAnswer(): boolean } }).card!;
    expect(q(".card-actions")).toBeNull();
    expect(q(".card-overline")?.textContent).toBe("Question 2 of 6");
    expect(card.hasAnswer()).toBe(false);
    choose(radios(host)[1]!);
    expect(card.hasAnswer()).toBe(true);
    expect(results(host)).toEqual([null, null, null]);
    expect(card.submit()).toBe(false);
    expect(results(host).every((r) => r !== null)).toBe(true);
    expect(radios(host).every((r) => r.disabled)).toBe(true);
    expect(store.getExercise(SINGLE.id)).toBeUndefined();
  });

  test("an unknown id renders a visible error", () => {
    document.body.innerHTML = `<gf-mcq exercise="test-lesson/nope"></gf-mcq>`;
    expect(document.querySelector(".widget-error")?.textContent).toBe(
      'Missing mcq exercise "test-lesson/nope".',
    );
  });
});
