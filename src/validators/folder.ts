// TEST-ONLY: the case-folder validator (docs/PLAN.md 6.2, 8.1, 9.4; case 5b). It builds the
// capstone keys at test time; the browser ships only the keys (8.5). Never import it from a
// shipped module.
//
// For every file it runs the format's own validator (on the decompressed text of a compressed
// text file), then the cross-file rules. M1 implements CASE-14; the other CASE and XF rules
// arrive with their formats' validators (M2-M7).
//
// CASE-14 (containers are complete; SAMv1 §4.1.2, RFC 1952): a compressed file is complete when
// it starts with the gzip magic and either ends with the BGZF EOF block (BGZF; D-11: a BGZF data
// file without it is presumed truncated) or, for plain gzip, ends with the CRC-32 and length of
// its decompressed text (what `gzip -t` checks). Checked only when the view shows the file's end.
import type { FormatId, Snippet } from "../exercises/types.ts";
import { gzipTrailerMatches, summarizeGzip } from "../formats/gzip.ts";
import { defineRules, diagnostic, sortDiagnostics } from "./core.ts";
import { validateFai } from "./fai.ts";
import { validateFasta } from "./fasta.ts";
import { validateFastq } from "./fastq.ts";
import { validateBgzf, validateGzip } from "./gzip.ts";
import type { Diagnostic, FolderValidator, ValidationContext, Validator } from "./types.ts";

export const FOLDER_RULES = defineRules({
  "CASE-14": {
    format: "cross-file",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "Containers are complete: gzip integrity and the BGZF end-of-file block.",
    spec: "SAMv1 v1.6 §4.1.2; RFC 1952 §2.3.1",
    toolsSay:
      "`gzip -t` fails on an incomplete gzip file; samtools only warns about a missing BGZF EOF block.",
  },
});

/** The per-file validators validateFolder can run in this milestone. */
const FILE_VALIDATORS: Readonly<Partial<Record<FormatId, Validator>>> = {
  fasta: validateFasta,
  fai: validateFai,
  fastq: validateFastq,
  gzip: validateGzip,
  bgzf: validateBgzf,
};

/** Formats validateFolder can check so far (M1: FASTA, .fai, FASTQ, gzip/BGZF). */
export const FOLDER_FORMATS: readonly FormatId[] = Object.keys(FILE_VALIDATORS) as FormatId[];

function contextFor(path: string, snippet: Snippet, files: Record<string, Snippet>): ValidationContext {
  const companions: Record<string, string> = {};
  if (snippet.format === "fasta") {
    const fai = files[`${path}.fai`];
    if (fai?.text !== undefined) companions.fai = fai.text;
  }
  if (snippet.format === "fai") {
    const fasta = files[path.replace(/\.fai$/, "")];
    if (fasta?.text !== undefined) companions.fasta = fasta.text;
  }
  return Object.keys(companions).length ? { companions } : {};
}

function containerChecks(path: string, snippet: Snippet): Diagnostic[] {
  if (
    !snippet.hex ||
    (snippet.kind !== "compressed-text" && snippet.format !== "gzip" && snippet.format !== "bgzf")
  )
    return [];
  const s = summarizeGzip(snippet.hex);
  const rule = FOLDER_RULES["CASE-14"];
  if (s.kind === "other") {
    return [
      diagnostic(
        rule,
        { line: 0, file: path, bytes: [0, 2] },
        `${path}: the file does not start with the gzip magic \`1f 8b\`.`,
      ),
    ];
  }
  if (!s.endKnown) return [];
  const shown = s.head.length + s.tail.length;
  if (s.kind === "bgzf" && s.eofBlock === false) {
    return [
      diagnostic(
        rule,
        { line: 0, file: path, bytes: [Math.max(0, shown - 28), shown] },
        `${path}: the BGZF end-of-file block is missing, so the file is presumed truncated.`,
      ),
    ];
  }
  if (
    s.kind === "gzip" &&
    snippet.decodedText !== undefined &&
    gzipTrailerMatches(s, snippet.decodedText) === false
  ) {
    return [
      diagnostic(
        rule,
        { line: 0, file: path, bytes: [Math.max(0, shown - 8), shown] },
        `${path}: the last 8 bytes are not the CRC-32 and length of the decompressed text, so the gzip stream is incomplete and \`gzip -t\` fails.`,
      ),
    ];
  }
  return [];
}

/** Validate a case folder: every file's own rules, then the cross-file rules. */
export const validateFolder: FolderValidator = (files) => {
  const out: Diagnostic[] = [];
  for (const [path, snippet] of Object.entries(files)) {
    const validator = FILE_VALIDATORS[snippet.format];
    if (!validator) {
      throw new Error(
        `validateFolder: no validator for format "${snippet.format}" (${path}) yet; it arrives with its section's milestone`,
      );
    }
    const ctx = contextFor(path, snippet, files);
    const input =
      snippet.kind === "text"
        ? snippet.text
        : snippet.kind === "compressed-text" && snippet.format !== "gzip" && snippet.format !== "bgzf"
          ? snippet.decodedText
          : snippet.hex;
    if (input === undefined)
      throw new Error(`validateFolder: ${path} has no content for a ${snippet.kind} snippet`);
    for (const d of validator(input, ctx)) out.push({ ...d, file: path });
    out.push(...containerChecks(path, snippet));
  }
  return sortDiagnostics(out);
};
