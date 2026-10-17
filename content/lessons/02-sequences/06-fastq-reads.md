---
kind: lesson
id: fastq-reads
section: sequences
title: "From molecules to reads: FASTQ"
minutes: 8
objectives: [LO1, LO6]
introduces:
  [
    sequencing.paired-end,
    sequencing.depth,
    sequencing.exome-vs-genome,
    sequencing.read-groups,
    quality.phred,
    quality.phred33,
    quality.expected-errors,
    quality.binning,
    fastq.record,
    fastq.read-id,
  ]
requires: [seq.alphabet, seq.reverse-complement, fasta.record, pipeline.file-questions]
caseBeat: "1 · Trio exome · three blood samples, three FASTQ pairs"
specs:
  [
    "SAMv1 v1.6 §1.2, §1.4",
    "Cock et al. 2010 supplementary README",
    "Biopython 1.88 QualityIO",
    "dada2 issue #791 (binned qualities)",
  ]
summary: "How a sequencer turns DNA into reads, and how FASTQ stores each base with its quality."
---

FASTA answers "Compared with what?" FASTQ answers the next question: what did the sequencer read in each person, and how sure was it?

## How a sequencer turns DNA into reads

**Library and pairs.** The lab breaks each sample's DNA into fragments and attaches adapters. In paired-end sequencing, a short-read instrument reads both ends of each fragment. Read 1 (R1) and read 2 (R2) come from opposite ends and point toward each other; the fragment's whole span is the insert size. <!-- src: found §3.3 -->

**Short and long reads.** Short reads are cheap and accurate per base but cannot span long repeats. Long reads can, and Section 7 uses them. <!-- src: found §3.3; qualitative only until V-10 -->

**Depth.** Mean depth is C = N·L/G: reads times read length, divided by the size of what was sequenced. Breadth is the share of that region covered at some minimum depth. <!-- src: found §3.3 -->

**Exome or genome.** An exome captures the coding exons, about 30 to 45 Mb or 1-2% of the genome, and is usually sequenced deeper. <!-- src: found §3.3 -->

**Multiplexing.** Several samples share a run. Index reads tell them apart, and read groups keep each sample's reads separate up to the variant calls. <!-- src: found §3.3 -->

::predict{exercise="fastq-reads/genome-or-exome"}

:::case-file{step="1"}
The lab draws blood from Noa and both parents. Each exome arrives as two files of 2×150 read pairs, such as `P042-proband_S1_L001_R1_001.fastq.gz` and its `_R2_` mate. Mean target depths are 116× for Noa, 121× for her mother and 63× for her father. Off-target reads and duplicates do not count, so these sit far below the raw 450× that about 60 M pairs give. The father's library yielded about half as many pairs (about 32 M, illustrative), which lab QC flagged; that explains his lower depth. <!-- src: case §3.2, §3.5; PLAN §9.2, §9.5 -->
:::

## Try it: quality as probability

::simulator{exercise="fastq-reads/quality-as-probability"}

**Phred+33.** A quality score is Q = −10·log10(P), where P is the chance that the base call is wrong. FASTQ writes Q as the character with ASCII code Q + 33, the same encoding as SAM's QUAL. <!-- src: SAMv1 §1.2, §1.4; found §3.4 -->

| Q   | P(error) | Accuracy | Character |
| --- | -------- | -------- | --------- |
| 2   | 0.63     | 37%      | `#`       |
| 10  | 0.1      | 90%      | `+`       |
| 20  | 0.01     | 99%      | `5`       |
| 30  | 0.001    | 99.9%    | `?`       |
| 40  | 0.0001   | 99.99%   | `I`       |

<!-- src: found §3.4 Phred table (verified) -->

**Never average Q values.** Half Q10 and half Q30 bases average Q20, but their mean error probability is 0.0505, about Q13. Convert to P first; the sum of P is the read's expected number of errors. <!-- src: found EX-06, §3.4 -->

**Binned qualities.** Many instruments write only a few distinct values. Noa's files use four: `#`, `,`, `:` and `F`, which are Q2, Q11, Q25 and Q37. Infer binning from the number of distinct characters, never from a fixed list. <!-- src: D-18; found §3.4 correction 7 -->

::::read-more{title="Why 33, and older encodings"}
ASCII 33 (`!`) is the first printable character after the space, so Phred+33 runs from Q0 (`!`) to Q93 (`~`). Early Solexa files used odds-based scores, −10·log10(P/(1−P)), which can be negative, written with offset 64. Illumina pipelines 1.3 to 1.7 wrote Phred+64; since CASAVA 1.8, Illumina writes Phred+33. A Phred+64 file read as Phred+33 shows implausible scores such as Q71. <!-- src: seq §11, EX-08; found §3.4; Biopython 1.88 QualityIO -->

PacBio's ccs software, which makes HiFi reads, limits base qualities to Q0 to Q93, so its highest character is `~`, the top of the Phred+33 range. Since ccs 7.0 (SMRT Link 12.0), it bins qualities into seven values and writes every value from Q40 to Q93 as Q40 (`I`), so current HiFi files contain no `~`. <!-- src: V-08 verified 2026-10-17: PacBio unanimity 6f11a13 src/main/ccs.cpp L100 (QV clamped to 0..93, written as QV+33); pbcopper QualityValue (MAX = 93); PacificBiosciences/ccs docs faq/qv-binning (top bin [40, 93] written as Q40) and changelog 7.0.0 (SMRT Link 12.0) -->
::::

## Anatomy of a FASTQ record

A record has four parts, usually one line each: a title starting with `@`, the bases, a separator starting with `+`, and the qualities, exactly one character per base. The title's first word is the read ID; a comment may follow after a space. After alignment, the read ID becomes the SAM QNAME and the qualities become QUAL. <!-- src: seq §3.3; SAMv1 §1.4 -->

:::read-more{title="Long-read titles"}
Long-read titles carry other metadata. Oxford Nanopore titles hold key=value pairs after the read ID, as in `@03dd2268-... runid=... read=252 ch=179 start_time=2019-12-08T11:54:28Z`. Tools still take the first word as the read ID. <!-- src: seq §3.3 (Galaxy training FAQ, verified) -->
:::

::field-explorer{exercise="fastq-reads/read-pair-titles"}

::snippet{id="fastq-reads/noa-first-read"}

## Recap

:::recap

- **Q is a probability on a log scale.** Q30 means a 1-in-1,000 chance that the base call is wrong.
- **Sum probabilities, not Q values.** A read's expected errors are the sum of P over its bases.
- **One quality character per base.** The qualities are exactly as long as the bases.
- **Depth is reads times length over size.** C = N·L/G tells an exome from a genome.

:::

:::at-a-glance{format="fastq"}

- **Extensions:** `.fastq`, `.fq`, usually gzipped (`_R1_001.fastq.gz`)
- **Text or binary:** Text
- **Delimiter:** None; usually four lines per record
- **Coordinates:** None; reads have no position yet
- **Header lines:** None; each record starts with `@`
- **Index file:** `.fai` (`samtools fqidx`): the five FASTA columns plus QUALOFFSET
- **Spec:** No formal spec; Cock et al. 2010
- **Answers:** "What did the sequencer read, and how sure was it?"
- **Keeps:** Bases, per-base qualities and read IDs
- **Drops:** Where each read belongs
- **Next file:** SAM or BAM

:::

Next: [when FASTQ files misbehave](#/lesson/fastq-in-the-wild).
