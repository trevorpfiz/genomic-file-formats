// TEST-ONLY: the .fai validator (seq 3.2, 5a-5b; faidx(5)). Never import it from a shipped
// module (docs/PLAN.md 8.2).
//
// Implemented: FAI-S01, FAI-S02, FAI-M01 (needs the FASTA text as `ctx.companions.fasta`),
// FAI-M02. A FASTQ index has 6 columns: pass `declaredType: "fastq"`.
// One diagnostic per row: a row that fails FAI-S01 gets no further checks, and FAI-M01 reports
// the first column that disagrees with the FASTA.
import { FAI_COLUMNS, faiRows, type FaiRow } from "../formats/fasta.ts";
import { splitLines } from "../formats/lines.ts";
import { applyProfile, chip, defineRules, diagnostic, sortDiagnostics } from "./core.ts";
import type { Diagnostic, ValidationContext, Validator } from "./types.ts";

export const FAI_RULES = defineRules({
  "FAI-S01": {
    format: "fai",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "A .fai row has 5 TAB-separated columns (6 for FASTQ), all numbers after NAME.",
    spec: "faidx(5)",
    toolsSay: "htslib 1.24 splits a .fai on any whitespace and ignores extra columns, but rejects 4 columns.",
  },
  "FAI-S02": {
    format: "fai",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "In a .fai row, LINEWIDTH is at least LINEBASES.",
    spec: "faidx(5); htslib faidx.c",
  },
  "FAI-M01": {
    format: "fai",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "Every .fai row reproduces the FASTA's bytes.",
    spec: "faidx(5)",
    toolsSay: "samtools faidx 1.24 uses a wrong or stale .fai without a warning and returns the wrong bases.",
    toolSeverity: "accepts",
  },
  "FAI-M02": {
    format: "fai",
    severity: "convention",
    verdict: "none",
    runtime: false,
    summary: "Rows follow the FASTA's order, so OFFSET increases down the file.",
    spec: "faidx(5)",
    toolsSay: "htslib 1.24 uses an out-of-order .fai without complaint.",
    toolSeverity: "accepts",
  },
});

const R = FAI_RULES;
const NUMERIC: readonly (keyof FaiRow)[] = ["length", "offset", "lineBases", "lineWidth", "qualOffset"];

function faiChecks(text: string, ctx: ValidationContext = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  const columns = ctx.declaredType === "fastq" ? 6 : 5;
  const rows: { row: FaiRow; line: number }[] = [];
  for (const line of splitLines(text).lines) {
    const n = line.number;
    const cols = line.text.split("\t");
    if (cols.length !== columns) {
      const bySpace = line.text.trim().split(/\s+/);
      out.push(
        diagnostic(
          R["FAI-S01"],
          { line: n },
          !line.text.includes("\t") && bySpace.length === columns
            ? `Line ${n}: the columns are separated by spaces, not TABs.`
            : `Line ${n}: a .fai row has ${columns} TAB-separated columns; this one has ${cols.length}.`,
        ),
      );
      continue;
    }
    const bad = cols.findIndex((c, i) => i > 0 && !/^\d+$/.test(c));
    if (bad > 0) {
      out.push(
        diagnostic(
          R["FAI-S01"],
          { line: n, field: FAI_COLUMNS[bad] },
          `Line ${n}, ${FAI_COLUMNS[bad]}: ${chip(cols[bad]!)} is not a whole number.`,
          { found: cols[bad]! },
        ),
      );
      continue;
    }
    const [length = 0, offset = 0, lineBases = 0, lineWidth = 0, qualOffset] = cols.slice(1).map(Number);
    const row: FaiRow = { name: cols[0] ?? "", length, offset, lineBases, lineWidth };
    if (qualOffset !== undefined) row.qualOffset = qualOffset;
    if (lineWidth < lineBases) {
      out.push(
        diagnostic(
          R["FAI-S02"],
          { line: n, field: "LINEWIDTH" },
          `Line ${n}: LINEWIDTH (${lineWidth}) is less than LINEBASES (${lineBases}).`,
        ),
      );
      continue;
    }
    rows.push({ row, line: n });
  }

  // FAI-M02: OFFSET increases down the file.
  rows.forEach(({ row, line }, i) => {
    const prev = rows[i - 1];
    if (prev && row.offset < prev.row.offset) {
      out.push(
        diagnostic(
          R["FAI-M02"],
          { line, field: "OFFSET" },
          `Line ${line}: OFFSET ${row.offset} is smaller than the row above (${prev.row.offset}); rows usually follow the FASTA's order.`,
        ),
      );
    }
  });

  // FAI-M01: against the FASTA it indexes.
  const fasta = ctx.companions?.fasta;
  if (typeof fasta === "string") {
    const expected = new Map(faiRows(fasta).map((r) => [r.name, r]));
    const named = new Set<string>();
    for (const { row, line } of rows) {
      named.add(row.name);
      const want = expected.get(row.name);
      if (!want) {
        out.push(
          diagnostic(
            R["FAI-M01"],
            { line, field: "NAME" },
            `Line ${line}: the FASTA has no sequence named ${chip(row.name)}.`,
            { found: row.name },
          ),
        );
        continue;
      }
      const key = NUMERIC.find((k) => k !== "qualOffset" && row[k] !== want[k]);
      if (key) {
        const column = FAI_COLUMNS[NUMERIC.indexOf(key) + 1]!;
        out.push(
          diagnostic(
            R["FAI-M01"],
            { line, field: column },
            `Line ${line}, ${column}: the .fai says ${row[key]} for ${chip(row.name)}, but the FASTA gives ${want[key]}.`,
            { found: String(row[key]), expected: String(want[key]) },
          ),
        );
      }
    }
    for (const want of expected.values()) {
      if (named.has(want.name)) continue;
      out.push(
        diagnostic(
          R["FAI-M01"],
          { line: 0, field: "NAME" },
          `The .fai has no row for ${chip(want.name)}, a sequence in the FASTA.`,
          { expected: want.name },
        ),
      );
    }
  }
  return sortDiagnostics(out);
}

export const validateFai: Validator = (input, ctx, profile) =>
  typeof input === "string" ? applyProfile(faiChecks(input, ctx), FAI_RULES, profile) : [];
