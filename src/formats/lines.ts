// Line splitting shared by the text-format parsers, validators and helpers (docs/PLAN.md 8.2).
// Pure and DOM-free. Line numbers are 1-based; columns are 1-based character positions.
//
// Conventions:
// - A line ends at LF. A CR right before the LF is the line's terminator ("\r\n"), not text, so
//   consistent CR-LF files parse like LF files (seq 4: CR-LF can be indexed when consistent).
//   A CR anywhere else stays in the text, where rules can see it.
// - The text after the last LF is a line only when it is not empty; `finalNewline` records
//   whether the input ended with LF. Empty input has no lines.
// - A UTF-8 byte-order mark (U+FEFF) at the very start is removed from line 1 and reported in
//   `bom`, so a rule can flag it once at line 1, column 1 and parse the rest normally.

export type LineEnding = "\n" | "\r\n" | "";

export interface Line {
  /** 1-based line number. */
  number: number;
  /** The line's characters without its terminator (and without a leading BOM on line 1). */
  text: string;
  /** "\n", "\r\n", or "" for a last line without a final newline. */
  eol: LineEnding;
  /** 0-based UTF-8 byte offset of the line's first character in the input (after a BOM). */
  byteOffset: number;
}

export interface SplitText {
  lines: Line[];
  /** The input started with U+FEFF. */
  bom: boolean;
  /** The input ended with a line terminator (vacuously true for empty input). */
  finalNewline: boolean;
}

const encoder = new TextEncoder();

/** UTF-8 byte length of a string. */
export const byteLength = (text: string): number => encoder.encode(text).length;

export function splitLines(input: string): SplitText {
  const bom = input.startsWith("﻿");
  let offset = bom ? byteLength("﻿") : 0;
  const body = bom ? input.slice(1) : input;
  const lines: Line[] = [];
  if (body === "") return { lines, bom, finalNewline: true };
  const parts = body.split("\n");
  const finalNewline = parts.at(-1) === "";
  if (finalNewline) parts.pop();
  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    let text = part;
    let eol: LineEnding = last && !finalNewline ? "" : "\n";
    if (eol === "\n" && text.endsWith("\r")) {
      text = text.slice(0, -1);
      eol = "\r\n";
    }
    lines.push({ number: i + 1, text, eol, byteOffset: offset });
    offset += byteLength(text) + eol.length;
  });
  return { lines, bom, finalNewline };
}

/** Whitespace-only or empty. */
export const isBlank = (text: string): boolean => text.trim() === "";

/** The 1-based column of the first character matching `re`, or 0. */
export function firstColumn(text: string, re: RegExp): number {
  const m = re.exec(text);
  return m ? m.index + 1 : 0;
}
