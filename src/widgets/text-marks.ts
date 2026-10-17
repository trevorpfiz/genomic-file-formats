// Exact-text rendering shared by the snippet viewer, the fix-it overlay and its solution diff
// (docs/PLAN.md 7.8; ux 7.2, 7.6): lines split without losing CR or the final newline, the
// per-line description ("16 characters, no tabs or spaces") that screen readers hear and the
// "Lengths and separators" gutter shows, and whitespace markers that never change the text.
//
// Markers are spans around the real characters: a TAB stays a TAB (the arrow is drawn by CSS),
// a space stays a space (the dot is a pseudo-element). So copying the rendered text, or laying
// a textarea over it, keeps every column where it was.

/** Characters that look like ordinary text but break parsers; shown as code-point chips. */
export const SUSPECT_CHARS: Readonly<Record<string, string>> = {
  " ": "no-break space",
  "‘": "left single quotation mark",
  "’": "right single quotation mark",
  "“": "left double quotation mark",
  "”": "right double quotation mark",
  "–": "en dash",
  "—": "em dash",
  "​": "zero width space",
  "‌": "zero width non-joiner",
  "‍": "zero width joiner",
  "⁠": "word joiner",
  "﻿": "byte order mark",
};

/** "U+00A0". */
export const codePoint = (ch: string): string =>
  `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

export interface TextLine {
  /** 1-based. */
  n: number;
  /** The line without its line ending (a final CR is removed and flagged). */
  text: string;
  /** The line ended in CR LF (or CR at the end of the file). */
  cr: boolean;
}

export interface SplitText {
  lines: TextLine[];
  /** False when the text does not end with a newline (shown as a chip). */
  finalNewline: boolean;
}

/** Split exact text into lines, keeping CRs and the final-newline flag. */
export function splitLines(text: string): SplitText {
  if (text === "") return { lines: [], finalNewline: true };
  const parts = text.split("\n");
  const finalNewline = text.endsWith("\n");
  if (finalNewline) parts.pop();
  return {
    finalNewline,
    lines: parts.map((part, i) => {
      const cr = part.endsWith("\r");
      return { n: i + 1, text: cr ? part.slice(0, -1) : part, cr };
    }),
  };
}

const plural = (n: number, word: string) => `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

/**
 * What a line is made of, in words that give nothing away because every line gets one:
 * length, separators, leading or trailing whitespace, CR and unusual code points.
 * "20 characters, no tabs or spaces"; "24 characters, 5 tabs"; "12 characters, 2 spaces, ends
 * with a space, ends with CR"; "empty line".
 */
export function describeLine(line: Pick<TextLine, "text" | "cr">): string {
  const chars = Array.from(line.text);
  if (chars.length === 0) return line.cr ? "empty line, ends with CR" : "empty line";
  const parts = [plural(chars.length, "character")];
  const tabs = chars.filter((c) => c === "\t").length;
  const spaces = chars.filter((c) => c === " ").length;
  if (tabs && spaces) parts.push(`${plural(tabs, "tab")} and ${plural(spaces, "space")}`);
  else if (tabs) parts.push(plural(tabs, "tab"));
  else if (spaces) parts.push(plural(spaces, "space"));
  else parts.push("no tabs or spaces");
  const first = chars[0];
  const last = chars[chars.length - 1];
  if (first === " " || first === "\t") parts.push(`starts with a ${first === " " ? "space" : "tab"}`);
  if (chars.length > 1 && (last === " " || last === "\t"))
    parts.push(`ends with a ${last === " " ? "space" : "tab"}`);
  if (line.cr) parts.push("ends with CR");
  const odd = [...new Set(chars.filter((c) => c === "\r" || c.codePointAt(0)! > 0x7e || c < " "))]
    .filter((c) => c !== "\t")
    .map((c) => (c === "\r" ? "CR" : codePoint(c)));
  if (odd.length) parts.push(`contains ${odd.join(", ")}`);
  return parts.join(", ");
}

export interface MarkOptions {
  /**
   * "chip" (viewers): suspect characters and stray CRs become visible code-point chips.
   * "inline" (the fix-it overlay): they keep their own width and are only highlighted, so the
   * overlay stays aligned with the textarea above it.
   */
  suspects?: "chip" | "inline";
  /** Index from which whitespace counts as trailing (defaults to the line's own trailing run). */
  trailingFrom?: number;
}

/** Index where a line's trailing whitespace starts (its length when there is none). */
export function trailingStart(text: string): number {
  let i = text.length;
  while (i > 0 && (text[i - 1] === " " || text[i - 1] === "\t")) i -= 1;
  return i;
}

/**
 * Render a piece of a line with whitespace markers. `offset` is the piece's start within its
 * line, so trailing whitespace is found relative to the whole line.
 */
export function markText(doc: Document, text: string, options: MarkOptions & { offset?: number } = {}) {
  const fragment = doc.createDocumentFragment();
  const offset = options.offset ?? 0;
  const trailing = options.trailingFrom ?? Number.POSITIVE_INFINITY;
  let run = "";
  const flush = () => {
    if (run) fragment.append(run);
    run = "";
  };
  let i = offset;
  for (const ch of text) {
    const at = i;
    i += ch.length;
    if (ch === "\t" || ch === " ") {
      flush();
      const span = doc.createElement("span");
      span.className = `ws ${ch === "\t" ? "ws-tab" : "ws-space"}${at >= trailing ? " ws-trailing" : ""}`;
      span.textContent = ch;
      fragment.append(span);
    } else if (ch === "\r" || SUSPECT_CHARS[ch] || (ch < " " && ch !== "\t")) {
      flush();
      const span = doc.createElement("span");
      const name = ch === "\r" ? "carriage return" : (SUSPECT_CHARS[ch] ?? "control character");
      if (options.suspects === "inline") {
        span.className = "cp-mark";
        span.textContent = ch;
      } else {
        span.className = ch === "\r" ? "chip chip-cr" : "chip chip-cp";
        span.textContent = ch === "\r" ? "CR" : codePoint(ch);
      }
      span.title = `${ch === "\r" ? "CR" : codePoint(ch)}: ${name}`;
      fragment.append(span);
    } else {
      run += ch;
    }
  }
  flush();
  return fragment;
}

/** A chip after a line: "CR" or "no newline at end". */
export function endChip(doc: Document, kind: "cr" | "no-newline"): HTMLSpanElement {
  const chip = doc.createElement("span");
  chip.className = kind === "cr" ? "chip chip-cr" : "chip chip-eof";
  chip.textContent = kind === "cr" ? "CR" : "no newline at end";
  chip.title = kind === "cr" ? "This line ends with CR LF." : "The file does not end with a newline.";
  return chip;
}

/** Text for a screen reader: tabs read as nothing, so name them. */
export const speakable = (text: string): string => (text === "" ? "empty" : text.replaceAll("\t", " (tab) "));
