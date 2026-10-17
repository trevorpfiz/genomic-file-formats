// @vitest-environment happy-dom
// gf-spot-the-error (docs/PLAN.md 7.1; ux 8.6): the grid and its keyboard path, line
// descriptions that tell a defective line apart without giving it away, fine-here and knock-on
// picks, multi-round counters, the "Tools disagree" badge, field granularity, the reveal policy
// (hint after 2, Show answer after 3), gf:solved exactly once, restore and quiz single pick.
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import type { SpotRound, SpotTheErrorExercise } from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { mount, press } from "./test-utils.ts";
import "./spot-the-error.ts";

const FASTA_ROUND: SpotRound = {
  id: "a",
  snippet: {
    filename: "chrM_demo.fa",
    format: "fasta",
    kind: "text",
    provenance: "toy",
    text: ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGG\nagctctccatgcatttggta\nTTTT\n",
  },
  granularity: "line",
  validation: { format: "fasta", profile: {} },
  answers: [{ line: 3, rule: "FA-S02", explanation: "Line 3 has 16 bases in a record whose lines have 20." }],
  fineHere: { "4": "Lowercase is a masked repeat; the bases are the same." },
  toolsSay: 'Tools say: samtools reports `unexpected "A" at line 4`.',
};

const SPOT: SpotTheErrorExercise = {
  id: "test-lesson/why-wont-this-index",
  kind: "spot-the-error",
  title: "Why won't this index?",
  prompt: "One line stops samtools from indexing this file. Find it.",
  source: "test",
  tags: ["validity"],
  formats: ["fasta"],
  concepts: ["fasta.line-width"],
  hints: ["Compare the lengths of the sequence lines.", "Only a record's last line may be shorter."],
  rounds: [FASTA_ROUND],
};

const RECORD = "@r1 1:N:0:ACGT\nGATCACAGGTCTATCACCCT\n";
const FASTQ: SpotTheErrorExercise = {
  ...SPOT,
  id: "test-lesson/three-records",
  formats: ["fastq"],
  rounds: [
    {
      id: "a",
      label: "Record (a)",
      snippet: {
        filename: "a.fastq",
        format: "fastq",
        kind: "text",
        provenance: "toy",
        text: `${RECORD}+\nFFFFFFFFFFFFFFFFFFF\n`,
      },
      granularity: "line",
      validation: { format: "fastq", profile: {} },
      answers: [{ line: 4, rule: "FQ-S04", explanation: "19 quality characters for 20 bases." }],
    },
    {
      id: "b",
      label: "Record (b)",
      snippet: {
        filename: "b.fastq",
        format: "fastq",
        kind: "text",
        provenance: "toy",
        text: `${RECORD}+r2 1:N:0:ACGT\nFFFFFFFFFFFFFFFFFFFF\n`,
      },
      granularity: "line",
      validation: { format: "fastq", profile: {} },
      answers: [{ line: 3, rule: "FQ-S03", explanation: "The repeated title differs from line 1." }],
      toolsSay: "Tools say: Biopython rejects this record; samtools fqidx 1.24 accepts it.",
      toolsDisagree: true,
    },
    {
      id: "c",
      label: "Record (c)",
      snippet: {
        filename: "c.fastq",
        format: "fastq",
        kind: "text",
        provenance: "toy",
        text: `>r1\nGATC\n+\nFFFF\n`,
      },
      granularity: "line",
      validation: { format: "fastq", profile: {} },
      answers: [{ line: 1, rule: "FQ-S01", explanation: "FASTQ titles start with `@`." }],
      acceptAlso: [{ line: 3, note: "The `+` line is fine once line 1 is a title." }],
    },
  ],
};

const BED_FIELDS: SpotTheErrorExercise = {
  ...SPOT,
  id: "test-lesson/bad-strand",
  formats: ["bed"],
  rounds: [
    {
      id: "a",
      snippet: {
        filename: "targets.bed",
        format: "bed",
        kind: "text",
        provenance: "toy",
        text: "chr2\t100\t200\tt1\t0\t+\nchr2\t300\t400\tt2\t0\t*\n",
      },
      granularity: "field",
      validation: { format: "bed", profile: {} },
      answers: [{ line: 2, field: "strand", rule: "BED-S09", explanation: "Strand is `+`, `-` or `.`." }],
      fineHere: { "2:score": "A score of 0 is allowed." },
    },
  ],
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => document.body.replaceChildren());

const cells = (root: Element) => [...root.querySelectorAll<HTMLElement>('[role="gridcell"][data-key]')];
const cell = (root: Element, key: string) => root.querySelector<HTMLElement>(`[data-key="${key}"]`)!;

describe("the grid and its descriptions", () => {
  test("one gridcell per line; names end with a description that tells line 3 apart", () => {
    const { host, q } = mount("gf-spot-the-error", SPOT, { "data-mode": "try-it" });
    expect(q('[role="grid"]')?.getAttribute("aria-multiselectable")).toBe("true");
    const names = cells(host).map((c) => c.getAttribute("aria-label")!);
    expect(names).toHaveLength(5);
    const lengths = names.map((n) => n.match(/(\d+) characters/)?.[1]);
    expect(lengths).toEqual(["37", "20", "16", "20", "4"]);
    // Among the record's lines before the last, only line 3 differs: the tree alone tells it apart.
    expect(lengths.slice(1, 4).filter((l) => l !== "20")).toEqual(["16"]);
    expect(names[2]).toBe("Line 3, ATTAACCACTCACGGG, 16 characters, no tabs or spaces");
    expect(q(".spot-counter")?.textContent).toBe("Find the 1 error.");
  });
});

describe("picking and checking", () => {
  test("a fine pick stays marked with its note; a second check with nothing new asks for a pick", () => {
    const { host, action, verdict, live } = mount("gf-spot-the-error", SPOT);
    cell(host, "L4").click();
    expect(cell(host, "L4").getAttribute("aria-selected")).toBe("true");
    expect(host.dataset.state).toBe("attempted");
    action("Check")!.click();
    expect(verdict()).toBe(
      "Not quite. Errors found: 0 of 1. What you picked that is fine stays marked, so you need not check it again.",
    );
    const fine = cell(host, "L4");
    expect(fine.dataset.mark).toBe("fine");
    expect(fine.getAttribute("aria-selected")).toBe("false");
    const note = document.getElementById(fine.getAttribute("aria-describedby")!)!;
    expect(note.textContent).toBe(
      "Checked: fine here. Lowercase is a masked repeat; the bases are the same.",
    );
    fine.click();
    expect(fine.getAttribute("aria-selected")).toBe("false");
    expect(live()).toBe("You already checked this line.");
    action("Check")!.click();
    expect(verdict()).toBe("Select the line you think is wrong first.");
  });

  test("keyboard only: arrows, Space, Ctrl+Enter; the found line gets its explanation row", () => {
    const { host, verdict, solved, q } = mount("gf-spot-the-error", SPOT);
    const first = cells(host)[0]!;
    first.focus();
    press(first, "ArrowDown");
    press(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(cell(host, "L3"));
    press(cell(host, "L3"), " ");
    expect(cell(host, "L3").getAttribute("aria-selected")).toBe("true");
    press(cell(host, "L3"), "Enter", { ctrlKey: true });
    expect(verdict()).toBe("Correct. You found the error.");
    expect(document.activeElement).toBe(q(".card-verdict"));
    expect(cell(host, "L3").dataset.mark).toBe("found");
    expect(q(".snippet-note")?.textContent).toBe(
      "Error found. Line 3 has 16 bases in a record whose lines have 20.",
    );
    expect(q(".spot-tools")?.hidden).toBe(false);
    expect(cells(host).every((c) => c.getAttribute("aria-disabled") === "true")).toBe(true);
    expect(q(".spot-counter")?.textContent).toBe("Errors found: 1 of 1.");
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved.mock.calls[0]![0]).toMatchObject({ state: "correct", firstTry: true });
  });

  test("hint after 2 checks, Show answer after 3; the reveal marks the answer", () => {
    const { host, action, verdict, solved } = mount("gf-spot-the-error", SPOT);
    const miss = (key: string) => {
      cell(host, key).click();
      action("Check")!.click();
    };
    miss("L1");
    expect(action("Hint")!.hidden).toBe(true);
    miss("L2");
    expect(action("Hint")!.hidden).toBe(false);
    expect(action("Show answer")!.hidden).toBe(true);
    miss("L5");
    action("Show answer")!.click();
    expect(verdict()).toBe("Answer shown. Every error is marked, with the rule it breaks.");
    expect(cell(host, "L3").dataset.mark).toBe("revealed");
    expect(host.querySelector(".spot-counter")?.textContent).toBe("Errors found: 0 of 1; 1 shown.");
    expect(solved.mock.calls[0]![0]).toMatchObject({ state: "revealed", attempts: 3 });
  });
});

describe("rounds, knock-ons and tools", () => {
  test("three rounds: partial counts, a knock-on that is not marked wrong, Tools disagree", () => {
    const { action, verdict, qa } = mount("gf-spot-the-error", FASTQ);
    const rounds = qa(".spot-round");
    expect(rounds.map((r) => r.querySelector(".spot-round-label")?.textContent)).toEqual([
      "Record (a)",
      "Record (b)",
      "Record (c)",
    ]);
    cell(rounds[0]!, "L4").click();
    cell(rounds[2]!, "L3").click();
    action("Check")!.click();
    expect(verdict()).toBe("Not quite. Errors found: 1 of 3.");
    expect(cell(rounds[2]!, "L3").dataset.mark).toBe("knock-on");
    expect(rounds[2]!.querySelector(".snippet-note")?.textContent).toBe(
      "Knock-on. The + line is fine once line 1 is a title.",
    );
    expect(rounds[1]!.querySelector<HTMLElement>(".spot-tools")!.hidden).toBe(true);
    cell(rounds[1]!, "L3").click();
    cell(rounds[2]!, "L1").click();
    action("Check")!.click();
    expect(verdict()).toBe("Correct. You found all 3 errors.");
    const tools = rounds[1]!.querySelector<HTMLElement>(".spot-tools")!;
    expect(tools.hidden).toBe(false);
    expect(tools.textContent).toBe(
      " Tools disagreeTools say: Biopython rejects this record; samtools fqidx 1.24 accepts it.",
    );
  });

  test("field granularity: a field's name is its schema name, and fineHere keys by field", () => {
    const { host, action, verdict } = mount("gf-spot-the-error", BED_FIELDS);
    expect(cell(host, "L2:6").getAttribute("aria-label")).toBe("Line 2, field 6 of 6, strand, value *");
    cell(host, "L2:5").click();
    action("Check")!.click();
    expect(host.querySelector(".snippet-note")?.textContent).toBe(
      "Checked: fine here. A score of 0 is allowed.",
    );
    cell(host, "L2:6").click();
    action("Check")!.click();
    expect(verdict()).toBe("Correct. You found the error.");
  });
});

describe("persistence and quiz mode", () => {
  test("a reload restores found and fine marks without firing gf:solved", () => {
    store.putExercise(FASTQ.id, {
      state: "incorrect",
      attempts: 1,
      firstTry: false,
      revealed: false,
      answer: {
        a: { selected: [], found: [0], fine: [], knock: [] },
        c: { selected: ["L1"], found: [], fine: ["L2"], knock: [] },
      },
    });
    const { host, qa, solved } = mount("gf-spot-the-error", FASTQ);
    const rounds = qa(".spot-round");
    expect(cell(rounds[0]!, "L4").dataset.mark).toBe("found");
    expect(cell(rounds[2]!, "L2").dataset.mark).toBe("fine");
    expect(cell(rounds[2]!, "L1").getAttribute("aria-selected")).toBe("true");
    expect(host.dataset.state).toBe("incorrect");
    expect(solved).not.toHaveBeenCalled();
  });

  test("single pick: a second selection replaces the first; submit grades and shows the answer", () => {
    const { host, q } = mount("gf-spot-the-error", { ...SPOT, singlePick: true }, { "data-mode": "quiz" });
    const card = (host as HTMLElement & { card?: { submit(): boolean } }).card!;
    expect(q('[role="grid"]')?.getAttribute("aria-multiselectable")).toBe("false");
    cell(host, "L2").click();
    cell(host, "L4").click();
    expect(
      cells(host)
        .filter((c) => c.getAttribute("aria-selected") === "true")
        .map((c) => c.dataset.key),
    ).toEqual(["L4"]);
    expect(card.submit()).toBe(false);
    expect(cell(host, "L4").dataset.mark).toBe("fine");
    expect(cell(host, "L3").dataset.mark).toBe("revealed");
    expect(q(".card-verdict")?.textContent?.trim()).toBe("Not quite. Errors found: 0 of 1.");
  });

  test("an unknown id renders a visible error", () => {
    document.body.innerHTML = `<gf-spot-the-error exercise="test-lesson/nope"></gf-spot-the-error>`;
    expect(document.querySelector(".widget-error")?.textContent).toBe(
      'Missing spot-the-error exercise "test-lesson/nope".',
    );
  });
});
