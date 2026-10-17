// TEST-ONLY: the FASTQ validator (seq 5a-5c; Cock et al. 2010; docs/PLAN.md 8.3). Never import
// it from a shipped module (8.2).
//
// Implemented: FQ-S01-S06, FQ-M01 (heuristic warning), FQ-C01 and FQ-C04 (as warnings).
// Backlog (no content uses them): FQ-S07 (indexed FASTQ), FQ-M02-M04 (they need a mate file or
// a SAM context), FQ-C02, FQ-C03, FQ-C05.
// The parser (src/formats/fastq.ts) reads records by length, like Biopython and htslib, and
// resynchronises after a broken record, so each root cause gives one diagnostic.
import { parseFastq, type FastqIssue, type ParsedFastq } from "../formats/fastq.ts";
import { inferEncoding } from "../formats/phred.ts";
import { FASTQ_FIELDS } from "../formats/schemas.ts";
import { applyProfile, chip, defineRules, diagnostic, sortDiagnostics } from "./core.ts";
import type { Diagnostic, Validator } from "./types.ts";

export const FASTQ_RULES = defineRules({
  "FQ-S01": {
    format: "fastq",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "Each FASTQ record starts with a title line beginning with `@`.",
    spec: "Cock et al. 2010",
    toolsSay: "Biopython 1.88 and samtools 1.24 both reject a record that does not start with `@`.",
  },
  "FQ-S02": {
    format: "fastq",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "One or more sequence lines, then a line starting with `+`.",
    spec: "Cock et al. 2010",
    toolsSay: "htslib 1.24 stops with `expecting '+'`.",
  },
  "FQ-S03": {
    format: "fastq",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "The `+` line is bare, or repeats the title exactly.",
    spec: "Cock et al. 2010",
    toolsSay: "Biopython 1.88 rejects this; samtools fqidx 1.24 accepts it.",
    toolSeverity: "accepts",
  },
  "FQ-S04": {
    format: "fastq",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "A FASTQ record's quality string is exactly as long as its sequence.",
    spec: "Cock et al. 2010",
    toolsSay: "Biopython and samtools both reject this.",
  },
  "FQ-S05": {
    format: "fastq",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "Quality characters run from `!` to `~`, and sequence lines hold no spaces or TABs.",
    spec: "Cock et al. 2010",
    toolsSay: "Biopython 1.88 and samtools fqidx 1.24 both reject spaces, TABs and control characters here.",
  },
  "FQ-S06": {
    format: "fastq",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "A FASTQ file is not truncated: its last record is complete.",
    spec: "Cock et al. 2010",
    toolsSay: "htslib 1.24 reports `File truncated`; a gzipped copy also fails `gzip -t`.",
  },
  "FQ-M01": {
    format: "fastq",
    severity: "warning",
    verdict: "none",
    runtime: false,
    summary: "Quality encoding: Phred+33 unless the characters suggest Phred+64.",
    spec: "Cock et al. 2010",
    toolsSay:
      "FastQC and fastp assume Phred+33 unless told otherwise; fastp reads Phred+64 only with `--phred64`.",
    toolSeverity: "accepts",
  },
  "FQ-C01": {
    format: "fastq",
    severity: "warning",
    verdict: "none",
    runtime: false,
    summary: "Exactly four lines per FASTQ record (no wrapping).",
    spec: "Cock et al. 2010 (supplementary README)",
    toolsSay: "Biopython 1.88 and samtools 1.24 both read wrapped records.",
    toolSeverity: "accepts",
  },
  "FQ-C04": {
    format: "fastq",
    severity: "warning",
    verdict: "none",
    runtime: false,
    summary: "No FASTQ read has zero length.",
    spec: "convention",
    toolsSay: "Biopython 1.88 accepts a zero-length read; samtools fqidx 1.24 rejects it.",
  },
});

const R = FASTQ_RULES;

function issueDiagnostic(issue: FastqIssue): Diagnostic {
  const n = issue.line.number;
  switch (issue.kind) {
    case "bad-title":
      return diagnostic(
        R["FQ-S01"],
        { line: n, col: 1, field: FASTQ_FIELDS.title },
        issue.line.text === ""
          ? `Line ${n}: an empty line where a record title starting with \`@\` should be.`
          : issue.line.text.startsWith(">")
            ? `Line ${n}: this title starts with \`>\`, the FASTA header mark. A FASTQ title starts with \`@\`.`
            : `Line ${n}: a FASTQ record starts with a title line beginning with \`@\`.`,
        { found: Array.from(issue.line.text)[0] ?? "", expected: "@" },
      );
    case "no-sequence":
      return diagnostic(
        R["FQ-S02"],
        { line: n, field: FASTQ_FIELDS.separator },
        `Line ${n}: the record that starts on line ${issue.record.title.number} has no sequence line before \`+\`.`,
      );
    case "missing-plus":
      return diagnostic(
        R["FQ-S02"],
        { line: n, field: FASTQ_FIELDS.title },
        `Line ${n}: a new record starts before the \`+\` line of the record on line ${issue.record.title.number}.`,
      );
    case "quality-length": {
      const { quality, sequence } = issue.record;
      return diagnostic(
        R["FQ-S04"],
        { line: n, field: FASTQ_FIELDS.quality },
        `Line ${n}: quality has ${quality.length} characters for ${sequence.length} bases.`,
      );
    }
    case "truncated": {
      const t = issue.record.title.number;
      const what =
        issue.missing === "plus"
          ? "it has no `+` line or quality"
          : issue.missing === "quality"
            ? "its quality line is missing"
            : `its quality stops at ${issue.record.quality.length} of ${issue.record.sequence.length} characters`;
      return diagnostic(
        R["FQ-S06"],
        { line: n },
        `Line ${n}: the file ends inside the record that starts on line ${t}: ${what}.`,
      );
    }
  }
}

function fastqChecks(parsed: ParsedFastq): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (parsed.bom) {
    out.push(
      diagnostic(
        R["FQ-S01"],
        { line: 1, col: 1, field: FASTQ_FIELDS.title },
        "Line 1: the file starts with a byte-order mark (U+FEFF) before the first `@` title.",
        { found: "﻿", expected: "@" },
      ),
    );
  }
  out.push(...parsed.issues.map(issueDiagnostic));

  for (const record of parsed.records) {
    const t = record.title.number;
    // FQ-S03: a repeated title must be identical.
    const plusText = record.plus?.text.slice(1) ?? "";
    if (record.plus && plusText !== "" && plusText !== record.titleText) {
      out.push(
        diagnostic(
          R["FQ-S03"],
          { line: record.plus.number, field: FASTQ_FIELDS.separator },
          `Line ${record.plus.number}: the \`+\` line repeats a title that differs from line ${t}.`,
          { found: record.plus.text, expected: "+" },
        ),
      );
    }
    // FQ-S05: whitespace in sequence lines; characters outside ! to ~ in quality lines.
    for (const line of record.sequenceLines) {
      const ws = /[ \t]/.exec(line.text);
      if (ws) {
        out.push(
          diagnostic(
            R["FQ-S05"],
            { line: line.number, col: ws.index + 1, field: FASTQ_FIELDS.sequence },
            `Line ${line.number}, column ${ws.index + 1}: a ${ws[0] === "\t" ? "TAB" : "space"} in a sequence line.`,
          ),
        );
      }
    }
    for (const line of record.qualityLines) {
      const chars = Array.from(line.text); // code points: report a non-ASCII character whole
      const bad = chars.findIndex((c) => c.length !== 1 || c < "!" || c > "~");
      if (bad < 0) continue;
      const c = chars[bad]!;
      const col = chars.slice(0, bad).join("").length + 1;
      const what =
        c === " "
          ? "a space"
          : c === "\t"
            ? "a TAB"
            : c.codePointAt(0)! < 32 || c === "\x7f"
              ? `a control character (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`
              : `${chip(c)} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`;
      out.push(
        diagnostic(
          R["FQ-S05"],
          { line: line.number, col, field: FASTQ_FIELDS.quality },
          `Line ${line.number}, column ${col}: ${what} in a quality line. Quality characters run from \`!\` to \`~\`.`,
          { found: c },
        ),
      );
    }
    // FQ-C01: wrapped records.
    if (record.sequenceLines.length > 1 || record.qualityLines.length > 1) {
      out.push(
        diagnostic(R["FQ-C01"], { line: t }, `Line ${t}: this record is wrapped over more than four lines.`),
      );
    }
    // FQ-C04: zero-length reads.
    if (record.complete && record.sequenceLines.length > 0 && record.sequence === "") {
      out.push(diagnostic(R["FQ-C04"], { line: t }, `Line ${t}: this read has no bases.`));
    }
  }

  // FQ-M01: every quality character is @ or above.
  const complete = parsed.records.filter((r) => r.complete);
  if (inferEncoding(complete.map((r) => r.quality)) === "possibly-phred64") {
    const first = complete.find((r) => r.quality.length > 0)!;
    const line = first.qualityLines[0]!.number;
    out.push(
      diagnostic(
        R["FQ-M01"],
        { line, field: FASTQ_FIELDS.quality },
        `Line ${line}: every quality character in the file is \`@\` or above, so it may be Phred+64.`,
      ),
    );
  }
  return sortDiagnostics(out);
}

export const validateFastq: Validator = (input, _ctx, profile) =>
  typeof input === "string" ? applyProfile(fastqChecks(parseFastq(input)), FASTQ_RULES, profile) : [];
