# Research: PAF and GFA (long-read mappings and sequence graphs)

Research notes for the "Genomic File Formats" course, PAF/GFA lesson(s). Written 2026-10-16. Rule-ID prefixes are `PAF-` and `GFA-`. rGFA rules are filed as `GFA-R`.

**Evidence tags used below**

- **[spec]**: read directly in the primary sources fetched on 2026-10-16:
  - `PAF.md` (miniasm master, undated, 12 columns);
  - the minimap2(1) man page (minimap2-2.31 r1302, dated 19 May 2026);
  - `GFA1.md` (front matter date 2022-06-07; it covers GFA 1.0, W lines "since v1.1" and J lines "since v1.2");
  - `GFA2.md`;
  - `rGFA.md` (gfatools; also defines GAF).
- **[source]**: read in the reference implementation's code: minimap2 `format.c`, `hit.c`, `align.c`, `main.c`, `misc/paftools.js`; gfatools `gfa-io.c`, `gfa-base.c`.
- **[verified: test]**: run in a scratch directory on 2026-10-16 with minimap2 2.31-r1302 and gfatools 0.5-r296, both compiled from the GitHub master sources, plus pysam 0.24.1 (htslib) for tabix. Simulated sequences only. Messages are quoted exactly.
- **[web-search summary]**: seen only in search-result summaries; the page itself was not opened.
- **[from memory - verify]**: no primary source was reached. Check before the claim ships.

**Tabs.** In every code block, the fields of PAF, GAF, GFA, BEDPE, SAM and BLAST-tabular lines are separated by single literal TAB characters. Prose writes a tab as "TAB". The one exception is GFA2 `O`/`U` group lines: their member lists are space-separated *inside* one TAB-delimited column (GFA2.md).

**Case coordinates.**

- The chr2 coordinates sit inside the GRCh38 *SCN1A* locus used by the other notes. chr2 length is 242,193,529.
- The 368-bp deletion [166012370, 166012738) is the BEDPE lesson's `DEL_1`.
- The inversion [166013500, 166015900) and all population-graph details are **illustrative**.
- The PAF lines are real minimap2 2.31 output on simulated reads. The reads were drawn from a random 40-kb sequence standing in for chr2:166,000,001-166,040,000. Target coordinates were then shifted by +166,000,000 and the target renamed `chr2` with length 242,193,529.
- Where a tag list was trimmed for display, the text says so.

---

## 1. Purpose and place in the pipeline

### PAF (Pairwise mApping Format)

- **What it is.** One line per mapping between an interval of a *query* sequence and an interval of a *target* sequence. It is "a text format describing the approximate mapping positions between two set of sequences" (PAF.md [spec]).
- **Producers.**
  - minimap2 writes PAF by default. Without `-c` the mapping is approximate (no CIGAR). With `-c` it is base-level, and the CIGAR goes in the `cg:Z:` tag (minimap2(1) [spec]).
  - minigraph writes PAF for sequence-to-sequence mapping (minigraph README [spec]).
  - `paftools.js sam2paf` and `delta2paf` (MUMmer) convert other formats to PAF (minimap2 `misc/README.md` [spec]).
  - wfmash (the PGGB aligner) also writes PAF [from memory - verify].
- **Consumers.**
  - miniasm builds assemblies from all-vs-all read overlaps. PAF was defined in the miniasm repository.
  - `paftools.js` subcommands: `call` (variants from assembly-to-reference PAF with `cs`), `liftover`, `stat`, `view`, `splice2bed` [spec: misc/README].
  - Minigraph-Cactus `cactus-graphmap-split` takes "<inputGFA> <inputPAF>" (cactus `pangenome.md` [spec]).
  - Polishers (racon) and dot-plot viewers [from memory - verify].
- **Typical uses** (minimap2 README and man page presets [spec]):
  1. long-read-to-reference mapping (`map-ont`, `map-hifi`, `lr:hq`);
  2. assembly-to-reference and assembly-to-assembly alignment (`asm5`, `asm10`, `asm20`, chosen by divergence: about 0.1%, about 1%, several percent);
  3. whole-genome alignment between closely related genomes (the same `asm*` presets);
  4. all-vs-all read overlaps for assembly (`ava-ont`, `ava-pb`).
- **Disease question.** *"Where does each long molecule from the patient come from in the reference? In how many pieces, in which orientation, and how well does each piece match?"*
  - In the trio, this turns a short-read breakpoint pair with confusing extra signals into one ordered structure.
- **A practical caveat for the lesson.** Long-read SV callers (Sniffles, cuteSV, pbsv) read SAM/BAM, not PAF [from memory - verify]. Production pipelines therefore run `minimap2 -a`.
  - PAF is the quick-look, assembly-comparison and graph-building view of the *same* alignments.
  - Teach it as "the same alignment in a lighter outfit".

### GFA (Graphical Fragment Assembly)

- **What it is.** A TAB-delimited text format "to capture sequence graphs as the product of an assembly, a representation of variation in genomes, splice graphs in genes, or even overlap between reads" (GFA1.md [spec]).
- **Producers.**
  - Assemblers. The GFA-spec README lists Canu, miniasm, SPAdes, Unicycler, ABySS, bcalm2 and others [spec]. hifiasm and Flye also write GFA [from memory - verify].
  - Pangenome builders:
    - minigraph writes **rGFA**: S and L lines only, with stable coordinates. Its `sv.gfa` "doesn't have embedded paths for the input sequences" (cactus doc [spec]).
    - Minigraph-Cactus writes GFA 1.1, "as it represents haplotypes as Walks" [spec].
    - PGGB writes P lines named with PanSN `sample#hap#contig` (PanSN README [spec]).
- **Consumers.**
  - Bandage (visualisation).
  - gfatools: `stat`, `view`, `bubble`, `gfa2fa`, `gfa2bed`.
  - minigraph maps reads or assemblies to a graph and writes **GAF**; `--call` reports the path each sample takes through each bubble.
  - vg converts GFA to its indexed GBZ for `vg giraffe`.
- **Disease question.** *"Has this allele been seen among hundreds of human haplotypes, or is it new? Which path does the patient's haplotype take through each site of variation?"*
  - A second payoff: reads that come from a known alternative allele stop looking like errors once that allele is in the reference.
  - The HPRC draft pangenome (Liao et al. 2023, *Nature* 617:312) reported that using it for short-read analysis "reduced small variant discovery errors by 34% and increased the number of structural variants detected per haplotype by 104%" compared with GRCh38-based workflows [web-search summary of the abstract].
- **Current human pangenome scale** [spec: hpp_pangenome_resources README]:
  - HPRC year 1 (README-v1): 47 samples assembled. The graphs used 90 haplotypes (44 samples plus GRCh38 and CHM13).
  - Release 2: 232 samples assembled (464 assemblies). The v2.1 graphs are built as Minigraph-Cactus and minigraph graphs on GRCh38, CHM13 and GRCh37 backbones, with a stated total of 464 haplotypes.
  - The README says these "have not been fully QC'd, are not published". The release 2 preprint DOI is listed there.

**Pipeline position.**

```text
long reads (FASTQ) --minimap2 -c--> PAF   (pieces, strands, identity)
                   --minimap2 -a--> BAM --> SV caller --> VCF (SVTYPE=DEL/INV)
assemblies (FASTA) --minigraph / Minigraph-Cactus--> GFA (pangenome) --gfatools bubble / vg deconstruct--> BED / VCF
reads or contigs ---minigraph--> GAF   (paths through the graph; GAF is a superset of PAF)
```

## 2. Mental model

### PAF: the plagiarism checker's report

A plagiarism checker does not reprint the essays. It lists *passages*: "words 0-7,762 of essay Q (19,998 words) match words 166,005,370-166,013,500 of book T; 7,739 identical words out of 8,137 aligned positions; confidence 60". If a passage was pasted in backwards, it says so (`-`). The texts themselves stay in their own files (the FASTA/FASTQ).

**The design problem and why PAF looks the way it does**

- **Both sequences are described the same way** (name, length, start, end). The same format then covers read-to-reference, contig-to-contig and read-to-read overlaps.
  - Lengths are on every line, so a tool can tell whether a mapping reaches the *end* of a sequence without opening the FASTA.
  - That is what an overlap assembler needs: is it a dovetail overlap, or is one read contained in the other?
- **No sequences, no qualities, no header.** Lines are small, streamable and `awk`-friendly. The price: PAF alone never shows you a base.
- **Columns 10-11 may be approximate.** Mapping without base alignment is much faster. PAF.md allows it: the two columns are "still required but may be highly inaccurate" [spec].
- **Each sequence's coordinates are on its own forward strand.**
  - Column 5 only says whether one of the two must be reverse-complemented to match the other.
  - There is no flipped arithmetic on either sequence.
- **0-based half-open, like BED.** `cut -f6,8,9` turns PAF into a BED3 of the target intervals.

### GFA: a transit map

- **Segments are stations.** Each holds a piece of sequence, stored once even if 400 haplotypes pass through it.
- **Links are tracks between station ends.**
  - A segment has two ends, so each link says which way the train passes through each station (`+` forward, `-` reverse complement). This makes it a **bidirected graph**.
  - `L A + B +` and `L B - A -` are the same track seen from the other direction. gfatools stores both: 6 links become "Number of arcs: 12" [verified: test].
- **Paths and walks are train lines.** Each one is a contig or haplotype spelled as a list of oriented stations.
- **Bubbles are variant sites**: places where lines split and rejoin.
  - An insertion is an extra station on one branch.
  - A deletion is a track that skips a station.
  - An inversion is a line passing through the same station backwards.
- **The linear reference is just one train line among many.**

**Why it looks the way it does**

- **Assembly graphs vs pangenome graphs.**
  - In assembly graphs (overlap or string graphs; de Bruijn graphs with k−1 overlaps), neighbouring segments *share* bases at the junction. So L lines carry an overlap CIGAR.
  - Pangenome graphs are "blunt": `0M` everywhere. That is why W lines are only defined for graphs without overlaps (GFA1.md [spec]).
- **One namespace, names not numbers.** Segment and path names share one namespace (GFA1.md).
- **Graph coordinates are unstable.**
  - In plain GFA a base's address is (segment, offset). The coordinate "is unstable -- when we split a segment in half, the coordinate is changed" (rGFA.md [spec]).
  - rGFA therefore stamps each segment with its origin, SN (sequence name) and SO (offset), plus a rank SR. A graph built on GRCh38 keeps speaking GRCh38 coordinates.

## 3. Anatomy

### 3.1 PAF: the 12 mandatory columns (PAF.md; minimap2(1))

| Col | Type | Meaning | Notes |
|---:|---|---|---|
| 1 | string | Query name | |
| 2 | int | Query length | |
| 3 | int | Query start | "0-based; BED-like; closed" |
| 4 | int | Query end | "0-based; BED-like; open". On the query's **original** strand even when col 5 is `-` [source: `mm_reg_set_coor`, paftools `sam2paf`; verified: test] |
| 5 | char | Relative strand | `+` same strand, `-` opposite |
| 6 | string | Target name | |
| 7 | int | Target length | |
| 8 | int | Target start | "on original strand (0-based)" |
| 9 | int | Target end | "on original strand". Always forward-strand, so col 8 < col 9 |
| 10 | int | Number of residue matches | With an alignment: exact base matches. Without one: a seed-based estimate |
| 11 | int | Alignment block length | With an alignment: matches + mismatches + inserted + deleted bases. Approximate otherwise |
| 12 | int | Mapping quality | 0-255. 255 means missing |

- With an alignment, col 10 / col 11 is "the BLAST-like alignment identity" (minimap2(1) [spec]).
- In minimap2's approximate mode, col 10 counts bases covered by matching seeds, and col 11 sums the larger of the query/target gaps between consecutive seeds [source: `mm_cal_fuzzy_len`]. **Their ratio is not an identity.**
- Optional "SAM-like typed key-value pairs" may follow column 12 (PAF.md [spec]).

### 3.2 PAF tags written by minimap2 2.31 (minimap2(1) [spec]; [source] `format.c`)

| Tag | Meaning | Teaching note |
|---|---|---|
| `tp:A` | `P` primary, `S` secondary, `I`/`i` inversion (primary/secondary) | No "supplementary" type: every piece of a split read that SAM would flag 0x800 is `tp:A:P` in PAF [source: `write_tags` vs SAM flag code]. A short inverted piece rescued between two primary pieces is `tp:A:I` [verified: test] |
| `cm:i` | minimizers on the chain | |
| `s1:i` / `s2:i` | chaining score / best secondary chain score | `s2` near `s1` means the read could have gone elsewhere (repeat) |
| `NM:i` | mismatches + gap bases | minimap2 writes col 11 − col 10 + `nn` [source] |
| `AS:i`, `ms:i` | DP score; max-scoring-segment score | |
| `nn:i` | ambiguous bases | |
| `de:f` | gap-compressed divergence | 1 − matches/(blen − gap bases + gap opens). A 368-bp deletion counts once [source: `mm_event_identity`]. Only with `-c` |
| `dv:f` | approximate divergence | Written instead of `de` when there is no alignment |
| `rl:i` | query length in repetitive seeds | |
| `zd:i` | alignment broken by Z-drop | A hint that an SV split the read [verified: test] |
| `cg:Z` | CIGAR | "only in PAF". With `-c`. Ops along the target's forward strand |
| `cs:Z` | difference string | `--cs`. Short form `:n` identical run, `*xy` substitution (ref x → query y), `+seq` insertion, `-seq` deletion, `~` intron. `--cs=long` uses `=SEQ` for identical runs |

For `-` lines, `cs` and `cg` describe the reverse-complemented query against the forward target. The `*ag` at offset 355 below is reference `A` versus reverse-complemented read `G`; the read's forward base there is `C` [verified: test].

### 3.3 Annotated minimal VALID PAF line

This is a real minimap2 2.31 `-c --cs -x lr:hq` line: the inverted middle piece of the proband's long read. All tags are as written, with target coordinates shifted as described above. 24 TAB-separated fields:

```text
proband_lr_0173	19998	7762	10162	-	chr2	242193529	166013500	166015900	2391	2401	60	NM:i:10	ms:i:4738	AS:i:4738	nn:i:0	tp:A:I	cm:i:0	s1:i:0	s2:i:0	de:f:0.0042	rl:i:0	cg:Z:1089M1I387M1D923M	cs:Z::355*ag:345*cg:153*ac:66*ca:86*cg:20*at:58+t:387-t:787*ct:1*ag:133
```

- **Query.** Read bases [7762, 10162): 2,400 bases of a 19,998-base read.
- **Strand `-`.** The reverse complement of those read bases matches chr2 [166013500, 166015900), which is 1-based chr2:166,013,501-166,015,900 on the forward strand.
- **CIGAR check.**
  - Query-consuming ops M+I = 1089+1+387+923 = 2400 = 10162 − 7762.
  - Target-consuming ops M+D = 1089+387+1+923 = 2400 = 166015900 − 166013500.
  - Block length M+I+D = 2399+1+1 = 2401 = col 11.
- **cs check.**
  - The `:` runs sum to 2391 = col 10.
  - 8 substitutions plus 1 inserted base gives 2391+8+1 = 2400 = query span.
  - 8 substitutions plus 1 deleted base gives 2400 = target span.
  - NM = 8 + 1 + 1 = 10.
- **Identity.** BLAST-like 2391/2401 = 99.58%. `de` = 1 − 2391/(2401 − 2 + 2) = 0.0042.
- **`tp:A:I`.** The piece is an inversion rescued between two primary pieces. Its chain fields are 0 because it was found by alignment, not chaining.
- **MAPQ 60.** The placement is unique. It says nothing about base accuracy.

### 3.4 GFA1 records (GFA1.md [spec])

| Type | Required columns after the type letter | Since |
|---|---|---|
| `#` | comment (ignored) | 1.0 |
| `H` | none. Tag `VN:Z` gives the version | 1.0 |
| `S` | `Name` `[!-)+-<>-~][!-~]*`; `Sequence` `*` or `[A-Za-z=.]+` | 1.0 |
| `L` | `From`, `FromOrient` (`+`/`-`), `To`, `ToOrient`, `Overlap` (`*` or CIGAR `([0-9]+[MIDNSHPX=])+`) | 1.0 |
| `C` | `Container`, `ContainerOrient`, `Contained`, `ContainedOrient`, `Pos` (0-based leftmost position in the *forward* container), `Overlap` | 1.0 |
| `P` | `PathName`, `SegmentNames` (comma-separated `name+`/`name-`), `Overlaps` (`*` or n−1 comma-separated CIGARs) | 1.0 (`;` separator for jumps since 1.2) |
| `W` | `SampleId`, `HapIndex` (int), `SeqId`, `SeqStart` (`*`/int), `SeqEnd` (`*`/int, "BED-like half-close-half-open"), `Walk` `([><][!-;=?-~]+)+` | 1.1 |
| `J` | `From`, `FromOrient`, `To`, `ToOrient`, `Distance` (`*` or signed int). `SC:i:1` marks a shortcut | 1.2 |

- **L semantics.** "A link from A to B means that the end of A overlaps with the start of B." A `-` means "we replace the sequence of the segment with its reverse complement". `0M` means "B follows directly after A". In the CIGAR, the end of oriented A is the reference and the start of oriented B is the query.
- **Names.** No whitespace. They must not start with `*` or `=`, and must not contain `+,` or `-,`. Names are case-sensitive.
  - The W-line walk regex additionally excludes `<` and `>` from names used in walks.
  - "All record types share the same namespace, so a path may not have the same name as a segment."
- **Optional fields** have the form `TAG:TYPE:VALUE`.
  - Tags match `[A-Za-z][A-Za-z0-9]`. "Each TAG can only appear once in one line." Lowercase tags are reserved for end users.
  - Types: `A`, `i`, `f`, `Z`, `J` (JSON), `H` (hex), `B` (numeric array).
- **Reserved tags.**
  - S: `LN:i` length, `RC`, `FC`, `KC` counts, `SH:H` SHA-256 of the sequence, `UR:Z` URI of the sequence.
  - L: `MQ`, `NM`, `RC`, `FC`, `KC`, `ID`.
  - C: `RC`, `NM`, `ID`.
- **HapIndex.** "For a haploid sample, HapIndex takes 0. For a diploid or polyploid sample, HapIndex starts with 1."
- **W overlap rule.** Two W lines with the same (SampleId, HapIndex, SeqId) "should have no overlaps". "A valid walk must exist in the graph."

### 3.5 Annotated VALID GFA 1.0 with overlaps (the spec's own example)

```text
H	VN:Z:1.0
S	11	ACCTT
S	12	TCAAGG
S	13	CTTGATT
L	11	+	12	-	4M
L	12	-	13	+	5M
L	11	+	13	+	3M
P	14	11+,12-,13+	4M,5M
```

- `12-` is the reverse complement of TCAAGG, which is CCTTGA.
- `L 11 + 12 - 4M`: the last 4 bases of ACCTT (CCTT) equal the first 4 of CCTTGA (CCTT).
- `L 12 - 13 + 5M`: CTTGA equals CTTGA.
- `L 11 + 13 + 3M`: CTT equals CTT. Every overlap was checked by script [verified: test].
- Path 14 spells ACCTT + GA + TT = **ACCTTGATT**, which is the spec's stated result. The `Overlaps` field has 2 = 3 − 1 values.

### 3.6 Annotated VALID GFA 1.1 pangenome toy (blunt graph with walks)

```text
H	VN:Z:1.1
S	s1	ACGTTGCA
S	s2	GGATCCAT
S	s3	TTAGC
S	s4	CCCGGGAAT
S	s5	AGCTTA
L	s1	+	s2	+	0M
L	s2	+	s3	+	0M
L	s3	+	s4	+	0M
L	s4	+	s5	+	0M
L	s3	+	s4	-	0M
L	s4	-	s5	+	0M
W	GRCh38	0	chr2	0	36	>s1>s2>s3>s4>s5
W	POP01	1	ctg7	1200	1236	>s1>s2>s3<s4>s5
```

- **Segment lengths** are 8, 8, 5, 9 and 6, totalling 36. gfatools reports "Number of segments: 5", "Number of links: 6", "Number of arcs: 12", "Total segment length: 36" [verified: test].
- **The reference walk** spells `ACGTTGCAGGATCCATTTAGCCCCGGGAATAGCTTA`. The GRCh38 walk has HapIndex 0 because it is haploid.
- **POP01 haplotype 1** walks `<s4` (`ATTCCCGGG`) and spells `ACGTTGCAGGATCCATTTAGCATTCCCGGGAGCTTA`. That is an **inversion bubble** between s3 and s5.
- **W coordinates.** POP01's walk covers ctg7 [1200, 1236), and 1236 − 1200 = 36 = the walk length.
- **Spelling rule.** `>` means take the segment as is. `<` means take its reverse complement. Every consecutive pair needs a `0M` link in the matching orientation, or its mirror.

### 3.7 rGFA (rGFA.md [spec])

"rGFA is a strict subset of GFA. It disallows overlaps between segments and requires three additional tags on each segment":

| Tag | Type | Meaning |
|---|---|---|
| `SN` | Z | Name of the stable sequence the segment is derived from (e.g. `chr2`, or a sample contig) |
| `SO` | i | Offset on that stable sequence (0-based: `gfatools gfa2bed` prints `[SO, SO+LN)` [verified: test]) |
| `SR` | i | Rank. `0` means on the linear reference; `>0` means added later (rank 1 = the first added sample, and so on) |

minigraph also writes `SR:i` on L lines. gfatools reads it as the link's rank [source].

Case-scale rGFA, valid. Sequences are omitted (`*`), so `LN` is required. The S lines are 7 TAB-separated fields:

```text
S	s1	*	LN:i:7000	SN:Z:chr2	SO:i:166005370	SR:i:0
S	s2	*	LN:i:368	SN:Z:chr2	SO:i:166012370	SR:i:0
S	s3	*	LN:i:762	SN:Z:chr2	SO:i:166012738	SR:i:0
S	s4	*	LN:i:2400	SN:Z:chr2	SO:i:166013500	SR:i:0
S	s5	*	LN:i:9838	SN:Z:chr2	SO:i:166015900	SR:i:0
S	s6	*	LN:i:311	SN:Z:POP02#1#ctg7	SO:i:48210	SR:i:1
L	s1	+	s2	+	0M	SR:i:0
L	s2	+	s3	+	0M	SR:i:0
L	s3	+	s4	+	0M	SR:i:0
L	s4	+	s5	+	0M	SR:i:0
L	s3	+	s6	+	0M	SR:i:1
L	s6	+	s4	+	0M	SR:i:1
L	s3	+	s4	-	0M	SR:i:1
L	s4	-	s5	+	0M	SR:i:1
```

- The rank-0 segments tile chr2 [166005370, 166025738) with no gaps.
- `s2` is exactly the short-read `DEL_1` interval. It contains the exome target T3 [166012440, 166012660).
- `s6` is a 311-bp insertion allele (Alu-sized, illustrative). Its stable name follows PanSN.
- The inversion allele reuses `s4` backwards.

`gfatools bubble` on this graph [verified: test]:

- It **crashed (segmentation fault)** while the sequences were `*`. It needs real sequences.
- With random sequences filled in, it reported one multi-allelic site, `chr2	166013500	166015900`, with 3 paths, the inversion flag (column 6) set to 1, and allele lengths 2400-2711. The 311-bp insertion and the inversion share the same flanking segments, so they form a single site.
- It also printed trivial one-path rows at segment boundaries (column 5 = 1). The lesson should tell learners to ignore those.
- On the 36-bp toy rGFA, where the insertion sat between different segments, it reported two separate bubbles: an insertion with zero-length reference interval `chr2 16 16`, and the inversion.

### 3.8 GFA2 in one paragraph (GFA2.md [spec])

- **Header:** `H	VN:Z:2.0`.
- **Segments:** `S` carries an explicit length column. That length "does not need to be the actual length of the sequence ... but rather an indication to a drawing program". This is the opposite of what a GFA1 `LN` mismatch means.
- **Edges:** `E` lines replace both L and C. They give aligned intervals on each segment as tick-mark positions 0..L, with `$` marking the end ("It is an error to do otherwise"). A blunt join is `beg1 = end1 = x$` and `beg2 = end2 = 0`.
- **Other records:**
  - `G` gaps (scaffolds) with distance and variance;
  - `F` fragments (reads in a segment);
  - `O` ordered and `U` unordered groups, whose members are space-separated in one column.
- **Unknown record letters** "can be ignored".
- **Adoption.** Pangenome tooling (minigraph, Cactus, vg, PGGB) uses GFA1/1.1, so GFA2 is recognition-only in this course.

### 3.9 GAF in one paragraph (rGFA.md [spec])

GAF is the read-to-graph alignment format and "a strict superset of the PAF format". It has the same 12 columns, but column 6 is a **path**:

- oriented segments such as `>s2>s5>s6`;
- stable intervals such as `>chr1:5-8>foo:8-16`;
- or a bare stable name, which reduces the line to PAF.

Columns 7-9 are the path length and the start and end on the path. Extension `.gaf`; beware that Gene Ontology annotation files also use `.gaf` [from memory - verify].

## 4. Coordinate system and conventions

| Item | Convention | Source |
|---|---|---|
| PAF cols 3-4, 8-9 | 0-based half-open on each sequence's original (forward) strand. Col 5 is relative. For `-`, the reverse complement of query [qs, qe) aligns to target [ts, te) | PAF.md; minimap2(1) [spec]; [verified: test] |
| PAF → other formats | BED3 of target = cols 6, 8, 9 unchanged. SAM POS = col 8 + 1. Browser string = `chr2:(col8+1)-col9`. Reverse-complementing the read maps query [qs, qe) to [qlen−qe, qlen−qs) and flips col 5; target columns do not change | arithmetic; [verified: test] (§8 EX-04) |
| PAF sorting | None required, and minimap2 does not write a read's pieces in query order [verified: test]. Position tools need `sort -k6,6 -k8,8n` (`paftools.js call` asks for it) | misc/README [spec] |
| PAF header | None defined. Every line is a record | PAF.md |
| PAF compression and index | gzip or bgzip (`paftools.js` "seamlessly reads ... gzip'd"). No PAF-specific index, but a target-sorted, bgzipped PAF can be tabix-indexed with `-s6 -b8 -e9 -0` [verified: test, pysam 0.24.1] | tabix(1) htslib-1.24 [spec] |
| GFA segment offsets | 0-based (C `Pos`; GAF and W are BED-like). L/P overlaps are CIGARs (lengths, not positions) | GFA1.md |
| GFA orientation | `+`/`-` on L, C, J and inside P. `>`/`<` in W and GAF paths | GFA1.md; rGFA.md |
| W SeqStart/SeqEnd | 0-based half-open on SeqId, or `*` | GFA1.md |
| rGFA `SO` | 0-based offset; a segment covers `SN:[SO, SO+LN)` | rGFA.md example (`chr1:0-17`); gfa2bed [verified: test] |
| GFA2 positions | tick marks 0..L between bases; `$` marks L | GFA2.md |
| GFA line order | Not specified by GFA1. gfatools resolves W-line segment names *when it reads the W line*, so W before S loses steps (§5c) | [verified: test] |
| GFA header | Optional `H` with `VN:Z:1.0`, `1.1`, `1.2` or `2.0` | GFA1.md, GFA2.md |
| GFA compression and index | `.gfa.gz` (gzip). No text index. Tools build binary indexes (vg GBZ, xg; odgi `.og`) | cactus doc [spec] |
| GFA 1.1 → 1.0 | `vg convert -gfW` turns W into P; `vg convert -gf` goes back | cactus doc [spec] |

## 5. Validity rules

**Severity.**

- **error**: a spec MUST/must, a grammar violation, or data that cannot be interpreted.
- **warning**: a spec "should", or a check that only applies with extra information (CIGAR present, FASTA available).
- **convention**: not in the spec, but tools depend on it.

The "Tool behaviour" column records what minimap2 2.31 or gfatools 0.5-r296 did [verified: test]. **gfatools is lenient:** most violations are warnings or silent, which is why the course needs its own validator.

### 5a. PAF structural rules (PAF.md; minimap2(1) 2.31)

| ID | Rule | Spec | Minimal violation | Severity |
|---|---|---|---|---|
| PAF-S01 | ≥ 12 TAB-separated fields per line | PAF.md table | 11 fields; or spaces instead of TABs | error |
| PAF-S02 | Cols 2, 3, 4, 7, 8, 9, 10, 11 and 12 are non-negative integers | PAF.md types | `7762.5` or `-1` in col 3 | error |
| PAF-S03 | Col 5 is `+` or `-` | PAF.md col 5 | `.` or `F` | error (see PAF-C01 for `*`) |
| PAF-S04 | Col 12 is in 0-255; 255 means missing | PAF.md col 12 | `300` | error |
| PAF-S05 | Fields after col 12 are `TAG:TYPE:VALUE` (SAM-like) | PAF.md last paragraph | `tp=P`; `NM:10` | error |
| PAF-S06 | No header or comment lines | PAF.md defines records only | `#query	qlen	...` first line | error |

### 5b. PAF semantic and consistency rules

| ID | Rule | Basis | Minimal violation | Severity |
|---|---|---|---|---|
| PAF-M01 | `qstart < qend` and `tstart < tend`. Target coordinates are forward-strand even for `-`, so the target end is never smaller | PAF.md "start/end", "on original strand" | `...	-	chr2	242193529	166015900	166013500	...` | error |
| PAF-M02 | `qend ≤ qlen` and `tend ≤ tlen` | half-open intervals within a sequence | `mother_lr_0012	18240	0	18412` | error |
| PAF-M03 | Residue matches ≤ block length (col 10 ≤ col 11) | col 11 includes the matches | `2401	2391` | error |
| PAF-M04 | Block length ≥ max(query span, target span) when no intron (`N`) is present | col 11 = M + I + D; spans are M + I and M + D. Holds in minimap2's approximate mode too [source] | col 11 = 7000 with spans 7762/8130 | error with `cg`; warning without |
| PAF-M05 | If `cg:Z` is present: query-consuming ops (M/I/=/X) sum to `qend−qstart`; reference-consuming ops (M/D/N/=/X) sum to `tend−tstart`; M+I+D+=+X equals col 11 when `nn:i:0` | minimap2 `cg`; paftools sam2paf arithmetic [source] | `cg:Z:2400M` on a 2400/2400 line with col 11 = 2401 | error (spans), warning (col 11) |
| PAF-M06 | If `cs:Z` is present: `:` + `*` + `+` lengths equal the query span; `:` + `*` + `-` + `~` lengths equal the target span; the sum of `:` equals col 10 (no ambiguous bases) | minimap2 README cs grammar | `cs:Z::2400` with col 10 = 2391 | error (spans), warning (col 10) |
| PAF-M07 | The same target name has the same col 7 on every line. Likewise col 2 for a query | one sequence, one length | `chr2	242193529` and `chr2	243199373` in one file (GRCh38 vs GRCh37 [GRCh37 length from memory - verify]) | error |
| PAF-M08 | Col 7 matches the reference `.fai` length (build check) | needs the FASTA | GRCh37 lengths against a GRCh38 analysis | error (pipeline) |
| PAF-M09 | minimap2 `NM:i` = col 11 − col 10 + `nn` | [source] `write_tags` | `NM:i:3` with 2401/2391 | warning |

### 5c. PAF de facto conventions

| ID | Convention | Basis | Example | Severity |
|---|---|---|---|---|
| PAF-C01 | `--paf-no-hit` writes unmapped queries with strand and target `*` and zeros. This is not in PAF.md | minimap2(1) "strand and the reference name fields are set to `*`" | `junk	33	0	0	*	*	0	0	0	0	0	0	rl:i:0` [verified: test] | convention: accept, flag as unmapped |
| PAF-C02 | `tp:A` ∈ {P, S, I, i}. Several `P` lines per read are normal (split pieces) | minimap2(1) | three lines for one read: `P`, `P`, `I` [verified: test] | convention |
| PAF-C03 | `cg`/`cs`/`de` only with base-level alignment (`-c`, `--cs`); `dv` only without | minimap2(1); [source] | `dv:f` and `cg:Z` on one line | warning |
| PAF-C04 | Target-sorted (`sort -k6,6 -k8,8n`) before `paftools.js call` or tabix | misc/README | unsorted input to tabix fails | convention |
| PAF-C05 | Overlap (`ava-*`) lines report each pair once, with MAPQ 0 and `tp:A:S` | observed | `rA	8000	5001	7998	-	rB	9000	6002	8999	2997	2997	0	tp:A:S` [verified: test] | convention |
| PAF-C06 | Query names contain no whitespace; minimap2 takes the FASTA/FASTQ name up to the first whitespace | minimap2 `-y` copies comments separately [spec] | | convention |

### 5d. GFA1 structural rules (GFA1.md, 2022-06-07)

| ID | Rule | Spec | Minimal violation | Severity | gfatools 0.5 |
|---|---|---|---|---|---|
| GFA-S01 | TAB-delimited. The first field is a record type: `#`, `H`, `S`, `L`, `C`, `P` (1.0), `W` (1.1+), `J` (1.2+) | "Line structure" | `S s1 ACGT` (spaces) | error | line silently skipped |
| GFA-S02 | ASCII only ("not allowed to use a codepoint value higher than 127") | intro | `S	s1	ACGT	ds:Z:5′UTR` | error | not tested |
| GFA-S03 | Required column counts: S ≥ 3, L ≥ 6, C ≥ 7, P ≥ 4, W ≥ 7, J ≥ 6 | record tables | `L	s1	+	s2	+` (no overlap column) | error | treated as `0M` |
| GFA-S04 | Names match `[!-)+-<>-~][!-~]*`: they do not start with `*` or `=`, contain no `+,` or `-,`, and no whitespace. Names used in W walks contain no `<`/`>` | "Segment and path names"; W regex | `S	=s1	ACGT`; `S	a+,b	AC` | error | not checked |
| GFA-S05 | Sequence is `*` or `[A-Za-z=.]+` | S table | `S	s1	ACG T`; empty | error | not checked |
| GFA-S06 | Orientation fields are exactly `+` or `-`; P elements end in `+`/`-`; W steps start with `>`/`<` | L/C/J/P/W tables | `L	12	>	13	+	5M` | error | "[E] invalid L-line at line 6 (error code -2)" |
| GFA-S07 | Overlap is `*` or `([0-9]+[MIDNSHPX=])+` | L/C/P tables | `L	s1	+	s2	+	2Q` | error | **silently read as `0M`** |
| GFA-S08 | Tags are `TAG:TYPE:VALUE`: TAG `[A-Za-z][A-Za-z0-9]`, TYPE one of `AifZJHB`, VALUE matching the type regex. No TAG twice on a line | "Optional fields" | `LN:i:4	LN:i:5`; `LN:5` | error | not tested |
| GFA-S09 | W: HapIndex `[0-9]+`; SeqStart/SeqEnd `*` or `[0-9]+`; Walk `([><][!-;=?-~]+)+` | W table | `W	POP01	A	ctg7	0	36	>s1` | error | not checked |
| GFA-S10 | P `Overlaps` is `*` or exactly (n−1) CIGARs for n segments | P section ("must have one fewer values") | `P	14	11+,12-,13+	4M` | error | P ignored |
| GFA-S11 | J `Distance` is `*` or a signed integer; `SC:i` is 0 or 1 | J section (v1.2) | `J	1	-	2	+	far` | error | J ignored |

### 5e. GFA1 semantic and consistency rules

| ID | Rule | Basis | Minimal violation | Severity | gfatools 0.5 |
|---|---|---|---|---|---|
| GFA-M01 | Names are unique in one shared namespace for segments and paths | "share the same namespace" | `S	12	TCAAGG` and `P	12	11+,13+	3M` | error | duplicate S: **last one silently kept** |
| GFA-M02 | Every segment named on L, C, J, P or W lines is defined by an S line | "valid walk must exist in the graph"; link semantics | `L	11	+	14	+	3M` with no `S	14` | error | "[W] segment '14' is used on an L-line but not defined on an S-line"; W: "WARNING: failed to find segment 's2'", **step dropped** |
| GFA-M03 | `LN:i` equals the sequence length when both are given | LN = "Segment length" (contrast GFA2 §3.8) | `S	12	TCAAGG	LN:i:5` | error | "[W] for segment '12', LN:i:5 tag is different from sequence length 6"; keeps 6 |
| GFA-M04 | `S name *` needs `LN` (or `UR`) for the length to be known | S section | `S	s1	*` then `L	s1	+	s2	+	0M` | warning | treated as undefined and removed |
| GFA-M05 | Overlap fits: reference-consumed (M/D/N/=/X) ≤ len(From) and query-consumed (M/I/S/=/X) ≤ len(To) | L CIGAR definition | `S	s1	ACGT`, `L	s1	+	s2	+	6M` | error | "[W] overlap length longer than segment length for 's1': 6 > 4" |
| GFA-M06 | Overlap bases agree: suffix of oriented From vs prefix of oriented To (exact for `=`; `M` tolerates mismatches) | L CIGAR definition | `L	11	+	12	-	5M` (ACCTT vs CCTTG) | warning | not checked |
| GFA-M07 | Each consecutive pair in P is supported by an L line (or a J line where `;` is used, 1.2) in that orientation or its mirror (A+→B+ ≡ B−→A−) | Terminology: "supported by a link or a jump record" | `P	x	11+,13-	*` with only `L	11	+	13	+` | error | P ignored |
| GFA-M08 | P overlaps equal the corresponding L overlaps | P section (CIGARs can be fetched "from the corresponding link records") | `P	14	11+,12-,13+	5M,5M` while L says 4M | warning | P ignored |
| GFA-M09 | Each consecutive W step has a **0-overlap** link in that orientation or its mirror | Terminology: "must correspond to a 0-overlap link record" | `W	PROBAND	2	hap2ctg	0	28	>s1>s3<s4>s5` with no `L	s1	+	s3	+	0M` | error | **accepted silently** |
| GFA-M10 | W `SeqEnd − SeqStart` = the summed segment lengths, and `SeqStart ≤ SeqEnd` | "BED-like"; the spec example (0-11 = 5+2+4) | `W	POP01	1	ctg7	1200	1230	>s1>s2>s3<s4>s5` (needs 36) | warning (length), error (start > end) | accepted (`10	4` too) |
| GFA-M11 | W lines with the same (SampleId, HapIndex, SeqId) do not overlap | "should have no overlaps" | `ctg7 0 36` and `ctg7 20 50` | warning | not checked |
| GFA-M12 | HapIndex 0 means haploid; diploid samples use 1, 2 | W section | `W	POP01	0	...` and `W	POP01	1	...` | warning | not checked |
| GFA-M13 | The version supports the records: W needs `VN:Z:1.1`+; J and `;` in P need 1.2 | "since v1.1/1.2" | `H	VN:Z:1.0` plus W lines | warning (VN is optional) | not checked |
| GFA-M14 | C: `Pos` + contained length ≤ container length | C section | container 100 bp, `Pos` 110 | error | C ignored |
| GFA-M15 | `SH:H` equals SHA-256 of the sequence when both are present | S tags | wrong digest | error | not checked |

### 5f. rGFA rules (rGFA.md; gfatools)

| ID | Rule | Basis | Minimal violation | Severity | gfatools 0.5 |
|---|---|---|---|---|---|
| GFA-R01 | Every S line has `SN:Z`, `SO:i` and `SR:i` | "requires three additional tags on each segment" | `S	s2	*	LN:i:368	SN:Z:chr2	SR:i:0` (no SO) | error | SO defaults to 0 [source] |
| GFA-R02 | No overlaps: every L overlap is `0M` | "disallows overlaps between segments" | `L	s1	+	s2	+	5M` | error | not checked |
| GFA-R03 | Segments on one stable sequence do not overlap: the `[SO, SO+LN)` are disjoint | "When segments don't overlap on stable sequences ... uniquely indexed" | s2 `SO:i:166012370 LN:i:368` and s3 `SO:i:166012700` | error | not checked |
| GFA-R04 | All segments of one stable sequence carry the same rank | gfatools check | chr2 segments with `SR:i:0` and `SR:i:1` | error | "[W] stable sequence 'chr2' associated with different ranks on segment 's2': 0 != 1" |
| GFA-R05 | Rank-0 segments tile each reference sequence end to end | minigraph construction (rank 0 = "linear reference genome") | a gap between s1's end and s2's `SO` | convention / warning | not checked |

### 5g. GFA de facto conventions

| ID | Convention | Basis | Severity |
|---|---|---|---|
| GFA-C01 | Order H, S, L, then P/W. Required in practice: gfatools drops W steps that name segments not yet read ("W before S" gave an empty walk [verified: test]) | gfa-io.c [source] | convention |
| GFA-C02 | Each link is written once (not also its mirror). gfatools removes duplicates ("removed %d multiple link(s)") | gfa-base.c [source] | convention |
| GFA-C03 | Pangenome sequence names follow PanSN `sample#hap#contig` (P names, `SN` values) | PanSN README | convention |
| GFA-C04 | gfatools reads only S, L and W lines. P, C, J and H are skipped without a message [verified: test], so "gfatools parsed it" ≠ "valid" | gfa-io.c | convention (pitfall) |
| GFA-C05 | Minigraph segment IDs look like `s1`, `s2`. vg/Cactus use integers | observed | convention |

## 6. Recognition cues

| Clue | Format | Look-alikes and how to tell them apart |
|---|---|---|
| No header. ≥ 12 TAB columns. Col 5 is `+`/`-`. Cols 2 and 7 are lengths ≥ the coordinates beside them. Tags `tp:A:`, `cm:i:`, `s1:i:` | **PAF** (`.paf`, `.paf.gz`) | **BLAST outfmt 6**: 12 columns, but col 3 is a percent (`99.58`), there is no strand column, it is 1-based, and minus-strand hits have `sstart > send`. **SAM**: col 2 is a FLAG, col 6 a CIGAR, and there is a `@HD`/`@SQ` header. **BEDPE**: cols 1 and 4 are chromosomes, strands are in cols 9-10, and it has no lengths |
| PAF-like, but col 6 starts with `>`/`<` or contains `:start-end` | **GAF** (`.gaf`) | PAF has a plain name in col 6. GO annotation `.gaf` starts with `!gaf-version` [from memory - verify] |
| Lines start with one letter + TAB: `S`, `L`, `P`, `W` (`H	VN:Z:1.x`) | **GFA1** (`.gfa`, `.gfa.gz`) | **GFA2**: `H	VN:Z:2.0`, `E`/`G`/`O`/`U`/`F` lines, and `S` has a numeric 3rd column (`S	s1	8	ACGT...`). **GTF/GFF**: 9 columns starting with a sequence name |
| GFA whose S lines carry `SN:Z:`/`SO:i:`/`SR:i:`, and no P/W lines | **rGFA** (usually still `.gfa`) | Minigraph-Cactus GFA has `W` lines and usually no `SN`/`SO`/`SR` tags. The HPRC `sv.gfa` minigraph graphs do carry rGFA tags (JBrowse tutorial [web-search summary]) |
| Binary starting `1f 8b` | gzip (`.gfa.gz`, `.paf.gz`). It may be bgzip if a `BC` extra field is present | Decompress, then apply the rows above. GBZ/xg/og are binary graph indexes, not GFA |

**First-line signatures.**

- PAF: `name<TAB>int<TAB>int<TAB>int<TAB>[+-]<TAB>name<TAB>int...`.
- GFA1: `H<TAB>VN:Z:1.0` (optional) or `S<TAB>`.
- GAF: like PAF, with `>`/`<` in field 6.
- None of them has magic bytes. They are plain text.

## 7. Common misconceptions and real-world pitfalls

1. **"For a `-` line the target coordinates count from the other end."** No. Both intervals are on each sequence's own forward strand. Col 5 only says that one must be reverse-complemented to match. Students who "fix" `-` lines by swapping cols 8 and 9 create PAF-M01 errors.
2. **"Col 10 / col 11 is the read's identity."**
   - That is true only with base-level alignment (`-c`). Without it, the ratio reflects seed coverage. For the same read, approximate mode gave 16831/20373 = 0.83. With `-c`, the pieces had `de:f` 0.0021-0.0042, which is 99.6-99.8% gap-compressed identity [verified: test].
   - Also, col 11 includes the gap bases. One 368-bp deletion drags the BLAST identity of piece 1 down to 95.1%, while `de` (gap-compressed) stays at 0.40%.
3. **"One read, one PAF line."**
   - A read that spans an SV becomes several `tp:A:P` lines (SAM would mark all but one as supplementary), plus secondaries.
   - The lines are not in query order: minimap2 wrote piece 3, then 1, then 2 [verified: test]. Sort by col 3 before interpreting.
4. **"Approximate PAF is good enough to look for SVs."** In the test, approximate mode chained straight across both the 368-bp deletion and the 2.4-kb inversion and printed **one** line. Use `-c` (or SAM).
5. **"PAF is 1-based like SAM."** No. SAM POS = PAF col 8 + 1. Small deletions also hide *inside* one PAF line (as `368D` in `cg`, `-ttgc...` in `cs`) rather than splitting it.
6. **"MAPQ 60 means a perfect alignment."** MAPQ is confidence in the *placement*. 255 means missing. Overlap mode writes 0.
7. **"L lines are directed A→B edges."** GFA is bidirected. `L A + B +` already allows walking `B- → A-`, so a P or W line may use a link "backwards".
8. **"The segments are genes, or fixed units."** Segments are arbitrary cut points chosen by the builder. Adding one sample can split segments and change every (segment, offset) address. That instability is why rGFA exists.
9. **"P and W are interchangeable."**
   - P allows overlaps and only carries a name.
   - W is for blunt graphs and carries sample, haplotype index, contig and coordinates.
   - Converting needs `vg convert -gfW`.
10. **"An rGFA contains the haplotypes."** minigraph's rGFA has only S and L lines. Per-sample paths come from `minigraph --call` or GAF mappings.
11. **"Not in the pangenome means pathogenic."** Absence from 464 haplotypes means *rare*, not *causal*. Inheritance, the gene and the phenotype decide. Conversely, presence in the pangenome usually argues against a dominant severe-disease allele.
12. **"If gfatools loads it, it is valid."** gfatools silently skips space-separated lines, reads `2Q` as `0M`, keeps the last of two duplicate S lines, accepts W steps without links, and ignores P lines [verified: test]. Its `bubble` command segfaulted on a graph whose sequences were `*`.
13. **"GAF = GFA."** GAF holds *alignments to* a graph; GFA *is* the graph.

## 8. Exercise bank

All snippets use single TAB characters between fields unless stated. The exercise UI must say so and should render tabs visibly (for example as a faint `→`). Case PAF lines come from real minimap2 2.31 runs (see the header note). The tag lists are trimmed to `tp` unless stated.

### EX-01 · field-explorer (case): "Read the first piece"

**Snippet** (15 TAB-separated fields):

```text
proband_lr_0173	19998	0	7762	+	chr2	242193529	166005370	166013500	7739	8137	60	NM:i:398	tp:A:P	de:f:0.0040
```

**Task.** Hover each field, then answer: (a) the query span; (b) the target span; (c) why they differ.

**Answer.**

- (a) 7,762.
- (b) 8,130.
- (c) The reference has 368 more bases in this block than the read: a net 368-bp deletion in the read, inside one alignment.
- In the full line, `cg:Z:` contains `368D`. It sits at target [166012370, 166012738), exactly the BEDPE lesson's `DEL_1` [verified: test].

**Explanation.**

- BLAST-like identity is 7739/8137 = 95.1%.
- `de:f:0.0040` says the read is 99.6% identical once each gap counts once. The "low identity" is one big event, not a noisy read.
- NM 398 = 8137 − 7739.

### EX-02 · simulator (read-to-reference ribbon) + predict (case): "Put the pieces in order"

**Snippet.** These are minimap2's three lines in its own output order (12 TAB-separated fields + `tp`):

```text
proband_lr_0173	19998	10162	19998	+	chr2	242193529	166015900	166025738	9820	9841	60	tp:A:P
proband_lr_0173	19998	0	7762	+	chr2	242193529	166005370	166013500	7739	8137	60	tp:A:P
proband_lr_0173	19998	7762	10162	-	chr2	242193529	166013500	166015900	2391	2401	60	tp:A:I
```

**Predict first.**

- How many pieces does the read have, and in what order along the read?
- Which reference stretch is reversed?
- Is any reference sequence missing *between* pieces?

Then drag each line onto a read axis (0-19,998) and a chr2 axis. The simulator draws `-` pieces as crossed ribbons.

**Answer.**

- Sorted by query start, the pieces are:
  - read [0, 7762) → chr2 [166005370, 166013500) `+`;
  - read [7762, 10162) → [166013500, 166015900) `−`;
  - read [10162, 19998) → [166015900, 166025738) `+`.
- The target intervals abut exactly, so nothing is missing between pieces. The middle 2,400 bp is present but reversed: an **inversion**, 1-based chr2:166,013,501-166,015,900.
- The deletion is not between pieces. It is *inside* piece 1 (EX-01).

**Explanation.**

- One molecule shows the order: left flank, 368-bp deletion, 762 bp, inverted 2.4 kb, right flank. The two events are in **cis**.
- Short reads gave three separate junction records and could not order them.

### EX-03 · predict: "Approximate or base-level?"

**Prompt.** The same read is mapped without `-c`. Predict how many lines minimap2 prints, and whether col 10/col 11 still estimates identity.

**Real output** (TABs; all tags shown):

```text
proband_lr_0173	19998	2	19995	+	chr2	242193529	166005372	166025735	16831	20373	60	tp:A:P	cm:i:1660	s1:i:16771	s2:i:2240	dv:f:0.0064	rl:i:0
```

**Answer.** One line [verified: test].

**Explanation.**

- Approximate mapping only chains seeds on one strand. The inverted 2.4 kb has equal length on read and reference, so the chain simply bridges it. The 368-bp deletion is just a gap between seeds.
- 16831/20373 = 0.83 is seed coverage, not identity. Note `dv` instead of `de`, and no `cg`.
- Lesson: SV work needs base-level alignment.

### EX-04 · predict: "Flip the read"

**Prompt.** The sequencer happened to read the other strand of the same molecule. Using the three EX-02 lines, predict the new cols 3, 4, 5, 8 and 9.

**Answer.** This is the real output for the reverse-complemented read (TABs, first 12 fields):

```text
proband_lr_0173	19998	0	9836	-	chr2	242193529	166015900	166025738	9820	9841	60
proband_lr_0173	19998	12236	19998	-	chr2	242193529	166005370	166013500	7739	8137	60
proband_lr_0173	19998	9836	12236	+	chr2	242193529	166013500	166015900	2391	2401	60
```

**Explanation.**

- Query intervals mirror: [qs, qe) → [19998−qe, 19998−qs). For example, [10162, 19998) becomes [0, 9836).
- Every strand flips.
- Target columns and cols 10-12 do not change, because the target is always described on its forward strand.

### EX-05 · fix-it (PAF validator): "A colleague 'fixed' the minus-strand line"

**Snippet** (TABs):

```text
proband_lr_0173	19998	7762	10162	-	chr2	242193529	166015900	166013500	2401	2391	60	tp:A:I
```

**Live validator messages:**

- PAF-M01 "target end (166013500) is not greater than target start (166015900)".
- PAF-M03 "residue matches (2401) exceed alignment block length (2391)".
- PAF-M04 "block length (2391) is shorter than the query span (2400)".

**Fix.** Swap cols 8/9 to `166013500	166015900`, and swap cols 10/11 to `2391	2401`. All three messages clear.

**Explanation.**

- Target coordinates are on the forward strand regardless of col 5.
- Matches are a subset of the block, and the block contains every aligned query base. A swapped pair of columns trips two rules at once.

### EX-06 · spot-the-error (case): "One impossible field"

**Snippet** (four lines, 13 TAB-separated fields each). Click the field that cannot be right.

```text
mother_lr_0009	17997	9897	17997	+	chr2	242193529	166015900	166024000	8081	8106	60	tp:A:P
mother_lr_0009	17997	0	7496	+	chr2	242193529	166006000	166013500	7478	7502	60	tp:A:P
mother_lr_0009	17997	7496	9897	-	chr2	242193529	166013500	166015900	2396	2401	60	tp:A:I
mother_lr_0012	18240	0	18412	+	chr2	242193529	166004100	166022480	18350	18431	60	tp:A:P
```

**Answer.** Line 4, col 4 (`18412`). The query end exceeds the query length, 18,240 (PAF-M02).

**Explanation.**

- Lines 1-3 are real and valid. They show the mother's read carrying the **inversion without the deletion**.
  - Line 2 ends exactly at the inversion breakpoint, 166013500.
  - Its query and target spans nearly match (7,496 vs 7,500), so there is no 368-bp deletion inside it.
- Line 4 passes every other check: col 10 < col 11, and col 11 ≥ both spans.

### EX-07 · sort: "Which format is this line?"

**Bins:** PAF · GAF · SAM · BEDPE · GFA1 · GFA2 · look-alike (BLAST tabular). Every snippet is TAB-separated.

1. `proband_lr_0173	19998	0	7762	+	chr2	242193529	166005370	166013500	7739	8137	60	tp:A:P` → **PAF**
2. `read2	7	0	7	+	>s2>s5>s6	11	1	8	7	7	60	cg:Z:7M` → **GAF** (rGFA.md example; col 6 is a path)
3. `r1	0	chr2	166005371	60	7762M	*	0	0	*	*` → **SAM** (FLAG, 1-based POS, CIGAR)
4. `chr2	166012360	166012380	chr2	166012728	166012748	DEL_1	87	+	-` → **BEDPE**
5. `L	s3	+	s4	-	0M` → **GFA1**
6. `S	s4	*	LN:i:2400	SN:Z:chr2	SO:i:166013500	SR:i:0` → **GFA1 (rGFA)**
7. `E	*	s1+	s2+	8$	8$	0	0	*` → **GFA2** (blunt edge: `beg1 = end1 = x$`, `beg2 = end2 = 0`)
8. `proband_lr_0173	chr2	99.58	2401	8	2	7763	10162	166015900	166013501	0.0	4380` → **BLAST tabular**: percent identity in col 3, 1-based coordinates, minus strand shown as `sstart > send`. The e-value and bitscore are illustrative.

**Explanation.** Each bin has one decisive cue:

- col 5 strand plus lengths → PAF;
- `>`/`<` in col 6 → GAF;
- integer FLAG plus CIGAR → SAM;
- two chromosome columns → BEDPE;
- a leading record letter → GFA;
- `$` positions or an `E` record → GFA2;
- a float in col 3 → BLAST.

### EX-08 · simulator (GFA graph drawer): "Draw it, then spell the haplotypes"

**Snippet.** The GFA 1.1 toy in §3.6 (TABs). The drawer renders segments as boxes and links as curves; `-` ends attach to the box's right side.

**Tasks.**

- (a) Toggle each W line and spell it.
- (b) Name the bubble type between s3 and s5.
- (c) Add the line `W	PROBAND	2	hap2ctg	0	28	>s1>s3<s4>s5` and predict what the validator says.

**Answers.**

- (a) GRCh38 spells `ACGTTGCAGGATCCATTTAGCCCCGGGAATAGCTTA`. POP01 spells `ACGTTGCAGGATCCATTTAGCATTCCCGGGAGCTTA`.
- (b) An inversion: the same segment s4 is traversed as `<s4` = `ATTCCCGGG`.
- (c) GFA-M09: "step s1+ → s3+ has no 0-overlap link". gfatools accepts the line silently [verified: test].

**Explanation.**

- The proband's haplotype needs an edge that no population haplotype uses: a **novel deletion** of s2.
- The drawer highlights the missing edge in a dashed colour. This is the graph picture of a new allele.

### EX-09 · spot-the-error (GFA): "Three broken lines"

**Snippet** (TABs; click every line that breaks a rule):

```text
H	VN:Z:1.0
S	11	ACCTT
S	12	TCAAGG	LN:i:5
S	13	CTTGATT
L	11	+	12	-	4M
L	12	>	13	+	5M
L	11	+	14	+	3M
P	15	11+,12-,13+	4M,5M
```

**Answer.**

| Line | Rule | Problem | gfatools message [verified: test] |
|---|---|---|---|
| 3 | GFA-M03 | LN 5 ≠ 6 bases | "[W] for segment '12', LN:i:5 tag is different from sequence length 6" |
| 6 | GFA-S06 | `>` is a W-line symbol, not an L orientation | "[E] invalid L-line at line 6 (error code -2)" |
| 7 | GFA-M02 | segment 14 is undefined | "[W] segment '14' is used on an L-line but not defined on an S-line" |

**Explanation.**

- The P line is valid as written, but it now fails GFA-M07, because the 12-→13+ link was lost with line 6. A good validator reports the knock-on effect.
- gfatools never even reads P lines.

### EX-10 · fix-it (GFA overlap validator): "Make the overlaps true"

**Snippet** (TABs):

```text
H	VN:Z:1.0
S	11	ACCTT
S	12	TCAAGG
S	13	CTTGATT
L	11	+	12	-	5M
L	12	-	13	+	5M
P	14	11+,12-,13+	5M,5M
```

**Validator.** GFA-M06 fires on line 5: suffix `ACCTT` vs prefix of 12- (`CCTTGA`) = `CCTTG`, 3 of 5 columns differ. GFA-M08 fires on line 7. gfatools accepts the file silently [verified: test].

**Fix.** Change `5M` to `4M` on line 5, and change the path overlaps to `4M,5M`.

**Explanation.**

- The validator shows the two oriented sequences aligned at the junction.
- With 4M the path spells `ACCTTGATT`.

### EX-11 · predict (GFA bidirected): "Walk it backwards"

**Prompt.** In the valid §3.5 graph, is `P	rev	13-,12+,11-	5M,4M` supported by the existing links, and what does it spell?

**Answer.** Yes, it is supported and valid. It spells `AATCAAGGT`, the reverse complement of `ACCTTGATT`.

**Explanation.**

- `13- → 12+` is the mirror of `L 12 - 13 + 5M`.
- `12+ → 11-` is the mirror of `L 11 + 12 - 4M`.
- A bidirected graph lets every link be read in both directions. The overlap lengths travel with the link. For CIGARs with I/D, the I and D roles swap when mirrored.

### EX-12 · simulator (rGFA stable coordinates) + mcq (case): "Translate graph addresses"

**Snippet.** The case-scale rGFA from §3.7 (TABs).

**Questions.**

- (a) What is the GRCh38 1-based coordinate of the 101st base of `s4` (forward)?
- (b) Which segment is the BEDPE `DEL_1` deletion?
- (c) Write the proband's haplotype `>s1>s3<s4>s5` as a GAF stable path.
- (d) What is s6's chr2 coordinate?

**Answers.**

- (a) Offset 100: `SO` 166013500 + 100 = 0-based 166013600, so 1-based **chr2:166,013,601**.
- (b) `s2`, [166012370, 166012738).
- (c) `>chr2:166005370-166012370>chr2:166012738-166013500<chr2:166013500-166015900>chr2:166015900-166025738`.
- (d) None. `SR:i:1` and `SN:Z:POP02#1#ctg7` mean s6 is not on GRCh38. Its stable coordinate is POP02#1#ctg7:48210-48521.

**Explanation.** Stable coordinates keep graph results speaking the clinic's GRCh38 language. Only rank-0 segments have chr2 addresses.

## 9. Quiz bank

**Q1 (mcq).** A PAF line reads `...	7762	10162	-	chr2	242193529	166013500	166015900	...` (TABs). Which statement is true?

- (a) Read bases 7762-10161 match chr2 starting at 166,015,900 and running backwards.
- (b) The reverse complement of read bases [7762, 10162) matches chr2 [166013500, 166015900) on the forward strand. ✔
- (c) The target interval is on the minus strand, so its forward coordinates are 242193529 − 166015900 onward.
- (d) Coordinates are 1-based, so the first matched chr2 base is 166,013,500.

*Explanations.*

- (a) Target coordinates are always forward-strand (PAF.md "on original strand").
- (b) Correct: col 5 is relative strand.
- (c) That conversion only happens with minimap2's undocumented `--qstrand` (§11), never by default.
- (d) It is 0-based, so the first base is 1-based 166,013,501.

**Q2 (mcq).** Line A has `7739	8137` and `cg:Z:` containing `368D`. Line B, the same read without `-c`, has `16831	20373` and `dv:f:0.0064`. Which conclusion is justified?

- (a) The read is only 95% accurate.
- (b) Line B shows the read is 83% identical to the reference.
- (c) Line A's identity is lowered mainly by one long deletion; per-base divergence is better read from `de`. ✔
- (d) Line B is invalid because col 10 is much smaller than col 11.

*Explanations.*

- (a) `de:f:0.0040` says otherwise: the gap counts once.
- (b) Approximate cols 10/11 measure seed coverage, not identity.
- (c) Correct.
- (d) PAF.md allows approximate values. PAF-M03 only needs col 10 ≤ col 11.

**Q3 (mcq).** You need the EX-01 target interval as (i) a BED line and (ii) a SAM POS. Which pair is right?

- (a) `chr2	166005371	166013500` and POS 166005370.
- (b) `chr2	166005370	166013500` and POS 166005371. ✔
- (c) `chr2	166005370	166013499` and POS 166005370.
- (d) `chr2	166005371	166013501` and POS 166005371.

*Explanations.*

- (b) PAF and BED share 0-based half-open coordinates (copy cols 6, 8, 9), and SAM is 1-based (col 8 + 1).
- The other options apply a shift to the wrong side or to both sides.

**Q4 (multi-select).** Starting from the valid §3.5 graph, which single edits make the file **invalid**?

- (a) Replace `S	12	TCAAGG` with `S	12	*	LN:i:6`.
- (b) Add `P	12	11+,13+	3M`. ✔
- (c) Replace `L	11	+	13	+	3M` with `L	13	-	11	-	3M`.
- (d) Add `W	NA12878	1	chr1	0	9	>11<12>13`. ✔
- (e) Rename segment `13` to `13+,x` everywhere. ✔

*Explanations.*

- (a) Valid: the sequence may be `*`, with LN giving the length. Overlap base checks become impossible, but nothing is broken.
- (b) Path and segment names share one namespace (GFA-M01).
- (c) The same link written from the other side.
- (d) W steps must use 0-overlap links (GFA-M09). These links are 4M and 5M.
- (e) Names may not contain `+,` (GFA-S04). It would make `13+,x+` ambiguous in P lines.

**Q5 (mcq).** `W	POP01	1	ctg7	1200	1230	>s1>s2>s3<s4>s5` is added to the §3.6 graph (segment lengths 8, 8, 5, 9, 6). What should a validator report?

- (a) Nothing: W coordinates are free text.
- (b) A warning: SeqEnd − SeqStart = 30, but the walk spells 36 bases. ✔
- (c) An error: HapIndex must be 0.
- (d) An error: `<s4` needs an `L	s4	-	s4	+` link.

*Explanations.*

- (b) Correct: GFA-M10. The coordinates are BED-like over the walked sequence; the spec's own example has 0-11 for 5+2+4 bases.
- (c) 1 is right for a diploid sample.
- (d) The steps s3+→s4− and s4−→s5+ both exist.

**Q6 (mcq).** In the case rGFA, which statement about `s6` (`SN:Z:POP02#1#ctg7	SO:i:48210	SR:i:1`, LN 311) is correct?

- (a) It sits at chr2:48,210.
- (b) It is GRCh38 sequence that minigraph re-ranked.
- (c) It is sequence absent from GRCh38, first contributed by sample POP02 haplotype 1; its stable coordinate is POP02#1#ctg7:48210-48521. ✔
- (d) rGFA forbids rank > 0 segments.

*Explanations.*

- (a) SN names the sequence, not chr2.
- (b) Rank 0 means "on a linear reference genome".
- (c) Correct.
- (d) Ranks above 0 are how rGFA adds non-reference sequence.

**Q7 (mcq, case reasoning).** In the HPRC-style graph, about a third of haplotypes walk `<s4` (illustrative). No haplotype uses an edge that skips `s2`. Both parents' long reads follow the reference across s2. The mother carries `<s4`. What is the best interpretation?

- (a) The inversion is the likely cause because it is a structural variant near *SCN1A*.
- (b) The deletion of s2 is a rare de novo event on the maternally inherited haplotype. The inversion is a common inherited polymorphism. ✔
- (c) The deletion is a mapping artefact because the graph does not contain it.
- (d) Nothing can be concluded without short reads.

*Explanations.*

- (a) A variant carried by a third of haplotypes and by an unaffected parent is unlikely to cause a severe dominant disorder.
- (b) Correct. The deletion is in cis with `<s4` (EX-02), and `<s4` came from the mother.
- (c) A graph only contains alleles it has seen. Absence means novel, not false.
- (d) Long reads span both events directly.

**Q8 (multi-select).** Why could short reads not resolve this locus when long reads plus a pangenome could?

- (a) The inversion breakpoints sit in inverted repeats, so 150-bp reads there map with MAPQ near 0. ✔
- (b) No short read spans both the deletion and the inversion, so phase and order are unknown. ✔
- (c) Short reads cannot detect deletions at all.
- (d) The graph already contains the common inversion, so reads carrying it align as normal sequence instead of as SV evidence. ✔
- (e) PAF stores read sequences, which BAM cannot.

*Explanations.*

- (a), (b) and (d) are correct.
- (c) Is false: `DEL_1` *was* found by split reads.
- (e) Is false: PAF stores no sequence at all.

## 10. Case-thread hooks

- **Lesson opener: "the breakpoint pair left a puzzle".**
  - The BEDPE lesson ends with `DEL_1` (`+ -`, [166012370, 166012738), SR=9, PE=6) and a weaker `++`/`--` pair near 166,013,500 and 166,015,900.
  - Those two calls have low MAPQ because both ends fall in an inverted pair of repeats (illustrative).
  - Questions: is it one event or two? Same chromosome copy? Is the inversion real?
  - The team orders long-read sequencing of the proband, with HiFi or ONT, and both parents.
- **PAF lesson: "one molecule tells the order".** `proband.paf` (from `minimap2 -c --cs`) shows read `proband_lr_0173` in three pieces.
  - Field explorer: EX-01.
  - Ordering the pieces: EX-02.
  - The approximate-mode trap: EX-03.
  - Strand arithmetic: EX-04.
  - The deletion sits inside piece 1 (`368D` at exactly `DEL_1`). The inversion is a `tp:A:I` piece.
- **Parents.**
  - The father's reads are single full-length `+` lines across the locus. A real example: `father_lr_0007	20369	0	20369	+	chr2	242193529	166005370	166025738	20330	20379	60	tp:A:P`.
  - The mother has two kinds of reads: reference reads, and reads with the inversion but no deletion (EX-06 lines 1-3).
  - Conclusion: the deletion is de novo. It arose on the maternally inherited haplotype, which carries the inversion.
- **GFA lesson: "is either event known in the population?"** A local extract of an HPRC-style GRCh38-based graph (§3.7 case rGFA) is used for:
  - the graph drawer (EX-08 at toy scale);
  - stable coordinates (EX-12).
  - Finding 1: the inversion is a common bubble (`<s4`).
  - Finding 2: no haplotype skips `s2`, the segment holding exon target T3. The proband's walk needs a missing edge.
  - Interpretation (Q7): the deletion is rare and de novo and removes an *SCN1A* exon. The inversion is benign background.
  - Forward links: the VCF lesson records `SVTYPE=DEL`, END and parental genotypes; the GTF lesson already named the exon.
- **Capstone planted files.**
  1. `proband.lr.paf`: valid, including one `--paf-no-hit` line (PAF-C01). It should be flagged as unmapped, not invalid.
  2. `proband.lr.fixed.paf`: a colleague's "corrected" `-` lines (PAF-M01, PAF-M03; EX-05).
  3. `mother.lr.paf`: one PAF-M02 line (EX-06).
  4. `locus.gfa`: valid GFA 1.1 with W lines, but `H	VN:Z:1.0` (GFA-M13 warning).
  5. `locus_edit.gfa`: an LN mismatch (GFA-M03) and a link to an undefined segment (GFA-M02).
  6. `hprc_local.rgfa`: valid (control).
  7. `proband.gaf`: identify it as GAF, not PAF or GFA.
  8. `overlaps.paf`: `ava-ont` output with MAPQ 0 (valid; PAF-C05).

## 11. "Read more" candidates

- **GFA 1.2 jump lines.** `J` lines, `;` separators in P, `SC:i:1` shortcuts, and `10J`/`.` in P overlaps (GFA1.md).
- **GFA2 edges.**
  - Positions with `$`.
  - Dovetail vs containment as one generalised `E` line.
  - `G` gaps with variance; `F` fragments and Dazzler traces (`TS` tag); `O`/`U` groups.
  - Why GFA2's S length can differ from the sequence.
- **GAF in depth.** Stable-interval paths, reduction to PAF, and minigraph `--call` output.
- **The `cs` tag.** Long form (`=ACGT`), the intron op `~gt123ag`, and how `paftools.js call` turns `cs` into variants. Its default thresholds (50 kb for calling, 10 kb for callable regions) are designed for assemblies.
- **Divergence formulas.**
  - `de` = 1 − matches / (blen + n_ambi − gap bases + gap opens).
  - `dv` is estimated from seeds.
  - Why gap-compressed identity is the fairer measure for long reads [source].
- **minimap2 internals.**
  - Chaining, Z-drop (`zd:i`) and inversion rescue (`tp:A:I`).
  - `--paf-no-hit`.
  - The undocumented `--qstrand`, which flips *target* coordinates onto the query strand (`format.c`, `main.c` [source]).
  - The `ava-*` presets and why read-overlap PAF has MAPQ 0.
- **Bidirected graph theory.** Arcs vs links (gfatools: 6 links = 12 arcs); mirror links; why an inversion needs no new sequence.
- **Building pangenomes.**
  - minigraph vs Minigraph-Cactus vs PGGB (the HPRC README comparison table: SV-only vs base-level, reference-based vs all-vs-all).
  - GBZ indexes; `vg giraffe`.
  - Cactus `rgfa-zip`, which replaces inversions that minigraph stored as novel sequence with reverse traversals (cactus `pangenome.md`, current master).
- **PanSN naming** (`sample#hap#contig`) and how it carries sample identity through FASTA, GFA, VCF and BED.
- **Indexing PAF with tabix** (`sort -k6,6 -k8,8n`, `bgzip`, `tabix -s6 -b8 -e9 -0`) [verified: test].
- **Nested bubbles and VCF.** Raw graph VCFs have nested sites (`PS`/`LV`/`AT`), flattened with `vcfbub` and realigned with `vcfwave` (HPRC README).

## 12. Sources

### Read in full (or in the relevant sections), with versions

- `https://raw.githubusercontent.com/lh3/miniasm/master/PAF.md`: PAF definition, undated, 12 columns plus SAM-like tags.
- `https://raw.githubusercontent.com/lh3/minimap2/master/minimap2.1`: minimap2-2.31 (r1302), 19 May 2026. Synopsis, presets, `-c`, `--cs`, `--paf-no-hit`, `-p`/`-N`, OUTPUT FORMAT (PAF columns, tags, cs ops).
- `https://raw.githubusercontent.com/lh3/minimap2/master/README.md`: use cases, `cs` tag grammar and example, `paftools.js` pointer.
- `https://raw.githubusercontent.com/lh3/minimap2/master/misc/README.md`: `paftools.js` commands, `call` (sorting, thresholds), `ov-eval`.
- `https://raw.githubusercontent.com/lh3/minimap2/master/misc/paftools.js`: `paf_sam2paf` (column arithmetic, strand handling, warnings).
- minimap2 sources `format.c`, `hit.c`, `align.c`, `main.c` (same base path; also every source file needed to compile minimap2 2.31-r1302).
- `https://raw.githubusercontent.com/GFA-spec/GFA-spec/master/GFA1.md`: GFA 1.0, plus W (v1.1) and J (v1.2). Front matter date 2022-06-07.
- `https://raw.githubusercontent.com/GFA-spec/GFA-spec/master/GFA2.md`: GFA 2.0 grammar and semantics.
- `https://raw.githubusercontent.com/GFA-spec/GFA-spec/master/README.md` and `GFA-spec.md`: version pointers and implementation lists.
- `https://raw.githubusercontent.com/lh3/gfatools/master/doc/rGFA.md`: rGFA (SN/SO/SR) and GAF.
- `https://raw.githubusercontent.com/lh3/gfatools/master/README.md`, plus the gfatools sources (`gfa-io.c`, `gfa-base.c` and the rest, to compile 0.5-r296).
- `https://raw.githubusercontent.com/lh3/minigraph/master/README.md`: GAF output, rGFA graph generation, bubbles, `--call`, `gfatools bubble` columns.
- `https://raw.githubusercontent.com/human-pangenomics/hpp_pangenome_resources/main/README.md` (release 2, v2.1 graphs, 232 samples) and `README-v1.md` (47 samples, 90 haplotypes).
- `https://raw.githubusercontent.com/ComparativeGenomicsToolkit/cactus/master/doc/pangenome.md`: the Output section (GFA 1.1 with W lines, `vg convert -gfW`), `rgfa-zip`, and `cactus-graphmap-split` PAF input.
- `https://raw.githubusercontent.com/pangenome/PanSN-spec/main/README.md`: the PanSN naming pattern.
- `https://raw.githubusercontent.com/samtools/htslib/develop/tabix.1`: htslib-1.24, 9 July 2026. `-s`/`-b`/`-e`/`-0`.
- Web search (summaries only; pages not opened):
  - Liao et al. 2023, *Nature* 617:312-324, doi:10.1038/s41586-023-05896-x (abstract figures 34% and 104%; 47 assemblies);
  - HPRC Release 2 (humanpangenome.org/hprc-data-release-2; JBrowse HPRC tutorials).

### Empirical checks (scratch only, not shipped)

- **minimap2 2.31-r1302**, compiled from source. Runs on simulated reads from a random 40-kb sequence:
  - a proband allele with a 368-bp deletion plus a 2.4-kb inversion (presets `lr:hq`, `map-hifi`, `map-ont`, which gave identical piece coordinates);
  - its reverse complement;
  - a mother allele with the inversion only;
  - a reference allele;
  - an `ava-ont` overlap;
  - a `--paf-no-hit` query.
  - Arithmetic for `cg`/`cs`/`NM`/`de`, the deletion position, and the `cs` orientation on `-` lines were all checked by script.
- **gfatools 0.5-r296**, compiled from source: `stat`, `view`, `gfa2fa`, `gfa2fa -s`, `gfa2bed` and `bubble` on the toy GFA and rGFA, plus 15 invalid snippets (messages quoted in §5).
- **pysam 0.24.1:** bgzip plus tabix (`seq_col=5, start_col=7, end_col=8, zerobased`) on a target-sorted PAF; region fetch worked.

### Unreachable or not attempted

- **github.com web pages and the GitHub API** returned "GitHub access to this repository is not enabled". So the commit dates or hashes for `PAF.md`, `GFA1.md` and `rGFA.md` could not be recorded beyond the GFA1 front-matter date.
- **Not opened** (only search summaries, or not attempted): nature.com (Liao et al.), humanpangenome.org, jbrowse.org tutorials, the lh3 GFA blog posts (2014), Bandage documentation, and the Gene Ontology GAF specification. Claims depending on them are marked [web-search summary] or [from memory - verify].
- **From memory, to verify before shipping:**
  - that long-read SV callers take BAM rather than PAF;
  - that racon and dot-plot tools consume PAF;
  - that hifiasm and Flye write GFA, and that wfmash writes PAF;
  - the GRCh37 chr2 length 243,199,373;
  - the GO `.gaf` extension clash.
