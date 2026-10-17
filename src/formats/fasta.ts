// FASTA structure and its .fai, as samtools/htslib 1.24 computes it (seq 3.1-3.2; faidx(5)).
// Pure and DOM-free: the FASTA validators, the content-test helpers and any viewer can share it.
import { byteLength, isBlank, splitLines, type Line } from "./lines.ts";

export interface FastaRecord {
  /** The `>` line. */
  header: Line;
  /** The first word after `>`, with leading spaces and TABs skipped (`> chr1` gives `chr1`). */
  name: string;
  /** Free text after the name; tools ignore it. */
  description: string;
  /**
   * The record's sequence lines in order, blank lines inside the sequence included. Blank lines
   * after the last sequence line sit between records and are in `trailingBlanks` instead.
   */
  lines: Line[];
  trailingBlanks: Line[];
}

export interface ParsedFasta {
  lines: Line[];
  bom: boolean;
  finalNewline: boolean;
  /** Lines before the first `>` header. */
  preamble: Line[];
  records: FastaRecord[];
}

/** Whether a line is a FASTA header line. */
export const isHeader = (line: Line): boolean => line.text.startsWith(">");

export function parseFasta(text: string): ParsedFasta {
  const { lines, bom, finalNewline } = splitLines(text);
  const preamble: Line[] = [];
  const records: FastaRecord[] = [];
  let current: FastaRecord | undefined;
  for (const line of lines) {
    if (isHeader(line)) {
      const rest = line.text.slice(1).replace(/^[ \t]+/, "");
      const cut = rest.search(/[ \t]/);
      const name = cut < 0 ? rest : rest.slice(0, cut);
      const description = cut < 0 ? "" : rest.slice(cut).replace(/^[ \t]+/, "");
      current = { header: line, name, description, lines: [], trailingBlanks: [] };
      records.push(current);
    } else if (!current) {
      preamble.push(line);
    } else if (isBlank(line.text)) {
      current.trailingBlanks.push(line);
    } else {
      // A blank run followed by more sequence belongs inside the record.
      current.lines.push(...current.trailingBlanks, line);
      current.trailingBlanks = [];
    }
  }
  return { lines, bom, finalNewline, preamble, records };
}

/** Bases on a sequence line, as faidx counts them: every character that is not whitespace. */
export const basesOn = (line: Line): number => line.text.replace(/\s/g, "").length;

/** The record's sequence with whitespace removed (case kept). */
export const sequenceOf = (record: FastaRecord): string =>
  record.lines.map((l) => l.text.replace(/\s/g, "")).join("");

/** One .fai row (faidx(5)). */
export interface FaiRow {
  name: string;
  length: number;
  /** 0-based byte offset of the first base. */
  offset: number;
  lineBases: number;
  /** Bytes per full line, terminator included: LINEBASES + 1 for LF, + 2 for CR-LF. */
  lineWidth: number;
  /** FASTQ indexes only: 0-based byte offset of the first quality character. */
  qualOffset?: number;
}

export const FAI_COLUMNS = ["NAME", "LENGTH", "OFFSET", "LINEBASES", "LINEWIDTH", "QUALOFFSET"] as const;

/**
 * The .fai samtools faidx 1.24 writes for a FASTA it accepts (seq 3.2, EX-03, EX-04): empty
 * records are left out, and a repeated name keeps only its first record. Line geometry comes
 * from each record's first sequence line. The result is meaningful only for an indexable file.
 */
export function faiRows(fasta: string | ParsedFasta): FaiRow[] {
  const parsed = typeof fasta === "string" ? parseFasta(fasta) : fasta;
  const seen = new Set<string>();
  const rows: FaiRow[] = [];
  for (const record of parsed.records) {
    const first = record.lines.find((l) => !isBlank(l.text));
    if (!first || seen.has(record.name)) continue;
    seen.add(record.name);
    const lineBases = basesOn(first);
    const terminator = first.eol === "" ? 1 : first.eol.length;
    rows.push({
      name: record.name,
      length: record.lines.reduce((n, l) => n + basesOn(l), 0),
      offset: first.byteOffset,
      lineBases,
      // Bytes, not bases: an internal space counts here but not in LINEBASES (seq FA-S05).
      lineWidth: byteLength(first.text) + terminator,
    });
  }
  return rows;
}

/** A .fai row as its TAB-separated line (no terminator). */
export const faiRowText = (row: FaiRow): string =>
  [
    row.name,
    row.length,
    row.offset,
    row.lineBases,
    row.lineWidth,
    ...(row.qualOffset === undefined ? [] : [row.qualOffset]),
  ].join("\t");

/**
 * The byte that holds the base at 0-based position `p` (seq 3.2):
 * OFFSET + floor(p / LINEBASES) * LINEWIDTH + (p mod LINEBASES).
 */
export function faiByte(row: Pick<FaiRow, "offset" | "lineBases" | "lineWidth">, p: number): number {
  if (!Number.isInteger(p) || p < 0) throw new RangeError(`faiByte: p must be a 0-based position, got ${p}`);
  if (row.lineBases <= 0) throw new RangeError("faiByte: LINEBASES must be positive");
  return row.offset + Math.floor(p / row.lineBases) * row.lineWidth + (p % row.lineBases);
}

/** Parse one TAB-separated .fai line into a row, or undefined when it is not a well-formed row. */
export function parseFaiRow(text: string): FaiRow | undefined {
  const cols = text.split("\t");
  if (cols.length !== 5 && cols.length !== 6) return undefined;
  const [name = "", ...rest] = cols;
  if (!rest.every((c) => /^\d+$/.test(c))) return undefined;
  const [length = 0, offset = 0, lineBases = 0, lineWidth = 0, qualOffset] = rest.map(Number);
  return { name, length, offset, lineBases, lineWidth, ...(qualOffset === undefined ? {} : { qualOffset }) };
}
