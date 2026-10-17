// TEST-ONLY: gzip and BGZF container checks on HexView summaries (seq GZ-S01, GZ-S02; SAMv1
// v1.6 §4.1; docs/PLAN.md 8.2-8.3, D-11). Never import it from a shipped module (8.2).
//
// - GZ-S01: a file that must be BGZF (format "bgzf", or `ctx.requireBgzf` for random access)
//   starts with a gzip member that carries the `BC` extra subfield. Plain gzip is "valid but
//   unusable here" (D-11: BGZF + index is a convention this analysis's tools require).
// - GZ-S02: a BGZF file ends with the 28-byte EOF block. The spec says "should"; the course
//   applies one rule everywhere: without it the file is presumed truncated, so Invalid (8.3,
//   CASE-14). Checked only when the view shows the end of the file.
// Diagnostics have line 0 and a `bytes` range into the shown bytes (head, then tail).
import { BGZF_EOF, summarizeGzip, toHex } from "../formats/gzip.ts";
import { applyProfile, chip, defineRules, diagnostic } from "./core.ts";
import type { Diagnostic, ValidationContext, Validator } from "./types.ts";

export const GZIP_RULES = defineRules({
  "GZ-S01": {
    format: "bgzf",
    severity: "error",
    verdict: "unusable-here",
    runtime: false,
    summary: "A BGZF file is a series of gzip members, each carrying the `BC` extra subfield.",
    spec: "SAMv1 v1.6 §4.1",
    toolsSay: "samtools faidx 1.24 says `Cannot index files compressed with gzip, please use bgzip`.",
  },
  "GZ-S02": {
    format: "bgzf",
    severity: "error",
    verdict: "invalid",
    runtime: false,
    summary: "A BGZF file ends with the 28-byte end-of-file block.",
    spec: "SAMv1 v1.6 §4.1.2",
    toolsSay: "samtools 1.24 prints `EOF marker is absent. The input may be truncated` and carries on.",
    toolSeverity: "warning",
  },
});

const R = GZIP_RULES;

function gzipChecks(view: Parameters<typeof summarizeGzip>[0], requireBgzf: boolean): Diagnostic[] {
  const s = summarizeGzip(view);
  const out: Diagnostic[] = [];
  if (requireBgzf && s.kind !== "bgzf" && s.kind !== "unknown") {
    const [message, bytes, found]: [string, [number, number], string] = !s.magic
      ? [
          `Bytes 0-1: ${chip(toHex(s.head.slice(0, 2)))} is not the gzip magic \`1f 8b\`, so this is not BGZF.`,
          [0, 2],
          toHex(s.head.slice(0, 2)),
        ]
      : !s.fextra
        ? [
            `Byte 3 (FLG): ${chip(toHex([s.flg ?? 0]))} has no FEXTRA bit, so the header has no BGZF \`BC\` field. This is plain gzip.`,
            [3, 4],
            toHex([s.flg ?? 0]),
          ]
        : [
            "Bytes 12 on: the extra field has no `BC` subfield, so this is plain gzip, not BGZF.",
            [12, Math.min(s.head.length, 16)],
            toHex(s.head.slice(12, 16)),
          ];
    out.push(diagnostic(R["GZ-S01"], { line: 0, bytes }, message, { found }));
  }
  if (s.kind === "bgzf" && s.eofBlock === false) {
    const shown = s.head.length + s.tail.length;
    out.push(
      diagnostic(
        R["GZ-S02"],
        { line: 0, bytes: [Math.max(0, shown - BGZF_EOF.length), shown] },
        "End of file: the last 28 bytes are not the BGZF end-of-file block, so the file is presumed truncated.",
        { expected: toHex(BGZF_EOF) },
      ),
    );
  }
  return out;
}

const make =
  (declaredBgzf: boolean): Validator =>
  (input, ctx?: ValidationContext, profile?) =>
    typeof input === "string"
      ? []
      : applyProfile(gzipChecks(input, declaredBgzf || ctx?.requireBgzf === true), GZIP_RULES, profile);

/** A file declared BGZF. */
export const validateBgzf: Validator = make(true);
/** A gzip file; it must be BGZF only when `ctx.requireBgzf` says the analysis needs random access. */
export const validateGzip: Validator = make(false);
