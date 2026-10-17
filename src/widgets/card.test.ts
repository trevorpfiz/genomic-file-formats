// @vitest-environment happy-dom
// The exercise card (docs/PLAN.md 7; ux 8.1-8.5): the five-state model, the retry and reveal
// policy, the hint ladder, gf:solved exactly once, persistence and restore through the progress
// store, stable DOM ids and accessible labelling.
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { McqExercise, SolvedDetail, StateChangeDetail } from "../exercises/types.ts";
import { mergeExerciseProgress } from "../shell/progress-merge.ts";
import {
  ExerciseCard,
  MemoryProgressStore,
  setProgressStore,
  type CardHooks,
  type CheckOutcome,
} from "./card.ts";

const MCQ: McqExercise = {
  id: "test-lesson/pick-one",
  kind: "mcq",
  title: "Pick the indexable file",
  prompt: "Which file can `samtools faidx` index?",
  source: "test",
  tags: ["concept"],
  formats: ["fasta"],
  concepts: ["test.concept"],
  hints: ["Look at the first byte.", "Only one has a `>`."],
  multi: false,
  stem: "Which one?",
  options: [
    { id: "a", text: "A", correct: true, explanation: "Yes." },
    { id: "b", text: "B", correct: false, explanation: "No." },
  ],
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => {
  document.body.replaceChildren();
});

/** A host as the compiler emits it, plus a card whose check returns the next queued outcome. */
function mount(mode: "quick-check" | "try-it" | "optional" = "quick-check", hooks: Partial<CardHooks> = {}) {
  document.body.innerHTML =
    mode === "try-it"
      ? `<h2 id="try-it-pick">Try it: pick</h2><gf-test exercise="${MCQ.id}" id="test-lesson--pick-one" data-mode="try-it" data-labelledby="try-it-pick"></gf-test>`
      : mode === "optional"
        ? `<gf-test exercise="${MCQ.id}" id="test-lesson--pick-one" data-mode="optional" data-optional=""><p class="exercise-title" id="test-lesson--pick-one-title">${MCQ.title}</p></gf-test>`
        : `<gf-test exercise="${MCQ.id}" id="test-lesson--pick-one" data-mode="quick-check"><h3 class="quick-check-title" id="pick-the-indexable-file">${MCQ.title}</h3></gf-test>`;
  const host = document.querySelector<HTMLElement>("gf-test")!;
  const outcomes: CheckOutcome[] = [];
  const solved = vi.fn<(detail: SolvedDetail) => void>();
  const changes: StateChangeDetail[] = [];
  document.body.addEventListener("gf:solved", (e) => solved((e as CustomEvent<SolvedDetail>).detail));
  document.body.addEventListener("gf:statechange", (e) =>
    changes.push((e as CustomEvent<StateChangeDetail>).detail),
  );
  const input = document.createElement("input");
  input.setAttribute("aria-label", "answer");
  const card = new ExerciseCard(
    host,
    MCQ,
    {
      check: () => outcomes.shift() ?? { result: "incomplete", message: "Choose an answer first." },
      reveal: () => ({ explanation: "A is the FASTA." }),
      answer: () => input.value,
      restore: (record) => {
        input.value = typeof record.answer === "string" ? record.answer : "";
      },
      lock: (locked) => {
        input.disabled = locked;
      },
      ...hooks,
    },
    { now: () => "2026-10-16T12:00:00.000Z" },
  );
  card.body.append(input);
  card.ready();
  const q = (selector: string) => host.querySelector<HTMLElement>(selector);
  const button = (name: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(".card-actions button")].find((b) => b.textContent === name);
  return { host, card, outcomes, solved, changes, input, q, button };
}

describe("structure and labelling", () => {
  test("a Quick check: overline, the compiled H3 as its name, status and how-to", () => {
    const { host, q } = mount();
    expect(host.id).toBe("test-lesson--pick-one");
    expect(host.getAttribute("role")).toBe("group");
    expect(host.getAttribute("aria-labelledby")).toBe("pick-the-indexable-file");
    expect(host.getAttribute("aria-describedby")).toBe("test-lesson--pick-one-howto");
    expect(q(".card-overline")?.textContent).toBe("Quick check · Multiple choice");
    expect(q(".card-header h3")?.textContent).toBe(MCQ.title);
    expect(q(".card-status")?.textContent?.trim()).toBe("Not started");
    expect(q(".card-status svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(q(".card-prompt code")?.textContent).toBe("samtools faidx");
    expect(host.dataset.state).toBe("idle");
  });

  test("a Try it card is labelled by its H2 and adds no heading", () => {
    const { host, q } = mount("try-it");
    expect(host.getAttribute("aria-labelledby")).toBe("try-it-pick");
    expect(q(".card-overline")?.textContent).toBe("Try it · Multiple choice");
    expect(host.querySelector("h3, .exercise-title")).toBeNull();
  });

  test("an optional card says so in its overline", () => {
    const { host, q } = mount("optional");
    expect(q(".card-overline")?.textContent).toBe("Optional practice · Multiple choice");
    expect(host.getAttribute("aria-labelledby")).toBe("test-lesson--pick-one-title");
  });

  test("the status line and verdict are not live regions; one polite status region exists", () => {
    const { host } = mount();
    expect(host.querySelector(".card-status")?.getAttribute("role")).toBeNull();
    expect(host.querySelector(".card-verdict")?.getAttribute("aria-live")).toBeNull();
    expect(host.querySelectorAll('[role="status"]')).toHaveLength(1);
  });
});

describe("the five states", () => {
  test("idle -> attempted -> incorrect -> attempted -> correct, focus on the verdict", () => {
    const { card, outcomes, changes, q, button, input } = mount();
    card.markAttempted();
    expect(card.state).toBe("attempted");
    outcomes.push({ result: "incorrect", message: "Look again." });
    button("Check")!.click();
    expect(card.state).toBe("incorrect");
    expect(q(".card-status")?.textContent?.trim()).toBe("Not yet");
    expect(q(".card-verdict")?.textContent).toBe(" Not quite. Look again.");
    expect(document.activeElement).toBe(q(".card-verdict"));
    expect(q(".card-feedback")?.dataset.tone).toBe("error");
    card.markAttempted();
    expect(card.state).toBe("attempted");
    outcomes.push({ result: "correct", explanation: "A starts with `>`." });
    card.check();
    expect(card.state).toBe("correct");
    expect(card.attempts).toBe(2);
    expect(card.firstTry).toBe(false);
    expect(input.disabled).toBe(true);
    expect(q(".card-explanation code")?.textContent).toBe(">");
    expect(button("Check")!.hidden).toBe(true);
    expect(changes.map((c) => c.state)).toEqual(["attempted", "incorrect", "attempted", "correct"]);
  });

  test("an incomplete answer is not graded and does not count as an attempt", () => {
    const { card, q } = mount();
    card.check();
    expect(card.state).toBe("attempted");
    expect(card.attempts).toBe(0);
    expect(q(".card-verdict")?.textContent).toBe(" Choose an answer first.");
    expect(q(".card-feedback")?.dataset.tone).toBe("neutral");
  });

  test("correct on the first check is firstTry", () => {
    const { card, outcomes } = mount();
    outcomes.push({ result: "correct" });
    card.check();
    expect(card.firstTry).toBe(true);
  });

  test("Ctrl+Enter checks", () => {
    const { host, card, outcomes } = mount();
    outcomes.push({ result: "correct" });
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    expect(card.state).toBe("correct");
  });
});

describe("hints and Show answer (ux 8.4)", () => {
  test("mcq: the hint ladder, and Show answer after 2 checks", () => {
    const { card, outcomes, button, q, host } = mount();
    expect(button("Hint")!.hidden).toBe(false);
    expect(button("Show answer")!.hidden).toBe(true);
    button("Hint")!.click();
    expect(q(".card-hints")?.textContent).toBe("Hint 1. Look at the first byte.");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Hint 1: Look at the first byte.");
    button("Hint")!.click();
    expect(button("Hint")!.hidden).toBe(true);
    outcomes.push({ result: "incorrect" }, { result: "incorrect" });
    card.check();
    expect(button("Show answer")!.hidden).toBe(true);
    card.check();
    expect(button("Show answer")!.hidden).toBe(false);
    button("Show answer")!.click();
    expect(card.state).toBe("revealed");
    expect(card.revealed).toBe(true);
    expect(q(".card-verdict")?.textContent).toBe(" Answer shown.");
    expect(q(".card-explanation")?.textContent).toBe("A is the FASTA.");
    expect(document.activeElement).toBe(q(".card-verdict"));
  });

  test("no reveal hook, no Show answer button", () => {
    const { card, outcomes, button } = mount("quick-check", { reveal: undefined });
    outcomes.push({ result: "incorrect" }, { result: "incorrect" });
    card.check();
    card.check();
    expect(button("Show answer")!.hidden).toBe(true);
  });
});

describe("gf:solved and persistence", () => {
  test("gf:solved fires exactly once, at the first completion", () => {
    const { card, outcomes, solved } = mount();
    outcomes.push({ result: "correct" });
    card.check();
    card.check();
    card.reset();
    card.reset(); // confirmed
    outcomes.push({ result: "correct" });
    card.check();
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved).toHaveBeenCalledWith({
      id: MCQ.id,
      state: "correct",
      attempts: 1,
      firstTry: true,
      revealed: false,
    });
  });

  test("records are written through the store, with the answer", () => {
    const { card, outcomes, input } = mount();
    input.value = "a";
    outcomes.push({ result: "correct" });
    card.check();
    expect(store.getExercise(MCQ.id)).toEqual({
      state: "correct",
      attempts: 1,
      firstTry: true,
      revealed: false,
      answer: "a",
      updatedAt: "2026-10-16T12:00:00.000Z",
      solvedAt: "2026-10-16T12:00:00.000Z",
    });
  });

  test("a saved record is restored on ready(), locked, and gf:solved does not fire again", () => {
    store.putExercise(MCQ.id, {
      state: "revealed",
      attempts: 3,
      firstTry: false,
      revealed: true,
      answer: "b",
    });
    const { card, input, solved, q } = mount();
    expect(card.state).toBe("revealed");
    expect(card.attempts).toBe(3);
    expect(input.value).toBe("b");
    expect(input.disabled).toBe(true);
    expect(q(".card-verdict")?.textContent).toBe(" Answer shown.");
    expect(solved).not.toHaveBeenCalled();
  });

  test("Reset after completion asks first; the recorded result stays", () => {
    const { card, outcomes, host, input } = mount();
    outcomes.push({ result: "correct" });
    card.check();
    card.reset();
    const confirm = host.querySelector<HTMLElement>(".card-confirm")!;
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toContain("Your result stays recorded.");
    confirm.querySelector("button")!.click();
    expect(card.state).toBe("idle");
    expect(input.disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(host.querySelector('[role="status"]')?.textContent).toBe("Exercise reset.");
    expect(store.getExercise(MCQ.id)?.state).toBe("correct");
  });
});

describe("quiz mode", () => {
  test("no actions, status, store or events; submit grades once and shows the answer", () => {
    document.body.innerHTML = `<gf-test></gf-test>`;
    const host = document.querySelector<HTMLElement>("gf-test")!;
    const solved = vi.fn();
    document.body.addEventListener("gf:solved", solved);
    const card = new ExerciseCard(
      host,
      MCQ,
      { check: () => ({ result: "incorrect" }), reveal: () => ({ explanation: "A is the FASTA." }) },
      { mode: "quiz", overline: "Question 1 of 6" },
    );
    expect(host.querySelector(".card-actions")).toBeNull();
    expect(host.querySelector(".card-status")).toBeNull();
    expect(host.querySelector(".card-overline")?.textContent).toBe("Question 1 of 6");
    expect(host.querySelector(".exercise-title")?.textContent).toBe(MCQ.title);
    expect(card.submit()).toBe(false);
    expect(card.state).toBe("incorrect");
    expect(host.querySelector(".card-explanation")?.textContent).toBe("A is the FASTA.");
    expect(solved).not.toHaveBeenCalled();
    expect(store.getExercise(MCQ.id)).toBeUndefined();
  });
});

describe("mergeExerciseProgress (D-36)", () => {
  const base = { attempts: 1, firstTry: false, revealed: false };
  test("complete states never revert; correct beats revealed; counters are monotonic", () => {
    const correct = {
      ...base,
      state: "correct" as const,
      firstTry: true,
      solvedAt: "2026-10-02",
      updatedAt: "2026-10-02",
    };
    const later = { ...base, state: "attempted" as const, attempts: 4, updatedAt: "2026-10-09" };
    const revealed = { ...base, state: "revealed" as const, revealed: true, solvedAt: "2026-10-01" };
    expect(mergeExerciseProgress(correct, later)).toMatchObject({
      state: "correct",
      attempts: 4,
      firstTry: true,
    });
    expect(mergeExerciseProgress(later, correct)).toMatchObject({ state: "correct", attempts: 4 });
    expect(mergeExerciseProgress(correct, revealed)).toMatchObject({
      state: "correct",
      revealed: true,
      solvedAt: "2026-10-01",
      updatedAt: "2026-10-02",
    });
  });

  test("between incomplete states the newer record wins", () => {
    const older = { ...base, state: "incorrect" as const, updatedAt: "2026-10-01" };
    const newer = { ...base, state: "attempted" as const, updatedAt: "2026-10-03" };
    expect(mergeExerciseProgress(older, newer).state).toBe("attempted");
    expect(mergeExerciseProgress(newer, older).state).toBe("attempted");
  });

  test("unknown keys are kept", () => {
    const a = { ...base, state: "idle" as const, extra: 1 } as never;
    expect(mergeExerciseProgress(a, { ...base, state: "attempted" })).toMatchObject({ extra: 1 });
  });
});
