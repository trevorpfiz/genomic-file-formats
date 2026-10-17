// @vitest-environment happy-dom
// gf-field-explorer (docs/PLAN.md 7.4; ux 8.9): fields as grid cells described by their legend
// rows, the popover on focus (Esc dismisses, Enter pins), the explored counter, exploring alone
// never completes, the embedded check grades through the card's Check, and an explorer with
// follow-ups only completes when they do.
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import type { FieldExplorerExercise } from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { choose, mount, press, type } from "./test-utils.ts";
import "./field-explorer.ts";

const HEADER = ">chr1  AC:CM000663.2  LN:248956422  M5:6aef897c3d6ff0c78aff06ac189178dd";
const span = (token: string): [number, number] => {
  const start = HEADER.indexOf(token);
  return [start, start + token.length];
};

const EXPLORER: FieldExplorerExercise = {
  id: "test-lesson/broad-header",
  kind: "field-explorer",
  title: "Read the Broad chr1 header",
  prompt: "Explore each token of this header.",
  source: "test",
  tags: ["concept"],
  formats: ["fasta"],
  concepts: ["fasta.header-metadata"],
  snippet: {
    filename: "Homo_sapiens_assembly38.fasta",
    format: "fasta",
    kind: "text",
    provenance: "real-file",
    text: `${HEADER}\n`,
  },
  fields: [
    {
      line: 1,
      span: span("chr1"),
      name: "name",
      meaning: "The sequence name: the first word after `>`.",
      cite: "faidx(5)",
    },
    {
      line: 1,
      span: span("LN:248956422"),
      name: "LN",
      meaning: "The length in bases.",
      allowed: "a positive integer",
      cite: "Broad bundle",
    },
    {
      line: 1,
      span: span("M5:6aef897c3d6ff0c78aff06ac189178dd"),
      name: "M5",
      meaning: "The MD5 of the sequence.",
      cite: "SAMv1 §1.3",
    },
  ],
  check: {
    id: "check",
    kind: "mcq",
    prompt: "Apply what you found.",
    multi: false,
    stem: "Which token does samtools use as the sequence name?",
    options: [
      { id: "a", text: "`chr1`", correct: true, explanation: "The first word is the name." },
      { id: "b", text: "`AC:CM000663.2`", correct: false, explanation: "Description text." },
    ],
  },
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => document.body.replaceChildren());

const cell = (host: HTMLElement, i: number) => host.querySelector<HTMLElement>(`[data-key="F${i}"]`)!;

describe("exploring", () => {
  test("each field is a grid cell named by field and described by its legend row", () => {
    const { host, q, qa } = mount("gf-field-explorer", EXPLORER);
    expect(qa('[role="gridcell"]')).toHaveLength(3);
    expect(cell(host, 0).getAttribute("aria-label")).toBe("Field 1 of 3, name, value chr1");
    expect(cell(host, 2).getAttribute("aria-label")).toBe(
      "Field 3 of 3, M5, value M5:6aef897c3d6ff0c78aff06ac189178dd",
    );
    const legend = document.getElementById(cell(host, 1).getAttribute("aria-describedby")!)!;
    expect(legend.textContent).toBe(
      "2 LN characters 23 to 34Value: LN:248956422The length in bases.Allowed: a positive integerSource: Broad bundle",
    );
    expect(q(".fe-counter")?.textContent).toBe("Explored 0 of 3 fields");
  });

  test("focus shows the popover and marks the field explored; arrows move; Esc hides", () => {
    const { host, q } = mount("gf-field-explorer", EXPLORER);
    cell(host, 0).focus();
    const popover = q(".fe-popover")!;
    expect(popover.hidden).toBe(false);
    expect(popover.getAttribute("aria-hidden")).toBe("true");
    expect(popover.querySelector(".fe-popover-title")?.textContent).toBe("name");
    expect(q(".fe-legend-row[data-active]")?.dataset.field).toBe("0");
    expect(q(".fe-counter")?.textContent).toBe("Explored 1 of 3 fields");
    expect(host.dataset.state).toBe("attempted");
    press(cell(host, 0), "ArrowRight");
    expect(document.activeElement).toBe(cell(host, 1));
    expect(popover.querySelector(".fe-popover-title")?.textContent).toBe("LN");
    expect(cell(host, 0).dataset.mark).toBe("visited");
    press(cell(host, 1), "Escape");
    expect(popover.hidden).toBe(true);
  });

  test("Enter pins the popover so hovering elsewhere keeps it", () => {
    const { host, q } = mount("gf-field-explorer", EXPLORER);
    cell(host, 1).focus();
    press(cell(host, 1), "Enter");
    expect(q(".fe-popover")?.dataset.pinned).toBe("true");
    cell(host, 2).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(q(".fe-popover-title")?.textContent).toBe("LN");
  });

  test("Done exploring marks every field explored and moves to the question", () => {
    const { q, buttonNamed } = mount("gf-field-explorer", EXPLORER);
    buttonNamed("Done exploring")!.click();
    expect(q(".fe-counter")?.textContent).toBe("Explored 3 of 3 fields");
    expect(document.activeElement).toBe(q(".fe-check input"));
  });
});

describe("completion", () => {
  test("exploring alone never completes; the embedded check does, once", () => {
    const { host, q, action, verdict, solved } = mount("gf-field-explorer", EXPLORER);
    for (let i = 0; i < 3; i += 1) cell(host, i).focus();
    expect(host.dataset.state).toBe("attempted");
    expect(solved).not.toHaveBeenCalled();
    expect(q(".fe-check-prompt")?.textContent).toBe("Apply what you found.");
    choose(host.querySelectorAll<HTMLInputElement>(".fe-check input")[1]!);
    action("Check")!.click();
    expect(verdict()).toBe("Not quite. Read the note under your choice, then try again.");
    choose(host.querySelectorAll<HTMLInputElement>(".fe-check input")[0]!);
    action("Check")!.click();
    expect(verdict()).toBe("Correct.");
    expect(solved).toHaveBeenCalledTimes(1);
    expect(store.getExercise(EXPLORER.id)?.answer).toEqual({ visited: [0, 1, 2], check: ["a"] });
  });

  test("a reload restores the explored fields and the check", () => {
    store.putExercise(EXPLORER.id, {
      state: "correct",
      attempts: 1,
      firstTry: true,
      revealed: false,
      answer: { visited: [0, 2], check: ["a"] },
    });
    const { host, q } = mount("gf-field-explorer", EXPLORER);
    expect(q(".fe-counter")?.textContent).toBe("Explored 2 of 3 fields");
    expect(host.querySelector<HTMLInputElement>(".fe-check input")!.checked).toBe(true);
    expect(host.dataset.state).toBe("correct");
  });

  test("follow-ups only: no Check; the card completes when the follow-up does", () => {
    const { check: _check, ...rest } = EXPLORER;
    const exercise = {
      ...rest,
      id: "test-lesson/broad-header-followups",
      followUps: [
        {
          id: "length",
          kind: "predict" as const,
          prompt: "",
          items: [
            {
              label: "Length of chr1 in bases",
              input: { type: "number" as const, answer: 248956422, tolerance: 0 },
            },
          ],
          reveal: "LN says 248,956,422.",
        },
      ],
    } satisfies FieldExplorerExercise;
    const { host, action, solved } = mount("gf-field-explorer", exercise);
    expect(action("Check")).toBeUndefined();
    const followUp = host.querySelector<HTMLElement>(".follow-up")!;
    type(followUp.querySelector("input")!, "248,956,422");
    followUp.querySelector<HTMLButtonElement>(".card-actions .button-primary")!.click();
    expect(host.dataset.state).toBe("correct");
    expect(solved).toHaveBeenCalledTimes(1);
  });
});
