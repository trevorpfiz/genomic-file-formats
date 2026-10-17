// Case data tests (docs/PLAN.md 9.4, 13 M1): the gen:case stub reproduces the committed module
// byte for byte; F02, built from the stub's records, fails with exactly FQ-S06 and CASE-14
// while the other five FASTQ files pass; retired placeholders never reappear.
import { spawnSync } from "node:child_process";
import { copyFileSync, globSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constants, deflateRawSync, gzipSync } from "node:zlib";
import { describe, expect, test } from "vite-plus/test";
import { checkWindows, OUTPUT, render } from "../scripts/generate-case.ts";
import { CASE_FASTQ_FILES, fastqFileText, type CaseFastqFile } from "../src/case/generated/fastq.ts";
import type { HexView, Snippet } from "../src/exercises/types.ts";
import { toHex } from "../src/formats/gzip.ts";
import { validateFolder, verdictOf } from "../src/validators/all.ts";

const F02_PATH = "fastq/P042-mother_S2_L001_R2_001.fastq.gz";

describe("gen:case stub", () => {
  test("reproduces src/case/generated/fastq.ts byte for byte", () => {
    expect(render() === readFileSync(OUTPUT, "utf8"), "run the gen:case script").toBe(true);
  });

  test("its pinned GRCh38 windows match their MD5s", () => {
    expect(checkWindows()).toEqual([]);
  });

  test("--check fails on a changed module and passes on the committed one", () => {
    const dir = mkdtempSync(join(tmpdir(), "gf-gen-case-"));
    try {
      const copy = join(dir, "fastq.ts");
      copyFileSync(OUTPUT, copy);
      const run = () =>
        spawnSync(process.execPath, ["scripts/generate-case.ts", "--check", "--out", copy], {
          encoding: "utf8",
        });
      expect(run().status).toBe(0);
      writeFileSync(copy, readFileSync(copy, "utf8").replace("1:N:0:ACGTACGT", "1:N:0:ACGTACGA"));
      const failed = run();
      expect(failed.status).toBe(1);
      expect(failed.stderr).toMatch(/out of date/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** A compressed-text snippet for a case FASTQ file, from real gzip bytes (node:zlib). */
function gzipSnippet(path: string, decodedText: string, bytes: Uint8Array): Snippet {
  const all = [...bytes];
  const hex: HexView = {
    head: toHex(all.slice(0, 16)),
    tail: toHex(all.slice(-32)),
    omittedBytes: all.length - 48,
    annotations: [{ from: 0, to: 2, label: "gzip magic" }],
  };
  return { filename: path, format: "fastq", kind: "compressed-text", hex, decodedText, provenance: "case" };
}

/**
 * F02 (docs/PLAN.md 6.2; case 5a): the mother's R2, truncated in transit. The decompressed text
 * stops after the last record's `+` line; the gzip stream stops there too, with no final block
 * and no trailer, so `gzip -t` fails.
 */
function buildF02(file: CaseFastqFile): Snippet {
  const full = fastqFileText(file);
  const lastPlus = full.lastIndexOf("\n+\n") + 3;
  const cut = full.slice(0, lastPlus);
  const header = gzipSync("").subarray(0, 10);
  const body = deflateRawSync(cut, { finishFlush: constants.Z_SYNC_FLUSH });
  return gzipSnippet(file.path, cut, Uint8Array.from([...header, ...body]));
}

describe("F02: the truncated mother's R2", () => {
  const file = CASE_FASTQ_FILES.find((f) => f.path === F02_PATH)!;
  const f02 = buildF02(file);

  test("is built from the stub's records: it ends after the second record's + line", () => {
    expect(file.records).toHaveLength(2);
    expect(f02.decodedText?.split("\n").slice(-3)).toEqual([file.records[1]!.sequence, "+", ""]);
  });

  test("fails with exactly FQ-S06 and CASE-14 (docs/PLAN.md 13 M1)", () => {
    const ds = validateFolder({ [F02_PATH]: f02 });
    expect(ds.map((d) => d.rule).sort()).toEqual(["CASE-14", "FQ-S06"]);
    expect(ds.every((d) => d.file === F02_PATH)).toBe(true);
    expect(ds.find((d) => d.rule === "FQ-S06")?.line).toBe(7);
    expect(verdictOf(ds)).toBe("invalid");
  });

  test("the five intact FASTQ files pass, compressed or not", () => {
    const intact = Object.fromEntries(
      CASE_FASTQ_FILES.filter((f) => f.path !== F02_PATH).map((f) => {
        const text = fastqFileText(f);
        return [f.path, gzipSnippet(f.path, text, gzipSync(text))];
      }),
    );
    expect(validateFolder(intact)).toEqual([]);
    const complete = gzipSnippet(F02_PATH, fastqFileText(file), gzipSync(fastqFileText(file)));
    expect(validateFolder({ [F02_PATH]: complete })).toEqual([]);
  });
});

describe("retired placeholders are gone (docs/PLAN.md 9.4)", () => {
  const RETIRED = ["166012370", "166012738", "166009959", "166013500", "166015900", "LH00417", "SCN1A_e5N"];
  const files = globSync([
    "content/**/*.{md,ts}",
    "src/case/generated/**/*.ts",
    "src/exercises/*.ts",
    "src/quizzes/*.ts",
  ]);

  test("the scan sees the case module", () => {
    expect(files).toContain("src/case/generated/fastq.ts");
  });

  test.each(files)("%s", (file) => {
    const text = readFileSync(file, "utf8");
    // Thousands separators are allowed in prose: 166,012,370 is the same placeholder.
    const plain = text.replace(/(\d),(?=\d{3}\b)/g, "$1");
    // Explicitly labelled toy fixtures may reuse a number; they say "toy" on the same line.
    const hits = RETIRED.filter((r) =>
      plain.split("\n").some((line) => line.includes(r) && !/\btoy\b/i.test(line)),
    );
    expect(hits).toEqual([]);
  });
});
