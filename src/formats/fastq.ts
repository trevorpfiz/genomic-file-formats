// FASTQ structure, parsed the way Biopython and htslib do: a record ends when its quality is as
// long as its sequence, so wrapped records and quality lines that start with `@` or `+` parse
// correctly (seq 2, 3.3, EX-10). Pure and DOM-free.
//
// The parser never throws. Where the text breaks the record grammar it records an issue and
// resynchronises, so a validator can report one diagnostic per root cause (docs/PLAN.md 8.2).
import { splitLines, type Line } from "./lines.ts";

export interface FastqRecord {
  /** The title line (normally `@...`). */
  title: Line;
  /** The title's first character: `@` when well formed. */
  mark: string;
  /** Everything after the mark: read id, then an optional comment after a space or TAB. */
  titleText: string;
  /** The read id: the title's first word (it becomes the SAM QNAME). */
  id: string;
  sequenceLines: Line[];
  sequence: string;
  /** The `+` line, when present. */
  plus?: Line;
  qualityLines: Line[];
  quality: string;
  /** The record reached its quality line(s); false when the input ends inside it. */
  complete: boolean;
}

export type FastqIssue =
  /** A line where a record title is expected does not start with `@` (or is blank). */
  | { kind: "bad-title"; line: Line }
  /** The record has no sequence line before its `+` line. */
  | { kind: "no-sequence"; line: Line; record: FastqRecord }
  /** A new record title (`@...`) arrives before the record's `+` line. */
  | { kind: "missing-plus"; line: Line; record: FastqRecord }
  /** Quality length differs from sequence length; `line` is the last quality line read. */
  | { kind: "quality-length"; line: Line; record: FastqRecord }
  /** The input ends inside a record. `line` is the last line of the input. */
  | {
      kind: "truncated";
      line: Line;
      record: FastqRecord;
      /** What is missing: the `+` line, the whole quality, or part of the quality. */
      missing: "plus" | "quality" | "partial-quality";
    };

export interface ParsedFastq {
  lines: Line[];
  bom: boolean;
  finalNewline: boolean;
  records: FastqRecord[];
  issues: FastqIssue[];
}

/**
 * True when `lines[from..]` can complete a quality of `need` more characters exactly, ending at
 * the end of input or before a line that starts with `@`.
 */
function canComplete(lines: readonly Line[], from: number, need: number): boolean {
  let have = 0;
  for (let i = from; i < lines.length; i += 1) {
    have += lines[i]?.text.length ?? 0;
    if (have === need) {
      const next = lines[i + 1];
      return !next || next.text.startsWith("@");
    }
    if (have > need) return false;
  }
  return false;
}

export function parseFastq(text: string): ParsedFastq {
  const { lines, bom, finalNewline } = splitLines(text);
  const records: FastqRecord[] = [];
  const issues: FastqIssue[] = [];
  const n = lines.length;
  let i = 0;
  while (i < n) {
    const title = lines[i]!;
    if (title.text === "") {
      issues.push({ kind: "bad-title", line: title });
      i += 1;
      continue;
    }
    const titleText = title.text.slice(1);
    const record: FastqRecord = {
      title,
      mark: title.text[0] ?? "",
      titleText,
      id: titleText.split(/[ \t]/, 1)[0] ?? "",
      sequenceLines: [],
      sequence: "",
      qualityLines: [],
      quality: "",
      complete: false,
    };
    records.push(record);
    if (record.mark !== "@") issues.push({ kind: "bad-title", line: title });
    i += 1;

    // Sequence lines, up to the `+` line.
    while (i < n && !lines[i]!.text.startsWith("+")) {
      if (lines[i]!.text.startsWith("@") && record.sequenceLines.length > 0) break;
      record.sequenceLines.push(lines[i]!);
      i += 1;
    }
    record.sequence = record.sequenceLines.map((l) => l.text).join("");
    if (i >= n) {
      issues.push({ kind: "truncated", line: lines[n - 1]!, record, missing: "plus" });
      break;
    }
    if (!lines[i]!.text.startsWith("+")) {
      issues.push({ kind: "missing-plus", line: lines[i]!, record });
      continue; // the `@` line starts the next record
    }
    if (record.sequenceLines.length === 0) issues.push({ kind: "no-sequence", line: lines[i]!, record });
    record.plus = lines[i]!;
    i += 1;

    // Quality: the first line always belongs to the record (it may be empty for a zero-length
    // read); later lines only while they can still complete the quality exactly.
    if (i >= n) {
      issues.push({ kind: "truncated", line: lines[n - 1]!, record, missing: "quality" });
      break;
    }
    record.qualityLines.push(lines[i]!);
    record.quality = lines[i]!.text;
    i += 1;
    const need = record.sequence.length;
    while (record.quality.length < need && i < n && canComplete(lines, i, need - record.quality.length)) {
      record.qualityLines.push(lines[i]!);
      record.quality += lines[i]!.text;
      i += 1;
    }
    record.complete = true;
    // With no sequence line the missing sequence is the root cause; its quality is not judged.
    if (record.quality.length !== need && record.sequenceLines.length > 0) {
      const last = record.qualityLines.at(-1)!;
      if (record.quality.length < need && i >= n && !finalNewline) {
        record.complete = false;
        issues.push({ kind: "truncated", line: last, record, missing: "partial-quality" });
      } else {
        issues.push({ kind: "quality-length", line: last, record });
      }
    }
  }
  return { lines, bom, finalNewline, records, issues };
}
