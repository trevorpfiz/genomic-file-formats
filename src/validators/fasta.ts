// TEST-ONLY: the full FASTA validator (seq 5a-5c; docs/PLAN.md 8.3). Never import it from a
// shipped module: its rules and messages stay out of dist/index.html (8.2). It runs the runtime
// checks (src/validators/runtime/fasta.ts) plus every other implemented FASTA rule, so a fix-it's
// live diagnostics equal what the content tests check.
//
// Implemented: FA-S01-S06, FA-M01, FA-M03, FA-M06, FA-C04. Backlog (no content uses them):
// FA-M02, FA-M04, FA-M05 (stale .fai: see FAI-M01), FA-M07, FA-C01-C03.
// One diagnostic per root cause: blank lines (FA-S03) and whitespace (FA-S05) do not also count
// as line-width errors (FA-S02), and an empty name (FA-S06) is not a duplicate (FA-M01).
import { basesOn, parseFasta, type FastaRecord, type ParsedFasta } from "../formats/fasta.ts";
import { isBlank, type Line } from "../formats/lines.ts";
import { FASTA_FIELDS } from "../formats/schemas.ts";
import {
  applyProfile,
  chip,
  count,
  defineRules,
  diagnostic,
  sortDiagnostics,
  type RuleTable,
} from "./core.ts";
import { FASTA_RUNTIME_RULES, fastaRuntimeChecks } from "./runtime/fasta.ts";
import type { Diagnostic, Validator } from "./types.ts";

export const FASTA_TEST_RULES = defineRules({
  "FA-S02": {
    format: "fasta",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "Every sequence line of a record has the same length, except a shorter last line.",
    spec: "faidx(5), FASTA files",
    toolsSay: "samtools faidx 1.24 refuses to index the file; after a short line it names the next line.",
  },
  "FA-S04": {
    format: "fasta",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "Line terminators are consistent within a FASTA record.",
    spec: "faidx(5)",
    toolsSay: "samtools faidx 1.24 cannot index a record with mixed line endings.",
  },
  "FA-S05": {
    format: "fasta",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "FASTA sequence lines hold no spaces or TABs.",
    spec: "faidx(5)",
    toolsSay:
      "samtools faidx 1.24 indexes a line with an inner space, then returns shifted sequence without a warning.",
  },
  "FA-S06": {
    format: "fasta",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "Every FASTA header has a non-empty name.",
    spec: "faidx(5)",
    toolsSay: "samtools faidx 1.24 accepts it and writes an index row with an empty NAME column.",
    toolSeverity: "accepts",
  },
  "FA-M03": {
    format: "fasta",
    severity: "warning",
    verdict: "none",
    runtime: false,
    summary: "No FASTA record is empty.",
    spec: "samtools-faidx(1) 1.24",
    toolsSay:
      "samtools faidx 1.24 leaves an empty record out of the .fai without a warning, and fails with `File truncated` when it is the last record.",
  },
  "FA-M06": {
    format: "fasta",
    severity: "warning",
    verdict: "none",
    runtime: false,
    summary: "Sequence characters are IUPAC nucleotide or amino-acid codes.",
    spec: "NCBI FASTA description",
    toolsSay: "samtools faidx 1.24 counts any printable character as a base.",
    toolSeverity: "accepts",
  },
  "FA-C04": {
    format: "fasta",
    severity: "convention",
    verdict: "none",
    runtime: false,
    summary: "A FASTA file ends with a newline.",
    spec: "convention",
    toolsSay: "samtools 1.24 accepts a missing final newline.",
    toolSeverity: "accepts",
  },
});

export const FASTA_RULES: RuleTable = { ...FASTA_RUNTIME_RULES, ...FASTA_TEST_RULES };

const R = FASTA_TEST_RULES;
const label = (record: FastaRecord): string => (record.name ? chip(record.name) : "this record");
/** IUPAC nucleotide codes and the gap (seq FA-M06). */
const NUCLEOTIDE = /^[ACGTURYKMSWBDHVN-]$/i;
/** Amino-acid codes (IUPAC, with U, O, B, Z, X), stop and gap. */
const PROTEIN = /^[ACDEFGHIKLMNPQRSTVWYUOBZX*-]$/i;
/** Letters that only occur in protein (seq 6: "Protein if E F I L P Q appear"). */
const PROTEIN_ONLY = /[EFILPQ]/i;

/** The record's expected line width: the commonest base count of its non-last lines. */
function lineWidthOf(lines: readonly Line[]): number {
  const counts = new Map<number, number>();
  for (const l of lines.slice(0, -1)) counts.set(basesOn(l), (counts.get(basesOn(l)) ?? 0) + 1);
  let best = basesOn(lines[0]!);
  for (const [width, n] of counts) if (n > (counts.get(best) ?? 0)) best = width;
  return best;
}

function checkRecord(record: FastaRecord, out: Diagnostic[]): void {
  const seq = record.lines.filter((l) => !isBlank(l.text));

  // FA-S06: an empty name.
  if (!record.name) {
    out.push(
      diagnostic(
        R["FA-S06"],
        { line: record.header.number, field: FASTA_FIELDS.name },
        `Line ${record.header.number}: this header has no name after \`>\`.`,
      ),
    );
  }

  // FA-M03: no sequence at all.
  if (seq.length === 0) {
    out.push(
      diagnostic(
        R["FA-M03"],
        { line: record.header.number },
        `Line ${record.header.number}: the record ${label(record)} has no sequence.`,
      ),
    );
    return;
  }

  // FA-S02: line widths, in bases (whitespace and blank lines are other rules' root causes).
  if (seq.length > 1) {
    const width = lineWidthOf(seq);
    seq.forEach((line, i) => {
      const bases = basesOn(line);
      const last = i === seq.length - 1;
      if (last ? bases <= width : bases === width) return;
      out.push(
        diagnostic(
          R["FA-S02"],
          { line: line.number, field: FASTA_FIELDS.sequence },
          bases < width
            ? `Line ${line.number}: this sequence line has ${count(bases, "base")}, but the full lines of ${label(record)} have ${width}. Only a record's last line may be shorter.`
            : `Line ${line.number}: this sequence line has ${count(bases, "base")}, more than the ${width} on the full lines of ${label(record)}.`,
        ),
      );
    });
  }

  // FA-S04: terminators, against the record's commonest one (a last line without one is fine).
  const ended = seq.filter((l) => l.eol !== "");
  const crlf = ended.filter((l) => l.eol === "\r\n").length;
  const lf = ended.length - crlf;
  if (crlf > 0 && lf > 0) {
    const usual = crlf > lf || (crlf === lf && ended[0]!.eol === "\r\n") ? "\r\n" : "\n";
    const name = (eol: string) => (eol === "\r\n" ? "CR-LF" : "LF");
    for (const line of ended) {
      if (line.eol === usual) continue;
      out.push(
        diagnostic(
          R["FA-S04"],
          { line: line.number, col: line.text.length + 1, field: FASTA_FIELDS.sequence },
          `Line ${line.number}: this line ends in ${name(line.eol)}, but the other lines of ${label(record)} end in ${name(usual)}.`,
        ),
      );
    }
  }

  // FA-S05 and FA-M06, per line.
  const protein = seq.some((l) => PROTEIN_ONLY.test(l.text));
  const allowed = protein ? PROTEIN : NUCLEOTIDE;
  for (const line of seq) {
    const ws = /[ \t]/.exec(line.text);
    if (ws) {
      const trailing = line.text.slice(ws.index).trim() === "";
      const what = ws[0] === "\t" ? "TAB" : "space";
      out.push(
        diagnostic(
          R["FA-S05"],
          { line: line.number, col: ws.index + 1, field: FASTA_FIELDS.sequence },
          trailing
            ? `Line ${line.number}, column ${ws.index + 1}: a trailing ${what} on a sequence line. Sequence lines hold bases only.`
            : `Line ${line.number}, column ${ws.index + 1}: a ${what} inside a sequence line. Sequence lines hold bases only.`,
        ),
      );
    }
    const chars = Array.from(line.text); // code points: report a non-ASCII character whole
    const bad = chars.findIndex((c) => !/\s/.test(c) && !allowed.test(c));
    if (bad >= 0) {
      const c = chars[bad]!;
      const col = chars.slice(0, bad).join("").length + 1;
      out.push(
        diagnostic(
          R["FA-M06"],
          { line: line.number, col, field: FASTA_FIELDS.sequence },
          `Line ${line.number}, column ${col}: ${chip(c)} is not an IUPAC ${protein ? "amino-acid" : "nucleotide"} code.`,
          { found: c },
        ),
      );
    }
  }
}

/** Every FASTA check, before any profile. */
export function fastaChecks(parsed: ParsedFasta): Diagnostic[] {
  const out = fastaRuntimeChecks(parsed);
  for (const record of parsed.records) checkRecord(record, out);
  const last = parsed.lines.at(-1);
  if (last && !parsed.finalNewline) {
    out.push(
      diagnostic(
        R["FA-C04"],
        { line: last.number, col: last.text.length + 1 },
        `Line ${last.number}: the file does not end with a newline.`,
      ),
    );
  }
  return sortDiagnostics(out);
}

export const validateFasta: Validator = (input, _ctx, profile) =>
  typeof input === "string" ? applyProfile(fastaChecks(parseFasta(input)), FASTA_RULES, profile) : [];
