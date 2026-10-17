// RUNTIME FASTA rules: the ones the L04.3 fix-it profile uses (seq EX-04: FA-S01, FA-S03,
// FA-M01; docs/PLAN.md 8.2). They ship in the browser with their messages, citations and
// "Tools say" texts. The full FASTA validator (src/validators/fasta.ts, test-only) runs these
// same checks plus the rest of the format's rules, so the browser and the tests agree.
import { parseFasta, type ParsedFasta } from "../../formats/fasta.ts";
import { isBlank } from "../../formats/lines.ts";
import { FASTA_FIELDS } from "../../formats/schemas.ts";
import { applyProfile, chip, defineRules, diagnostic, sortDiagnostics } from "../core.ts";
import type { Diagnostic, Validator } from "../types.ts";

export const FASTA_RUNTIME_RULES = defineRules({
  "FA-S01": {
    format: "fasta",
    severity: "error",
    verdict: "invalid",
    runtime: true,
    summary: "The first line of a FASTA file is a `>` header.",
    spec: "faidx(5)",
    toolsSay: "samtools faidx 1.24 stops with a format error at this line.",
  },
  "FA-S03": {
    format: "fasta",
    severity: "error",
    verdict: "invalid",
    runtime: true,
    summary: "No blank line inside a record's sequence.",
    spec: "faidx(5); htslib faidx.c",
    toolsSay: "samtools faidx 1.24 stops with a format error at the next sequence line.",
  },
  "FA-M01": {
    format: "fasta",
    severity: "warning",
    verdict: "none",
    runtime: true,
    summary: "Sequence names are unique within a file.",
    spec: "samtools-faidx(1) 1.24; SAMv1 v1.6 §1.3",
    toolsSay: "samtools faidx 1.24 warns `Ignoring duplicate sequence` and keeps only the first record.",
  },
});

const LEADING_BLANK_TOOLS = "samtools 1.24 skips leading blank lines; Biopython 1.88 rejects them.";

/** The runtime FASTA checks on a parsed file, before any profile. */
export function fastaRuntimeChecks(parsed: ParsedFasta): Diagnostic[] {
  const R = FASTA_RUNTIME_RULES;
  const out: Diagnostic[] = [];

  // FA-S01: the file starts with a header. A BOM is reported once at line 1; junk before the
  // first header once, at its first non-blank line; leading blank lines are only a warning.
  const firstJunk = parsed.preamble.find((l) => !isBlank(l.text));
  if (parsed.bom && firstJunk?.number !== 1) {
    out.push(
      diagnostic(
        R["FA-S01"],
        { line: 1, col: 1 },
        "Line 1: the file starts with a byte-order mark (U+FEFF) before the first `>` header.",
        { found: "﻿", expected: ">" },
      ),
    );
  }
  if (firstJunk) {
    out.push(
      diagnostic(
        R["FA-S01"],
        { line: firstJunk.number, col: 1, field: FASTA_FIELDS.header },
        firstJunk.number === 1
          ? "Line 1: a FASTA file starts with a `>` header line."
          : `Line ${firstJunk.number}: this line comes before the first \`>\` header. A FASTA file starts with a header line.`,
        { found: Array.from(firstJunk.text)[0] ?? "", expected: ">" },
      ),
    );
  } else if (parsed.preamble.length > 0 && parsed.records.length > 0) {
    out.push(
      diagnostic(
        R["FA-S01"],
        { line: parsed.preamble[0]!.number },
        `Line ${parsed.preamble[0]!.number}: the file starts with a blank line before the first \`>\` header.`,
        { severity: "warning", toolsSay: LEADING_BLANK_TOOLS },
      ),
    );
  }

  // FA-S03: a blank run inside a record's sequence, once per run.
  for (const record of parsed.records) {
    let inRun = false;
    for (const line of record.lines) {
      const blank = isBlank(line.text);
      if (blank && !inRun) {
        out.push(
          diagnostic(
            R["FA-S03"],
            { line: line.number, field: FASTA_FIELDS.sequence },
            `Line ${line.number}: blank line inside the sequence of ${record.name ? chip(record.name) : "the record"} (header on line ${record.header.number}). Only lines between records may be blank.`,
          ),
        );
      }
      inRun = blank;
    }
  }

  // FA-M01: a repeated name, at each later header.
  const first = new Map<string, number>();
  for (const record of parsed.records) {
    if (!record.name) continue;
    const seen = first.get(record.name);
    if (seen === undefined) first.set(record.name, record.header.number);
    else {
      out.push(
        diagnostic(
          R["FA-M01"],
          { line: record.header.number, field: FASTA_FIELDS.name },
          `Line ${record.header.number}: the name ${chip(record.name)} is already used on line ${seen}.`,
          { found: record.name },
        ),
      );
    }
  }
  return sortDiagnostics(out);
}

/** The browser's FASTA validator: runtime rules only. */
export const validateFastaRuntime: Validator = (input, _ctx, profile) =>
  typeof input === "string"
    ? applyProfile(fastaRuntimeChecks(parseFasta(input)), FASTA_RUNTIME_RULES, profile)
    : [];
