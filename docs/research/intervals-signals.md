# Intervals and signals: BED, BEDPE, WIG (with bedGraph, bigWig, bigBed)

Research notes for the "Genomic File Formats" course. Lessons covered: **BED** (capture targets), **WIG** (the coverage dip), **BEDPE** (the breakpoint pair). Rule-ID prefixes are `BED-`, `BEDPE-` and `WIG-`. bedGraph rules are filed under `WIG-G`.

**Separator convention in this document.** Inside code blocks, BED, bedGraph and BEDPE snippets use real single TAB characters between columns. Where a snippet deliberately uses spaces, the text says so. WIG snippets use single spaces, as UCSC's own examples do: WIG is whitespace-delimited and does not require tabs.

**Coordinates in the case snippets.** The coordinates on chr2 sit inside the real GRCh38 *SCN1A* locus. NCBI Gene 6323 gives the GRCh38.p14 span as NC_000002.12:165,984,641-166,149,161 on the minus strand (this comes from a web-search summary of NCBI; Ensembl-derived sources give slightly different ends). The **target and exon boundaries themselves are illustrative, not real exon coordinates.** The GTF lesson should substitute real GENCODE exon coordinates before shipping. The chr2 length 242,193,529 is the real GRCh38 value (see `sequences.md`).

---

## 1. Purpose and place in the pipeline

| Format | Produced by | Consumed by | Disease-analysis question it answers |
|---|---|---|---|
| **BED** | Capture-kit vendors (target/bait files); annotation exports; `bedtools bamtobed`; `mosdepth --by` (`regions.bed.gz`); peak callers (narrowPeak is BED6+4) [from memory - verify]; benchmark "confident region" files | Callers and QC restricted to regions (`samtools view -L`, `bcftools -R/-T`, GATK `-L` [from memory - verify]); `bedtools intersect/merge/complement`; `mosdepth --by capture.bed`; IGV/UCSC display; `tabix`; `bedToBigBed` | *Where did we look?* Which bases were actually interrogated, and does a candidate region fall inside them? Absence of a variant outside the targets is not evidence of absence. |
| **WIG / bedGraph / bigWig** | Coverage and signal tools: `wigToBigWig`/`bedGraphToBigWig` (verified); `mosdepth` per-base output (BED-like `per-base.bed.gz`, verified); `bedtools genomecov -bg`, deepTools `bamCoverage`, `igvtools count` [from memory - verify] | Genome browsers; visual QC; depth-based CNV review | *How much signal is here?* For read depth: did the child lose (or gain) a copy of this exon? |
| **BEDPE** | SV callers (`lumpy -b`, verified in LUMPY README and source); `svtools vcftobedpe` (verified); `bedtools bamtobed -bedpe` (read pairs, verified); 10x Long Ranger `large_sv_calls.bedpe` (via search summary of the 10x docs; page unreachable) | `bedtools pairtobed` / `pairtopair` (verified); `svtools` (`bedpetovcf`, `bedpetobed12`, `varlookup`); IGV arcs [from memory - verify] | *Which two distant pieces of genome are joined in this sample but not in the reference?* That join can be a deletion, duplication, inversion or translocation. |

Where they sit in the trio story: the FASTQ reads are aligned to the GRCh38 FASTA, producing BAM/CRAM. The **BED** of capture targets says which exons the exome assay pulled down. Read depth from the BAMs, summarised as a **WIG/bedGraph/bigWig** track, shows the child at half depth over one *SCN1A* target while both parents are normal. Split and discordant reads at the edges of that dip are reported as a **BEDPE** breakpoint pair. VCF records the variant, GTF says which exon it hits, and PAF/GFA (long reads) resolve the full structure.

---

## 2. Mental model

### BED: a Python slice of a chromosome
The numbers in BED count the **gaps between bases** (fence posts), not the bases. `chr2 100 200` is exactly `chr2_sequence[100:200]` in Python: it contains 100 bases, `end - start` is the length, an empty slice `[100:100]` is a legal zero-length feature (an insertion point), and adjacent slices `[100:200]` and `[200:300]` share no base. BEDv1 §1.3 defines it the same way: for `ACTGCG`, interval [2,4) is `TG`.

**The design problem it solves.** One line per feature, plain text, minimal columns. That makes it streamable through `sort`, `cut`, `awk` and `join` (the "Unix-pipe-friendly" design). It was built for the UCSC browser, which is why display fields exist: thick and thin parts (`thickStart`/`thickEnd`, typically the CDS), colours (`itemRgb`) and blocks (exons, BED12). Half-open coordinates make interval arithmetic free of `+1` corrections: length is `end - start`, two intervals overlap iff `a.start < b.end && b.start < a.end`, and adjacent tiles join cleanly.

### WIG: a sensor log for the genome
A WIG file is a **sampled signal**. Rather than repeating "chromosome, start, end" on every line, a **declaration line** says once *where the sampling starts and how it proceeds*. After that, the lines are mostly bare numbers:
- `fixedStep` is a sensor with a fixed sampling rate: "start at 166,012,441, one reading every 20 bp, each reading covers 20 bp", followed by one value per line.
- `variableStep` is timestamped readings: "on chr2, each reading covers 20 bp", followed by `position value` lines.

UCSC: "These formats were developed to allow the file to be written as compactly as possible" (wiggle.html). **bedGraph** is the "spell everything out" alternative (`chrom start end value`) for sparse or variable-width data. **bigWig** is the database version: binary, indexed, with precomputed zoom-level summaries. A browser can then fetch just the region and resolution it is drawing over HTTP.

### BEDPE: two BED intervals stapled together
BED12 cannot describe a feature whose pieces lie on different chromosomes, and it has only one strand field. bedtools defined BEDPE (general-usage.rst) "to concisely describe disjoint genome features, such as structural variations or paired-end sequence alignments". Think of **two pins in the genome map joined by a string**. Each pin is an interval, usually the *uncertainty window* around a breakpoint. Each pin also carries a strand that says *which side of the pin the retained sequence lies on*. The strand pair is what makes a deletion look different from an inversion.

---

## 3. Anatomy

### 3.1 BED (GA4GH BEDv1, hts-specs, last changed 2022-01-05, commit 9ddbc52)

| Col | Field | Type / range (BEDv1 Table 2) | Meaning |
|---|---|---|---|
| 1 | `chrom` | `[[:alnum:]_]{1,255}` | Chromosome / scaffold name |
| 2 | `chromStart` | Int, [0, 2^64-1] | 0-based start (included) |
| 3 | `chromEnd` | Int, [0, 2^64-1] | End (excluded); `>= chromStart` |
| 4 | `name` | printable ASCII, 1-255 chars | Label; `.` allowed in BED5+ when uninformative |
| 5 | `score` | Int [0,1000] | Display shading; `0` when uninformative |
| 6 | `strand` | `[-+.]` | `.` = unknown/none |
| 7 | `thickStart` | Int in [chromStart, chromEnd] | Start of thick drawing (e.g. CDS start) |
| 8 | `thickEnd` | Int in [thickStart, chromEnd] | End of thick drawing |
| 9 | `itemRgb` | `R,G,B` (each 0-255) or `0` | Colour |
| 10 | `blockCount` | Int > 0 | Number of blocks (exons) |
| 11 | `blockSizes` | comma list, optional trailing comma | Block lengths |
| 12 | `blockStarts` | comma list, **relative to chromStart** | Block starts |

`BEDn` = first *n* standard fields. `BEDn+` = at least *n*, then optionally more standard or custom fields. `BEDn+m` = *n* standard fields plus *m* custom fields (e.g. narrowPeak is BED6+4 [from memory - verify]). **BED10 and BED11 are prohibited** (§1.5).

**Annotated minimal valid example: BED4 capture targets** (columns separated by single TABs):

```
chr2	166002110	166002330	SCN1A_T1
chr2	166009870	166010052	SCN1A_T2
chr2	166012440	166012660	SCN1A_T3
chr2	166015980	166016181	SCN1A_T4
```

- `chr2` must match the reference FASTA's sequence names (GRCh38 with `chr` prefix here).
- `166012440 166012660` is 220 bp (`660 - 440`). A genome browser displays it as **chr2:166,012,441-166,012,660**.
- The total target territory of these four lines is 220 + 182 + 220 + 201 = **823 bp** (no `+1`s).

**Annotated BED12** (UCSC FAQ example, reproduced in BEDv1 §2.2; columns separated by single TABs):

```
chr22	1000	5000	cloneA	960	+	1000	5000	0	2	567,488,	0,3512
```

Blocks are [1000+0, 1000+0+567) = [1000,1567) and [1000+3512, 1000+3512+488) = [4512,5000). The first block starts at `chromStart` and the last ends at `chromEnd`, both required (§1.9). `itemRgb` `0` means black.

**What an exome capture-target BED looks like in practice.** It is usually BED3 or BED4, one line per targeted region (mostly single exons, often a few hundred bp), with on the order of 10^5 lines and a total of roughly 30-45 Mb [from memory - verify; `foundations.md` has the kit-size search summary]. Vendors ship several variants: "targets" (the intended regions), "covered"/"probes" (regions covered by baits) and "padded" (targets extended on each side, often by 100 bp) [from memory - verify]. The search summary of Agilent's help says the Covered file is "a single track of the genomic regions that are covered by one or more probes", with annotation in column 4. A Biostars paste of SureSelect V6 (S07604514, hg38) shows the file **begins with a `browser` line and a `track` line** (search summary; pages unreachable). That makes it a UCSC *track file*, not a strict BEDv1 file (§5).

### 3.2 BEDPE (bedtools general-usage.rst; no formal standards-body spec)

| Col | Field | Unknown value | Notes |
|---|---|---|---|
| 1 | `chrom1` | `.` | First end |
| 2 | `start1` | `-1` | 0-based |
| 3 | `end1` | `-1` | |
| 4 | `chrom2` | `.` | Second end, may differ from `chrom1` |
| 5 | `start2` | `-1` | 0-based |
| 6 | `end2` | `-1` | |
| 7 | `name` | | optional; any string |
| 8 | `score` | | optional; bedtools allows any string (UCSC BED would require 0-1000) |
| 9 | `strand1` | `.` | optional |
| 10 | `strand2` | `.` | optional |
| 11+ | user-defined | | "merely passed through" by `pairToBed`/`pairToPair` |

bedtools accepts **6, 7, 8, 10 or more than 10 columns**. Nine is rejected: "Verify that your files are TAB-delimited and that your BEDPE file has 6,7,8 or 10 fields" (bedFilePE.cpp). Every line must have the same count.

**Annotated valid example: the case deletion**, LUMPY-style with two custom columns (single TABs between all 12 columns):

```
#chrom1	start1	end1	chrom2	start2	end2	name	score	strand1	strand2	type	evidence
chr2	166012360	166012380	chr2	166012728	166012748	DEL_1	87	+	-	DEL	SR=9;PE=6
```

- End 1 is a 20-bp uncertainty window centred on the left breakpoint (fence post 166,012,370). End 2 is centred on the right breakpoint (166,012,738).
- Strands `+ -` are the deletion signature in LUMPY's convention (verified in `SV_Pair.cpp`): `+-` DELETION, `-+` DUPLICATION, `++` or `--` INVERSION, different chromosomes INTERCHROM.
- Implied deleted bases are [166012370, 166012738) = 368 bp, which is 1-based chr2:166,012,371-166,012,738. That interval fully contains target T3 [166012440, 166012660).

Real tool layouts differ after column 10:
- **LUMPY `-b`** (`SV_BreakPoint::print_bedpe`) writes `chr1 start1 end1 chr2 start2 end2 id score strand1 strand2`, then `TYPE:DELETION`, `IDS:<sample>_<evtype>,<n>;...`, `STRANDS:+-,<n>`, then further columns with most-likely positions and intervals.
- **svtools `vcftobedpe`** writes the header `#CHROM_A START_A END_A CHROM_B START_B END_B ID QUAL STRAND_A STRAND_B TYPE FILTER NAME_A REF_A ALT_A NAME_B REF_B ALT_B INFO_A INFO_B [FORMAT samples...]`. It sets `START_A/END_A` from VCF `POS` plus `CIPOS`, and `START_B/END_B` from `END` plus `CIEND`. Simple SVs default to strands `+ -` unless the INFO field `STRANDS` overrides them.
- **10x Long Ranger**: `chrom1 start1 stop1 chrom2 start2 stop2 name qual strand1 strand2 filter info`. Per the search summary of the docs, *both strand fields are unused and always `+`*, and the SV type is in `info` (page unreachable; verify).
- **SVTyper** genotypes SVs in **VCF**, not BEDPE. In the LUMPY/SVTyper ecosystem, BEDPE comes from `lumpy -b` or `svtools vcftobedpe`.

### 3.3 WIG (UCSC wiggle.html)

```
track type=wiggle_0 name="proband_depth" description="Proband read depth, 20-bp bins"
fixedStep chrom=chr2 start=166009871 step=20 span=20
98
112
121
125
127
124
118
109
95
fixedStep chrom=chr2 start=166012441 step=20 span=20
51
60
63
63
66
64
62
63
58
55
47
```

- **Track line.** It is required for a UCSC custom track (`type=wiggle_0` is "REQUIRED"). For bigWig conversion it "must not be present" according to the doc.
- **Declaration line.** It starts a section and holds `key=value` pairs separated by whitespace.
  - `fixedStep` needs `chrom`, `start` and `step`. `span` is optional.
  - `variableStep` needs `chrom` and takes an optional `span`. `start` and `step` are not allowed.
- **Data lines.** `fixedStep` lines hold one value each. The *i*-th value (counting from 0) covers 1-based bases `start + i*step` through `start + i*step + span - 1`. `variableStep` lines hold `position value`.
- **The example.** Section 1 covers target T2: nine bins from 166,009,871 to 166,010,050. Section 2 covers T3: eleven bins, 166,012,441 to 166,012,660, i.e. the whole 220-bp target. Over T3, the child's depth is about half that of T2.
- **Values** are "integer or real, positive or negative". NaN is "not supported".

The same T3 depth as **bedGraph** (0-based half-open, 4 columns, single TABs) is 11 lines. The first two are:

```
track type=bedGraph name="proband_depth_bg"
chr2	166012440	166012460	51
chr2	166012460	166012480	60
```

A per-target summary, where widths vary, can only be expressed as bedGraph, because WIG needs one span per dataset:

```
track type=bedGraph name="child_vs_parents" description="Proband / mean parental depth per target"
chr2	166002110	166002330	1.04
chr2	166009870	166010052	0.97
chr2	166012440	166012660	0.49
chr2	166015980	166016181	1.01
```

---

## 4. Coordinate system and conventions

| | BED / bedGraph / BEDPE | WIG (variableStep / fixedStep) | bigWig / bigBed (binary) |
|---|---|---|---|
| Base | **0-based half-open** (BEDv1 §1.3; bedgraph.html; general-usage.rst) | **1-based fully closed** ("the only format defined by UCSC that uses a 1-based format, for historical reasons", wiggle.html) | Stored 0-based internally (wigToBigWig subtracts 1: `item->start = start - 1`, bwgCreate.c) |
| Length | `end - start` | `span` per item | n/a |
| Zero-length | Allowed (`start == end` = insertion point; `0 0` = before the chromosome) | Not representable (span ≥ 1) | |
| Strand | BED col 6 `+ - .`; BEDPE two strands | none | bigBed: as source BED |
| Header | None in strict BEDv1. `#` comment lines anywhere. Track/browser lines make it a ".track" file (§5) | Track line for custom tracks; declaration lines per section | Binary header, magic number |
| Sorting | *Should* sort by chrom (any scheme, but contiguous), then start, then end (§3.4). `LC_ALL=C sort -k1,1 -k2,2n -k3,3n` is acceptable | Positions "must be in numerical order" | Built-in R-tree index |
| Compression / index | bgzip + tabix `.tbi` / `.csi`. Tabix needs single-TAB separators (§3.6) and coordinate-sorted, contiguous chromosomes | Usually converted to bigWig | Self-indexed; zoom levels with min/max/sum/sumSquares (bbiFile.h) |

**Converting between conventions** (the source of most off-by-one bugs):
- BED `[s, e)` → 1-based closed `[s+1, e]`. The UCSC FAQ: `chromStart=0, chromEnd=100` "span the bases numbered 0-99 ... but will represent the position notation chr1:1-100".
- WIG item at 1-based `p` with span `w` → bedGraph `p-1 p-1+w`. Example: `166012441` span 20 → `166012440 166012460`.
- Region strings typed into `samtools`/`tabix` (`chr2:166012441-166012660`) are 1-based closed, even when the file is BED. The tabix index stores a BED flag (`format & 0x10000`, tabix.tex). `tabix -0` or `-p bed` handles 0-based input.
- The 1-based "region" a browser prints is never what you paste into a BED.

**Sorting.** bedtools `-sorted` sweeps and `tabix` both require coordinate order. htslib reports `Unsorted positions on sequence #N` and `Chromosome blocks not continuous` (hts.c). `bedGraphToBigWig` requires `LC_ALL=C sort -k1,1 -k2,2n` and aborts with `bedGraph not sorted on start` or `overlapping regions in bedGraph`. `bedToBigBed` needs each chromosome's lines together and sorted by start, and has a `-sort` option (bigBed.html).

---

## 5. Validity rules

Severity labels: **error** = the spec says MUST, or a mainstream tool aborts. **warning** = the spec says SHOULD, or the file is likely wrong. **convention** = de-facto practice. "BEDv1" means hts-specs BEDv1.tex @ 9ddbc52 (2022-01-05). BEDPE has no versioned spec, so its rules cite bedtools2 `general-usage.rst` and `bedFilePE.cpp` (master, 2026-10-16). WIG rules cite UCSC `wiggle.html`/`bedgraph.html` (kent master mirror) and `bwgCreate.c` / `bedGraphToBigWig.c` for tool behaviour.

### 5a. BED structural rules

| ID | Rule | Source | Minimal violation (TAB-separated unless noted) | Sev. |
|---|---|---|---|---|
| BED-S01 | ≥ 3 fields per data line; 3-12 standard fields, then custom fields | BEDv1 §1.5 | `chr2	166012440` | error |
| BED-S02 | Every data line has the same number of fields | BEDv1 §1.5 | line 1 BED4, line 2 BED3 | error |
| BED-S03 | Optional fields are positional: field *k* requires fields < *k*; BED10 and BED11 prohibited | BEDv1 §1.5 | 10 columns ending `...	0	2` | error |
| BED-S04 | `chromStart`, `chromEnd` are non-negative base-10 integers (no `,` separators, decimals, `-1`) | BEDv1 Table 2, §1.6 | `chr2	166,012,440	166,012,660` | error |
| BED-S05 | `chromEnd ≥ chromStart` (equal is legal: insertion point) | BEDv1 §1.6 | `chr2	166012660	166012440` | error |
| BED-S06 | `chrom` matches `[A-Za-z0-9_]{1,255}` | BEDv1 Table 2, §1.6 | `chr2.1	10	20` | error (strict). Most tools accept any non-whitespace name |
| BED-S07 | `name` 1-255 printable chars; whitespace inside only if the file uses single-TAB separators throughout | BEDv1 §1.7 | space-separated (spaces, not tabs): `chr2 10 20 SCN1A T3` | error |
| BED-S08 | `score` integer 0-1000 | BEDv1 §1.7 | `chr2	10	20	T3	7.3e-05	+` | error (BEDv1). bedtools accepts any string |
| BED-S09 | `strand` ∈ {`+`,`-`,`.`} | BEDv1 §1.7 | `...	0	*` | error |
| BED-S10 | `chromStart ≤ thickStart ≤ thickEnd ≤ chromEnd` | BEDv1 §1.8 | `chr2	100	200	x	0	+	90	200` | error |
| BED-S11 | `itemRgb` is `0` or `R,G,B` with each 0-255 | BEDv1 §1.8 | `...	255,0` or `...	#FF0000` | error |
| BED-S12 | `blockCount` integer > 0 | BEDv1 §1.9 | `...	0		` | error |
| BED-S13 | `blockSizes`/`blockStarts` each have exactly `blockCount` integers, no spaces, optional trailing comma | BEDv1 §1.9 | `blockCount 3`, `blockSizes 200,300,` | error |
| BED-S14 | First `blockStart` is 0; `chromStart + lastStart + lastSize == chromEnd` | BEDv1 §1.9 | UCSC example with `0,3500` (ends at 4988, not 5000) | error |
| BED-S15 | Blocks ascending, non-overlapping, each within the feature | BEDv1 §1.9 | `blockStarts 0,300` with `blockSizes 400,...` | error |
| BED-S16 | A comment line starts with `#` in column 1. `#` with leading whitespace, or later in the line, is feature data | BEDv1 §1.4.2 | ` #targets v2` (leading space) | error |
| BED-S17 | No `track` or `browser` lines in a `.bed`. Such files are "track files" and should use `.track` | BEDv1 §5 | `track name="Covered"` first line | error (strict BEDv1). Accepted by UCSC custom tracks and bedtools |
| BED-S18 | Fields are 7-bit printable ASCII; one line-separator style per file | BEDv1 §1.3 | Mixed `\r\n` and `\n`; UTF-8 `–` in name | error |
| BED-S19 | A field present on one line may not be empty on any other line | BEDv1 §1.5 | `chr2	10	20		0	+` | error |

### 5b. BED semantic / consistency rules

| ID | Rule | Source | Minimal violation | Sev. |
|---|---|---|---|---|
| BED-M01 | `chromEnd ≤` contig length (from `.fai` / `chrom.sizes`) | BEDv1 §1.6 | `chr2	242193500	242193600` (chr2 is 242,193,529 bp) | error |
| BED-M02 | Contig names exist in the reference used for the BAM/VCF. The build is out-of-band information | BEDv1 §3.1, §4 | `2	166012440	166012660` against a `chr2` reference: intersect silently returns nothing | error (pipeline) |
| BED-M03 | One naming scheme per file (not both `17` and `chr17`) | BEDv1 §3.1 | mixed `chr2` / `2` | warning |
| BED-M04 | `blockStarts` are relative. Values ≥ `chromStart` usually mean absolute coordinates were pasted | BEDv1 §1.9 | `chr2	1000	5000	...	3	200,300,488,	1000,2500,4512,` | error (caught by S14/S15) |
| BED-M05 | Coordinates are not 1-based leftovers: starts equal to a GTF exon start (instead of start−1) are a red flag | BEDv1 §1.3 vs GTF | GTF exon 166012441-166012660 copied as `166012441	166012660` (loses 1 base) | warning (heuristic) |
| BED-M06 | `strand` is treated as `.` in files that are not BED6+ | BEDv1 §1.7 | Tool infers strand from BED4 name | warning |

### 5c. BED de-facto conventions

| ID | Convention | Source / enforcer | Sev. |
|---|---|---|---|
| BED-C01 | Sorted (`LC_ALL=C sort -k1,1 -k2,2n -k3,3n` or natural order), each chromosome contiguous | BEDv1 §3.4 (SHOULD). Required by bedtools `-sorted`, tabix, bedToBigBed | convention (tool error) |
| BED-C02 | Single TAB separators | BEDv1 §3.5 (recommended). bedtools ("requires that all BED input files ... are tab-delimited"); tabix splits only on `\t` (tbx.c) | convention (tool error) |
| BED-C03 | Uninformative values: name `.`, score `0`, itemRgb `0`, thickStart=chromStart, thickEnd=chromEnd | BEDv1 §1.7-1.8 | convention |
| BED-C04 | Large files go to bgzip+tabix or bigBed (BEDv1 suggests bigBed above 50 MB for visualisation) | BEDv1 §3.6 | convention |
| BED-C05 | Target/bait BEDs: merged (non-overlapping), padded or unpadded stated in the file name/README, same build as the reference | vendor practice [from memory - verify] | convention |
| BED-C06 | Plain `gzip` is not enough for indexing: tabix needs BGZF | tabix(1) | convention (tool error) |

### 5d. BEDPE rules

| ID | Rule | Source | Minimal violation (TAB-separated) | Sev. |
|---|---|---|---|---|
| BEDPE-S01 | ≥ 6 fields; bedtools accepts 6, 7, 8, 10 or >10, **not 9** | general-usage.rst; bedFilePE.cpp | `chr2	10	20	chr2	80	90	DEL_1	87	+` (9 cols) | error |
| BEDPE-S02 | Same number of fields on every line | bedFilePE.cpp ("Differing number of BEDPE fields") | 10-col line followed by 12-col line | error |
| BEDPE-S03 | TAB-delimited | general-usage.rst; bedFilePE.cpp messages | space-separated record | error |
| BEDPE-S04 | `start1`,`end1`,`start2`,`end2` integers ≥ 0, or `-1` for unknown | general-usage.rst | `chr2	10	20	chr2	80	NA` | error |
| BEDPE-S05 | `start1 ≤ end1` and `start2 ≤ end2` | bedFilePE.cpp ("Start1 was greater than End1", record skipped) | `chr2	20	10	chr2	80	90` | error |
| BEDPE-S06 | `strand1`, `strand2` ∈ {`+`,`-`,`.`} | general-usage.rst | `...	F	R` | error |
| BEDPE-M01 | Unknown end is fully unknown: `chrom .`, `start -1`, `end -1`, `strand .` together | general-usage.rst; `bamtobed -bedpe` ("chromosome and strand will be set to "." and the start and end coordinates will be set to -1") | `.	166012300	166012400` | error |
| BEDPE-M02 | Coordinates within contig lengths; names match the reference | by analogy with BED-M01/M02 | `chr2	...	chr2	242193600	242193620` | error |
| BEDPE-M03 | Declared type agrees with chromosomes: DEL/DUP/INV need `chrom1 == chrom2`; inter-chromosomal = translocation/BND | LUMPY print_bedpe (INTERCHROM when chroms differ) | `chr2	...	chr9	...	DEL` | error |
| BEDPE-M04 | Strand pair agrees with type, *in the LUMPY/svtools convention*: DEL `+-`, DUP `-+`, INV `++`/`--` | SV_Pair.cpp; svtools converter | `DEL` with `-	+` | warning (convention-dependent; 10x writes `+ +` for everything) |
| BEDPE-M05 | Intra-chromosomal: end 1 upstream of end 2 (`end1 ≤ start2`) | bamtobed ordering; svtools `bedpesort` | `chr2	166012728	166012748	chr2	166012360	166012380` | warning |
| BEDPE-C01 | Inter-chromosomal: lexicographically lower chromosome first | `bamtobed -bedpe` docs | convention |
| BEDPE-C02 | Each end is a breakpoint *confidence window* (from CIPOS/CIEND), not the SV's extent | svtools converter; LUMPY | convention (interpretation) |
| BEDPE-C03 | Columns 11+ are documented by a `#` header line | svtools/LUMPY practice | convention |
| BEDPE-C04 | Extension `.bedpe`. Header and comment lines start with `#` (bedtools also skips `track` and `browser`) | bedFilePE.cpp | convention |

### 5e. WIG rules (UCSC wiggle.html; tool behaviour from kent `bwgCreate.c`)

| ID | Rule | Source | Minimal violation | Sev. |
|---|---|---|---|---|
| WIG-S01 | Custom track: first line `track type=wiggle_0 ...` | wiggle.html "General structure" | `track type=wig` | error (custom track) |
| WIG-S02 | Every data block is introduced by a `variableStep` or `fixedStep` declaration | wiggle.html; bwgCreate.c ("Unrecognized line") | numbers before any declaration | error |
| WIG-S03 | `fixedStep` has `chrom=`, `start=`, `step=`. `variableStep` has `chrom=` and no `start=`/`step=` | wiggle.html; bwgCreate.c ("Missing step=", "Extra start=") | `variableStep chrom=chr2 start=166012441` | error |
| WIG-S04 | Only `chrom`, `start`, `step`, `span` keys, written `key=value` with no spaces around `=` | bwgCreate.c ("Unknown setting", "strange var=val pair") | `fixedStep chrom = chr2 ...` | error |
| WIG-S05 | Data lines: `variableStep` has 2 fields (`pos value`), `fixedStep` has 1 (`value`) | wiggle.html | `fixedStep` section line `166012441 51` | error |
| WIG-S06 | Positions/`start` are 1-based integers ≥ 1 | wiggle.html; bwgCreate.c ("start=0 ... wiggle is a 1-based format (sorry)") | `fixedStep chrom=chr2 start=0 step=20` | error |
| WIG-S07 | Values numeric (int or real, may be negative); no NaN | wiggle.html "Data values" | `NaN`, `.` | error |
| WIG-M01 | Positions in increasing numerical order | wiggle.html "Data values" | `166012481` before `166012441` | error (doc). wigToBigWig sorts variableStep items |
| WIG-M02 | No overlaps: next position ≥ previous + span. In fixedStep `span ≤ step` | bwgCreate.c ("Overlap on chr2 between items...") | variableStep `span=50`, positions 166012441, 166012481 | error. fixedStep `span > step` is not checked within a section: warning |
| WIG-M03 | `pos + span − 1 ≤` contig length | bwgCreate.c (aborts unless `-clip`) | `variableStep chrom=chr2 span=5` then `242193527 5` (covers through 242,193,531; chr2 is 242,193,529 bp) | error |
| WIG-M04 | One value per base across sections | bwgCreate.c ("There's more than one value for chr2 base N") | two sections covering the same bases | error |
| WIG-M05 | Same span throughout the dataset | wiggle.html | section 1 `span=20`, section 2 `span=10` | warning (doc says must; wigToBigWig accepts per-section spans) |
| WIG-C01 | Always write `span=` explicitly in fixedStep. The doc default is 1, but wigToBigWig uses `span = step` when it is absent | wiggle.html vs bwgCreate.c | `fixedStep chrom=chr2 start=1 step=20` | convention |
| WIG-C02 | Sparse data (points more than about 100 bp apart) or variable widths → use bedGraph | wiggle.html, bigWig.html | per-target means in WIG | convention |
| WIG-C03 | For bigWig: one track per file, no track/browser lines | bigWig.html steps 1-2 | | convention |
| WIG-C04 | `#` comment lines and blank lines are ignored by kent tools | linefile.c `lineFileNextReal` | | convention |
| WIG-G01 | bedGraph: exactly 4 fields `chrom start end value`, 0-based half-open | bedgraph.html; bwgCreate.c ("wordCount != 4") | 5-column line | error |
| WIG-G02 | bedGraph custom track needs `track type=bedGraph`, but that line "will cause a raw bedGraph data file to fail validation by other tools" | bedgraph.html | | convention |
| WIG-G03 | bedGraph sorted, non-overlapping, `start ≤ end ≤` contig length | bedgraph.html; bedGraphToBigWig.c | `chr2	100	200	5` then `chr2	150	250	6` | error (for conversion) |

---

## 6. Recognition cues

| Format | Extensions | First-line / content signature | Magic bytes |
|---|---|---|---|
| BED | `.bed`, `.bed.gz` (+`.tbi`/`.csi`); `.track` if it has a track line | `chrom	int	int[	...]`; maybe `#`, `track`, `browser`; col 6 `+/-/.`; col 11-12 comma lists | text; `.bed.gz` is BGZF `1f 8b 08 04` |
| bedGraph | `.bedGraph`, `.bdg`, `.bg` | `track type=bedGraph`; exactly 4 columns, 4th a number | text |
| BEDPE | `.bedpe` | cols 1 and 4 look like chromosomes, cols 2,3,5,6 integers (or `-1`); headers like `#chrom1` or `#CHROM_A`; cols 9-10 strands | text |
| WIG | `.wig`, `.wig.gz` | `track type=wiggle_0`; lines starting `variableStep chrom=` or `fixedStep chrom=`; mostly 1-2-column numeric lines | text |
| bigWig | `.bw`, `.bigWig` | binary; cannot be `cat`-ed | `bigWigSig 0x888FFC26` (kent sig.h). Bytes `26 FC 8F 88` on little-endian machines (written in native order) |
| bigBed | `.bb`, `.bigBed` | binary | `bigBedSig 0x8789F2EB`, bytes `EB F2 89 87` little-endian; also repeated at end of file (v4, bbiFile.h) |

**Look-alikes:**
- **BED4 vs bedGraph.** `chr2 166012440 166012660 0.49` is both a valid BED4 (name "0.49") and a bedGraph line. Only the track line, extension or context decides.
- **BED vs GFF/GTF.** GTF/GFF have 9 columns with the numbers in **columns 4-5**, and a source (col 2) and feature type (col 3, e.g. `exon`). They are 1-based closed.
- **BED vs Picard interval_list.** interval_list has a SAM-style `@HD/@SQ` header, is 1-based closed, and has columns `contig start end strand name` [from memory - verify].
- **BEDPE vs UCSC interact.** interact is BED5+13: the first three columns are one *span*, followed by `name score value exp color` and then `sourceChrom sourceStart sourceEnd sourceName sourceStrand targetChrom ...` (interact.html).
- **BEDPE vs Juicer 2D annotation (Hi-C loops).** Columns are named `chr1 x1 x2 chr2 y1 y2 ...` [from memory - verify].
- **BEDPE vs VCF.** VCF has a `##fileformat=VCF` header and one `POS` per record; breakends live in ALT (`N[chr9:31500211[`).
- **WIG vs bedGraph.** WIG has declaration lines; bedGraph never does.
- **WIG vs `samtools depth`.** `samtools depth` output is `chrom pos depth` per line (1-based) with no declaration [from memory - verify].
- **BED vs `.fai`.** A `.fai` has 5 integer-ish columns, but column 2 is a length, not a start.

---

## 7. Common misconceptions and pitfalls

1. **"BED starts at 1 like the browser shows."** `chr2 166012440 166012660` displays as `chr2:166,012,441-166,012,660`. bedtools' own wording ("start=9, end=20 is interpreted to span bases 10 through 20") calls the end "one-based", which confuses students. Teach the slice model instead.
2. **Length = end − start + 1.** That is the 1-based closed formula. In BED it adds one phantom base per interval: 823 bp of targets becomes "827".
3. **Bookended intervals overlap.** `[100,200)` and `[200,300)` share no base, so `intersect` reports nothing. `bedtools merge` still merges them by default ("overlapping and/or book-ended features are merged", merge.rst).
4. **Zero-length is an error.** `start == end` is legal and marks an insertion point (BEDv1 §1.6). Internally, bedtools' legacy BED parser widens zero-length features by one base on each side for overlap testing (`bedFile.h`).
5. **Spaces are fine because BEDv1 allows them.** The spec allows any `[ \t]+`, but bedtools and tabix need single TABs. Copying a BED from a web page or slide converts the tabs to spaces.
6. **The vendor BED is "just BED".** It often starts with `browser`/`track` lines (strict-BED invalid; tabix needs `-S`/cleaning), may use a different build, or `1` vs `chr1`. A build or naming mismatch gives an **empty intersect with no error**.
7. **Target BED = exome = all exons.** Targets are what the baits were designed against. Some exons are missing or poorly captured, so "not in targets" means "not looked at", which is not the same as "normal".
8. **`blockStarts` are genome coordinates.** They are offsets from `chromStart`.
9. **`thickStart/thickEnd` mark the important part.** By convention they mark the CDS. For non-coding transcripts, thickStart = thickEnd (e.g. bedtools' `uc001aaa.3` example: `11873 11873`).
10. **A coverage drop between exons is a deletion.** In an exome the introns are not captured, so depth near zero between targets is normal. The signal is a drop *within* a target relative to the same target in other samples (parents or a reference panel).
11. **Half depth on one exon proves a deletion.** It is a *candidate*. GC-rich or poorly captured targets dip in every sample, so normalise against the parents or a panel, then look for breakpoint evidence (BEDPE) and confirm orthogonally.
12. **WIG and bedGraph use the same coordinates.** WIG is 1-based and bedGraph is 0-based. Converting `variableStep` `166012441` to bedGraph `166012441` shifts the track by one base.
13. **The fixedStep span defaults to 1.** UCSC's doc says so, but `wigToBigWig` uses `span = step`. Write `span=` explicitly.
14. **bigWig is a gzipped WIG.** It is a binary indexed file with zoom summaries. It cannot be opened in a text editor or indexed with tabix.
15. **The BEDPE end intervals are the deleted region.** They are uncertainty windows around each breakpoint. The deleted segment lies *between* them.
16. **BEDPE strands are gene strands or read strands.** They encode junction orientation. In the reading that fits LUMPY's `+-` = deletion, `+` means the retained sequence lies left of the breakpoint and `-` means it lies right. 10x writes `+ +` for everything, so strand-based typing fails on 10x files.
17. **BEDPE is standardised like VCF.** It is a bedtools convention. Columns 11+ differ between LUMPY, svtools and 10x, and there is no version string.

---

## 8. Exercise bank

Every snippet states its separators. "TAB" means one TAB character.

**E1 - simulator: "Slice ruler" (BED Lesson, opener).** A 12-base ruler `ACTGCGTTAGCA` with fence posts numbered 0-12. The learner drags two handles to make the BED interval `[2,4)`. A live readout shows the sequence `TG`, the length `end-start = 2`, the 1-based display `3-4`, and Python `seq[2:4]`. A toggle shows how a 1-based closed interval `3-4` maps to the same bases. Challenge: create a zero-length interval at 5 and see "insertion point between base 5 and 6 (1-based)". *Concept: fence posts and half-open intervals.*

**E2 - predict: "How big is the target?"** Snippet (single TAB between columns):
```
chr2	166012440	166012660	SCN1A_T3
```
Predict (a) its length and (b) the browser position string. **Answer:** 220 bp; `chr2:166,012,441-166,012,660`. *Explanation:* length is end − start; the browser adds 1 to the start only.

**E3 - predict: "Do these touch?"** Two BED intervals (TAB-separated): a padding interval upstream of T3, `chr2	166012340	166012440`, and target T3, `chr2	166012440	166012660`. Predict whether `bedtools intersect` reports an overlap, and what `bedtools merge` produces. **Answer:** no overlap (bookended, no shared base). Merge gives one interval, `chr2	166012340	166012660`, because merge joins bookended features by default (merge.rst).

**E4 - spot-the-error (multi-round): "Vendor targets file".** Each round is one snippet; the learner clicks the offending line or field. Separators are single TABs unless noted.
- Round A:
  ```
  chr2	166009870	166010052	SCN1A_T2
  chr2	166012660	166012440	SCN1A_T3
  ```
  Line 2: start > end (BED-S05).
- Round B (line 2 uses single **spaces**, not tabs):
  ```
  chr2	166009870	166010052	SCN1A_T2
  chr2 166012440 166012660 SCN1A_T3
  ```
  Line 2. It is legal under BEDv1's whitespace rule but breaks bedtools and tabix (BED-C02), and mixes separators. *Teaching point: spec-valid ≠ tool-valid.*
- Round C:
  ```
   #Exome v2 targets, GRCh38
  chr2	166012440	166012660	SCN1A_T3
  ```
  Line 1 starts with a space, so it is not a comment; it is a malformed data line (BED-S16).
- Round D:
  ```
  chr2	242193500	242193600	tail_probe
  ```
  The end exceeds chr2's GRCh38 length of 242,193,529 (BED-M01).

**E5 - fix-it: "Absolute blockStarts" (BED12).** Editable, validator live (BED-S13/S14/S15). Single TABs between the 12 columns:
```
chr22	1000	5000	txA	0	-	1100	4800	0	3	200,300,488,	1000,2500,4512,
```
Validator message: "blockStarts must be relative to chromStart; first block must start at 0; last block must end at chromEnd". **Correct fix:** `0,1500,3512,`. Blocks become [1000,1200), [2500,2800), [4512,5000), and 3512 + 488 = 4000 = 5000 − 1000. Accept equivalent answers without the trailing comma.

**E6 - sort: "Which format is this line?"** Bins: BED, bedGraph, BEDPE, WIG, GTF, VCF, "ambiguous". Lines (TABs as shown):
1. `chr2	166012440	166012660	SCN1A_T3` → BED
2. `fixedStep chrom=chr2 start=166012441 step=20 span=20` (spaces) → WIG
3. `chr2	166012360	166012380	chr2	166012728	166012748	DEL_1	87	+	-` → BEDPE
4. `chr2	HAVANA	exon	166012441	166012660	.	-	.	gene_id "ENSG00000144285"; ...` → GTF (numbers in cols 4-5, 1-based; coordinates illustrative; attribute column truncated)
5. `#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO` → VCF
6. `chr2	166012440	166012660	0.49` → **ambiguous** (bedGraph or BED4 with name "0.49"). Reward the learner for choosing "ambiguous" and saying what would disambiguate it.
7. `track type=wiggle_0 name="proband_depth"` (spaces) → WIG
8. `chr2	166012440	166012660	SCN1A_T3	0	-	166012440	166012660	0	1	220,	0,` → BED (BED12, one block)

**E7 - simulator: "WIG ↔ bedGraph converter".** The learner edits a declaration (`fixedStep start/step/span`) and values. A ruler draws each item's covered bases with both 1-based labels and the equivalent bedGraph lines. Challenge: set `span=30` with `step=20` and see overlapping bars, flagged as WIG-M02. Challenge 2: delete `span=` and toggle "UCSC doc default (1)" vs "wigToBigWig default (= step)" to see why WIG-C01 exists.

**E8 - predict: "Which bases does the third value cover?"** Snippet (spaces):
```
fixedStep chrom=chr2 start=166012441 step=20 span=20
51
60
63
```
**Answer:** 1-based 166,012,481-166,012,500. As a bedGraph line (TABs): `chr2	166012480	166012500	63`. *Explanation:* index 2 → `start + 2*step`; subtract 1 for the 0-based start; end = start0 + span.

**E9 - spot-the-error: "WIG that won't convert".** Click the line `wigToBigWig` aborts on (spaces throughout):
```
track type=wiggle_0 name="proband_depth"
variableStep chrom=chr2 span=50
166012441 61
166012481 64
166012531 62
```
**Answer:** line 4. The item at 166012441 covers through 166012490, so `166012481` overlaps it ("Overlap on chr2 between items starting at ..."; WIG-M02). Variant round: `fixedStep chrom=chr2 start=0 step=20 span=20` is the offending line (WIG-S06; the real kent message is quoted in the explanation).

**E10 - simulator: "Exon-dip explorer" (WIG Lesson centrepiece).** Tracks for child, mother and father over targets T1-T4, drawn from the case WIG and bedGraph. Controls: "raw depth" vs "ratio to parental mean", and a target selector. A predict gate comes first: "Before revealing the parents, is the T3 dip a deletion?" The learner must commit to an answer. Then the reveal shows the parents normal at T3 (ratio 0.49 vs ~1.0 elsewhere). A second panel shows a different target that dips in all three samples, which is a capture artefact. Expected-ratio guide: het deletion ≈ 0.5, hom deletion ≈ 0, duplication ≈ 1.5.

**E11 - field-explorer: "Read the breakpoint pair".** Hover each column of (TAB-separated, 12 columns):
```
chr2	166012360	166012380	chr2	166012728	166012748	DEL_1	87	+	-	DEL	SR=9;PE=6
```
Tooltips cover: the breakpoint window (not the deleted region); strand `+` (sequence to the left of the breakpoint is retained); strand `-` (sequence to the right is retained); `SR` split reads; `PE` discordant pairs. A final quiz tooltip: "How many bases are deleted?" Answer: 166012738 − 166012370 = 368.

**E12 - simulator: "Junction drawer" (BEDPE Lesson).** The learner picks chrom1/chrom2 and strand1/strand2. The drawing shows the two retained segments being joined, the read-pair arrows that would support the junction, and the LUMPY type name: `+-` deletion, `-+` tandem duplication, `++`/`--` inversion, different chromosomes inter-chromosomal. Challenge: "Make the BEDPE line that describes a tandem duplication of T3." Valid answers have the same chromosome, `-` then `+`, and windows flanking T3.

**E13 - fix-it: "Nine columns".** Editable, TAB-separated:
```
chr2	166012360	166012380	chr2	166012728	166012748	DEL_1	87	+
```
Validator: BEDPE-S01 ("6, 7, 8 or 10+ fields"). **Accepted fixes:** add `	-` (10 columns, deletion) or delete `	+` (8 columns). Explanation: bedtools cannot know whether a lone strand belongs to end 1 or end 2.

**E14 - sort: "Valid BEDv1 or not?"** Statements and snippets go into *valid* / *invalid* / *valid-but-tools-will-choke*:
- `chr2	100	100` → valid (insertion point)
- a BED10 line → invalid
- strand `*` → invalid
- a file with a `track` line → invalid (it is a track file)
- `chrUn_KI270435v1` as chrom → valid
- space-separated BED3 → valid-but-chokes
- `score 7.3e-05` → invalid in BEDv1 (bedtools tolerates)
- `itemRgb 0` → valid

**E15 - predict + mcq: "Can this exome see that breakpoint?"** Given T3 and a hypothetical breakpoint 5 kb into the intron, predict whether split reads could be observed. Answer: unlikely. Capture only pulls fragments overlapping the baits, plus some fragment overhang, so far-intronic breakpoints are mostly invisible to an exome [reasoning; verify the typical flank coverage with the course team]. This motivates the case design (breakpoints within ~70 bp of T3) and the later move to long reads.

---

## 9. Quiz bank

**Q1.** A capture-target line reads (TABs) `chr2	166012440	166012660	SCN1A_T3`. Which 1-based closed interval does it cover?
- a) 166,012,440-166,012,660. *No: that reads the start as 1-based, so it includes one extra base on the left.*
- **b) 166,012,441-166,012,660.** *Correct: add 1 to the start only.*
- c) 166,012,441-166,012,661. *No: the BED end is already the last base in 1-based terms.*
- d) 166,012,440-166,012,659. *No: that shifts the whole interval left by one.*

**Q2.** Which line is valid under GA4GH BEDv1? (All TAB-separated.)
- a) `chr2	100	200	T3	0	*`. *No: strand must be `+`, `-` or `.`.*
- **b) `chr2	150	150	ins_site`.** *Correct: zero-length features are allowed (insertion point).*
- c) `chr2	100	200	T3	1200	+`. *No: score must be 0-1000.*
- d) `chr2	100	200	T3	0	+	90	200`. *No: thickStart must be ≥ chromStart.*

**Q3.** Using LUMPY's convention, what does this record describe? (TABs) `chr2	166012360	166012380	chr2	166012728	166012748	SV_7	55	-	+`
- a) Deletion. *No: a deletion is `+-`.*
- **b) Tandem duplication of roughly chr2:166,012,371-166,012,738.** *Correct: `-+` means the right end is joined back to the left end.*
- c) Inversion. *No: inversions are `++` or `--`.*
- d) Translocation. *No: both ends are on chr2.*

**Q4.** The `tabix -p bed targets.bed.gz` command fails on the vendor file. Which causes are plausible? (multi-select)
- **a) The first lines are `browser`/`track` lines.** *Yes: tabix parses them as data and they have no integer columns (skip them with `-S` or strip them).*
- **b) The file was compressed with plain `gzip`.** *Yes: tabix needs BGZF.*
- **c) The columns are separated by spaces.** *Yes: tabix splits only on TAB (tbx.c).*
- **d) The file is sorted naturally (chr1, chr2, ..., chr10) rather than lexicographically.** *No: any chromosome order is fine as long as each chromosome is contiguous and starts are non-decreasing.*
- e) The fourth column contains gene names. *No: extra columns are fine.*

**Q5.** In the child, depth over target T3 is 0.49× the parental mean; T2 and T4 are ~1.0×; both parents look alike. What is the best next step?
- a) Report a pathogenic de novo deletion. *Premature: depth alone is a candidate signal.*
- **b) Look for split and discordant reads at the edges of T3 (a BEDPE breakpoint pair), then confirm with an orthogonal method.** *Correct: breakpoints turn a dip into a structural hypothesis with an exact size.*
- c) Ignore it, because exome depth always dips between exons. *No: that applies to introns, not to a drop within a target relative to the same target in other samples.*
- d) Re-sequence the parents. *No: they already provide the comparison.*

**Q6.** You need per-target mean depth for 200,000 targets of varying length. Which format?
- a) WIG `fixedStep`. *No: it needs a fixed step and span.*
- b) WIG `variableStep`. *No: it needs one span for the dataset.*
- **c) bedGraph (then bigWig for the browser).** *Correct: each line carries its own start and end.*
- d) BEDPE. *No: that is for pairs of loci.*

**Q7.** Convert the WIG item `variableStep chrom=chr2 span=20` / `166012441 61` into bedGraph (TABs).
- **a) `chr2	166012440	166012460	61`.** *Correct.*
- b) `chr2	166012441	166012461	61`. *No: it forgets that bedGraph is 0-based.*
- c) `chr2	166012440	166012461	61`. *No: that makes 21 bp.*
- d) `chr2	166012441	166012460	61`. *No: that copies 1-based closed numbers into a half-open format.*

**Q8.** Two BED files from different labs give zero overlaps for exome targets vs ClinVar SV regions, with no error message. What is the most likely cause?
- **a) One uses `chr2` and the other `2` (or a different build).** *Correct: BED carries neither build nor naming metadata (BEDv1 §4).*
- b) One file is BED4 and the other BED6. *No: column counts can differ between files.*
- c) Neither is sorted. *No: unsorted input still works without `-sorted`.*
- d) Both use 0-based coordinates. *No: they should.*

---

## 10. Case-thread hooks

- **BED lesson: "What did we actually look at?"** The sequencing core sends `exome_targets_GRCh38.bed`. The learner checks that the file's naming matches the reference (`chr2`, GRCh38), measures territory (`end-start`), and confirms the *SCN1A* targets T1-T4 are present. A twist: the vendor file starts with `browser`/`track` lines, so the learner discovers it is a `.track` file by the strict spec and strips the header before tabix (E4, Q4). This plants the idea that a region outside the targets cannot show anything.
- **WIG lesson: "A dip over one exon".** The child's depth track (`proband.depth.wig`, fixedStep 20-bp bins) shows T3 at about half the depth of T2. The parents' tracks are normal, and the ratio bedGraph shows 0.49. Red herrings: near-zero depth between targets (introns, uncaptured), and a GC-rich target that dips in all three samples. Conclusion: a *candidate* heterozygous de novo deletion of T3 (E10, Q5). *SCN1A* haploinsufficiency, including exon deletions, is an established cause of Dravet syndrome [from memory - verify; the owner picks the gene].
- **BEDPE lesson: "The breakpoint pair".** `proband.sv.bedpe` contains `DEL_1` (`+ -`, 9 split reads, 6 discordant pairs) whose windows flank T3. The deletion is 368 bp and spans the whole target. bedtools `pairtobed -type ispan` with the targets BED reports the record because the span `[end1, start2]` overlaps T3 (option semantics verified in `pairToBedMain.cpp`). Optional twist to motivate the PAF/GFA lesson: a second record nearby with `++` and its partner `--` suggests the event is **complex** (deletion plus inversion). Short reads cannot assemble the order of the pieces, but long reads in PAF can.
- **Capstone: case folder triage.**
  - `targets.bed`: has a track line, so it is a strict-BED violation (BED-S17), but usable.
  - `targets_hg19.bed`: a build mismatch (BED-M02). Detectable by coordinates past GRCh37 contig ends, or by names.
  - `proband.depth.wig`: valid.
  - `proband.depth.bw`: identify it from the magic bytes `26 FC 8F 88`.
  - `ratio.bedGraph`: has an overlap planted for WIG-G03.
  - `proband.sv.bedpe`: one 9-column line planted for BEDPE-S01.

---

## 11. "Read more" candidates

1. **BEDv1 vs reality on contig names.** The spec's `[A-Za-z0-9_]{1,255}` would reject names containing `.`, `-`, `*` or `:`. Such names occur in real assemblies and alt/HLA contig sets [from memory - verify specific examples].
2. **Why BED10/BED11 are prohibited.** `blockCount` without `blockSizes`/`blockStarts` is meaningless (§1.5).
3. **Track files vs BED.** BEDv1 §5 says files with `track`/`browser` lines are not BED and should use `.track`. UCSC custom tracks and bedtools accept them, while `bedToBigBed` and tabix do not.
4. **Information that must travel out-of-band** (BEDv1 §4): genome assembly, which columns are custom, score semantics, and whether the separator is a single TAB. That is why BED is "small but under-specified".
5. **BEDn+m and autoSql.** Custom columns are typed via autoSql `.as` files for `bedToBigBed -as ... -type=bed6+3` (BEDv1 §3.3; bigBed.html).
6. **tabix internals.** `format & 0x10000` flags 0-based BED coordinates. The bin scheme uses 16 kb linear-index windows (tabix.tex). If begin and end columns are the same, end = beg + 1.
7. **bigWig/bigBed internals** (bbiFile.h): header with magic, version (current 4), zoomLevels, chromosome B+ tree, R-tree data index, and per-zoom summaries (`validCount, minVal, maxVal, sumData, sumSquares`). Version 4 "added an extra sig at end of file". Data sections inside bigWig keep the original type: bedGraph=1, variableStep=2, fixedStep=3 (bwgInternal.h). That is why `bigWigToWig` returns bedGraph for files built from bedGraph (wiggle.html).
8. **Wiggle precision loss in UCSC custom tracks.** Uploaded WIG is stored "in 128 unique bins", so exported values lose precision. Use bedGraph if exact values matter (wiggle.html).
9. **The fixedStep `span` default discrepancy** (doc: 1; `wigToBigWig`: `= step`).
10. **Zero-length features in bedtools**: the legacy parser expands `start == end` to `[start-1, end+1)` for overlap tests (`bedFile.h`).
11. **BEDPE ↔ VCF breakends.** svtools maps VCF BND ALT brackets to strands. An ALT that *starts* with the bracket gives strand1 `-`, and `[` as the separator gives strand2 `-` (`vcftobedpeconverter.py`). CIPOS/CIEND become the end windows.
12. **`pairtobed -type` menu**: `either` (default), `both`, `neither`, `xor`, `notboth`, `ispan` = `[end1,start2]`, `ospan` = `[start1,end2]`, `notispan`, `notospan`. The span types ignore inter-chromosomal records (pairToBedMain.cpp).
13. **UCSC interact/bigInteract** (BED5+13) is the browser's arc format for pairwise interactions. It is a cousin of BEDPE with source and target blocks (interact.html).
14. **Memory cost of conversion**: `wigToBigWig` uses about 50% more RAM than the uncompressed input; `bedGraphToBigWig` uses about 25% more (bigWig.html).

---

## 12. Sources

**Read (fetched 2026-10-16):**
- GA4GH BED v1.0: https://raw.githubusercontent.com/samtools/hts-specs/master/BEDv1.tex. Last modified 2022-01-05, commit `9ddbc52`, per https://github.com/samtools/hts-specs/commits/master/BEDv1.tex (read via WebFetch). Section numbers above are the LaTeX numbering: §1.3 terms, §1.4 lines, §1.5 fields, §1.6 coordinates, §1.7 simple attributes, §1.8 display, §1.9 blocks, §1.10 custom, §2 examples, §3 recommended practice (§3.4 sorting, §3.5 whitespace, §3.6 large files), §4 out-of-band, §5 track files.
- Tabix index format: https://raw.githubusercontent.com/samtools/hts-specs/master/tabix.tex
- bedtools2 docs: https://raw.githubusercontent.com/arq5x/bedtools2/master/docs/content/general-usage.rst (BED, BEDPE, genome file), `.../tools/pairtopair.rst`, `.../tools/bamtobed.rst`, `.../tools/merge.rst`, `.../tools/intersect.rst`. (`.../tools/pairtobed.rst` is a stub, so the usage text was taken from source.)
- bedtools2 source: `src/utils/bedFile/bedFile.h`, `src/utils/bedFile/bedFile.cpp`, `src/utils/bedFilePE/bedFilePE.cpp`, `src/pairToBed/pairToBedMain.cpp` (raw.githubusercontent.com/arq5x/bedtools2/master/...)
- UCSC help pages via the kent source mirror (genome.ucsc.edu itself was unreachable): https://raw.githubusercontent.com/ucscGenomeBrowser/kent/master/src/hg/htdocs/goldenPath/help/{wiggle.html, bedgraph.html, bigWig.html, bigBed.html, interact.html, customTrack.html} and `.../htdocs/FAQ/FAQformat.html`. These are the current master pages, which carry no version numbers.
- UCSC kent source: `src/inc/sig.h` (magic numbers), `src/inc/bbiFile.h` (bbi layout, version 4), `src/inc/bwgInternal.h`, `src/lib/bwgCreate.c` (wigToBigWig parser), `src/lib/linefile.c`, `src/utils/bedGraphToBigWig/bedGraphToBigWig.c`
- htslib: `tabix.1`, `tbx.c`, `hts.c` (raw.githubusercontent.com/samtools/htslib/develop/...)
- LUMPY: https://raw.githubusercontent.com/arq5x/lumpy-sv/master/README.md, `src/lumpy/SV_BreakPoint.cpp` (BEDPE printer), `src/lumpy/SV_Pair.cpp` (strand → type)
- svtools: https://raw.githubusercontent.com/hall-lab/svtools/master/README.md, `Tutorial.md`, `svtools/vcftobedpe.py`, `svtools/vcftobedpeconverter.py`
- mosdepth README: https://raw.githubusercontent.com/brentp/mosdepth/master/README.md
- Web-search summaries only (underlying pages not fetched): 10x Long Ranger BEDPE docs (software.10xgenomics.com/genome-exome/software/pipelines/2.2/output/bedpe); NCBI Gene 6323 *SCN1A* GRCh38 coordinates; Agilent SureDesign help and a Biostars post on SureSelect `Covered.bed` headers.

**Could not reach:**
- https://genome.ucsc.edu/goldenPath/help/wiggle.html, `.../bedgraph.html`, https://genome.ucsc.edu/FAQ/FAQformat.html (DNS failure via WebFetch; content read from the GitHub kent mirror instead)
- support.10xgenomics.com and software.10xgenomics.com (DNS failure)
- www.biostars.org, earray.chem.agilent.com (DNS failure)
- deepTools source on raw.githubusercontent.com (paths 404), so the deepTools/igvtools/`genomecov -bg` output claims are marked [from memory - verify]
- GitHub REST API for hts-specs (not enabled for this session; used WebFetch on github.com instead)
