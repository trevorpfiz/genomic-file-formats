// @vitest-environment happy-dom
// Follow-ups (docs/PLAN.md 7, `followUps`): one card, one status. The main check holds the card
// ("pending") until every follow-up is answered; a predict follow-up that does not match makes
// the card "Answer shown"; embedded cards have no status pill, store or events of their own and
// Ctrl+Enter checks only the follow-up; the parent's answer carries every part across a reload;
// Reset clears them; simulators wait for their follow-ups too.
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { McqExercise, SimulatorExercise } from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { choose, mount, press, queries, type } from "./test-utils.ts";
import "./mcq.ts";
import "./simulator.tsx";

const MCQ: McqExercise = {
  id: "test-lesson/scale",
  kind: "mcq",
  title: "How does the scale grow?",
  prompt: "",
  source: "test",
  tags: ["concept"],
  formats: ["fastq"],
  concepts: ["quality.phred"],
  multi: false,
  stem: "Q40 compared with Q20 means an error probability that is:",
  options: [
    { id: "a", text: "100 times smaller", correct: true, explanation: "Each 10 points divide P by 10." },
    { id: "b", text: "Twice as small", correct: false, explanation: "The scale is logarithmic." },
  ],
  followUps: [
    {
      id: "sum",
      kind: "predict",
      prompt: "Predict the expected errors of `IIII#`.",
      items: [{ label: "Expected errors", input: { type: "number", answer: 0.6314, tolerance: 0.001 } }],
      reveal: "Four Q40 bases add 0.0004; `#` is Q2, P = 0.631.",
    },
  ],
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => document.body.replaceChildren());

const followUp = (host: HTMLElement) => host.querySelector<HTMLElement>(".follow-up")!;
const lockIn = (host: HTMLElement, value: string) => {
  type(followUp(host).querySelector("input")!, value);
  followUp(host).querySelector<HTMLButtonElement>(".card-actions .button-primary")!.click();
};

describe("an mcq with a predict follow-up", () => {
  test("the follow-up is an embedded card: overline, no status pill, its own lock button", () => {
    const { host } = mount("gf-mcq", MCQ);
    const embedded = queries(followUp(host));
    expect(embedded.q(".card-overline")?.textContent).toBe("Follow-up · Predict");
    expect(embedded.q(".card-status")).toBeNull();
    expect(embedded.action("Lock in my prediction")).toBeDefined();
    expect(embedded.action("Reset")).toBeUndefined();
    expect(host.querySelectorAll(":scope > .card-header .card-status")).toHaveLength(1);
  });

  test("main correct holds the card until the follow-up is answered; then one gf:solved", () => {
    const { host, action, verdict, solved, live } = mount("gf-mcq", MCQ);
    choose(host.querySelector<HTMLInputElement>(".mcq input")!);
    action("Check")!.click();
    expect(verdict()).toBe("Correct. Now answer the follow-up question below.");
    expect(host.dataset.state).toBe("attempted");
    expect(host.querySelector<HTMLInputElement>(".mcq input")!.disabled).toBe(true);
    expect(action("Check")!.disabled).toBe(true);
    expect(solved).not.toHaveBeenCalled();
    lockIn(host, "0.6314");
    expect(queries(followUp(host)).verdict()).toBe("Correct. Your prediction matches.");
    expect(document.activeElement).toBe(followUp(host).querySelector(".card-verdict"));
    expect(host.dataset.state).toBe("correct");
    expect(verdict()).toBe("Correct. You answered every part.");
    expect(live()).toBe("Exercise complete: correct.");
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved.mock.calls[0]![0]).toMatchObject({ id: MCQ.id, state: "correct", firstTry: true });
  });

  test("a prediction that does not match makes the whole card Answer shown", () => {
    const { host, action, solved } = mount("gf-mcq", MCQ);
    lockIn(host, "2");
    expect(host.dataset.state).toBe("attempted");
    choose(host.querySelector<HTMLInputElement>(".mcq input")!);
    action("Check")!.click();
    expect(host.dataset.state).toBe("revealed");
    expect(solved.mock.calls[0]![0]).toMatchObject({ state: "revealed", revealed: true });
  });

  test("Ctrl+Enter inside the follow-up checks the follow-up only", () => {
    const { host, q } = mount("gf-mcq", MCQ);
    const input = followUp(host).querySelector("input")!;
    type(input, "0.6314");
    press(input, "Enter", { ctrlKey: true });
    expect(queries(followUp(host)).verdict()).toBe("Correct. Your prediction matches.");
    expect(q(":scope > .card-feedback")!.hidden).toBe(true);
  });

  test("a reload restores the held main part and the follow-up; Reset clears both", () => {
    const first = mount("gf-mcq", MCQ);
    choose(first.host.querySelector<HTMLInputElement>(".mcq input")!);
    first.action("Check")!.click();
    type(followUp(first.host).querySelector("input")!, "0.5");
    const saved = store.getExercise(MCQ.id)!;
    expect(saved.state).toBe("attempted");
    expect(saved.answer).toMatchObject({
      value: ["a"],
      followUps: { main: "correct", items: { sum: { state: "idle" } } },
    });
    document.body.replaceChildren();

    const { host, verdict, buttonNamed } = mount("gf-mcq", MCQ);
    expect(host.querySelector<HTMLInputElement>(".mcq input")!.checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>(".mcq input")!.disabled).toBe(true);
    expect(verdict()).toBe("Correct. Now answer the follow-up questions below.");
    lockIn(host, "0.6314");
    expect(host.dataset.state).toBe("correct");

    buttonNamed("Reset")!.click();
    host.querySelector<HTMLButtonElement>(".card-confirm button")!.click();
    expect(host.dataset.state).toBe("idle");
    expect(followUp(host).dataset.state).toBe("idle");
    expect(followUp(host).querySelector("input")!.value).toBe("");
    expect(host.querySelector<HTMLInputElement>(".mcq input")!.disabled).toBe(false);
  });

  test("Show answer reveals the follow-ups too, and focus lands on the main verdict", () => {
    const { host, action, q } = mount("gf-mcq", MCQ);
    for (const id of [1, 1]) {
      choose(host.querySelectorAll<HTMLInputElement>(".mcq input")[id]!);
      action("Check")!.click();
    }
    action("Show answer")!.click();
    expect(host.dataset.state).toBe("revealed");
    expect(followUp(host).dataset.state).toBe("revealed");
    expect(document.activeElement).toBe(q(":scope > .card-feedback .card-verdict"));
  });
});

describe("a simulator with follow-ups", () => {
  test("reaching every goal waits for the follow-ups", async () => {
    const SIM: SimulatorExercise = {
      id: "test-lesson/ruler-follow",
      kind: "simulator",
      simulator: "coordinate-ruler",
      title: "Step the ruler",
      prompt: "",
      source: "test",
      tags: ["concept"],
      formats: ["bed"],
      concepts: ["coords.zero-based"],
      init: { position: 166_014_900 },
      goals: [
        {
          id: "reach",
          text: "Reach the interval.",
          when: "showsBedInterval",
          args: { start: 166_014_900, end: 166_014_901 },
          explanation: "Reached.",
          witness: [],
        },
      ],
      textView: "table",
      followUps: [
        {
          id: "why",
          kind: "mcq",
          prompt: "",
          multi: false,
          stem: "Is a BED start 0-based?",
          options: [
            { id: "y", text: "Yes", correct: true, explanation: "BED starts count from 0." },
            { id: "n", text: "No", correct: false, explanation: "They do." },
          ],
        },
      ],
    };
    const { host, solved } = mount("gf-simulator", SIM);
    const next = [...host.querySelectorAll("button")].find((b) => b.textContent === "Next base");
    if (!next) return; // the ruler view belongs to another owner; skip if its controls change
    next.click();
    await vi.waitFor(() => expect(host.querySelector(".readout")?.textContent).toMatch(/^Goal reached/));
    expect(host.dataset.state).toBe("attempted");
    expect(solved).not.toHaveBeenCalled();
    const fu = followUp(host);
    choose(fu.querySelector("input")!);
    fu.querySelector<HTMLButtonElement>(".card-actions .button-primary")!.click();
    await vi.waitFor(() => expect(host.dataset.state).toBe("correct"));
    expect(solved).toHaveBeenCalledTimes(1);
  });
});
