---
kind: lesson
id: fasta-reference
section: sequences
title: "FASTA: the reference everyone is compared against"
minutes: 9
objectives: [LO1, LO2, LO7]
introduces:
  [
    fasta.record,
    fasta.header-metadata,
    fasta.line-width,
    fasta.soft-masking,
    fasta.structure-rules,
    ref.analysis-set,
  ]
requires:
  [seq.alphabet, validity.severities, validity.verdicts, ref.contig-names, ref.md5, pipeline.file-questions]
caseBeat: "1 · Trio exome · the reference"
specs: ["faidx(5) htslib 1.24", "samtools-faidx(1) 1.24", "SAMv1 v1.6 §1.2.1, §1.3, §1.3.2, Appendix A"]
summary: "The reference genome as a labelled string: headers, line widths and what makes a FASTA indexable."
---

## The reference: a labelled string

::pipeline-map{highlight="fasta,fastq"}

Which question is still open, and which file answers it? Every finding in the case will be a difference, and a difference needs a baseline: compared with what? A variant such as chr2:166,041,354 A>G means something only against one exact reference sequence. That reference is a FASTA file. The reads compared against it arrive as FASTQ, later in this section. <!-- src: PLAN 5 L04.0; seq §1 ("Compared with what?"); case §3.4 (rs6432860, chr2:166,041,354 A>G) -->

A FASTA file is a labelled string. A header line starts with `>`, and the lines after it, up to the next `>`, hold the sequence. Tools take the first word of the header as the sequence's **name** and ignore the rest, the **description**. <!-- src: seq §2, §3.1 -->

::snippet{id="fasta-reference/toy-fa"}

Within a record, every sequence line has the same width, and only the last line may be shorter. That constant width lets a program compute where any base sits instead of reading up to it: the next lesson's subject. Lowercase bases, as in `chr1_tel`, are soft-masked. They are the same bases, flagged as repeats, and never a sign of low quality. <!-- src: seq §2, §3.1 (UCSC soft-masked chr1:10001-10036), FA-S02, FA-C03, pitfall 5 -->

FASTA has no formal specification. The working rules come from htslib's `faidx(5)` manual page, which defines what an indexable FASTA file is. <!-- src: seq intro; faidx(5) -->

The lab's reference is the Broad GRCh38 analysis set, `Homo_sapiens_assembly38.fasta`, with 3,366 sequences. Besides the 25 primary chromosomes it holds alternate (ALT) contigs, decoys, the Epstein-Barr virus genome and HLA alleles. Decoys and the virus catch reads that truly come from them. Without them, those reads would mis-map onto the chromosomes and look like variants. <!-- src: seq §10 [verified: GRCh38] -->

:::read-more{title="What else is in the analysis set"}

- **Counts.** 25 primary sequences (chr1-22, X, Y and M), 42 unlocalized `_random` contigs, 127 unplaced `chrUn_` contigs, 261 `_alt` haplotypes, `chrEBV`, 2,385 decoys and 525 HLA alleles: 3,217,346,917 bases in all. <!-- src: seq §10, verification log 22 -->
- **Gaps.** chr1 begins with 10,000 `N`s. `N` is an unknown base, and the run stands for a gap before the telomere repeat. <!-- src: seq §10, pitfall 6 -->
- **Copies differ.** GRCh38 chr1 holds two IUPAC ambiguity codes, `M` at 248,752,514 and `R` at 248,755,122. The Broad copy keeps them; the iGenomes UCSC hg38 copy has `N` there. So the two chr1 `M5` digests differ, although soft-masking and re-wrapping never change an `M5`. <!-- src: seq pitfall 5, verification log 1 -->

:::

::field-explorer{exercise="fasta-reference/broad-chr1-header"}

:::case-file{step="1"}

The lab aligns all three exomes to `Homo_sapiens_assembly38.fasta`. Its chr2 is 242,193,529 bases long, with `M5:f98db672eb0993dcfdabafe2a882905c`. This course shows short slices of chr2, named like `chr2:165980001-166380000`. To any tool that matches `@SQ` names, such a slice is a different sequence from `chr2`. <!-- src: case §3.4 (chr2 length and M5), §4 (slice names) -->

:::

## Try it: why won't this index?

::spot-the-error{exercise="fasta-reference/why-wont-this-index"}

Line width is not the only structural rule. A FASTA file starts with a `>` header line, and a record's sequence contains no blank lines. Break either rule and samtools refuses to index the file. A repeated name earns only a warning: samtools keeps the first record and ignores the second, so a lookup can silently use the wrong one. Once the names reach a SAM header, repeats are forbidden outright. <!-- src: seq FA-S01, FA-S03, FA-M01 [verified: test]; SAMv1 §1.3 -->

:::read-more{title="Protein FASTA, comments and unusual names"}

- **Protein FASTA.** Letters such as `E`, `F`, `I`, `L`, `P` and `Q` are not nucleotide codes, so they mark a protein sequence. Protein files also use `*` and `X`. <!-- src: seq §6, FA-M06 -->
- **Pearson comments.** Old files may start with `;` comment lines. Biopython reads them only in its `fasta-pearson` mode, and samtools 1.24 stops with a format error at a comment line before the first `>`. <!-- src: seq §6, FA-S01 [verified: test] -->
- **Names with `*`, `:` and `|`.** SAM reference names may contain these characters, so NCBI-style names and HLA alleles such as `HLA-DRB1*15:03:01:01` are legal. A region string like `HLA-DRB1*15:03:01:01:1-100` is then hard to split. SAMv1 Appendix A lets tools wrap the name in braces: `{HLA-DRB1*15:03:01:01}:1-100`. <!-- src: seq FA-M02, §10, §11; found §11 (Appendix A) -->

:::

::fix-it{exercise="fasta-reference/make-it-indexable"}

## Recap

:::recap

- **The name is the first word.** Tools ignore the description; `@SQ`, VCF and BED lines refer to the name.
- **Constant line width makes random access possible.** Only a record's last line may be shorter.
- **Lowercase means masked, not wrong.** Soft-masked bases are the same bases, flagged as repeats.

:::

:::at-a-glance{format="fasta"}

- **Extensions:** `.fa`, `.fasta`, `.fna`; compressed `.fa.gz`
- **Text or binary:** Text
- **Delimiter:** None; the name ends at the header's first space or TAB
- **Coordinates:** None stored; a base's position is its rank, and samtools region strings are 1-based
- **Header lines:** One `>` line per record
- **Index file:** `.fai`, plus `.gzi` when bgzipped
- **Spec:** No formal spec; `faidx(5)` defines an indexable FASTA
- **Answers:** "Compared with what?"
- **Keeps:** One strand's bases, with names
- **Drops:** Qualities, and anything about a sample
- **Next file:** FASTQ, then the `.fai`

:::

Next: finding one base in 3 GB without reading the rest.
