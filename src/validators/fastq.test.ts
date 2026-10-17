// FASTQ validator (seq 5a-5c, EX-09, EX-10; docs/PLAN.md 8.3): exact lines, edge cases
// (CR-LF, missing final newline, empty input, BOM), no cascades, the case FASTQ files, verdicts.
import { describe, expect, test } from "vite-plus/test";
import { CASE_FASTQ_FILES, fastqFileText } from "../case/generated/fastq.ts";
import { validateFastq } from "./fastq.ts";
import { EX09A, EX09B, EX09C, EX10, R1 } from "./fixtures.ts";
import { verdictOf, type Diagnostic } from "./types.ts";

const brief = (ds: Diagnostic[]) => ds.map((d) => [d.rule, d.line]);
const fq = (text: string) => validateFastq(text);

describe("FASTQ", () => {
  test("the seq 3.3 records and every case FASTQ file are clean", () => {
    expect(fq(R1)).toEqual([]);
    for (const file of CASE_FASTQ_FILES) expect(fq(fastqFileText(file)), file.path).toEqual([]);
  });

  test("EX-09: one diagnostic per round, on the keyed line", () => {
    expect(brief(fq(EX09A))).toEqual([["FQ-S04", 4]]);
    expect(brief(fq(EX09B))).toEqual([["FQ-S03", 3]]);
    expect(brief(fq(EX09C))).toEqual([["FQ-S01", 1]]);
    for (const t of [EX09A, EX09B, EX09C]) expect(verdictOf(fq(t))).toBe("invalid");
  });

  test("EX-10: wrapped records parse by length; only the FQ-C01 warning remains", () => {
    const ds = fq(EX10);
    expect(ds.map((d) => [d.rule, d.line, d.severity])).toEqual([["FQ-C01", 1, "warning"]]);
    expect(verdictOf(ds)).toBe("valid");
  });

  test("a quality one character short in a middle record (Q2.5) does not cascade", () => {
    const text = `${R1}${R1.replace(/FFFF\n$/, "FFF\n")}${R1}`;
    expect(brief(fq(text))).toEqual([["FQ-S04", 8]]);
  });

  test("a quality one character long", () => {
    expect(brief(fq(R1.replace(/FFFF\n$/, "FFFFF\n")))).toEqual([["FQ-S04", 4]]);
  });

  test("empty input, CR-LF and a missing final newline are fine", () => {
    expect(fq("")).toEqual([]);
    expect(fq(R1.replaceAll("\n", "\r\n"))).toEqual([]);
    expect(fq(R1.slice(0, -1))).toEqual([]);
  });

  test("a BOM is one FQ-S01 at line 1, column 1", () => {
    expect(fq(`﻿${R1}`).map((d) => [d.rule, d.line, d.col])).toEqual([["FQ-S01", 1, 1]]);
  });

  test("a blank line between records is one FQ-S01", () => {
    expect(brief(fq(`${R1}\n${R1}`))).toEqual([["FQ-S01", 5]]);
  });

  test("truncation (FQ-S06): after the title, after the + line, inside the quality", () => {
    expect(brief(fq(`${R1}@r2\n`))).toEqual([["FQ-S06", 5]]);
    expect(brief(fq(`${R1}@r2\nACGT\n+\n`))).toEqual([["FQ-S06", 7]]);
    expect(brief(fq(`${R1}@r2\nACGT\n+\nFF`))).toEqual([["FQ-S06", 8]]);
    expect(fq(`${R1}@r2\nACGT\n+\n`)[0]?.message).toBe(
      "Line 7: the file ends inside the record that starts on line 5: its quality line is missing.",
    );
  });

  test("a record with no sequence line is FQ-S02 only", () => {
    expect(brief(fq("@r1\n+\nFF:F\n"))).toEqual([["FQ-S02", 2]]);
  });

  test("FQ-S05: a TAB in a sequence line; a control character in a quality line", () => {
    expect(fq("@r1\nAC\tG\n+\nFF:F\n").map((d) => [d.rule, d.line, d.col])).toEqual([["FQ-S05", 2, 3]]);
    expect(fq("@r1\nACGT\n+\nFF\u0001F\n").map((d) => [d.rule, d.line, d.col])).toEqual([["FQ-S05", 4, 3]]);
  });

  test("a TAB in the title is fine (samtools fastq -T)", () => {
    expect(fq("@r1\tRG:Z:x\tBC:Z:ACGT\nACGT\n+\nFF:F\n")).toEqual([]);
  });

  test("tool mode: samtools fqidx accepts a differing + title", () => {
    expect(validateFastq(EX09B, {}, { mode: "tool" })).toEqual([]);
  });
});
