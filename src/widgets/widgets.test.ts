// @vitest-environment happy-dom
// Widget DOM tests (docs/PLAN.md 11.6) on happy-dom 20.14.5: gf-predict (every input type, the
// lock, per-item reveal rows, Skip and show answer), the simulator host (Preact island, Reset
// remounts it), registration of every tag, and the elements that name a missing id. The other
// types have their own files: mcq, spot-the-error, fix-it, sort, field-explorer, follow-ups,
// quiz and the viewers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { PredictExercise, SimulatorExercise } from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { WIDGET_TAGS } from "./index.ts";
import { matches } from "./predict.ts";
import { TOY_ROW, FIND_THE_BYTE } from "./simulators/test-fixtures.ts";
import { choose, mount, type } from "./test-utils.ts";

const PREDICT: PredictExercise = {
  id: "test-lesson/bed-to-one-based",
  kind: "predict",
  title: "Which base does this BED line cover?",
  prompt: "A BED line reads `chr2 166014901 166014902`. Predict the 1-based position of the base it covers.",
  source: "test",
  tags: ["application", "LO5"],
  formats: ["bed"],
  concepts: ["coords.zero-based"],
  items: [
    {
      label: "1-based position on chr2",
      input: { type: "number", answer: 166_014_902, tolerance: 0 },
      computeWith: { helper: "bedToOneBased", args: { start: 166_014_901 } },
    },
  ],
  reveal: "BED starts are 0-based and ends exclusive, so the interval holds position 166,014,902.",
};

const MULTI: PredictExercise = {
  ...PREDICT,
  id: "test-lesson/four-kinds",
  items: [
    {
      id: "count",
      label: "How many `.fai` rows?",
      input: { type: "choice", options: ["1", "2", "3"], answer: 1 },
      reveal: "The empty record is dropped.",
    },
    {
      id: "errors",
      label: "Expected errors",
      input: { type: "number", answer: 0.101, tolerance: 0.001, unit: "errors" },
    },
    {
      id: "name",
      label: "The name samtools uses",
      input: { type: "text", answer: "chrM_demo", normalize: ["whitespace"] },
    },
    { id: "region", label: "The 1-based region", input: { type: "region", answer: [1001, 1003] } },
  ],
};

/** L05.1 with only its first goal: type position 45 to reach it. */
const BYTE_45: SimulatorExercise = { ...FIND_THE_BYTE, goals: [FIND_THE_BYTE.goals[0]!] };

/** The same simulator with a predict gate (docs/PLAN.md 7.5 `predictGate`). */
const GATED: SimulatorExercise = {
  ...BYTE_45,
  predictGate: {
    id: "predict-byte",
    kind: "predict",
    prompt: "",
    items: [
      {
        label: "Which byte holds base 45 of `chrM_demo`?",
        input: { type: "number", answer: 84, tolerance: 0 },
        computeWith: { helper: "faiByte", args: { position: 45, row: TOY_ROW } },
      },
    ],
    reveal: "38 + 2 × 21 + 4 = byte 84.",
  },
};

/** A simulator id without a view, for host behaviour that tests drive through a stand-in view. */
const STUB: SimulatorExercise = {
  ...BYTE_45,
  id: "test-lesson/stub",
  simulator: "cigar-drawer",
  goals: [{ ...FIND_THE_BYTE.goals[0]!, id: "reach" }],
};

/** The Byte row of the fai-calculator's text view. */
const byteRow = (host: HTMLElement) =>
  [...host.querySelectorAll(".sim-text-view tbody tr")]
    .find((tr) => tr.querySelector("th")?.textContent === "Byte")
    ?.querySelector("td")?.textContent;
const positionInput = (host: HTMLElement) => {
  const label = [...host.querySelectorAll("label")].find(
    (l) => l.textContent?.trim() === "Position (1-based)",
  );
  return host.ownerDocument.getElementById(label!.htmlFor) as HTMLInputElement;
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => document.body.replaceChildren());

describe("gf-predict", () => {
  test("a matching prediction records correct, once", async () => {
    await import("./predict.ts");
    const { host, solved } = mount("gf-predict", PREDICT, { "data-mode": "quick-check" });
    expect(host.querySelector(".card-overline")?.textContent).toBe("Quick check · Predict");
    const input = host.querySelector<HTMLInputElement>(".card-body input")!;
    expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toBe("1-based position on chr2");
    input.value = "166,014,902";
    host.querySelector("form")!.requestSubmit();
    expect(host.querySelector(".card-verdict")?.textContent).toBe(" Correct. Your prediction matches.");
    expect(host.querySelector(".card-explanation")?.textContent).toContain("position 166,014,902");
    expect(input.readOnly).toBe(true);
    expect(host.querySelector(".predict-result")?.textContent?.trim()).toBe(
      "Your prediction: 166,014,902 Matches the answer: 166,014,902",
    );
    host.querySelector("form")!.requestSubmit();
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved).toHaveBeenCalledWith({
      id: PREDICT.id,
      state: "correct",
      attempts: 1,
      firstTry: true,
      revealed: false,
    });
  });

  test("an off-by-one prediction records revealed and shows the answer", async () => {
    await import("./predict.ts");
    const { host, solved } = mount("gf-predict", PREDICT);
    host.querySelector<HTMLInputElement>(".card-body input")!.value = "166014901";
    host.querySelector("form")!.requestSubmit();
    expect(host.querySelector(".card-verdict")?.textContent).toBe(" Answer shown. Here is the answer.");
    expect(host.querySelector(".predict-key")?.textContent?.trim()).toBe("Answer: 166,014,902");
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ state: "revealed", revealed: true, firstTry: false });
  });

  test("Lock in with no prediction asks for one", async () => {
    await import("./predict.ts");
    const { host, solved } = mount("gf-predict", PREDICT);
    host.querySelector("form")!.requestSubmit();
    expect(host.querySelector(".card-verdict")?.textContent).toBe(
      " Enter a prediction for every item first.",
    );
    expect(solved).not.toHaveBeenCalled();
  });

  test("choice, number with unit, text and region items share one lock and get reveal rows", async () => {
    await import("./predict.ts");
    const { host, action, verdict, qa } = mount("gf-predict", MULTI);
    expect(action("Lock in my prediction")).toBeDefined();
    expect(qa(".predict-choices legend")[0]?.textContent).toBe("How many .fai rows?");
    expect(host.querySelector(".predict-unit")?.textContent).toBe("errors");
    choose(qa<HTMLInputElement>('.predict-choices input[type="radio"]')[1]!);
    const texts = qa<HTMLInputElement>("input.predict-input");
    type(texts[0]!, "0.1012");
    type(texts[1]!, "  chrM_demo ");
    type(texts[2]!, "1,001");
    action("Lock in my prediction")!.click();
    expect(verdict()).toBe("Enter a prediction for every item first.");
    type(texts[3]!, "1003");
    action("Lock in my prediction")!.click();
    expect(verdict()).toBe("Correct. Your prediction matches.");
    const rows = qa(".predict-result").map((r) => r.textContent?.replace(/\s+/g, " ").trim());
    expect(rows).toEqual([
      "Your prediction: 2 Matches the answer: 2The empty record is dropped.",
      "Your prediction: 0.1012 errors Matches the answer: 0.101 errors (answers within 0.001 count)",
      "Your prediction: chrM_demo Matches the answer: chrM_demo",
      "Your prediction: 1,001 to 1003 Matches the answer: 1,001 to 1,003",
    ]);
  });

  test("Skip and show answer is always available and records revealed", async () => {
    await import("./predict.ts");
    const { host, action, verdict, solved } = mount("gf-predict", PREDICT);
    action("Skip and show answer")!.click();
    expect(verdict()).toBe("Answer shown. Here is the answer.");
    expect(host.querySelector(".predict-yours")).toBeNull();
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ state: "revealed" });
  });

  test("a saved prediction is restored, read-only, with its reveal rows", async () => {
    await import("./predict.ts");
    store.putExercise(PREDICT.id, {
      state: "revealed",
      attempts: 1,
      firstTry: false,
      revealed: true,
      answer: ["5"],
    });
    const { host } = mount("gf-predict", PREDICT);
    const input = host.querySelector<HTMLInputElement>(".card-body input")!;
    expect(input.value).toBe("5");
    expect(input.readOnly).toBe(true);
    expect(host.querySelector(".predict-yours")?.textContent).toBe("Your prediction: 5");
  });

  test("a predict with a snippet shows it inside the card; its tools are not a prediction", async () => {
    await import("./predict.ts");
    const withSnippet: PredictExercise = {
      ...PREDICT,
      id: "test-lesson/with-snippet",
      snippet: {
        kind: "text",
        format: "fasta",
        filename: "ref.fa",
        provenance: "toy",
        text: ">chr1_tel\nACGT\n",
        caption: "The record `chr1_tel`.",
      },
      items: [
        {
          label: "Which OFFSET?",
          input: { type: "choice", options: ["`10`: counted from 0", "`11`: counted from 1"], answer: 0 },
        },
      ],
    };
    const { host, action, qa } = mount("gf-predict", withSnippet);
    const figure = host.querySelector(".card-body form .snippet-figure");
    expect(figure).not.toBeNull();
    expect(figure?.querySelector("figcaption code")?.textContent).toBe("chr1_tel");
    figure?.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host.dataset.state).toBe("idle");
    choose(qa<HTMLInputElement>('.predict-choices input[type="radio"]')[1]!);
    action("Lock in my prediction")!.click();
    // Choice text keeps its inline marks in the reveal rows, as on the chips.
    expect(host.querySelector(".predict-yours strong code")?.textContent).toBe("11");
    expect(host.querySelector(".predict-key code")?.textContent).toBe("10");
    expect(host.querySelector(".predict-yours")?.textContent).toBe("Your prediction: 11: counted from 1");
  });

  test("matches(): tolerance, normalisation, multi-choice and regions", () => {
    expect(matches({ type: "number", answer: 0.6314, tolerance: 0.001 }, "0.631")).toBe(true);
    expect(matches({ type: "number", answer: 1, tolerance: 0 }, " ")).toBe(false);
    expect(matches({ type: "text", answer: "chr1", normalize: ["case"] }, "CHR1")).toBe(true);
    expect(matches({ type: "text", answer: "chr1" }, "CHR1")).toBe(false);
    expect(matches({ type: "choice", options: ["a", "b", "c"], answer: [0, 2] }, [2, 0])).toBe(true);
    expect(matches({ type: "choice", options: ["a", "b", "c"], answer: [0, 2] }, [0])).toBe(false);
    expect(matches({ type: "region", answer: [1001, 1003] }, ["1,001", "1003"])).toBe(true);
    expect(matches({ type: "region", answer: [1001, 1003] }, ["1000", "1003"])).toBe(false);
  });

  test("an unknown exercise id renders a visible error instead of throwing", async () => {
    await import("./predict.ts");
    document.body.innerHTML = `<gf-predict exercise="test-lesson/nope"></gf-predict>`;
    expect(document.querySelector(".widget-error")?.textContent).toBe(
      'Missing predict exercise "test-lesson/nope".',
    );
  });

  test("an exercise of another kind renders a visible error", async () => {
    await import("./predict.ts");
    mount("gf-predict", BYTE_45);
    expect(document.querySelector(".widget-error")?.textContent).toContain("is a simulator, not a predict");
  });
});

describe("gf-simulator (Preact island)", () => {
  test("reaching the goal completes the card and fires gf:solved once", async () => {
    await import("./simulator.tsx");
    const { host, solved } = mount("gf-simulator", BYTE_45, { "data-mode": "try-it" });
    expect(byteRow(host)).toBe("38 + 0 × 21 + 0 = 38");
    expect(host.querySelector(".card-actions-primary")?.textContent).toBe("Reset");
    type(positionInput(host), "44");
    await vi.waitFor(() => expect(byteRow(host)).toBe("38 + 2 × 21 + 3 = 83"));
    expect(solved).not.toHaveBeenCalled();
    type(positionInput(host), "45");
    await vi.waitFor(() => expect(host.dataset.state).toBe("correct"));
    type(positionInput(host), "46");
    type(positionInput(host), "45");
    await vi.waitFor(() => expect(byteRow(host)).toBe("38 + 2 × 21 + 4 = 84"));
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ id: BYTE_45.id, state: "correct" });
  });

  test("Reset remounts the island at its initial state", async () => {
    await import("./simulator.tsx");
    const { host, buttonNamed } = mount("gf-simulator", FIND_THE_BYTE);
    type(positionInput(host), "44");
    await vi.waitFor(() => expect(byteRow(host)).toBe("38 + 2 × 21 + 3 = 83"));
    buttonNamed("Reset")!.click();
    expect(byteRow(host)).toBe("38 + 0 × 21 + 0 = 38");
    expect(host.querySelectorAll(".island")).toHaveLength(1);
  });

  test("disconnecting unmounts the island and reconnecting mounts it again", async () => {
    await import("./simulator.tsx");
    const { host } = mount("gf-simulator", FIND_THE_BYTE);
    expect(host.querySelector(".island")).not.toBeNull();
    host.remove();
    expect(host.querySelector(".island")).toBeNull();
    document.body.append(host);
    expect(host.querySelector(".island button")).not.toBeNull();
  });

  test("a goal reached through Show me ends the card as Answer shown", async () => {
    const { VIEWS } = await import("./simulator.tsx");
    const { useEffect } = await import("preact/hooks");
    VIEWS["cigar-drawer"] = ({ onGoal }) => {
      useEffect(() => onGoal("reach", "shown"), [onGoal]);
      return null;
    };
    try {
      const { host, solved } = mount("gf-simulator", STUB);
      await vi.waitFor(() => expect(host.dataset.state).toBe("revealed"));
      expect(solved.mock.calls[0]?.[0]).toMatchObject({ state: "revealed", revealed: true });
    } finally {
      delete VIEWS["cigar-drawer"];
    }
  });

  test("a simulator without a view shows its notice inside the card", async () => {
    await import("./simulator.tsx");
    const { host } = mount("gf-simulator", STUB);
    expect(host.querySelector(".widget-stub")?.textContent).toContain("cigar-drawer simulator");
  });

  test("only the M1 simulators have views; the M0 ruler placeholder does not ship", async () => {
    const { VIEWS } = await import("./simulator.tsx");
    expect(Object.keys(VIEWS).sort()).toEqual(["bgzf-demo", "fai-calculator", "phred-converter"]);
  });
});

describe("gf-simulator with a predict gate", () => {
  const gate = (host: HTMLElement) => host.querySelector<HTMLElement>(".sim-gate")!;
  const lockIn = (host: HTMLElement, value: string) => {
    type(gate(host).querySelector<HTMLInputElement>("input")!, value);
    gate(host).querySelector<HTMLButtonElement>(".card-actions .button-primary")!.click();
  };

  test("the island opens only once the prediction is locked in; a match ends Correct", async () => {
    await import("./simulator.tsx");
    const { host, solved, live } = mount("gf-simulator", GATED, { "data-mode": "try-it" });
    expect(gate(host).querySelector(".card-overline")?.textContent).toBe("Predict first · Predict");
    expect(gate(host).querySelector("label")?.textContent).toBe("Which byte holds base 45 of chrM_demo?");
    expect(host.querySelector(".island")).toBeNull();
    expect(host.querySelector<HTMLElement>(".sim-gate-note")!.hidden).toBe(false);
    expect(byteRow(host)).toBeUndefined();
    type(gate(host).querySelector<HTMLInputElement>("input")!, "84");
    expect(host.dataset.state).toBe("attempted");
    gate(host).querySelector<HTMLButtonElement>(".card-actions .button-primary")!.click();
    expect(gate(host).dataset.state).toBe("correct");
    expect(host.querySelector(".island")).not.toBeNull();
    expect(host.querySelector<HTMLElement>(".sim-gate-note")!.hidden).toBe(true);
    expect(live()).toBe("The simulator is open below the prediction.");
    expect(store.getExercise(GATED.id)?.answer).toMatchObject({ gate: { state: "correct", answer: ["84"] } });
    type(positionInput(host), "45");
    await vi.waitFor(() => expect(host.dataset.state).toBe("correct"));
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ state: "correct", firstTry: true });
  });

  test("a prediction that does not match still opens the simulator, and ends Answer shown", async () => {
    await import("./simulator.tsx");
    const { host, solved, verdict } = mount("gf-simulator", GATED);
    lockIn(host, "85");
    expect(gate(host).dataset.state).toBe("revealed");
    type(positionInput(host), "45");
    await vi.waitFor(() => expect(host.dataset.state).toBe("revealed"));
    expect(verdict()).toBe("Answer shown. Every goal reached; your prediction did not match.");
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ state: "revealed" });
  });

  test("a reload keeps the locked prediction and the open simulator; Reset closes it again", async () => {
    await import("./simulator.tsx");
    const first = mount("gf-simulator", GATED);
    lockIn(first.host, "84");
    first.host.remove();
    const { host, action } = mount("gf-simulator", GATED);
    expect(gate(host).dataset.state).toBe("correct");
    expect(gate(host).querySelector<HTMLInputElement>("input")!.value).toBe("84");
    expect(host.querySelector(".island")).not.toBeNull();
    action("Reset")!.click();
    expect(gate(host).dataset.state).toBe("idle");
    expect(gate(host).querySelector<HTMLInputElement>("input")!.value).toBe("");
    expect(host.querySelector(".island")).toBeNull();
    expect(host.querySelector<HTMLElement>(".sim-gate-note")!.hidden).toBe(false);
  });
});

describe("registration and missing ids", () => {
  test("every widget tag is defined", async () => {
    await import("./index.ts");
    for (const tag of WIDGET_TAGS) expect(customElements.get(tag), tag).toBeDefined();
  });

  test.each([
    ["gf-mcq", "mcq"],
    ["gf-sort", "sort"],
    ["gf-spot-the-error", "spot-the-error"],
    ["gf-fix-it", "fix-it"],
    ["gf-field-explorer", "field-explorer"],
    ["gf-simulator", "simulator"],
  ])("%s with an unknown id renders a visible error", async (tag, kind) => {
    await import("./index.ts");
    document.body.innerHTML = `<${tag} exercise="test-lesson/nope"></${tag}>`;
    expect(document.querySelector(".widget-error")?.textContent).toBe(
      `Missing ${kind} exercise "test-lesson/nope".`,
    );
    expect(document.querySelector(".widget-error")?.getAttribute("role")).toBe("alert");
  });

  test("gf-quiz and gf-snippet name a missing id visibly", async () => {
    await import("./index.ts");
    document.body.innerHTML = `<gf-quiz section="nowhere"></gf-quiz><gf-snippet snippet="x/y"></gf-snippet>`;
    expect([...document.querySelectorAll(".widget-error")].map((e) => e.textContent)).toEqual([
      'Missing quiz for section "nowhere".',
      'Missing snippet "x/y".',
    ]);
  });

  test("gf-pipeline-map lists the nodes and marks the highlighted ones", async () => {
    await import("./index.ts");
    document.body.innerHTML = `<gf-pipeline-map highlight="fasta,fastq"></gf-pipeline-map>`;
    const current = [...document.querySelectorAll("li[data-current]")].map((li) => li.textContent);
    expect(current).toEqual([
      "FASTA reference: Compared with what? (this section)",
      "FASTQ: What did the sequencer read? (this section)",
    ]);
  });
});
