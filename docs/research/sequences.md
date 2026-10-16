# Research: FASTA, FASTQ, .fai and .gzi

Research notes for the "Genomic File Formats" course, covering the FASTA and FASTQ lessons. Written 2026-10-16.

**How to read the evidence tags**

- **[verified: test]**: I ran the snippet through samtools/htslib 1.24 (via pysam 0.24.1) or Biopython 1.88 in a scratch environment on 2026-10-16. The tool output is quoted.
- **[verified: GRCh38]**: I read it from real GRCh38 index files, or fetched it by HTTP byte-range from the real FASTA files (see Sources).
- **[from memory - verify]**: the claim relies on my memory because the primary source could not be reached. Check it before the claim ships.
- **[verified: source]**: read directly in the tool's source code (added during fact-checking; see the Verification log).

There is **no formal FASTA specification** and **no standards-body FASTQ specification**. The de facto rules come from three places:

- the htslib `faidx(5)` man page, which defines what an indexable FASTA or FASTQ file is;
- Cock et al. 2010 (NAR 38(6):1767-1771), which describes FASTQ;
- the parsers themselves.

The validity rules below cite whichever of these each rule comes from.

---

## 1. Purpose and place in the pipeline

**FASTA** holds named sequences with nothing else attached.

- **Producers:** genome assemblers and consortia. The Genome Reference Consortium produces GRCh38, which NCBI, UCSC, Ensembl and the Broad redistribute. Other producers are transcript and protein databases, primer and adapter lists, and de novo assemblies.
- **Consumers:**
  - aligner indexers (`bwa index`, `minimap2 -d`);
  - variant callers, which need random access through the `.fai`;
  - CRAM encoders and decoders, which need the exact same sequence, matched by MD5;
  - genome browsers;
  - `bedtools getfasta` and `samtools faidx`, which pull out region sequence.
- **Disease question it answers:** "Compared with what?" A variant name such as chr2:g.N A>G only has meaning against one specific reference FASTA. Every coordinate in the rest of the course (BED, SAM, WIG, VCF, GTF, BEDPE, PAF) points into this file.

**FASTQ** holds reads: each sequence comes with a per-base confidence and a read name.

- **Producers:** instrument basecalling plus demultiplexing. Examples are Illumina BCL Convert or bcl2fastq, the Oxford Nanopore basecallers, PacBio tools, and `samtools fastq` for round trips.
- **Consumers:** QC (FastQC), trimming (fastp, cutadapt), aligners (`bwa mem`, `minimap2`) and `samtools import`, which converts reads to unmapped BAM or CRAM.
- **Disease question it answers:** "What did the sequencer actually observe in this child and each parent, and how sure was it?" FASTQ is the rawest evidence the analysis keeps. Base qualities flow into BAM `QUAL` and then into genotype likelihoods.

**.fai** is a small text index. It lets a program jump straight to chr2:166,000,000 in a 3 GB FASTA without reading the bytes before it.

**.gzi** is a binary index for a BGZF-compressed (bgzipped) FASTA or FASTQ. It maps compressed byte offsets to uncompressed byte offsets, so the `.fai` arithmetic still works on a compressed file.

## 2. Mental model

**FASTA is a labeled string.** A line starting with `>` gives the label, and the lines after it, up to the next `>`, are the string.

Wrapping the sequence into short lines is a historical habit from terminals and email. NCBI still recommends lines under 80 characters (from an NCBI BLAST help-page snippet seen via WebSearch; the page itself was unreachable). Wrapping turned out to be useful: if every line of a sequence has the same width, a program can compute where base *n* sits instead of reading the file up to it.

**Analogy: the typeset book.** Suppose every page of a book has the same number of characters per line. To find character 1,234,567 of chapter 2 you only need three numbers: where chapter 2 starts, how many letters fit on a line, and how many bytes a printed line takes including the line break. The `.fai` stores exactly those three numbers for each sequence: OFFSET, LINEBASES and LINEWIDTH.

One short line in the middle breaks the arithmetic for everything after it. That is why `samtools faidx` refuses such a file rather than guessing.

**FASTQ is FASTA plus a confidence track.** The design problem was to carry a quality score for every base, aligned one-to-one with the bases, in plain text, as compactly as possible. The solution is one printable ASCII character per base, where the character's code is Q + 33 and Q = -10·log10(P(error)).

- Q30 means a 1-in-1,000 chance that the base call is wrong.
- `?` is ASCII 63, so `?` encodes Q30.
- `I` is ASCII 73, so `I` encodes Q40.

**Analogy: a transcript of a noisy phone call.** The transcriber writes a confidence mark under every letter. The two lines must have the same length, or the marks slide out of register with the letters.

**Why FASTQ looks the way it does**

- Quality characters can include `@`, `+` and `>`, so the quality line cannot announce where the next record starts.
- The `+` line marks where the sequence ends and the quality begins.
- The rule "quality length equals sequence length" is what really ends a record. This is why naive parsers that split on `@` or count lines fail on multi-line FASTQ.

**Paired reads are two ends of one DNA fragment.** In R1/R2 files the only link between the two ends is their position: the i-th record of R1 pairs with the i-th record of R2 (bwa man page, verified). The names act as a cross-check. Anything that filters or reorders one file without the other breaks every pair after that point.

## 3. Anatomy

### 3.1 FASTA: annotated minimal valid example

The example below is `toy.fa`. It is real GRCh38 sequence: the first 60 bp of chrM (the rCRS) and chr1:10001-10036 in UCSC soft-masked form. [verified: GRCh38]

```
>chrM_demo first 60 bp of GRCh38 chrM
GATCACAGGTCTATCACCCT
ATTAACCACTCACGGGAGCT
CTCCATGCATTTGGTATTTT
>chr1_tel GRCh38 chr1:10001-10036 soft-masked
taaccctaaccctaacccta
accctaaccctaaccc
```

| Part | Meaning |
|---|---|
| `>` in column 1 | Starts a record (the "defline" or header). |
| `chrM_demo` | **Name**: everything up to the first whitespace. Tools use this as the ID: the `.fai` NAME column, SAM `@SQ SN`, VCF `CHROM` and BED `chrom` all refer to it. |
| ` first 60 bp of GRCh38 chrM` | **Description**: free text after the first whitespace. Tools ignore it. |
| Sequence lines | Bases. All lines are 20 bases wide except the last line of each record, which may be shorter. |
| Lowercase `taaccc...` | **Soft-masked**: same bases, flagged as repeat or low-complexity sequence. The telomeric repeat is lowercase in UCSC hg38 and uppercase in the Broad/NCBI copies. [verified: GRCh38] |

Its index `toy.fa.fai`, produced by samtools 1.24 [verified: test]. The columns are separated by single TAB characters:

```
chrM_demo	60	38	20	21
chr1_tel	36	147	20	21
```

### 3.2 The five .fai columns (six for FASTQ)

From `faidx(5)`:

| # | Column | Meaning | In the example |
|---|---|---|---|
| 1 | NAME | First word of the header | `chrM_demo` |
| 2 | LENGTH | Total bases. Equals SAM `@SQ LN`. | 60 |
| 3 | OFFSET | 0-based byte offset of the first base, which is the byte after the header line's newline | 38: the header is 37 characters plus a newline |
| 4 | LINEBASES | Bases per full line | 20 |
| 5 | LINEWIDTH | Bytes per full line, including the line terminator | 21 with LF, 22 with CR-LF |
| 6 | QUALOFFSET | FASTQ only: byte offset of the first quality character | n/a |

**Random-access formula.** For the base at 0-based position p:

```
byte = OFFSET + floor(p / LINEBASES) * LINEWIDTH + (p mod LINEBASES)
```

For `chrM_demo`, base 45 (1-based) gives 38 + 2·21 + 4 = byte 84, which holds `A`. [verified: test]

The second record's OFFSET checks out by hand: 38 + 3·21 = 101 bytes of record 1, plus a 46-byte header, gives 147.

### 3.3 FASTQ: annotated minimal valid example (one read pair)

The fragment is chrM:1-150.

- R1 reads the first 36 bases forward.
- R2 reads chrM:115-150 as its reverse complement, which is typical of Illumina paired-end reads.

In Illumina headers the name and comment are separated by a **single space**. Sequence and quality lines never contain spaces or tabs (Cock README test files `error_spaces`, `error_tabs`). A header *can* contain TABs, though: `samtools fastq -T` writes copied SAM tags into the comment TAB-separated (`@r1<TAB>RG:Z:x<TAB>BC:Z:ACGT`) [verified: test, samtools 1.24]. Every tool still takes the read ID to be the text up to the first space or TAB.

`R1` (file `P042_S1_L001_R1_001.fastq.gz`):

```
@A00123:8:H7KJ2DSXY:2:1101:10004:1000 1:N:0:ACGTACGT+TGCATGCA
GATCACAGGTCTATCACCCTATTAACCACTCACGGG
+
FFFFFFFFFFFFFFF:FFFFFFFFFFFFFFF,FFFF
```

`R2` (file `P042_S1_L001_R2_001.fastq.gz`):

```
@A00123:8:H7KJ2DSXY:2:1101:10004:1000 2:N:0:ACGTACGT+TGCATGCA
GATGAGGCAGGAATCAAAGACAGATACTGCGACATA
+
FFFFF:FFFFFFFFFFFFFFFFFF:FFFF,FFF::F
```

| Line | Rule |
|---|---|
| 1 `@...` | `@` followed by the title. Read ID = first word; the rest is a comment. |
| 2 | Bases (IUPAC letters, usually ACGTN). 36 here. |
| 3 `+` | Separator. It may repeat the title, which must then be identical; it is usually bare. |
| 4 | One quality character per base, so exactly 36 here. In Phred+33, `F` = Q37, `:` = Q25, `,` = Q11. |

Biopython decodes R1 to Q37 everywhere except Q25 at base 16 and Q11 at base 32. The expected number of errors in the read, ΣP, is 0.089. [verified: test]

The quality alphabet here (`F`, `:`, `,`, and `#` for very low quality, i.e. Q37, Q25, Q11, Q2) is typical of binned-quality NovaSeq 6000 output. [from memory - verify which instruments bin, and to which values. WebSearch snippets (a user blog and a QIIME2 forum thread; Illumina pages unreachable) report NovaSeq 6000 FASTQ containing only `,` `:` `F` (Q11/Q25/Q37) plus `#` (Q2), while an Illumina technical note lists the bins as Q2/Q12/Q23/Q37. NovaSeq X uses a different, three-level binning. Note that `case.md` gives the trio's headers as `@LH00417:...` (NovaSeq X style), so harmonise the instrument and quality alphabet across notes.]

**Illumina read-name fields (CASAVA 1.8+ and BCL Convert style).** The layout below comes from an Illumina BaseSpace help-page snippet seen via WebSearch; the page itself was unreachable. Field meanings are [from memory - verify] unless noted.

```
@<instrument>:<run>:<flowcell>:<lane>:<tile>:<x>:<y>[:<UMI>] <read>:<is_filtered>:<control>:<index>
```

| Field | Example | Meaning |
|---|---|---|
| instrument | `A00123` | Instrument serial. This one is fictional. |
| run | `8` | Run counter on that instrument |
| flowcell | `H7KJ2DSXY` | Flow cell ID |
| lane | `2` | Lane |
| tile | `1101` | Tile. On patterned flow cells it encodes surface, swath and tile [from memory - verify] |
| x, y | `10004:1000` | Cluster coordinates on the tile. Duplicate markers use them to spot *optical* duplicates. |
| UMI (optional) | | 8th colon field, present when UMIs are configured (from the WebSearch snippet) |
| read | `1` / `2` | Mate number (R1 or R2) |
| is_filtered | `N` | `Y` if the read *failed* the chastity/purity filter, `N` otherwise (Illumina doc snippet via WebSearch). htslib agrees: when parsing CASAVA comments it sets the SAM `QCFAIL` flag (0x200) exactly when this field is `Y` (`sam.c`; `samtools import -i`) [verified: source]. Default demultiplexing writes only passing reads, so `N` is the usual value [from memory - verify]. |
| control | `0` | 0 when no control bits are set, otherwise an even number. WebSearch snippets attribute this wording to Illumina's own BaseSpace "FASTQ files" help page (which adds that HiSeq X does not perform control specification, so the value is always 0 there); the page itself was unreachable [snippet only - verify]. |
| index | `ACGTACGT+TGCATGCA` | Index (barcode) read sequence(s). Dual indexes are joined by `+`. Some Illumina docs say a sample number is written here and the index sequence only in Undetermined files (from the WebSearch snippet). |

**Older read-name formats** [from memory - verify]:

- Pre-1.8 Illumina: `@HWUSI-EAS100R:6:73:941:1973#0/1`. The fields are instrument, lane, tile, x and y; `#0` is the index and `/1` is the mate number.
- SRA dumps: `@SRR001666.1 <original name> length=36`.

**Nanopore headers** carry key=value metadata, for example `@03dd2268-... runid=... read=252 ch=179 start_time=2019-12-08T11:54:28Z` (Galaxy training FAQ, verified).

### 3.4 .gzi layout

A `.gzi` file is binary and little-endian, and contains no text (from htslib `bgzf.c`, `bgzf_index_dump_hfile`):

1. a uint64 count *n*;
2. *n* pairs of uint64 values (compressed offset, uncompressed offset), one pair per BGZF block start after the first block. The first block is implicitly at (0, 0).

For a bgzipped 200 kb FASTA, `.gzi` held 3 entries. The uncompressed offsets depend on the compressor [verified: test, htslib 1.24 `bgzip` built from the release tarball, plus pysam 0.24.1]:

- `bgzip --binary`, or pysam's `tabix_compress`: (20658, 65280), (41263, 130560), (61963, 195840). Every block except the last holds exactly 65,280 (0xFF00) uncompressed bytes. The format itself is also documented in bgzip(1), section "GZI FORMAT".
- `bgzip` 1.24 with default settings: (20642, 65225), (41248, 130495), (61931, 195765). Since htslib 1.16, bgzip ends each block on a newline when the input is text (bgzip(1), `--binary`), so blocks hold slightly fewer, unequal byte counts. Here 65,225 = 16-byte header + 1,069 full 61-byte lines.

Teach the layout, not a fixed block size: never compute block boundaries as multiples of 65,280.

The `.fai` of a bgzipped file still uses **uncompressed** offsets: `chrZ 200000 16 60 61`. Lookup works in two steps: the `.fai` arithmetic gives an uncompressed offset, then the `.gzi` gives the block to decompress.

## 4. Coordinate system and conventions

- **No coordinates are stored in the file.** A base's position is its rank in the sequence.
  - Region strings for `samtools faidx` are **1-based and closed**. `chrZ:100-110` returns 11 bases, the same as the 0-based half-open Python slice `[99:110]`. [verified: test]
  - The `.fai` byte arithmetic uses 0-based positions.
  - This is the course's first meeting with the 1-based versus 0-based distinction. BED is the next.
- **Strand.**
  - A reference FASTA stores one strand, the forward (+) strand of the assembly. The other strand is computed: `samtools faidx -i` returns the reverse complement and appends `/rc` to the name.
  - FASTQ reads are written in the orientation they were sequenced. For a standard Illumina fragment library, R2 is the reverse complement of the fragment's far end (see 3.3).
- **Order.**
  - FASTA record order is meaningful downstream. It becomes the `.fai` order and the `@SQ` order, and sorted BAM and VCF files follow the dictionary order.
  - FASTQ record order within one file is arbitrary, but R1 and R2 must be in the **same** order.
- **Names.**
  - Name = first word after `>`, with leading whitespace skipped (`> chr1` gives `chr1`). [verified: test]
  - The same chromosome has different names in different distributions [from memory - verify]:
    - UCSC: `chr1`
    - Ensembl and the GRC "1" naming: `1`
    - RefSeq: `NC_000001.11`
    - GenBank: `CM000663.2` (this one is verified: it appears in the Broad header as `AC:CM000663.2`)
- **Case.** Lowercase means soft-masked (repeat) bases. Hard masking replaces the bases with `N` and loses them. Aligners generally treat lowercase as ordinary bases [from memory - verify per tool].
- **Line endings.**
  - LF is normal.
  - CR-LF can be indexed if it is consistent; LINEWIDTH is then LINEBASES+2. [verified: test]
  - Mixed line endings within one record cannot be indexed.
- **Compression.**
  - FASTQ is almost always gzip-compressed (`.fastq.gz`, `.fq.gz`). Concatenated gzip members are valid gzip (SAMv1 §4.1 restates RFC 1952), so `cat lane1.fq.gz lane2.fq.gz > all.fq.gz` works.
  - An indexed FASTA must be **bgzipped**, not gzipped. The index files are then `ref.fa.gz.fai` and `ref.fa.gz.gzi`. [verified: test]
- **Index files around a reference** [from memory - verify which tools require which]:
  - `.fai` (htslib)
  - `.gzi` (bgzip)
  - `.dict`, a Picard/GATK sequence dictionary: SAM-style `@SQ` lines with `M5` checksums
  - aligner indexes (`.bwt`, `.sa` and others for bwa; `.mmi` for minimap2)

## 5. Validity rules

Severity labels:

- **error**: the file is invalid or cannot be indexed; tools fail.
- **warning**: tools accept the file, but something is probably wrong.
- **convention**: de facto practice that no rule requires.

"Source" names the document a rule comes from. Where the only "spec" is tool behaviour, the source says so and gives the version.

### 5a. Structural rules

| ID | Rule | Severity | Source | Minimal violation |
|---|---|---|---|---|
| FA-S01 | The first non-blank line starts with `>` (strict form: the first line starts with `>`) | error | faidx(5) "must be a text file of the form"; samtools 1.24 fails with `unexpected "#" at line 1` [verified: test]. Biopython 1.88 `fasta` rejects leading comment lines **and even a leading blank line** ("contains comments at the beginning of the file"), while samtools 1.24 skips leading blank lines; `fasta-pearson` allows `;`/`#` comments and blank lines (legacy) [verified: test]. A validator should treat a leading blank line as a warning. | `# my ref` before the first `>` |
| FA-S02 | Every sequence line in a record has the same length, except that the last line may be shorter | error (for indexing) | faidx(5), FASTA Files section | Line 3 shorter than line 2, then more lines follow |
| FA-S03 | No blank line inside a record's sequence. Blank lines *between* records are tolerated. | error (for indexing) | htslib `faidx.c` (blank line, then `Format error, unexpected "G"`) [verified: test] | `ACGT\n\nACGT` |
| FA-S04 | Line terminators are consistent within a record | error (for indexing) | faidx(5) | `\r\n` on one line, `\n` on the next |
| FA-S05 | No spaces or tabs on sequence lines. Trailing whitespace counts as bytes, so the line widths no longer match. | error (for indexing) | Consequence of FA-S02 [verified: test]. Two htslib 1.24 subtleties [verified: test]: (1) a trailing space on the *final, shorter* line of a record is tolerated and not counted as a base; (2) an *internal* space is worse than an error, because faidx counts only non-space characters as bases (`ACGTA CGTAC` gives LINEBASES 10, LINEWIDTH 12), indexes the file, and then retrieval of `a:1-22` returns shifted sequence containing spaces with no warning. | `ACGTACGTAC ` (trailing space) on a line that is not the last |
| FA-S06 | The header has a non-empty name | error | Implied by faidx(5): NAME = first word. samtools 1.24 *accepts* `>` with nothing after it and writes an index line with an **empty NAME column**. [verified: test] | `>` alone on a line |
| FAI-S01 | `.fai` has 5 TAB-separated columns per line for FASTA, 6 for FASTQ | error | faidx(5). htslib 1.24 rejects 4 columns (`Could not understand FASTA index`), but its loader is lenient otherwise: it splits on any whitespace (a space-separated `.fai` loads) and ignores extra columns [verified: test + `faidx.c` `fai_read`]. The course validator can be stricter than htslib. | 4 columns |
| FAI-S02 | LINEWIDTH ≥ LINEBASES. Normally LINEWIDTH = LINEBASES+1 (LF) or +2 (CR-LF). | error | htslib `faidx.c` (`width ... less than base count`) | `chr1 100 6 60 59` |
| FQ-S01 | Each record starts with a line beginning `@` | error | Cock 2010; Biopython (`should start with '@'`) [verified: test] | `>r1` used as a FASTQ title |
| FQ-S02 | One or more sequence lines, then a line starting `+` | error | Cock 2010; htslib (`expecting '+'`) | `+` line missing |
| FQ-S03 | The `+` line is bare, or repeats the `@` title *exactly* | error per Cock 2010 | Cock 2010 via its first author's Biopython docstring: "If it is repeated, it must be identical". Biopython rejects with `Sequence and quality captions differ`. **samtools fqidx 1.24 accepts it** [verified: test], so tools disagree. | `@r1` ... `+r9` |
| FQ-S04 | Quality length equals sequence length | error | Cock 2010; Galaxy FAQ ("must have the same number of characters as line 2"); Biopython; htslib (`Quality line length too short`) [verified: test] | 36 bases, 35 quality characters |
| FQ-S05 | Quality characters are printable ASCII 33-126 (`!` to `~`), with no spaces, tabs or control characters. Sequence lines likewise contain no spaces or tabs. | error | Cock 2010 supplementary README (`error_qual_space`, `_tab`, `_null` ..., and `error_spaces`/`error_tabs`, which put the whitespace in both the sequence and quality lines); Biopython `InvalidCharError`; samtools fqidx also fails [verified: test] | `II I` |
| FQ-S06 | The file is not truncated: the last record is complete | error | Cock README (`error_trunc_*` files); htslib (`File truncated`) | File ends after the `+` line |
| FQ-S07 (indexed FASTQ only) | Multi-line quality is wrapped at exactly the same widths as the sequence | error (for indexing) | faidx(5), FASTQ Files section | Sequence 18+12, quality 15+15 |
| GZ-S01 | A BGZF file is a series of gzip members, each carrying the `BC` extra subfield | error (for bgzip/faidx) | SAMv1 (v1.6, hts-specs master 510c107) §4.1 | `gzip`-compressed reference: `Cannot index files compressed with gzip, please use bgzip` [verified: test] |
| GZ-S02 | The BGZF file ends with the 28-byte EOF marker block | **warning** | SAMv1 §4.1.2 says the EOF block "**should** be written", not must. With the last 28 bytes removed, samtools faidx 1.24 still indexes and retrieves, printing only `[W::bgzf_read_block] EOF marker is absent. The input may be truncated` [verified: test]. | BGZF file with the final 28 bytes cut off |

### 5b. Semantic and consistency rules

| ID | Rule | Severity | Source | Minimal violation |
|---|---|---|---|---|
| FA-M01 | Sequence names are unique within a file | warning (samtools); error for most pipelines | samtools-faidx(1) 1.24: indexing warns `Ignoring duplicate sequence`, and retrieval returns only the **first** sequence with that name [verified: test]. Once the names reach a SAM/BAM/CRAM header it is a MUST: "The SN tags ... in all @SQ lines must be distinct" (SAMv1 §1.3). | Two `>chrM_demo` records |
| FA-M02 | Reference names obey the SAM reference-name character set: printable ASCII `!`-`~`, none of `` \ , " ` ' ( ) [ ] { } < > `` (the backtick is excluded too), and not starting with `*` or `=` | error once the reference is used for SAM/BAM/CRAM/VCF | SAMv1 v1.6 §1.2.1, regex `[0-9A-Za-z!#$%&+./:;?@^_\|~-][0-9A-Za-z!#$%&*+./:;=?@^_\|~-]*` (pipes escaped for this table). Note that `\|` and `:` *are* allowed (NCBI-style names, HLA alleles). samtools faidx itself indexes such names without complaint [verified: test]. | `>chr1,primary` |
| FA-M03 | Records are non-empty | warning | samtools 1.24 **silently omits** an empty middle record from the `.fai`, but fails with `File truncated` if the empty record is last [verified: test] | `>chrUn_empty` followed directly by the next `>` |
| FA-M04 | Names and lengths agree with every downstream file: BED, VCF `##contig`, BAM `@SQ` | error (pipeline) | `.fai` NAME/LENGTH = `@SQ SN/LN` (faidx(5)) | FASTA uses `chr1`, BED uses `1` |
| FA-M05 | The `.fai` is rebuilt after *any* edit to the FASTA | error (silent!) | Follows from the OFFSET arithmetic. samtools 1.24 used a stale index **without warning** and returned header text as sequence (`first 60 b`) [verified: test]. | Header edited after indexing |
| FA-M06 | Characters are valid IUPAC codes for the alphabet: nucleotide `ACGTURYKMSWBDHVN` and `-`; protein adds `*`, `X` and others | warning | NCBI FASTA description (snippet via WebSearch; page unreachable). For context, SAMv1 §4.2.3 (BAM *read* SEQ encoding) maps only `=ACMGRSVTWYHKDBN` and turns anything else into `N`. faidx counts any printable non-space character (`ACGTJ` indexes as length 5) [verified: test]. Real references do contain non-ACGTN IUPAC codes: GRCh38 chr1 has `M` at 248,752,514 and `R` at 248,755,122 [verified: GRCh38], so do not flag M/R/etc. as errors. | `ACGTJ` |
| FA-M07 | Description metadata, if present, agrees with the sequence (for example `LN:`, `M5:` in Broad-style headers) | warning | Convention of the GRCh38 analysis set headers [verified: GRCh38]; no tool checks it | `LN:16569` on a 60 bp record |
| FAI-M01 | Every row's numbers reproduce the file bytes (OFFSET, LINEBASES, LINEWIDTH, LENGTH) | error (silent) | faidx(5) column definitions. A wrong OFFSET silently returns wrong bases (see FA-M05) [verified: test] | Hand-edited `.fai` with OFFSET off by one |
| FAI-M02 | Rows appear in FASTA file order, so OFFSET increases down the file | convention | faidx(5) says only that rows "**typically**" appear in file order and are "typically sorted" by OFFSET. htslib 1.24 loads and uses an out-of-order `.fai` without complaint [verified: test]. | Rows for `b` then `a` |
| FQ-M01 | Quality encoding matches what the consumer assumes. Modern data are Phred+33; legacy Illumina 1.3-1.7 are Phred+64. | error (silent misinterpretation) | Cock 2010; Biopython docs; fastp needs `-6/--phred64` to read +64 | Phred+64 file read as +33 gives Q71 values |
| FQ-M02 | R1 and R2 files have the same record count, the same order, and matching names (ignoring a trailing `/1` `/2` and the comment) | error | bwa(1): the i-th read of each file forms a pair. bwa strips `/[0-9]` and aborts with `paired reads have different names` (`bwamem_pair.c`). | R2 is missing one record |
| FQ-M03 | Interleaved files alternate R1, R2 with the same name | error | bwa `-p`: "If two adjacent reads have the same name, they are considered to form a read pair"; fastp `--interleaved_in`. Note that with `-p` bwa does not abort on a broken order: reads whose neighbour has a different name are silently aligned as single-end (bwa(1)). | R1, R1, R2, R2 order |
| FQ-M04 | Read IDs are unique within one FASTQ file (a read and its mate in the other file share an ID). To become SAM QNAMEs they must match `[!-?A-~]{1,254}`: at most 254 characters, and no `@` (ASCII 64 is excluded). | warning | SAMv1 v1.6 §1.4 | 300-character read ID |

### 5c. De facto conventions

| ID | Convention | Severity | Source |
|---|---|---|---|
| FA-C01 | Wrap at 60-80 bases. Observed for GRCh38: UCSC 50, NCBI 70, Broad 100 [verified: GRCh38; the "UCSC" and "NCBI" files are the iGenomes `UCSC/hg38` and `NCBI/GRCh38` copies, both 195-sequence no-alt analysis-set style files, not NCBI's own RefSeq/GenBank downloads]. Unwrapped (one line) is also indexable. | convention | NCBI recommends < 80 characters (snippet) |
| FA-C02 | Extensions `.fa` `.fasta` `.fna` (nucleotide) `.faa` (protein) `.ffn` `.frn`; compressed `.fa.gz` | convention | [from memory - verify] |
| FA-C03 | Uppercase, or lowercase meaning soft-masked repeats | convention | UCSC versus Broad GRCh38 [verified: GRCh38] |
| FA-C04 | Final newline present. Its absence is tolerated by samtools [verified: test]. | convention | |
| FQ-C01 | Exactly four lines per record (no wrapping) | convention, but treat violations as a warning | Cock README: the converted files are "standardised not to use line wrapping"; Biopython: "several sources discourage" wrapping |
| FQ-C02 | Bare `+` line, to save space | convention | Cock README |
| FQ-C03 | Illumina naming `Sample_S1_L001_R1_001.fastq.gz`, plus `I1`/`I2` index-read files | convention | [from memory - verify] |
| FQ-C04 | No zero-length reads. Trimming can create them; Biopython accepts them [verified: test], but some downstream tools fail on them, including samtools fqidx 1.24 (`Inlined empty line is not allowed in sequence`) [verified: test]. | convention (warning) | fastp applies length filtering by default (`-l/--length_required`, default 15) |
| FQ-C05 | Phred+33 (Sanger), including Illumina since CASAVA 1.8 | convention | Biopython QualityIO docs |

## 6. Recognition cues

| Cue | FASTA | FASTQ | Look-alikes |
|---|---|---|---|
| First byte | `>` (0x3E); rarely `;` (legacy Pearson comments) | `@` (0x40) | A SAM header also starts with `@`, but as `@HD`/`@SQ` plus a TAB. A `.dict` starts with `@HD`. |
| Line pattern | header, then N sequence lines | 4-line cycle `@`, bases, `+`, qualities | The QUAL format (454) is FASTA-like but holds space-separated integers |
| Alphabet | Nucleotides `ACGTN` (and IUPAC). Protein if `E F I L P Q` appear, since these are not nucleotide codes. | Bases on line 2, punctuation-rich line 4 | `.fai`/BED are TAB-separated numbers |
| Tabs | None in sequence lines (a header description may contain one; it ends the name) | None in sequence or quality lines. Illumina headers use a space; `samtools fastq -T` headers carry TAB-separated SAM tags | `.fai`, BED, SAM and GFA are TAB-delimited on every line |
| Magic bytes when compressed | gzip `1f 8b 08`; BGZF `1f 8b 08 04 ... 06 00 42 43 02 00` (`BC` subfield) [verified: test] | Same | BAM is also BGZF; you have to decompress to tell them apart |
| Extensions | `.fa .fasta .fna .faa .fa.gz` | `.fq .fastq .fq.gz .fastq.gz`, `_R1_`/`_R2_` | `.fai` = index, `.gzi` = binary index |

**Telling a `.fai` from a BED file:**

- `chr1 248956422 112 100 101` has 5 numeric-looking columns.
- Read as BED, it would have start (248,956,422) > end (112), which is impossible.
- Column 5 is always column 4 + 1 (or + 2 for CR-LF).

## 7. Common misconceptions and pitfalls

1. **"Line length doesn't matter in FASTA."** It does for indexing. One short line in the middle makes samtools fail. The reported line number points at the line *after* the short one (`unexpected "A" at line 4`). [verified: test]
2. **"An empty sequence would cause an error."** Not if it is in the middle: samtools silently drops it from the `.fai`, and later lookups for that name fail far from the cause. [verified: test]
3. **"Duplicate names are an error."** samtools only warns, and keeps the first. A pipeline can then silently use the wrong one of two `chrM` records. [verified: test]
4. **"The `.fai` notices when the FASTA changes."** It did not in samtools 1.24: a stale index returned header text as bases, with no error. [verified: test]
5. **"Lowercase means low quality or an error."** In a reference, lowercase means soft-masked repeat. It is the same base, and the MD5 used by SAM/CRAM is computed after uppercasing and stripping whitespace (SAMv1 §1.3.2), so soft-masking or re-wrapping a FASTA leaves every `M5` unchanged. **But do not conclude that UCSC and Broad chr1 are interchangeable:** their `M5`s differ. GRCh38 chr1 contains two IUPAC ambiguity codes, `M` at 248,752,514 and `R` at 248,755,122. The Broad and NCBI analysis-set copies keep them; the UCSC copy has `N` there. So Broad chr1 is `M5:6aef897c3d6ff0c78aff06ac189178dd` and UCSC chr1 (uppercased) is `2648ae1bacce4ec4b6cf337dcae37816` [verified: GRCh38, by hashing both full chr1 sequences and fetching the two positions; the UCSC value also matches that copy's `genome.dict`]. The likely reason is that UCSC's 2bit format stores only ACGTN [from memory - verify].
6. **"`N` is a gap of known length."** `N` is an unknown base. Runs of `N` stand for gaps whose lengths are often estimated. GRCh38 chr1 begins with 10,000 `N`s before the telomere repeat. [verified: GRCh38]
7. **"`chr1` and `1` are the same contig."** To humans they are; to tools they are different strings. Name mismatches between FASTA, BED and VCF are among the most common pipeline failures. The `M5` checksum lets tools tell when two differently-named sequences are the same.
8. **"Every FASTQ record is 4 lines, so `split -l 4` or `wc -l / 4` is safe."** That holds only if nobody wrapped the file. Wrapped FASTQ is legal, and its quality lines can start with `@` or `+`. [verified: test]
9. **"I can find records by searching for lines that start with `@`."** `@` is Q31 in Phred+33, so a quality line can start with it.
10. **"Quality encoding can be detected from one read."** Only sometimes. A single read that contains any character below `;` (ASCII 59) proves Phred+33, because no 64-offset encoding can produce it. But a read like `IIIIIIII` is Q40 in Phred+33 and Q9 in Phred+64, and both are plausible [verified: test], so the absence of low characters proves nothing. Scan thousands of reads and use the platform and date. FastQC's current code assumes Phred+33 unless told otherwise, and warns when the lowest character is ≥ 64. fastp needs `--phred64`.
11. **"Q30 means 30% error."** It means a 1-in-1,000 error probability. Every 10 Q points is a factor of 10.
12. **"R1 and R2 are matched by name."** Most aligners match them by **position** and use the names only as a sanity check. Filtering one file alone shifts every later pair; bwa aborts only if the names differ.
13. **"`.gz` means I can index it."** Plain gzip cannot be indexed; it must be bgzip. [verified: test]
14. **"The comment after the space is part of the read name."** Aligners use the first word as `QNAME` and drop the comment, unless you ask otherwise (bwa `-C` appends it, and then it must be valid SAM tag syntax).
15. **"Lenient parsers validate."** The classic `readfq` silently skips junk before the first header. It also returns a truncated last FASTQ record as a FASTA record with no quality, rather than raising an error.

## 8. Exercise bank

Separators: FASTA and FASTQ snippets contain **no TABs**; the FASTQ header uses one space. `.fai`, BED and SAM-header snippets use **TAB** between columns; this is stated per exercise. Every outcome below was checked with samtools 1.24 or Biopython 1.88 unless marked otherwise.

**EX-01 (spot-the-error: which line makes this FASTA unindexable?)**

```
>chrM_demo first 60 bp of GRCh38 chrM
GATCACAGGTCTATCACCCT
ATTAACCACTCACGGG
AGCTCTCCATGCATTTGGTA
TTTT
```

- **Answer:** line 3. It is 16 bases in the middle of a record whose first line is 20, and only the last line may be shorter. Lines 2 and 4 are 20 bases and line 5 is the (legally shorter) last line, so line 3 is the *only* offending line. The bases are still the first 60 bp of chrM.
- **Explanation:** samtools 1.24 reports `Format error, unexpected "A" at line 4` [verified: test]. faidx treats a short line as the end of the record, so the next sequence line looks like junk. This teaches learners to read error messages one line back.
- **Design note:** an earlier draft used lines of 20/16/24. That has two offenders (a 24-base line is longer than LINEBASES, which samtools reports as `Different line length in sequence 'chrM_demo' at line 4` once line 3 is padded), so it is unsuitable for a single-click exercise.

**EX-02 (simulator: FAI byte calculator)**

The tool shows a `.fai` row (TAB-separated), a position slider and a highlighted byte in a rendered file.

- **Task 1:** using `chrM_demo	60	38	20	21`, where is base 45?
  - **Answer:** byte 84, which holds `A`.
- **Task 2:** same base, three real GRCh38 distributions. The TAB-separated rows are:

```
UCSC   chr1	248956422	6	50	51
NCBI   chr1	248956422	112	70	71
Broad  chr1	248956422	112	100	101
```

- **Question:** where is chr1:10,001 (0-based 10,000)?
- **Answers:**
  - UCSC: 6 + 200·51 = **10206**
  - NCBI: 112 + 142·71 + 60 = **10254**
  - Broad: 112 + 100·101 = **10212**
- All three byte-range fetches return the first base of `TAACCC` (lowercase `t` in UCSC). [verified: GRCh38]
- **Explanation:** the same sequence sits at different bytes, so a `.fai` belongs to *one* file.

**EX-03 (predict: what will the index contain?)**

```
>chr1_tel
taaccctaaccctaacccta
accctaaccctaaccc
>chrUn_empty
>chrM_demo
GATCACAGGTCTATCACCCT
```

- **Predict:** how many `.fai` rows?
- **Answer:** 2. The TAB-separated rows are `chr1_tel	36	10	20	21` and `chrM_demo	20	72	20	21`.
- **Explanation:** `chrUn_empty` is silently omitted, with no warning. If the empty record were last, samtools would fail with `File truncated`. A later `samtools faidx ref.fa chrUn_empty` fails with "not found", far from the cause.

**EX-04 (fix-it: make this reference indexable)**

```
# reference for case 042
>chrM_demo first 60 bp of GRCh38 chrM
GATCACAGGTCTATCACCCT
ATTAACCACTCACGGGAGCT

CTCCATGCATTTGGTATTTT
>chrM_demo duplicate copy
GATCACAGGT
```

- **Validator checks:** FA-S01 (first line), FA-S03 (blank line inside the sequence) and FA-M01 (duplicate name).
- **Accepted answer:** delete line 1, delete the blank line, and delete or rename the second record (for example `>chrM_demo2`).
- **Explanation:** if the duplicate is deleted, the fixed file indexes to the single row `chrM_demo	60	38	20	21`; if it is renamed to `chrM_demo2`, a second row `chrM_demo2	10	128	10	11` follows (TAB-separated) [verified: test]. Fixing only the first two problems gives a file samtools *accepts*, with the warning `Ignoring duplicate sequence "chrM_demo"`. The validator should flag that as a warning-level pass.

**EX-05 (sort: which format is this?)**

Bins: nucleotide FASTA, protein FASTA, FASTQ, `.fai`, SAM header/`.dict`, BED, "invalid / can't tell". In items 3-5, TABs separate the columns.

1. `>chr1_tel GRCh38 chr1:10001-10036 soft-masked` / `taaccctaac...` → nucleotide FASTA. Lowercase is soft-masking.
2. `>sp|P69905|HBA_HUMAN Hemoglobin subunit alpha` / `MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMF` → protein FASTA. `E`, `L`, `P`, `F` are not nucleotide codes. [UniProt ID and the first 34 residues match WebSearch snippets of UniProt/DrugBank P69905; rest.uniprot.org was blocked. The real UniProt header continues `OS=Homo sapiens OX=9606 GN=HBA1 PE=1 SV=2` [from memory - verify].]
3. `@SQ	SN:chr1	LN:248956422	M5:6aef897c3d6ff0c78aff06ac189178dd` → SAM header/`.dict`, not FASTQ: `@` plus a two-letter code plus a TAB.
4. `chr1	248956422	112	100	101` → `.fai`. As BED it would have start > end.
5. `chr1	10000	10036` → BED.
6. `@A00123:8:H7KJ2DSXY:2:1101:10004:1000 1:N:0:ACGTACGT+TGCATGCA` followed by a base line → FASTQ.
7. `>r1` / `ACGT` / `+` / `IIII` → invalid. It is FASTQ-shaped with a FASTA `>`, and both Biopython and samtools reject it.
8. Hex `1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00` → can't tell. It is BGZF, which could hold a FASTA, a FASTQ or a BAM; decompress it to find out.

**EX-06 (field-explorer: Illumina read name)**

Use the R1 and R2 headers from §3.3. Hovering each colon-separated field shows the §3.3 table entry.

- **Follow-up question:** which fields must be identical between R1 and R2?
- **Answer:** everything before the space, and the index. Only the read number differs (`1` versus `2`).

**EX-07 (simulator: Phred converter and expected errors)**

The tool converts a character to Q to P. The learner then types a quality string and sees ΣP.

- **Predict first:** which base dominates the expected errors in `IIII#`?
  - **Answer:** `#`, which is Q2, P = 0.631. The total is 0.6314 expected errors, and four Q40 bases add only 0.0004.
- **Then:** R1 from §3.3 has 0.089 expected errors.
- **Explanation:** quality is logarithmic. A single bad base outweighs many good ones.

**EX-08 (predict, then mcq: which encoding?)**

Each file below was summarised over 10,000 reads.

| File | Lowest char | Highest char | Context |
|---|---|---|---|
| A | `#` (35) | `J` (74) | 150 bp Illumina, 2026 |
| B | `B` (66) | `h` (104) | 75 bp Illumina, 2010; many reads end in runs of `B` |
| C | `+` (43) | `~` (126) | 15 kb reads |

**Answers:**

- **A is Phred+33 for certain.** Any character below `;` (59) is impossible in both 64-offset encodings.
- **B is Phred+64 (Illumina 1.5-1.7).**
  - Read as +33, the values would reach Q71, which is implausible.
  - The trailing `B` runs are the Illumina 1.5+ Q2 "Read Segment Quality Control Indicator" [from memory - verify; WebSearch snippets (FASTQ format pages, an Open Bioinformatics Foundation post) agree that in Illumina 1.5-1.7 output Q0-Q1 are unused and Q2 (`B`) marks a low-quality read tail to exclude downstream; neither Cock 2010 nor the Illumina manual could be opened].
- **C is Phred+33.** The low characters rule out +64. Q93 (`~`) is the Sanger maximum and is plausible for long-read consensus data such as PacBio HiFi [HiFi cap from memory - verify; a Bioconductor support thread found via WebSearch reports PacBio FASTQ reaching Q93 `~`, but no PacBio documentation was reachable].

**Distractor for C:** "the max > `J` means +64". This is wrong; maximum-based heuristics fail on long-read data.

**EX-09 (spot-the-error: three FASTQ records, click the bad line in each)**

(a)

```
@A00123:8:H7KJ2DSXY:2:1101:10004:1000 1:N:0:ACGTACGT+TGCATGCA
GATCACAGGTCTATCACCCTATTAACCACTCACGGG
+
FFFFFFFFFFFFFFF:FFFFFFFFFFFFFFF,FFF
```

- **Answer:** line 4. It has 35 quality characters for 36 bases.
- Biopython reports `Lengths of sequence and quality values differs ... (36 and 35)`; samtools reports `Quality line length too short`.

(b)

```
@A00123:8:H7KJ2DSXY:2:1101:10004:1000 1:N:0:ACGTACGT+TGCATGCA
GATCACAGGTCTATCACCCTATTAACCACTCACGGG
+A00123:8:H7KJ2DSXY:2:1101:10004:1001 1:N:0:ACGTACGT+TGCATGCA
FFFFFFFFFFFFFFF:FFFFFFFFFFFFFFF,FFFF
```

- **Answer:** line 3. The repeated title differs (`1001` versus `1000`); everything else on it, including the comment, matches line 1.
- **Explanation:** Biopython rejects it (`Sequence and quality captions differ.`), but samtools fqidx accepts it [verified: test]. Use this record to show that tools enforce different subsets of the rules.
- **Snippet note:** the `+` line must repeat the **whole** title, comment included. An earlier draft repeated only the read ID (`+A00123:...:1001` with no comment); Biopython rejects even the corrected `+A00123:...:1000` form of that for the missing comment, so it had two violations [verified: test].

(c) The same record as (a), but with full-length quality and a first line starting with `>`.

- **Answer:** line 1. FASTQ titles start with `@`.

**EX-10 (predict: multi-line FASTQ)**

```
@r1
GATCACAGGTCTATCACC
CTATTAACCACT
+
FFFFFFFFFF:FFFFFFF
@FFFFFFFFFFF
@r2
GATGAGGCAGGAATCAAA
+
+FFFFFFFFFFFFFFFFF
```

- **Predict:**
  - How many records are there?
  - How long is r1?
  - What does a "4 lines per record" script see?
- **Answer:**
  - 2 records. r1 has 30 bases with 30 qualities; r2 has 18.
  - Line 6 starts with `@` but is r1's quality (Q31). Line 10 starts with `+` but is r2's quality (Q10).
  - Chunking by 4 lines produces the nonsense records `[@r1, GATC..., CTATT..., +]`, `[FFFF..., @FFFF..., @r2, GATG...]`.
- **Explanation:** Biopython and samtools both parse this correctly by counting quality characters until they match the sequence length (the samtools index is r1 `30 4 18 19 38`, r2 `18 74 18 19 95`).

**EX-11 (fix-it: convert EX-10 to strict 4-line FASTQ)**

The validator enforces FQ-S01 to FQ-S05 plus FQ-C01: four lines per record.

Answer (no TABs):

```
@r1
GATCACAGGTCTATCACCCTATTAACCACT
+
FFFFFFFFFF:FFFFFFF@FFFFFFFFFFF
@r2
GATGAGGCAGGAATCAAA
+
+FFFFFFFFFFFFFFFFF
```

Explanation: the `@` and `+` stay; they are qualities, not delimiters.

**EX-12 (mcq: desynchronised pairs)**

A script removed reads containing `N` from `father_R2.fastq.gz` only. R1 now has one more record than R2. What happens when you run `bwa mem ref.fa father_R1.fq.gz father_R2.fq.gz`?

- (a) bwa skips the unpaired read. *Wrong: bwa does not look for partners; it pairs records by position.*
- (b) bwa aborts with `paired reads have different names` at the first shifted pair. ✔ *Correct: it pairs the i-th record of each file and checks the names after stripping `/1` `/2` (bwa source, `bwamem_pair.c`).*
- (c) Alignment succeeds and every pair after the removed read is mismatched. *This happens only if the names cannot detect the shift, for example after renaming to `read1`, `read2` and so on. It is why names matter.*
- (d) bwa re-sorts R2 by name. *Wrong: no aligner does this.*

The lesson: filter pairs together (fastp and cutadapt paired modes).

**EX-13 (sort: error, warning or convention)**

Bins and answers:

- **Error:**
  - quality shorter than the sequence;
  - 60-base lines followed by a 61-base line inside one record;
  - a `gzip`-compressed reference given to `samtools faidx`;
  - a `.fai` built before the header was edited.
- **Warning:**
  - duplicate sequence names;
  - an empty record in the *middle* of a FASTA (an empty *last* record makes samtools fail with `File truncated`, so do not use that variant here);
  - zero-length reads after trimming (Biopython accepts them; samtools fqidx and some downstream tools reject them, see FQ-C04);
  - a FASTQ that turns out to be Phred+64 in a 2026 delivery (a valid legacy FASTQ variant, but suspicious; it becomes the *error* FQ-M01 once a tool reads it as +33).
- **Convention:**
  - lowercase reference bases;
  - wrapping at 60 versus 80;
  - `+` with or without the repeated title;
  - `_R1_001.fastq.gz` naming.

Explanation for each: see the rule IDs in §5.

**EX-14 (mcq, multi-select: which edits leave a sequence's SAM `M5` unchanged?)**

- (a) Soft-masking repeats to lowercase ✔ *M5 is computed after uppercasing.*
- (b) Re-wrapping from 60 to 100 bases per line ✔ *Whitespace and newlines are stripped before hashing.*
- (c) Renaming `chr1` to `1` ✔ *M5 covers the sequence only, not the name. That is exactly why it can resolve naming mismatches.*
- (d) Converting LF to CR-LF ✔ *The CR is stripped too.*
- (e) Replacing the leading 10,000 `N`s with `A`s ✘ *The bases changed.*

Source: SAMv1 §1.3.2. The spec's own worked example hashes `ACGT ACGT ACGT / acgt acgt acgt / ... 12345 !!!` to `dfabdbb36e239a6da88957841f32b8e4`.

## 9. Quiz bank

**Q1. (single choice)** A reference has chr1 wrapped at 80 bases per line and chrM wrapped at 60. Can `samtools faidx` index it?

- A. No: all lines in the file must be the same width. *Wrong: the width must be constant within a sequence, not across the file (faidx(5)).*
- B. **Yes.** *Each record gets its own LINEBASES and LINEWIDTH.*
- C. Only if chrM is re-wrapped to 80. *Unnecessary, for the same reason as B.*
- D. Only if it is bgzipped. *Compression is unrelated to this.*

**Q2. (single choice)** Using the TAB-separated `.fai` row `chr2	242193529	251446211	100	101` (real GRCh38, Broad), at which byte is chr2:101 (1-based)?

- A. 251446311. *This counts 100 bytes per line and forgets the newline.*
- B. **251446312.** *The 0-based position is 100; floor(100/100)·101 + 0 = 101 bytes past the OFFSET.*
- C. 251446211. *That is chr2:1.*
- D. 251446313. *This is off by one from 1-based thinking.*

**Q3. (single choice)** A Phred+33 quality string `)))))` covers 5 bases. What is the expected number of errors?

- A. **About 0.79.** *`)` is ASCII 41, so Q8 and P ≈ 0.158; five of them sum to about 0.79.*
- B. 0.04. *This treats Q8 as P = 0.008.*
- C. 40. *This sums the Q values.*
- D. 5. *This treats every base as wrong.*

**Q4. (multi-select)** A FASTQ file's lowest quality character across 10,000 reads is `5` and its highest is `J`. Which statements are true?

- **The file must be Phred+33.** ✔ *`5` (53) is below 59, which is impossible for Solexa+64 or Phred+64.*
- **The best base is Q41.** ✔ *`J` is 74 − 33 = 41.*
- The worst base is Q-11. ✘ *That is the Phred+64 reading, which is impossible here.*
- One record alone could not have proved this. ✘ *A single record that contains a character below `;` (59), such as this file's `5`, already proves Phred+33. What one record cannot do is prove the encoding when all of its characters are ≥ 64 (e.g. `IIIIIIII`).*

**Q5. (multi-select)** Header `@A00123:8:H7KJ2DSXY:2:1101:10004:1000 2:Y:0:ACGTACGT+TGCATGCA`. Which statements are true?

- **It is mate 2.** ✔
- **It failed the instrument's filter.** ✔ *`Y` means filtered.*
- It came from lane 1101. ✘ *1101 is the tile; the lane is 2.*
- **The library used dual indexes.** ✔ *Two index sequences joined by `+`.*
- Its SAM QNAME will include `2:Y:0:...`. ✘ *Only the first word becomes the QNAME.*

**Q6. (single choice)** `samtools faidx GRCh38.fa.gz` fails with `Cannot index files compressed with gzip, please use bgzip`. What is the best fix?

- A. `gunzip` and index the plain file. *It works, but you lose the compression; acceptable but not the best.*
- B. **Decompress, recompress with `bgzip`, then index. This produces `.fai` and `.gzi`.** *BGZF blocks allow random access.*
- C. Rename to `.bgz`. *The bytes are unchanged, so the error remains.*
- D. Build the `.gzi` with `gzip -l`. *No such feature exists.*

**Q7. (single choice)** After indexing, a colleague edits a reference header, adding a description. `samtools faidx ref.fa chrM_demo:1-10` now returns `first 60 b`. Why?

- A. The header is now part of the sequence. *Wrong: the FASTA itself is still valid.*
- B. **The `.fai` OFFSET still points at the old byte position, which now falls inside the longer header.** *Rebuild the index after every edit. samtools did not warn. [verified: test]*
- C. Soft-masking changed. *Unrelated.*
- D. Region coordinates are 0-based. *They are 1-based; this is unrelated.*

**Q8. (single choice)** Why can't a FASTQ parser find the next record by looking for a line that starts with `@`?

- A. `@` is not allowed in read names. *Wrong, and irrelevant here.*
- B. **`@` is a legal quality character (Q31 in Phred+33), so a quality line can start with it, especially in wrapped files.** *A safe parser counts quality characters until they reach the sequence length.*
- C. Records start with `>`. *That is FASTA.*
- D. The `+` line always repeats the name. *It is optional.*

**Q9. (single choice)** A trio CRAM was written against the Broad `Homo_sapiens_assembly38.fasta` (uppercase, 100 bases per line). A colleague soft-masked a copy of that same FASTA (repeats in lowercase) and re-wrapped it at 50 bases per line, then re-indexed it. Will the CRAM decode correctly with the colleague's copy?

- A. No: the files differ byte-for-byte. *What CRAM checks is the sequence MD5, not the file bytes.*
- B. **Yes. The M5 checksums are identical because they are computed on uppercased sequence with whitespace removed, and the names are unchanged.** *[verified: test, htslib 1.24 via pysam: a CRAM written against an uppercase 100-column reference decoded with 0 wrong bases using a soft-masked, 50-column copy.]*
- C. Only if both have the same `.fai`. *The `.fai` files necessarily differ; each `.fai` describes its own file.*

*Do not reword this as "UCSC versus Broad": their chr1 M5s differ (pitfall 5). In the same test, swapping one IUPAC `M` for `N` in the reference made htslib refuse to decode the slice: `MD5 checksum reference mismatch at chr1:1-2950 ... Please check the reference given is correct` [verified: test]. CRAMv3 stores an MD5 of the reference span in every slice header, and readers "are expected to check" it (CRAMv3 §8.5 "Slice header block", field `reference md5`; §11 "Reference sequences"). This makes a good follow-up "predict" item for the CRAM lesson.*

## 10. Case-thread hooks

- **Foundations to FASTA: "the reference everyone is compared against".** The lab uses the Broad GRCh38 analysis set `Homo_sapiens_assembly38.fasta` [verified: GRCh38]:
  - **3,366 sequences** totalling 3,217,346,917 bases:
    - 25 primary (chr1-22, X, Y, M);
    - 42 unlocalized `_random`;
    - 127 unplaced `chrUn_` (not counting the decoys, which are also named `chrUn_..._decoy`);
    - 261 `_alt` haplotypes;
    - `chrEBV`;
    - 2,385 `_decoy`;
    - 525 `HLA-*` alleles.
  - Learners open the `.fai` (3,366 lines) and ask why decoys and EBV are present: reads that truly come from them would otherwise mis-map onto chromosomes and create false variants.
  - HLA names such as `HLA-DRB1*15:03:01:01` contain `*` and `:`. This motivates the SAMv1 Appendix A rule for parsing region strings.
  - chr1 starts with 10,000 `N`s. chrM is the rCRS (`AC:J01415.2`, `tp:circular`).
- **The header itself is a teaching artefact:** `>chr1  AC:CM000663.2  gi:568336023  LN:248956422  rl:Chromosome  M5:6aef897c3d6ff0c78aff06ac189178dd  AS:GRCh38`. The name is `chr1`, and the description carries the accession, length and MD5. The separators between `key:value` pairs are two spaces in the real file, not tabs.
- **FASTQ: "three blood samples".** The case folder has `P042-proband`, `P042-mother` and `P042-father`, each with `_S{n}_L001_R1_001.fastq.gz` and `_R2_` files and tens of millions of reads. Learners:
  - dissect one header;
  - confirm Phred+33;
  - compute the expected errors of a read;
  - check that R1 and R2 have the same number of records.
- **Planted problems for the capstone** (fictional):
  1. `mother_R2.fastq.gz` is truncated in transit: the last record ends after `+`, and `gzip -t` fails. This trips FQ-S06 and FQ-M02.
  2. A reference copy has a `.fai` older than an edited header (FA-M05, the silent garbage case).
  3. A `ref.fa.gz` made with plain gzip (GZ-S01).
  4. Optional twist: an archived 2010 Phred+64 FASTQ from a relative's earlier research gene-panel run (FQ-M01). Do not call the relative "affected": the case is built around a *de novo* variant, and an affected relative would point learners toward inheritance instead.
- **Forward links:**
  - The FASTQ first word becomes the SAM `QNAME`, and the qualities become `QUAL`.
  - The x/y fields drive optical-duplicate marking in the BAM lesson.
  - The FASTA `M5` becomes `@SQ M5` and is what CRAM needs to decode in the CRAM lesson.
  - FASTA names must match BED, VCF and GTF contig names in later lessons.
  - The candidate seizure gene (chosen in the GTF lesson; e.g. SCN1A on chr2) is pulled from the FASTA with `samtools faidx` to show the actual exon sequence around the variant. `case.md` records SCN1A as `chr2:165,984,641-166,149,214`, minus strand, MANE Select ENST00000674923.1 [taken from case.md, where it is marked verified against GENCODE v43; Ensembl, UCSC and NCBI were all blocked here, so not re-checked independently]. Because the gene is on the minus strand, `samtools faidx` returns the reverse complement of its coding sequence unless `-i` is used.

## 11. "Read more" candidates

- **Why 33?** ASCII 33 (`!`) is the first printable non-space character. The Sanger range is Q0-93 (`!`-`~`), per the Cock README.
- **Solexa scores.**
  - Q_sol = -10·log10(P/(1-P)) can be negative (-5 to 62, ASCII 59-126).
  - Conversion: Q_phred = 10·log10(10^(Q_sol/10) + 1) (Biopython, by Cock).
  - Above about Q20 the two scales agree.
- **Illumina version history.**
  - Solexa/early Illumina used Solexa+64.
  - Pipelines 1.3-1.7 used Phred+64.
  - 1.5+ used `B` = Q2 as a quality-control indicator [from memory - verify].
  - CASAVA 1.8+ uses Phred+33.
- **Binned qualities** on modern instruments [from memory - verify].
- **CR-LF arithmetic:** LINEWIDTH = LINEBASES + 2, and OFFSET counts the `\r`. This is the faidx(5) worked example: `one 66 6 30 32`.
- **Indexing FASTQ with `samtools fqidx`:** 6 columns. QUALOFFSET is the byte after the `+` line.
- **BGZF internals:**
  - blocks of at most 64 KiB both before and after compression (SAMv1 §4.1); htslib fills at most 65,280 (0xFF00) uncompressed bytes per block, and bgzip ≥ 1.16 ends text blocks early at a newline (§3.4);
  - the `BC` extra subfield storing the block size;
  - the 28-byte EOF block `1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00 03 00 ...`;
  - virtual offsets `coffset<<16|uoffset` (SAMv1 §4.1);
  - since htslib 1.16, bgzip tries to end blocks on newlines for text input (bgzip(1), `--binary` option).
- **The `.gzi` binary layout** (§3.4).
- **SAM reference-name character set** and why `|` (NCBI deflines) and `:` (HLA) are allowed; the region-parsing algorithm (SAMv1 Appendix A).
- **M5 calculation** with the spec's worked example. The `.dict` file. GATK requires a `.dict` next to the FASTA [from memory - verify].
- **Pearson `;` comments and the QUAL format** (Biopython FastaIO and QualityIO docs).
- **Hard versus soft masking.** Ensembl distributes `dna`, `dna_sm` and `dna_rm` variants [from memory - verify].
- **Analysis-set design choices:** decoys, EBV and masked PAR copies on chrY. The PAR masking is confirmed in all three copies used here: chrY:1,000,001 (inside PAR1) is `N` in the Broad, iGenomes NCBI and iGenomes UCSC files [verified: GRCh38]. Also the IUPAC-to-`N` difference between the UCSC and Broad/NCBI copies (pitfall 5).
- **hg19 versus GRCh38 chrM:** GRCh38 uses the rCRS (verified via `AC:J01415.2`). hg19's chrM was a different sequence [from memory - verify].
- **SRA and Nanopore header conventions.**

## 12. Sources

### Read in full, with versions

- `https://raw.githubusercontent.com/samtools/htslib/develop/faidx.5`: faidx(5), "June 2018", htslib develop branch fetched 2026-10-16. The primary rules for indexable FASTA/FASTQ and the 5/6 columns.
- `https://raw.githubusercontent.com/samtools/samtools/develop/doc/samtools-faidx.1`: samtools 1.24, 9 July 2026. Duplicate names, `-i`, `--gzi-idx`.
- `https://raw.githubusercontent.com/samtools/htslib/develop/faidx.c`: the exact error conditions.
- `https://raw.githubusercontent.com/samtools/htslib/develop/bgzf.c`: the `.gzi` layout.
- `https://raw.githubusercontent.com/samtools/htslib/develop/bgzip.1`: htslib 1.24.
- `https://raw.githubusercontent.com/samtools/hts-specs/master/SAMv1.tex`: SAM v1.6, hts-specs master commit 510c107. Sections used: §1.2.1 (character set), §1.3.2 (MD5), §1.4 (QNAME), §4.1 (BGZF, EOF), Appendix A (region parsing).
- `https://raw.githubusercontent.com/samtools/htslib/develop/test/fastqs_README.txt`: the supplementary README of Cock et al. 2010. It covers variant ranges and the invalid-file categories.
- `https://raw.githubusercontent.com/biopython/biopython/master/Bio/SeqIO/QualityIO.py` and `.../FastaIO.py`: written by Cock, the paper's first author. They give the encodings, the `+` rule, wrapping and the comment handling. Biopython 1.88 was used for the tests.
- `https://raw.githubusercontent.com/samtools/samtools/develop/doc/samtools-import.1` and `samtools-fasta.1`: CASAVA identifiers, `/1` `/2`.
- `https://raw.githubusercontent.com/lh3/bwa/master/bwa.1`, `bwa.c`, `bwamem_pair.c`: pairing by position, `-p` smart pairing, `/1` stripping, the different-names abort.
- `https://raw.githubusercontent.com/lh3/readfq/master/readfq.py`: lenient-parser behaviour.
- `https://raw.githubusercontent.com/s-andrews/FastQC/master/uk/ac/babraham/FastQC/Sequence/QualityEncoding/PhredEncoding.java`: current encoding logic.
- `https://raw.githubusercontent.com/OpenGene/fastp/master/README.md`: `--phred64`, `--interleaved_in`, length filtering.
- `https://raw.githubusercontent.com/galaxyproject/training-material/main/topics/sequence-analysis/faqs/fastq.md` and `.../tutorials/quality-control/tutorial.md`: secondary sources for the 4-line description, the Nanopore header and R1/R2 practice.

### Real reference data

- `https://s3.amazonaws.com/broad-references/hg38/v0/Homo_sapiens_assembly38.fasta.fai`, `.dict`, and HTTP byte ranges of `.fasta`.
- `https://ngi-igenomes.s3.amazonaws.com/igenomes/Homo_sapiens/UCSC/hg38/Sequence/WholeGenomeFasta/genome.fa(.fai, .dict)` and `.../NCBI/GRCh38/...`. Both are 195-sequence no-alt, analysis-set style files (25 primary + 42 `_random` + 127 `chrUn_` + `chrEBV`); the NCBI copy's chr1 header is identical to the Broad header. They are not the UCSC `hg38.fa.gz` or NCBI RefSeq downloads themselves.

### Search results only (snippets, pages not opened)

- Illumina BaseSpace help, "FASTQ files": header layout, `is filtered` meaning, sample number versus index.
- SEQanswers "upcoming changes in CASAVA": the control-number wording.
- NCBI BLAST "FASTA format description" mirrors: the < 80-character recommendation, `-` gap, `*` and `X` in protein.
- PubMed 20015970: Cock et al. 2010 citation details.

### Unreachable (blocked or DNS failure)

- `pmc.ncbi.nlm.nih.gov/articles/PMC2847217/`, `academic.oup.com` (NAR article), `europepmc.org`, `www.ebi.ac.uk` (Europe PMC REST), `web-genobioinfo.toulouse.inrae.fr` (PDF mirror) and `strathprints.strath.ac.uk`. As a result, Cock et al. 2010 itself was not read. FASTQ claims attributed to it are taken from its supplementary README and its first author's Biopython documentation, and paper-specific details (the `B` indicator) are marked [from memory - verify].
- `support.illumina.com`, `help.basespace.illumina.com`, `help.connected.illumina.com`: Illumina FASTQ documentation.
- `en.wikipedia.org` (FASTQ_format, FASTA_format).
- `blast.ncbi.nlm.nih.gov` and all mirrors of the NCBI FASTA description.
- `hgdownload.soe.ucsc.edu` (hg38 README on soft-masking) and `ftp.ncbi.nlm.nih.gov` (`README_analysis_sets.txt`).

## Verification log

Adversarial fact-check, 2026-10-16. Primary sources were re-fetched independently from raw.githubusercontent.com: faidx(5), `faidx.c`, `bgzf.c`, `bgzip.c`, bgzip(1), samtools-faidx(1), samtools-import(1), samtools-fasta(1), htslib `sam.c`, SAMv1.tex (identical to hts-specs master 510c107), CRAMv3.tex, the Cock et al. fastqs README and Biopython's copies of its error files, Biopython `QualityIO.py`/`FastaIO.py`, bwa (`bwa.1`, `bwa.c`, `bwamem_pair.c`, `fastmap.c`), `readfq.py`, FastQC `PhredEncoding.java`, the fastp README and the Galaxy FASTQ FAQ. Every snippet and index row in §3 and §8 was re-run with samtools/htslib 1.24 (pysam 0.24.1) and Biopython 1.88. For bgzip, htslib 1.24 was built from the GitHub release tarball. Real-data claims were re-checked by byte-range fetches of the Broad, iGenomes UCSC and iGenomes NCBI GRCh38 FASTAs, `.fai` and `.dict` files, and by hashing both full chr1 sequences.

### Corrections

| # | Where | Claim | Correction | Source |
|---|---|---|---|---|
| 1 | Pitfall 5 | "UCSC and Broad chr1 share `M5:6aef897c...`" | False. GRCh38 chr1 has IUPAC `M` (248,752,514) and `R` (248,755,122). The Broad and NCBI copies keep them; the UCSC copy has `N`. UCSC chr1 uppercased MD5 = `2648ae1bacce4ec4b6cf337dcae37816`, which also matches the iGenomes UCSC `genome.dict`. Soft-masking and re-wrapping alone still leave M5 unchanged. | Full-chr1 MD5 of both files; byte-range fetch of both positions in all three copies; SAMv1 §1.3.2 |
| 2 | Q9 | Keyed answer: a CRAM made against Broad decodes with UCSC "as long as the names match", because the M5s are identical | Wrong key, because of #1. Rewrote Q9 as Broad versus a soft-masked, re-wrapped copy of the same file, where "yes" is correct. Added a note that a single IUPAC-to-`N` difference makes htslib refuse the slice (`MD5 checksum reference mismatch`). | pysam/htslib 1.24 CRAM round-trip test; CRAMv3 §8.5, §11 |
| 3 | Q4 | "One record alone could not have proved this" keyed ✔ (its own explanation contradicted it) | Keyed ✘. One record containing a character below 59 (e.g. `5`) proves Phred+33. | Encoding ranges in the Cock README and Biopython `QualityIO` |
| 4 | Pitfall 10 | "Quality encoding can be detected from one read: It can't." | Overstated. One read can prove +33 when it holds a character below `;`; only reads without such characters are ambiguous. | Same as #3 |
| 5 | EX-09(b) | The `+` line repeated only the read ID, with `1001` for `1000` | That snippet had two violations: Biopython also rejects a `+` line that omits the comment, even with `1000`. The `+` line now repeats the full title with only `1001` changed. Tested: Biopython rejects it, samtools fqidx accepts it. | Biopython 1.88 test; `QualityIO` docstring ("must be identical") |
| 6 | EX-01 | Lines of 20/16/24, with "line 3" as the single answer | Two offending lines (line 4 is longer than LINEBASES), so a single-click key is ambiguous. Changed to 20/16/20/4 (still chrM 1-60); samtools still reports `unexpected "A" at line 4`. | samtools 1.24 test; faidx(5) |
| 7 | §3.4 | ".gzi ... Every block holds 65,280 uncompressed bytes" | True only for `bgzip --binary` or pysam `tabix_compress`. Default `bgzip` 1.24 ends text blocks at newlines and gives (20642, 65225), (41248, 130495), (61931, 195765) for the same file. | bgzip 1.24 built from source; bgzip(1) `--binary`; `bgzip.c` |
| 8 | GZ-S01 | The EOF block is part of an error-level rule | SAMv1 §4.1.2 says the EOF marker "should" be written. Without it, samtools faidx indexes and retrieves, printing only a warning. Split into GZ-S01 (BC field, error) and GZ-S02 (EOF, warning). | SAMv1 §4.1.2; samtools 1.24 test |
| 9 | FAI-M01 | "OFFSETs increase in file order" as an error | faidx(5) says rows are only "typically" in file order, and htslib uses an out-of-order `.fai` fine. Split into FAI-M01 (numbers must match the bytes, error) and FAI-M02 (file order, convention). | faidx(5); htslib 1.24 test |
| 10 | FA-M02 | Excluded characters `\ , " ' ( ) [ ] { } < >` | The backtick is excluded too. Added the spec regex, and escaped the pipes so the table renders. | SAMv1 §1.2.1 |
| 11 | §3.3, §6 | "There are no tabs in FASTQ" | Too strong. `samtools fastq -T` writes TAB-separated tags in headers. The no-whitespace rule applies to sequence and quality lines (Cock `error_tabs`/`error_spaces`). | samtools 1.24 test; Cock README and test files |
| 12 | FA-S01 | The first non-blank line must start with `>` (implying leading blank lines are fine) | Biopython 1.88 `fasta` rejects a leading blank line, while samtools skips it. A validator should warn. | Biopython 1.88 and samtools tests |
| 13 | FA-S05 | Trailing spaces only | Added that a trailing space on the final line is tolerated, and that an internal space indexes cleanly but makes retrieval return shifted sequence containing spaces, silently. | samtools 1.24 test; `faidx.c` (`isgraph` counting) |
| 14 | §3.3 control field | "This comes from a community forum, not an Illumina specification" | WebSearch snippets attribute the exact wording to Illumina's BaseSpace "FASTQ files" page (plus "always 0 on HiSeq X"). Still unopened, so tagged [snippet only - verify]. | WebSearch snippets |
| 15 | §3.3 is_filtered | Snippet-only support for `Y` = failed | Confirmed in code: htslib sets `QCFAIL` when the field is `Y`. | htslib `sam.c`; samtools-import(1) |
| 16 | EX-13 | "an empty record" in the warning bin; "Phred+64 data in 2026" | Ambiguous: an empty *last* record is a samtools error, and FQ-M01 labels +64 misreading an error. Reworded to "empty record in the middle" and "a FASTQ that turns out to be Phred+64 (valid variant; it becomes FQ-M01 if read as +33)". Noted that fqidx rejects zero-length reads. | samtools 1.24 tests |
| 17 | FQ-C04 | Zero-length reads: only "some downstream tools" fail | samtools fqidx 1.24 fails on them (`Inlined empty line is not allowed`). | samtools 1.24 test |
| 18 | FA-M01 | Duplicate names supported only by samtools behaviour | Added SAMv1 §1.3: `@SQ` SN values "must be distinct". | SAMv1 §1.3 |
| 19 | FQ-M03 | Interleaving errors described as caught | bwa `-p` silently treats reads whose neighbour has a different name as single-end, with no abort. | bwa(1) `-p` |
| 20 | FQ-M04 | "Read IDs are unique within a sample" | R1 and R2 share IDs. Now "within one FASTQ file". | SAMv1 §1.4; bwa pairing |
| 21 | FA-C01, EX-02, Sources | "UCSC 50 / NCBI 70" as if they were the canonical UCSC and NCBI downloads | They are the iGenomes copies (195-sequence no-alt analysis-set style). Numbers re-verified; labels clarified. | iGenomes `.fai`, headers |
| 22 | §10 | "127 unplaced `chrUn_`" | Correct count, but the decoys also start with `chrUn_`; clarified. Counts 3,366 / 3,217,346,917 / 25 / 42 / 127 / 261 / 1 / 2,385 / 525 re-verified. | Broad `.fai` |
| 23 | §10 capstone twist | "an affected relative's earlier gene-panel test" | An affected relative contradicts the de novo narrative. Removed "affected" and added a note. | Clinical-plausibility check against the case design |
| 24 | §10 SCN1A | Location tagged [from memory] | Cross-referenced to case.md's GENCODE v43 coordinates (chr2:165,984,641-166,149,214, minus strand). Not re-checked independently (see below). Added the minus-strand `faidx -i` point. | case.md |
| 25 | §11 PAR masking | [from memory - verify] | Verified: chrY:1,000,001 is `N` in all three copies. | Byte-range fetches |
| 26 | EX-04 | "the fixed file indexes to `chrM_demo 60 38 20 21`" | True only if the duplicate is deleted; renaming adds `chrM_demo2 10 128 10 11`. | samtools 1.24 test |
| 27 | FA-M06 | SAMv1 §4.2.3 cited for reference alphabets | That section is about BAM *read* SEQ encoding; clarified. Added that real GRCh38 contains M/R, so a validator must not flag IUPAC codes. | SAMv1 §4.2.3; GRCh38 bytes |
| 28 | Pitfall 9; EX-12(c); §11 BGZF | "quality lines often start with `@`"; "every pair is mismatched"; "64 KiB blocks" | Softened to "can" (binned modern data may never contain `@`); "every pair after the removed read"; "at most 64 KiB, 65,280 uncompressed bytes per htslib block". | SAMv1 §4.1; reasoning |

### Re-verified and found correct (no change)

- All `.fai` rows and byte arithmetic: toy.fa (38/147), base 45 = byte 84 `A`, EX-02 bytes 10206/10254/10212, Q2 = 251446312 and its distractors, EX-03 rows, EX-10 fqidx rows (`30 4 18 19 38`, `18 74 18 19 95`), and faidx(5)'s CR-LF example.
- chrM first 60 bp, R1 = chrM:1-36, R2 = reverse complement of chrM:115-150; Broad chr1/chrM headers (two-space separators, `AC:J01415.2`, `tp:circular`); chr1 starting with 10,000 `N`; the UCSC lowercase telomere.
- Phred maths: R1 ΣP = 0.0894 (Q25 at base 16, Q11 at base 32); `IIII#` = 0.6314; `)))))` ≈ 0.79; the character-to-Q mappings in §2, §3.3, EX-08, EX-10 and Q4.
- samtools behaviour: duplicate warning and first-wins retrieval, an empty middle record dropped silently and an empty last record giving `File truncated`, a stale `.fai` returning `first 60 b` with no warning (even when the FASTA is newer), an empty NAME column, leading-space names, mixed EOL and blank-line errors, gzip refusal, `-i` `/rc`, and 1-based closed regions.
- FASTQ behaviour: Biopython and fqidx messages in EX-09(a)/(c), EX-05 item 7 rejected by both Biopython and samtools (faidx and fqidx), `+` title mismatch accepted by fqidx, FQ-S07 (fqidx fails, Biopython accepts), and the readfq behaviours.
- bwa: pairing by position, the `trim_readno` single-digit `/N` stripping, and the `paired reads have different names` abort; `-C` comment rule.
- SAMv1: QNAME regex `[!-?A-~]{1,254}`, the M5 worked example (`dfabdbb36e239a6da88957841f32b8e4` recomputed), the BGZF magic bytes and EOF block, and Appendix A region parsing.
- FastQC encoding logic, fastp options (`-6`, `--interleaved_in`, `-l` default 15), and the Galaxy Nanopore header.

### Could not verify (blocked or no primary source)

- Illumina documentation (support.illumina.com, help.basespace.illumina.com, help.connected.illumina.com: DNS failure): header field meanings, the UMI 8th field, the sample-number-versus-index wording, binned quality values per instrument, the `_S1_L001_R1_001` naming, and bcl2fastq's default exclusion of non-PF reads.
- Cock et al. 2010 full text and the Illumina 1.5 `B` indicator (only search snippets), and PacBio's Q93 cap (only a Bioconductor thread).
- en.wikipedia.org, open-bio.org, rest.uniprot.org, rest.ensembl.org and api.genome.ucsc.edu (all blocked): the pre-1.8 and SRA header examples, the full UniProt P69905 header, SCN1A coordinates (taken from case.md, not independently re-checked), and the hg19 chrM history.
- Whether UCSC's own `hg38.fa.gz` from hgdownload (as opposed to the iGenomes copy) also has `N` at the two chr1 IUPAC positions. This is expected from 2bit's ACGTN-only alphabet [from memory - verify].
- That GATK requires a `.dict`, and the Ensembl `dna`/`dna_sm`/`dna_rm` naming (unchanged, still tagged).
- Cross-note consistency: `case.md` uses NovaSeq X style headers (`@LH00417:...`, 2×150), while this note's examples use NovaSeq 6000 style `A00123` headers and the NovaSeq 6000 quality alphabet. Harmonise them before writing lesson content.
