// The text snippet viewer (docs/PLAN.md 7.8; ux 7.1-7.4, 7.6), the course's signature
// component. Read mode shows exact characters with optional whitespace markers, aligned columns,
// a "Lengths and separators" gutter and "View as table"; Copy copies the exact text and
// Download saves it (D-27). Interactive modes turn lines or fields into a `role="grid"` with a
// roving tabindex (spot-the-error picks; field-explorer focus):
//
//   <div class="snippet-viewer" data-mode="pick-line" data-whitespace="on">
//     <div class="snippet-header">icon, filename, badge, "5 lines", Illustrative</div>
//     <div class="snippet-toolbar">Whitespace, Lengths and separators, ... Copy, Download</div>
//     <div class="snippet-body">                       (role="region" tabindex="0" in read mode)
//       <div class="snippet-lines" role="grid" aria-label="...">
//         <div class="snippet-line" data-line="3" role="row">
//           <span class="snippet-ln" aria-hidden="true">3</span>
//           <span class="snippet-info" id="...">16 characters, no tabs or spaces</span>
//           <span class="snippet-cell" role="gridcell" data-key="L3" aria-selected="false"
//                 aria-label="Line 3, ATTAACCACTCACGGG, 16 characters, no tabs or spaces">...</span>
//         </div>
//         <div class="snippet-note" role="row"><span role="gridcell" id="...">explanation</span></div>
//
// Each line's description gives its length and separators for every line alike, so a defective
// line can be told apart from the accessibility tree alone without the description giving the
// answer away (docs/PLAN.md 7.1).
import type { Snippet } from "../exercises/types.ts";
import { FORMAT_NAMES } from "../formats/names.ts";
import { icon, type IconName } from "../shell/icons.ts";
import { columnName, isMetaLine, isTabular } from "./columns.ts";
import { el, liveRegion, uid } from "./dom.ts";
import {
  describeLine,
  endChip,
  markText,
  speakable,
  splitLines,
  trailingStart,
  type TextLine,
} from "./text-marks.ts";
import {
  copyButton,
  displayFilename,
  downloadButton,
  downloadKind,
  toggleButton,
  viewerHeader,
  type SnippetViewerOptions,
} from "./viewer-chrome.ts";

/** Lines beyond this are summarised in a footer (ux 7.4). */
export const MAX_LINES = 200;

export interface FieldModel {
  /** 1-based TAB column. */
  col: number;
  name: string;
  /** 0-based, half-open character range within the line. */
  start: number;
  end: number;
  value: string;
}

export interface LineModel extends TextLine {
  description: string;
  /** Header, comment or track line (muted, never split). */
  meta: boolean;
  /** A FASTA `>` header line. */
  header: boolean;
  /** TAB-separated fields, or null when the line is not split. */
  fields: FieldModel[] | null;
}

export interface ViewerCell {
  /** "L3" (a line), "L3:2" (column 2 of line 3) or "F0" (explore field 0). */
  key: string;
  line: number;
  /** Schema name for field cells ("chromStart"); explore fields use their own name. */
  field?: string;
  col?: number;
  /** Explore mode: the index into `options.fields`. */
  index?: number;
  start: number;
  end: number;
  value: string;
  /** The accessible name. */
  label: string;
}

/** Visual marks on a cell (always with an icon; never colour alone). */
export type CellMark = "found" | "fine" | "knock-on" | "revealed" | "missed" | "visited" | "active";

const MARK_ICONS: Partial<Record<CellMark, IconName>> = {
  found: "circle-check",
  fine: "circle-x",
  "knock-on": "circle-dashed",
  revealed: "eye",
  missed: "eye",
};

/** A short spoken summary of a long value (ux 7.6): "150 bases, begins GATCAC". */
export function summarizeValue(value: string): string {
  if (value.length > 40 && /^[A-Za-z*.-]+$/.test(value))
    return `${value.length} characters, begins ${value.slice(0, 6)}`;
  return speakable(value);
}

/** Parse a snippet's text into line models. */
export function lineModels(snippet: Snippet): { lines: LineModel[]; finalNewline: boolean } {
  const { lines, finalNewline } = splitLines(snippet.text ?? "");
  const tabular = isTabular(snippet);
  return {
    finalNewline,
    lines: lines.map((line) => {
      const meta = isMetaLine(snippet.format, line.text);
      const header = snippet.format === "fasta" && line.text.startsWith(">");
      let fields: FieldModel[] | null = null;
      if (tabular && !meta && line.text.includes("\t")) {
        fields = [];
        let start = 0;
        line.text.split("\t").forEach((value, i) => {
          fields!.push({
            col: i + 1,
            name: columnName(snippet, i + 1),
            start,
            end: start + value.length,
            value,
          });
          start += value.length + 1;
        });
      }
      return { ...line, description: describeLine(line), meta, header, fields };
    }),
  };
}

export class SnippetViewer {
  readonly element: HTMLDivElement;
  readonly snippet: Snippet;
  readonly mode: NonNullable<SnippetViewerOptions["mode"]>;
  readonly lines: LineModel[];
  readonly finalNewline: boolean;
  readonly cells: ViewerCell[] = [];
  readonly tabular: boolean;
  /** Space, Enter or a click on a cell (pick and explore modes). */
  onActivate: ((cell: ViewerCell) => void) | undefined;
  /** Focus or hover on a cell, and null when the pointer leaves the grid (explore mode). */
  onFocusCell: ((cell: ViewerCell | null, how: "focus" | "hover") => void) | undefined;

  #doc: Document;
  #options: SnippetViewerOptions;
  #body: HTMLDivElement;
  #grid: HTMLDivElement;
  #tableWrap: HTMLDivElement | undefined;
  #live: ReturnType<typeof liveRegion>;
  #base = uid("snippet");
  #aligned: boolean;
  #tableView = false;
  #marks = new Map<string, CellMark>();
  #selected = new Set<string>();
  #notes = new Map<string, { line: number; node: Node; tone: string; icon?: IconName }>();
  #describedBy = new Map<string, string>();
  #cellEls = new Map<string, HTMLElement>();
  #rows: string[][] = [];
  #active: string | undefined;
  #disabled = false;
  #titleId: string;

  constructor(snippet: Snippet, options: SnippetViewerOptions = {}, doc: Document = document) {
    this.#doc = doc;
    this.snippet = snippet;
    this.#options = options;
    this.mode = options.mode ?? "read";
    const parsed = lineModels(snippet);
    this.lines = parsed.lines;
    this.finalNewline = parsed.finalNewline;
    this.tabular = isTabular(snippet);
    const view = { ...snippet.view, ...options.view };
    const interactive = this.mode !== "read";
    this.#aligned = Boolean(view.aligned) && this.#canAlign();
    this.#buildCells();

    const root = el(doc, "div", "snippet-viewer");
    this.element = root;
    root.dataset.format = snippet.format;
    root.dataset.mode = this.mode;
    root.dataset.whitespace = view.whitespace ? "on" : "off";
    root.dataset.lineinfo = view.lineInfo ? "on" : "off";
    if (options.compact) root.dataset.compact = "";
    root.setAttribute("role", "group");

    const count = this.lines.length;
    const meta = [
      `${count.toLocaleString("en-US")} ${count === 1 ? "line" : "lines"}`,
      this.lines.some((l) => l.fields) ? "tab-delimited" : "",
      count && !this.finalNewline ? "no newline at end" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const { header, titleId } = viewerHeader(doc, snippet, meta, { compact: options.compact });
    this.#titleId = titleId;
    root.setAttribute("aria-labelledby", titleId);
    root.append(header);

    this.#live = liveRegion(doc);
    if (!options.compact) root.append(this.#toolbar(view));

    const summary = el(doc, "p", "visually-hidden", this.#summary());
    summary.id = `${this.#base}-summary`;
    this.#body = el(doc, "div", "snippet-body");
    this.#grid = el(doc, "div", "snippet-lines");
    this.#body.append(this.#grid);
    const name = options.label ?? `${displayFilename(snippet)}, scrollable`;
    if (interactive) {
      this.#grid.setAttribute("role", "grid");
      this.#grid.setAttribute(
        "aria-label",
        options.label ??
          `${displayFilename(snippet)}: ${
            this.mode === "explore" ? "fields" : this.mode === "pick-line" ? "lines" : "fields by line"
          }`,
      );
      this.#grid.setAttribute("aria-describedby", summary.id);
      if (this.mode !== "explore")
        this.#grid.setAttribute("aria-multiselectable", String(options.multi ?? true));
      this.#grid.addEventListener("keydown", (event) => this.#onKey(event));
      this.#grid.addEventListener("click", (event) => this.#onClick(event));
      this.#grid.addEventListener("focusin", (event) => this.#onFocus(event, "focus"));
      this.#grid.addEventListener("mouseover", (event) => this.#onFocus(event, "hover"));
      this.#grid.addEventListener("mouseleave", () => this.onFocusCell?.(null, "hover"));
    } else {
      this.#body.tabIndex = 0;
      this.#body.setAttribute("role", "region");
      this.#body.setAttribute("aria-label", name);
      this.#body.setAttribute("aria-describedby", summary.id);
      this.#grid.addEventListener("mouseover", (event) => this.#hoverColumn(event));
      this.#grid.addEventListener("mouseleave", () => this.#hoverColumn(null));
    }
    root.append(this.#body, summary, this.#live);
    if (count > MAX_LINES) {
      root.append(
        el(
          doc,
          "p",
          "snippet-footer",
          `… ${(count - MAX_LINES).toLocaleString("en-US")} more lines not shown`,
        ),
      );
    }
    this.#render();
  }

  // --- Public API -----------------------------------------------------------------------------

  cell(key: string): ViewerCell | undefined {
    return this.cells.find((c) => c.key === key);
  }

  /** The rendered element of a cell (re-created when the view changes). */
  cellElement(key: string): HTMLElement | undefined {
    return this.#cellEls.get(key);
  }

  setMark(key: string, mark: CellMark | null): void {
    if (mark) this.#marks.set(key, mark);
    else this.#marks.delete(key);
    this.#applyCell(key);
  }

  mark(key: string): CellMark | undefined {
    return this.#marks.get(key);
  }

  clearMarks(): void {
    const keys = [...this.#marks.keys()];
    this.#marks.clear();
    for (const key of keys) this.#applyCell(key);
  }

  setSelected(key: string, selected: boolean): void {
    if (selected) {
      if (this.#options.multi === false) {
        for (const other of this.#selected) {
          this.#selected.delete(other);
          this.#applyCell(other);
        }
      }
      this.#selected.add(key);
    } else {
      this.#selected.delete(key);
    }
    this.#applyCell(key);
  }

  isSelected(key: string): boolean {
    return this.#selected.has(key);
  }

  get selected(): string[] {
    return this.cells.filter((c) => this.#selected.has(c.key)).map((c) => c.key);
  }

  clearSelection(): void {
    const keys = [...this.#selected];
    this.#selected.clear();
    for (const key of keys) this.#applyCell(key);
  }

  /**
   * An explanation row directly under a line (ux 8.6), linked to the cell with
   * aria-describedby. `key` names the note (usually the cell's key) so it can be replaced.
   */
  setNote(
    key: string,
    line: number,
    content: string | Node,
    tone: "success" | "error" | "neutral" | "warning",
    iconName?: IconName,
  ): void {
    const node = typeof content === "string" ? this.#doc.createTextNode(content) : content;
    this.#notes.set(key, { line, node, tone, icon: iconName });
    this.#render();
  }

  clearNotes(): void {
    if (!this.#notes.size) return;
    this.#notes.clear();
    this.#render();
  }

  /** Add an element id to a cell's aria-describedby (a legend row, for example). */
  describeCell(key: string, id: string): void {
    this.#describedBy.set(key, id);
    this.#applyCell(key);
  }

  /** Locked viewers keep their cells focusable (to read them) but ignore activation. */
  setDisabled(disabled: boolean): void {
    this.#disabled = disabled;
    for (const key of this.#cellEls.keys()) this.#applyCell(key);
  }

  focusCell(key?: string): void {
    const target = key ?? this.#active ?? this.cells[0]?.key;
    if (!target) return;
    this.#setActive(target);
    this.#cellEls.get(target)?.focus();
  }

  // --- Toolbar --------------------------------------------------------------------------------

  #canAlign(): boolean {
    if (!this.tabular || this.mode === "pick-line") return false;
    if (this.mode === "explore") return (this.#options.fields ?? []).every((f) => f.col !== undefined);
    return true;
  }

  #toolbar(view: NonNullable<Snippet["view"]>): HTMLElement {
    const doc = this.#doc;
    const bar = el(doc, "div", "snippet-toolbar");
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", `View options for ${displayFilename(this.snippet)}`);
    bar.append(
      toggleButton(doc, "Whitespace", Boolean(view.whitespace), (on) => {
        this.element.dataset.whitespace = on ? "on" : "off";
      }),
      toggleButton(doc, "Lengths and separators", Boolean(view.lineInfo), (on) => {
        this.element.dataset.lineinfo = on ? "on" : "off";
      }),
    );
    if (this.#canAlign()) {
      bar.append(
        toggleButton(doc, "Align columns", this.#aligned, (on) => {
          this.#aligned = on;
          this.#render();
          this.#live.say(on ? "Aligned view: display only." : "Raw view.");
        }),
      );
    }
    if (this.tabular && this.mode !== "explore") {
      bar.append(
        toggleButton(doc, "View as table", false, (on) => {
          this.#tableView = on;
          this.#showTable(on);
          this.#live.say(on ? "Table view." : "Text view.");
        }),
      );
    }
    const actions = el(doc, "span", "snippet-actions");
    actions.append(
      copyButton(
        doc,
        () => this.snippet.text ?? "",
        (m) => this.#live.say(m),
      ),
    );
    if (downloadKind(this.snippet) === "text") {
      actions.append(
        downloadButton(
          doc,
          "Download",
          displayFilename(this.snippet),
          () => this.snippet.text ?? "",
          "text/plain;charset=utf-8",
        ),
      );
    }
    bar.append(actions);
    return bar;
  }

  #summary(): string {
    const s = this.snippet;
    const count = this.lines.length;
    const parts = [
      s.hideIdentity ? "" : FORMAT_NAMES[s.format],
      `${count} ${count === 1 ? "line" : "lines"}`,
    ];
    const widest = Math.max(0, ...this.lines.map((l) => l.fields?.length ?? 0));
    if (widest > 1) {
      const names = Array.from({ length: widest }, (_, i) => columnName(s, i + 1));
      parts.push(`${widest} tab-separated columns: ${names.join(", ")}`);
    }
    if (count && !this.finalNewline) parts.push("no newline at end");
    return `${parts.filter(Boolean).join(", ")}.`;
  }

  // --- Cells ----------------------------------------------------------------------------------

  #buildCells(): void {
    const total = (this.#options.fields ?? []).length;
    if (this.mode === "explore") {
      (this.#options.fields ?? []).forEach((field, index) => {
        const line = this.lines[field.line - 1];
        if (!line) return;
        let start: number;
        let end: number;
        if (field.col !== undefined) {
          const f = line.fields?.[field.col - 1];
          start = f?.start ?? 0;
          end = f?.end ?? line.text.length;
        } else {
          [start, end] = field.span;
        }
        const value = line.text.slice(start, end);
        this.cells.push({
          key: `F${index}`,
          line: field.line,
          field: field.name,
          col: field.col,
          index,
          start,
          end,
          value,
          label: `Field ${index + 1} of ${total}, ${field.name}, value ${summarizeValue(value)}`,
        });
      });
      return;
    }
    if (this.mode === "read") return;
    for (const line of this.lines.slice(0, MAX_LINES)) {
      if (this.mode === "pick-field" && line.fields) {
        for (const f of line.fields) {
          this.cells.push({
            key: `L${line.n}:${f.col}`,
            line: line.n,
            field: f.name,
            col: f.col,
            start: f.start,
            end: f.end,
            value: f.value,
            label: `Line ${line.n}, field ${f.col} of ${line.fields.length}, ${f.name}, value ${summarizeValue(f.value)}`,
          });
        }
        continue;
      }
      let label = `Line ${line.n}, ${summarizeValue(line.text)}, ${line.description}`;
      if (this.mode === "pick-field" && line.meta)
        label = `Line ${line.n}, header line, ${speakable(line.text)}`;
      else if (this.mode === "pick-field" && this.tabular && line.text.includes(" "))
        label = `Line ${line.n}, one field, value ${speakable(line.text)}, separator: space`;
      this.cells.push({
        key: `L${line.n}`,
        line: line.n,
        start: 0,
        end: line.text.length,
        value: line.text,
        label,
      });
    }
  }

  // --- Rendering ------------------------------------------------------------------------------

  #render(): void {
    const doc = this.#doc;
    const focusedKey = (doc.activeElement as HTMLElement | null)?.dataset?.key;
    const hadFocus = focusedKey !== undefined && this.#grid.contains(doc.activeElement);
    this.#cellEls.clear();
    this.#rows = [];
    this.#grid.dataset.aligned = this.#aligned ? "on" : "off";
    const interactive = this.mode !== "read";
    const widths = this.#aligned ? this.#columnWidths() : [];
    const nodes: Node[] = [];
    if (this.#aligned) nodes.push(this.#columnHeads(widths));

    const lines = this.lines.slice(0, MAX_LINES);
    for (const line of lines) {
      const row = el(doc, "div", "snippet-line");
      row.dataset.line = String(line.n);
      if (line.meta) row.classList.add("is-meta");
      if (line.header) row.classList.add("is-header");
      if (interactive) row.setAttribute("role", "row");
      const ln = el(doc, "span", "snippet-ln", String(line.n));
      ln.setAttribute("aria-hidden", "true");
      const info = el(doc, "span", "snippet-info", line.description);
      info.id = `${this.#base}-d${line.n}`;
      if (interactive) info.setAttribute("aria-hidden", "true");
      row.append(ln, info);
      const keys: string[] = [];
      row.append(this.#lineContent(line, widths, keys));
      if (keys.length) this.#rows.push(keys);
      nodes.push(row);
      for (const [key, note] of this.#notes) {
        if (note.line === line.n) nodes.push(this.#noteRow(key, note));
      }
    }
    this.#grid.replaceChildren(...nodes);
    for (const key of this.#cellEls.keys()) this.#applyCell(key);
    if (interactive) {
      const first = this.#rows[0]?.[0];
      if (!this.#active || !this.#cellEls.has(this.#active)) this.#active = first;
      if (this.#active) this.#cellEls.get(this.#active)!.tabIndex = 0;
      if (hadFocus && focusedKey) this.#cellEls.get(focusedKey)?.focus();
    }
  }

  #lineContent(line: LineModel, widths: number[], keys: string[]): Node {
    const doc = this.#doc;
    const last = line.n === this.lines.length;
    const trailing = trailingStart(line.text);
    const marked = (from: number, to: number) =>
      markText(doc, line.text.slice(from, to), { offset: from, trailingFrom: trailing });
    const eol = () => {
      const frag = doc.createDocumentFragment();
      if (line.cr) frag.append(endChip(doc, "cr"));
      if (last && !this.finalNewline) frag.append(endChip(doc, "no-newline"));
      return frag;
    };
    const text = el(doc, "span", "snippet-text");

    if (this.mode === "pick-line") {
      const cell = this.#cellNode(`L${line.n}`);
      cell.append(this.#fieldsOrRaw(line, widths, marked), eol());
      text.append(cell);
      keys.push(cell.dataset.key!);
      return text;
    }

    if (this.mode === "explore") {
      const cells = this.cells.filter((c) => c.line === line.n).sort((a, b) => a.start - b.start);
      if (this.#aligned && line.fields) {
        for (const f of line.fields) {
          const match = cells.find((c) => c.col === f.col);
          const box = match ? this.#cellNode(match.key) : el(doc, "span", "snippet-field");
          box.classList.add("snippet-cellbox");
          box.dataset.col = String(f.col);
          box.style.minWidth = `${widths[f.col - 1] ?? 0}ch`;
          box.append(marked(f.start, f.end));
          if (match) keys.push(match.key);
          text.append(box);
        }
        text.append(eol());
        return text;
      }
      let at = 0;
      for (const c of cells) {
        if (c.start > at) text.append(this.#hidden(marked(at, c.start)));
        const node = this.#cellNode(c.key);
        node.dataset.col = String(c.index! + 1);
        node.append(marked(c.start, c.end));
        text.append(node);
        keys.push(c.key);
        at = c.end;
      }
      if (at < line.text.length) text.append(this.#hidden(marked(at, line.text.length)));
      text.append(this.#hidden(eol()));
      return text;
    }

    if (this.mode === "pick-field") {
      if (line.fields) {
        line.fields.forEach((f, i) => {
          if (i > 0 && !this.#aligned) text.append(this.#hidden(marked(f.start - 1, f.start)));
          const cell = this.#cellNode(`L${line.n}:${f.col}`);
          cell.dataset.col = String(f.col);
          if (this.#aligned) {
            cell.classList.add("snippet-cellbox");
            cell.style.minWidth = `${widths[f.col - 1] ?? 0}ch`;
          }
          cell.append(marked(f.start, f.end));
          text.append(cell);
          keys.push(cell.dataset.key!);
        });
        text.append(this.#hidden(eol()));
        return text;
      }
      const cell = this.#cellNode(`L${line.n}`);
      cell.append(marked(0, line.text.length), eol());
      if (this.#aligned) cell.classList.add("snippet-span-all");
      text.append(cell);
      keys.push(cell.dataset.key!);
      return text;
    }

    text.append(this.#fieldsOrRaw(line, widths, marked), eol());
    return text;
  }

  /** Read-mode content: fields wrapped for column highlighting, aligned when on. */
  #fieldsOrRaw(line: LineModel, widths: number[], marked: (from: number, to: number) => Node): Node {
    const doc = this.#doc;
    const frag = doc.createDocumentFragment();
    if (!line.fields) {
      if (this.#aligned) {
        const all = el(doc, "span", "snippet-span-all");
        all.append(marked(0, line.text.length));
        frag.append(all);
      } else {
        frag.append(marked(0, line.text.length));
      }
      return frag;
    }
    line.fields.forEach((f, i) => {
      if (i > 0 && !this.#aligned) frag.append(marked(f.start - 1, f.start));
      const span = el(doc, "span", this.#aligned ? "snippet-field snippet-cellbox" : "snippet-field");
      span.dataset.col = String(f.col);
      if (this.#aligned) span.style.minWidth = `${widths[f.col - 1] ?? 0}ch`;
      span.append(marked(f.start, f.end));
      frag.append(span);
    });
    return frag;
  }

  #hidden(content: Node): HTMLSpanElement {
    const span = el(this.#doc, "span", "snippet-sep");
    span.setAttribute("aria-hidden", "true");
    span.append(content);
    return span;
  }

  #cellNode(key: string): HTMLSpanElement {
    const cell = this.cell(key)!;
    const node = el(this.#doc, "span", "snippet-cell");
    node.setAttribute("role", "gridcell");
    node.tabIndex = -1;
    node.dataset.key = key;
    node.setAttribute("aria-label", cell.label);
    this.#cellEls.set(key, node);
    return node;
  }

  #applyCell(key: string): void {
    const node = this.#cellEls.get(key);
    if (!node) return;
    const mark = this.#marks.get(key);
    if (mark) node.dataset.mark = mark;
    else delete node.dataset.mark;
    node.querySelector(":scope > .cell-badge")?.remove();
    const iconName = mark ? MARK_ICONS[mark] : undefined;
    if (iconName) {
      const badge = el(this.#doc, "span", "cell-badge");
      badge.setAttribute("aria-hidden", "true");
      badge.innerHTML = icon(iconName);
      node.append(badge);
    }
    if (this.mode === "pick-line" || this.mode === "pick-field") {
      node.setAttribute("aria-selected", String(this.#selected.has(key)));
    }
    if (this.#disabled) node.setAttribute("aria-disabled", "true");
    else node.removeAttribute("aria-disabled");
    const cell = this.cell(key);
    const described = [];
    if (cell && this.mode === "pick-field" && cell.col !== undefined)
      described.push(`${this.#base}-d${cell.line}`);
    const note = this.#notes.get(key);
    if (note) described.push(`${this.#base}-n-${key}`);
    const extra = this.#describedBy.get(key);
    if (extra) described.push(extra);
    if (described.length) node.setAttribute("aria-describedby", described.join(" "));
    else node.removeAttribute("aria-describedby");
  }

  #noteRow(key: string, note: { node: Node; tone: string; icon?: IconName }): HTMLElement {
    const doc = this.#doc;
    const row = el(doc, "div", "snippet-note");
    row.dataset.tone = note.tone;
    const body = el(doc, "span", "snippet-note-body");
    body.id = `${this.#base}-n-${key}`;
    if (note.icon) body.innerHTML = icon(note.icon);
    body.append(note.node.cloneNode(true));
    if (this.mode !== "read") {
      row.setAttribute("role", "row");
      body.setAttribute("role", "gridcell");
    }
    row.append(body);
    return row;
  }

  /** Aligned view: widest value per column plus 2ch (ux 7.2). */
  #columnWidths(): number[] {
    const widths: number[] = [];
    for (const line of this.lines) {
      for (const f of line.fields ?? []) {
        widths[f.col - 1] = Math.max(
          widths[f.col - 1] ?? 0,
          Array.from(f.value).length + 2,
          f.name.length + 2,
        );
      }
    }
    return widths;
  }

  #columnHeads(widths: number[]): HTMLElement {
    const doc = this.#doc;
    const row = el(doc, "div", "snippet-line snippet-colheads");
    row.setAttribute("aria-hidden", "true");
    row.append(el(doc, "span", "snippet-ln", "#"), el(doc, "span", "snippet-info", "description"));
    const text = el(doc, "span", "snippet-text");
    widths.forEach((w, i) => {
      const head = el(doc, "span", "snippet-cellbox", columnName(this.snippet, i + 1));
      head.dataset.col = String(i + 1);
      head.style.minWidth = `${w}ch`;
      text.append(head);
    });
    row.append(text);
    return row;
  }

  #showTable(on: boolean): void {
    if (on && !this.#tableWrap) this.#tableWrap = this.#buildTable();
    this.#body.hidden = on;
    if (this.#tableWrap) {
      this.#tableWrap.hidden = !on;
      if (!this.#tableWrap.isConnected) this.#body.after(this.#tableWrap);
    }
  }

  /** "View as table" (ux 7.2): never re-splits a line on a separator the file does not use. */
  #buildTable(): HTMLDivElement {
    const doc = this.#doc;
    const wrap = el(doc, "div", "snippet-table-wrap");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", `${displayFilename(this.snippet)}, table view, scrollable`);
    const table = el(doc, "table", "snippet-table");
    table.append(el(doc, "caption", "", `${displayFilename(this.snippet)} as a table`));
    const widest = Math.max(1, ...this.lines.map((l) => l.fields?.length ?? 1));
    const head = el(doc, "tr");
    const lineHead = el(doc, "th", "", "Line");
    lineHead.scope = "col";
    head.append(lineHead);
    for (let c = 1; c <= widest; c += 1) {
      const th = el(doc, "th", "", columnName(this.snippet, c));
      th.scope = "col";
      head.append(th);
    }
    const thead = el(doc, "thead");
    thead.append(head);
    const tbody = el(doc, "tbody");
    for (const line of this.lines.slice(0, MAX_LINES)) {
      const tr = el(doc, "tr");
      const th = el(doc, "th", "", String(line.n));
      th.scope = "row";
      tr.append(th);
      if (line.fields) {
        for (const f of line.fields) tr.append(el(doc, "td", "", f.value));
        for (let c = line.fields.length; c < widest; c += 1) tr.append(el(doc, "td"));
      } else {
        const td = el(doc, "td", "", line.text);
        td.colSpan = widest;
        const note = line.meta
          ? "header line"
          : line.text.includes(" ")
            ? "separator: space"
            : line.text === ""
              ? "empty line"
              : "";
        if (note) td.append(" ", el(doc, "span", "snippet-table-note", `(${note})`));
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    wrap.hidden = true;
    return wrap;
  }

  // --- Interaction ----------------------------------------------------------------------------

  #setActive(key: string): void {
    if (this.#active === key) return;
    const old = this.#active ? this.#cellEls.get(this.#active) : undefined;
    if (old) old.tabIndex = -1;
    this.#active = key;
    const node = this.#cellEls.get(key);
    if (node) node.tabIndex = 0;
  }

  #keyOf(target: EventTarget | null): string | undefined {
    const node = (target as HTMLElement | null)?.closest?.<HTMLElement>("[data-key]");
    return node && this.#grid.contains(node) ? node.dataset.key : undefined;
  }

  #onKey(event: KeyboardEvent): void {
    const key = this.#keyOf(event.target);
    if (!key || event.altKey || event.metaKey) return;
    if (event.ctrlKey && event.key !== "Home" && event.key !== "End") return;
    const r = this.#rows.findIndex((row) => row.includes(key));
    const row = this.#rows[r];
    if (!row) return;
    const c = row.indexOf(key);
    let next: string | undefined;
    switch (event.key) {
      case "ArrowDown":
        next = this.#rows[Math.min(r + 1, this.#rows.length - 1)]?.at(
          Math.min(c, (this.#rows[r + 1]?.length ?? 1) - 1),
        );
        break;
      case "ArrowUp":
        next = this.#rows[Math.max(r - 1, 0)]?.at(Math.min(c, (this.#rows[r - 1]?.length ?? 1) - 1));
        break;
      case "ArrowRight":
        next = row[Math.min(c + 1, row.length - 1)];
        break;
      case "ArrowLeft":
        next = row[Math.max(c - 1, 0)];
        break;
      case "Home":
        next = event.ctrlKey ? this.#rows[0]?.[0] : row[0];
        break;
      case "End":
        next = event.ctrlKey ? this.#rows.at(-1)?.at(-1) : row.at(-1);
        break;
      case "PageDown":
        next = this.#rows[Math.min(r + 5, this.#rows.length - 1)]?.[0];
        break;
      case "PageUp":
        next = this.#rows[Math.max(r - 5, 0)]?.[0];
        break;
      case " ":
      case "Enter":
        event.preventDefault();
        this.#activate(key);
        return;
      default:
        return;
    }
    event.preventDefault();
    if (next) this.focusCell(next);
  }

  #onClick(event: MouseEvent): void {
    const key = this.#keyOf(event.target);
    if (!key) return;
    this.focusCell(key);
    this.#activate(key);
  }

  #activate(key: string): void {
    if (this.#disabled) return;
    const cell = this.cell(key);
    if (cell) this.onActivate?.(cell);
  }

  #onFocus(event: Event, how: "focus" | "hover"): void {
    const key = this.#keyOf(event.target);
    if (!key) return;
    if (how === "focus") this.#setActive(key);
    const cell = this.cell(key);
    if (cell) this.onFocusCell?.(cell, how);
  }

  /** Read mode: hovering a field highlights its whole column (ux 7.3). */
  #hoverColumn(event: MouseEvent | null): void {
    const target = (event?.target as HTMLElement | null)?.closest?.<HTMLElement>("[data-col]");
    const col = target?.dataset.col;
    for (const node of this.#grid.querySelectorAll<HTMLElement>(".is-col-hover")) {
      if (node.dataset.col !== col) node.classList.remove("is-col-hover");
    }
    if (!col) return;
    for (const node of this.#grid.querySelectorAll<HTMLElement>(`[data-col="${col}"]`)) {
      node.classList.add("is-col-hover");
    }
  }

  /** The id of the filename, for labelling. */
  get titleId(): string {
    return this.#titleId;
  }

  /** Whether "View as table" is showing. */
  get tableView(): boolean {
    return this.#tableView;
  }
}
