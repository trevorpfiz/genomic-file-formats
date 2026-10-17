// FASTA and .fai validators (seq 5a-5c; docs/PLAN.md 8.2-8.3): exact lines and columns, edge
// cases (CR-LF, missing final newline, empty input, BOM), no cascades, profiles, verdicts, and
// the runtime/test-only parity the L04.3 fix-it relies on.
import { describe, expect, test } from "vite-plus/test";
import { inScope } from "./core.ts";
import { validateFai } from "./fai.ts";
import { validateFasta } from "./fasta.ts";
import { EX01, EX04, EX04_FIXED, TOY_FA, TOY_FAI } from "./fixtures.ts";
import { checkGoals, RUNTIME_RULES, validateRuntime } from "./runtime/index.ts";
import { verdictOf, type Diagnostic } from "./types.ts";

const brief = (ds: Diagnostic[]) => ds.map((d) => [d.rule, d.line, d.severity]);
const fasta = (text: string) => validateFasta(text);

describe("FASTA", () => {
  test("toy.fa is clean, LF or CR-LF", () => {
    expect(fasta(TOY_FA)).toEqual([]);
    expect(fasta(TOY_FA.replaceAll("\n", "\r\n"))).toEqual([]);
  });

  test("empty input has no diagnostics (fix-it goals stop deletion)", () => {
    expect(fasta("")).toEqual([]);
  });

  test("a missing final newline is only a convention (FA-C04), not a width error", () => {
    expect(brief(fasta(TOY_FA.slice(0, -1)))).toEqual([["FA-C04", 7, "convention"]]);
    expect(verdictOf(fasta(TOY_FA.slice(0, -1)))).toBe("valid");
  });

  test("a BOM is one FA-S01 at line 1, column 1; the records still parse", () => {
    const ds = fasta(`﻿${EX01}`);
    expect(ds.map((d) => [d.rule, d.line, d.col])).toEqual([
      ["FA-S01", 1, 1],
      ["FA-S02", 3, undefined],
    ]);
  });

  test("leading blank lines are a warning (samtools skips them; Biopython rejects them)", () => {
    const ds = fasta(`\n\n${TOY_FA}`);
    expect(brief(ds)).toEqual([["FA-S01", 1, "warning"]]);
    expect(ds[0]?.verdict).toBe("none");
    expect(verdictOf(ds)).toBe("valid");
  });

  test("junk before the first header is one FA-S01, at its first line", () => {
    expect(brief(fasta(`\n# a\n# b\n${TOY_FA}`))).toEqual([["FA-S01", 2, "error"]]);
    expect(brief(fasta("ACGT\nACGT\n"))).toEqual([["FA-S01", 1, "error"]]);
  });

  test("EX-01: only line 3 (16 bases in 20-base lines); line 5 is a legal short last line", () => {
    const ds = fasta(EX01);
    expect(brief(ds)).toEqual([["FA-S02", 3, "error"]]);
    expect(verdictOf(ds)).toBe("invalid");
  });

  test("FA-S02 picks the odd line out, also when the first line is the odd one", () => {
    expect(brief(fasta(">a\nACGTACGTAC\nACGTACGTACGT\nACGTACGTAC\nAC\n"))).toEqual([["FA-S02", 3, "error"]]);
    expect(brief(fasta(">a\nACGTACGT\nACGTACGTAC\nACGTACGTAC\nAC\n"))).toEqual([["FA-S02", 2, "error"]]);
    expect(brief(fasta(">a\nACGTACGTAC\nACGTACGTAC\nACGTACGTACG\n"))).toEqual([["FA-S02", 4, "error"]]);
  });

  test("widths are per record: 80 and 60 in one file is fine (seq Q1)", () => {
    expect(fasta(`>a\n${"A".repeat(80)}\n${"C".repeat(80)}\nG\n>b\n${"T".repeat(60)}\nA\n`)).toEqual([]);
  });

  test("EX-04 starter: FA-S01, FA-S03 and the FA-M01 warning, nothing else", () => {
    const ds = fasta(EX04);
    expect(brief(ds)).toEqual([
      ["FA-S01", 1, "error"],
      ["FA-S03", 5, "error"],
      ["FA-M01", 7, "warning"],
    ]);
    expect(inScope(ds).map((d) => d.rule)).toEqual(["FA-S01", "FA-S03"]);
  });

  test("EX-04 with only the errors fixed passes with a warning; the accepted answer is clean", () => {
    const partial = EX04.replace("# reference for case 042\n", "").replace("GAGCT\n\n", "GAGCT\n");
    expect(brief(fasta(partial))).toEqual([["FA-M01", 5, "warning"]]);
    expect(verdictOf(fasta(partial))).toBe("valid");
    expect(fasta(EX04_FIXED)).toEqual([]);
  });

  test("blank lines: one FA-S03 per run inside a sequence; none between records or at the end", () => {
    expect(brief(fasta(">a\nAC\n\n\nGT\n\nGT\n"))).toEqual([
      ["FA-S03", 3, "error"],
      ["FA-S03", 6, "error"],
    ]);
    expect(fasta(">a\nAC\n\n>b\nGT\n\n")).toEqual([]);
  });

  test("a whitespace-only line inside a sequence is a blank line, not a space error", () => {
    expect(brief(fasta(">a\nACGT\n  \nACGT\n"))).toEqual([["FA-S03", 3, "error"]]);
  });

  test("an inner space or TAB is FA-S05 only; line widths count bases", () => {
    const ds = fasta(">a\nACGTA CGTAC\nACGTACGTAC\nAC\n");
    expect(ds.map((d) => [d.rule, d.line, d.col])).toEqual([["FA-S05", 2, 6]]);
    expect(fasta(">a\nACGT\tACGT\nAC\n").map((d) => [d.rule, d.col])).toEqual([["FA-S05", 5]]);
  });

  test("mixed terminators: the minority line, once each", () => {
    expect(fasta(">a\r\nACGT\r\nACGT\r\nACGT\nAC\r\n").map((d) => [d.rule, d.line])).toEqual([["FA-S04", 4]]);
  });

  test("an empty name is FA-S06 and never a duplicate", () => {
    expect(brief(fasta(">\nAC\n> \nGT\n"))).toEqual([
      ["FA-S06", 1, "error"],
      ["FA-S06", 3, "error"],
    ]);
  });

  test("FA-M06 never flags IUPAC codes such as M and R (GRCh38 chr1 has them)", () => {
    expect(fasta(">chr1\nACGTMRNNnnacgt\n")).toEqual([]);
    expect(fasta(">a\nACGT1\n").map((d) => [d.rule, d.col])).toEqual([["FA-M06", 5]]);
  });

  test("an empty last record is a warning (samtools: `File truncated`)", () => {
    expect(brief(fasta(">a\nAC\n>b\n"))).toEqual([["FA-M03", 3, "warning"]]);
  });
});

describe("profiles", () => {
  test("include, exclude and escalate", () => {
    expect(validateFasta(EX04, {}, { include: ["FA-S03"] }).map((d) => d.rule)).toEqual(["FA-S03"]);
    expect(validateFasta(EX04, {}, { exclude: ["FA-S01", "FA-S03"] }).map((d) => d.rule)).toEqual(["FA-M01"]);
    const escalated = validateFasta(EX04, {}, { escalate: ["FA-M01"] }).find((d) => d.rule === "FA-M01");
    expect(escalated).toMatchObject({ severity: "error", verdict: "invalid" });
  });

  test("tool mode drops what samtools accepts", () => {
    expect(validateFasta(">\nAC", {}, { mode: "tool" })).toEqual([]);
    expect(validateFasta(">\nAC")).toHaveLength(2);
  });
});

describe("runtime parity (docs/PLAN.md 8.2, 8.5)", () => {
  const runtimeIds = Object.keys(RUNTIME_RULES);
  const cases = [EX04, EX04_FIXED, EX01, TOY_FA, `﻿\n${EX04}`, ">a\nAC\n\nGT\n>a\nAC", "", "\n\n>a\nAC\n"];

  test.each(cases.map((c) => [JSON.stringify(c).slice(0, 40), c]))("%s", (_label, text) => {
    const validation = { format: "fasta" as const, profile: { include: runtimeIds } };
    expect(validateRuntime(validation, text)).toEqual(validateFasta(text, {}, validation.profile));
  });

  test("the runtime validator returns nothing above the snippet cap", () => {
    const huge = `>a\n${"ACGT\n".repeat(400)}`;
    expect(validateRuntime({ format: "fasta", profile: {} }, `# x\n${huge}`)).toEqual([]);
  });

  test("goal checks keep learners from passing by deleting content", () => {
    const goals = [
      {
        id: "keep",
        text: "Keeps chrM_demo's 60 bases",
        check: "fastaKeepsBases",
        args: { name: "chrM_demo", bases: "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT" },
      },
      { id: "names", text: "Keeps chrM_demo", check: "fastaKeepsRecords", args: { names: ["chrM_demo"] } },
      { id: "unique", text: "Every name is used once", check: "fastaUniqueNames" },
    ];
    expect(checkGoals(goals, EX04_FIXED).map((g) => g.passed)).toEqual([true, true, true]);
    expect(checkGoals(goals, ">x\nAC\n").map((g) => g.passed)).toEqual([false, false, true]);
    expect(checkGoals(goals, EX04).map((g) => g.passed)).toEqual([true, true, false]);
    expect(checkGoals([{ id: "x", text: "x", check: "noSuchCheck" }], EX04)[0]?.passed).toBe(false);
  });
});

describe(".fai", () => {
  test("toy.fai matches toy.fa", () => {
    expect(validateFai(TOY_FAI, { companions: { fasta: TOY_FA } })).toEqual([]);
  });

  test("a stale index after a header edit (seq Q7): every OFFSET after the edit is wrong", () => {
    const edited = TOY_FA.replace(
      ">chrM_demo first 60 bp of GRCh38 chrM",
      ">chrM_demo first 60 bp of GRCh38 chrM (rCRS)",
    );
    expect(
      validateFai(TOY_FAI, { companions: { fasta: edited } }).map((d) => [d.rule, d.line, d.field]),
    ).toEqual([
      ["FAI-M01", 1, "OFFSET"],
      ["FAI-M01", 2, "OFFSET"],
    ]);
  });

  test("rows missing from either side", () => {
    const ds = validateFai("chrM_demo\t60\t38\t20\t21\nchrX\t1\t500\t3\t4\n", {
      companions: { fasta: TOY_FA },
    });
    expect(ds.map((d) => [d.rule, d.line, d.field])).toEqual([
      ["FAI-M01", 0, "NAME"],
      ["FAI-M01", 2, "NAME"],
    ]);
  });

  test("spaces instead of TABs, and a word where a number belongs", () => {
    expect(validateFai("chr1 248956422 112 100 101\n")[0]?.message).toMatch(/spaces, not TABs/);
    expect(validateFai("chr1\t248956422\t112\tx\t101\n")[0]).toMatchObject({
      rule: "FAI-S01",
      field: "LINEBASES",
    });
  });

  test("a FASTQ index has 6 columns (seq EX-10 fqidx rows)", () => {
    const fqidx = "r1\t30\t4\t18\t19\t38\nr2\t18\t74\t18\t19\t95\n";
    expect(validateFai(fqidx, { declaredType: "fastq" })).toEqual([]);
    expect(validateFai(fqidx).map((d) => d.rule)).toEqual(["FAI-S01", "FAI-S01"]);
  });
});
