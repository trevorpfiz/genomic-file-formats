// The .fai byte calculator (docs/PLAN.md 5 L05.1, 7.5; seq 3.2, EX-02): for the base at 0-based
// position p, byte = OFFSET + floor(p / LINEBASES) * LINEWIDTH + (p mod LINEBASES). The inverse
// is bound too: any byte of the record says whether it holds a base (and which), the line
// terminator, the header or something past the sequence. Pure; the view is ./view.tsx.
//
// Exercise data (`init`, and each preset's `state`):
//   row            TAB-separated .fai row, "chrM_demo\t60\t38\t20\t21" (required in init)
//   label          what the file is: "toy.fa", "Broad Homo_sapiens_assembly38.fasta"
//   header         the record's header line without its newline (shown, and used to show bytes)
//   sequence       known bases, starting at the 1-based `sequenceStart` (default 1)
//   position | p   the base shown first: 1-based `position` (default 1) or 0-based `p`
//   convention     "1-based" (default) or "0-based": how the position field counts
// A preset keeps the current base unless it names one, so the same base can be compared across
// files (EX-02 task 2). Positions in actions and goal arguments are 1-based `position` unless
// the key is `p`, the same convention as the faiByte content helper (src/formats/helpers.ts).
//
// Actions: { type: "position", position } | { type: "p", p } | { type: "step", by } (bases)
//   | { type: "line", by } (lines of LINEBASES) | { type: "byte", byte }
//   | { type: "convention", convention } | { type: "field", field, value } | { type: "preset", state }
// Goal checks:
//   showsBase    { position, row?, convention? }  the base at `position` is shown
//   showsByte    { byte, row? }                    the current byte is `byte`
//   comparedRows { position, rows }                that base was shown under every row in `rows`
// `row` arguments match OFFSET, LINEBASES and LINEWIDTH (and NAME) of the current row.
import { faiByte, parseFaiRow, type FaiRow } from "../../../formats/fasta.ts";
import type { SimulatorModel, TextView } from "../types.ts";

export type Convention = "1-based" | "0-based";
export type FaiField = "length" | "offset" | "lineBases" | "lineWidth";
export type FaiGeometry = Pick<FaiRow, "name" | "length" | "offset" | "lineBases" | "lineWidth">;

export interface FaiFile {
  label?: string;
  row: FaiGeometry;
  header?: string;
  sequence?: string;
  /** 1-based position of sequence[0]. */
  sequenceStart: number;
  /** True once a column was edited: the known bytes no longer describe this geometry. */
  edited: boolean;
}

export type FaiTarget = { kind: "base"; p: number } | { kind: "byte"; byte: number };

export interface FaiCalculatorState {
  file: FaiFile;
  convention: Convention;
  at: FaiTarget;
  /** "OFFSET\tLINEBASES\tLINEWIDTH\tp" for every base shown, for goals that compare files. */
  visited: string[];
  /** Why the last action was refused; cleared by the next accepted action. */
  notice?: string;
}

export type FaiCalculatorAction =
  | { type: "position"; position: number }
  | { type: "p"; p: number }
  | { type: "step"; by: number }
  | { type: "line"; by: number }
  | { type: "byte"; byte: number }
  | { type: "convention"; convention: Convention }
  | { type: "field"; field: FaiField; value: number }
  | { type: "preset"; state: Record<string, unknown> };

/** What one byte of the file holds, as far as the .fai row can tell. */
export type ByteInfo =
  | { kind: "before" } // before the header line: earlier records
  | { kind: "header"; index: number } // index into the header line; header.length is its newline
  | { kind: "before-sequence" } // before OFFSET when the header text is not known
  | { kind: "base"; p: number; line: number; column: number }
  | { kind: "terminator"; line: number; index: number; width: number }
  | { kind: "after" }; // past the sequence's last line: the next record or the end of the file

const MAX_VISITED = 64;
const fmt = (n: number) => n.toLocaleString("en-US");
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Bytes per line terminator: 1 for LF, 2 for CR-LF. */
export const terminatorWidth = (row: FaiGeometry) => row.lineWidth - row.lineBases;
/** Number of sequence lines. */
export const lineCount = (row: FaiGeometry) => Math.ceil(row.length / row.lineBases);
/** Bases on 0-based line `line`. */
export const basesOnLine = (row: FaiGeometry, line: number) =>
  Math.max(0, Math.min(row.lineBases, row.length - line * row.lineBases));
/** First byte of 0-based line `line`. */
export const lineStart = (row: FaiGeometry, line: number) => row.offset + line * row.lineWidth;
/** The first byte after the sequence's last terminator. */
export const sequenceEnd = (row: FaiGeometry) => {
  const last = lineCount(row) - 1;
  return lineStart(row, last) + basesOnLine(row, last) + terminatorWidth(row);
};

/** First byte of the header line, when the header text is known. */
export const headerStart = (file: FaiFile) =>
  file.header === undefined ? undefined : file.row.offset - file.header.length - terminatorWidth(file.row);

/** Locate a byte of the file. */
export function locate(file: FaiFile, byte: number): ByteInfo {
  const { row } = file;
  if (byte < row.offset) {
    const start = headerStart(file);
    if (start === undefined || start < 0) return { kind: "before-sequence" };
    return byte < start ? { kind: "before" } : { kind: "header", index: byte - start };
  }
  const rel = byte - row.offset;
  const line = Math.floor(rel / row.lineWidth);
  const column = rel % row.lineWidth;
  if (line >= lineCount(row)) return { kind: "after" };
  const bases = basesOnLine(row, line);
  if (column < bases) return { kind: "base", p: line * row.lineBases + column, line, column };
  const width = terminatorWidth(row);
  if (column - bases < width) return { kind: "terminator", line, index: column - bases, width };
  return { kind: "after" };
}

/** The base the state points at, if any. */
export function currentP(state: FaiCalculatorState): number | undefined {
  if (state.at.kind === "base") return state.at.p;
  const info = locate(state.file, state.at.byte);
  return info.kind === "base" ? info.p : undefined;
}

/** The byte the state points at. */
export const currentByte = (state: FaiCalculatorState): number =>
  state.at.kind === "byte" ? state.at.byte : faiByte(state.file.row, state.at.p);

/** The known content of a base, or undefined when the course does not show it. */
export function baseAt(file: FaiFile, p: number): string | undefined {
  if (file.edited || file.sequence === undefined) return undefined;
  return file.sequence[p - (file.sequenceStart - 1)];
}

// --- Parsing and building --------------------------------------------------------------------

function rowFrom(value: unknown): FaiGeometry {
  const row = typeof value === "string" ? parseFaiRow(value) : undefined;
  if (!row)
    throw new Error(`fai-calculator: "row" must be a TAB-separated .fai row, got ${JSON.stringify(value)}`);
  const problem = geometryProblem(row);
  if (problem) throw new Error(`fai-calculator: ${problem}`);
  const { name, length, offset, lineBases, lineWidth } = row;
  return { name, length, offset, lineBases, lineWidth };
}

/** Why a geometry cannot describe a FASTA record, or undefined. */
export function geometryProblem(row: FaiGeometry): string | undefined {
  if (!isInt(row.length) || row.length < 1) return "LENGTH must be a whole number of at least 1.";
  if (!isInt(row.offset) || row.offset < 0) return "OFFSET must be a whole number of at least 0.";
  if (!isInt(row.lineBases) || row.lineBases < 1) return "LINEBASES must be a whole number of at least 1.";
  if (!isInt(row.lineWidth) || row.lineWidth <= row.lineBases)
    return "LINEWIDTH counts the line terminator too, so it must be larger than LINEBASES.";
  return undefined;
}

function fileFrom(args: Record<string, unknown>): FaiFile {
  const row = rowFrom(args.row);
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : undefined);
  const sequenceStart = args.sequenceStart === undefined ? 1 : args.sequenceStart;
  if (!isInt(sequenceStart) || sequenceStart < 1)
    throw new Error("fai-calculator: sequenceStart must be a 1-based position");
  const header = str("header");
  if (header !== undefined && row.offset - header.length - terminatorWidth(row) < 0)
    throw new Error("fai-calculator: the header line does not fit before OFFSET");
  return {
    ...(str("label") === undefined ? {} : { label: str("label") }),
    row,
    ...(str("header") === undefined ? {} : { header: str("header") }),
    ...(str("sequence") === undefined ? {} : { sequence: str("sequence") }),
    sequenceStart,
    edited: false,
  };
}

const geometryKey = (row: FaiGeometry) => `${row.offset}\t${row.lineBases}\t${row.lineWidth}`;

function visit(state: FaiCalculatorState): FaiCalculatorState {
  const p = currentP(state);
  if (p === undefined) return state;
  const key = `${geometryKey(state.file.row)}\t${p}`;
  if (state.visited.includes(key)) return state;
  return { ...state, visited: [...state.visited, key].slice(-MAX_VISITED) };
}

/** Accept a change: clear the notice and record the base shown. */
const accept = (state: FaiCalculatorState): FaiCalculatorState => {
  const next = { ...state };
  delete next.notice;
  return visit(next);
};
const refuse = (state: FaiCalculatorState, notice: string): FaiCalculatorState => ({ ...state, notice });

const rangeNotice = (row: FaiGeometry, convention: Convention) =>
  convention === "0-based"
    ? `${row.name} has ${fmt(row.length)} bases: p runs from 0 to ${fmt(row.length - 1)}.`
    : `${row.name} has ${fmt(row.length)} bases: choose a position from 1 to ${fmt(row.length)}.`;

function toBase(state: FaiCalculatorState, p: number, convention: Convention): FaiCalculatorState {
  if (!isInt(p) || p < 0 || p >= state.file.row.length)
    return refuse(state, rangeNotice(state.file.row, convention));
  return accept({ ...state, at: { kind: "base", p } });
}

/** The base a step starts from when the cursor is on a byte that is not a base. */
function anchor(state: FaiCalculatorState, by: number): number {
  if (state.at.kind === "base") return state.at.p;
  const { row } = state.file;
  const info = locate(state.file, state.at.byte);
  switch (info.kind) {
    case "base":
      return info.p;
    case "terminator": {
      const last = info.line * row.lineBases + basesOnLine(row, info.line) - 1;
      return by > 0 ? last : last + 1;
    }
    case "after":
      return row.length;
    default:
      return -1;
  }
}

function step(state: FaiCalculatorState, by: number): FaiCalculatorState {
  if (!isInt(by) || by === 0) return state;
  const { row } = state.file;
  const from = anchor(state, by);
  const p = Math.min(row.length - 1, Math.max(0, from + by));
  if (state.at.kind === "base" && p === state.at.p)
    return refuse(
      state,
      by > 0 ? `This is the last base of ${row.name}.` : `This is the first base of ${row.name}.`,
    );
  return accept({ ...state, at: { kind: "base", p } });
}

function editField(state: FaiCalculatorState, field: FaiField, value: number): FaiCalculatorState {
  if (!(["length", "offset", "lineBases", "lineWidth"] as const).includes(field)) return state;
  const row = { ...state.file.row, [field]: value };
  const problem = geometryProblem(row);
  if (problem) return refuse(state, problem);
  if (row[field] === state.file.row[field]) return accept(state);
  const at: FaiTarget =
    state.at.kind === "base" ? { kind: "base", p: Math.min(state.at.p, row.length - 1) } : state.at;
  return accept({ ...state, file: { ...state.file, row, edited: true }, at });
}

function preset(state: FaiCalculatorState, args: Record<string, unknown>): FaiCalculatorState {
  let file = state.file;
  if (args.row !== undefined) {
    try {
      file = fileFrom(args);
    } catch {
      return state;
    }
  }
  const convention =
    args.convention === "0-based" || args.convention === "1-based" ? args.convention : state.convention;
  const next = { ...state, file, convention };
  if (isInt(args.p)) return toBase(next, args.p, convention);
  if (isInt(args.position)) return toBase(next, args.position - 1, convention);
  const p = currentP(state);
  if (p === undefined) return accept(next);
  return accept({ ...next, at: { kind: "base", p: Math.min(p, file.row.length - 1) } });
}

// --- Text view -------------------------------------------------------------------------------

export const rowText = (row: FaiGeometry) =>
  `NAME ${row.name} · LENGTH ${row.length} · OFFSET ${row.offset} · LINEBASES ${row.lineBases} · LINEWIDTH ${row.lineWidth}`;

/** "LF" or "CR LF" for terminator byte `index`. */
export function terminatorName(width: number, index: number): string {
  if (width === 1) return "the newline (LF)";
  if (width === 2)
    return index === 0 ? "the carriage return (CR) of a CR LF pair" : "the newline (LF) of a CR LF pair";
  return `line terminator byte ${index + 1} of ${width}`;
}

/** A plain description of a byte: "base 45 (p = 44), `A`", "the newline (LF) ending line 1". */
export function describeByte(file: FaiFile, byte: number): string {
  const info = locate(file, byte);
  const { row } = file;
  switch (info.kind) {
    case "base": {
      const base = baseAt(file, info.p);
      return `base ${fmt(info.p + 1)} of ${row.name} (p = ${fmt(info.p)})${base ? `, \`${base}\`` : ""}`;
    }
    case "terminator":
      return `${terminatorName(info.width, info.index)} ending sequence line ${fmt(info.line + 1)}`;
    case "header": {
      const header = file.header ?? "";
      if (info.index >= header.length)
        return `${terminatorName(terminatorWidth(row), info.index - header.length)} ending the header line`;
      return `character ${info.index + 1} of the header line, \`${header[info.index]}\``;
    }
    case "before-sequence":
      return `before OFFSET: the header line (or an earlier record)`;
    case "before":
      return "an earlier record, before this header line";
    case "after":
      return `past the end of ${row.name}'s sequence: the next record or the end of the file`;
  }
}

function text(state: FaiCalculatorState): TextView {
  const { row } = state.file;
  const rows: string[][] = [[".fai row", rowText(row)]];
  const byte = currentByte(state);
  if (state.at.kind === "base") {
    const p = state.at.p;
    const lines = Math.floor(p / row.lineBases);
    const column = p % row.lineBases;
    rows.push(
      ["Position", `base ${fmt(p + 1)} (1-based); p = ${fmt(p)} (0-based)`],
      ["Full lines before it", `floor(${fmt(p)} / ${fmt(row.lineBases)}) = ${fmt(lines)}`],
      ["Column in its line", `${fmt(p)} mod ${fmt(row.lineBases)} = ${fmt(column)}`],
      ["Byte", `${fmt(row.offset)} + ${fmt(lines)} × ${fmt(row.lineWidth)} + ${fmt(column)} = ${fmt(byte)}`],
    );
  } else {
    rows.push(["Byte", fmt(byte)]);
    if (byte >= row.offset) {
      const rel = byte - row.offset;
      rows.push(
        ["Bytes after OFFSET", `${fmt(byte)} − ${fmt(row.offset)} = ${fmt(rel)}`],
        [
          "Full lines before it",
          `floor(${fmt(rel)} / ${fmt(row.lineWidth)}) = ${fmt(Math.floor(rel / row.lineWidth))}`,
        ],
        ["Column in its line", `${fmt(rel)} mod ${fmt(row.lineWidth)} = ${fmt(rel % row.lineWidth)}`],
      );
    }
  }
  rows.push([`Byte ${fmt(byte)} holds`, describeByte(state.file, byte) + contentNote(state, byte)]);
  return { kind: "table", rows };
}

function contentNote(state: FaiCalculatorState, byte: number): string {
  const info = locate(state.file, byte);
  if (info.kind !== "base" || baseAt(state.file, info.p)) return "";
  return state.file.edited
    ? "; the row was edited, so this file's bytes are not shown"
    : "; this base is not shown in the course";
}

// --- The model -------------------------------------------------------------------------------

/** Parse a goal's `row` argument; undefined when absent. */
function rowArg(value: unknown): FaiGeometry | undefined | null {
  if (value === undefined) return undefined;
  const row = typeof value === "string" ? parseFaiRow(value) : undefined;
  return row ?? null;
}

const rowMatches = (state: FaiCalculatorState, value: unknown): boolean => {
  const row = rowArg(value);
  if (row === undefined) return true;
  if (row === null) return false;
  return geometryKey(row) === geometryKey(state.file.row) && row.name === state.file.row.name;
};

const argsOf = (args: unknown): Record<string, unknown> =>
  typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};

export const faiCalculatorModel = {
  init(args) {
    const file = fileFrom(args);
    const convention: Convention = args.convention === "0-based" ? "0-based" : "1-based";
    const p = isInt(args.p) ? args.p : isInt(args.position) ? args.position - 1 : 0;
    if (p < 0 || p >= file.row.length)
      throw new Error("fai-calculator: the first position is outside the sequence");
    return visit({ file, convention, at: { kind: "base", p }, visited: [] });
  },

  reduce(state, action) {
    if (typeof action !== "object" || action === null) return state;
    switch (action.type) {
      case "position":
        return isInt(action.position) ? toBase(state, action.position - 1, "1-based") : state;
      case "p":
        return isInt(action.p) ? toBase(state, action.p, "0-based") : state;
      case "step":
        return step(state, action.by);
      case "line":
        return isInt(action.by) ? step(state, action.by * state.file.row.lineBases) : state;
      case "byte":
        if (!isInt(action.byte) || action.byte < 0)
          return refuse(state, "A byte offset is a whole number from 0.");
        return accept({ ...state, at: { kind: "byte", byte: action.byte } });
      case "convention":
        return action.convention === "0-based" || action.convention === "1-based"
          ? accept({ ...state, convention: action.convention })
          : state;
      case "field":
        return isInt(action.value)
          ? editField(state, action.field, action.value)
          : refuse(state, "Enter a whole number.");
      case "preset":
        return typeof action.state === "object" && action.state !== null
          ? preset(state, action.state)
          : state;
      default:
        return state;
    }
  },

  goalChecks: {
    showsBase: (state, args) => {
      const { position, row, convention } = argsOf(args);
      if (!isInt(position) || state.at.kind !== "base" || state.at.p !== position - 1) return false;
      if (convention !== undefined && convention !== state.convention) return false;
      return rowMatches(state, row);
    },
    showsByte: (state, args) => {
      const { byte, row } = argsOf(args);
      return isInt(byte) && currentByte(state) === byte && rowMatches(state, row);
    },
    comparedRows: (state, args) => {
      const { position, rows } = argsOf(args);
      if (!isInt(position) || !Array.isArray(rows) || rows.length === 0) return false;
      return rows.every((value) => {
        const row = rowArg(value);
        return row ? state.visited.includes(`${geometryKey(row)}\t${position - 1}`) : false;
      });
    },
  },

  text,
} satisfies SimulatorModel<FaiCalculatorState, FaiCalculatorAction>;

// --- The file map the view draws -------------------------------------------------------------

export type MapSegment =
  | { kind: "before"; from: number; to: number }
  | { kind: "header"; from: number; to: number; text?: string }
  | {
      kind: "lines";
      from: number;
      to: number;
      firstLine: number;
      lastLine: number;
      firstBase: number;
      lastBase: number;
    }
  | {
      kind: "line";
      from: number;
      to: number;
      line: number;
      firstBase: number;
      lastBase: number;
      /** Known bases of the line; null where the course does not show the base. */
      cells?: (string | null)[];
    }
  | { kind: "after"; from: number };

/**
 * The record as a list of segments: the header, then lines, with the target's line and its
 * neighbours shown and the rest collapsed. Byte ranges are inclusive. Bases are 1-based.
 */
export function fileMap(state: FaiCalculatorState): MapSegment[] {
  const { file } = state;
  const { row } = file;
  const segments: MapSegment[] = [];
  const start = file.edited ? undefined : headerStart(file);
  if (start !== undefined && start > 0) segments.push({ kind: "before", from: 0, to: start - 1 });
  if (row.offset > 0) {
    const from = start !== undefined && start >= 0 ? start : 0;
    segments.push({
      kind: "header",
      from,
      to: row.offset - 1,
      ...(file.edited ? {} : { text: file.header }),
    });
  }
  const n = lineCount(row);
  const info = locate(file, currentByte(state));
  const target = info.kind === "base" || info.kind === "terminator" ? info.line : undefined;
  const shown = new Set<number>();
  if (n <= 6) for (let i = 0; i < n; i += 1) shown.add(i);
  else
    for (const i of [0, n - 1, ...(target === undefined ? [] : [target - 1, target, target + 1])])
      if (i >= 0 && i < n) shown.add(i);
  const lines = [...shown].sort((a, b) => a - b);
  let previous = -1;
  for (const line of lines) {
    if (line > previous + 1) {
      const firstLine = previous + 1;
      const lastLine = line - 1;
      segments.push({
        kind: "lines",
        from: lineStart(row, firstLine),
        to: lineStart(row, lastLine + 1) - 1,
        firstLine,
        lastLine,
        firstBase: firstLine * row.lineBases + 1,
        lastBase: (lastLine + 1) * row.lineBases,
      });
    }
    const bases = basesOnLine(row, line);
    const firstBase = line * row.lineBases + 1;
    const cells: (string | null)[] = [];
    for (let i = 0; i < bases; i += 1) cells.push(baseAt(file, firstBase - 1 + i) ?? null);
    segments.push({
      kind: "line",
      from: lineStart(row, line),
      to: lineStart(row, line) + bases + terminatorWidth(row) - 1,
      line,
      firstBase,
      lastBase: firstBase + bases - 1,
      ...(cells.some((c) => c !== null) ? { cells } : {}),
    });
    previous = line;
  }
  segments.push({ kind: "after", from: sequenceEnd(row) });
  return segments;
}

/** One sentence for the readout. */
export function readout(state: FaiCalculatorState): string {
  const { row } = state.file;
  const byte = currentByte(state);
  if (state.at.kind === "base") {
    const p = state.at.p;
    const base = baseAt(state.file, p);
    return (
      `Base ${fmt(p + 1)} of ${row.name} (p = ${fmt(p)}) is on sequence line ${fmt(Math.floor(p / row.lineBases) + 1)}, ` +
      `column ${fmt(p % row.lineBases)} counting from 0. It is byte ${fmt(byte)}${base ? `, which holds \`${base}\`` : ""}.`
    );
  }
  return `Byte ${fmt(byte)} is ${describeByte(state.file, byte)}.`;
}
