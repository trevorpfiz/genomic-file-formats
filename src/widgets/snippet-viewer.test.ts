// @vitest-environment happy-dom
// The viewers (docs/PLAN.md 7.8; ux 7): exact text with CR and missing-newline chips, whitespace
// markers, line descriptions, aligned view, "View as table" (no re-splitting on spaces), Copy
// and Download (D-27), the grid's keyboard path, the hex viewer and the compressed-text tabs.
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { Snippet } from "../exercises/types.ts";
import { press } from "./test-utils.ts";
import { describeLine, splitLines } from "./text-marks.ts";
import { renderSnippet, renderSnippetFigure, SnippetViewer } from "./snippet-viewer.ts";

const BED: Snippet = {
  filename: "targets.bed",
  format: "bed",
  kind: "text",
  provenance: "toy",
  text: "chr2\t1000\t1100\texon1\t0\t+\nchr2 2000 2100 exon2 0 +\nchr2\t3000\t3100\texon3\t0\t-\n",
};

const CRLF: Snippet = {
  filename: "reads.fastq",
  format: "fastq",
  kind: "text",
  provenance: "toy",
  text: "@r1\r\nACGT\r\n+\r\nIIII",
};

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const show = (snippet: Snippet, options = {}) => {
  const node = renderSnippet(snippet, options);
  document.body.append(node);
  return node;
};

describe("line model and descriptions", () => {
  test("splitLines keeps CRs and the final-newline flag", () => {
    expect(splitLines("a\r\nb")).toEqual({
      finalNewline: false,
      lines: [
        { n: 1, text: "a", cr: true },
        { n: 2, text: "b", cr: false },
      ],
    });
    expect(splitLines("a\n\n").lines).toHaveLength(2);
  });

  test("descriptions give length, separators, edges, CR and odd code points", () => {
    expect(describeLine({ text: "GATCACAGGTCTATCACCCT", cr: false })).toBe(
      "20 characters, no tabs or spaces",
    );
    expect(describeLine({ text: "chr2\t1\t2", cr: false })).toBe("8 characters, 2 tabs");
    expect(describeLine({ text: "a b ", cr: true })).toBe(
      "4 characters, 2 spaces, ends with a space, ends with CR",
    );
    expect(describeLine({ text: "a b", cr: false })).toBe("3 characters, no tabs or spaces, contains U+00A0");
    expect(describeLine({ text: "", cr: false })).toBe("empty line");
  });
});

describe("text viewer, read mode", () => {
  test("header, meta, Illustrative tag and a labelled, described scroll region", () => {
    const node = show(BED);
    expect(node.querySelector(".snippet-filename")?.textContent).toBe("targets.bed");
    expect(node.querySelector(".snippet-badge")?.textContent).toBe("BED");
    expect(node.querySelector(".snippet-meta")?.textContent).toBe("3 lines · tab-delimited");
    expect(node.querySelector(".snippet-tag")?.textContent).toBe("Illustrative");
    const body = node.querySelector<HTMLElement>(".snippet-body")!;
    expect(body.getAttribute("role")).toBe("region");
    expect(body.tabIndex).toBe(0);
    expect(body.getAttribute("aria-label")).toBe("targets.bed, scrollable");
    const summary = document.getElementById(body.getAttribute("aria-describedby")!);
    expect(summary?.textContent).toBe(
      "BED, 3 lines, 6 tab-separated columns: chrom, chromStart, chromEnd, name, score, strand.",
    );
  });

  test("hideIdentity drops the badge and genericizes a telling filename", () => {
    const node = show({ ...BED, hideIdentity: true });
    expect(node.querySelector(".snippet-badge")).toBeNull();
    expect(node.querySelector(".snippet-filename")?.textContent).toBe("file.txt");
  });

  test("CR chips and the missing final newline are always visible", () => {
    const node = show(CRLF);
    expect([...node.querySelectorAll(".chip-cr")].map((c) => c.textContent)).toEqual(["CR", "CR", "CR"]);
    expect(node.querySelector(".chip-eof")?.textContent).toBe("no newline at end");
    expect(node.querySelector(".snippet-meta")?.textContent).toBe("4 lines · no newline at end");
  });

  test("suspect characters become code-point chips; the text keeps every TAB and space", () => {
    const node = show({ ...BED, text: "chr2 1000\t1100\n" });
    expect(node.querySelector(".chip-cp")?.textContent).toBe("U+00A0");
    expect(node.querySelectorAll(".ws-tab")).toHaveLength(1);
    expect(node.querySelector(".snippet-line .snippet-text")?.textContent).toBe("chr2U+00A01000\t1100");
  });

  test("Whitespace and Lengths toggles switch markers and the description gutter", () => {
    const node = show(BED);
    const toggle = (name: string) =>
      [...node.querySelectorAll<HTMLButtonElement>(".snippet-toolbar button")].find(
        (b) => b.textContent === name,
      )!;
    expect(node.dataset.whitespace).toBe("off");
    toggle("Whitespace").click();
    expect(node.dataset.whitespace).toBe("on");
    expect(toggle("Whitespace").getAttribute("aria-pressed")).toBe("true");
    toggle("Lengths and separators").click();
    expect(node.dataset.lineinfo).toBe("on");
    expect([...node.querySelectorAll(".snippet-info")].map((i) => i.textContent)).toEqual([
      "24 characters, 5 tabs",
      "24 characters, 5 spaces",
      "24 characters, 5 tabs",
    ]);
    expect(node.querySelectorAll(".ws-trailing")).toHaveLength(0);
  });

  test("Align columns names the columns and sizes the cells; the raw text is untouched", () => {
    const node = show(BED);
    [...node.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Align columns")!
      .click();
    const heads = [...node.querySelectorAll(".snippet-colheads .snippet-cellbox")].map((h) => h.textContent);
    expect(heads).toEqual(["chrom", "chromStart", "chromEnd", "name", "score", "strand"]);
    const first = node.querySelector<HTMLElement>('.snippet-line[data-line="1"] [data-col="2"]')!;
    expect(first.style.minWidth).toBe("12ch");
    expect(node.querySelector('.snippet-line[data-line="2"] .snippet-span-all')?.textContent).toBe(
      "chr2 2000 2100 exon2 0 +",
    );
  });

  test("View as table: one cell per field, and a space-separated line is never re-split", () => {
    const node = show(BED);
    [...node.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "View as table")!
      .click();
    const table = node.querySelector("table")!;
    expect(node.querySelector<HTMLElement>(".snippet-body")!.hidden).toBe(true);
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Line",
      "chrom",
      "chromStart",
      "chromEnd",
      "name",
      "score",
      "strand",
    ]);
    const rows = [...table.querySelectorAll("tbody tr")];
    expect(rows[0]!.querySelectorAll("td")).toHaveLength(6);
    const spaced = rows[1]!.querySelectorAll("td");
    expect(spaced).toHaveLength(1);
    expect(spaced[0]!.colSpan).toBe(6);
    expect(spaced[0]!.textContent).toBe("chr2 2000 2100 exon2 0 + (separator: space)");
    expect(node.querySelector('[role="status"]')?.textContent).toBe("Table view.");
  });

  test("Copy copies the exact bytes, CRs and missing newline included, and confirms", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(window.navigator, "clipboard", { value: { writeText }, configurable: true });
    const node = show(CRLF);
    [...node.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Copy")!.click();
    await vi.waitFor(() =>
      expect(node.querySelector('[role="status"]')?.textContent).toBe("Copied to clipboard."),
    );
    expect(writeText).toHaveBeenCalledWith("@r1\r\nACGT\r\n+\r\nIIII");
  });

  test("Download saves the exact text under the filename through a Blob URL", async () => {
    const create = vi.fn((_blob: Blob) => "blob:test");
    URL.createObjectURL = create as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(`${this.download} ${this.href}`);
    });
    const node = show(CRLF);
    [...node.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "Download")!
      .click();
    expect(clicked).toEqual(["reads.fastq blob:test"]);
    expect(await create.mock.calls[0]![0].text()).toBe("@r1\r\nACGT\r\n+\r\nIIII");
  });

  test("a figure's caption renders inline marks and escapes everything else", () => {
    const figure = renderSnippetFigure({ ...BED, caption: "Line 2 of `targets.bed` uses <spaces>." });
    const caption = figure.querySelector("figcaption")!;
    expect(caption.querySelector("code")?.textContent).toBe("targets.bed");
    expect(caption.textContent).toBe("Line 2 of targets.bed uses <spaces>.");
    expect(caption.querySelector("spaces")).toBeNull();
  });

  test("download none hides Download; compact viewers have no toolbar", () => {
    expect(show({ ...BED, download: "none" }).textContent).not.toContain("Download");
    expect(show(BED, { compact: true }).querySelector(".snippet-toolbar")).toBeNull();
  });
});

describe("interactive grid", () => {
  test("pick-line: one gridcell per line, a roving tabindex and arrow-key movement", () => {
    const viewer = new SnippetViewer(BED, { mode: "pick-line" });
    document.body.append(viewer.element);
    const grid = viewer.element.querySelector('[role="grid"]')!;
    const cells = [...grid.querySelectorAll<HTMLElement>('[role="gridcell"]')];
    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.tabIndex)).toEqual([0, -1, -1]);
    expect(cells[1]!.getAttribute("aria-label")).toBe(
      "Line 2, chr2 2000 2100 exon2 0 +, 24 characters, 5 spaces",
    );
    cells[0]!.focus();
    press(cells[0]!, "ArrowDown");
    expect(document.activeElement).toBe(cells[1]);
    press(cells[1]!, "End", { ctrlKey: true });
    expect(document.activeElement).toBe(cells[2]);
    expect(cells.map((c) => c.tabIndex)).toEqual([-1, -1, 0]);
    press(cells[2]!, "ArrowUp");
    expect(document.activeElement).toBe(cells[1]);
  });

  test("pick-field: cells per field named by the schema, Left and Right between fields", () => {
    const viewer = new SnippetViewer(BED, { mode: "pick-field" });
    document.body.append(viewer.element);
    const activated: string[] = [];
    viewer.onActivate = (cell) => activated.push(cell.key);
    const cell = (key: string) => viewer.cellElement(key)!;
    expect(cell("L1:6").getAttribute("aria-label")).toBe("Line 1, field 6 of 6, strand, value +");
    expect(cell("L2").getAttribute("aria-label")).toBe(
      "Line 2, one field, value chr2 2000 2100 exon2 0 +, separator: space",
    );
    cell("L1:1").focus();
    press(cell("L1:1"), "ArrowRight");
    expect(document.activeElement).toBe(cell("L1:2"));
    press(cell("L1:2"), "ArrowDown");
    expect(document.activeElement).toBe(cell("L2"));
    press(cell("L2"), " ");
    cell("L3:6").click();
    expect(activated).toEqual(["L2", "L3:6"]);
  });

  test("notes sit under their line and describe their cell; selection is aria-selected", () => {
    const viewer = new SnippetViewer(BED, { mode: "pick-line" });
    document.body.append(viewer.element);
    viewer.setSelected("L2", true);
    expect(viewer.cellElement("L2")!.getAttribute("aria-selected")).toBe("true");
    viewer.setMark("L2", "fine");
    viewer.setNote("L2", 2, "Fine here.", "error");
    const rows = [...viewer.element.querySelectorAll(".snippet-lines > div")];
    expect(rows.map((r) => r.className)).toEqual([
      "snippet-line",
      "snippet-line",
      "snippet-note",
      "snippet-line",
    ]);
    const note = rows[2]!.querySelector('[role="gridcell"]')!;
    expect(viewer.cellElement("L2")!.getAttribute("aria-describedby")).toBe(note.id);
    expect(viewer.cellElement("L2")!.dataset.mark).toBe("fine");
    expect(viewer.cellElement("L2")!.querySelector(".cell-badge svg")).not.toBeNull();
  });
});

describe("hex and compressed-text viewers", () => {
  const BGZF: Snippet = {
    filename: "ref.fa.gz",
    format: "bgzf",
    kind: "hex",
    provenance: "toy",
    download: "bytes",
    hex: {
      head: "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00",
      tail: "1f 8b 08 04",
      omittedBytes: 1000,
      annotations: [
        { from: 0, to: 2, label: "gzip magic" },
        { from: 12, to: 18, label: "BC subfield" },
      ],
      decoded: ">chr1",
    },
  };

  test("rows of 16 with offsets, the omitted-bytes row, tints, legend and decoded chip", () => {
    const node = show(BGZF);
    const rows = [...node.querySelectorAll(".hex-row")];
    expect(rows.map((r) => r.querySelector(".hex-offset")?.textContent)).toEqual([
      "00000000",
      "00000010",
      "000003fa",
    ]);
    expect(rows[0]!.querySelectorAll(".hex-byte")).toHaveLength(16);
    expect(rows[0]!.querySelector(".hex-ascii")?.textContent).toBe("............BC..");
    expect(node.querySelector(".hex-omitted")?.textContent).toBe("… 1,000 bytes not shown …");
    expect(node.querySelector('.hex-byte[data-mark="1"]')?.textContent).toBe("1f");
    expect([...node.querySelectorAll(".hex-legend-item")].map((i) => i.textContent)).toEqual([
      "1gzip magic 1f 8b",
      "2BC subfield 42 43 02 00 1b 00",
    ]);
    expect(node.querySelector(".hex-decoded code")?.textContent).toBe(">chr1");
    expect(node.textContent).not.toContain("Download bytes");
  });

  test("View as table lists each annotated range with file offsets", () => {
    const node = show({ ...BGZF, hex: { ...BGZF.hex!, tail: undefined, omittedBytes: undefined } });
    [...node.querySelectorAll<HTMLButtonElement>("button")]
      .find((b) => b.textContent === "View as table")!
      .click();
    const rows = [...node.querySelectorAll("tbody tr")].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ["0-1", "1f 8b", "gzip magic"],
      ["12-17", "42 43 02 00 1b 00", "BC subfield"],
    ]);
    expect(node.textContent).toContain("Download bytes");
  });

  test("compressed text: two tabs with arrow keys; the text tab downloads the decompressed copy", () => {
    const node = show({
      ...BGZF,
      kind: "compressed-text",
      format: "fasta",
      filename: "ref.fa.gz",
      download: "decompressed",
      decodedText: ">chr1\nACGT\n",
    });
    const tabs = [...node.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((t) => [t.textContent, t.getAttribute("aria-selected")])).toEqual([
      ["Container (hex)", "true"],
      ["Decompressed text", "false"],
    ]);
    const panels = [...node.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    expect(panels.map((p) => p.hidden)).toEqual([false, true]);
    press(tabs[0]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    expect(panels.map((p) => p.hidden)).toEqual([true, false]);
    expect(panels[1]!.querySelector(".snippet-filename")?.textContent).toBe("ref.fa");
    expect(panels[1]!.textContent).toContain("Download saves the decompressed copy");
    expect(panels[1]!.querySelector(".snippet-line .snippet-text")?.textContent).toBe(">chr1");
  });
});
