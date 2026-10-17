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

const RULER: SimulatorExercise = {
  id: "test-lesson/ruler-step",
  kind: "simulator",
  simulator: "coordinate-ruler",
  title: "Step the ruler to the BED interval",
  prompt: "Move the highlighted base until the ruler shows the BED interval 166,014,901 to 166,014,902.",
  source: "test",
  tags: ["concept"],
  formats: ["bed"],
  concepts: ["coords.zero-based"],
  init: { position: 166_014_900 },
  goals: [
    {
      id: "reach-interval",
      text: "Show the base whose BED interval is 166,014,901 to 166,014,902.",
      when: "showsBedInterval",
      args: { start: 166_014_901, end: 166_014_902 },
      explanation: "The 1-based position 166,014,902 is the BED interval [166,014,901, 166,014,902).",
      witness: [
        { type: "step", by: 1 },
        { type: "step", by: 1 },
      ],
    },
  ],
  textView: "table",
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
    mount("gf-predict", RULER);
    expect(document.querySelector(".widget-error")?.textContent).toContain("is a simulator, not a predict");
  });
});

describe("gf-simulator (Preact island)", () => {
  test("stepping the ruler reaches the goal, completes the card and fires gf:solved once", async () => {
    await import("./simulator.tsx");
    const { host, solved } = mount("gf-simulator", RULER, { "data-mode": "try-it" });
    const cell = () => host.querySelector("tbody tr td")?.textContent;
    expect(cell()).toBe("166,014,900");
    expect(host.querySelector(".card-actions-primary")?.textContent).toBe("Reset");
    const next = [...host.querySelectorAll("button")].find((b) => b.textContent === "Next base")!;
    next.click();
    await vi.waitFor(() => expect(cell()).toBe("166,014,901"));
    expect(solved).not.toHaveBeenCalled();
    next.click();
    await vi.waitFor(() => expect(host.querySelector(".readout")?.textContent).toMatch(/^Goal reached/));
    next.click();
    await vi.waitFor(() => expect(cell()).toBe("166,014,903"));
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ id: RULER.id, state: "correct" });
    expect(host.dataset.state).toBe("correct");
  });

  test("Reset remounts the island at its initial state", async () => {
    await import("./simulator.tsx");
    const { host, buttonNamed } = mount("gf-simulator", RULER);
    const cell = () => host.querySelector("tbody tr td")?.textContent;
    [...host.querySelectorAll("button")].find((b) => b.textContent === "Next base")!.click();
    await vi.waitFor(() => expect(cell()).toBe("166,014,901"));
    buttonNamed("Reset")!.click();
    expect(cell()).toBe("166,014,900");
    expect(host.querySelectorAll(".island")).toHaveLength(1);
  });

  test("disconnecting unmounts the island and reconnecting mounts it again", async () => {
    await import("./simulator.tsx");
    const { host } = mount("gf-simulator", RULER);
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
      useEffect(() => onGoal("reach-interval", "shown"), [onGoal]);
      return null;
    };
    try {
      const { host, solved } = mount("gf-simulator", { ...RULER, simulator: "cigar-drawer" });
      await vi.waitFor(() => expect(host.dataset.state).toBe("revealed"));
      expect(solved.mock.calls[0]?.[0]).toMatchObject({ state: "revealed", revealed: true });
    } finally {
      delete VIEWS["cigar-drawer"];
    }
  });

  test("a simulator without a view shows its notice inside the card", async () => {
    await import("./simulator.tsx");
    const { host } = mount("gf-simulator", { ...RULER, simulator: "cigar-drawer" });
    expect(host.querySelector(".widget-stub")?.textContent).toContain("cigar-drawer simulator");
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
