// The Phred converter (docs/PLAN.md 5 L06.2, 7.5; found 3.4, EX-05; seq EX-07): a quality
// character, its Q and its error probability are bound both ways at offset 33 (Q = code − 33,
// P = 10^(−Q/10)), and a quality string is summed into expected errors (the sum of P, never an
// average of Q). Pure; the view is ./view.tsx. The arithmetic is src/formats/phred.ts.
//
// Exercise data (`init`, and each preset's `state`):
//   char | q   the character or Q shown first (default Q10, `+`)
//   quality    a quality string to sum (default empty)
//   sum        false hides the quality string and its sum, so follow-up predicts about expected
//              errors are not answered by the tool (init only; default true)
// Actions: { type: "char", char } | { type: "q", q } | { type: "step", by } | { type: "p", p }
//   | { type: "quality", quality } | { type: "preset", state }
// Goal checks:
//   decoded    { chars: "I5?#" }   every character was converted (in the converter or the string)
//   showsQ     { q }               the converter shows Q
//   showsChar  { char }            the converter shows the character
//   qualityIs  { quality }         the quality string is exactly `quality`
// What the initial state shows does not count as converted: the learner has to act.
import { charToQ, PHRED33, PHRED64, pToQ, qToChar, qToP } from "../../../formats/phred.ts";
import type { SimulatorModel, TextView } from "../types.ts";

/** Phred+33 runs from `!` (Q0) to `~` (Q93). */
export const MIN_Q = 0;
export const MAX_Q = 93;
/** Longer than a 2×150 read pair's qualities would ever need here. */
export const MAX_QUALITY_LENGTH = 300;
/**
 * The four-level quality alphabet of the case data (D-18). Its values are a course design
 * choice; which instruments write exactly these bins is not verified (V-06), so the UI never
 * names an instrument.
 */
export const CASE_QUALITY_BINS: readonly { char: string; q: number }[] = [
  { char: "#", q: 2 },
  { char: ",", q: 11 },
  { char: ":", q: 25 },
  { char: "F", q: 37 },
];

export interface PhredConverterState {
  q: number;
  quality: string;
  /** The quality string and its sum are offered (init `sum`, default true). */
  sum: boolean;
  /** Characters the learner has converted, unique, in code order. */
  seen: string[];
}

export type PhredConverterAction =
  | { type: "char"; char: string }
  | { type: "q"; q: number }
  | { type: "step"; by: number }
  | { type: "p"; p: number }
  | { type: "quality"; quality: string }
  | { type: "preset"; state: Record<string, unknown> };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const validQ = (q: unknown): q is number => isInt(q) && q >= MIN_Q && q <= MAX_Q;
/** A Phred+33 quality character: one of `!` to `~`. */
export const isQualityChar = (c: string): boolean => c.length === 1 && c >= "!" && c <= "~";
/** Drop everything that is not a quality character (spaces, newlines, non-ASCII). */
export const cleanQuality = (text: string): string =>
  Array.from(text).filter(isQualityChar).join("").slice(0, MAX_QUALITY_LENGTH);

const fmtInt = (n: number) => n.toLocaleString("en-US");

/** A probability in plain decimals with 3 significant digits: 0.631, 0.0001, 0.000200. */
export function formatP(p: number): string {
  if (p >= 1) return "1";
  if (p < 1e-6) return `1 in ${fmtInt(Math.round(1 / p))}`;
  const digits = Math.max(0, 2 - Math.floor(Math.log10(p)));
  return p.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, "$1");
}

/** "1 in 10,000" (or "1 in 1.6" below Q5). */
export function formatOdds(p: number): string {
  const n = 1 / p;
  return `1 in ${n < 10 ? n.toFixed(1).replace(/\.0$/, "") : fmtInt(Math.round(n))}`;
}

/** Accuracy as a percentage: Q40 is "99.99%". */
export function formatAccuracy(q: number): string {
  const decimals = Math.max(0, Math.ceil(q / 10) - 2);
  return `${(100 * (1 - qToP(q))).toFixed(Math.min(decimals, 8))}%`;
}

/** 4 significant digits, trailing zeros dropped: 0.101, 0.6314. */
export const formatSum = (x: number): string => (x === 0 ? "0" : String(Number(x.toPrecision(4))));

const withSeen = (state: PhredConverterState, chars: Iterable<string>): PhredConverterState => {
  const set = new Set(state.seen);
  for (const c of chars) if (isQualityChar(c)) set.add(c);
  if (set.size === state.seen.length) return state;
  return { ...state, seen: [...set].sort() };
};

const setQ = (state: PhredConverterState, q: number): PhredConverterState =>
  validQ(q) ? withSeen({ ...state, q }, [qToChar(q)]) : state;

function apply(state: PhredConverterState, args: Record<string, unknown>): PhredConverterState {
  let next = state;
  if (typeof args.char === "string" && isQualityChar(args.char)) next = setQ(next, charToQ(args.char));
  else if (validQ(args.q)) next = setQ(next, args.q);
  if (typeof args.quality === "string" && state.sum) {
    const quality = cleanQuality(args.quality);
    next = withSeen({ ...next, quality }, quality);
  }
  return next;
}

/** One row per distinct character, in order of first appearance. */
export interface QualityGroup {
  char: string;
  q: number;
  p: number;
  count: number;
  sum: number;
}

export interface QualitySummary {
  groups: QualityGroup[];
  length: number;
  expectedErrors: number;
  meanP: number;
  /** The average of the Q values: shown only to say why it misleads. */
  meanQ: number;
}

export function summarize(quality: string): QualitySummary {
  const byChar = new Map<string, QualityGroup>();
  let expectedErrors = 0;
  let qTotal = 0;
  for (const char of quality) {
    const q = charToQ(char, PHRED33);
    const p = qToP(q);
    expectedErrors += p;
    qTotal += q;
    const group = byChar.get(char) ?? { char, q, p, count: 0, sum: 0 };
    group.count += 1;
    group.sum += p;
    byChar.set(char, group);
  }
  const length = quality.length;
  return {
    groups: [...byChar.values()],
    length,
    expectedErrors,
    meanP: length ? expectedErrors / length : 0,
    meanQ: length ? qTotal / length : 0,
  };
}

/**
 * The share of the expected errors one group contributes: whole percentages from 10% to 99%,
 * one decimal otherwise, so a dominant group reads "99.9%", never "100%".
 */
export function share(group: QualityGroup, total: number): string {
  const pct = total ? (100 * group.sum) / total : 0;
  if (pct === 0 || pct === 100) return `${pct}%`;
  return `${pct >= 10 && pct < 99.5 ? Math.round(pct) : pct.toFixed(1)}%`;
}

/** The legacy Phred+64 character for Q, when it is printable ASCII. */
export const phred64Char = (q: number): string | undefined =>
  q + PHRED64 <= 126 ? qToChar(q, PHRED64) : undefined;

/** One sentence about the converter. */
export function converterReadout(state: PhredConverterState): string {
  const p = qToP(state.q);
  return (
    `\`${qToChar(state.q)}\` is Q${state.q}: error probability ${formatP(p)}` +
    (state.q >= 1 ? ` (${formatOdds(p)})` : "") +
    `, accuracy ${formatAccuracy(state.q)}.`
  );
}

/** One sentence about the quality string. */
export function qualityReadout(state: PhredConverterState): string {
  if (!state.quality) return "Type a quality string to add up its expected errors.";
  const s = summarize(state.quality);
  const top = [...s.groups].sort((a, b) => b.sum - a.sum)[0];
  const bases = `${fmtInt(s.length)} base${s.length === 1 ? "" : "s"}`;
  const lead =
    top && s.groups.length > 1
      ? ` The \`${top.char}\` ${top.count === 1 ? "base contributes" : "bases contribute"} ${share(top, s.expectedErrors)} of it.`
      : "";
  return `${bases}, expected errors ${formatSum(s.expectedErrors)}.${lead}`;
}

function text(state: PhredConverterState): TextView {
  const columns = ["Character", "Q", "Error probability", "Bases", "Expected errors"];
  if (!state.quality) {
    const p = qToP(state.q);
    return { kind: "table", columns, rows: [[qToChar(state.q), `Q${state.q}`, formatP(p), "1", formatP(p)]] };
  }
  const s = summarize(state.quality);
  const rows = s.groups.map((g) => [g.char, `Q${g.q}`, formatP(g.p), fmtInt(g.count), formatSum(g.sum)]);
  rows.push(["All", "", "", fmtInt(s.length), formatSum(s.expectedErrors)]);
  return { kind: "table", columns, rows };
}

const argsOf = (args: unknown): Record<string, unknown> =>
  typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {};

export const phredConverterModel = {
  init(args) {
    let q = 10;
    if (typeof args.char === "string") {
      if (!isQualityChar(args.char))
        throw new Error(`phred-converter: ${JSON.stringify(args.char)} is not a quality character`);
      q = charToQ(args.char);
    } else if (args.q !== undefined) {
      if (!validQ(args.q)) throw new Error("phred-converter: q must be a whole number from 0 to 93");
      q = args.q;
    }
    const quality = typeof args.quality === "string" ? args.quality : "";
    if (cleanQuality(quality) !== quality)
      throw new Error("phred-converter: quality may hold only the characters `!` to `~` (at most 300)");
    const sum = args.sum !== false;
    if (!sum && quality) throw new Error("phred-converter: a quality string needs sum: true");
    return { q, quality, sum, seen: [] };
  },

  reduce(state, action) {
    if (typeof action !== "object" || action === null) return state;
    switch (action.type) {
      case "char":
        return typeof action.char === "string" && isQualityChar(action.char)
          ? setQ(state, charToQ(action.char))
          : state;
      case "q":
        return setQ(state, action.q);
      case "step":
        return isInt(action.by) && action.by !== 0
          ? setQ(state, Math.min(MAX_Q, Math.max(MIN_Q, state.q + action.by)))
          : state;
      case "p": {
        const p = action.p;
        if (typeof p !== "number" || !(p > 0) || p > 1) return state;
        return setQ(state, Math.min(MAX_Q, Math.max(MIN_Q, Math.round(pToQ(p)))));
      }
      case "quality":
        return typeof action.quality === "string" ? apply(state, { quality: action.quality }) : state;
      case "preset":
        return typeof action.state === "object" && action.state !== null ? apply(state, action.state) : state;
      default:
        return state;
    }
  },

  goalChecks: {
    decoded: (state, args) => {
      const { chars } = argsOf(args);
      const list = typeof chars === "string" ? chars.split("") : Array.isArray(chars) ? chars : [];
      return list.length > 0 && list.every((c) => typeof c === "string" && state.seen.includes(c));
    },
    showsQ: (state, args) => argsOf(args).q === state.q,
    showsChar: (state, args) => argsOf(args).char === qToChar(state.q),
    qualityIs: (state, args) => {
      const { quality } = argsOf(args);
      return typeof quality === "string" && quality.length > 0 && state.quality === quality;
    },
  },

  text,
} satisfies SimulatorModel<PhredConverterState, PhredConverterAction>;
