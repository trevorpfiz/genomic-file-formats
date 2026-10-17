// @vitest-environment happy-dom
// gf-sort (docs/PLAN.md 7.3; ux 8.8): the keyboard pickup path (Space or Enter, arrows, Enter,
// Esc) with announcements, "Move here", the "Place in" select, pointer drag, Check only when
// every item is placed, wrong items back to Unsorted and correct ones locked, Show answer, the
// ordered and matrix variants, restore and quiz mode.
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import type { SortExercise } from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { mount, press, type } from "./test-utils.ts";
import "./sort.ts";

const SORT: SortExercise = {
  id: "test-lesson/which-file",
  kind: "sort",
  title: "Which file is this?",
  prompt: "Place each first line in the bin for its format.",
  source: "test",
  tags: ["recognition"],
  formats: ["fasta", "fastq", "fai", "bed"],
  concepts: ["recognition.first-bytes"],
  bins: [
    { id: "fasta", label: "FASTA" },
    { id: "fastq", label: "FASTQ" },
    { id: "fai", label: ".fai" },
    { id: "bed", label: "BED" },
  ],
  items: [
    { id: "i1", content: "`>chr1 GRCh38`", bin: "fasta", why: "A `>` header line starts a FASTA record." },
    { id: "i2", content: "`@r1 1:N:0:ACGT`", bin: "fastq", why: "`@` then a read ID starts a FASTQ record." },
    {
      id: "i3",
      content: "`chr1\t248956422\t112\t100\t101`",
      bin: "fai",
      why: "Five numbers per sequence.",
      toolsSay: "Tools say: as BED, start > end.",
    },
    { id: "i4", content: "`chr1\t10000\t10036`", bin: "bed", why: "Three columns: chrom, start, end." },
  ],
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => document.body.replaceChildren());

const item = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`[data-item="${id}"]`)!;
const handle = (host: HTMLElement, id: string) =>
  item(host, id).querySelector<HTMLButtonElement>(".sort-handle")!;
const zoneOf = (host: HTMLElement, id: string) =>
  item(host, id).closest<HTMLElement>(".sort-zone")!.dataset.bin;
const place = (host: HTMLElement, id: string, bin: string) =>
  type(item(host, id).querySelector<HTMLSelectElement>("select")!, bin);

describe("moving items", () => {
  test("everything starts in Unsorted; handles name the item and where it is", () => {
    const { host, qa } = mount("gf-sort", SORT);
    expect(qa(".sort-zone-title").map((t) => t.textContent)).toEqual([
      "Unsorted · 4",
      "FASTA · 0",
      "FASTQ · 0",
      ".fai · 0",
      "BED · 0",
    ]);
    expect(handle(host, "i1").getAttribute("aria-label")).toBe("Item 1: >chr1 GRCh38, in Unsorted");
    expect(handle(host, "i1").getAttribute("aria-pressed")).toBe("false");
  });

  test("keyboard: pick up, arrows choose a bin (announced), Enter drops; focus stays on the item", () => {
    const { host, live } = mount("gf-sort", SORT);
    const grip = handle(host, "i2");
    grip.focus();
    grip.click();
    expect(grip.getAttribute("aria-pressed")).toBe("true");
    expect(live()).toBe(
      "Picked up: @r1 1:N:0:ACGT. Use the arrow keys to choose a bin, then press Enter to drop it, or Escape to cancel.",
    );
    press(grip, "ArrowRight");
    expect(live()).toBe("FASTA bin, 0 items.");
    press(grip, "ArrowRight");
    expect(live()).toBe("FASTQ bin, 0 items.");
    expect(host.querySelector('.sort-zone[data-bin="fastq"]')?.hasAttribute("data-target")).toBe(true);
    grip.click();
    expect(zoneOf(host, "i2")).toBe("fastq");
    expect(live()).toBe("Placed in FASTQ. 3 items left unsorted.");
    expect(document.activeElement).toBe(grip);
    expect(grip.getAttribute("aria-label")).toBe("Item 2: @r1 1:N:0:ACGT, in FASTQ");
    expect(host.dataset.state).toBe("attempted");
  });

  test("Escape cancels a pickup; picking up again and dropping in place cancels too", () => {
    const { host, live } = mount("gf-sort", SORT);
    const grip = handle(host, "i1");
    grip.click();
    press(grip, "ArrowRight");
    press(grip, "Escape");
    expect(live()).toBe("Move cancelled.");
    expect(zoneOf(host, "i1")).toBe("");
    grip.click();
    grip.click();
    expect(live()).toBe("Move cancelled.");
    expect(grip.getAttribute("aria-pressed")).toBe("false");
  });

  test("pointer users: select an item, then a bin's Move here button", () => {
    const { host, buttonNamed } = mount("gf-sort", SORT);
    handle(host, "i4").click();
    expect(buttonNamed("Move here: BED")!.hidden).toBe(false);
    expect(buttonNamed("Move back to Unsorted")!.hidden).toBe(true);
    buttonNamed("Move here: BED")!.click();
    expect(zoneOf(host, "i4")).toBe("bed");
    expect(buttonNamed("Move here: BED")!.hidden).toBe(true);
  });

  test("the Place in select moves an item", () => {
    const { host } = mount("gf-sort", SORT);
    place(host, "i3", "fai");
    expect(zoneOf(host, "i3")).toBe("fai");
    expect(host.querySelector('.sort-zone[data-bin="fai"] .sort-zone-title')?.textContent).toBe(".fai · 1");
  });

  test("dragging from the handle drops into the bin under the pointer", () => {
    const { host } = mount("gf-sort", SORT);
    const target = host.querySelector<HTMLElement>('.sort-zone[data-bin="fasta"]')!;
    document.elementFromPoint = () => target;
    const grip = handle(host, "i1");
    const pointer = (type: string, x: number) =>
      grip.dispatchEvent(
        new PointerEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 10, pointerId: 1 }),
      );
    pointer("pointerdown", 0);
    pointer("pointermove", 30);
    expect(document.querySelector(".sort-ghost")?.textContent).toBe(">chr1 GRCh38");
    expect(target.hasAttribute("data-drop")).toBe(true);
    pointer("pointerup", 30);
    grip.click(); // the click that follows a drag is ignored
    expect(zoneOf(host, "i1")).toBe("fasta");
    expect(document.querySelector(".sort-ghost")).toBeNull();
    expect(grip.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("checking", () => {
  test("Check waits until every item is placed, without counting an attempt", () => {
    const { host, action, verdict } = mount("gf-sort", SORT);
    place(host, "i1", "fasta");
    place(host, "i2", "fastq");
    action("Check")!.click();
    expect(verdict()).toBe("Place all items first: 2 are still in Unsorted.");
    expect(host.dataset.state).toBe("attempted");
  });

  test("wrong items go back to Unsorted; right ones lock and show Why", () => {
    const { host, action, verdict } = mount("gf-sort", SORT);
    place(host, "i1", "fasta");
    place(host, "i2", "fastq");
    place(host, "i3", "bed");
    place(host, "i4", "fai");
    action("Check")!.click();
    expect(verdict()).toBe(
      "Not quite. 2 of 4 are in the right bin. The 2 marked Belongs elsewhere went back to Unsorted.",
    );
    expect(zoneOf(host, "i3")).toBe("");
    expect(item(host, "i3").querySelector(".sort-badge")?.textContent?.trim()).toBe("Belongs elsewhere");
    expect(handle(host, "i1").getAttribute("aria-disabled")).toBe("true");
    expect(handle(host, "i1").getAttribute("aria-label")).toBe(
      "Item 1: >chr1 GRCh38, in FASTA, correct, locked",
    );
    expect(item(host, "i1").querySelector<HTMLElement>(".sort-why")!.hidden).toBe(false);
    expect(item(host, "i3").querySelector<HTMLElement>(".sort-why")!.hidden).toBe(true);
    handle(host, "i1").click();
    expect(handle(host, "i1").getAttribute("aria-pressed")).toBe("false");
    place(host, "i3", "fai");
    expect(item(host, "i3").querySelector<HTMLElement>(".sort-badge")!.hidden).toBe(true);
  });

  test("all right is correct, once", () => {
    const { host, action, verdict, solved } = mount("gf-sort", SORT);
    for (const i of SORT.items) place(host, i.id, i.bin);
    action("Check")!.click();
    expect(verdict()).toBe("Correct. All 4 items are in the right bin.");
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved.mock.calls[0]![0]).toMatchObject({ state: "correct", firstTry: true });
  });

  test("Show answer after 2 checks puts every item in its bin with Why open", () => {
    const { host, action, verdict } = mount("gf-sort", SORT);
    const wrong = () => {
      for (const i of SORT.items) place(host, i.id, "fasta");
      action("Check")!.click();
    };
    wrong();
    expect(action("Show answer")!.hidden).toBe(true);
    wrong();
    action("Show answer")!.click();
    expect(verdict()).toBe("Answer shown. Every item is in its bin, with why it belongs there.");
    expect(SORT.items.map((i) => zoneOf(host, i.id))).toEqual(["fasta", "fastq", "fai", "bed"]);
    expect(item(host, "i3").querySelector(".sort-badge")?.textContent?.trim()).toBe("Shown");
    expect(item(host, "i3").querySelector<HTMLDetailsElement>(".sort-why")!.open).toBe(true);
    expect(item(host, "i3").querySelector(".sort-tools")?.textContent).toBe(
      "Tools say: as BED, start > end.",
    );
  });

  test("a reload restores placements and locked items", () => {
    store.putExercise(SORT.id, {
      state: "incorrect",
      attempts: 1,
      firstTry: false,
      revealed: false,
      answer: { placement: { i1: "fasta", i2: "bed" }, correct: ["i1"] },
    });
    const { host } = mount("gf-sort", SORT);
    expect(zoneOf(host, "i1")).toBe("fasta");
    expect(zoneOf(host, "i2")).toBe("bed");
    expect(handle(host, "i1").getAttribute("aria-disabled")).toBe("true");
  });

  test("quiz mode grades in place and names the right bin", () => {
    const { host } = mount("gf-sort", SORT, { "data-mode": "quiz" });
    const card = (host as HTMLElement & { card?: { submit(): boolean; hasAnswer(): boolean } }).card!;
    for (const i of SORT.items) place(host, i.id, i.id === "i4" ? "fai" : i.bin);
    expect(card.hasAnswer()).toBe(true);
    expect(card.submit()).toBe(false);
    expect(zoneOf(host, "i4")).toBe("fai");
    expect(item(host, "i4").querySelector(".sort-badge")?.textContent?.trim()).toBe(
      "Belongs elsewhere: belongs in BED",
    );
  });
});

describe("ordered and matrix variants", () => {
  const ORDERED: SortExercise = {
    ...SORT,
    id: "test-lesson/pipeline-order",
    ordered: true,
    bins: [{ id: "order", label: "Order" }],
    items: [
      { id: "a", content: "FASTQ", bin: "order", why: "Reads come first." },
      { id: "b", content: "BAM", bin: "order", why: "Then alignments." },
      { id: "c", content: "VCF", bin: "order", why: "Then variants." },
    ],
  };

  test("ordered: Move up and Alt+Arrow reorder (announced); Check says which way to go", () => {
    const { host, action, verdict, live } = mount("gf-sort", ORDERED);
    const order = () =>
      [...host.querySelectorAll<HTMLElement>(".sort-ordered > li")].map((li) => li.dataset.item);
    const start = order();
    expect(start).not.toEqual(["a", "b", "c"]);
    action("Check")!.click();
    expect(verdict()).toMatch(/^Not quite\. \d of 3 are in place\.$/);
    const badges = [...host.querySelectorAll(".sort-badge")].map((b) => b.textContent?.trim());
    expect(badges.some((b) => b === "Should come earlier" || b === "Should come later")).toBe(true);
    // Bring the items into order with the keyboard.
    for (const id of ["a", "b"]) {
      while (order().indexOf(id) > ["a", "b"].indexOf(id)) {
        const li = host.querySelector<HTMLElement>(`[data-item="${id}"]`)!;
        press(li.querySelector("button")!, "ArrowUp", { altKey: true });
      }
    }
    expect(order()).toEqual(["a", "b", "c"]);
    expect(live()).toMatch(/^Moved (FASTQ|BAM) to position \d of 3\.$/);
    action("Check")!.click();
    expect(verdict()).toBe("Correct. All 3 items are in order.");
  });

  test("matrix: one select per row, graded together", () => {
    const { host, action, verdict, qa } = mount("gf-sort", {
      ...SORT,
      id: "test-lesson/matrix",
      matrix: true,
    });
    const selects = qa<HTMLSelectElement>(".sort-matrix select");
    expect(selects).toHaveLength(4);
    expect(selects[0]!.getAttribute("aria-label")).toBe("Place in, for >chr1 GRCh38");
    action("Check")!.click();
    expect(verdict()).toBe("Choose a bin for every row first: 4 are empty.");
    SORT.items.forEach((i, k) => type(selects[k]!, k === 0 ? "bed" : i.bin));
    action("Check")!.click();
    expect(verdict()).toBe("Not quite. 3 of 4 rows are right.");
    expect(selects[1]!.disabled).toBe(true);
    type(selects[0]!, "fasta");
    action("Check")!.click();
    expect(verdict()).toBe("Correct. All 4 rows are right.");
    expect(host.dataset.state).toBe("correct");
  });
});
