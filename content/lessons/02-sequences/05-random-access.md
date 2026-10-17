---
kind: lesson
id: random-access
section: sequences
title: "Random access: indexes and compression"
minutes: 8
objectives: [LO2, LO3, LO5]
introduces:
  [
    fai.columns,
    fai.byte-offset,
    fai.one-file,
    fai.empty-record,
    compression.gzip-vs-bgzf,
    compression.bgzf-eof,
    compression.virtual-offset,
    compression.gzi,
  ]
requires: [fasta.record, fasta.line-width, coords.zero-based, coords.one-based, validity.verdicts]
caseBeat: "1 · Trio exome · fetching an SCN1A slice by byte arithmetic"
specs:
  [
    "faidx(5) htslib 1.24",
    "samtools-faidx(1) 1.24",
    "bgzip(1) htslib 1.24",
    "SAMv1 v1.6 §4.1, §4.1.2",
    "tabix.tex",
  ]
summary: "How a .fai finds any base by arithmetic, and why only BGZF files can be indexed."
---

## The .fai: five numbers per sequence

A tool that needs 100 bases of chr2 should not read 3 GB to find them. `samtools faidx ref.fa` writes a small text index, `ref.fa.fai`, with one row per sequence. Here are `toy.fa` from the last lesson and its index: <!-- src: seq §1 (.fai purpose), §3.1 -->

::snippet{id="random-access/toy-fa"}

::snippet{id="random-access/toy-fai"}

- **NAME** is the first word of the header.
- **LENGTH** is the number of bases, equal to `LN` in the SAM `@SQ` line.
- **OFFSET** is the byte where the first base starts. The `chrM_demo` header is 37 characters plus a newline, so its first base is byte 38.
- **LINEBASES** is the number of bases on each full line.
- **LINEWIDTH** is the number of bytes on each full line, line terminator included: 21 with LF. <!-- src: faidx(5); seq §3.2 -->

:::read-more{title="Line endings change LINEWIDTH"}

A file with Windows CR-LF line endings can be indexed if every line uses them. Each full line then takes LINEBASES + 2 bytes, so `toy.fa` would get LINEWIDTH 22, and every OFFSET counts the extra `\r` bytes too. The `faidx(5)` manual's own example is `one 66 6 30 32`. Mixed endings within one record cannot be indexed. <!-- src: seq §3.2, §4 (CR-LF [verified: test]), §11 -->

:::

For the base at 0-based position p (the 1-based position minus 1), the byte is: <!-- src: seq §3.2 [verified: test] -->

```text title="Byte of base p"
byte = OFFSET + floor(p / LINEBASES) * LINEWIDTH + (p mod LINEBASES)
```

Full lines before the base, times bytes per line, plus the column: constant line width at work. <!-- src: seq §2 -->

:::watch-out

A `.fai` describes one exact file. Edit the FASTA, even one header, and every later offset points at the wrong bytes. samtools 1.24 does not notice: after a header edit it returned header text as if it were sequence. Rebuild the index after any edit. <!-- src: seq FA-M05, pitfall 4, Q7 [verified: test] -->

:::

## Try it: find the byte

::simulator{exercise="random-access/find-the-byte"}

Not every FASTA that indexes is the FASTA you meant. Predict what samtools writes for a record with a header and no bases. <!-- src: seq FA-M03, EX-03 -->

::predict{exercise="random-access/what-will-the-index-hold"}

:::case-file{step="1"}

To look at _SCN1A_, the analyst pulls chr2:165,984,641-166,149,214 from `Homo_sapiens_assembly38.fasta`. chr2's row gives OFFSET 251,446,211, with 100 bases and 101 bytes per line. So the gene starts at byte 419,090,697 and takes 166,220 bytes, and nothing before it is read. Try Broad chr2 in the calculator above. <!-- src: case §3.4 (SCN1A extent), §3.7 (chr2 .fai row); bytes computed with the faiByte helper -->

:::

## gzip versus BGZF

References and reads are usually stored compressed, but the `.fai` gives an uncompressed byte. Plain gzip writes one continuous stream, so reaching a byte means inflating everything before it. BGZF, written by `bgzip`, compresses blocks of at most 64 KiB one by one, and any gzip reader still decompresses the whole file. Each block starts with the gzip magic `1f 8b` and an extra field tagged `BC`, which plain gzip lacks. <!-- src: found §4.5; seq §6 (BC subfield), GZ-S01; SAMv1 §4.1 -->

::snippet{id="random-access/bgzf-eof-block"}

- **A virtual offset** is `coffset << 16 | uoffset`: where the block starts in the compressed file, then the byte within the inflated block.
- **A `.gzi` index** maps compressed block starts to uncompressed offsets, so `samtools faidx` can turn a `.fai` byte into one block to inflate.
- **The 28-byte EOF block** ends a complete BGZF file. SAMv1 §4.1.2 says it "should be written" and that its absence "should trigger a warning or error". This course presumes a BGZF file without it is truncated, so its verdict is Invalid. Tools say: samtools prints a warning and carries on. <!-- src: SAMv1 §4.1, §4.1.2; seq §1, §3.4, GZ-S02 [verified: test]; PLAN D-11, CASE-14 -->

:::read-more{title="Inside a .gzi"}

A `.gzi` is binary: a count, then one pair of 64-bit numbers (compressed offset, uncompressed offset) for each block after the first. For a 200 kb FASTA, `bgzip --binary` filled every block but the last with exactly 65,280 bytes. Default `bgzip` 1.24 ends each block at a newline instead, so its blocks held 65,225 and 65,270 bytes. Never compute block boundaries as multiples of 65,280. <!-- src: seq §3.4 [verified: test], verification log 7 -->

:::

The same trade-off returns for BED with tabix, for BAM with `.bai` and for VCF with `.tbi`. Random access needs sorted data, block compression and an index built from that exact file. <!-- src: PLAN L05 §3; found §4.5 -->

:::read-more{title="Random access over HTTP"}

This course's chr2 slices were fetched this way. Read chr2's row in the Broad `.fai`, compute the byte of the first base you want, and ask the server for that byte range with an HTTP `Range` header. Strip the newlines and you have the sequence. The dbSNP sites came from a bgzipped VCF in the same way: read its `.tbi`, then fetch only the BGZF blocks it names. <!-- src: case §3.7, §11 -->

:::

:::read-more{title="Optional practice: fetch one base from a compressed FASTA"}

::simulator{exercise="random-access/bgzf-demo"}

:::

::mcq{exercise="random-access/why-bgzip"}

## Recap

:::recap

- **Five numbers find any base.** OFFSET, LINEBASES and LINEWIDTH turn a position into a byte.
- **Rebuild the index after any edit.** A stale `.fai` returns wrong bytes silently.
- **gzip is a scroll; BGZF is bound volumes, and the last volume says "the end".**

:::

:::at-a-glance{format="fai,gzi,bgzf"}

- **Extensions:** `.fai`, `.gzi`; BGZF files keep `.gz`
- **Text or binary:** `.fai` is text; `.gzi` and BGZF are binary
- **Delimiter:** One TAB between `.fai` columns
- **Coordinates:** OFFSET is a 0-based byte offset
- **Header lines:** None
- **Index file:** They are the indexes: `.fai` for FASTA, `.gzi` for a bgzipped file
- **Spec:** `faidx(5)`; `bgzip(1)`; BGZF in SAMv1 §4.1
- **Answers:** "Where in this file is base p?"
- **Keeps:** Byte offsets and line geometry
- **Drops:** The bases themselves; it is valid for one exact file only
- **Next file:** FASTQ

:::

Next: the reads, and how sure the sequencer was of each base.
