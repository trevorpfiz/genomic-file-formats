// The shared format helpers: line splitting, the .fai arithmetic (seq 3.2, EX-02, EX-03, Q2),
// FASTQ record parsing (EX-10), Phred sums (found 3.4; seq EX-07, Q3) and gzip/BGZF summaries
// (seq 6; SAMv1 §4.1). Values are the notes' verified numbers.
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vite-plus/test";
import { faiByte, faiRows, faiRowText, parseFaiRow, parseFasta, sequenceOf } from "./fasta.ts";
import { parseFastq } from "./fastq.ts";
import { BGZF_EOF, crc32, gzipTrailerMatches, hexBytes, summarizeGzip, toHex } from "./gzip.ts";
import { splitLines } from "./lines.ts";
import { HELPERS } from "./helpers.ts";
import { charToQ, expectedErrors, inferEncoding, qToP, qualityAlphabet } from "./phred.ts";

const TOY =
  ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGGAGCT\nCTCCATGCATTTGGTATTTT\n" +
  ">chr1_tel GRCh38 chr1:10001-10036 soft-masked\ntaaccctaaccctaacccta\naccctaaccctaaccc\n";

describe("splitLines", () => {
  test("LF, CR-LF, a missing final newline and byte offsets", () => {
    const { lines, finalNewline, bom } = splitLines("ab\r\ncd\nef");
    expect(bom).toBe(false);
    expect(finalNewline).toBe(false);
    expect(lines.map((l) => [l.number, l.text, l.eol, l.byteOffset])).toEqual([
      [1, "ab", "\r\n", 0],
      [2, "cd", "\n", 4],
      [3, "ef", "", 7],
    ]);
  });

  test("empty input has no lines; a lone newline is one empty line", () => {
    expect(splitLines("")).toEqual({ lines: [], bom: false, finalNewline: true });
    expect(splitLines("\n").lines.map((l) => l.text)).toEqual([""]);
  });

  test("a BOM is reported and removed from line 1; offsets count its 3 bytes", () => {
    const { lines, bom } = splitLines("﻿>a\nAC\n");
    expect(bom).toBe(true);
    expect(lines[0]?.text).toBe(">a");
    expect(lines[0]?.byteOffset).toBe(3);
    expect(lines[1]?.byteOffset).toBe(6);
  });

  test("a CR that is not before LF stays in the text", () => {
    expect(splitLines("a\rb\n").lines[0]?.text).toBe("a\rb");
  });
});

describe("FASTA and .fai (seq 3.1-3.2)", () => {
  test("toy.fa indexes to the verified rows", () => {
    expect(faiRows(TOY).map(faiRowText)).toEqual(["chrM_demo\t60\t38\t20\t21", "chr1_tel\t36\t147\t20\t21"]);
  });

  test("EX-03: an empty middle record is left out", () => {
    const fasta =
      ">chr1_tel\ntaaccctaaccctaacccta\naccctaaccctaaccc\n>chrUn_empty\n>chrM_demo\nGATCACAGGTCTATCACCCT\n";
    expect(faiRows(fasta).map(faiRowText)).toEqual(["chr1_tel\t36\t10\t20\t21", "chrM_demo\t20\t72\t20\t21"]);
  });

  test("EX-04: the renamed duplicate gets its own row; a repeated name keeps the first", () => {
    const head =
      ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGGAGCT\nCTCCATGCATTTGGTATTTT\n";
    expect(faiRows(`${head}>chrM_demo2 duplicate copy\nGATCACAGGT\n`).map(faiRowText)).toEqual([
      "chrM_demo\t60\t38\t20\t21",
      "chrM_demo2\t10\t128\t10\t11",
    ]);
    expect(faiRows(`${head}>chrM_demo duplicate copy\nGATCACAGGT\n`).map(faiRowText)).toEqual([
      "chrM_demo\t60\t38\t20\t21",
    ]);
  });

  test("CR-LF makes LINEWIDTH LINEBASES + 2; OFFSET counts every CR (39 + 3 * 22 + 47 = 152)", () => {
    const crlf = TOY.replaceAll("\n", "\r\n");
    expect(faiRows(crlf).map(faiRowText)).toEqual(["chrM_demo\t60\t39\t20\t22", "chr1_tel\t36\t152\t20\t22"]);
  });

  test("an inner space counts in LINEWIDTH but not LINEBASES (seq FA-S05)", () => {
    expect(faiRows(">a\nACGTA CGTAC\nACGTACGTAC\nAC\n")[0]).toMatchObject({
      lineBases: 10,
      lineWidth: 12,
      length: 22,
    });
  });

  test("names: first word, leading whitespace skipped", () => {
    const parsed = parseFasta(">  chr1 desc here\nACGT\n");
    expect(parsed.records[0]).toMatchObject({ name: "chr1", description: "desc here" });
    expect(sequenceOf(parsed.records[0]!)).toBe("ACGT");
  });

  test("blank lines inside a record stay in it; blank lines between records do not", () => {
    const parsed = parseFasta(">a\nAC\n\nGT\n\n>b\nTT\n");
    expect(parsed.records[0]?.lines.map((l) => l.number)).toEqual([2, 3, 4]);
    expect(parsed.records[0]?.trailingBlanks.map((l) => l.number)).toEqual([5]);
  });

  test("faiByte: EX-02 task 1, the three chr1 copies, and Q2", () => {
    const toy = parseFaiRow("chrM_demo\t60\t38\t20\t21")!;
    expect(faiByte(toy, 45 - 1)).toBe(84);
    expect(TOY[84]).toBe("A");
    expect(faiByte({ offset: 6, lineBases: 50, lineWidth: 51 }, 10_000)).toBe(10206);
    expect(faiByte({ offset: 112, lineBases: 70, lineWidth: 71 }, 10_000)).toBe(10254);
    expect(faiByte({ offset: 112, lineBases: 100, lineWidth: 101 }, 10_000)).toBe(10212);
    expect(faiByte(parseFaiRow("chr2\t242193529\t251446211\t100\t101")!, 101 - 1)).toBe(251446312);
    expect(() => faiByte(toy, -1)).toThrow(RangeError);
    expect(() => faiByte(toy, 1.5)).toThrow(RangeError);
  });

  test("parseFaiRow accepts 5 or 6 TAB-separated columns and rejects the rest", () => {
    expect(parseFaiRow("r1\t30\t4\t18\t19\t38")).toMatchObject({ qualOffset: 38 });
    expect(parseFaiRow("chr1 248956422 112 100 101")).toBeUndefined();
    expect(parseFaiRow("chr1\t1\t2\t3")).toBeUndefined();
    expect(parseFaiRow("chr1\tx\t2\t3\t4")).toBeUndefined();
  });
});

describe("FASTQ parsing by length (seq EX-10)", () => {
  test("wrapped records and quality lines starting with @ or +", () => {
    const text =
      "@r1\nGATCACAGGTCTATCACC\nCTATTAACCACT\n+\nFFFFFFFFFF:FFFFFFF\n@FFFFFFFFFFF\n@r2\nGATGAGGCAGGAATCAAA\n+\n+FFFFFFFFFFFFFFFFF\n";
    const parsed = parseFastq(text);
    expect(parsed.issues).toEqual([]);
    expect(parsed.records.map((r) => [r.id, r.sequence.length, r.quality.length])).toEqual([
      ["r1", 30, 30],
      ["r2", 18, 18],
    ]);
  });

  test("a short quality followed by the next record does not swallow its title", () => {
    const parsed = parseFastq("@r1 x\nACGT\n+\nFFF\n@r2 x\nACGT\n+\nFFFF\n");
    expect(parsed.records.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(parsed.issues.map((i) => [i.kind, i.line.number])).toEqual([["quality-length", 4]]);
  });

  test("truncation is told apart by what is missing", () => {
    const kinds = (t: string) =>
      parseFastq(t).issues.map((i) => (i.kind === "truncated" ? i.missing : i.kind));
    expect(kinds("@r1\nACGT\n")).toEqual(["plus"]);
    expect(kinds("@r1\nACGT\n+\n")).toEqual(["quality"]);
    expect(kinds("@r1\nACGT\n+\nFF")).toEqual(["partial-quality"]);
    expect(kinds("@r1\nACGT\n+\nFF\n")).toEqual(["quality-length"]);
  });
});

describe("Phred (found 3.4; seq EX-07, Q3)", () => {
  test("characters and probabilities", () => {
    expect([charToQ("I"), charToQ("5"), charToQ("?"), charToQ("#"), charToQ(")")]).toEqual([
      40, 20, 30, 2, 8,
    ]);
    expect(charToQ("h", 64)).toBe(40);
    expect(qToP(30)).toBeCloseTo(0.001, 12);
  });

  test("expected errors sum probabilities", () => {
    expect(expectedErrors(")))))")).toBeCloseTo(0.79, 2);
    expect(expectedErrors("IIII#")).toBeCloseTo(0.6314, 4);
    expect(expectedErrors("IIIIIIIIII5555555555")).toBeCloseTo(0.101, 3);
    expect(expectedErrors("FFFFFFFFFFFFFFF:FFFFFFFFFFFFFFF,FFFF")).toBeCloseTo(0.0894, 4);
  });

  test("encoding inference and binned alphabets (D-18)", () => {
    expect(inferEncoding(["FF:,F"])).toBe("phred33");
    expect(inferEncoding(["IIIIIIII"])).toBe("possibly-phred64");
    expect(inferEncoding(["<=>?"])).toBe("unknown");
    expect(inferEncoding([])).toBe("unknown");
    expect(qualityAlphabet(["F:,F", "#F"])).toEqual(["#", ",", ":", "F"]);
  });
});

describe("gzip and BGZF summaries", () => {
  const BGZF_HEAD = "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00";
  test("seq 6's 16-byte BGZF head shows the BC subfield but not BSIZE", () => {
    expect(
      summarizeGzip({ head: "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00", annotations: [] }),
    ).toMatchObject({
      kind: "bgzf",
      bc: { offset: 12 },
    });
  });

  test("an 18-byte BGZF head shows BSIZE too", () => {
    const s = summarizeGzip({ head: BGZF_HEAD, annotations: [] });
    expect(s).toMatchObject({
      magic: true,
      kind: "bgzf",
      fextra: true,
      bc: { offset: 12, bsize: 27 },
      endKnown: false,
    });
    expect(s.eofBlock).toBeUndefined();
  });

  test("the 28-byte EOF block is recognised at the end", () => {
    const eof = toHex(BGZF_EOF);
    expect(summarizeGzip({ head: BGZF_HEAD, tail: eof, omittedBytes: 100, annotations: [] })).toMatchObject({
      kind: "bgzf",
      endKnown: true,
      eofBlock: true,
      size: 18 + 100 + 28,
    });
    expect(summarizeGzip({ head: eof, omittedBytes: 0, annotations: [] }).eofBlock).toBe(true);
    expect(summarizeGzip({ head: BGZF_HEAD, tail: "00 01 02", annotations: [] }).eofBlock).toBeUndefined();
    expect(summarizeGzip({ head: "1f 8b 08 04", omittedBytes: 0, annotations: [] }).eofBlock).toBe(false);
    expect(
      summarizeGzip({ head: BGZF_HEAD, tail: toHex(Array<number>(28).fill(0)), annotations: [] }).eofBlock,
    ).toBe(false);
  });

  test("plain gzip, other files and too few bytes", () => {
    expect(summarizeGzip({ head: "1f 8b 08 08 00 00 00 00", annotations: [] }).kind).toBe("gzip");
    expect(summarizeGzip({ head: "1f 8b 08 00", annotations: [] }).kind).toBe("gzip");
    expect(summarizeGzip({ head: "42 41 4d 01", annotations: [] }).kind).toBe("other");
    expect(summarizeGzip({ head: "1f", annotations: [] }).kind).toBe("unknown");
    expect(() => hexBytes("1f 8z")).toThrow(/hex byte/);
  });

  test("CRC-32 and the trailer of a real gzip stream", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const text = "@r1\nACGT\n+\nFFFF\n";
    const bytes = [...gzipSync(text)];
    const view = {
      head: toHex(bytes.slice(0, 10)),
      tail: toHex(bytes.slice(-12)),
      omittedBytes: bytes.length - 22,
      annotations: [],
    };
    const s = summarizeGzip(view);
    expect(s.kind).toBe("gzip");
    expect(gzipTrailerMatches(s, text)).toBe(true);
    expect(gzipTrailerMatches(s, `${text}x`)).toBe(false);
    expect(gzipTrailerMatches(summarizeGzip({ head: view.head, annotations: [] }), text)).toBeUndefined();
  });
});

describe("content-test helpers (src/formats/helpers.ts)", () => {
  const h = (id: string, args: Record<string, unknown>) => HELPERS[id]!(args);
  const EX10 =
    "@r1\nGATCACAGGTCTATCACC\nCTATTAACCACT\n+\nFFFFFFFFFF:FFFFFFF\n@FFFFFFFFFFF\n@r2\nGATGAGGCAGGAATCAAA\n+\n+FFFFFFFFFFFFFFFFF\n";

  test("found EX-11: 60 M pairs of 2x150 is 18 Gb, about 5.8x a genome and 450x a 40-Mb exome", () => {
    expect(h("totalBases", { pairs: 60e6, readLength: 150 })).toBe(18e9);
    expect(h("meanDepth", { pairs: 60e6, readLength: 150, size: 3.1e9 })).toBeCloseTo(5.8, 1);
    expect(h("meanDepth", { pairs: 60e6, readLength: 150, size: 40e6 })).toBe(450);
  });

  test("coordinates (found XF-14, XF-15)", () => {
    expect(h("toBed", { start: 2001, end: 2050 })).toEqual([2000, 2050]);
    expect(h("fromBed", { start: 1000, end: 1003 })).toEqual([1001, 1003]);
    expect(h("intervalLength", { start: 1000, end: 1003, convention: "bed" })).toBe(3);
    expect(h("intervalLength", { start: 1001, end: 1200, convention: "1-based" })).toBe(200);
  });

  test(".fai, Phred, FASTQ, reverse complement and containers", () => {
    expect(h("faiField", { fasta: TOY, name: "chr1_tel", field: "OFFSET" })).toBe(147);
    expect(() => h("faiByte", { offset: 38, lineBases: 20, lineWidth: 21, position: 0 })).toThrow(/1-based/);
    expect(h("phredQ", { char: "?" })).toBe(30);
    expect(h("phredP", { char: ")" })).toBeCloseTo(0.158, 3);
    expect(h("fastqRecordCount", { text: EX10 })).toBe(2);
    expect(h("fastqReadLength", { text: EX10, record: 1 })).toBe(30);
    expect(h("reverseComplement", { seq: "ACGTRYn" })).toBe("nRYACGT");
    expect(h("containerKind", { head: "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00" })).toBe("bgzf");
    expect(h("containerKind", { head: "1f 8b 08 08 00 00 00 00 00 03" })).toBe("gzip");
    expect(() => h("phredQ", { char: 3 })).toThrow(TypeError);
  });
});
