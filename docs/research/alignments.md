# Research: SAM, BAM and CRAM (read alignments)

Research notes for the "Genomic File Formats" course, covering the alignment lessons. Written 2026-10-16.

**Evidence tags used below**

- **[spec]**: read directly in the hts-specs sources fetched on 2026-10-16: `SAMv1.tex` (SAM/BAM v1.6), `SAMtags.tex`, `CRAMv3.tex` (CRAM 3.0 and 3.1), `CSIv1.tex`. Section numbers follow the compiled PDFs (for example SAMv1 §1.4 = "The alignment section: mandatory fields").
- **[verified: test]**: I ran it through samtools 1.24 / htslib (via pysam 0.24.1) in a scratch directory on 2026-10-16. Messages are quoted exactly.
- **[verified: GRCh38]**: the sequence was fetched by HTTP byte range from the Broad GRCh38 analysis set (`Homo_sapiens_assembly38.fasta`), and checked with `samtools calmd`.
- **[from memory - verify]**: the primary source could not be reached. Check before the claim ships.

**Tabs.** In every code block below, the separators in SAM lines, header lines and `.crai` lines are single literal TAB characters. Hex dumps use single spaces. Prose writes a tab as "TAB".

---

## 1. Purpose and place in the pipeline

- **Producers.** Aligners turn FASTQ reads into SAM records: `bwa mem` (short reads), `minimap2 -a` (long reads, also short reads with `-x sr`), STAR/HISAT2 (RNA-seq, using the `N` operation for introns). `samtools sort`, `samtools markdup` and `samtools view -C` turn that stream into a coordinate-sorted, duplicate-marked BAM or CRAM. `samtools import` makes *unaligned* BAM/CRAM straight from FASTQ.
- **Consumers.** Variant callers (GATK HaplotypeCaller, DeepVariant, bcftools mpileup) read coordinate-sorted, indexed BAM/CRAM. So do depth tools (`samtools depth`, mosdepth), which produce the WIG/bedGraph tracks of the WIG lesson. SV callers (LUMPY/smoove, Manta, DELLY) read the split (`SA` tag) and discordant (TLEN/orientation) evidence and emit BEDPE or VCF. Genome browsers (IGV) show reads by random access through `.bai`/`.csi`/`.crai`.
- **Disease question it answers.** "What does the raw evidence say *at this position* in this person?" A VCF line is a summary claim. The BAM/CRAM is the evidence behind it. When a de novo call looks suspicious, a clinician or analyst opens the child's and both parents' alignments at that locus. They check how many reads support the variant, on both strands, with good MAPQ and base quality, and whether those reads are duplicates. SAM is also where structural variants first become visible: as split reads, discordant pairs and coverage drops.
- **Why three formats.** SAM is the human-readable text definition. BAM is the same records in binary, block-compressed and indexable. CRAM re-encodes those records against the reference to save storage. All three carry the same logical record (SAMv1 §1 and §4 [spec]; CRAMv3 §1 objective "Full compatibility with BAM" [spec]).

## 2. Mental model

**A SAM record is a sticky note placed on a map.** The map is the reference FASTA. The note says where the read was stuck (RNAME, POS), how it bends to fit the road (CIGAR), how sure the aligner is that this is the right spot (MAPQ), and where its partner note went (RNEXT, PNEXT, TLEN). FLAG is a row of 12 checkboxes on the note's corner.

**The design problem.** An aligner emits hundreds of millions of these placements. Every downstream tool needs three things:

1. a fixed, tool-neutral record that any program can parse (11 mandatory TAB-separated columns, then open-ended `TAG:TYPE:VALUE` extras);
2. a way to jump straight to "all reads overlapping chr2:166,012,300-166,012,800" without reading 100 GB (BAM: block compression plus a binning index);
3. a way to store the reads cheaply for years (CRAM: store only how each read *differs* from the reference).

**Why it looks the way it does**

- **CIGAR is run-length edit instructions.** It walks the read and the reference in parallel. Each operation says "advance the read", "advance the reference", or both. That is why the two consumption rules (the query-consuming ops sum to SEQ length; POS plus the reference-consuming ops gives the end) are the heart of validity.
- **SEQ is always written on the forward genomic strand.** FLAG 0x10 says the stored sequence is the reverse complement of what the machine read (§1.4). So a viewer can draw every read against the same reference row without flipping anything.
- **One read can need several lines.** A read that spans a deletion breakpoint, or two chromosomes in a translocation, cannot be one linear alignment. SAM writes one *primary* line plus *supplementary* lines (0x800) that point to each other through the `SA` tag. Repeats instead create *secondary* lines (0x100): alternative placements of the *whole* read.

**Analogy for BAM: a box of numbered, sealed envelopes.** BGZF cuts the BAM stream into ≤64 KiB pieces and gzips each one separately (§4.1). The index (`.bai`) is the table of contents: "reads for chr2:166.0-166.1 Mb start in envelope at byte 9,371,224, letter 412". You open one envelope instead of the whole box. The 28-byte empty envelope at the end is the "end of box" card. If it is missing, someone dropped the last envelopes in transit.

**Analogy for CRAM: track changes against a shared master document.** Instead of storing the sentence, store "same as master page 7, except word 4 is 'cat'". Anyone with the *identical* master can rebuild the text. Anyone with a slightly different edition gets garbage, so CRAM records the master's fingerprint (MD5) for every chromosome and every slice (CRAMv3 §8.5, §11 [spec]).

## 3. Anatomy

### 3.1 Header section (SAMv1 §1.3)

Header lines start with `@` plus a two-letter record type and contain TAB-separated `TAG:VALUE` fields. The exception is `@CO`, whose remainder is free text. The spec regex is `^@(HD|SQ|RG|PG)(\t[A-Za-z][A-Za-z0-9]:[ -~]+)+$` or `^@CO\t.*`. Within one line no tag may repeat, and field order does not matter. Lowercase tags are reserved for local use.

| Line | Required tags | Useful optional tags | Notes |
|---|---|---|---|
| `@HD` | `VN` (`^[0-9]+\.[0-9]+$`) | `SO` (unknown, unsorted, queryname, coordinate), `GO` (none, query, reference), `SS` (sub-sort, e.g. `coordinate:queryname`, `queryname:natural`) | At most one, and it must be the first line |
| `@SQ` | `SN` (rname regex, unique), `LN` (1 to 2^31−1) | `M5` (MD5 of uppercased sequence, §1.3.2), `UR` (URI or path), `AS` (assembly), `AN` (alias names), `AH` (alt locus), `TP` (linear/circular), `SP`, `DS` | The order of `@SQ` lines defines coordinate sort order |
| `@RG` | `ID` (unique) | `SM` (sample), `LB` (library), `PL` (ILLUMINA, ONT, PACBIO, …, uppercase), `PU`, `BC`, `CN`, `DT`, `PI` | Records point to it with `RG:Z:` |
| `@PG` | `ID` (unique) | `PN`, `VN`, `CL`, `PP` (previous `@PG` ID; chains form provenance), `DS` | Tools append themselves. samtools adds `@PG ID:samtools` [verified: test] |
| `@CO` | none | none | Free-text comment; UTF-8 allowed |

The `M5` digest strips every byte outside ASCII 33-126, uppercases the rest, then takes the MD5 as 32 lowercase hex digits (§1.3.2). The spec's 45-bp toy reference `AGCATGTTAGATAAGATAGCTGTGCTAGTAGGCAGTCAGCGCCAT` gives `7a66cae8ab14aef8d635bc80649e730b` [verified: test, and samtools wrote the same value into a CRAM header]. GRCh38 chr2 is `M5:f98db672eb0993dcfdabafe2a882905c` (Broad `.dict`) [verified: GRCh38].

### 3.2 The 11 mandatory fields (SAMv1 §1.4)

| Col | Field | Type | Regex / range | Meaning | Placeholder |
|---|---|---|---|---|---|
| 1 | QNAME | String | `[!-?A-~]{1,254}` (printable, no `@`, no space) | Read/template name. Identical QNAME = same DNA fragment | `*` |
| 2 | FLAG | Int | [0, 2^16−1] | Bitwise flags (table 3.3) | `0` |
| 3 | RNAME | String | `\*` or rname regex | Reference sequence name; must be an `@SQ SN` if `@SQ` lines exist | `*` |
| 4 | POS | Int | [0, 2^31−1] | **1-based** leftmost position of the first reference-consuming CIGAR op | `0` |
| 5 | MAPQ | Int | [0, 255] | −10·log10 P(mapping position wrong), rounded; **255 = unavailable** | `255` |
| 6 | CIGAR | String | `\*` or `([0-9]+[MIDNSHP=X])+` | Alignment edit script (table 3.4) | `*` |
| 7 | RNEXT | String | `\*`, `=`, or rname regex | RNAME of the *primary* line of the next read in the template; `=` means same as RNAME | `*` |
| 8 | PNEXT | Int | [0, 2^31−1] | POS of that primary line (1-based) | `0` |
| 9 | TLEN | Int | [−2^31+1, 2^31−1] | Signed observed template length | `0` |
| 10 | SEQ | String | `\*` or `[A-Za-z=.]+` | Bases on the forward genomic strand. `=` means "same as reference". Case carries no meaning | `*` |
| 11 | QUAL | String | `[!-~]+` | Phred+33, same as Sanger FASTQ | `*` |

Character rules (§1.2.1). Reference names may use printable ASCII except `\ , " ` ' ( ) [ ] { } < >` and may not start with `*` or `=`. The full regex is `[0-9A-Za-z!#$%&+./:;?@^_|~-][0-9A-Za-z!#$%&*+./:;=?@^_|~-]*`. `:` and `|` are allowed, which matters for HLA names such as `HLA-DRB1*15:03:01:01`.

### 3.3 FLAG bits (§1.4 item 2)

| Bit | Hex | samtools name | Meaning |
|---|---|---|---|
| 1 | 0x1 | PAIRED | Template has multiple segments (paired-end) |
| 2 | 0x2 | PROPER_PAIR | Each segment properly aligned *according to the aligner* |
| 4 | 0x4 | UNMAP | This segment is unmapped |
| 8 | 0x8 | MUNMAP | Next segment is unmapped |
| 16 | 0x10 | REVERSE | SEQ is reverse-complemented (QUAL reversed) |
| 32 | 0x20 | MREVERSE | Next segment's SEQ is reverse-complemented |
| 64 | 0x40 | READ1 | First segment (Illumina R1) |
| 128 | 0x80 | READ2 | Last segment (Illumina R2) |
| 256 | 0x100 | SECONDARY | Secondary alignment (alternative placement) |
| 512 | 0x200 | QCFAIL | Not passing platform/vendor filters |
| 1024 | 0x400 | DUP | PCR or optical duplicate |
| 2048 | 0x800 | SUPPLEMENTARY | Supplementary alignment (part of a chimeric/split alignment) |

Consistency rules stated in §1.4:

- **Exactly one primary line per read.** "One and only one line associated with the read satisfies FLAG & 0x900 == 0". 0x100 and 0x800 can co-occur on a non-primary line (`samtools sort` documents a "SUPPLEMENTARY plus SECONDARY" tie-break class).
- **0x4 is the only reliable signal of "unmapped".** If 0x4 is set, nothing can be assumed about RNAME, POS, CIGAR, MAPQ, 0x2, 0x100 or 0x800. An unmapped read can still carry RNAME/POS so that it sorts next to its mapped mate ("placed unmapped").
- **0x10 on an unmapped read** means "not stored in the original machine orientation". Recommended practice (§2 item 4.4) is to leave it unset.
- **0x40 and 0x80** describe sequencing order, not orientation. Both set = a middle segment; neither set = index unknown.
- **If 0x1 is unset**, nothing can be assumed about 0x2, 0x8, 0x20, 0x40 or 0x80.
- **Records of one read share QNAME and the 0x40/0x80 values.** This holds for all records of a chimeric alignment and all records of a multiple mapping (§1.2).
- **Reserved bits above 0x800** should not be written and should be ignored on reading.

Worked decodes [verified: test, `samtools flags`]:

| FLAG | Decoded | Typical meaning |
|---|---|---|
| 99 (0x63) | PAIRED, PROPER_PAIR, MREVERSE, READ1 | R1 on + strand, mate on − strand ("FR" pair, left mate) |
| 147 (0x93) | PAIRED, PROPER_PAIR, REVERSE, READ2 | Its mate |
| 83 / 163 | READ1 reverse / READ2 forward | The mirror-image FR pair |
| 77 / 141 | PAIRED, UNMAP, MUNMAP, READ1 / READ2 | Both mates unmapped |
| 73 / 133 | READ1 mapped, mate unmapped / READ2 unmapped | A "singleton" and its placed unmapped mate |
| 2064 (0x810) | REVERSE, SUPPLEMENTARY | Spec example r003, second piece |
| 2145 (0x861) | PAIRED, MREVERSE, READ1, SUPPLEMENTARY | Case split read, second piece |
| 355 (0x163) | 99 + SECONDARY | Alternative placement of R1 |
| 1123 (0x463) | 99 + DUP | Duplicate-marked R1 |

### 3.4 CIGAR operations (§1.4 item 6)

| Op | BAM code | Meaning | Consumes query | Consumes reference |
|---|---|---|---|---|
| M | 0 | Alignment match (match **or** mismatch) | yes | yes |
| I | 1 | Insertion to the reference | yes | no |
| D | 2 | Deletion from the reference | no | yes |
| N | 3 | Skipped region (an intron in mRNA-to-genome alignment) | no | yes |
| S | 4 | Soft clip (clipped bases **present** in SEQ) | yes | no |
| H | 5 | Hard clip (clipped bases **absent** from SEQ) | no | no |
| P | 6 | Padding (silent deletion from padded reference) | no | no |
| = | 7 | Sequence match | yes | yes |
| X | 8 | Sequence mismatch | yes | yes |

Rules (§1.4):

- `H` may only be the first and/or last operation.
- `S` may have only `H` operations between it and the ends.
- Sum of lengths of `M`, `I`, `S`, `=`, `X` = length of SEQ (when SEQ is not `*`).
- Derived: alignment end (1-based, inclusive) = POS + sum(`M`, `D`, `N`, `=`, `X`) − 1. Recommended practice §2 item 4.3 uses this sum to test whether the read overruns `@SQ LN`.
- Recommended practice (§2 item 2): adjacent operations should differ (`3M2M` should be `5M`).

### 3.5 Optional fields (§1.5 and SAMtags)

The syntax is `TAG:TYPE:VALUE`. TAG matches `[A-Za-z][A-Za-z0-9]`, no TAG may appear twice in a line, and order does not matter. TYPE is one of:

- `A` (one printable char);
- `i` (signed integer; BAM can hold [−2^31, 2^32));
- `f` (float);
- `Z` (printable string, spaces allowed);
- `H` (hex byte array);
- `B` (typed numeric array, e.g. `B:c,1,-2`; subtypes `cCsSiIf`).

Tags starting with `X`, `Y`, `Z`, or containing a lowercase letter, are reserved for local use and will never be standardised.

| Tag | Type | Meaning (SAMtags) | Course use |
|---|---|---|---|
| `NM` | i | Edit distance: mismatches plus inserted and deleted bases; ambiguity codes count as mismatches; clips, `N` and `P` do not count. "Historically ill-defined" | Read quality filter; recommended on every record (§2 item 6.2) |
| `MD` | Z | Regex `[0-9]+(([A-Z]\|\^[A-Z]+)[0-9]+)*`. Matched runs, mismatched reference bases, and `^`+deleted reference bases. Clips, `N`, `P` and `I` are not represented | Reconstruct reference bases without the FASTA. `10A5^AC6` = 10 matches, ref A mismatched, 5 matches, 2-bp deletion of AC, 6 matches |
| `AS` | i | Aligner-specific alignment score | Not comparable across aligners |
| `RG` | Z | Read group; must match an `@RG ID` if `@RG` lines exist | Sample identity (`@RG SM`) for joint genotyping |
| `SA` | Z | `(rname,pos,strand,CIGAR,mapQ,NM;)+`. Other parts of a chimeric alignment. `pos` is 1-based; `strand` is `+`/`−` as in 0x10. "Conventionally, at a supplementary line, the first element points to the primary line" | Split reads become breakpoints |
| `MC` | Z | CIGAR of the mate/next segment | Mate end without reading the mate; `samtools fixmate -m` and `markdup` use it |
| `MQ` | i | MAPQ of the mate | Filtering discordant pairs |
| `XA` | Z | **bwa-specific** (X = local): alternative hits `(chr,±pos,CIGAR,NM;)*`. bwa source writes `chr,`, then `+`/`−` and the 1-based pos, then CIGAR, then NM [verified: `bwamem_extra.c`] | Repeat/paralog awareness; not portable |
| `CG` | B,I | BAM only: real CIGAR when it has > 65,535 operations | Ultra-long reads |

### 3.6 Annotated minimal VALID example

This is the SAMv1 §1.1 example with `M5`, a read group and a comment added. All separators are single TABs. It passes `samtools view` with no warnings [verified: test].

```
@HD	VN:1.6	SO:coordinate
@SQ	SN:ref	LN:45	M5:7a66cae8ab14aef8d635bc80649e730b
@RG	ID:rg1	SM:demo	PL:ILLUMINA
@PG	ID:toyaligner	PN:toyaligner	VN:0.1
@CO	Example adapted from SAMv1 section 1.1
r001	99	ref	7	30	8M2I4M1D3M	=	37	39	TTAGATAAAGGATACTG	*	RG:Z:rg1
r002	0	ref	9	30	3S6M1P1I4M	*	0	0	AAAAGATAAGGATA	*	RG:Z:rg1
r003	0	ref	9	30	5S6M	*	0	0	GCCTAAGCTAA	*	SA:Z:ref,29,-,6H5M,17,0;	RG:Z:rg1
r004	0	ref	16	30	6M14N5M	*	0	0	ATAGCTTCAGC	*	RG:Z:rg1
r003	2064	ref	29	17	6H5M	*	0	0	TAGGC	*	SA:Z:ref,9,+,5S6M,30,1;	RG:Z:rg1
r001	147	ref	37	30	9M	=	7	-39	CAGCGGCAT	*	NM:i:1	RG:Z:rg1
```

The reference FASTA for it is `>ref` followed by `AGCATGTTAGATAAGATAGCTGTGCTAGTAGGCAGTCAGCGCCAT`. The spec draws the alignments like this (lowercase = clipped, `*` = pad/deletion):

```
Coor     12345678901234  5678901234567890123456789012345
ref      AGCATGTTAGATAA**GATAGCTGTGCTAGTAGGCAGTCAGCGCCAT
+r001/1        TTAGATAAAGGATA*CTG
+r002         aaaAGATAA*GGATA
+r003       gcctaAGCTAA
+r004                     ATAGCT..............TCAGC
-r003                            ttagctTAGGC
-r001/2                                        CAGCGGCAT
```

Reading line `r001 99`, field by field:

- `r001` is the template name; the same name appears on its mate (line `r001 147`).
- `99` = 0x63 = paired, proper pair, mate reverse, first in pair.
- `ref`, `7`: the first reference-consuming base sits at reference position 7 (1-based).
- `30` is MAPQ: P(wrong placement) = 10^-3.
- `8M2I4M1D3M`:
  - query consumed = 8+2+4+3 = **17** = length of `TTAGATAAAGGATACTG`;
  - reference consumed = 8+4+1+3 = **16**, so the alignment ends at 7+16−1 = **22**.
- `=`, `37`: the mate's primary line is on the same reference at POS 37. The mate is `9M` on the reverse strand, so it ends at 45.
- `39`: TLEN = 45 − 7 + 1 = 39. It is positive because this is the leftmost segment; the mate carries −39.
- `*` QUAL: qualities not stored (legal; BAM then stores 0xFF bytes, §4.2.3).
- `RG:Z:rg1` links the record to `@RG ID:rg1`, sample `demo`.

Two more lines worth reading closely:

- `r003` is a chimeric read, written as a primary line `5S6M` and a supplementary line `6H5M` (FLAG 2064 = supplementary + reverse). Each line's `SA` lists the other piece.
- The supplementary piece uses **hard** clipping, so its SEQ holds only the 5 aligned bases.

### 3.7 BAM: what changes in binary (SAMv1 §4)

**BGZF container (§4.1).** BAM is a series of gzip members ("blocks"), each ≤ 64 KiB before and after compression. Each block's gzip header sets FLG.FEXTRA and carries a 6-byte extra subfield: `BC`, length 2, and BSIZE = total block size − 1. Real first 18 bytes of a samtools-written BAM [verified: test]:

```
1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 95 00
|gzip|CM|FLG=4|  MTIME=0  |XFL|OS|XLEN=6|'B''C'|SLEN=2|BSIZE=149 -> block is 150 bytes
```

**Magic and header (§4.2).** After decompression the stream starts:

- `42 41 4d 01` (`BAM\1`);
- `l_text` (uint32, little-endian; 127 here), then the SAM header text;
- `n_ref`, then for each reference: `l_name`, a NUL-terminated name, `l_ref`.

**One alignment record, conceptually.** All integers are little-endian.

| Field | Type | SAM equivalent |
|---|---|---|
| block_size | uint32 | (record length) |
| refID | int32 | RNAME as an index into the reference list; −1 = none |
| pos | int32 | **POS − 1** (0-based); −1 = none |
| l_read_name, mapq, bin | uint8, uint8, uint16 | QNAME length + 1, MAPQ, BAI bin of [pos, end) |
| n_cigar_op, flag | uint16, uint16 | CIGAR op count (max 65,535), FLAG |
| l_seq | uint32 | SEQ length |
| next_refID, next_pos, tlen | int32 ×3 | RNEXT, PNEXT − 1, TLEN |
| read_name | char[] NUL-terminated | QNAME |
| cigar | uint32[] = `len<<4 \| op` | CIGAR, ops `MIDNSHP=X` → 0-8 |
| seq | 4-bit codes, 2 per byte, `=ACMGRSVTWYHKDBN` → 0-15 | SEQ (case is lost; other chars → N) |
| qual | uint8[] raw Phred (no +33); all 0xFF if absent | QUAL |
| aux | tag(2) type(1) value… | optional fields; integers stored as the smallest of `cCsSiI` |

**EOF marker (§4.1.2).** The file should end with this exact 28-byte empty block:

```
1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00 03 00 00 00 00 00 00 00 00 00
```

**Index files (§5, CSIv1).**

- **BAI** (`.bai`, uncompressed, magic `BAI\1` [verified: test]) uses six fixed bin levels (2^29, 2^26, 2^23, 2^20, 2^17, 2^14 bp; bins 0-37448) plus a 16-kbp linear index. Pointers are **virtual offsets**: `coffset<<16 | uoffset`, meaning "block starting at compressed byte coffset, byte uoffset inside it". The scheme "does not support reference chromosome sequences longer than 2^29 − 1".
- **CSI** (`.csi`, BGZF-compressed, magic `CSI\1`) parameterises `min_shift` (default 14) and `depth`. htslib raised depth to 6 automatically for a 600-Mbp contig [verified: test].

### 3.8 CRAM: what changes (CRAMv3)

- **File definition (§6).** 26 bytes: `CRAM` (`43 52 41 4d`), major version byte, minor version byte, then a 20-byte file id. samtools writes the file name, NUL-padded [verified: test].
- **Valid versions:** 1.0, 2.0, 2.1, 3.0, 3.1. "CRAM 3.0 and 3.1 differ only in the list of compression methods available." 3.1 adds block methods 5-8: rANS4x16, adaptive arithmetic, fqzcomp (qualities), name tokeniser.
- **Default version.** samtools/htslib **1.22 and later write 3.1 by default** (htslib benchmarks page [verified: www.htslib.org source]). samtools 1.24 wrote `CRAM\3\1` [verified: test].
- **Structure (§5).** File definition → CRAM header container (holds the SAM header text) → data containers → EOF container. Each container = container header + compression header block + one or more **slices**. Each slice = slice header block + one core data block + external data blocks. Each block = method, content type, content id, sizes, data, CRC32.
- **Where records go.** Records are split into "data series" (BF = BAM flags, AP = positions, RL = read length, RN = names, QS = qualities, BS = base substitutions, …), each compressed with the codec that suits it. This is why CRAM beats BAM even without a reference.
- **Reference-based bases (§10.6).** A mapped read stores only "read features" relative to the reference: substitution `X` (as a code into a 5×4 substitution matrix), insertion `I`, deletion `D`, soft clip `S`, hard clip `H`, ref skip `N`, and so on. Matching bases are not stored at all.
- **Reference fingerprints.** Each slice header stores the MD5 of the reference bases it spans (§8.5). The SAM header in a CRAM **must** carry `@SQ M5` unless the reference is embedded (§8.3, §11). samtools added `M5:` and `UR:` to `@SQ` automatically when writing CRAM [verified: test].
- **Embedded reference (`embed_ref=1` or `2`).** A slice may carry the reference bases it covers. The file then decodes without any external FASTA (§8.5; htslib reference docs: "around 700MB larger" for a human genome).
- **Lossy options.** CRAM "does not impose any rules about what data should or should not be preserved" (§1). Quality scores are optional per record (CF bit 0x1 "quality scores stored as array"). Read names are optional per container (preservation map `RN`; htslib `lossy_names`). Quality binning happens before encoding.
- **EOF container (§9).** It is required in v3. It is exactly 38 bytes; its "alignment start" field is 4542278 = 0x454F46, ASCII "EOF":

```
0f 00 00 00 ff ff ff ff 0f e0 45 4f 46 00 00 00 00 01 00 05 bd d9 4f 00 01 00 06 06 01 00 01 00 01 00 ee 63 01 4b
```

- **`.crai` (§12).** A gzip-compressed (plain gzip, FLG 00 [verified: test]), TAB-delimited text file with one line per slice and six columns:
  1. reference id (0-based);
  2. alignment start;
  3. alignment span;
  4. absolute byte offset of the container;
  5. slice offset relative to the end of the container header (the "landmark");
  6. slice size.

  The spec example file gave the single line `0	7	39	433	234	373` [verified: test].

**Size, measured by others.** From the htslib benchmark page, 10 M coordinate-sorted alignments per dataset (sizes in MB):

| Dataset | BAM | CRAM 3.0 | CRAM 3.1 |
|---|---|---|---|
| NovaSeq (binned qualities) | 515 | 207 | 176 |
| HiSeq 2500 2×250 (full-resolution qualities) | 1546 | 880 | 852 |
| PacBio Revio | 4832 | 1386 | 1288 |

In the NovaSeq CRAM 3.1, qualities are 50% of the file; in the HiSeq one they are 86%. For the NovaSeq X set, `embed_ref=1` gave 186.8 MB and `no_ref` gave 224.2 MB versus 175.5 MB for a normal CRAM 3.1.

**Size, measured here** [verified: test]. I simulated 200,000 2×150 reads (30×) from 1 Mbp of real GRCh38 chr2 and compressed them with samtools 1.24:

| Qualities | BAM (bytes/read) | CRAM 3.0 | CRAM 3.1 | CRAM 3.1 `no_ref` |
|---|---|---|---|---|
| 4-level binned (NovaSeq-like) | 52.0 | 18.5 (0.36×) | 16.6 (0.32×) | 23.2 (0.45×) |
| Full-range, noisy (synthetic, unrealistically random) | 126.8 | 88.2 (0.70×) | 86.3 (0.68×) | 90.8 (0.72×) |
| QUAL removed (`*`) | 28.3 | — | 4.2 (0.15×) | — |

The lesson: reference compression nearly erases the cost of the bases (4.2 vs 28.3 bytes/read). What remains is mostly quality scores, which is why binned qualities matter so much.

## 4. Coordinate system and conventions

**Coordinates**

- **SAM text is 1-based closed.** POS, PNEXT, the `pos` inside `SA` and bwa `XA`, and region strings like `chr2:166012311-166012410` are all 1-based.
- **BAM binary is 0-based.** `pos` = POS − 1, and unmapped = −1 (§4.2). BAI bins and `reg2bin()` work on 0-based half-open `[beg, end)`. Students never see this unless they parse bytes; the converter does it.
- **CRAM** stores AP as 1-based "as per SAM" when not delta-encoded (§10.2).
- **End coordinate:** `end = POS + refspan − 1`, where refspan = sum of `M`/`D`/`N`/`=`/`X`. Converting a read to BED: `chromStart = POS − 1`, `chromEnd = POS − 1 + refspan`. PAF target coordinates (PAF/GFA lesson) are 0-based half-open as well.

**Strand and orientation**

- SEQ is shown on the + strand. For 0x10 reads, SEQ is the reverse complement of the machine read and QUAL is reversed (§1.4).
- CIGAR is also written in reference order. For a reverse read, the *leading* `S` in the CIGAR is the *3′ end* of the original read. This is why LUMPY reverses the CIGAR of `-` SA entries before computing query offsets [verified: `extractSplitReads_BwaMem`].

**TLEN (§1.4 item 9)**

- For primary reads with both segments on the same reference, |TLEN| = rightmost mapped end − leftmost mapped start + 1. Soft clips are excluded.
- It is positive on the leftmost segment and negative on the rightmost. If both segments start at the same coordinate the choice is arbitrary, but the signs must differ.
- It is 0 for single-segment templates, for different chromosomes, or when a segment is unmapped.
- The exact definition is "implementation-defined". Early specs measured 5′ to 5′. bwa still does: its source computes TLEN from each read's 5′ end (`p->pos` for forward reads, the end for reverse reads) [verified: `bwamem.c`].

**Sorting (§1.3, `@HD SO`)**

- **`coordinate`**: by RNAME in **`@SQ` order** (not alphabetical), then POS. Ties are arbitrary. RNAME `*` comes last. Required for indexing and for every region query.
- **`queryname`**: all records of a template are adjacent. The spec deliberately does not define the collation. `samtools sort -n` uses "natural" order (a7b < a12b) and writes `SS:queryname:natural`; `-N` uses lexicographic order and writes `SS:queryname:lexicographical`. Within a name, records order by READ1/READ2, then primary, supplementary, secondary [verified: `samtools-sort.1`].
- **What needs which order:**
  - `samtools fixmate` and `bedtools bamtobed -bedpe` need name-grouped input ("file is sorted/grouped by the read name");
  - `index`, `depth`, `mpileup` and variant callers need coordinate order.
- `GO` (group order) and `SS` (sub-sort) are optional refinements.

**Compression and index files**

| Data | Compression | Index | Index magic / form |
|---|---|---|---|
| `.sam` | none | none | — |
| `.sam.gz` | must be **BGZF** (`bgzip`) to index; plain gzip is readable but "not BGZF compressed" for indexing [verified: test] | `.bai`/`.csi` | — |
| `.bam` | BGZF | `.bam.bai` (or `.bai`), `.bam.csi` | BAI: raw `BAI\1`. CSI: BGZF, `CSI\1` |
| `.cram` | containers/blocks (gzip, bzip2, lzma, rANS, …) | `.cram.crai` | gzip TSV, 6 columns |

## 5. Validity rules

**Severity labels**

- **error**: the spec says MUST/must/required, or the data cannot be interpreted.
- **warning**: the spec says should, or the rule is a recommended practice.
- **convention**: no spec requirement, but common tools enforce it or depend on it.

**Columns**

- "Spec" cites SAMv1 v1.6 (hts-specs master, 2026-10-16), SAMtags (same date), or CRAMv3 (describes 3.0 and 3.1).
- "samtools 1.24" records what `samtools view` actually did with the example [verified: test]. Many spec violations are **silently accepted**, which is exactly why the course needs its own validator.

### 5a. SAM structural rules

| ID | Rule | Spec | Minimal violation | Severity | samtools 1.24 |
|---|---|---|---|---|---|
| SAM-S01 | Header lines, if present, come before all alignment lines | v1.6 §1 | `@CO	late` after a record | error | "Parse error at line 4" |
| SAM-S02 | Header lines are TAB-separated and match `^@(HD\|SQ\|RG\|PG)(\t[A-Za-z][A-Za-z0-9]:[ -~]+)+$` or `^@CO\t.*` | v1.6 §1.3 | `@HD VN:1.6 SO:coordinate` (spaces); `@XX	AB:cd` | error | "fail to read the header"; "Invalid header line: must start with @HD/@SQ/@RG/@PG/@CO" |
| SAM-S03 | At most one `@HD`, and it is the first line; `VN` required, `^[0-9]+\.[0-9]+$` | v1.6 §1.3 | `@SQ` line before `@HD` | error | silently moves `@HD` to the top |
| SAM-S04 | `@SQ` has `SN` and `LN`; `LN` in [1, 2^31−1]; `SN` values distinct; `SN` matches the rname regex | v1.6 §1.3, §1.2.1 | `@SQ	SN:ref` / `LN:0` / two `SN:ref` | error | "invalid or no LN: tag"; "Duplicate entry "ref"" |
| SAM-S05 | `@RG` and `@PG` each have a unique `ID`; `@PG PP` names an existing `@PG ID` | v1.6 §1.3 | `@RG	SM:kid` | error | "Header includes @RG line with no ID: tag" |
| SAM-S06 | No tag repeated within one header line | v1.6 §1.3 | `@SQ	SN:a	LN:5	LN:6` | error | not tested |
| SAM-S07 | Each alignment line has ≥ 11 TAB-separated fields | v1.6 §1.4 | 10 fields; or fields separated by spaces | error | "Parse error" |
| SAM-S08 | QNAME matches `[!-?A-~]{1,254}`: printable, no `@`, no space, ≤ 254 chars | v1.6 §1.2.1, §1.4 | 255-char name; `r 1`; `@r1` at line start | error | 255 chars: "query name too long". `r 1`: **accepted**. `@r1…`: parsed as a header line, fails |
| SAM-S09 | FLAG [0, 65535]; POS and PNEXT [0, 2^31−1]; MAPQ [0, 255]; TLEN an integer in [−2^31+1, 2^31−1] | v1.6 §1.4 | MAPQ `256`; FLAG `65536`; TLEN `1.5` | error | "number outside allowed range"; "Parse error" |
| SAM-S10 | CIGAR is `*` or `([0-9]+[MIDNSHP=X])+`, uppercase | v1.6 §1.4 | `5m`, `5Q` | error | "Unrecognized CIGAR operator" |
| SAM-S11 | `H` only as first and/or last op; `S` only with `H` between it and the end | v1.6 §1.4 item 6 | `2M1S2M`; `3M2H2M`; `2S3H5M` | error | **all three accepted silently** |
| SAM-S12 | If SEQ ≠ `*`: sum of `M`/`I`/`S`/`=`/`X` lengths = length(SEQ) | v1.6 §1.4 items 6, 10 | `8M2I4M1D3M` with a 16-base SEQ | error | "CIGAR and query sequence are of different length" |
| SAM-S13 | If QUAL ≠ `*`: SEQ ≠ `*` and length(QUAL) = length(SEQ) | v1.6 §1.4 item 11 ("ought to") | SEQ `TTAGA`, QUAL `IIII`; SEQ `*` with QUAL `IIIII` | error | "SEQ and QUAL are of different length" |
| SAM-S14 | QUAL characters in `!`-`~` (Phred 0-93) | v1.6 §1.4 | `II II` | error | "invalid QUAL character" |
| SAM-S15 | SEQ alphabet `[A-Za-z=.]` | v1.6 §1.4 | `TT-GA` | error | **accepted, rewritten to `TTNGA`** |
| SAM-S16 | Optional fields are `TAG:TYPE:VALUE`; TAG `[A-Za-z][A-Za-z0-9]`; TYPE in `AifZHB`; VALUE matches the type's regex | v1.6 §1.5 | `NM:Q:0`; `NM:0`; `NM:i:one` | error | `Q`: "unrecognized type 'Q'". `NM:0`: "Incomplete aux field". `NM:i:one`: **accepted and stored as `NM:i:0`** |
| SAM-S17 | A TAG appears at most once per line | v1.6 §1.5 | `NM:i:0	NM:i:1` | error | **accepted, both written** |
| SAM-S18 | Exactly one primary line (`FLAG & 0x900 == 0`) per read | v1.6 §1.4 item 2 | two `r003` lines, both FLAG 0 | error | not checked |
| SAM-S19 | Reserved FLAG bits (> 0x800) not set | v1.6 §1.4 item 2 | FLAG `4096` | warning | not checked |
| SAM-S20 | Text is 7-bit ASCII (UTF-8 only in named fields such as `@CO`, `DS`, `CL`); no byte-order mark | v1.6 §1 | file starting with `EF BB BF` | error | not tested. CRLF line ends were accepted |

### 5b. SAM semantic and consistency rules

| ID | Rule | Spec | Minimal violation | Severity | samtools 1.24 |
|---|---|---|---|---|---|
| SAM-M01 | RNAME (if not `*`) is an `@SQ SN` | v1.6 §1.4 item 3 | `chr1` with only `@SQ	SN:ref` | error | warning "unrecognized reference name "chr1"; treated as unmapped". With no `@SQ` at all: error "no SQ lines present in the header" |
| SAM-M02 | RNEXT (if not `*` or `=`) is an `@SQ SN` | v1.6 §1.4 item 7 | RNEXT `chrZ` | error | warning, "treated as unmapped" |
| SAM-M03 | A mapped record (0x4 unset) has RNAME ≠ `*`, POS ≥ 1 and CIGAR ≠ `*` | v1.6 §1.4 items 3-6 | FLAG 16 with POS 0; FLAG 0 with CIGAR `*` | error | warning; record converted to unmapped |
| SAM-M04 | Only 0x4 decides "unmapped". A validator must *not* flag RNAME/POS/CIGAR/MAPQ/0x2/0x100/0x800 on a 0x4 record | v1.6 §1.4 item 2 | (validator behaviour) | — | n/a |
| SAM-M05 | POS ≤ `@SQ LN` of RNAME | v1.6 §1.4 (POS on that reference); htsjdk `INVALID_ALIGNMENT_START` | `@SQ LN:45`, POS `100` | error | **accepted**; `samtools index` also accepted it |
| SAM-M06 | Alignment end (POS + refspan − 1) ≤ LN unless `TP:circular`; otherwise the read "should be unmapped" | v1.6 §2 item 4.3, §2 item 7 | POS 44 with `5M` on LN 45 | warning | accepted |
| SAM-M07 | `SO:coordinate` means records are ordered by `@SQ` order, then POS, with `*` last | v1.6 §1.3 (`@HD SO`) | POS 20 followed by POS 7 | error | `view` accepts. `index` fails: "Unsorted positions on sequence #1: 20 followed by 7" |
| SAM-M08 | `RG:Z:x` matches an `@RG ID` when `@RG` lines exist (also `LB`, `PU`) | SAMtags §1.2 ("must match") | `RG:Z:nope` | error | **accepted silently** |
| SAM-M09 | `PG:Z:x` matches an `@PG ID` | SAMtags §1.2 | `PG:Z:bwa2` with only `@PG ID:bwa` | warning | not checked |
| SAM-M10 | Mates agree: RNEXT/PNEXT = mate's primary RNAME/POS; 0x20 = mate's 0x10; 0x8 = mate's 0x4; `MC` = mate's CIGAR | v1.6 §1.4 items 2, 7, 8; SAMtags `MC`; htsjdk `MISMATCH_FLAG_MATE_*`, `MISMATCH_MATE_CIGAR_STRING` | R1 says PNEXT 37 but R2's POS is 38 | error | not checked |
| SAM-M11 | TLEN signs differ between the two ends; TLEN = 0 for unpaired, unmapped or inter-chromosomal reads | v1.6 §1.4 item 9 | both mates `+39` | warning (definition is implementation-defined) | not checked |
| SAM-M12 | All records of one read (chimeric or multi-mapped) share QNAME and the 0x40/0x80 values | v1.6 §1.2 | primary 99, its supplementary has 0x80 | error | not checked |
| SAM-M13 | `SA` matches `(rname,pos,strand,CIGAR,mapQ,NM;)+`; each entry describes another record of the same read | SAMtags §1.1 | `SA:Z:garbage`; `SA` pointing at a POS where no piece exists | error (grammar) / warning (cross-record) | **`SA:Z:garbage` accepted** |
| SAM-M14 | `MD` matches its regex and agrees with CIGAR, SEQ and the reference; `NM` = mismatches + I + D bases | SAMtags §1.1 | `MD:Z:xyz`; `NM:i:0` on `8M2I4M1D3M` | error (MD grammar) / warning (values: "historically ill-defined") | `MD:Z:xyz` accepted. `samtools calmd -e` recomputes both |
| SAM-M15 | If 0x1 is unset, ignore 0x2/0x8/0x20/0x40/0x80. A validator may warn when they are set | v1.6 §1.4 item 2; htsjdk `INVALID_FLAG_PROPER_PAIR` (WARNING) | FLAG 2 (proper pair, unpaired) | warning | not checked |
| SAM-M16 | `CG` tag must not appear in SAM or CRAM (BAM-only workaround) | SAMtags `CG` | `CG:B:I,…` in a `.sam` | warning | not tested |
| SAM-M17 | Files with > 65,535-op CIGARs should declare `@HD VN` ≥ 1.6 | SAMtags Appendix (Nov 2017) | `VN:1.5` with a 70,000-op CIGAR | warning | not tested |

### 5c. SAM de facto conventions (tools depend on them; the spec does not require them)

| ID | Convention | Source | Violation | Severity |
|---|---|---|---|---|
| SAM-C01 | `@HD` present with `SO` (or `GO`, not both) | v1.6 §2 item 1.1 (should) | no `@HD` | convention |
| SAM-C02 | `@SQ` lines present for mapped data, and they carry `M5` (needed for CRAM and for build checks) | v1.6 §2 item 1.2; CRAMv3 §11 | `@SQ` with no `M5` | convention |
| SAM-C03 | Every record has `RG:Z`, and `@RG` has `SM` (GATK refuses BAMs without read groups) | GATK behaviour [from memory - verify] | no `@RG` | convention |
| SAM-C04 | MAPQ 255 is not used for real alignments. Some RNA aligners emit 255 for "unique" | v1.6 §2 item 3 (should not); STAR behaviour [from memory - verify] | MAPQ 255 on mapped reads | warning |
| SAM-C05 | No adjacent identical ops (`3M2M`) and no zero-length ops (`0M5M`) | v1.6 §2 item 2 | `0M5M` (samtools accepted it) | warning |
| SAM-C06 | An unmapped read with a mapped mate takes the mate's RNAME/POS; a fully unmapped pair has `*`/0 | v1.6 §2 items 4.1-4.2 | FLAG 133 with RNAME `*` while the mate is at chr2:166012311 | convention |
| SAM-C07 | Secondary lines have SEQ and QUAL `*` | v1.6 §2 item 5.2; bwa does this [verified: `bwamem.c`] | — | convention |
| SAM-C08 | `NM` present on mapped records | v1.6 §2 item 6.2 | missing `NM` | convention |
| SAM-C09 | Supplementary lines are hard-clipped (bwa default; `-Y` gives soft clips; minimap2 `-Y` likewise); the first `SA` element on a supplementary line points to the primary | bwa.1; minimap2.1; SAMtags `SA` | — | convention |
| SAM-C10 | Contig names match the FASTA, BED, VCF and GTF used with the file (`chr2` vs `2`); `M5` matches the FASTA | cross-file (see Foundations XF rules) | BAM `chr2`, targets BED `2` | error (pipeline) |
| SAM-C11 | X/Y/Z and lowercase tags (`XA`, `XS`, `pa`) are tool-specific: never rely on them across aligners | v1.6 §1.5 | parsing `XA` from minimap2 output | convention |
| SAM-C12 | Queryname collation (natural vs lexicographic) is recorded in `@HD SS` and is the same in every file being merged | v1.6 §1.3 footnote; samtools-sort.1 | merging `-n` and `-N` outputs | warning |

### 5d. BAM rules

| ID | Rule | Spec | Minimal violation | Severity | Tool behaviour |
|---|---|---|---|---|---|
| BAM-S01 | Every block is a gzip member with FLG.FEXTRA and a `BC` subfield (SLEN 2, BSIZE = block size − 1); ≤ 64 KiB before and after compression | v1.6 §4.1 | a plain-`gzip` stream: header `1f 8b 08 00 …` | error | `view` read it (EOF warning). `quickcheck` **passed** it. `index`: "not BGZF compressed" [verified: test] |
| BAM-S02 | Decompressed stream begins with magic `BAM\1` (`42 41 4d 01`) | v1.6 §4.2 | bgzipped VCF: decompresses to `##fileformat=VCF…` | error | — |
| BAM-S03 | The file ends with the exact 28-byte EOF block | v1.6 §4.1.2 ("should be written"; its absence "should trigger a warning or error") | file cut at a block boundary | error (course); warning (spec) | `view`: all records, plus "EOF marker is absent. The input is probably truncated". `quickcheck`: "missing EOF block". `gzip -t`: **passes** [verified: test] |
| BAM-S04 | A block cut mid-way is corrupt | v1.6 §4.1; RFC 1952 | 300 of 436 bytes | error | "Failed to read BGZF block data at offset 150 expected 240 bytes"; `gzip -t`: "unexpected end of file" |
| BAM-S05 | Little-endian integers; `l_text`, `n_ref`, `l_ref` < 2^31; `refID`/`next_refID` in [−1, n_ref) | v1.6 §4.2 | refID 7 with n_ref 3 | error | — |
| BAM-S06 | `pos`/`next_pos` are 0-based (POS − 1); −1 = none; `l_read_name` = length(QNAME) + 1 | v1.6 §4.2 | (writer bug: storing POS unchanged gives an off-by-one shift) | error | — |
| BAM-S07 | `n_cigar_op` ≤ 65,535; longer CIGARs go in `CG:B:I` with placeholder `kSmN` | v1.6 §4.2.2 | — | error | htslib warns "encodes a CIGAR with N operators at the CG tag" |
| BAM-M01 | `bin` = `reg2bin(pos, end)`. Unmapped reads and reads with no reference-consuming ops count as length 1; `reg2bin(-1,0)` = 4680 | v1.6 §4.2.1, §5.3 | stale `bin` after editing POS | error | htsjdk `INVALID_INDEXING_BIN` |
| BAM-M02 | Indexing requires coordinate-sorted input | v1.6 §5 | unsorted BAM | error | "Unsorted positions … cannot be indexed" |
| BAM-M03 | `.bai` cannot address positions ≥ 2^29 (512 Mbp); use `.csi` | v1.6 §5.1.1; samtools-index.1 | `@SQ LN:600000000`, read at 550,000,000 | error | "Region 549999999..550000004 cannot be stored in a bai index. Try using a csi index"; `index -c` succeeded |
| BAM-C01 | The index sits beside the data (`x.bam.bai`, `x.bam.csi`) and was built from *this* file, after its last modification | samtools-index.1; htslib warns that an index is older than its data [from memory - verify] | `.bai` from a pre-markdup BAM | convention (silent wrong answers) |
| BAM-C02 | The binary reference list and the `@SQ` text lines agree | v1.6 §4.2 (both present) [from memory - verify which wins in each library] | header edited by hand without re-encoding | convention |

### 5e. CRAM rules

| ID | Rule | Spec | Minimal violation | Severity | Tool behaviour |
|---|---|---|---|---|---|
| CRAM-S01 | The file starts with the 26-byte definition: `CRAM`, major, minor, 20-byte id | CRAMv3 §6 | `BAM\1…` renamed to `.cram` | error | — |
| CRAM-S02 | major.minor ∈ {1.0, 2.0, 2.1, 3.0, 3.1}; this spec covers 3.0/3.1 | CRAMv3 §6 | `CRAM\3\2` | error | — |
| CRAM-S03 | Block methods 5-8 (rANS4x16, arithmetic, fqzcomp, name tokeniser) are only legal in 3.1 files | CRAMv3 §8 (method table lists "first CRAM version") | header says 3.0, a block uses method 7 | error | — |
| CRAM-S04 | The first container holds the SAM header (block raw or gzip only) | CRAMv3 §5, §7.1, §8.3 | — | error | — |
| CRAM-S05 | v3 files end with the 38-byte EOF container | CRAMv3 §9 | last 38 bytes removed | error | `view`: records read, "EOF marker is absent". `quickcheck`: "missing EOF block" [verified: test] |
| CRAM-S06 | CRC32 checksums on container headers and blocks validate (v3.0+) | CRAMv3 §7, §8, §15 history | bit flip in a block | error | decode error |
| CRAM-S07 | A slice's reference id equals its container's; a multi-ref slice uses −2 and the RI data series | CRAMv3 §7, §8.5 | — | error | — |
| CRAM-M01 | `@SQ M5` present for every reference unless that reference is embedded | CRAMv3 §8.3, §11 item 1 | `@SQ	SN:chr2	LN:242193529` with no `M5` | error | samtools adds `M5` (and `UR`) when writing |
| CRAM-M02 | The reference used to decode matches each slice's MD5 | CRAMv3 §8.5, §11 item 2 | one base changed in the FASTA | error | "MD5 checksum reference mismatch at ref:7-45 … Please check the reference given is correct". With `ignore_md5=1` it **decodes the wrong base silently**: `CAGCGGCAT` became `CAGCGGCAA` [verified: test] |
| CRAM-M03 | The reference must be obtainable at decode time (unless embedded or `no_ref`) | CRAMv3 §11; samtools.1 "REFERENCE SEQUENCES" | FASTA moved after encoding | error | "Unable to fetch reference ref:7-45 … Failure to decode slice". `view -c` and `quickcheck` still work without it |
| CRAM-M04 | Indexing only on coordinate-sorted files; every slice is listed in `.crai` | CRAMv3 §12 | — | error | — |
| CRAM-C01 | Keep the exact FASTA (by `M5`) for as long as the CRAMs. htslib ≥ 1.22 no longer falls back to the EBI reference server, and http/ftp `UR` values are ignored | samtools.1 (1.24) "REF_PATH", "REFERENCE SEQUENCES"; htslib reference_seqs doc | lab relies on the EBI server | convention (critical) |
| CRAM-C02 | Writers that use no 3.1 codecs should label the file 3.0; check that consumers read 3.1 (the htslib page says htsjdk support was still a pull request when written [from memory - verify current status]) | CRAMv3 §6 ("should"); htslib benchmarks | 3.1 CRAM handed to an htsjdk-based tool | convention |
| CRAM-C03 | A round trip is not textually identical. htslib regenerates `MD`/`NM` on decode by default (`decode_md=1`) and may regenerate read names (`lossy_names`) | samtools.1 fmt options; observed [verified: test] | `diff` of SAM→CRAM→SAM flags `MD`/`NM` lines | convention |
| CRAM-C04 | Lossy choices (binned or dropped qualities, dropped names) are recorded in `@PG`/`@CO` | CRAMv3 §1 (no rule imposed) | — | convention |

## 6. Recognition cues

| You see | It is | Look-alike and how to tell |
|---|---|---|
| Text starting `@HD	VN:` or `@SQ	SN:` | SAM header | FASTQ also starts with `@`, but a FASTQ header is `@readname …` followed by a sequence line and a `+` line. SAM header codes are exactly two uppercase letters then a TAB |
| ≥ 11 TAB-separated columns; col 2 an integer, col 4 an integer, col 6 like `150M` or `60M40S`, col 7 `=` or `*` | SAM alignment line | **PAF** has 12+ columns with a strand `+`/`−` in col 5, lengths in cols 2 and 7, and tags like `tp:A:P`. **BLAST tabular** (outfmt 6) has 12 columns ending in e-value and bitscore |
| Bytes `1f 8b 08 04 … 06 00 42 43 02 00` | BGZF (BAM, `.vcf.gz`, `.bed.gz`, `.fa.gz` from bgzip, `.csi`) | Decompress the first block: `BAM\1` = BAM; `##fileformat=VCF` = VCF; `BCF\2\2` = BCF [from memory - verify] |
| Bytes `1f 8b 08 00` or `1f 8b 08 08` (a file name follows) | plain gzip | Not BGZF: cannot be indexed; never a valid BAM |
| First 4 bytes `43 52 41 4d` (`CRAM`) then `03 00`/`03 01` | CRAM 3.0 / 3.1 | The next 20 bytes are usually the file name, NUL-padded |
| Last 28 bytes `1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00 03 00 00 00 00 00 00 00 00 00` | complete BGZF file | Any other tail means truncated (or plain gzip) |
| Last 38 bytes contain `e0 45 4f 46` ("EOF") and end `ee 63 01 4b` | complete CRAM v3 | — |
| `42 41 49 01` (`BAI\1`), uncompressed | `.bai` | `.csi` is BGZF and decompresses to `CSI\1`; `.crai` is plain gzip of TAB text |
| Extensions | `.sam`, `.sam.gz`, `.bam`, `.cram`, `.bai`, `.bam.bai`, `.csi`, `.crai`; unaligned BAM is often `.ubam` or `.unmapped.bam` | Extensions lie; magic bytes do not |

## 7. Common misconceptions and real-world pitfalls

1. **"MAPQ is a quality score of the read."** It is the probability that the *placement* is wrong. A perfect read in a segmental duplication gets MAPQ 0. MAPQ 255 means "unavailable", not "excellent". Some tools nevertheless use 255 for unique hits [from memory - verify for STAR].
2. **"RNAME/POS filled in means mapped."** Only 0x4 says that. Placed unmapped mates sit at their partner's coordinates on purpose (§1.4, §2 item 4.1).
3. **"Secondary and supplementary are the same thing."**
   - Secondary (0x100) = the *whole* read placed elsewhere (a repeat); usually low MAPQ; SEQ often `*`.
   - Supplementary (0x800) = *another part* of the same read (a split); can have high MAPQ.
   - `samtools depth` skips SECONDARY by default but **counts supplementary** [verified: samtools-depth.1]. `samtools fastq` drops both (0x900) by default.
   - `bwa mem -M` marks shorter split hits secondary instead, for tools that "may not work with split alignments" (bwa.1). That hides SV evidence.
4. **"M means match."** `M` includes mismatches. Use `=`/`X` (minimap2 `--eqx`) or `MD`/`NM` to see mismatches.
5. **"SEQ is what the sequencer read."** For 0x10 reads it is the reverse complement, and QUAL is reversed. Hard-clipped supplementary lines hold only part of the read. Reconstruct FASTQ only from primary lines.
6. **Off-by-one between SAM and everything 0-based.** BAM `pos`, BED, BEDPE and PAF are 0-based; SAM, `SA` and `XA` positions are 1-based. Read end = POS + refspan − 1, **not** POS + read length − 1. Soft clips and insertions make those differ.
7. **"TLEN is the insert size."** It is the *observed* span on the reference. Across a 368-bp deletion a 300-bp fragment shows TLEN 668. That inflation is the discordant-pair signal. Sign conventions and 5′-vs-leftmost definitions differ between tools.
8. **"0x2 proper pair is defined by the spec."** It is "according to the aligner". bwa infers it from the insert-size distribution of each batch.
9. **Sorting a SAM with Unix `sort`.** Coordinate order follows `@SQ` order (chr1, chr2, …, chr10 in GRCh38's dictionary), not alphabetical order. Queryname order differs between libraries (natural vs lexicographic).
10. **Truncated files that "work".** A BAM cut at a block boundary passes `gzip -t` and `samtools view` reads every surviving record with only a warning [verified: test]. Always run `samtools quickcheck`. But `quickcheck` passed a plain-gzip "BAM" and does not read the middle of the file, so it is not a validator either.
11. **Stale or mismatched indexes.** An index built before re-sorting or `markdup` returns wrong or empty regions. `.bai` cannot handle contigs ≥ 512 Mbp (some plant and amphibian genomes); use `.csi`.
12. **CRAM without its reference is a brick.**
    - htslib ≥ 1.22 no longer fetches from the EBI server by default, and http/ftp `UR:` tags are ignored.
    - A "close enough" FASTA (UCSC hg38 vs the Broad analysis set) fails the per-contig MD5 check.
    - `ignore_md5=1` silently corrupts bases [verified: test].
13. **"CRAM is lossy."** It is lossless by default; loss is opt-in. A SAM→CRAM→SAM round trip still differs textually, because `MD`/`NM` are regenerated (`decode_md`) [verified: test]. Compare records, not `diff` output.
14. **"samtools accepted it, so it's valid."** samtools 1.24 accepted all of these, which is why the course needs its own validator (§5):
    - mid-CIGAR `S`;
    - duplicate tags;
    - `NM:i:one` (stored as 0);
    - `-` in SEQ (stored as N);
    - a space in QNAME;
    - `RG` with no `@RG`;
    - reads past the contig end.
15. **Read groups are sample identity.** Joint genotyping tells mother from child by `@RG SM`. A copy-pasted SM produces a sample swap that looks like a de novo variant.
16. **Duplicates inflate evidence.** A "de novo" supported only by 0x400 reads is one molecule counted many times.

## 8. Exercise bank

Exercises use the SAMv1 toy reference (`>ref`, 45 bp, given in §3.6) unless they say "case". Every SAM snippet uses single TAB separators between fields; say so in the exercise UI and render tabs visibly (e.g. as a faint `→`).

### EX-01 · simulator (FLAG bit decoder) + predict: "Pair the mates"

**Prompt.** Eight FLAG values from one BAM: `99, 147, 83, 163, 77, 141, 73, 133`. Before using the decoder, predict which values are mates of each other, then toggle the 12 bits to check.

**Answer.**

- 99↔147 (R1 forward / R2 reverse);
- 83↔163 (R1 reverse / R2 forward);
- 77↔141 (both unmapped);
- 73↔133 (R1 mapped with mate unmapped / R2 unmapped).

**Explanation.**

- Mates must agree crosswise: my 0x20 equals your 0x10, my 0x8 equals your 0x4.
- Exactly one of them has 0x40 and the other 0x80.
- 73/133 is the "singleton": 133 is a placed unmapped read sitting at its mate's position.

### EX-02 · sort: "Does `samtools depth` count it?"

**Prompt.** Sort these records into **Counted** and **Skipped** under `samtools depth` defaults: `99`, `1123`, `355`, `2145`, `133`, `73`, `611`.

**Answer.**

- **Counted:** 99, 2145 (supplementary *is* counted), 73.
- **Skipped:**
  - 1123 (DUP);
  - 355 (SECONDARY);
  - 133 (UNMAP);
  - 611 = 0x263 (QCFAIL).

**Explanation.** The default exclusion mask is UNMAP, SECONDARY, QCFAIL, DUP [samtools-depth.1]. Supplementary pieces are real evidence of where part of the molecule lies, so depth counts them. Their flanks contribute to the WIG lesson's coverage track.

### EX-03 · simulator (CIGAR-to-alignment drawer): "Draw r001"

**Prompt.** Reference `AGCATGTTAGATAAGATAGCTGTGCTAGTAGGCAGTCAGCGCCAT`. Read `TTAGATAAAGGATACTG`, POS 7, CIGAR `8M2I4M1D3M`. First *predict* the last reference position covered, then build the alignment op by op.

**Answer.** End = 7 + (8+4+1+3) − 1 = **22**. Drawing (spec §1.1):

```
ref   AGCATGTTAGATAA**GATAGCTGTGC
read        TTAGATAAAGGATA*CTG
```

**Explanation.**

- `8M` aligns `TTAGATAA` to ref 7-14.
- `2I` places `AG` between ref 14 and 15 (the `**` pads in the ref row).
- `4M` aligns `GATA` to 15-18.
- `1D` skips ref 19 (`G`).
- `3M` aligns `CTG` to 20-22.

`I` advances only the read; `D` advances only the reference.

### EX-04 · predict: "CIGAR arithmetic, four quick ones"

For each record give (a) the query length implied by the CIGAR, (b) the reference span, and (c) the 1-based end.

| Record | (a) | (b) | (c) |
|---|---|---|---|
| POS 9, `3S6M1P1I4M` | 14 (`S`, `M`, `I` count; `P` does not) | 10 | 18 |
| POS 16, `6M14N5M` | 11 | 25 (`N` consumes reference) | 40 |
| POS 29, `6H5M` | 5 (SEQ holds only 5 bases; the original read was 11) | 5 | 33 |
| case: POS 166012311, `60M368D40M` | 100 | 468 | 166012778 |

**Explanation.** The fourth row shows that the split read of EX-08 *could* be written as one linear record. bwa does not do so, because a 368-bp gap costs more than clipping (affine gap penalties; local alignment). The deletion therefore appears as primary + supplementary. Both forms end at 166,012,778.

### EX-05 · fix-it: "Make CIGAR and SEQ agree"

**Snippet** (single TABs between fields; header lines `@HD	VN:1.6` and `@SQ	SN:ref	LN:45` above it):

```
r001	99	ref	7	30	8M2I4M1D3M	=	37	39	TTAGATAAAGGATACT	*
```

**Validator.** SAM-S12. samtools: "CIGAR and query sequence are of different length".

**Accepted fixes.**

- Restore the missing last base: `TTAGATAAAGGATACTG` (the reference has `G` at 22). This is the intended fix.
- Or shorten the CIGAR to `8M2I4M1D2M`. The validator accepts this, but the explanation notes that it changes the alignment end to 21.

**Explanation.** The query-consuming ops (M, I, S, =, X) must sum to the SEQ length: 8+2+4+3 = 17 ≠ 16.

### EX-06 · spot-the-error: "Click the broken field"

**Snippet** (single TABs between fields):

```
@HD	VN:1.6	SO:coordinate
@SQ	SN:ref	LN:45
a1	0	ref	7	30	8M	*	0	0	TTAGATAA	IIIIIII
a2	0	chr1	9	30	6M	*	0	0	AGATAA	IIIIII
a3	0	ref	9	30	2M1S3M	*	0	0	AGATAA	IIIIII
a4	16	ref	0	30	5M	*	0	0	GATAA	IIIII
a5	0	ref	16	30	6M14N5M	*	0	0	ATAGCTTCAGC	IIIIIIIIIII
```

**Answer.**

- **a1** QUAL: 7 characters for 8 bases (SAM-S13).
- **a2** RNAME: `chr1` is not in `@SQ` (SAM-M01).
- **a3** CIGAR: soft clip in the middle (SAM-S11).
- **a4** POS: 0 on a mapped (FLAG 16) record (SAM-M03).
- **a5** is valid: it is the spec's spliced read; `calmd` gives `MD:Z:11 NM:i:0`.

**Explanation (reveal after answering).** samtools 1.24 rejects a1 and *warns* on a2 and a4, converting both to unmapped. It **accepts a3 silently**. Validators and parsers are not the same thing.

### EX-07 · fix-it: "Repair the header"

**Snippet** (single TABs):

```
@SQ	SN:ref	LN:45
@HD	VN:1.6	SO:coordinate
@RG	SM:P042-proband	PL:ILLUMINA
r1	0	ref	7	30	5M	*	0	0	TTAGA	*	RG:Z:P042-proband.L001
```

**Live checks.**

- `@HD` must be first (SAM-S03).
- `@RG` needs `ID` (SAM-S05).
- `RG:Z` must match an `@RG ID` (SAM-M08).

**Answer.** Move `@HD` to line 1, and add `ID:P042-proband.L001` to the `@RG` line.

**Explanation.** samtools would silently reorder `@HD` and would not notice an RG mismatch at all. GATK would later refuse the file or mislabel the sample.

### EX-08 · field-explorer (case): "The child's split read"

**Snippet.** Real GRCh38 bases [verified: GRCh38 + `samtools calmd -e`: every aligned base matches]. Single TABs between fields:

```
@HD	VN:1.6	SO:coordinate
@SQ	SN:chr2	LN:242193529	M5:f98db672eb0993dcfdabafe2a882905c	AS:GRCh38
@RG	ID:P042-proband.L001	SM:P042-proband	PL:ILLUMINA	LB:P042-proband-lib1
A00123:45:HXXXXDSXX:1:1101:12345:6789	97	chr2	166012311	60	60M40S	=	166012879	668	CTTTCAAAAATAATTATACTCCATAAGCTATTTAAAAAATTAATCATATGCATATGACATATCTGCTTCTTTTTTGTTGTTGTTTGTTATTTTTTTAATA	FFFFFFFFFFFFFFFFF,FF,FFFFFFFFFFFFFFFFFFFFFFFFFF:FF,FFFFFFFFF:FFFFFF,FFFFF,FFFFFFFFFFFFFFFFF:FFFFF:,F	NM:i:0	MD:Z:60	MC:Z:100M	MQ:i:60	AS:i:60	RG:Z:P042-proband.L001	SA:Z:chr2,166012739,+,60S40M,60,0;
A00123:45:HXXXXDSXX:1:1101:12345:6789	2145	chr2	166012739	60	60H40M	=	166012879	240	ATCTGCTTCTTTTTTGTTGTTGTTTGTTATTTTTTTAATA	:FFFFFF,FFFFF,FFFFFFFFFFFFFFFFF:FFFFF:,F	NM:i:0	MD:Z:40	MC:Z:100M	MQ:i:60	AS:i:40	RG:Z:P042-proband.L001	SA:Z:chr2,166012311,+,60M40S,60,0;
A00123:45:HXXXXDSXX:1:1101:12345:6789	145	chr2	166012879	60	100M	=	166012311	-668	TTTCACTTCTAAGTATGCATTCCTTTCAACGGTGAAAGACTTCTAAAGTAGCGTGTAGAAAATATTTCTTTCTTCAGAAAAATTACAGGTAAATATATGT	FFFFFFFFFF,FFFFF:FFFFFFFFFFFFFFFFFFFFFFFFFF,FFFFFFFFF,FFFFF,FFFFFFFFFFF,FFFFFFFFFFFF,F:,,FFFFFF:FFFF	NM:i:0	MD:Z:100	MC:Z:60M40S	MQ:i:60	AS:i:100	RG:Z:P042-proband.L001
```

**Hover text per field** (the key ones):

- **97** = paired, mate reverse, READ1, and **no 0x2**: the aligner did not call this a proper pair.
- **2145** = 97 + supplementary.
- **145** = paired, reverse, READ2.
- **`60M40S`**: the first 60 bases match chr2:166,012,311-166,012,370. The last 40 are soft-clipped because they belong 368 bp downstream.
- **`60H40M`**: the same read's last 40 bases align at 166,012,739-166,012,778. The first 60 are hard-clipped, so they are absent from SEQ (compare the 40-base SEQ with the last 40 bases of the primary SEQ).
- **`SA`**: each piece names the other. Its CIGARs are written with `S` (bwa style) even though the supplementary line itself uses `H`.
- **TLEN 668**: the leftmost start is 166,012,311 and the mate ends at 166,012,978.
- **`MC`/`MQ`**: the mate's CIGAR and MAPQ, so a tool can judge the pair without seeking to the mate.
- Read name: Illumina instrument:run:flowcell:lane:tile:x:y (FASTQ lesson).

### EX-09 · predict (case): "Is this pair telling us something?"

**Prompt.** The library's insert sizes are about 300 ± 50 bp. The pair above has TLEN 668. Predict, before revealing, what a TLEN this large suggests, and roughly how much reference is "missing" from the child's molecule.

**Answer.** About 668 − 300 = **368 bp** of reference absent from the fragment. That is a deletion, matching the split read's gap (166,012,371-166,012,738 = 368 bp).

**Explanation.** A discordant pair (PE evidence) and a split read (SR evidence) independently support the same event. That is what the BEDPE record `DEL_1 … SR=9;PE=6` in the BEDPE lesson summarises.

### EX-10 · simulator (case): "From SA tag to BEDPE breakpoint pair"

**Prompt.** Use the primary record (`POS 166012311`, `60M40S`) and its `SA:Z:chr2,166012739,+,60S40M,60,0;`. Drag the two breakends onto a ruler, then fill a BEDPE line.

**Answer.**

- Left breakend: the last aligned base of the primary = 166,012,311 + 60 − 1 = **166,012,370** (1-based). That is fence post 166,012,370 in 0-based coordinates.
- Right breakend: the first aligned base of the SA piece = **166,012,739** (1-based), i.e. 0-based start 166,012,738.
- A 1-bp-resolution BEDPE line (0-based half-open; single TABs):

```
chr2	166012369	166012370	chr2	166012738	166012739	split_6789	60	+	-
```

- Deleted bases: 1-based 166,012,371-166,012,738 = 368 bp.

**Explanation.**

- Strand `+ −` is the deletion signature: the left piece reads into the breakpoint from the left, the right piece from the right.
- Callers pool many such reads and widen each end into a confidence window. The BEDPE lesson's `DEL_1` uses 20-bp windows centred on these same fence posts.
- LUMPY's extractor keeps reads whose `SA` list has ≤ 2 elements (default `-n 2`) and whose pieces overlap by little on the read (`-m 20` non-overlapping bases) [verified: `extractSplitReads_BwaMem`].

### EX-11 · sort (hex): "Is this BAM truncated?"

**Prompt.** Four files, each shown as its first 16 and last 32 bytes (real dumps [verified: test]). Sort them into **Complete BAM**, **Truncated BAM**, **Not a BAM**, **CRAM**.

| File | First 16 bytes | Last 32 bytes |
|---|---|---|
| A | `1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00` | `d6 01 00 00 1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 1b 00 03 00 00 00 00 00 00 00 00 00` |
| B | `1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00` | `03 27 52 54 dd 04 ea 04 47 cb 04 50 b4 38 b9 28 36 20 82 de d7 99 11 00 9e 55 ee 4f d6 01 00 00` |
| C | `1f 8b 08 08 16 52 d2 6a 00 03 73 70 65 63 2e 73` | `82 c6 35 5a b7 65 3c 2f e2 60 49 8b 70 07 f1 b1 52 42 4e e1 1c b0 bb 01 d0 e4 04 ac 73 01 00 00` |
| D | `43 52 41 4d 03 00 73 70 65 63 33 30 2e 63 72 61` | `ff ff 0f e0 45 4f 46 00 00 00 00 01 00 05 bd d9 4f 00 01 00 06 06 01 00 01 00 01 00 ee 63 01 4b` |

**Answer.**

- **A: Complete BAM.** It ends with the 28-byte EOF block. The 4 bytes before it, `d6 01 00 00`, are ISIZE = 470 of the last data block.
- **B: Truncated BAM.** It is the *same file* minus its last 28 bytes: the tail is a data block's CRC32 and ISIZE (470).
- **C: Not a BAM.** FLG = `08` (FNAME) with the name `spec.s…`: plain `gzip` of a SAM. No `BC` field, so it cannot be indexed.
- **D: CRAM 3.0.** It starts `CRAM\3\0` and ends with the 38-byte EOF container (note `45 4f 46` = "EOF").

**Explanation.** B is the dangerous one. `gzip -t` passes it and `samtools view` returns every record it still has, with only a warning. Only the missing EOF marker reveals the loss.

### EX-12 · mcq (case): "The father's CRAM won't open"

**Prompt.** `samtools view father.cram chr2:166012000-166013000` prints `[E::cram_decode_slice] MD5 checksum reference mismatch … @SQ M5: f98db672…`. You used `-T hg38_ucsc.fa`. What should you do?

**Options.**

- (a) Rerun with `--input-fmt-option ignore_md5=1`.
- (b) Obtain the FASTA whose chr2 MD5 is `f98db672eb0993dcfdabafe2a882905c` (the Broad analysis set) and pass it with `-T`, or point `REF_PATH` at an MD5-keyed cache.
- (c) Convert the CRAM to BAM first.
- (d) Re-index the CRAM.

**Answer: (b).**

**Per-option explanations.**

- (a) decodes bases against the wrong sequence: silent corruption (we saw `…GCAT` become `…GCAA`).
- (c) needs the same reference to decode.
- (d) is unrelated; the index has no bases.

### EX-13 · simulator (BGZF/index random access): "Jump to the exon"

**Prompt.** The simulator animates a 3-block BAM and a toy `.bai`. Which BAI bin holds the primary piece (0-based [166012310, 166012370))? What does the illustrative virtual offset `(9371224<<16)|412` mean?

**Answer.**

- Bin **14813** = 4681 + (166012310 >> 14), computed with the spec's `reg2bin`. Both pieces fall in that same 16-kbp bin.
- The virtual offset means: seek to compressed byte 9,371,224 (a block start), inflate that block, and skip 412 bytes to reach the record.

**Explanation.** Virtual offsets can be compared but not subtracted (§4.1.1).

## 9. Quiz bank

**Q1 (mcq).** A record has FLAG 133, RNAME `chr2`, POS 166012311, CIGAR `*`. Which statement is true?

- (a) It is mapped to chr2:166,012,311.
- (b) It is unmapped, and placed at its mate's position for sorting. ✔
- (c) The file is invalid because unmapped reads must have RNAME `*`.
- (d) It is a secondary alignment.

*Explanations.*

- (a) 0x4 is set, and 0x4 is the only reliable signal.
- (b) Correct: §2 item 4.1 recommends exactly this placement.
- (c) RNAME `*` is the recommendation only when *all* segments are unmapped.
- (d) 0x100 is not set.

**Q2 (mcq).** Which statements about `r003` in the spec example (FLAGs 0 and 2064) are correct? (multi-select)

- (a) The two lines are pieces of one chimeric read. ✔
- (b) Line 2064's SEQ `TAGGC` is the whole read.
- (c) Exactly one of the two lines is primary. ✔
- (d) 2064 means the piece is on the reverse strand. ✔

*Explanations.*

- (a) Same QNAME, 0x800 set, and SA tags link the two lines.
- (b) `6H5M`: 6 bases were hard-clipped away.
- (c) FLAG & 0x900 == 0 holds for line 0 only.
- (d) 2064 = 0x800 + 0x10.

**Q3 (application).** A read at POS 166012600 has CIGAR `20S80M5I45M`. Does it overlap target T3, BED `chr2 166012440 166012660`?

- (a) Yes; it covers 166,012,600-166,012,724. ✔
- (b) Yes; it covers 166,012,580-166,012,729.
- (c) No; the start is past 166,012,440 + 150.
- (d) Cannot tell without SEQ.

*Explanations.*

- (a) Reference span = 80 + 45 = 125, so the end is 166,012,724. BED T3 is 1-based 166,012,441-166,012,660, so they overlap.
- (b) Wrongly counts `S` and `I` as reference.
- (c) Mixes up the coordinate systems.
- (d) CIGAR alone determines the span.

**Q4 (mcq).** You emailed a collaborator `proband.cram` and `proband.cram.crai`. They get "Unable to fetch reference chr2:… Failure to decode slice". The best fix?

- (a) Send the `.bai`.
- (b) Send (or name by M5) the exact FASTA, or re-encode with `embed_ref=1` (about +700 MB for a human genome). ✔
- (c) Tell them to set `ignore_md5=1`.
- (d) Convert to CRAM 3.0.

*Explanations.*

- (a) Indexes never contain bases.
- (b) Correct.
- (c) Only silences checksum *mismatches*; the bases are still missing.
- (d) Every CRAM version uses the reference.

**Q5 (mcq).** `samtools index axolotl.bam` fails with "cannot be stored in a bai index". Why, and what do you do?

- (a) The BAM is unsorted; sort it.
- (b) A contig is longer than 2^29 bp (512 Mbp); use `samtools index -c` (CSI). ✔
- (c) The BAM lacks an EOF marker.
- (d) BAI cannot index more than 2^16 reads per bin.

*Explanations.*

- (a) An unsorted file fails with a different message ("Unsorted positions").
- (b) Correct: BAI bins stop at 2^29.
- (c) A missing EOF marker gives a different symptom (a warning).
- (d) Invented.

**Q6 (predict).** Two mates: R1 forward at POS 1001, `100M`; R2 reverse at POS 1201, `100M`. What TLEN does R2 carry?

- (a) 300
- (b) −300 ✔
- (c) −200
- (d) 0

*Explanations.*

- (b) The leftmost start is 1001 and the rightmost end is 1300, so |TLEN| = 300. R2 is the rightmost segment, so its TLEN is negative.
- (c) Measures start to start.
- (d) Only for unpaired, unmapped or inter-chromosomal reads.

**Q7 (mcq).** Which samtools step needs name-collated rather than coordinate-sorted input?

- (a) `samtools index`
- (b) `samtools fixmate` ✔
- (c) `samtools depth`
- (d) a region query `chr2:166012000-166013000`

*Explanations.*

- (b) It must see both mates together to fill in mate fields and `MC`.
- (a), (c), (d) require coordinate order.

**Q8 (application).** A de novo SNV in the child has 6 supporting reads. All six have FLAG 1123 or 1187 and identical start positions. Should you trust it?

- (a) Yes; 6 reads is plenty.
- (b) No; 0x400 marks duplicates, so this is likely one molecule amplified. ✔
- (c) Yes, because MAPQ is 60.
- (d) No, because FLAG 1187 is invalid.

*Explanations.*

- (b) 1123 = 99 + 1024 and 1187 = 163 + 1024. Callers skip 0x400.
- (c) MAPQ is about placement, not independent evidence.
- (d) 1187 decodes fine.

## 10. Case-thread hooks

- **SAM lesson opener: "placing reads on the map".** The trio's FASTQs (FASTQ lesson: `P042-proband`, `P042-mother`, `P042-father`, tens of millions of pairs each) go through `bwa mem -R '@RG\tID:…\tSM:P042-proband…' GRCh38.fa R1 R2`.
  - Learners see the first header lines: `@SQ SN:chr2 LN:242193529 M5:f98db672…` ties back to the FASTA lesson's `.fai`/M5.
  - They see `@RG SM` naming the sample, the first coordinate-sorted records, and their first FLAG decode (EX-01).
- **"What did the aligner do with the hard parts?"** At the *SCN1A* exon target T3 (BED lesson: chr2:166,012,441-166,012,660), the child's reads include split reads (EX-08) and discordant pairs (EX-09).
  - The parents' BAMs have none.
  - This sets up the WIG lesson (the depth dip, counted by `samtools depth` with default flags, EX-02) and the BEDPE lesson (EX-10).
- **"Is the evidence real?"** Duplicates (Q8), MAPQ in a paralogous region, and strand balance. `SCN1A` has paralogs in the same cluster (SCN2A, SCN3A on chr2) [gene neighbourhood from memory - verify], which makes MAPQ a natural topic.
- **BAM/CRAM lesson: "archiving cheaply".** The core converts three 30× exome BAMs to CRAM 3.1 (about one third of the size, §3.8) and must archive `Homo_sapiens_assembly38.fasta` with them (CRAM-C01).
  - Plot twist: the father's CRAM was decoded with the UCSC hg38 FASTA and fails the MD5 check (EX-12, Q4).
- **Capstone planted problems:**
  1. `mother.bam` missing its 28-byte EOF (BAM-S03), indistinguishable from a good file except by the EOF check (EX-11 B).
  2. `father.cram` plus a non-matching FASTA (CRAM-M02).
  3. `proband.bam.bai` older than a re-sorted `proband.bam` (BAM-C01).
  4. `proband_subset.sam` with one CIGAR/SEQ mismatch (SAM-S12), one `S` in mid-CIGAR (SAM-S11; samtools passes it), and an `RG:Z` typo (SAM-M08).
  5. `reads.sam.gz` compressed with plain gzip (BAM-S01 analogue: unindexable).
  6. A valid `proband.cram` + `.crai` + correct FASTA (control).
- **Forward links.**
  - Variant calls in the VCF lesson cite read depth (`DP`) and allele depth (`AD`) computed from these BAMs, after skipping 0x400/0x100/0x200/0x4.
  - The long-read lesson shows the same deletion in minimap2 SAM (`-Y`, `SA`) and PAF (0-based, `cg:Z:` CIGAR), closing the loop with SAM CIGAR literacy.

## 11. "Read more" candidates

- **Padded SAM and `P`** (§3): padded vs unpadded references for assemblies, with the spec's `@SQ LN:47` example.
- **TLEN's two historical definitions** (5′-5′ vs leftmost-rightmost, §1.4 footnote) and why bwa still uses 5′ ends.
- **`=` in SEQ / `samtools calmd -e`:** matching bases shown as `=`.
- **`MD` grammar details:** the mandatory `0` between adjacent mismatches (`10A0C5`); `N`/`I`/`S` are invisible to it.
- **`CG` tag** for CIGARs over 65,535 ops and the `kSmN` placeholder (§4.2.2).
- **Virtual offsets and the BAI binning tree:** 37,450 bins, the linear index, `reg2bin(-1,0)` = 4680, `n_no_coor`. CSI's `min_shift`/`depth`.
- **BAM's 4-bit SEQ code** `=ACMGRSVTWYHKDBN` (case is lost) and raw-Phred QUAL with 0xFF = absent.
- **CRAM internals:** data series, itf8 integers, the substitution matrix, and why random access needs two reads. The EOF container's start field spells "EOF".
- **CRAM 3.1 codecs and profiles** (`fast`/`normal`/`small`/`archive`).
- **Reference retrieval:** `REF_PATH`/`REF_CACHE` `%2s/%2s/%s` layouts, refget, `ref-cache`, `seq_cache_populate.pl`.
- **Sort orders:** natural vs lexicographic, `SS`, `samtools collate`.
- **Unaligned BAM/CRAM** (`samtools import`) as a FASTQ replacement.
- **Base modifications `MM`/`ML`/`MN`** (methylation in ONT/PacBio alignments).

## 12. Sources

### Read in full (or in the relevant sections), with versions

- `https://raw.githubusercontent.com/samtools/hts-specs/master/SAMv1.tex`: SAM/BAM **v1.6**, version history current to the May 2023 entries. The content is identical (same MD5) to the copy cited as hts-specs commit 510c107 in `sequences.md`. Sections used: §1, §1.2-§1.5, §2, §3, §4, §5, Appendix A-B.
- `https://raw.githubusercontent.com/samtools/hts-specs/master/SAMtags.tex`: tag history current to September 2024 (`MN`). Used: standard tag table, `AS`, `CG`, `MC`, `MD`, `MQ`, `NM`, `SA`, `RG`, `PG`, locally defined tags.
- `https://raw.githubusercontent.com/samtools/hts-specs/master/CRAMv3.tex`: "CRAM format specification (version 3.1)", which covers 3.0 and 3.1. Used: §1, §5-§12, §15 (history).
- `https://raw.githubusercontent.com/samtools/hts-specs/master/CSIv1.tex`: CSI v1 layout and `reg2bin`/`bin_limit`.
- `https://raw.githubusercontent.com/samtools/samtools/develop/doc/samtools.1` (samtools-1.24, 9 July 2026): REFERENCE SEQUENCES, REF_PATH/REF_CACHE, CRAM format options (`decode_md`, `embed_ref`, `no_ref`, `version`, `lossy_names`, profiles).
- `samtools-sort.1`, `samtools-flags.1`, `samtools-quickcheck.1`, `samtools-index.1`, `samtools-depth.1`, `samtools-coverage.1` (same base path, samtools 1.24). Also `samtools-fasta.1` (default `-F 0x900`), read from the copy fetched for the FASTA notes.
- `https://raw.githubusercontent.com/samtools/htslib/develop/sam.c`: the exact SAM parser checks and messages (`sam_parse1`).
- `https://raw.githubusercontent.com/lh3/bwa/master/bwa.1` (bwa-0.7.19-r1273), `bwamem.c` (SA/XA/MC/MQ output, TLEN calculation, hard clipping of supplementary, MAPQ capping), `bwamem_extra.c` (XA format).
- `https://raw.githubusercontent.com/lh3/minimap2/master/minimap2.1` (minimap2-2.31): `-Y`, `-L`, `--eqx`, `--MD`, `SA` tag.
- `https://raw.githubusercontent.com/arq5x/lumpy-sv/master/scripts/extractSplitReads_BwaMem`: SA-based split-read extraction, defaults `-n 2`, `-m 20`.
- `https://raw.githubusercontent.com/arq5x/bedtools2/master/docs/content/tools/bamtobed.rst`: `-bedpe`, `-split`, name-grouped input.
- `https://raw.githubusercontent.com/samtools/htsjdk/master/src/main/java/htsjdk/samtools/SAMValidationError.java`: Picard/htsjdk validation error names and severities.
- `https://raw.githubusercontent.com/samtools/www.htslib.org/master/benchmarks/CRAM.md`: CRAM 3.1 default since 1.22; BAM vs CRAM sizes (Apr 2025 tables).
- `https://raw.githubusercontent.com/samtools/www.htslib.org/master/doc/reference_seqs.md`: reference search order, MD5 mismatch error, embedded-reference cost, reference-mode benchmark.
- Real data: byte ranges of `https://s3.amazonaws.com/broad-references/hg38/v0/Homo_sapiens_assembly38.fasta` (chr2:165,500,001-166,500,000), located with the Broad `.fai`/`.dict` fetched for the FASTA notes (chr2 `M5:f98db672eb0993dcfdabafe2a882905c`).

### Empirical checks (scratch only, not shipped)

samtools 1.24 via pysam 0.24.1 on 2026-10-16: about 50 SAM validity cases, BAM/CRAM byte dumps, truncation tests, BAI vs CSI, CRAM decode without/with the wrong/with embedded references, size benchmarks on simulated reads, and `calmd -e` on the case snippet.

### Unreachable

- `www.htslib.org` (DNS failure from WebFetch). The same pages were read from the site's GitHub source instead.
- `github.com` web pages and the GitHub API (403 / not enabled), so exact hts-specs commit hashes for SAMtags.tex and CRAMv3.tex could not be recorded.
- Not attempted, per the network notes (known blocked): `gatk.broadinstitute.org` and GATK read-group requirements (SAM-C03), STAR's MAPQ convention (SAM-C04), htsjdk CRAM 3.1 status (CRAM-C02). Claims depending on them are marked [from memory - verify].
