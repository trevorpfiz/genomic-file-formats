---
kind: lesson
id: fastq-in-the-wild
section: sequences
title: "FASTQ in the wild"
minutes: 9
objectives: [LO1, LO2, LO4]
introduces:
  [
    fastq.wrapped,
    fastq.pairs-in-sync,
    fastq.truncation,
    fastq.structure-rules,
    quality.encoding-detection,
    recognition.first-bytes,
  ]
requires:
  [
    fastq.record,
    quality.phred33,
    fasta.record,
    fai.columns,
    compression.gzip-vs-bgzf,
    coords.zero-based,
    validity.verdicts,
    validity.tools-say,
  ]
caseBeat: "1 · Trio exome · transfers are checked on arrival"
specs:
  [
    "Cock et al. 2010 supplementary README",
    "Biopython 1.88 QualityIO",
    "samtools fqidx 1.24 (samtools-faidx(1))",
    "bwa(1)",
  ]
summary: "Wrapped records, broken files and look-alikes: reading FASTQ the way tools do."
---

Real FASTQ files are messier than the four-line example. A tool must read wrapped records, keep pairs in step, notice a file that stops early and work out the quality encoding.

## When four lines aren't four lines

**Wrapped records.** Most FASTQ files use four lines per record, but wrapping the bases and qualities over several lines is legal. A quality line can even start with `@` or `+`, because both are quality characters: Q31 and Q10. So a parser cannot find records by counting lines or by looking for `@`. It reads bases up to the `+` line, then reads quality characters until there are as many as bases. <!-- src: seq §2, §7 pitfalls 8-9; Cock README -->

:::read-more{title="Parsers in practice"}

- **Interleaved files.** Some pipelines store R1 and R2 alternately in one file. `bwa mem -p` pairs neighbouring reads that share a name; a read whose neighbour has another name is aligned as single-end, without an error.
- **Empty reads.** Trimming can leave reads with no bases. Biopython 1.88 accepts them; samtools fqidx 1.24 rejects them.
- **Lenient parsers.** The classic readfq parser skips junk before the first title, and returns a truncated last record as a read without qualities, with no error.
- **TABs in titles.** `samtools fastq -T` copies SAM tags into the comment, separated by TABs. Tools still take the read ID to end at the first space or TAB.

<!-- src: seq §5 FQ-M03, FQ-C04; §7 pitfall 15; §3.3 (samtools 1.24 test) -->
:::

::predict{exercise="fastq-in-the-wild/how-many-records"}

**Pairs travel together.** Aligners pair reads by position: the first record of R1 with the first record of R2, and so on. Filtering one file alone shifts every later pair. bwa checks the names and stops with `paired reads have different names`, so filter the two files together, in a tool's paired mode. <!-- src: seq §2, EX-12; bwa(1); bwamem_pair.c -->

**Truncation.** A file that ends inside a record is truncated (FQ-S06). Its last record stops early, and a gzipped copy also fails `gzip -t`. samtools reports `File truncated`. Its verdict is Invalid, whatever a lenient tool reads from it. <!-- src: seq §5 FQ-S06; PLAN §8.3 FASTQ row, D-11 -->

:::case-file{step="1"}
The sequencing core checks every transfer on arrival. It runs `gzip -t` on each file and compares the record counts of each R1 and R2 file, because a truncated FASTQ still looks fine at the top. <!-- src: PLAN §5 L07 case beat -->
:::

**Encoding.** Modern files use Phred+33; Illumina files from pipelines 1.3 to 1.7 used Phred+64. Any quality character below `;` (ASCII 59) proves Phred+33, because no 64-offset encoding can produce it. A read of only high characters proves nothing: `IIIIIIII` is Q40 in Phred+33 and Q9 in Phred+64. FastQC and fastp assume Phred+33 unless you tell them otherwise. <!-- src: seq §7 pitfall 10; FQ-M01; found §3.4 -->

## Try it: three broken records

::spot-the-error{exercise="fastq-in-the-wild/three-broken-records"}

Record (b) shows that a tool accepting a file does not make it valid. Biopython enforces the rule that a repeated title must match; samtools fqidx does not. When tools disagree, the rules decide the verdict, and what each tool does is a note beside it. Keep three questions apart: does the file follow its format's rules, does a given tool accept it, and can this analysis use it? <!-- src: seq EX-09, FQ-S03; D-11 -->

## Try it: which file is this?

::sort{exercise="fastq-in-the-wild/which-file-is-this"}

**First-byte cues.** `>` starts FASTA and `@` starts FASTQ, but a SAM header line also starts with `@`, followed by a two-letter code and a TAB. TAB-separated numbers point to an index or an interval file, and the column count tells them apart. The alphabet separates the two FASTA kinds: `E`, `F`, `L`, `P` and `Q` are not nucleotide codes. Compressed bytes hide all of this until you decompress them. <!-- src: seq §6 -->

## Recap

:::recap

- **Parse by length, not by line count.** A record ends when its quality is as long as its bases.
- **Pairs travel together.** Filter R1 and R2 together, or every later pair breaks.
- **A file that ends inside a record is Invalid.** Check transfers with `gzip -t` and record counts.
- **Tools enforce different subsets of the rules.** A file that a tool accepts can still be invalid.

:::

Next: the section quiz on FASTA, FASTQ and their indexes.
