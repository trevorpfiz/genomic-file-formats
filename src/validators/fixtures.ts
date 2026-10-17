// TEST-ONLY: one failing and one passing fixture per implemented rule (docs/PLAN.md 11.6), taken
// from the research notes' "minimal violation" column and exercise bank (seq 5a-5c, EX-01,
// EX-04, EX-09, EX-10). Each failing input must give exactly `expect`; each passing input must
// give no diagnostic at all. Never import this from a shipped module.
import type { FormatId, HexView, RuleId, Severity } from "../exercises/types.ts";
import { BGZF_EOF, toHex } from "../formats/gzip.ts";
import type { ValidationContext } from "./types.ts";

export interface Expected {
  rule: RuleId;
  line: number;
  col?: number;
  field?: string;
  severity?: Severity;
}

export interface RuleFixture {
  rule: RuleId;
  format: FormatId;
  /** Where the violation comes from. */
  source: string;
  fail: string | HexView;
  expect: Expected[];
  pass: string | HexView;
  ctx?: ValidationContext;
}

export const TOY_FA =
  ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGGAGCT\nCTCCATGCATTTGGTATTTT\n" +
  ">chr1_tel GRCh38 chr1:10001-10036 soft-masked\ntaaccctaaccctaacccta\naccctaaccctaaccc\n";
export const TOY_FAI = "chrM_demo\t60\t38\t20\t21\nchr1_tel\t36\t147\t20\t21\n";

/** seq EX-01: line 3 is 16 bases in a record of 20-base lines. */
export const EX01 =
  ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGG\nAGCTCTCCATGCATTTGGTA\nTTTT\n";
/** seq EX-04: the L04.3 fix-it starter (FA-S01, FA-S03, FA-M01). */
export const EX04 =
  "# reference for case 042\n>chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGGAGCT\n\nCTCCATGCATTTGGTATTTT\n>chrM_demo duplicate copy\nGATCACAGGT\n";
/** seq EX-04's accepted answer with the duplicate renamed. */
export const EX04_FIXED =
  ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGGAGCT\nCTCCATGCATTTGGTATTTT\n>chrM_demo2 duplicate copy\nGATCACAGGT\n";

const TITLE = "@A00123:8:H7KJ2DSXY:2:1101:10004:1000 1:N:0:ACGTACGT+TGCATGCA";
const SEQ = "GATCACAGGTCTATCACCCTATTAACCACTCACGGG";
const QUAL = "FFFFFFFFFFFFFFF:FFFFFFFFFFFFFFF,FFFF";
/** seq 3.3: the valid R1 record. */
export const R1 = `${TITLE}\n${SEQ}\n+\n${QUAL}\n`;
/** seq EX-09 (a), (b), (c). */
export const EX09A = `${TITLE}\n${SEQ}\n+\n${QUAL.slice(0, 35)}\n`;
export const EX09B = `${TITLE}\n${SEQ}\n+A00123:8:H7KJ2DSXY:2:1101:10004:1001 1:N:0:ACGTACGT+TGCATGCA\n${QUAL}\n`;
export const EX09C = `>${TITLE.slice(1)}\n${SEQ}\n+\n${QUAL}\n`;
/** seq EX-10: two wrapped records, valid. */
export const EX10 =
  "@r1\nGATCACAGGTCTATCACC\nCTATTAACCACT\n+\nFFFFFFFFFF:FFFFFFF\n@FFFFFFFFFFF\n@r2\nGATGAGGCAGGAATCAAA\n+\n+FFFFFFFFFFFFFFFFF\n";

export const BGZF_HEAD = "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00";
const hex = (head: string, tail?: string, omittedBytes?: number): HexView => ({
  head,
  ...(tail === undefined ? {} : { tail }),
  ...(omittedBytes === undefined ? {} : { omittedBytes }),
  annotations: [],
});

export const RULE_FIXTURES: readonly RuleFixture[] = [
  // FASTA (seq 5a-5c)
  {
    rule: "FA-S01",
    format: "fasta",
    source: "seq FA-S01: `# my ref` before the first `>`",
    fail: "# my ref\n>chr1\nACGT\n",
    expect: [{ rule: "FA-S01", line: 1, col: 1 }],
    pass: ">chr1\nACGT\n",
  },
  {
    rule: "FA-S02",
    format: "fasta",
    source: "seq EX-01",
    fail: EX01,
    expect: [{ rule: "FA-S02", line: 3, field: "sequence" }],
    pass: TOY_FA,
  },
  {
    rule: "FA-S03",
    format: "fasta",
    source: "seq FA-S03: `ACGT\\n\\nACGT`",
    fail: ">a\nACGT\n\nACGT\n",
    expect: [{ rule: "FA-S03", line: 3 }],
    pass: ">a\nACGT\nACGT\n\n>b\nAC\n",
  },
  {
    rule: "FA-S04",
    format: "fasta",
    source: "seq FA-S04: CR-LF on one line, LF on the next",
    fail: ">a\nACGT\r\nACGT\nAC\n",
    expect: [{ rule: "FA-S04", line: 2, col: 5 }],
    pass: ">a\r\nACGT\r\nACGT\r\nAC\r\n",
  },
  {
    rule: "FA-S05",
    format: "fasta",
    source: "seq FA-S05: a trailing space on a line that is not the last",
    fail: ">a\nACGTACGTAC \nACGTACGTAC\nAC\n",
    expect: [{ rule: "FA-S05", line: 2, col: 11 }],
    pass: ">a\nACGTACGTAC\nACGTACGTAC\nAC\n",
  },
  {
    rule: "FA-S06",
    format: "fasta",
    source: "seq FA-S06: `>` alone on a line",
    fail: ">\nACGT\n",
    expect: [{ rule: "FA-S06", line: 1, field: "name" }],
    pass: ">a\nACGT\n",
  },
  {
    rule: "FA-M01",
    format: "fasta",
    source: "seq FA-M01: two `>chrM_demo` records",
    fail: ">chrM_demo\nGATC\n>chrM_demo\nGATC\n",
    expect: [{ rule: "FA-M01", line: 3, severity: "warning" }],
    pass: ">chrM_demo\nGATC\n>chrM_demo2\nGATC\n",
  },
  {
    rule: "FA-M03",
    format: "fasta",
    source: "seq FA-M03: `>chrUn_empty` followed directly by the next `>`",
    fail: ">chrUn_empty\n>chrM_demo\nGATC\n",
    expect: [{ rule: "FA-M03", line: 1, severity: "warning" }],
    pass: ">chrM_demo\nGATC\n",
  },
  {
    rule: "FA-M06",
    format: "fasta",
    source: "seq FA-M06: `ACGTJ`; a protein record passes (EX-05 item 2)",
    fail: ">a\nACGTJ\n",
    expect: [{ rule: "FA-M06", line: 2, col: 5, severity: "warning" }],
    pass: ">sp|P69905|HBA_HUMAN Hemoglobin subunit alpha\nMVLSPADKTNVKAAWGKVGAHAGEYGAEALERMF\n",
  },
  {
    rule: "FA-C04",
    format: "fasta",
    source: "seq FA-C04: no final newline",
    fail: ">a\nACGT",
    expect: [{ rule: "FA-C04", line: 2, col: 5, severity: "convention" }],
    pass: ">a\nACGT\n",
  },
  // .fai (seq 5a-5b)
  {
    rule: "FAI-S01",
    format: "fai",
    source: "seq FAI-S01: 4 columns",
    fail: "chr1\t248956422\t112\t100\n",
    expect: [{ rule: "FAI-S01", line: 1 }],
    pass: "chr1\t248956422\t112\t100\t101\n",
  },
  {
    rule: "FAI-S02",
    format: "fai",
    source: "seq FAI-S02: `chr1 100 6 60 59`",
    fail: "chr1\t100\t6\t60\t59\n",
    expect: [{ rule: "FAI-S02", line: 1, field: "LINEWIDTH" }],
    pass: "chr1\t100\t6\t60\t61\n",
  },
  {
    rule: "FAI-M01",
    format: "fai",
    source: "seq FAI-M01: OFFSET off by one",
    fail: "chrM_demo\t60\t39\t20\t21\nchr1_tel\t36\t147\t20\t21\n",
    expect: [{ rule: "FAI-M01", line: 1, field: "OFFSET" }],
    pass: TOY_FAI,
    ctx: { companions: { fasta: TOY_FA } },
  },
  {
    rule: "FAI-M02",
    format: "fai",
    source: "seq FAI-M02: rows for `b` then `a`",
    fail: "b\t4\t10\t4\t5\na\t4\t3\t4\t5\n",
    expect: [{ rule: "FAI-M02", line: 2, severity: "convention" }],
    pass: "a\t4\t3\t4\t5\nb\t4\t10\t4\t5\n",
  },
  // FASTQ (seq 5a-5c)
  {
    rule: "FQ-S01",
    format: "fastq",
    source: "seq EX-09 (c)",
    fail: EX09C,
    expect: [{ rule: "FQ-S01", line: 1, col: 1 }],
    pass: R1,
  },
  {
    rule: "FQ-S02",
    format: "fastq",
    source: "seq FQ-S02: `+` line missing",
    fail: "@r1\nACGT\n@r2\nACGT\n+\nFF:F\n",
    expect: [{ rule: "FQ-S02", line: 3 }],
    pass: "@r1\nACGT\n+\nFF:F\n@r2\nACGT\n+\nFF:F\n",
  },
  {
    rule: "FQ-S03",
    format: "fastq",
    source: "seq EX-09 (b)",
    fail: EX09B,
    expect: [{ rule: "FQ-S03", line: 3, field: "separator" }],
    pass: `${TITLE}\n${SEQ}\n+${TITLE.slice(1)}\n${QUAL}\n`,
  },
  {
    rule: "FQ-S04",
    format: "fastq",
    source: "seq EX-09 (a)",
    fail: EX09A,
    expect: [{ rule: "FQ-S04", line: 4, field: "quality" }],
    pass: R1,
  },
  {
    rule: "FQ-S05",
    format: "fastq",
    source: "seq FQ-S05: `II I`",
    fail: "@r1\nACGT\n+\nII I\n",
    expect: [{ rule: "FQ-S05", line: 4, col: 3 }],
    pass: "@r1\nACGT\n+\nII:I\n",
  },
  {
    rule: "FQ-S06",
    format: "fastq",
    source: "seq FQ-S06: the file ends after the `+` line",
    fail: "@r1\nACGT\n+\nFF:F\n@r2\nACGT\n+\n",
    expect: [{ rule: "FQ-S06", line: 7 }],
    pass: "@r1\nACGT\n+\nFF:F\n@r2\nACGT\n+\nFF:F\n",
  },
  {
    rule: "FQ-M01",
    format: "fastq",
    source: "seq FQ-M01, pitfall 10: `IIIIIIII` could be +33 or +64",
    fail: "@r1\nACGTACGT\n+\nIIIIIIII\n",
    expect: [{ rule: "FQ-M01", line: 4, severity: "warning" }],
    pass: "@r1\nACGTACGT\n+\nIIII5III\n",
  },
  {
    rule: "FQ-C01",
    format: "fastq",
    source: "seq FQ-C01; EX-10",
    fail: EX10,
    expect: [{ rule: "FQ-C01", line: 1, severity: "warning" }],
    pass: "@r1\nGATCACAGGTCTATCACCCTATTAACCACT\n+\nFFFFFFFFFF:FFFFFFF@FFFFFFFFFFF\n",
  },
  {
    rule: "FQ-C04",
    format: "fastq",
    source: "seq FQ-C04: a zero-length read after trimming",
    fail: "@r1\n\n+\n\n",
    expect: [{ rule: "FQ-C04", line: 1, severity: "warning" }],
    pass: "@r1\nA\n+\n,\n",
  },
  // gzip and BGZF summaries (seq GZ-S01, GZ-S02)
  {
    rule: "GZ-S01",
    format: "bgzf",
    source: "seq GZ-S01: a gzip-compressed reference (`1f 8b 08 08`)",
    fail: hex("1f 8b 08 08 00 00 00 00 00 03"),
    expect: [{ rule: "GZ-S01", line: 0 }],
    pass: hex(BGZF_HEAD),
  },
  {
    rule: "GZ-S02",
    format: "bgzf",
    source: "seq GZ-S02: a BGZF file with its final 28 bytes cut off",
    fail: hex(
      BGZF_HEAD,
      "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00",
      4000,
    ),
    expect: [{ rule: "GZ-S02", line: 0 }],
    pass: hex(BGZF_HEAD, toHex(BGZF_EOF), 4000),
  },
];
