// Arithmetic helpers that recompute exercise and quiz keys (docs/PLAN.md 11.6). A predict item
// names one with `computeWith: { helper, args }`; the content tests call it and compare the
// result with the authored answer. Pure, so a simulator model may reuse them too.
//
// Positions in arguments are written the way the item states them: `position` is 1-based (the
// .fai helper converts it to the 0-based p itself, so a key can never use a 1-based p), and
// intervals say which convention they use.
import type { HelperId } from "../exercises/types.ts";
import { faiByte, faiRows, parseFaiRow, type FaiRow } from "./fasta.ts";
import { parseFastq } from "./fastq.ts";
import { summarizeGzip } from "./gzip.ts";
import { charToQ, expectedErrors, qToP } from "./phred.ts";

export type HelperResult = number | string | readonly number[];
export type Helper = (args: Record<string, unknown>) => HelperResult;

const num = (args: Record<string, unknown>, key: string): number => {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new TypeError(`helper argument "${key}" must be a number`);
  return v;
};
const str = (args: Record<string, unknown>, key: string): string => {
  const v = args[key];
  if (typeof v !== "string") throw new TypeError(`helper argument "${key}" must be a string`);
  return v;
};
const opt = (args: Record<string, unknown>, key: string, fallback: number): number =>
  args[key] === undefined ? fallback : num(args, key);

/** The .fai row an item gives: a TAB-separated `row`, or OFFSET/LINEBASES/LINEWIDTH numbers. */
function rowOf(
  args: Record<string, unknown>,
): Pick<FaiRow, "offset" | "lineBases" | "lineWidth"> & { length?: number } {
  if (typeof args.row === "string") {
    const row = parseFaiRow(args.row);
    if (!row) throw new TypeError(`"row" is not a TAB-separated .fai row: ${JSON.stringify(args.row)}`);
    return row;
  }
  return {
    offset: num(args, "offset"),
    lineBases: num(args, "lineBases"),
    lineWidth: num(args, "lineWidth"),
  };
}

const COMPLEMENT: Record<string, string> = {
  A: "T",
  C: "G",
  G: "C",
  T: "A",
  U: "A",
  R: "Y",
  Y: "R",
  S: "S",
  W: "W",
  K: "M",
  M: "K",
  B: "V",
  V: "B",
  D: "H",
  H: "D",
  N: "N",
  "-": "-",
};

export const HELPERS: Readonly<Record<HelperId, Helper>> = {
  /**
   * `{ row: "chr2\t242193529\t251446211\t100\t101", position: 101 }` (or offset, lineBases,
   * lineWidth): the byte of the 1-based `position`, with p = position − 1 (seq 3.2).
   */
  faiByte(args) {
    const row = rowOf(args);
    const position = num(args, "position");
    if (!Number.isInteger(position) || position < 1) throw new RangeError("position is 1-based");
    if (row.length !== undefined && position > row.length)
      throw new RangeError("position is past the sequence end");
    return faiByte(row, position - 1);
  },
  /** `{ fasta }`: how many rows samtools faidx writes (empty records and repeated names drop out). */
  faiRowCount: (args) => faiRows(str(args, "fasta")).length,
  /** `{ fasta, name, field }`: one column of a sequence's .fai row ("OFFSET", "LINEWIDTH", ...). */
  faiField(args) {
    const row = faiRows(str(args, "fasta")).find((r) => r.name === str(args, "name"));
    if (!row) throw new RangeError(`no .fai row for ${String(args.name)}`);
    const key = { LENGTH: "length", OFFSET: "offset", LINEBASES: "lineBases", LINEWIDTH: "lineWidth" }[
      str(args, "field")
    ];
    if (!key) throw new RangeError(`unknown .fai field ${String(args.field)}`);
    return row[key as "length"];
  },
  /** `{ char, offset? }`: Q for one quality character (Phred+33 by default). */
  phredQ: (args) => charToQ(str(args, "char"), opt(args, "offset", 33)),
  /** `{ q }` or `{ char, offset? }`: the error probability. */
  phredP: (args) =>
    qToP(args.q === undefined ? charToQ(str(args, "char"), opt(args, "offset", 33)) : num(args, "q")),
  /** `{ quality, offset? }`: expected errors, the sum of per-base probabilities. */
  expectedErrors: (args) => expectedErrors(str(args, "quality"), opt(args, "offset", 33)),
  /** `{ pairs | reads, readLength }`: sequenced bases (a pair is two reads). */
  totalBases: (args) =>
    (args.pairs === undefined ? num(args, "reads") : 2 * num(args, "pairs")) * num(args, "readLength"),
  /** `{ pairs | reads, readLength, size }`: mean depth C = N·L / G (found 3.3). */
  meanDepth: (args) =>
    ((args.pairs === undefined ? num(args, "reads") : 2 * num(args, "pairs")) * num(args, "readLength")) /
    num(args, "size"),
  /** `{ start, end }` 1-based closed: the BED interval [start − 1, end). */
  toBed: (args) => [num(args, "start") - 1, num(args, "end")],
  /** `{ start, end }` BED (0-based half-open): the 1-based closed interval. */
  fromBed: (args) => [num(args, "start") + 1, num(args, "end")],
  /** `{ start, end, convention: "bed" | "1-based" }`: interval length. */
  intervalLength(args) {
    const length = num(args, "end") - num(args, "start");
    return str(args, "convention") === "bed" ? length : length + 1;
  },
  /** `{ text }`: how many FASTQ records, parsed by length (seq EX-10). */
  fastqRecordCount: (args) => parseFastq(str(args, "text")).records.length,
  /** `{ text, record }`: the read length of the 1-based `record`. */
  fastqReadLength(args) {
    const record = parseFastq(str(args, "text")).records[num(args, "record") - 1];
    if (!record) throw new RangeError(`no record ${String(args.record)}`);
    return record.sequence.length;
  },
  /** `{ seq }`: the reverse complement, IUPAC-aware, case kept. */
  reverseComplement(args) {
    return str(args, "seq")
      .split("")
      .reverse()
      .map((c) => {
        const up = COMPLEMENT[c.toUpperCase()];
        if (!up) throw new RangeError(`no complement for ${c}`);
        return c === c.toLowerCase() ? up.toLowerCase() : up;
      })
      .join("");
  },
  /** `{ head }`: "bgzf", "gzip", "other" or "unknown" for a hex head (seq 6). */
  containerKind: (args) => summarizeGzip({ head: str(args, "head"), annotations: [] }).kind,
};
