// gzip/BGZF summary checks and the folder's CASE-14 (seq GZ-S01, GZ-S02; case 5b; docs/PLAN.md
// 8.3, D-11). Real gzip and BGZF bytes come from node:zlib so the trailers are genuine.
import { constants, deflateRawSync, gzipSync } from "node:zlib";
import { describe, expect, test } from "vite-plus/test";
import type { HexView, Snippet } from "../exercises/types.ts";
import { BGZF_EOF, toHex } from "../formats/gzip.ts";
import { FOLDER_FORMATS, validateFolder } from "./folder.ts";
import { BGZF_HEAD, R1, TOY_FA, TOY_FAI } from "./fixtures.ts";
import { validateBgzf, validateGzip } from "./gzip.ts";
import { verdictOf } from "./types.ts";

const view = (bytes: readonly number[], head = 18, tail = 32): HexView => ({
  head: toHex(bytes.slice(0, head)),
  tail: toHex(bytes.slice(-tail)),
  omittedBytes: bytes.length - head - tail,
  annotations: [],
});

/** A single BGZF block (header with BC, raw DEFLATE, CRC, ISIZE), as bgzip writes it. */
function bgzfBlock(text: string): number[] {
  const data = [...deflateRawSync(text)];
  const bsize = 18 + data.length + 8 - 1;
  const crc = new DataView(new ArrayBuffer(8));
  const gz = [...gzipSync(text)];
  crc.setUint32(0, new DataView(Uint8Array.from(gz.slice(-8)).buffer).getUint32(0, true), true);
  crc.setUint32(4, new TextEncoder().encode(text).length, true);
  return [
    0x1f,
    0x8b,
    0x08,
    0x04,
    0,
    0,
    0,
    0,
    0,
    0xff,
    6,
    0,
    0x42,
    0x43,
    2,
    0,
    bsize & 0xff,
    bsize >> 8,
    ...data,
    ...new Uint8Array(crc.buffer),
  ];
}

describe("GZ-S01 and GZ-S02", () => {
  const bgzf = [...bgzfBlock(TOY_FA), ...BGZF_EOF];
  const plain = [...gzipSync(TOY_FA)];

  test("a real BGZF file with its EOF block is clean", () => {
    expect(validateBgzf(view(bgzf))).toEqual([]);
  });

  test("a BGZF file without the EOF block is Invalid (presumed truncated)", () => {
    const ds = validateBgzf(view(bgzf.slice(0, -28)));
    expect(ds.map((d) => [d.rule, d.line, d.verdict])).toEqual([["GZ-S02", 0, "invalid"]]);
    expect(verdictOf(ds)).toBe("invalid");
  });

  test("tools only warn about a missing EOF block", () => {
    const ds = validateBgzf(view(bgzf.slice(0, -28)), {}, { mode: "tool" });
    expect(ds.map((d) => d.severity)).toEqual(["warning"]);
    expect(verdictOf(ds)).toBe("valid");
  });

  test("plain gzip where BGZF is needed is Valid but unusable here", () => {
    const ds = validateBgzf(view(plain));
    expect(ds.map((d) => [d.rule, d.bytes])).toEqual([["GZ-S01", [3, 4]]]);
    expect(verdictOf(ds)).toBe("unusable-here");
    expect(validateGzip(view(plain), { requireBgzf: true }).map((d) => d.rule)).toEqual(["GZ-S01"]);
  });

  test("plain gzip is fine when nothing needs random access", () => {
    expect(validateGzip(view(plain))).toEqual([]);
  });

  test("not gzip at all", () => {
    expect(validateBgzf({ head: "42 41 4d 01", annotations: [] })[0]?.message).toMatch(/not the gzip magic/);
  });

  test("a head-only excerpt, or a tail shorter than 28 bytes, says nothing about the end", () => {
    expect(validateBgzf({ head: BGZF_HEAD, annotations: [] })).toEqual([]);
    expect(validateBgzf(view(bgzf.slice(0, -28), 18, 16))).toEqual([]);
  });
});

describe("validateFolder and CASE-14", () => {
  const compressed = (
    path: string,
    text: string,
    bytes: number[],
    format: Snippet["format"] = "fastq",
  ): Snippet => ({
    filename: path,
    format,
    kind: "compressed-text",
    hex: view(bytes),
    decodedText: text,
    provenance: "toy",
  });

  test("complete gzip and BGZF files pass", () => {
    expect(
      validateFolder({
        "a.fastq.gz": compressed("a.fastq.gz", R1, [...gzipSync(R1)]),
        "b.fastq.gz": compressed("b.fastq.gz", R1, [...bgzfBlock(R1), ...BGZF_EOF]),
      }),
    ).toEqual([]);
  });

  test("a gzip stream cut in transit fails gzip integrity; the text fails FQ-S06", () => {
    const cut = R1.slice(0, R1.indexOf("+\n") + 2);
    const bytes = [
      ...gzipSync(cut).subarray(0, 10),
      ...deflateRawSync(cut, { finishFlush: constants.Z_SYNC_FLUSH }),
    ];
    const ds = validateFolder({ "x.fastq.gz": compressed("x.fastq.gz", cut, bytes) });
    expect(ds.map((d) => [d.file, d.rule, d.line])).toEqual([
      ["x.fastq.gz", "CASE-14", 0],
      ["x.fastq.gz", "FQ-S06", 3],
    ]);
    expect(verdictOf(ds)).toBe("invalid");
  });

  test("a BGZF file without its EOF block fails CASE-14", () => {
    const ds = validateFolder({ "y.fastq.gz": compressed("y.fastq.gz", R1, bgzfBlock(R1)) });
    expect(ds.map((d) => d.rule)).toEqual(["CASE-14"]);
  });

  test("a .gz that is not gzip fails CASE-14", () => {
    const snippet = {
      ...compressed("z.fastq.gz", R1, [...gzipSync(R1)]),
      hex: { head: "40 72 31 0a", annotations: [] },
    };
    expect(validateFolder({ "z.fastq.gz": snippet }).map((d) => d.rule)).toEqual(["CASE-14"]);
  });

  test("a FASTA and its .fai are checked together", () => {
    const fa: Snippet = {
      filename: "ref/toy.fa",
      format: "fasta",
      kind: "text",
      text: TOY_FA,
      provenance: "toy",
    };
    const fai = (text: string): Snippet => ({
      filename: "ref/toy.fa.fai",
      format: "fai",
      kind: "text",
      text,
      provenance: "toy",
    });
    expect(validateFolder({ "ref/toy.fa": fa, "ref/toy.fa.fai": fai(TOY_FAI) })).toEqual([]);
    const stale = validateFolder({
      "ref/toy.fa": fa,
      "ref/toy.fa.fai": fai(TOY_FAI.replace("\t38\t", "\t37\t")),
    });
    expect(stale.map((d) => [d.file, d.rule, d.line, d.field])).toEqual([
      ["ref/toy.fa.fai", "FAI-M01", 1, "OFFSET"],
    ]);
  });

  test("a format without a validator yet fails loudly", () => {
    expect(FOLDER_FORMATS).not.toContain("bed");
    const bed: Snippet = {
      filename: "t.bed",
      format: "bed",
      kind: "text",
      text: "chr1\t0\t1\n",
      provenance: "toy",
    };
    expect(() => validateFolder({ "t.bed": bed })).toThrow(/no validator for format "bed"/);
  });
});
