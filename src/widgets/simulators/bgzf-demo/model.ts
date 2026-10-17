// The BGZF random-access demo (docs/PLAN.md 5 L05 §3, 7.5; seq 3.4; found 4.5, Q4; SAMv1 §4.1):
// fetching one base from a compressed FASTA. With BGZF the .gzi names the block, the reader
// seeks to it, inflates that block alone and skips `uoffset` bytes; the virtual offset is
// coffset << 16 | uoffset. With plain gzip there is one DEFLATE stream, so it inflates
// everything before the target. The demo also checks the 28-byte EOF block (SAMv1 §4.1.2): a
// BGZF file without it is presumed truncated (CASE-14). Pure; the view is ./view.tsx.
//
// The default file is seq 3.4's verified example: a 200 kb FASTA (`chrZ 200000 16 60 61`)
// compressed by bgzip 1.24 with default settings, whose .gzi holds three entries. Its
// compressed size is not part of the note, so the demo never states it.
//
// Exercise data (`init`, and each preset's `state`; all optional):
//   file       the name shown, default "chrZ.fa.gz"
//   fai        the .fai row that turns a 1-based `position` into an uncompressed offset
//   gzi        [[coffset, uoffset], ...]: one pair per block start after the first (0, 0)
//   usize      total uncompressed bytes (default: the end of the .fai row's sequence)
//   position   the 1-based base to fetch (needs `fai`; default 140,001) | target: an offset
//   mode       "bgzf" (default) or "gzip"
//   eof        false when the 28-byte EOF block is missing (default true)
// Actions: { type: "step" } | { type: "restart" } | { type: "mode", mode }
//   | { type: "position", position } | { type: "target", target } | { type: "eof", present }
//   | { type: "checkEof" } | { type: "preset", state }
// Goal checks:
//   fetched        { mode?, position? | target? }   a fetch ran to its last step
//   comparedModes  { position? | target? }          the same target was fetched both ways
//   eofChecked     { present }                      the end was checked with the EOF block present or not
import { faiByte, parseFaiRow, type FaiRow } from "../../../formats/fasta.ts";
import type { SimulatorModel, TextView } from "../types.ts";

export type BgzfMode = "bgzf" | "gzip";

/** seq 3.4: the 200 kb test FASTA. */
export const CHRZ_FAI = "chrZ\t200000\t16\t60\t61";
/** seq 3.4: its .gzi from bgzip 1.24 with default settings (blocks end on newlines). */
export const CHRZ_GZI_DEFAULT: readonly (readonly [number, number])[] = [
  [20642, 65225],
  [41248, 130495],
  [61931, 195765],
];
/** seq 3.4: its .gzi from `bgzip --binary` (every block but the last holds 65,280 bytes). */
export const CHRZ_GZI_BINARY: readonly (readonly [number, number])[] = [
  [20658, 65280],
  [41263, 130560],
  [61963, 195840],
];
/** A BGZF block holds at most 64 KiB of uncompressed data (SAMv1 §4.1). */
export const MAX_BLOCK = 65536;
/** The EOF block's size in bytes (SAMv1 §4.1.2). */
export const EOF_BYTES = 28;
const GZIP_CHUNK = 65536;

export interface BgzfBlock {
  /** 1-based block number. */
  number: number;
  coffset: number;
  ustart: number;
  usize: number;
  /** Known when a later block's start is known; the last data block's is not. */
  csize?: number;
}

export interface BgzfDemoState {
  file: string;
  fai?: Pick<FaiRow, "name" | "length" | "offset" | "lineBases" | "lineWidth">;
  /** Block starts after the first, as in the .gzi. */
  gzi: (readonly [number, number])[];
  usize: number;
  eof: boolean;
  mode: BgzfMode;
  /** The 1-based base being fetched, when the target was given as a position. */
  position?: number;
  /** The uncompressed offset being fetched. */
  target: number;
  /** Steps of the current fetch taken so far. */
  step: number;
  /** "bgzf:142349" for every fetch run to its end. */
  fetched: string[];
  /** The result of the last EOF check, cleared when the file changes. */
  eofCheck?: "present" | "absent";
  /** Every EOF check outcome seen. */
  eofChecks: ("present" | "absent")[];
  /** Why the last action was refused. */
  notice?: string;
}

export type BgzfDemoAction =
  | { type: "step" }
  | { type: "restart" }
  | { type: "mode"; mode: BgzfMode }
  | { type: "position"; position: number }
  | { type: "target"; target: number }
  | { type: "eof"; present: boolean }
  | { type: "checkEof" }
  | { type: "preset"; state: Record<string, unknown> };

export type FetchStep =
  | { kind: "fai"; text: string }
  | { kind: "find"; text: string; block: number }
  | { kind: "inflate"; text: string; block: number }
  | { kind: "skip"; text: string; block: number }
  | { kind: "start"; text: string }
  | { kind: "chunk"; text: string; inflatedTo: number };

const fmt = (n: number) => n.toLocaleString("en-US");
const withoutPosition = (state: BgzfDemoState): BgzfDemoState => {
  const next = { ...state };
  delete next.position;
  return next;
};
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** The virtual offset of a byte: coffset << 16 | uoffset (SAMv1 §4.1), exact beyond 2^31. */
export const virtualOffset = (coffset: number, uoffset: number): number => coffset * 2 ** 16 + uoffset;

/** "A120 2E4E": the coffset bits, then the 16 uoffset bits, in hex. */
export const virtualOffsetHex = (coffset: number, uoffset: number): string =>
  `${coffset.toString(16).toUpperCase()} ${uoffset.toString(16).toUpperCase().padStart(4, "0")}`;

/** Every data block, from the .gzi and the total size. */
export function blocks(state: Pick<BgzfDemoState, "gzi" | "usize">): BgzfBlock[] {
  const starts: (readonly [number, number])[] = [[0, 0], ...state.gzi];
  return starts.map(([coffset, ustart], i) => {
    const next = starts[i + 1];
    return {
      number: i + 1,
      coffset,
      ustart,
      usize: (next ? next[1] : state.usize) - ustart,
      ...(next ? { csize: next[0] - coffset } : {}),
    };
  });
}

/** The block that holds uncompressed offset `target`. */
export function blockOf(state: Pick<BgzfDemoState, "gzi" | "usize">, target: number): BgzfBlock {
  const all = blocks(state);
  return all.findLast((b) => b.ustart <= target) ?? all[0]!;
}

function targetName(state: BgzfDemoState): string {
  return state.position !== undefined && state.fai
    ? `base ${fmt(state.position)} of ${state.fai.name}`
    : `uncompressed byte ${fmt(state.target)}`;
}

/** The steps of the current fetch. */
export function plan(state: BgzfDemoState): FetchStep[] {
  const steps: FetchStep[] = [];
  const { fai, position, target } = state;
  if (fai && position !== undefined) {
    const p = position - 1;
    const lines = Math.floor(p / fai.lineBases);
    steps.push({
      kind: "fai",
      text:
        `The .fai turns base ${fmt(position)} (p = ${fmt(p)}) into uncompressed byte ` +
        `${fmt(fai.offset)} + ${fmt(lines)} × ${fmt(fai.lineWidth)} + ${fmt(p % fai.lineBases)} = ${fmt(target)}.`,
    });
  }
  const total = (n: number) => `Inflated in total: ${fmt(n)} of ${fmt(state.usize)} bytes.`;
  if (state.mode === "bgzf") {
    const b = blockOf(state, target);
    const u = target - b.ustart;
    const n = blocks(state).length;
    steps.push({
      kind: "find",
      block: b.number,
      text:
        `The .gzi says block ${b.number} starts at compressed byte ${fmt(b.coffset)} and uncompressed byte ${fmt(b.ustart)}. ` +
        `The target is ${fmt(u)} bytes into it, so its virtual offset is ${fmt(b.coffset)} << 16 | ${fmt(u)} = ` +
        `${fmt(virtualOffset(b.coffset, u))}.`,
    });
    const before =
      ["", "Block 1 is", "Blocks 1 and 2 are"][b.number - 1] ?? `Blocks 1 to ${b.number - 1} are`;
    const skipped = before ? ` ${before} never read.` : "";
    steps.push({
      kind: "inflate",
      block: b.number,
      text:
        `Seek to compressed byte ${fmt(b.coffset)} and inflate block ${b.number} alone: ` +
        (b.csize === undefined
          ? `it becomes ${fmt(b.usize)} bytes.`
          : `${fmt(b.csize)} compressed bytes become ${fmt(b.usize)}.`) +
        skipped,
    });
    steps.push({
      kind: "skip",
      block: b.number,
      text:
        `Skip ${fmt(u)} bytes of the inflated block: the next byte is ${targetName(state)}. ` +
        total(b.usize) +
        ` That is 1 block of ${n}.`,
    });
    return steps;
  }
  steps.push({
    kind: "start",
    text: "A gzip file is one DEFLATE stream with no block starts to look up, so reading starts at byte 0.",
  });
  for (let from = 0; from <= target; from += GZIP_CHUNK) {
    const to = Math.min(from + GZIP_CHUNK - 1, target);
    const last = to === target;
    steps.push({
      kind: "chunk",
      inflatedTo: to + 1,
      text: last
        ? `Inflate bytes ${fmt(from)} to ${fmt(to)}: the last one is ${targetName(state)}. ${total(to + 1)}`
        : `Inflate bytes ${fmt(from)} to ${fmt(to)}. None of them is the target, but there is no way to skip them.`,
    });
  }
  return steps;
}

/** What the step log shows after an EOF check. */
export function eofText(outcome: "present" | "absent"): string {
  return outcome === "present"
    ? `The last ${EOF_BYTES} bytes are the BGZF EOF block, so the file is complete.`
    : `The last ${EOF_BYTES} bytes are not the EOF block, so the file is presumed truncated (CASE-14) and its verdict is Invalid. ` +
        "Tools say: samtools warns `EOF marker is absent. The input may be truncated` and carries on, and `gzip -t` still passes.";
}

/** How far the current fetch got, for the view. */
export function progress(state: BgzfDemoState): {
  steps: FetchStep[];
  done: boolean;
  /** BGZF: the block found, whether it is inflated, whether the skip happened. */
  block?: number;
  inflated: boolean;
  skipped: boolean;
  /** Uncompressed bytes inflated so far. */
  inflatedBytes: number;
} {
  const steps = plan(state);
  const taken = steps.slice(0, state.step);
  const find = taken.find((s) => s.kind === "find");
  const inflated = taken.some((s) => s.kind === "inflate");
  const skipped = taken.some((s) => s.kind === "skip");
  let inflatedBytes = 0;
  for (const s of taken) if (s.kind === "chunk") inflatedBytes = s.inflatedTo;
  if (inflated && find?.kind === "find") inflatedBytes = blocks(state)[find.block - 1]?.usize ?? 0;
  return {
    steps,
    done: state.step >= steps.length,
    ...(find?.kind === "find" ? { block: find.block } : {}),
    inflated,
    skipped,
    inflatedBytes,
  };
}

// --- Building and validating -----------------------------------------------------------------

type Data = Pick<BgzfDemoState, "file" | "fai" | "gzi" | "usize">;

function gziFrom(value: unknown): (readonly [number, number])[] {
  if (!Array.isArray(value)) throw new Error("bgzf-demo: gzi must be a list of [coffset, uoffset] pairs");
  return value.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((n) => isInt(n) && n > 0))
      throw new Error(`bgzf-demo: ${JSON.stringify(pair)} is not a [coffset, uoffset] pair`);
    return [pair[0] as number, pair[1] as number] as const;
  });
}

function dataFrom(args: Record<string, unknown>): Data {
  const faiRow = args.fai === undefined && args.gzi === undefined ? CHRZ_FAI : args.fai;
  let fai: Data["fai"];
  if (faiRow !== undefined) {
    const row = typeof faiRow === "string" ? parseFaiRow(faiRow) : undefined;
    if (!row || row.lineBases < 1 || row.lineWidth <= row.lineBases)
      throw new Error(`bgzf-demo: fai must be a TAB-separated .fai row, got ${JSON.stringify(faiRow)}`);
    fai = {
      name: row.name,
      length: row.length,
      offset: row.offset,
      lineBases: row.lineBases,
      lineWidth: row.lineWidth,
    };
  }
  const gzi = args.gzi === undefined ? CHRZ_GZI_DEFAULT.map((p) => [p[0], p[1]] as const) : gziFrom(args.gzi);
  let usize: number;
  if (args.usize !== undefined) {
    if (!isInt(args.usize) || args.usize < 1)
      throw new Error("bgzf-demo: usize must be a positive whole number");
    usize = args.usize;
  } else if (fai) {
    const lines = Math.ceil(fai.length / fai.lineBases);
    usize =
      fai.offset +
      (lines - 1) * fai.lineWidth +
      (fai.length - (lines - 1) * fai.lineBases) +
      (fai.lineWidth - fai.lineBases);
  } else throw new Error("bgzf-demo: give usize or fai");
  const data: Data = {
    file: typeof args.file === "string" ? args.file : "chrZ.fa.gz",
    ...(fai ? { fai } : {}),
    gzi,
    usize,
  };
  const problem = dataProblem(data);
  if (problem) throw new Error(`bgzf-demo: ${problem}`);
  return data;
}

const faiText = (row: NonNullable<BgzfDemoState["fai"]>) =>
  [row.name, row.length, row.offset, row.lineBases, row.lineWidth].join("\t");

/** Why a .gzi cannot describe a BGZF file of `usize` bytes, or undefined. */
export function dataProblem(data: Pick<BgzfDemoState, "gzi" | "usize">): string | undefined {
  const all = blocks(data);
  for (let i = 1; i < all.length; i += 1) {
    const prev = all[i - 1]!;
    const block = all[i]!;
    if (block.coffset <= prev.coffset || block.ustart <= prev.ustart) return "gzi offsets must increase";
  }
  if (all.some((b) => b.usize < 1 || b.usize > MAX_BLOCK))
    return `every block must hold 1 to ${fmt(MAX_BLOCK)} uncompressed bytes`;
  return undefined;
}

/** The uncompressed offset of a 1-based position, or undefined when it is outside the sequence. */
function offsetOf(data: Data, position: number): number | undefined {
  if (!data.fai || !isInt(position) || position < 1 || position > data.fai.length) return undefined;
  return faiByte(data.fai, position - 1);
}

const DEFAULT_POSITION = 140_001;

function withTarget(
  state: BgzfDemoState,
  spec: { position?: unknown; target?: unknown },
): BgzfDemoState | string {
  if (spec.position !== undefined) {
    if (!state.fai) return "This file has no .fai row, so give an uncompressed byte offset instead.";
    const target = offsetOf(state, spec.position as number);
    if (target === undefined || target >= state.usize)
      return `${state.fai.name} has ${fmt(state.fai.length)} bases: choose a position from 1 to ${fmt(state.fai.length)}.`;
    return { ...state, position: spec.position as number, target, step: 0 };
  }
  if (spec.target !== undefined) {
    const target = spec.target;
    if (!isInt(target) || target < 0 || target >= state.usize)
      return `The file holds ${fmt(state.usize)} uncompressed bytes: choose an offset from 0 to ${fmt(state.usize - 1)}.`;
    return { ...withoutPosition(state), target, step: 0 };
  }
  return state;
}

const clean = (state: BgzfDemoState): BgzfDemoState => {
  const next = { ...state };
  delete next.notice;
  return next;
};
const refuse = (state: BgzfDemoState, notice: string): BgzfDemoState => ({ ...state, notice });

function record(state: BgzfDemoState): BgzfDemoState {
  if (state.step < plan(state).length) return state;
  const key = `${state.mode}:${state.target}`;
  return state.fetched.includes(key) ? state : { ...state, fetched: [...state.fetched, key] };
}

function preset(state: BgzfDemoState, args: Record<string, unknown>): BgzfDemoState {
  let next: BgzfDemoState = { ...state };
  if (
    args.file !== undefined ||
    args.fai !== undefined ||
    args.gzi !== undefined ||
    args.usize !== undefined
  ) {
    // What the preset leaves out stays as it is: the .fai row (or the size), the .gzi, the name.
    const current: Record<string, unknown> = {
      file: state.file,
      gzi: state.gzi,
      ...(state.fai ? { fai: faiText(state.fai) } : { usize: state.usize }),
    };
    if (args.fai !== undefined && args.usize === undefined) delete current.usize;
    let data: Data;
    try {
      data = dataFrom({ ...current, ...args });
    } catch {
      return state;
    }
    next = { ...next, ...data, step: 0 };
    if (!data.fai) delete next.fai;
    delete next.eofCheck;
    const target = next.position === undefined ? undefined : offsetOf(next, next.position);
    if (target !== undefined && target < next.usize) next = { ...next, target };
    else next = { ...withoutPosition(next), target: next.target < next.usize ? next.target : 0 };
  }
  if (args.mode === "bgzf" || args.mode === "gzip") next = { ...next, mode: args.mode, step: 0 };
  if (typeof args.eof === "boolean" && args.eof !== next.eof) {
    next = { ...next, eof: args.eof };
    delete next.eofCheck;
  }
  const targeted = withTarget(next, args);
  return typeof targeted === "string" ? state : clean(targeted);
}

// --- The model -------------------------------------------------------------------------------

function text(state: BgzfDemoState): TextView {
  const entries = plan(state)
    .slice(0, state.step)
    .map((s) => s.text);
  if (state.eofCheck) entries.push(eofText(state.eofCheck));
  if (entries.length === 0)
    entries.push(
      `Ready to fetch ${targetName(state)} from ${state.file} (${state.mode === "bgzf" ? "BGZF" : "plain gzip"}). Select Step.`,
    );
  return { kind: "log", entries };
}

const argsOf = (args: unknown): Record<string, unknown> =>
  typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};

function targetArg(state: BgzfDemoState, args: Record<string, unknown>): number | undefined | null {
  if (args.position !== undefined) return offsetOf(state, args.position as number) ?? null;
  if (args.target !== undefined) return isInt(args.target) ? args.target : null;
  return undefined;
}

export const bgzfDemoModel = {
  init(args) {
    const data = dataFrom(args);
    const mode: BgzfMode = args.mode === "gzip" ? "gzip" : "bgzf";
    const base: BgzfDemoState = {
      ...data,
      eof: args.eof !== false,
      mode,
      target: 0,
      step: 0,
      fetched: [],
      eofChecks: [],
    };
    const spec =
      args.position === undefined && args.target === undefined && data.fai
        ? { position: Math.min(DEFAULT_POSITION, data.fai.length) }
        : { position: args.position, target: args.target };
    const targeted = withTarget(base, spec);
    if (typeof targeted === "string") throw new Error(`bgzf-demo: ${targeted}`);
    return targeted;
  },

  reduce(state, action) {
    if (typeof action !== "object" || action === null) return state;
    switch (action.type) {
      case "step":
        return state.step < plan(state).length ? record(clean({ ...state, step: state.step + 1 })) : state;
      case "restart":
        return state.step === 0 ? state : clean({ ...state, step: 0 });
      case "mode":
        return action.mode === "bgzf" || action.mode === "gzip"
          ? clean({ ...state, mode: action.mode, step: action.mode === state.mode ? state.step : 0 })
          : state;
      case "position":
      case "target": {
        const next = withTarget(
          state,
          action.type === "position" ? { position: action.position } : { target: action.target },
        );
        return typeof next === "string" ? refuse(state, next) : clean(next);
      }
      case "eof": {
        if (typeof action.present !== "boolean" || action.present === state.eof) return state;
        const next = clean({ ...state, eof: action.present });
        delete next.eofCheck;
        return next;
      }
      case "checkEof": {
        if (state.mode !== "bgzf") return state;
        const outcome: "present" | "absent" = state.eof ? "present" : "absent";
        const eofChecks = state.eofChecks.includes(outcome) ? state.eofChecks : [...state.eofChecks, outcome];
        return clean({ ...state, eofCheck: outcome, eofChecks });
      }
      case "preset":
        return typeof action.state === "object" && action.state !== null
          ? preset(state, action.state)
          : state;
      default:
        return state;
    }
  },

  goalChecks: {
    fetched: (state, args) => {
      const a = argsOf(args);
      const target = targetArg(state, a);
      if (target === null) return false;
      const modes = a.mode === "bgzf" || a.mode === "gzip" ? [a.mode] : ["bgzf", "gzip"];
      return state.fetched.some((key) => {
        const [mode, t] = key.split(":");
        return modes.includes(mode ?? "") && (target === undefined || Number(t) === target);
      });
    },
    comparedModes: (state, args) => {
      const target = targetArg(state, argsOf(args));
      if (target === null) return false;
      const targets = (mode: BgzfMode) =>
        state.fetched.filter((k) => k.startsWith(`${mode}:`)).map((k) => Number(k.slice(mode.length + 1)));
      const gzip = targets("gzip");
      return targets("bgzf").some((t) => gzip.includes(t) && (target === undefined || t === target));
    },
    eofChecked: (state, args) => {
      const { present } = argsOf(args);
      return typeof present === "boolean" && state.eofChecks.includes(present ? "present" : "absent");
    },
  },

  text,
} satisfies SimulatorModel<BgzfDemoState, BgzfDemoAction>;
