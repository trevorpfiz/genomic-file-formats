// Simulator models (docs/PLAN.md 7.5, 11.6): pure node tests of init, reduce, the goal checks
// and the text views, with the plan's keys (seq EX-02, 3.4; found EX-05; seq EX-07), and witness
// replay for the reference exercises: init alone never meets a goal, its witness always does.
import { describe, expect, test } from "vite-plus/test";
import type { SimulatorExercise } from "../../exercises/types.ts";
import { HELPERS } from "../../formats/helpers.ts";
import {
  bgzfDemoModel,
  blockOf,
  blocks,
  CHRZ_GZI_BINARY,
  eofText,
  plan,
  progress,
  virtualOffset,
  virtualOffsetHex,
  type BgzfDemoAction,
  type BgzfDemoState,
} from "./bgzf-demo/model.ts";
import {
  currentByte,
  currentP,
  faiCalculatorModel,
  fileMap,
  locate,
  readout,
  type FaiCalculatorAction,
  type FaiCalculatorState,
} from "./fai-calculator/model.ts";
import { models } from "./models.ts";
import {
  converterReadout,
  formatAccuracy,
  formatOdds,
  formatP,
  formatSum,
  phredConverterModel,
  qualityReadout,
  summarize,
  type PhredConverterAction,
  type PhredConverterState,
} from "./phred-converter/model.ts";
import {
  BGZF_DEMO,
  BROAD_CHR1,
  BROAD_CHR1_HEADER,
  BROAD_CHR2,
  CASE_READ_QUALITY,
  FIND_THE_BYTE,
  NCBI_CHR1,
  QUALITY_AS_PROBABILITY,
  TOY_HEADER,
  TOY_ROW,
  TOY_SEQUENCE,
  UCSC_CHR1,
} from "./test-fixtures.ts";

const fai = (actions: FaiCalculatorAction[], init: Record<string, unknown> = FIND_THE_BYTE.init) =>
  actions.reduce<FaiCalculatorState>(
    (s, a) => faiCalculatorModel.reduce(s, a),
    faiCalculatorModel.init(init),
  );
const phred = (actions: PhredConverterAction[], init: Record<string, unknown> = {}) =>
  actions.reduce<PhredConverterState>(
    (s, a) => phredConverterModel.reduce(s, a),
    phredConverterModel.init(init),
  );
const bgzf = (actions: BgzfDemoAction[], init: Record<string, unknown> = {}) =>
  actions.reduce<BgzfDemoState>((s, a) => bgzfDemoModel.reduce(s, a), bgzfDemoModel.init(init));
const rowsOf = (view: { kind: string; rows?: string[][] }) =>
  Object.fromEntries((view.rows ?? []).map((r) => [r[0], r[1]]));

describe.each([FIND_THE_BYTE, BGZF_DEMO, QUALITY_AS_PROBABILITY] as SimulatorExercise[])(
  "witness replay: $id",
  (exercise) => {
    const model = models[exercise.simulator]!;
    test("the text view kind matches the exercise", () => {
      expect(model.text(model.init(exercise.init)).kind).toBe(exercise.textView);
    });
    test.each(exercise.goals)("goal $id: init alone does not meet it; the witness does", (goal) => {
      const check = model.goalChecks[goal.when]!;
      expect(check).toBeDefined();
      const init = model.init(exercise.init);
      expect(check(init, goal.args)).toBe(false);
      const end = goal.witness.reduce((s, a) => model.reduce(s, a), init);
      expect(check(end, goal.args)).toBe(true);
    });
    test("every preset applies", () => {
      for (const preset of exercise.presets ?? []) {
        const init = model.init(exercise.init);
        expect(model.reduce(init, { type: "preset", state: preset.state })).not.toBe(init);
      }
    });
  },
);

describe("models.ts", () => {
  test("registers the three M1 simulators and the ruler", () => {
    expect(Object.keys(models).sort()).toEqual([
      "bgzf-demo",
      "coordinate-ruler",
      "fai-calculator",
      "phred-converter",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------

describe("fai-calculator", () => {
  test("seq EX-02 task 1: base 45 of chrM_demo is byte 84, an A", () => {
    const s = fai([{ type: "position", position: 45 }]);
    expect(currentP(s)).toBe(44);
    expect(currentByte(s)).toBe(84);
    expect(TOY_HEADER.length + 1).toBe(38);
    const rows = rowsOf(faiCalculatorModel.text(s));
    expect(rows["Position"]).toBe("base 45 (1-based); p = 44 (0-based)");
    expect(rows["Full lines before it"]).toBe("floor(44 / 20) = 2");
    expect(rows["Column in its line"]).toBe("44 mod 20 = 4");
    expect(rows["Byte"]).toBe("38 + 2 × 21 + 4 = 84");
    expect(rows["Byte 84 holds"]).toBe("base 45 of chrM_demo (p = 44), `A`");
    expect(readout(s)).toBe(
      "Base 45 of chrM_demo (p = 44) is on sequence line 3, column 4 counting from 0. It is byte 84, which holds `A`.",
    );
  });

  test("seq EX-02 task 2: chr1:10,001 is byte 10206 (UCSC), 10254 (NCBI) and 10212 (Broad)", () => {
    const at = (row: string) =>
      currentByte(
        fai([
          { type: "preset", state: { row } },
          { type: "position", position: 10_001 },
        ]),
      );
    expect([at(UCSC_CHR1), at(NCBI_CHR1), at(BROAD_CHR1)]).toEqual([10206, 10254, 10212]);
    // The same numbers as the content helper, which takes a 1-based position (p = position - 1).
    for (const row of [UCSC_CHR1, NCBI_CHR1, BROAD_CHR1])
      expect(at(row)).toBe(HELPERS.faiByte!({ row, position: 10_001 }));
  });

  test("the Broad header is 111 characters, so OFFSET is 112", () => {
    expect(BROAD_CHR1_HEADER.length + 1).toBe(112);
    const s = fai([
      { type: "preset", state: FIND_THE_BYTE.presets[3]!.state },
      { type: "position", position: 10_001 },
    ]);
    expect(rowsOf(faiCalculatorModel.text(s))["Byte 10,212 holds"]).toBe(
      "base 10,001 of chr1 (p = 10,000), `T`",
    );
  });

  test("case 3.7: the Broad chr2 row uses the same formula", () => {
    const s = fai([
      { type: "preset", state: { row: BROAD_CHR2, label: "Broad chr2" } },
      { type: "position", position: 165_980_001 },
    ]);
    expect(currentByte(s)).toBe(251_446_211 + 1_659_800 * 101);
    expect(rowsOf(faiCalculatorModel.text(s))["Byte 419,086,011 holds"]).toBe(
      "base 165,980,001 of chr2 (p = 165,980,000); this base is not shown in the course",
    );
  });

  test("a preset keeps the base, so the same base can be compared across files", () => {
    const s = fai([
      { type: "position", position: 45 },
      { type: "preset", state: { row: BROAD_CHR1 } },
    ]);
    expect(currentP(s)).toBe(44);
    expect(currentByte(s)).toBe(112 + 44);
    const named = fai([{ type: "preset", state: { row: UCSC_CHR1, position: 10_001 } }]);
    expect(currentP(named)).toBe(10_000);
  });

  test("0-based p and the convention", () => {
    const s = fai([
      { type: "convention", convention: "0-based" },
      { type: "p", p: 44 },
    ]);
    expect(currentByte(s)).toBe(84);
    const check = faiCalculatorModel.goalChecks.showsBase;
    expect(check(s, { position: 45, convention: "0-based" })).toBe(true);
    expect(check(s, { position: 45, convention: "1-based" })).toBe(false);
    expect(check(s, { position: 44 })).toBe(false);
  });

  test("bytes that are not bases: the header, its newline, line terminators and past the end", () => {
    const s = fai([]);
    expect(locate(s.file, 0)).toEqual({ kind: "header", index: 0 });
    expect(locate(s.file, 37)).toEqual({ kind: "header", index: 37 });
    expect(locate(s.file, 58)).toEqual({ kind: "terminator", line: 0, index: 0, width: 1 });
    expect(locate(s.file, 59)).toEqual({ kind: "base", p: 20, line: 1, column: 0 });
    expect(locate(s.file, 100)).toEqual({ kind: "terminator", line: 2, index: 0, width: 1 });
    expect(locate(s.file, 101)).toEqual({ kind: "after" });
    const at = (byte: number) =>
      rowsOf(faiCalculatorModel.text(fai([{ type: "byte", byte }])))[`Byte ${byte} holds`];
    expect(at(0)).toBe("character 1 of the header line, `>`");
    expect(at(37)).toBe("the newline (LF) ending the header line");
    expect(at(58)).toBe("the newline (LF) ending sequence line 1");
    expect(at(84)).toBe("base 45 of chrM_demo (p = 44), `A`");
    expect(at(101)).toBe("past the end of chrM_demo's sequence: the next record or the end of the file");
    expect(rowsOf(faiCalculatorModel.text(fai([{ type: "byte", byte: 58 }])))["Full lines before it"]).toBe(
      "floor(20 / 21) = 0",
    );
  });

  test("a byte on a base binds back to the position; stepping off a terminator lands on a base", () => {
    expect(currentP(fai([{ type: "byte", byte: 84 }]))).toBe(44);
    expect(currentP(fai([{ type: "byte", byte: 58 }]))).toBeUndefined();
    expect(
      currentP(
        fai([
          { type: "byte", byte: 58 },
          { type: "step", by: 1 },
        ]),
      ),
    ).toBe(20);
    expect(
      currentP(
        fai([
          { type: "byte", byte: 58 },
          { type: "step", by: -1 },
        ]),
      ),
    ).toBe(19);
    expect(
      currentP(
        fai([
          { type: "byte", byte: 3 },
          { type: "step", by: 1 },
        ]),
      ),
    ).toBe(0);
    expect(
      currentP(
        fai([
          { type: "byte", byte: 500 },
          { type: "step", by: -1 },
        ]),
      ),
    ).toBe(59);
  });

  test("steps and lines move the base; the ends refuse with a notice", () => {
    expect(
      currentByte(
        fai([
          { type: "position", position: 20 },
          { type: "step", by: 1 },
        ]),
      ),
    ).toBe(59);
    expect(currentP(fai([{ type: "line", by: 2 }]))).toBe(40);
    const end = fai([
      { type: "position", position: 60 },
      { type: "step", by: 1 },
    ]);
    expect(currentP(end)).toBe(59);
    expect(end.notice).toBe("This is the last base of chrM_demo.");
    expect(fai([{ type: "step", by: -1 }]).notice).toBe("This is the first base of chrM_demo.");
    const out = fai([{ type: "position", position: 61 }]);
    expect(currentP(out)).toBe(0);
    expect(out.notice).toBe("chrM_demo has 60 bases: choose a position from 1 to 60.");
    expect(fai([{ type: "p", p: 60 }]).notice).toBe("chrM_demo has 60 bases: p runs from 0 to 59.");
    expect(
      fai([
        { type: "position", position: 61 },
        { type: "position", position: 2 },
      ]).notice,
    ).toBeUndefined();
  });

  test("CR-LF: LINEWIDTH 22 moves base 45 to byte 86 and hides the toy file's bytes", () => {
    const s = fai([
      { type: "position", position: 45 },
      { type: "field", field: "lineWidth", value: 22 },
    ]);
    expect(currentByte(s)).toBe(86);
    expect(s.file.edited).toBe(true);
    expect(rowsOf(faiCalculatorModel.text(s))["Byte 86 holds"]).toBe(
      "base 45 of chrM_demo (p = 44); the row was edited, so this file's bytes are not shown",
    );
    expect(
      rowsOf(
        faiCalculatorModel.text(
          fai([
            { type: "field", field: "lineWidth", value: 22 },
            { type: "byte", byte: 58 },
          ]),
        ),
      )["Byte 58 holds"],
    ).toBe("the carriage return (CR) of a CR LF pair ending sequence line 1");
  });

  test("a CR-LF file with its real OFFSET", () => {
    const s = fai([{ type: "position", position: 45 }], {
      row: "chrM_demo\t60\t39\t20\t22",
      header: TOY_HEADER,
      sequence: TOY_SEQUENCE,
    });
    expect(currentByte(s)).toBe(87);
    expect(locate(s.file, 37)).toEqual({ kind: "header", index: 37 });
    expect(locate(s.file, 38)).toEqual({ kind: "header", index: 38 });
    expect(locate(s.file, 59)).toEqual({ kind: "terminator", line: 0, index: 0, width: 2 });
  });

  test("column edits are validated", () => {
    const s = fai([{ type: "field", field: "lineWidth", value: 20 }]);
    expect(s.file.row.lineWidth).toBe(21);
    expect(s.notice).toBe("LINEWIDTH counts the line terminator too, so it must be larger than LINEBASES.");
    expect(fai([{ type: "field", field: "lineBases", value: 0 }]).notice).toBe(
      "LINEBASES must be a whole number of at least 1.",
    );
    const shorter = fai([
      { type: "position", position: 60 },
      { type: "field", field: "length", value: 50 },
    ]);
    expect(currentP(shorter)).toBe(49);
    expect(fai([{ type: "field", field: "offset", value: 38 }]).file.edited).toBe(false);
  });

  test("init refuses rows that cannot describe a record", () => {
    expect(() => faiCalculatorModel.init({ row: "chrM_demo 60 38 20 21" })).toThrow(/TAB-separated/);
    expect(() => faiCalculatorModel.init({ row: "x\t60\t38\t20\t20" })).toThrow(/LINEWIDTH/);
    expect(() => faiCalculatorModel.init({ row: TOY_ROW, position: 61 })).toThrow(/outside/);
    expect(() => faiCalculatorModel.init({ row: "x\t60\t5\t20\t21", header: TOY_HEADER })).toThrow(/header/);
  });

  test("malformed actions leave the state alone", () => {
    const s = fai([]);
    for (const action of [
      null,
      3,
      {},
      { type: "nope" },
      { type: "position", position: "45" },
      { type: "preset", state: { row: "bad" } },
    ])
      expect(faiCalculatorModel.reduce(s, action as FaiCalculatorAction)).toBe(s);
  });

  test("comparedRows needs the base under every row", () => {
    const check = faiCalculatorModel.goalChecks.comparedRows;
    const args = { position: 10_001, rows: [UCSC_CHR1, NCBI_CHR1, BROAD_CHR1] };
    const two = fai([
      { type: "preset", state: { row: UCSC_CHR1, position: 10_001 } },
      { type: "preset", state: { row: NCBI_CHR1 } },
    ]);
    expect(check(two, args)).toBe(false);
    expect(check(faiCalculatorModel.reduce(two, { type: "preset", state: { row: BROAD_CHR1 } }), args)).toBe(
      true,
    );
    expect(check(two, { position: 10_001, rows: ["not a row"] })).toBe(false);
  });

  test("the file map: the toy shows every line; chr1 collapses all but the target's neighbours", () => {
    const toy = fileMap(fai([{ type: "position", position: 45 }]));
    expect(toy.map((s) => [s.kind, s.from, s.kind === "after" ? undefined : s.to])).toEqual([
      ["header", 0, 37],
      ["line", 38, 58],
      ["line", 59, 79],
      ["line", 80, 100],
      ["after", 101, undefined],
    ]);
    expect(toy[0]).toMatchObject({ text: TOY_HEADER });
    expect(toy[3]).toMatchObject({ firstBase: 41, lastBase: 60, cells: TOY_SEQUENCE.slice(40).split("") });
    const broad = fai([
      { type: "preset", state: FIND_THE_BYTE.presets[3]!.state },
      { type: "position", position: 10_001 },
    ]);
    const map = fileMap(broad);
    expect(map.map((s) => s.kind)).toEqual([
      "header",
      "line",
      "lines",
      "line",
      "line",
      "line",
      "lines",
      "line",
      "after",
    ]);
    expect(map[2]).toMatchObject({ firstLine: 1, lastLine: 98, firstBase: 101, lastBase: 9_900 });
    const target = map[4];
    expect(target).toMatchObject({ kind: "line", line: 100, from: 10_212, to: 10_312, firstBase: 10_001 });
    if (target?.kind === "line") {
      expect(target.cells?.slice(0, 6)).toEqual(["T", "A", "A", "C", "C", "C"]);
      expect(target.cells?.[36]).toBeNull();
    }
    expect(map.at(-2)).toMatchObject({
      kind: "line",
      line: 2_489_564,
      firstBase: 248_956_401,
      lastBase: 248_956_422,
    });
  });

  test("the state stays small: visited is capped", () => {
    let s: FaiCalculatorState = fai([]);
    for (let i = 1; i <= 60; i += 1) s = faiCalculatorModel.reduce(s, { type: "position", position: i });
    s = faiCalculatorModel.reduce(s, { type: "preset", state: { row: BROAD_CHR1 } });
    for (let i = 1; i <= 60; i += 1) s = faiCalculatorModel.reduce(s, { type: "position", position: i });
    expect(s.visited.length).toBeLessThanOrEqual(64);
  });
});

// ---------------------------------------------------------------------------------------------

describe("phred-converter", () => {
  test("found EX-05: I is Q40, 5 is Q20, ? is Q30, # is Q2", () => {
    const q = (char: string) => phred([{ type: "char", char }]).q;
    expect([q("I"), q("5"), q("?"), q("#"), q("!"), q("~")]).toEqual([40, 20, 30, 2, 0, 93]);
  });

  test("the found 3.4 table: P, accuracy and odds", () => {
    const row = (q: number) => [formatP(10 ** (-q / 10)), formatAccuracy(q)];
    expect(row(2)).toEqual(["0.631", "37%"]);
    expect(row(10)).toEqual(["0.1", "90%"]);
    expect(row(20)).toEqual(["0.01", "99%"]);
    expect(row(30)).toEqual(["0.001", "99.9%"]);
    expect(row(40)).toEqual(["0.0001", "99.99%"]);
    expect(formatP(10 ** -9.3)).toBe("1 in 1,995,262,315");
    expect(formatOdds(0.1)).toBe("1 in 10");
    expect(formatOdds(10 ** -0.2)).toBe("1 in 1.6");
    expect(converterReadout(phred([{ type: "char", char: "I" }]))).toBe(
      "`I` is Q40: error probability 0.0001 (1 in 10,000), accuracy 99.99%.",
    );
    expect(converterReadout(phred([{ type: "q", q: 0 }]))).toBe(
      "`!` is Q0: error probability 1, accuracy 0%.",
    );
  });

  test("Q, P and the character are bound both ways", () => {
    expect(phred([{ type: "q", q: 37 }]).q).toBe(37);
    expect(phred([{ type: "p", p: 0.001 }]).q).toBe(30);
    expect(phred([{ type: "p", p: 0.002 }]).q).toBe(27);
    expect(phred([{ type: "p", p: 1e-12 }]).q).toBe(93);
    expect(phred([{ type: "step", by: 10 }]).q).toBe(20);
    expect(
      phred([
        { type: "q", q: 90 },
        { type: "step", by: 10 },
      ]).q,
    ).toBe(93);
    expect(phred([{ type: "step", by: -20 }]).q).toBe(0);
  });

  test("invalid input leaves the state alone", () => {
    const s = phred([]);
    for (const action of [
      { type: "char", char: " " },
      { type: "char", char: "II" },
      { type: "char", char: "é" },
      { type: "q", q: 94 },
      { type: "q", q: 2.5 },
      { type: "p", p: 0 },
      { type: "p", p: 1.5 },
      { type: "step", by: 0 },
      { type: "nope" },
    ])
      expect(phredConverterModel.reduce(s, action as PhredConverterAction)).toBe(s);
  });

  test("what init shows does not count as converted", () => {
    const s = phred([], { char: "I" });
    expect(s.q).toBe(40);
    expect(s.seen).toEqual([]);
    expect(phredConverterModel.goalChecks.decoded(s, { chars: "I" })).toBe(false);
    expect(phredConverterModel.goalChecks.showsChar(s, { char: "I" })).toBe(true);
    expect(phredConverterModel.goalChecks.showsQ(s, { q: 40 })).toBe(true);
  });

  test("the four NovaSeq 6000 bins decode to Q2, Q11, Q25 and Q37 (D-18)", () => {
    const s = phred(["#", ",", ":", "F"].map((char) => ({ type: "char", char })));
    expect(s.q).toBe(37);
    expect(phredConverterModel.goalChecks.decoded(s, { chars: "#,:F" })).toBe(true);
    expect(phredConverterModel.goalChecks.decoded(s, { chars: ["#", "I"] })).toBe(false);
  });

  test("seq EX-07, found EX-05: expected errors are sums of P", () => {
    const ten = phred([{ type: "quality", quality: "IIIIIIIIII5555555555" }]);
    expect(phredConverterModel.text(ten)).toEqual({
      kind: "table",
      columns: ["Character", "Q", "Error probability", "Bases", "Expected errors"],
      rows: [
        ["I", "Q40", "0.0001", "10", "0.001"],
        ["5", "Q20", "0.01", "10", "0.1"],
        ["All", "", "", "20", "0.101"],
      ],
    });
    expect(qualityReadout(ten)).toBe("20 bases, expected errors 0.101. The `5` bases contribute 99% of it.");
    const worst = phred([{ type: "quality", quality: "IIII#" }]);
    expect(formatSum(summarize(worst.quality).expectedErrors)).toBe("0.6314");
    expect(qualityReadout(worst)).toBe(
      "5 bases, expected errors 0.6314. The `#` base contributes 99.9% of it.",
    );
    expect(summarize("IIII#").meanQ).toBeCloseTo(32.4, 6);
    expect(summarize("IIII#").meanP).toBeCloseTo(0.12627, 4);
    expect(HELPERS.expectedErrors!({ quality: "IIII#" })).toBeCloseTo(summarize("IIII#").expectedErrors, 12);
  });

  test("a real case read: four bins, 150 bases", () => {
    const s = phred([{ type: "preset", state: { quality: CASE_READ_QUALITY } }]);
    expect(s.quality).toHaveLength(150);
    const chars = summarize(s.quality).groups.map((g) => g.char);
    expect(chars.every((c) => "#,:F".includes(c))).toBe(true);
    expect(s.seen).toEqual([...new Set(chars)].sort());
  });

  test("an empty quality string: the table holds the current character", () => {
    expect(phredConverterModel.text(phred([{ type: "char", char: "?" }])).kind).toBe("table");
    expect(
      (phredConverterModel.text(phred([{ type: "char", char: "?" }])) as { rows: string[][] }).rows,
    ).toEqual([["?", "Q30", "0.001", "1", "0.001"]]);
    expect(qualityReadout(phred([]))).toBe("Type a quality string to add up its expected errors.");
  });

  test("quality strings drop spaces and are capped; init refuses bad data", () => {
    expect(phred([{ type: "quality", quality: "II II\n#" }]).quality).toBe("IIII#");
    expect(phred([{ type: "quality", quality: "F".repeat(400) }]).quality).toHaveLength(300);
    expect(() => phredConverterModel.init({ char: " " })).toThrow();
    expect(() => phredConverterModel.init({ q: 100 })).toThrow();
    expect(() => phredConverterModel.init({ quality: "I I" })).toThrow();
  });

  test("sum: false hides the quality string, so predicts about sums stay unanswered", () => {
    const s = phred(
      [
        { type: "quality", quality: "IIII#" },
        { type: "char", char: "I" },
      ],
      { sum: false },
    );
    expect(s.sum).toBe(false);
    expect(s.quality).toBe("");
    expect((phredConverterModel.text(s) as { rows: string[][] }).rows).toEqual([
      ["I", "Q40", "0.0001", "1", "0.0001"],
    ]);
    expect(() => phredConverterModel.init({ sum: false, quality: "II" })).toThrow(/sum: true/);
  });

  test("qualityIs and decoded via the quality string", () => {
    const s: PhredConverterState = phred([{ type: "quality", quality: "I5?#" }]);
    expect(phredConverterModel.goalChecks.qualityIs(s, { quality: "I5?#" })).toBe(true);
    expect(phredConverterModel.goalChecks.qualityIs(s, { quality: "" })).toBe(false);
    expect(phredConverterModel.goalChecks.decoded(s, { chars: "I5?#" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

describe("bgzf-demo", () => {
  test("seq 3.4: the default bgzip 1.24 file has four blocks; the .fai sets the text size", () => {
    const s = bgzf([]);
    expect(s.usize).toBe(203_350);
    expect(blocks(s)).toEqual([
      { number: 1, coffset: 0, ustart: 0, usize: 65_225, csize: 20_642 },
      { number: 2, coffset: 20_642, ustart: 65_225, usize: 65_270, csize: 20_606 },
      { number: 3, coffset: 41_248, ustart: 130_495, usize: 65_270, csize: 20_683 },
      { number: 4, coffset: 61_931, ustart: 195_765, usize: 7_585 },
    ]);
    // 65,225 = the 16-byte header + 1,069 full 61-byte lines (seq 3.4).
    expect(16 + 1_069 * 61).toBe(65_225);
  });

  test("base 140,001 is byte 142,349, 11,854 bytes into block 3", () => {
    const s = bgzf([]);
    expect(s.position).toBe(140_001);
    expect(s.target).toBe(142_349);
    expect(s.target).toBe(HELPERS.faiByte!({ row: "chrZ\t200000\t16\t60\t61", position: 140_001 }));
    expect(blockOf(s, s.target)).toMatchObject({ number: 3, ustart: 130_495 });
    expect(virtualOffset(41_248, 11_854)).toBe(2_703_240_782);
    expect(virtualOffsetHex(41_248, 11_854)).toBe("A120 2E4E");
    expect(virtualOffset(41_248, 11_854)).toBe(Number((41_248n << 16n) | 11_854n));
  });

  test("BGZF: find the block, inflate it, skip uoffset bytes", () => {
    expect(plan(bgzf([])).map((step) => step.text)).toEqual([
      "The .fai turns base 140,001 (p = 140,000) into uncompressed byte 16 + 2,333 × 61 + 20 = 142,349.",
      "The .gzi says block 3 starts at compressed byte 41,248 and uncompressed byte 130,495. The target is 11,854 bytes into it, so its virtual offset is 41,248 << 16 | 11,854 = 2,703,240,782.",
      "Seek to compressed byte 41,248 and inflate block 3 alone: 20,683 compressed bytes become 65,270. Blocks 1 and 2 are never read.",
      "Skip 11,854 bytes of the inflated block: the next byte is base 140,001 of chrZ. Inflated in total: 65,270 of 203,350 bytes. That is 1 block of 4.",
    ]);
  });

  test("gzip: inflate everything before the target", () => {
    const s = bgzf([{ type: "mode", mode: "gzip" }]);
    const steps = plan(s);
    expect(steps.map((step) => step.kind)).toEqual(["fai", "start", "chunk", "chunk", "chunk"]);
    expect(steps[4]?.text).toBe(
      "Inflate bytes 131,072 to 142,349: the last one is base 140,001 of chrZ. Inflated in total: 142,350 of 203,350 bytes.",
    );
    const inflated: number[] = [];
    let t: BgzfDemoState = s;
    for (let i = 0; i < steps.length; i += 1) {
      t = bgzfDemoModel.reduce(t, { type: "step" });
      inflated.push(progress(t).inflatedBytes);
    }
    expect(inflated).toEqual([0, 0, 65_536, 131_072, 142_350]);
    expect(progress(t).done).toBe(true);
    expect(t.fetched).toEqual(["gzip:142349"]);
  });

  test("progress through a BGZF fetch, recorded once at the end", () => {
    let s = bgzf([]);
    const seen: [number | undefined, boolean, boolean, number][] = [];
    for (let i = 0; i < 5; i += 1) {
      s = bgzfDemoModel.reduce(s, { type: "step" });
      const p = progress(s);
      seen.push([p.block, p.inflated, p.skipped, p.inflatedBytes]);
    }
    expect(seen).toEqual([
      [undefined, false, false, 0],
      [3, false, false, 0],
      [3, true, false, 65_270],
      [3, true, true, 65_270],
      [3, true, true, 65_270],
    ]);
    expect(s.step).toBe(4);
    expect(s.fetched).toEqual(["bgzf:142349"]);
    expect(bgzfDemoModel.reduce(s, { type: "step" })).toBe(s);
  });

  test("the step log is the text view", () => {
    expect(bgzfDemoModel.text(bgzf([]))).toEqual({
      kind: "log",
      entries: ["Ready to fetch base 140,001 of chrZ from chrZ.fa.gz (BGZF). Select Step."],
    });
    const two = bgzf([{ type: "step" }, { type: "step" }, { type: "checkEof" }]);
    const entries = (bgzfDemoModel.text(two) as { entries: string[] }).entries;
    expect(entries).toHaveLength(3);
    expect(entries[2]).toBe(eofText("present"));
  });

  test("the EOF block: present, removed, checked (CASE-14)", () => {
    const removed = bgzf([{ type: "eof", present: false }, { type: "checkEof" }]);
    expect(removed.eofCheck).toBe("absent");
    expect(eofText("absent")).toBe(
      "The last 28 bytes are not the EOF block, so the file is presumed truncated (CASE-14) and its verdict is Invalid. " +
        "Tools say: samtools warns `EOF marker is absent. The input may be truncated` and carries on, and `gzip -t` still passes.",
    );
    const restored = bgzfDemoModel.reduce(removed, { type: "eof", present: true });
    expect(restored.eofCheck).toBeUndefined();
    expect(restored.eofChecks).toEqual(["absent"]);
    expect(bgzfDemoModel.goalChecks.eofChecked(restored, { present: false })).toBe(true);
    expect(bgzfDemoModel.goalChecks.eofChecked(restored, { present: true })).toBe(false);
    const gzip = bgzf([{ type: "mode", mode: "gzip" }]);
    expect(bgzfDemoModel.reduce(gzip, { type: "checkEof" })).toBe(gzip);
  });

  test("changing the target or the container starts the fetch again", () => {
    const s = bgzf([{ type: "step" }, { type: "step" }]);
    expect(bgzfDemoModel.reduce(s, { type: "position", position: 10 }).step).toBe(0);
    expect(bgzfDemoModel.reduce(s, { type: "mode", mode: "gzip" }).step).toBe(0);
    expect(bgzfDemoModel.reduce(s, { type: "mode", mode: "bgzf" }).step).toBe(2);
    expect(bgzfDemoModel.reduce(s, { type: "restart" }).step).toBe(0);
    const first = bgzf([{ type: "position", position: 1 }]);
    expect(first.target).toBe(16);
    expect(plan(first)[2]?.text).toBe(
      "Seek to compressed byte 0 and inflate block 1 alone: 20,642 compressed bytes become 65,225.",
    );
    const last = bgzf([{ type: "position", position: 200_000 }]);
    expect(blockOf(last, last.target).number).toBe(4);
    expect(plan(last)[2]?.text).toBe(
      "Seek to compressed byte 61,931 and inflate block 4 alone: it becomes 7,585 bytes. Blocks 1 to 3 are never read.",
    );
    expect(plan(bgzf([{ type: "position", position: 100_000 }]))[2]?.text).toMatch(
      /Block 1 is never read\.$/,
    );
  });

  test("out-of-range targets are refused with a notice", () => {
    const s = bgzf([{ type: "position", position: 200_001 }]);
    expect(s.position).toBe(140_001);
    expect(s.notice).toBe("chrZ has 200,000 bases: choose a position from 1 to 200,000.");
    expect(bgzf([{ type: "target", target: 203_350 }]).notice).toBe(
      "The file holds 203,350 uncompressed bytes: choose an offset from 0 to 203,349.",
    );
    const byOffset = bgzf([{ type: "target", target: 70_000 }]);
    expect(byOffset.position).toBeUndefined();
    expect(plan(byOffset).map((step) => step.kind)).toEqual(["find", "inflate", "skip"]);
    expect(plan(byOffset)[2]?.text).toMatch(/the next byte is uncompressed byte 70,000\./);
  });

  test("the bgzip --binary preset moves the block boundaries (never assume 65,280)", () => {
    const s = bgzf([{ type: "preset", state: { gzi: CHRZ_GZI_BINARY } }]);
    expect(s.target).toBe(142_349);
    expect(blockOf(s, s.target)).toMatchObject({
      number: 3,
      coffset: 41_263,
      ustart: 130_560,
      usize: 65_280,
    });
    expect(blocks(s).at(-1)).toMatchObject({ usize: 203_350 - 195_840 });
  });

  test("goal checks", () => {
    const both = bgzf([
      { type: "step" },
      { type: "step" },
      { type: "step" },
      { type: "step" },
      { type: "mode", mode: "gzip" },
      ...Array.from({ length: 5 }, () => ({ type: "step" }) as const),
    ]);
    const { fetched, comparedModes } = bgzfDemoModel.goalChecks;
    expect(fetched(both, { mode: "bgzf" })).toBe(true);
    expect(fetched(both, { mode: "gzip", position: 140_001 })).toBe(true);
    expect(fetched(both, { mode: "gzip", position: 1 })).toBe(false);
    expect(fetched(both, { target: 142_349 })).toBe(true);
    expect(comparedModes(both, {})).toBe(true);
    expect(comparedModes(both, { position: 1 })).toBe(false);
    const other = bgzfDemoModel.reduce(both, { type: "position", position: 1 });
    expect(comparedModes(other, { position: 140_001 })).toBe(true);
  });

  test("init validates the .gzi", () => {
    expect(() =>
      bgzfDemoModel.init({
        gzi: [
          [10, 5],
          [5, 10],
        ],
        usize: 20,
      }),
    ).toThrow(/increase/);
    expect(() => bgzfDemoModel.init({ gzi: [[10, 70_000]], usize: 80_000 })).toThrow(/65,536/);
    expect(() => bgzfDemoModel.init({ gzi: [[10, 100]] })).toThrow(/usize or fai/);
    expect(() => bgzfDemoModel.init({ gzi: "x", usize: 5 })).toThrow(/pairs/);
    expect(bgzfDemoModel.init({ gzi: [[300, 60_000]], usize: 100_000, target: 70_000 }).target).toBe(70_000);
  });

  test("malformed actions leave the state alone", () => {
    const s = bgzf([]);
    for (const action of [
      null,
      {},
      { type: "nope" },
      { type: "mode", mode: "zip" },
      { type: "eof", present: "no" },
      { type: "preset", state: { gzi: "bad" } },
    ])
      expect(bgzfDemoModel.reduce(s, action as BgzfDemoAction)).toBe(s);
  });
});
