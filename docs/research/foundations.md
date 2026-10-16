# Foundations: the concepts every genomic file format stands on

Research brief for the course's opening "Foundations" section and for the concept primers that open later sections. Prepared 2026-10-16.

Spec versions consulted (all fetched 2026-10-16): SAM v1 spec (header `VN:1.6`, hts-specs master), VCF 4.5 (plus 4.3/4.4 change lists), BED v1 (hts-specs), CRAM 3.1, tabix and CSI v1 index specs, htslib `faidx(5)`, GFF3 1.26, GFA 1.0-1.2 and GFA2, PAF (miniasm and minimap2 2.31), and rGFA/GAF. Anything not confirmed in a primary source is marked **[from memory - verify]**. In code blocks, separators shown as wide gaps between columns are literal tab characters wherever the format requires tabs. Every exercise states which separators are tabs.

---

## 1. Purpose and place in the pipeline

"Foundations" is not a file format. It is the small set of ideas that every format in the course reuses: a sequence alphabet, a reference to point into, a coordinate convention, a strand, and a probability scale. These are also the ideas that most often break when files from different tools are combined.

```
3 blood samples (child, mother, father)
  -> sequencer ............ FASTQ  (reads + Phred qualities)
  -> aligner + reference .. FASTA (+ .fai) -> SAM -> BAM / CRAM (+ .bai/.csi/.crai)
  -> regions & coverage ... BED (capture targets), WIG/bedGraph (depth)
  -> variant calling ...... gVCF per sample -> joint VCF for the trio (+ .tbi/.csi)
  -> interpretation ....... GTF/GFF3 (genes, exons, CDS phase)
  -> structural follow-up . BEDPE (breakpoint pairs) -> PAF (long reads) -> GFA (graph)
```

| Concept | Where it first bites in the pipeline | Formats that depend on it |
|---|---|---|
| Alphabet, strand, reverse complement | Reads from the minus strand | FASTA, FASTQ, SAM (FLAG 0x10), PAF col 5, GFA orientations |
| Reference build and contig names | Alignment; every later join | All positional formats; `@SQ`, `##contig`, `.fai` |
| Coordinate convention | Any conversion between formats | BED/BEDPE/PAF/BAM/BCF (0-based) vs SAM/VCF/GFF/GTF/WIG (1-based) |
| Phred probability | Base calls, mapping, genotype calls | FASTQ, SAM QUAL/MAPQ, VCF QUAL/GQ/PL |
| Block compression and indexes | Asking for one gene out of 100 GB | BGZF, `.bai`, `.csi`, `.tbi`, `.crai`, `.fai`, `.gzi` |
| Genes, exons, phase | Deciding whether a variant matters | GTF, GFF3, BED12 |
| Genotype, ploidy, inheritance | Filtering the trio to de novo variants | VCF/gVCF |

**The disease question these concepts let you ask precisely:** *Which difference between the child's genome and the reference, absent from both parents (or inherited in a pattern that fits), disrupts a gene that could explain the seizures, and how sure are we?* Each phrase maps to a concept: "difference" (variant classes), "reference" (build), "absent from both parents" (genotypes, de novo), "disrupts a gene" (exon, CDS, frame), "how sure" (Phred).

## 2. Mental model

**Core intuition.** Almost every record in every course format answers three questions:

1. **What sequence?** A string over a small alphabet (A, C, G, T, N, plus IUPAC codes in some places).
2. **Where?** On a *named* sequence (contig) of a *specific* build, between two coordinates in a *declared* convention, on a strand.
3. **How sure?** A probability of being wrong, written on the Phred scale.

Most validity problems a learner will meet are syntax errors, "where" errors (wrong build, contig name, off-by-one, strand) or "how sure" errors (wrong quality offset, misread probabilities).

**The design problem.** One haploid human genome is about 3.1 Gb. A 30x genome needs roughly 90 Gb of sequenced bases, plus one quality character per base (search-result summary of a 2011 review; see Sources). The formats share three engineering answers:

- **Don't repeat the reference.** Record each read's placement on the reference (position + CIGAR) instead of rebuilding a genome (SAM/BAM still store every read base in SEQ), store only the sites that differ (VCF), or compress read bases as differences against the reference itself (CRAM, CRAMv3 §1).
- **Compress in independent blocks** (BGZF, at most 64 KiB each) so that an index can jump straight to a region without decompressing everything before it.
- **Agree on a coordinate system** to point into the reference. Two conventions survive for historical reasons, and converting between them is one of the most common sources of bugs in bioinformatics.

**Analogies that work for bioinformatics students**

- *Reference = the edition of a street map.* Every other file is a list of street addresses with notes. Swap the map edition (GRCh37 to GRCh38) and the same house has a different number. Mixing editions gives confident nonsense, not errors.
- *Coordinates = fence posts vs fence panels.* A 0-based half-open interval names two **posts** (the boundaries between bases, numbered from 0). A 1-based closed interval names the first and last **panel** (the bases themselves, numbered from 1). For programmers, a Python slice `s[2:4]` is BED, and R's `s[3:4]` is GFF/VCF. Both give the same two characters.
- *Phred = decibels for errors.* Every +10 means ten times fewer errors. You never average decibels directly, and you never average Phred scores directly either.
- *BGZF + index = an encyclopedia in separately bound volumes with a master index.* Plain gzip is one long scroll that must be unrolled from the start.

## 3. Anatomy

### 3.1 DNA as a string

- **Alphabet.** A, C, G, T (U in RNA), and N for an unknown base. DNA is double-stranded and antiparallel. A FASTA reference stores one strand, read 5' to 3', called the forward or `+` strand. The other strand is implied.
- **Reverse complement** = reverse the string **and** complement each base (A<->T, C<->G). Doing only one of the two steps is a classic bug. In SAM, reads that map to the reverse strand are stored already reverse-complemented, with CIGAR and QUAL reversed to match (SAMv1 §1.4, FLAG 0x10).
- **IUPAC ambiguity codes** (Biopython `IUPACData`, following NC-IUB):

| Code | Bases | Complement | | Code | Bases | Complement |
|---|---|---|---|---|---|---|
| R | A/G | Y | | B | C/G/T | V |
| Y | C/T | R | | D | A/G/T | H |
| S | C/G | S | | H | A/C/T | D |
| W | A/T | W | | V | A/C/G | B |
| K | G/T | M | | N | any | N |
| M | A/C | K | | | | |

  Where codes are allowed: SAM SEQ matches `\*|[A-Za-z=.]+` (SAMv1 §1.4), but BAM can only store the 16 case-insensitive codes `=ACMGRSVTWYHKDBN` in 4 bits; every other character becomes `N` (SAMv1 §4.2.3). VCF REF accepts only A, C, G, T and N. An ambiguous reference base must be reduced to the alphabetically first base it stands for, so R becomes A (VCF 4.5 §1.6.1 item 4, introduced in 4.3). GFA segment sequences match `[A-Za-z=.]+`.
- **Soft-masking vs hard-masking.** Lowercase bases in a reference mark repeats found by tools such as RepeatMasker. They are still real bases: `acgt` means the same as `ACGT`. Hard-masking replaces bases with `N`. Examples: the T2T-CHM13v2.0 analysis FASTA is soft-masked, and its recommended short-read version hard-masks the chrY PARs to N (CHM13 README). UCSC `.2bit` files store "masked (lower-case) blocks" separately (UCSC FAQformat). The SAM spec says "no assumptions can be made on the letter cases" of SEQ (§1.4). VCF REF/ALT are case-insensitive (§1.6.1). The reference MD5 is computed after uppercasing (SAMv1 §1.3.2).

### 3.2 Reference genomes

| Term | Meaning |
|---|---|
| Assembly / build | A specific set of sequences, such as GRCh38. Coordinates are only meaningful relative to one build. |
| Patch release | Adds fix/novel patch scaffolds (e.g. GRCh38.p14) without changing chromosome coordinates [from memory - verify] |
| Primary assembly | Chromosomes + unlocalized contigs (chromosome known, position unknown) + unplaced contigs (chromosome unknown) (bwa README-alt) |
| ALT contigs | Alternate haplotypes of variable regions. In GRCh38 they total 109 Mb and cover 60 Mbp of the primary assembly. Mapping to them without an ALT-aware aligner gives many reads mapping quality 0 (bwa README-alt). |
| Decoys | Extra sequences added so that reads from contamination or missing sequence do not pile up in the wrong place. bwakit lists the EBV genome separately from the decoys (`hs38` = primary + EBV; `hs38DH` adds ALT, decoys and HLA; `hs37` = GRCh37 primary + EBV; `hs37d5` adds decoys), but EBV plays the same "sink" role (bwakit `run-gen-ref`) |
| Analysis set | A build prepared for read mapping: e.g. chrY PARs hard-masked, ALT contigs removed or kept, EBV and decoys added (bwakit `run-gen-ref`, CHM13 README, search summary of UCSC/NCBI analysis sets) |

| Build | UCSC name | Chromosome names | Mitochondrion | chr1 length |
|---|---|---|---|---|
| GRCh37 (GRC/Ensembl, "b37") | hg19 | GRC/Ensembl: `1`..`22`, `X`, `Y`, `MT`; UCSC: `chr1`.. | GRCh37 `MT` = rCRS NC_012920.1, 16,569 bp; **hg19 `chrM` = NC_001807, 16,571 bp, a different sequence** (16,571 confirmed in bedtools `genomes/human.hg19.genome`; accession from search summary of Bioconductor list) | 249,250,621 (bedtools `genomes/human.hg19.genome`; hg19 and GRCh37 nuclear chromosomes are the same sequences) |
| GRCh38 | hg38 | `chr1`.. (UCSC/GENCODE [from memory - verify]) or `1`.. (Ensembl dumps, see the Ensembl GTF sample) | `chrM`/`MT` = rCRS, 16,569 bp (the SAMv1 `@SQ AN` example: `SN:MT AN:chrMT,M,chrM LN:16569`; bedtools `human.hg38.genome` chrM 16569) | 248,956,422 (bedtools `genomes/human.hg38.genome`) |
| T2T-CHM13v2.0 | hs1 (CHM13 README) | `chr1`..`chrY` | analysis set offers rCRS replacement | different again |

- T2T-CHM13 is a gapless 3.055 Gb assembly adding nearly 200 Mb of sequence, including centromeric satellites, segmental duplications and the short arms of the acrocentric chromosomes (Nurk et al. 2022, *Science*, abstract via search). v2.0 adds a finished Y chromosome from HG002 (CHM13 README).
- Non-chromosomal contig names (BEDv1 §1.3 examples): `chr19_KI270914v1_alt`, `chrUn_KI270435v1`. HLA contigs in `hs38DH` contain `*` and `:` (e.g. `HLA-A*01:01:01:01` [from memory - verify]). SAM allows these characters (SAMv1 §1.2.1 footnote: `:` appears in HLA allele names), but BEDv1's `chrom` regex `[A-Za-z0-9_]{1,255}` does not.
- **Why every file must use the same reference.** A position is a pointer into one specific string. Contig names are join keys between files. The cheap checks are: same contig names, same lengths (`@SQ LN`, `##contig length`, `.fai` column 2) and, best of all, the same MD5 digests (`@SQ M5`, `##contig md5`). "The digest is based on the sequence and nothing else" and can confirm that `1`, `Chr1` and `chr1` in different files are the same sequence (SAMv1 §1.3.2).

### 3.3 Sequencing

- **Library and reads.** DNA is fragmented and adapters are attached. A short-read instrument reads one or both ends of each fragment. In **paired-end** data, R1 and R2 come from opposite ends of one fragment and point toward each other. **Fragment (insert) size** is the span of the whole fragment. SAM TLEN records it as `end - start + 1` across both mates' mapped bases (SAMv1 §1.4). The unsequenced middle is the inner distance.
- **Short vs long reads.** Short reads (Illumina, typically 2x150 bp [from memory - verify]) are cheap and accurate per base but cannot span long repeats. Long reads (PacBio HiFi, around 15-20 kb, defined as at least Q20 (99%) and often around Q30 median, and Oxford Nanopore, from tens of kb to above 100 kb [from memory - verify]) span repeats and structural-variant breakpoints. minimap2 describes its target as queries "from a few kilobases to ~100 megabases in length at an error rate ~15%" (minimap2(1)).
- **Error profiles.** Short reads mostly have substitution errors, and quality falls toward the 3' end [from memory - verify]. Raw PacBio CLR reads have about 13-15% error, and HiFi reads are accurate because each molecule is read many times. Nanopore errors are enriched in homopolymer indels (search summary of benchmarking studies). The error model decides which variant classes each technology can call well.
- **Depth vs breadth.** Mean depth C = N x L / G (reads x read length / target size). Breadth is the fraction of the target covered at or above some depth. Exome capture targets about 30-45 Mb, roughly 1-2% of the genome (search summary of kit sizes). The targets ship as a BED file, which is the list of regions that were actually examined. Exomes are usually sequenced deeper than genomes (often around 100x vs around 30x [from memory - verify]) but more unevenly: GC-rich and poorly captured exons dip.
- **Multiplexing.** Several samples share a run. Read groups (`@RG ID`/`SM`) keep the child's reads separate from the parents' reads all the way into the VCF columns.

### 3.4 Quality as probability

Phred: **Q = -10 log10(P_error)** and **P_error = 10^(-Q/10)**, rounded to an integer (SAMv1 §1.2).

| Q | P(error) | Accuracy | Phred+33 char | Phred+64 char |
|---|---|---|---|---|
| 2 | 0.63 | 37% | `#` | `B` |
| 10 | 0.1 | 90% | `+` | `J` |
| 20 | 0.01 | 99% | `5` | `T` |
| 30 | 0.001 | 99.9% | `?` | `^` |
| 40 | 0.0001 | 99.99% | `I` | `h` |

- **ASCII offset 33 ("Sanger", Illumina 1.8+).** Character = chr(Q + 33). `!` is Q0 and `~` is Q93. SAM QUAL must match `[!-~]+` and is "the same as the quality string in the Sanger FASTQ format" (SAMv1 §1.4). BAM stores the raw 0-93 values with no offset (§4.2.3).
- **Legacy offset 64.** Illumina 1.3-1.7 used Phred+64 (Q0-62). Early Solexa used odds-based scores Q = -10 log10(P/(1-P)) with offset 64, which can be negative (-5 to 62). Since CASAVA 1.8, Illumina writes standard Phred+33 (Biopython `QualityIO`, after Cock et al. 2010).
- **Binned qualities.** Modern instruments emit only a few distinct Q values to save space. NovaSeq 6000 (RTA3) originally emitted 2, 12, 23 and 37 (`#`, `-`, `8`, `F`), but since control software NVCS v1.1 (2019) it emits 2, 11, 25 and 37 (`#`, `,`, `:`, `F`), which is what most NovaSeq 6000 FASTQ files contain (dada2 GitHub issue #791, quoting Illumina support). NovaSeq X uses three bins labelled 12, 24 and 40 with control software 1.2+ (12, 20, 37 before that), and release 1.4.0 reportedly raised the top bin to Q41 (Illumina knowledge article 000008320 and release notes, via search summary only [verify]). A validator should infer "binned" from the number of distinct characters, never from a fixed list. CRAM can store qualities lossily by design (CRAMv3 §1).
- **The same scale everywhere.** MAPQ = -10 log10 P(mapping position is wrong), where 255 means unavailable (SAMv1 §1.4). VCF QUAL is the Phred probability that the ALT assertion is wrong, GQ is the genotype quality, and PL holds Phred-scaled genotype likelihoods (VCF 4.5 §1.6.1, §1.6.2).
- **Arithmetic rule.** Convert to probabilities before summing or averaging. The expected number of errors in a read is the sum of its P values.

### 3.5 Biology needed later

- **Gene** = a locus that produces functional RNA or protein. A **transcript** is one spliced RNA product (a gene can have several isoforms). **Exons** are kept in the mature RNA and **introns** are spliced out, usually at GT...AG boundaries. **UTRs** are the exonic parts outside the protein-coding region (5' UTR and 3' UTR). **CDS** is the coding part, from the start codon to the stop codon (the GFF3 change log says: "Insist that CDS include the start and end codon").
- **Reading frame vs phase.** Codons are consecutive base triplets read from the start codon. GFF3 **phase** (0, 1 or 2) is "the number of bases forward from the start of the current CDS feature" to the next codon start, measured from the 5' end (the feature's `end` on the minus strand). Phase is required on CDS features (GFF3 1.26, column 8). GTF's `frame` column has the same 0/1/2 meaning in Ensembl's definition. Rule: `next_phase = (3 - ((len_prev - phase_prev) mod 3)) mod 3`.
- **Variant classes**

| Class | Example in VCF REF -> ALT | Note |
|---|---|---|
| SNV | `C` -> `G` | one base |
| MNV | `CT` -> `GA` | adjacent substitutions |
| Indel | `TC` -> `T` (del), `C` -> `CA` (ins) | VCF pads with the preceding base (rule: VCF 4.5 §1.6.1(4); these examples: §5.1) |
| SV | `<DEL>`, `<INV>`, breakends | ≥50 bp by common convention [from memory - verify] |
| CNV | `<DUP>`, `<CNV>` | changes copy number (dosage) |

  Effect on protein: synonymous, missense, nonsense, splice-site, or **frameshift**, which happens when a CDS indel's length is not a multiple of 3.
- **Genotype and ploidy.** Autosomes are diploid. Male X and Y are haploid outside the PARs, and VCF writes haploid calls with one allele (VCF 4.5 §1.6.2: "Haploid calls, e.g. on Y, male non-pseudoautosomal X, or mitochondria"). The GT field: `0/0` hom-ref, `0/1` het, `1/1` hom-alt, `1|0` phased, `./.` no call.
- **Inheritance.** Patterns are autosomal dominant, autosomal recessive (homozygous or compound heterozygous), X-linked, and **de novo** (present in the child, absent from both parents). The germline rate is about 1.2 x 10^-8 per base per generation (Kong et al. 2012 via search summary). Because the child has two genome copies, that gives about 2 x 3.1e9 x 1.2e-8 ≈ 74 new SNVs per genome (observed ≈ 63 per trio in that study), and only about one in the 1-2% of the genome that the exome covers. A genotype pattern that no inheritance mode explains is a **Mendelian error**: a true de novo, a miscall, or a sample swap.

### 3.6 Alignment and sequence graphs (intuition)

- **Alignment** answers "where did this read come from, and how does it differ there?". The differences are matches, mismatches, insertions, deletions and clipped ends, which a CIGAR string such as `8M2I4M1D3M` encodes. **MAPQ** expresses confidence in the placement. A read with two equally good placements has P(wrong) = 0.5, so MAPQ ≈ 3. The SAM spec notes that non-best multiple mappings get "mapping quality <Q3" (§1.2 footnote). **Chimeric/split alignments** (one read, two places) are the raw evidence for structural variants (SAMv1 §1.2).
- **PAF** records the same idea at a coarser grain: approximate matching intervals between long sequences, with optional CIGAR.
- **Sequence graph.** A linear reference is one path. A pangenome graph stores **segments** (nodes holding sequence) and **links** (edges between oriented segment ends). Each haplotype is a **walk** through the graph, and a variant appears as a **bubble**. GFA's core lines are S, L, P and W (plus H, C and J). rGFA adds `SN`/`SO`/`SR` tags so that each base keeps a stable coordinate: a stable-sequence name plus an offset. Rank `SR:i:0` segments come from the linear reference (e.g. GRCh38); rank > 0 segments are placed on other stable sequences (rGFA.md).

### 3.7 Anatomy of a typical genomic text file

| Part | Examples |
|---|---|
| Meta/header lines | `##fileformat=VCFv4.5`, `@SQ`, `##gff-version 3`, `H	VN:Z:1.0`, UCSC `track` lines |
| Column header line | VCF `#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO` (mandatory) |
| Records | one per line, tab-delimited, fixed leading columns |
| Missing-value token | `.` (VCF, GFF3, BED strand), `*` (SAM, GFA), `-1` (BEDPE), `255` (MAPQ/PAF mapq) |
| Key-value bag | VCF INFO `DP=14;AF=0.5`, GFF3 `ID=x;Parent=y`, GTF `gene_id "x";` |
| Typed tags | `TAG:TYPE:VALUE`: SAM `NM:i:1`, PAF `cg:Z:9M`, GFA `LN:i:45` |

### 3.8 Annotated minimal VALID example: one interval and one SNV in every convention

Toy reference: contig `ref`, 45 bp, taken from the SAMv1 §1.1 example (unpadded). Read pair `r001` maps there, and its mate `r001/2` carries one mismatch at position 42 (C->G, hence `NM:i:1` in the spec).

```
>ref
AGCATGTTAGATAAGATAGCTGTGCTAGTAGGCAGTCAGCGCCAT
```
```
1-based:  123456789012345678901234567890123456789012345
          AGCATGTTAGATAAGATAGCTGTGCTAGTAGGCAGTCAGCGCCAT
                ^^^^^^^^                           ^
                bases 7-14 = TTAGATAA              base 42 = C
```

The interval "bases 7-14" (8 bp) and the SNV "base 42 C>G" in each format. Only record lines are shown: each format's required header (`##gff-version 3`, `##fileformat=VCFv4.5` and the `#CHROM` line) is omitted, so this is a side-by-side comparison, not one file. (A WIG `track type=wiggle_0` line is required only when the file is uploaded as a UCSC custom track; for conversion to bigWig it "must not be present", per the UCSC wiggle doc, so a validator must not require it.) In the record lines below, the gaps between columns are single tab characters.

```
# BED (0-based half-open): start = 7-1 = 6, end = 14
ref	6	14	r001_start
ref	41	42	snv42

# GFF3 (1-based closed)
ref	demo	region	7	14	.	+	.	ID=r1
ref	demo	SNV	42	42	.	.	.	ID=snv42

# VCF (1-based POS; body line shown, header omitted)
ref	42	.	C	G	.	PASS	.

# SAM (1-based POS 7, CIGAR spans 16 reference bases, so 7..22)
r001	99	ref	7	30	8M2I4M1D3M	=	37	39	TTAGATAAAGGATACTG	*

# PAF target columns 6-9 (0-based half-open): name, length, start, end
ref	45	6	14

# WIG variableStep (1-based; span=8 covers 7..14). Separator: a single space
variableStep chrom=ref span=8
7 1.0
```

Tool region strings are 1-based inclusive: `ref:7-14` for samtools and tabix (samtools-view(1), tabix(1)). In binary BAM the same read's `pos` field is stored as 6, which is POS-1 (SAMv1 §4.2).

## 4. Coordinate system and conventions

### 4.1 The two conventions

| | 0-based half-open `[s, e)` | 1-based closed `[s, e]` |
|---|---|---|
| First base | 0 | 1 |
| Length | `e - s` | `e - s + 1` |
| Single base at 1-based p | `[p-1, p)` | `[p, p]` |
| Empty interval (insertion point) | `s = e` is legal: "a feature between chromStart and the preceding base" (BEDv1 §1.6) | Not expressible directly. GFF3: "start equals end and the implied site is to the right of the indicated base". VCF: pad with an anchor base. |
| Adjacent intervals | `e1 = s2` | `e1 + 1 = s2` |
| Conversion to the other | start + 1, end unchanged | start - 1, end unchanged |

The SAMv1 §1.2 definitions: "The SAM, VCF, GFF and Wiggle formats are using the 1-based coordinate system"; "The BAM, BCFv2, BED, and PSL formats are using the 0-based coordinate system."

### 4.2 What each course format stores on disk

| Format / field | Convention on disk | Notes and source |
|---|---|---|
| FASTA | none (position = order in string) | `.fai` and region queries supply coordinates |
| `.fai` | OFFSET is a 0-based **byte** offset. LENGTH is a base count. | faidx(5); `samtools faidx ref.fa chr:from-to` takes 1-based inclusive regions (stated in the CRAMv3 §11 example: "the bases are counted 1-based"; samtools-faidx(1) 1.24 only gives the `chr:from-to` syntax) |
| FASTQ | none | qualities Phred+33 |
| BED cols 2-3 (+ thickStart/End, blockStarts relative to chromStart) | 0-based half-open | BEDv1 §1.3, §1.5, §1.9. UCSC: chromStart=0, chromEnd=100 is the first 100 bases, shown in the browser as `chr1:1-100`. |
| BEDPE start1/end1, start2/end2 | 0-based half-open; `-1` = unknown | bedtools docs ("zero-based start", "one-based end", which is the same thing) |
| WIG `variableStep` / `fixedStep start=` | **1-based closed**, with `span` | UCSC: "the only format defined by UCSC that uses a 1-based format" |
| bedGraph (often loaded alongside WIG) | 0-based half-open | UCSC bedGraph doc |
| GTF start/end | 1-based closed | Ensembl: "start-end 1-2 describes two bases" |
| GFF3 start/end | 1-based closed, start ≤ end | GFF3 1.26 cols 4-5; circular features may have end > landmark length |
| SAM POS, PNEXT | 1-based; 0 = no position | SAMv1 §1.4; alignment end = POS + (reference-consuming CIGAR length) - 1 |
| BAM `pos`, `next_pos` | 0-based (= POS-1); -1 = none | SAMv1 §4.2 |
| CRAM alignment start | 1-based "as per SAM" when not delta-coded | CRAMv3 §10 (AP data series) |
| VCF POS | 1-based; 0 or N+1 = telomere | VCF 4.5 §1.6.1(2) |
| gVCF block | POS..END inclusive (INFO END, or FORMAT LEN in 4.5) | VCF 4.5 §5.5; INFO END deprecated in 4.5 |
| BCF POS | 0-based | VCF 4.5 §6.3 ("0-based leftmost coordinate") |
| PAF cols 3-4 and 8-9 | 0-based half-open. Target coordinates are always on the target's forward strand. | PAF.md; minimap2(1) |
| GFA1 C-line `Pos` | 0-based | GFA1.md |
| GFA1 W-line SeqStart/SeqEnd | 0-based half-open ("BED-like") | GFA1.md (v1.1+) |
| GFA1 L-line overlap | a CIGAR (lengths, not positions) | GFA1.md |
| GFA2 positions | tick marks between symbols, 0..L, with `$` marking L | GFA2.md |
| rGFA `SO:i` | offset on stable sequence; 0-based, as implied by examples such as `chr1:0-17` | rGFA.md (the table only says "Offset") |
| GAF | 0-based, as PAF | rGFA.md |
| samtools/tabix region strings | 1-based inclusive | samtools-view(1), tabix(1) |
| Index internals (BAI/CSI/TBI bins) | 0-based half-open `[beg,end)` | SAMv1 §5.3, CSIv1, tabix.tex; tabix stores a flag (0x10000) saying whether a text file follows the BED or the GFF rule |

### 4.3 Strand

BED col 6 uses `+ - .`. GFF3 col 7 uses `+ - . ?`. SAM FLAG 0x10 means SEQ is stored reverse-complemented. PAF col 5 is the *relative* strand. GFA orientations `+`/`-` on L, P and W lines (`>`/`<`). BEDPE has `strand1`/`strand2`. VCF has no strand column: REF/ALT are always forward-strand bases.

### 4.4 Sorting

"Coordinate-sorted" means grouped by contig and then ordered by start. The contig order comes from the header (`@SQ` order defines the order in SAM/BAM; VCF records for one CHROM must form a contiguous block; BEDv1 §3.4 allows any contig order, including lexicographic `LC_ALL=C sort -k1,1 -k2,2n -k3,3n`). Indexing requires coordinate order (SAMv1 §5; CRAMv3 §12; tabix(1)). Merge-style streaming tools also need **the same contig order in every input**. This is why lexicographic order (`chr1, chr10, chr11, ..., chr2`) vs natural order (`chr1, chr2, ...`) matters.

### 4.5 Compression and index files

| Item | What it is | Key facts |
|---|---|---|
| gzip | one DEFLATE stream | magic `1f 8b`. No random access: you must decompress from byte 0. |
| BGZF | concatenated gzip blocks, each ≤ 64 KiB before and after compression | gunzip-compatible. Header `1f 8b 08 04` with extra subfield `BC`. 28-byte EOF block. **Virtual offset** = `coffset << 16 \| uoffset` (bitwise OR; SAMv1 §4.1). Made with `bgzip`. |
| `.fai` | text index of FASTA/FASTQ: NAME, LENGTH, OFFSET, LINEBASES, LINEWIDTH (+QUALOFFSET for FASTQ) | requires uniform line length within each sequence (faidx(5)) |
| `.gzi` | binary table of (compressed, uncompressed) offset pairs for a BGZF file | used with `.fai` for bgzipped FASTA (bgzip(1)) |
| `.bai` | binning + linear index for coordinate-sorted BAM, magic `BAI\1` | bins of 16 kbp-512 Mbp. Cannot index contigs longer than 2^29-1 (SAMv1 §5.1.1). |
| `.csi` | generalised binning index, magic `CSI\1` | configurable `min_shift`/`depth`, for long contigs (CSIv1) |
| `.tbi` | tabix index for BGZF-compressed, tab-delimited, sorted text (VCF, BED, GFF), magic `TBI\1` | itself BGZF-compressed (tabix.tex) |
| `.crai` | gzipped tab-delimited list of CRAM slices: ref id, alignment start, span, container offset, slice offset, slice size | CRAMv3 §12 |

**Random access** means answering "give me chr2:166,000,000-166,100,000" by reading a few blocks found through the index instead of streaming the whole file. The pieces it needs are sorted data + block compression (BGZF) + an index built from *that exact file*.

## 5. Validity rules (cross-format consistency)

Severity labels: **error** (data are wrong or unusable), **warning** (suspicious, needs a look), **convention** (tools expect it, the spec does not require it).

### (a) Structural rules the specs state as MUST

| ID | Rule | Source | Minimal violation | Severity |
|---|---|---|---|---|
| XF-01 | BED `0 ≤ chromStart ≤ chromEnd ≤ contig length` | BEDv1 §1.6 | `chr1	500	400` | error |
| XF-02 | GFF3/GTF start and end are positive 1-based integers with start ≤ end, always. A feature crossing the origin of a circular landmark keeps start ≤ end by setting end = true end + landmark length, so the circular exception is to "end ≤ landmark length", not to start ≤ end | GFF3 1.26 cols 4-5; GTF2.2 `<start>`/`<end>` (as quoted in the AGAT docs) | `chr1	x	exon	0	99	...` (start 0) | error |
| XF-03 | VCF POS is 1-based. The only out-of-range values allowed are 0 and N+1 (telomeres). | VCF 4.5 §1.6.1(2) | `chrM	16571	...` on rCRS (N=16,569) | error |
| XF-04 | SAM POS is in `[0, 2^31-1]`, and 0 means unplaced | SAMv1 §1.4 | `POS = -1` in SAM text (that is BAM's encoding) | error |
| XF-05 | Quality characters lie in `!`..`~` (Q0-93), and SAM QUAL length equals SEQ length | SAMv1 §1.4 (QUAL regex is a MUST; the length rule is worded "ought to equal", but htslib rejects the record with "SEQ and QUAL are of different length", htslib `sam.c`) | QUAL containing a space, or one character short | error |
| XF-06 | Contig names follow the SAM/VCF name rule: printable ASCII except `\ , " ' ( ) [ ] { } < >` and the backtick, and no leading `*` or `=` | SAMv1 §1.2.1; VCF 4.5 §1.4.7 (since 4.3) | `@SQ	SN:*chr1	LN:1000` (leading `*`) | error |
| XF-07 | BED `chrom` matches `[A-Za-z0-9_]{1,255}`, which is stricter than SAM | BEDv1 §1.6 (1) | `HLA-A*01:01:01:01	0	100` | error (strict BED) / warning (most tools accept it) |
| XF-08 | VCF REF uses only A, C, G, T, N (any case). IUPAC reference bases are reduced to the alphabetically first base. | VCF 4.5 §1.6.1(4) (since 4.3) | `REF=R` | error |
| XF-09 | Random access requires coordinate-sorted data and, for BAM, BCF and compressed text (VCF/BED/GFF), BGZF rather than plain gzip. CRAM is not BGZF and gets random access from its own containers and slices plus `.crai` | SAMv1 §4.1, §5; tabix(1); CRAMv3 §12 | `gzip calls.vcf; tabix calls.vcf.gz` fails | error |
| XF-10 | CRAM needs the exact reference: `@SQ M5` is required unless the reference is embedded, and readers must check MD5s | CRAMv3 §8 ("CRAM header block(s)"), §11 | decoding with a different FASTA | error |

### (b) Semantic and consistency rules

| ID | Rule | Source | Minimal violation | Severity |
|---|---|---|---|---|
| XF-11 | **Same build everywhere.** Contig lengths (and MD5s, if present) agree across `.fai`, `@SQ`, `##contig` and annotations | SAMv1 §1.3 (`LN`, `M5`); VCF 4.5 §1.4.7; BEDv1 §4 (the build is "supplied out-of-band") | BAM `@SQ	SN:chr1	LN:248956422` with VCF `##contig=<ID=chr1,length=249250621>` | error |
| XF-12 | **Same contig naming everywhere** (`chr1` vs `1`, `chrM` vs `MT`) | BEDv1 §3.1 (names "should match the names from a reference genome", never both `17` and `chr17` in one file) | BED `chr17	...` against a VCF using `17` gives zero overlaps, silently | error |
| XF-13 | **hg19 `chrM` is not GRCh37 `MT`**: different sequences (NC_001807, 16,571 bp vs rCRS, 16,569 bp), so renaming is not enough | search summary (Bioconductor/UCSC README); SAMv1 `AN` example | renaming `chrM` to `MT` and keeping hg19 mito calls | error |
| XF-14 | **Off-by-one conversions.** 1-based -> BED: start - 1, end unchanged. BED -> 1-based: start + 1. | SAMv1 §1.2; BEDv1 §1.3 | SNV at VCF POS 42 written as BED `ref	42	42` (an empty interval) or `ref	42	43` (the wrong base) | error |
| XF-15 | **Length formula matches the convention**: `end - start` for 0-based half-open, `end - start + 1` for 1-based closed | same | reporting a GFF3 exon `1001-1200` as 199 bp | error |
| XF-16 | Coordinates lie within the declared contig length (`@SQ LN`, `##contig length`, `##sequence-region`, `.fai`) | BEDv1 §1.6; GFF3 `##sequence-region`; VCF 4.5 §1.6.1 | a GRCh37 chr1 position above 248,956,422 used on GRCh38 | error |
| XF-17 | VCF REF equals the reference base(s) at POS (case-insensitive) | VCF 4.5 §1.6.1(4); `bcftools norm --check-ref` (modes e, w, x, s; bcftools.txt, develop) | `ref	42	.	T	G` when ref:42 is C | error |
| XF-18 | Strand handling: SAM reverse-strand SEQ is already reverse-complemented; PAF target coordinates are forward-strand even when col 5 is `-`; GFF3 phase counts from the 5' end (`end` on `-`) | SAMv1 §1.4; PAF.md; GFF3 col 8 | reverse-complementing a FLAG 16 SEQ a second time | error |
| XF-19 | One quality encoding: Phred+33 throughout. Legacy +64 must be converted before alignment. | SAMv1 §1.4 QUAL; Biopython/Cock 2010 | Phred+64 FASTQ read as +33, so a Q40 `h` becomes "Q71" | error |
| XF-20 | Region strings typed into samtools/tabix are 1-based inclusive, even when the data file is BED | samtools-view(1), tabix(1) | querying `chr2:1000-1002` intending BED `[1000,1002)` | error (logic) |
| XF-21 | Index belongs to its data file (same file, same sort, rebuilt after any change) | SAMv1 §5; tabix(1) | re-sorted BAM with old `.bai` | error |
| XF-22 | Sample identity is consistent across BAM `@RG SM`, VCF sample columns and pedigree | SAMv1 §1.3 (`@RG`); VCF 4.5 §1.4.9 (`##PEDIGREE`) | child and father columns swapped, so Mendelian errors appear genome-wide | warning |
| XF-23 | Ploidy matches sex and region (haploid male X/Y outside PARs, diploid autosomes) | VCF 4.5 §1.6.2 (GT) | `0/1` on male chrX outside PAR | warning |

### (c) De-facto conventions (tools enforce them; the specs only recommend them)

| ID | Convention | Source | Violation | Severity |
|---|---|---|---|---|
| XF-24 | Contig order in every file follows the reference `.fai`/`.dict` order | GATK/Picard behaviour [from memory - verify]; BEDv1 §3.4 allows any order | lexicographically sorted VCF fed to a dictionary-ordered tool | convention (often fatal in practice) |
| XF-25 | Single tab as the only separator | BEDv1 §3.5 (recommended); tabix needs tabs | BED with spaces | convention |
| XF-26 | No `track`/`browser` lines in a `.bed` file ("valid BED files must not have any browser or track lines"). **Note: this row is the reverse of the section heading.** BEDv1 states it as a MUST; it is the tools (UCSC custom tracks, bedtools) that tolerate it. | BEDv1 §5 (normative "must not"; such files "should use the file extension `.track`") | `track name=targets` at the top of `targets.bed` | error (strict BEDv1) / warning (permissive mode) |
| XF-27 | Companion-file naming: `x.bam`+`x.bam.bai` (or `x.bai`), `x.cram.crai` (or `x.crai`), `x.vcf.gz.tbi`/`.csi`, `ref.fa.fai`, `ref.fa.gz.gzi`. htslib looks for `<file>.csi` and then the name with its last extension replaced (`x.csi`), and then the same for `.bai`/`.tbi`/`.crai`. So `x.vcf.tbi` next to `x.vcf.gz` **is** found by htslib (other tool families may not find it [from memory - verify]) | faidx(5); bgzip(1); htslib `hts.c` `hts_idx_check_local()` | index named `child.sorted.bam.bai` next to `child.bam` (left over after a rename, so no tool finds it) | convention |
| XF-28 | Map short reads to an analysis set (PARs masked, ALT-aware handling, decoys) and record which one in the header (`@SQ AS/UR/M5`, `##reference`) | bwa README-alt; CHM13 README | GRCh38 with ALTs and a non-ALT-aware aligner, giving MAPQ 0 across the ALT regions | warning |

## 6. Recognition cues

| Question | Cue |
|---|---|
| 0-based or 1-based? | A start of `0` in an interval start column (BED-like files, PAF, GFA W) means 0-based. **Exceptions:** SAM POS `0` means "no position" and VCF POS `0` is a telomere, so a `0` there does not make the file 0-based. Rows with `start = end` are empty intervals in BED but one-base features in GFF (VCF has no end column). A single-base feature written as `p-1	p` is BED-style. |
| Which build? | chr1 length 248,956,422 means GRCh38; 249,250,621 means GRCh37/hg19 (bedtools `human.hg38.genome` / `human.hg19.genome`). Mito length 16,571 means hg19 `chrM`; 16,569 means rCRS. Check `@SQ AS/M5` and `##reference`/`##contig`. |
| Which naming? | `chr1`/`chrM` is UCSC style; `1`/`MT` is GRC/Ensembl style. Look for `_alt`, `_random`, `chrUn_`, `_decoy`, `chrEBV`, `HLA-` contigs. |
| gzip vs BGZF | Both start `1f 8b 08`. BGZF has FLG=`04` and, at 0-based bytes 12-13, `42 43` ("BC", when BC is the first extra subfield, as bgzip writes it), and ends with the 28-byte EOF block. |
| Binary magic | After BGZF decompression: BAM `BAM\1`, BCF `BCF` + bytes 2,2, TBI `TBI\1`, CSI `CSI\1` (htslib writes CSI and TBI through BGZF and BAI uncompressed: `bgzf_open(fnidx, fmt == HTS_FMT_BAI ? "wu" : "w")` in htslib `hts.c`). Uncompressed: BAI starts `BAI\1`; CRAM starts `CRAM` (43 52 41 4d) then major 3, minor 0 or 1. 2bit signature `0x1A412743`. |
| First-line signatures | FASTA `>`; FASTQ `@` with a `+` line every 4 lines (for unwrapped FASTQ only; multi-line FASTQ exists and faidx(5) indexes it); SAM `@HD`/`@SQ` (the header is optional); VCF `##fileformat=VCFv4.x`; GFF3 `##gff-version 3`; WIG `track type=wiggle_0` (custom-track files only) then `variableStep`/`fixedStep`; GFA `H	VN:Z:1.x` or `S` lines; PAF has 12+ columns with `+`/`-` in col 5. |
| Quality offset | Any character below `;` (ASCII 59) proves Phred+33. Mostly `@`-`h` with nothing below `@` suggests +64. Only 3-4 distinct characters means binned. |

## 7. Common misconceptions and real-world pitfalls

1. **"BED is 0-based, so BED end is also 0-based."** The end is exclusive. bedtools describes it as a "one-based end", which is the same thing. Only the start changes on conversion.
2. **"GFF and BED differ by one everywhere."** Only starts differ. Ends are identical.
3. **"A zero-length BED interval is a typo."** It is legal and means an insertion point (BEDv1 §1.6). Naively converting SNVs to BED as `POS	POS` creates zero-length intervals that describe the gap *after* the SNV base, not the base. What happens next depends on the tool: strict half-open arithmetic says they overlap nothing, while bedtools widens every zero-length interval to `[start-1, end+1)` before intersecting (`Record::adjustZeroLength()` in bedtools2), so it reports hits on *both* flanking bases. Either way the answer is wrong.
4. **"VCF deletions start where the deletion starts."** POS points to the padding base *before* the deleted bases. For `POS=14 REF=AG ALT=A`, the deleted base is 1-based 15, which is BED `14	15`. Here the two off-by-ones cancel.
5. **"chr1 and 1 are the same, so just strip `chr`."** That works for GRCh37 nuclear chromosomes, but hg19 `chrM` is a different sequence from `MT`. Contig sets also differ (`_random` vs accession names).
6. **"GRCh37 and GRCh38 coordinates are close enough."** Positions shift by thousands to millions of bases, and some sequence was added, removed or moved between contigs. Use liftover with a chain file, never arithmetic.
7. **"Lowercase bases are low quality."** They are soft-masked repeats, with no relation to quality.
8. **"Average Q20 means 1% errors."** The mean of Q10 and Q30 is not Q20: average the probabilities (0.0505), which gives Q≈13.
9. **"MAPQ 0 means the read is unaligned."** It means the placement is ambiguous (repeats, ALT contigs). The unmapped flag is 0x4.
10. **"Indexing a .gz works."** Only if it was BGZF-compressed (`bgzip`), not `gzip`.
11. **"Exome coverage dip = deletion."** Capture efficiency and GC content also cause dips. Compare with the parents and controls before concluding anything.
12. **"De novo = not seen in the parents' VCF rows."** A parent may simply have zero coverage there. A gVCF reference block or the per-sample DP/GQ is needed to *show* the parent is hom-ref, and only when that DP/GQ is adequate: a reference block with DP 3 and GQ 8 shows almost nothing.
13. **"Reverse complement = complement."** You must also reverse the string. IUPAC codes complement too (R<->Y, K<->M, B<->V, D<->H).

## 8. Exercise bank

Separator notes are given per exercise. "Tab-delimited" means each gap between columns is exactly one tab character.

**EX-01 · simulator (coordinate ruler) · warm-up**
Show the 45-bp `ref` with a dual ruler: posts numbered 0..45 between the bases and bases numbered 1..45 under them. Dragging a selection updates three readouts live: BED `start end`, GFF `start end`, and the region string.
Tasks: (1) Select `TTAGATAA`. (2) Type the BED interval `6 14` and predict the bases before they are highlighted.
Answer: BED `ref 6 14`, GFF `7 14`, region `ref:7-14`, sequence `TTAGATAA`, length 8 by both formulas (14-6 and 14-7+1).
Explanation: posts vs panels. The BED start is the post *before* base 7.

**EX-02 · predict · empty intervals**
"A BED line reads (tab-delimited) `ref	20	20	ins1`. How many bases does it cover, and where is it?"
Answer: zero bases. It is the insertion point between 1-based bases 20 (C) and 21 (T).
Explanation: BEDv1 §1.6: start = end is "a feature between chromStart and the preceding base". The GFF3 equivalent is start = end = 20 with an insertion-site type, "to the right of the indicated base". In GFF3, `20	20` alone would also be read as a 1-bp feature, so the type column carries the meaning.

**EX-03 · fix-it · VCF SNVs to BED (validator runs live)**
A colleague converted SNVs to BED by copying POS into both columns. Fix the BED so that each line covers exactly the variant's REF base. Snippet below; columns are tab-delimited.
```
ref	42	42	C>G
ref	9	9	A>T
ref	30	30	A>G
```
Validator: 4 columns; integer start < end; end ≤ 45; `end - start` = 1; `ref[start:end]` equals the REF letter in column 4.
Answer:
```
ref	41	42	C>G
ref	8	9	A>T
ref	29	30	A>G
```
Explanation: a single base at 1-based p is `[p-1, p)`. The original lines were legal BED, but they described insertion points (the gap after each SNV base). By strict half-open arithmetic they intersect nothing; bedtools instead widens zero-length intervals to the two flanking bases, so `ref	42	42` would also hit features covering base 43. Neither result is the SNV.

**EX-04 · sort · which convention is on disk?**
Drag each item into **0-based** or **1-based**: BED chromStart · VCF POS · SAM POS · BAM `pos` (binary) · BCF POS · GFF3 start · GTF start · PAF query start · WIG `variableStep` position · bedGraph start · GFA W-line SeqStart · BEDPE start2 · `samtools view` region `chr2:100-200` · `.fai` OFFSET.
Answer: 0-based = BED, BAM, BCF, PAF, bedGraph, GFA W, BEDPE, `.fai` OFFSET (a byte offset). 1-based = VCF, SAM, GFF3, GTF, WIG, samtools region.
Explanation: the text formats humans type into (SAM, VCF, GFF) are 1-based. Their binary twins (BAM, BCF) and the UCSC/BED family are 0-based. WIG is UCSC's single 1-based exception.

**EX-05 · simulator (Phred converter) + predict**
A slider sets Q, and the panel shows P(error), accuracy, and the +33 and +64 characters. Tasks: decode `I`, `5`, `?`, `#`. Then predict the expected number of errors in this 20-base quality string before revealing it: `IIIIIIIIII5555555555`.
Answer: `I`=Q40, `5`=Q20, `?`=Q30, `#`=Q2. Expected errors = 10x0.0001 + 10x0.01 = **0.101**. 99% of that comes from the ten Q20 bases.
Explanation: Phred is logarithmic, so the worst bases dominate. This is why trimming low-quality tails matters.

**EX-06 · predict · averaging qualities**
"Half the bases are Q10, half are Q30. What is the mean quality?" Choices: Q20 / about Q13 / about Q27.
Answer: about Q13. Mean P = (0.1 + 0.001)/2 = 0.0505, and -10·log10(0.0505) ≈ 12.97.
Explanation: average probabilities, not Phred values.

**EX-07 · spot-the-error · quality encodings**
Three FASTQ records (four lines each, no tabs). Click the record that is **structurally invalid**, then label the one that is probably legacy-encoded.
```
@read1
GATTACAGATTACA
+
IIIIIIIIIIIIII
@read2
GATTACAGATTACA
+
IIIIIIIIIIIII
@read3
GATTACAGATTACA
+
hhhhhhhhggg^^^
```
Answer: read2 is invalid because its quality line is 13 characters for 14 bases. read3 is probably Phred+64: decoded as +33, `h` would be Q71, far above any Illumina value. Decoded as +64 it is Q40, and `^` is Q30.
Explanation: length equality is a hard rule. The offset is inferred from the character range (Section 6).

**EX-08 · spot-the-error · the case folder headers (cross-format)**
Four header excerpts from the trio's case folder. Click every line that is inconsistent with the GRCh38 `chr`-style reference. Separators: the `.fai` and `@SQ` lines are tab-delimited; VCF meta lines have no tabs.
```
# reference.fa.fai
chr1	248956422	112	70	71
chrM	16569	253404903	70	71
# child.bam header
@SQ	SN:chr1	LN:248956422
@SQ	SN:chrM	LN:16569
# trio.vcf.gz header
##contig=<ID=chr1,length=249250621>
##contig=<ID=chrM,length=16571>
# targets.bed
1	65508	65578
```
(The `.fai` offsets are illustrative.)
Answer: both VCF `##contig` lines (GRCh37/hg19 lengths, so a build mismatch, XF-11/XF-13) and the BED line (`1` instead of `chr1`, a naming mismatch, XF-12).
Explanation: lengths reveal the build and names reveal the convention. Many tools (e.g. bedtools, bcftools view) raise no error for either problem, so they show up later as missing overlaps or nonsense calls. Dictionary-checking tools such as GATK do reject mismatched contig lengths [from memory - verify]. (chr1 and chrM lengths verified against bedtools `human.hg38.genome` and `human.hg19.genome`.)

**EX-09 · predict · strand and reverse complement**
Tab-delimited SAM record from the spec: `r001	147	ref	37	30	9M	=	7	-39	CAGCGGCAT	*	NM:i:1`. FLAG 147 includes 0x10. "What did the sequencer actually read for this mate, 5'->3'?"
Answer: `ATGCCGCTG`, the reverse complement of the stored SEQ.
Follow-up: reverse-complement `ATGCCRAT` → `ATYGGCAT` (R pairs with Y).
Explanation: SAMv1 §1.4 stores reverse-strand reads as they align to the forward strand.

**EX-10 · field-explorer + simulator · .fai random access**
Hovering each column of the faidx(5) example line (tab-delimited) `one	66	5	30	31` reveals NAME, LENGTH, OFFSET, LINEBASES and LINEWIDTH. Task: "At which byte (0-based) does base 40 of `one` sit?"
Answer: index 39 → line 39 div 30 = 1, column 39 mod 30 = 9, so 5 + 1x31 + 9 = **45**. The base there is `C`.
Explanation: uniform line widths make the offset computable, which is why faidx rejects ragged FASTA. CRLF files have LINEWIDTH 32 and a different OFFSET.

**EX-11 · predict · depth arithmetic: genome or exome?**
"One sample has 60 million read pairs of 2x150 bp. Is it a 30x genome or a deep exome?"
Answer: 60e6 x 2 x 150 = 18 Gb. Over a 3.1 Gb genome that is about 5.8x, too low for a clinical genome. Over a 40 Mb exome target it is about 450x raw, which falls well below that after off-target reads and duplicates. So it is an exome. A 30x genome needs about 620 M reads of 150 bp.
Explanation: C = N·L/G. "Tens of millions of reads" is an exome-sized story.

**EX-12 · sort · variant classes**
Bin each VCF REF→ALT into SNV / MNV / insertion / deletion / symbolic SV: `C→G`, `CT→GA`, `C→CA`, `AG→A`, `A→<DEL>`, `T→<INV>`, `G→GTTT`, `ACGT→A`.
Answer: SNV `C→G`; MNV `CT→GA`; insertions `C→CA`, `G→GTTT`; deletions `AG→A`, `ACGT→A`; SV `<DEL>`, `<INV>`.
Explanation: the shared first base is VCF's padding base, not part of the change.

**EX-13 · predict · trio genotypes (VCF body, tab-delimited)**
```
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	child	mother	father
ref	9	.	A	T	50	PASS	.	GT:DP:GQ	0/1:38:99	0/0:41:99	0/0:36:99
ref	20	.	C	T	60	PASS	.	GT:DP:GQ	1/1:40:99	0/1:35:99	0/1:39:99
ref	30	.	A	G	45	PASS	.	GT:DP:GQ	0/1:33:99	0/0:40:99	0/0:3:8
ref	42	.	C	G	70	PASS	.	GT:DP:GQ	0/1:35:99	0/1:30:99	0/0:44:99
```
For each site, predict de novo / recessive (hom-alt from two carriers) / inherited / insufficient evidence.
Answer: 9 de novo candidate; 20 recessive; 30 insufficient evidence (father DP 3, GQ 8, so his `0/0` is unreliable); 42 inherited from the mother.
Explanation: a de novo call is a claim about *three* genotypes, and each one needs its own "how sure".

**EX-14 · predict · CDS phase**
"A plus-strand transcript has CDS piece 1 of 100 bp with phase 0. What is the phase of CDS piece 2?"
Answer: 2. 33 full codons use 99 bases. Base 100 starts a codon that needs 2 more bases from piece 2, so the next codon starts 2 bases into piece 2.
Explanation: phase is "bases to skip" in *this* piece, not the codon position of its first base (GFF3 1.26 col 8).

**EX-15 · predict · VCF deletion to BED (the off-by-one that cancels)**
"`ref	14	.	AG	A` (tab-delimited VCF columns 1-5). Write the BED interval of the deleted base(s)."
Answer: `ref	14	15`. The deleted G is 1-based base 15.
Explanation: POS points to the padding base A at 14, and the deleted base's 0-based start equals that POS.

## 9. Quiz bank

**Q1.** A capture-target BED line (tab-delimited) reads `chr2	1000	1003`. Which 1-based closed interval is it?
- a) 1000-1003. *Wrong: that is 4 bases and keeps the 0-based start.*
- b) **1001-1003** ✓. *Correct: start + 1, end unchanged, 3 bases.*
- c) 1001-1004. *Wrong: shifts both ends, the most common over-correction.*
- d) 1000-1002. *Wrong: right length (3 bases) but shifted one base left, because the 0-based start was kept and the end was decremented.*

**Q2.** A FASTQ quality character is `+` and the file is Illumina 1.8+. What is the probability that this base call is wrong?
- a) **10%** ✓. *`+` is ASCII 43, and 43 - 33 = Q10, so P = 0.1.*
- b) 1%. *That is Q20 (`5`).*
- c) 0.1%. *That is Q30 (`?`).*
- d) Undefined. *`+` is a valid quality character. Only the separator line is a lone `+`.*

**Q3.** The child's BAM has `@SQ	SN:chr1	LN:248956422` and a public annotation VCF has `##contig=<ID=1,length=248956422>`. What should you do before intersecting?
- a) Lift the VCF over to GRCh38. *Wrong: the identical length (248,956,422 is GRCh38 chr1) says it is already GRCh38. A matching `md5` would prove it.*
- b) **Rename contigs consistently (`1` → `chr1`) and verify the other contigs, including the mitochondrion** ✓. *Same build, different naming convention.*
- c) Nothing, because tools match `1` to `chr1`. *Wrong: most do not, and you would get zero overlaps silently.*
- d) Re-align the reads to the annotation's naming. *Wasteful: renaming metadata is enough.*

**Q4.** Why can `tabix` index `calls.vcf.gz` made with `bgzip` but not one made with `gzip`?
- a) gzip uses a different compression algorithm. *Wrong: both use DEFLATE, and BGZF is gzip-compatible.*
- b) **BGZF compresses independent ≤64 KiB blocks, so an index can store virtual offsets to block starts. A single gzip stream can only be decompressed from the beginning** ✓.
- c) tabix only reads uncompressed files. *Wrong: it requires BGZF.*
- d) gzip files have no EOF marker. *An EOF marker detects truncation. It does not enable random access.*

**Q5.** In the child's exome, read depth over one exon drops to about half that of neighbouring exons. Which conclusion is best supported?
- a) A heterozygous deletion is confirmed. *Over-reach: capture efficiency and GC bias cause dips too.*
- b) **It is a candidate deletion. Compare normalized depth in the parents and in controls captured with the same kit, and look for split or discordant reads** ✓.
- c) The exon is soft-masked, so reads cannot map. *Soft-masking does not block mapping.*
- d) Nothing can be said about exomes. *Too pessimistic: relative depth is informative once normalized.*

**Q6.** Child `0/1` (DP 35), mother `0/0` (DP 40, GQ 99), father `0/0` (DP 3, GQ 8). Is this a confirmed de novo?
- a) Yes: both parents are `0/0`. *Ignores the father's evidence.*
- b) **Not yet: the father's hom-ref call rests on 3 reads (GQ 8 ≈ 16% chance the genotype is wrong)** ✓. *Needs more depth or orthogonal confirmation.*
- c) No, it is inherited from the father. *Nothing shows the father carries it.*
- d) No, because QUAL must exceed 99. *QUAL is site-level and is not the issue here.*

**Q7 (multi-select).** Which of these store 0-based start coordinates **on disk**?
- BED ✓. *chromStart is 0-based (BEDv1 §1.5).*
- BAM ✓. *The binary `pos` field is POS-1 (SAMv1 §4.2).*
- BCF ✓. *The binary POS is 0-based (VCF 4.5 §6.3.1).*
- PAF ✓. *Query and target starts are 0-based (PAF.md).*
- bedGraph ✓. *A BED-family format (UCSC bedGraph doc).*
- SAM. *1-based POS: the text twin of BAM.*
- VCF. *1-based POS: the text twin of BCF.*
- GFF3. *1-based closed.*
- WIG `variableStep`. *1-based: UCSC's only 1-based format.*

**Q8.** A read has two equally good placements. Roughly what MAPQ should it get?
- a) 0 or about 3 ✓. *P(wrong) = 0.5, which gives Q≈3. Many aligners report 0.*
- b) 30. *That would imply a 1-in-1000 chance of being wrong.*
- c) 60. *Typical for unique placements.*
- d) 255. *Means "unavailable".*

## 10. Case-thread hooks

- **Foundations opener:** the 4-year-old's seizures. "What can break": SNV, indel, CNV, SV. Diploid genome, so a heterozygous variant in a dosage-sensitive gene can be enough. De novo arithmetic: each child carries about 60-75 new SNVs, so most are harmless and the task is a search. A classic real example is a de novo SCN1A variant in Dravet syndrome [from memory - verify; the course owner should choose the gene].
- **FASTA:** "which map edition?" The lab uses a GRCh38 analysis set (PARs masked, decoys). The case folder includes an old hg19 annotation file. Hook for XF-11/XF-13.
- **FASTQ:** three samples, tens of millions of read pairs each (EX-11). One legacy file from an old research run is Phred+64 (EX-07).
- **BED:** capture targets are the "looked-at" regions. A variant outside them cannot be called. Coordinate conversion from the lab report's 1-based coordinates (EX-03, Q1).
- **SAM/BAM/CRAM:** reverse-strand mates (EX-09), MAPQ in a repeat (Q8). Archiving to CRAM requires keeping the exact FASTA (XF-10).
- **WIG:** the exon dip (Q5). WIG is 1-based while the bedGraph export is 0-based.
- **gVCF → VCF:** the father's low-depth hom-ref (Q6, EX-13). gVCF blocks carry the evidence (DP, GQ, MIN_DP) for reference calls, and that evidence can be weak.
- **GTF/GFF3:** phase and frameshift. Does the hit fall in CDS, UTR or intron (EX-14)?
- **BEDPE/PAF/GFA:** split reads give a breakpoint pair. Long reads map with PAF's 0-based coordinates, and the graph's stable coordinates (rGFA `SO`) tie back to GRCh38.
- **Capstone:** a case folder in which every file must pass the XF rules (EX-08 extended).

## 11. "Read more" candidates

- BGZF internals: block ≤64 KiB, `BC` subfield, `BSIZE`, the 28-byte EOF block, virtual offsets `coffset<<16|uoffset` (SAMv1 §4.1).
- Why BAI cannot index contigs ≥ 2^29 bp, and how CSI generalises it (`min_shift`, `depth`) (SAMv1 §5.1.1; CSIv1).
- Tabix stores the BED-vs-GFF coordinate rule in the index (`format & 0x10000`) (tabix.tex).
- Reference MD5 recipe: strip characters outside 33-126, uppercase, then MD5 (SAMv1 §1.3.2). This is the robust way to compare `1`, `chr1` and `Chr1`.
- Solexa odds-based scores vs Phred, and why Illumina 1.3-1.7 files need conversion (Biopython `QualityIO`).
- The SAM single-base `QUAL=*` ambiguity: tools should write Q10 instead of Q9 for length-1 reads (SAMv1 §1.4 footnote).
- Circular contigs: SAM `TP:circular` with positions beyond LN wrapping around; GFF3 `Is_circular` with end > length.
- VCF telomere positions 0 and N+1; padding-base rules and the exception at position 1 (VCF 4.5 §1.6.1).
- GFF3 zero-length features vs 1-bp features (both `start = end`).
- GFA2 positions as tick marks with `$` for the segment end; rGFA stable coordinates; GAF path syntax.
- CRAM stores alignment start 1-based when not delta-coded, unlike BAM (CRAMv3 §10).
- CDS boundaries differ between dialects: GTF2/2.2 excludes the stop codon from CDS ("Unlike Genbank annotation, the stop codon is not included in the 'CDS' feature for the terminal exon", GTF2.2 text as quoted verbatim in the NBISweden/AGAT `docs/gxf.md`; the mblab.wustl.edu original is still unreachable), while GFF3 includes it ("The START and STOP codons are included in the CDS", GFF3 1.26). Ensembl GTFs list `stop_codon` as a separate feature outside CDS (Biostars thread on Ensembl release 75, via search summary); GENCODE is believed to do the same [from memory - verify].
- Region-string parsing when contig names contain `:` (HLA), and the `{name}:beg-end` convention (SAMv1 Appendix A).
- BED `chrom` regex vs SAM names: HLA contigs are legal in SAM/VCF but not in strict BEDv1.
- hg19 `chrM` vs rCRS, and why liftover tools often skip the mitochondrion.

## 12. Sources

**Read (fetched 2026-10-16 via raw.githubusercontent.com unless noted):**
- SAM v1 spec, header version 1.6: https://raw.githubusercontent.com/samtools/hts-specs/master/SAMv1.tex
- SAM optional tags: https://raw.githubusercontent.com/samtools/hts-specs/master/SAMtags.tex (skimmed)
- CRAM 3.0/3.1: https://raw.githubusercontent.com/samtools/hts-specs/master/CRAMv3.tex
- VCF 4.5 (+BCF 2.2): https://raw.githubusercontent.com/samtools/hts-specs/master/VCFv4.5.tex ; VCF 4.4 and 4.3 (change lists): .../VCFv4.4.tex, .../VCFv4.3.tex
- BED v1: https://raw.githubusercontent.com/samtools/hts-specs/master/BEDv1.tex
- Tabix index: https://raw.githubusercontent.com/samtools/hts-specs/master/tabix.tex ; CSI v1: .../CSIv1.tex
- faidx(5), htslib develop: https://raw.githubusercontent.com/samtools/htslib/develop/faidx.5
- tabix(1) and bgzip(1), htslib 1.24: https://raw.githubusercontent.com/samtools/htslib/develop/tabix.1 , .../bgzip.1
- samtools-view(1), samtools-faidx(1), samtools 1.24: https://raw.githubusercontent.com/samtools/samtools/develop/doc/samtools-view.1 , .../samtools-faidx.1
- GFF3 1.26 (18 Aug 2020): https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md
- GFA1 (v1.0-1.2, 2022-06-07): https://raw.githubusercontent.com/GFA-spec/GFA-spec/master/GFA1.md ; GFA2: .../GFA2.md
- PAF: https://raw.githubusercontent.com/lh3/miniasm/master/PAF.md ; minimap2(1) 2.31: https://raw.githubusercontent.com/lh3/minimap2/master/minimap2.1
- rGFA/GAF: https://raw.githubusercontent.com/lh3/gfatools/master/doc/rGFA.md
- bedtools BED/BEDPE/GFF descriptions: https://raw.githubusercontent.com/arq5x/bedtools2/master/docs/content/general-usage.rst
- UCSC docs via the kent GitHub mirror: https://raw.githubusercontent.com/ucscGenomeBrowser/kent/master/src/hg/htdocs/goldenPath/help/wiggle.html , .../goldenPath/help/bedgraph.html , .../FAQ/FAQformat.html
- Ensembl GFF/GTF doc via GitHub: https://raw.githubusercontent.com/Ensembl/ensembl-webcode/main/htdocs/info/website/upload/gff.html
- Biopython FASTQ variants (summarising Cock et al. 2010, NAR 38:1767): https://raw.githubusercontent.com/biopython/biopython/master/Bio/SeqIO/QualityIO.py ; IUPAC tables: .../Bio/Data/IUPACData.py
- bwa ALT-aware mapping and reference sets: https://raw.githubusercontent.com/lh3/bwa/master/README-alt.md , https://raw.githubusercontent.com/lh3/bwa/master/bwakit/run-gen-ref
- T2T-CHM13 README: https://raw.githubusercontent.com/marbl/CHM13/master/README.md
- Web-search result summaries only (the underlying pages were not opened): Illumina Q-score binning (illumina.com app note 770-2017-010; knowledge.illumina.com article 000008320); hg19 chrM vs rCRS (Bioconductor bioc-devel thread; biostars.org/p/349420; UCSC hg19 README); Nurk et al. 2022 *Science* 376:44 (T2T-CHM13); Kong et al. 2012 *Nature* 488:471 (de novo rate); exome kit sizes (PMC12408908, Roche, Twist); long-read error profiles (PMC5553090, PMC7671305); analysis sets (GATK article 360041155232, UCSC hg38 description).

**Could not reach (DNS failure for WebFetch; curl blocked):** genome.ucsc.edu (wiggle/FAQ, read via the GitHub mirror instead), hgdownload.soe.ucsc.edu (hg38 analysisSet README), ensembl.org (read via the GitHub mirror instead), ncbi.nlm.nih.gov/grc (GRC definitions of assembly/patch/alt), gatk.broadinstitute.org (reference build article), gencodegenes.org (GENCODE GTF naming), lh3.github.io (reference-choice blog post), mblab.wustl.edu (GTF 2.2 spec), academic.oup.com (Cock et al. 2010 original). Claims that depend on these are marked [from memory - verify].

**Added during the fact-check (2026-10-16, all fetched with curl from raw.githubusercontent.com unless noted):**
- bedtools chromosome-size files: https://raw.githubusercontent.com/arq5x/bedtools2/master/genomes/human.hg19.genome , .../human.hg38.genome
- bedtools zero-length interval handling: https://raw.githubusercontent.com/arq5x/bedtools2/master/src/utils/FileRecordTools/Records/Record.cpp (`adjustZeroLength()`)
- htslib index lookup and index writing: https://raw.githubusercontent.com/samtools/htslib/develop/hts.c (`hts_idx_check_local()`, `bgzf_open(fnidx, ... "wu" : "w")`); SAM parser: .../htslib/develop/sam.c ("SEQ and QUAL are of different length")
- bcftools manual: https://raw.githubusercontent.com/samtools/bcftools/develop/doc/bcftools.txt (`norm --check-ref`)
- GTF2/2.2 text quoted verbatim in AGAT docs: https://raw.githubusercontent.com/NBISweden/AGAT/master/docs/gxf.md
- NovaSeq 6000 bin change: https://github.com/benjjneb/dada2/issues/791 (WebFetch)

## Verification log

Adversarial fact-check carried out 2026-10-16. Every primary spec listed in the Sources was re-downloaded and read independently: SAMv1.tex (VN 1.6), CRAMv3.tex, VCFv4.5.tex (plus the 4.4 and 4.3 change lists), BEDv1.tex, tabix.tex, CSIv1.tex, faidx.5, gff3.md (1.26), GFA1.md, GFA2.md, PAF.md, minimap2.1 (2.31), rGFA.md, bedtools general-usage.rst, the UCSC wiggle, bedGraph and FAQformat pages via the kent mirror, the Ensembl gff.html mirror, Biopython QualityIO.py and IUPACData.py, bwa README-alt.md and run-gen-ref, the CHM13 README, and the htslib/samtools 1.24 man pages. All section numbers cited in the brief were checked against the heading structure of each `.tex` file.

**Checked and correct (no change needed):** every row of the Phred table (Q2 to Q40, +33 and +64 characters); the IUPAC complement table; the 45-bp toy reference (length 45; bases 7-14 = `TTAGATAA`; r001 `8M2I4M1D3M` spans 7..22; r001/2 mismatch at 1-based 42, C->G; TLEN 39); every BED, GFF3, VCF, SAM, PAF and WIG line in §3.8; the SAMv1 §1.2 0-based/1-based quotations; BAM `pos` = POS-1; BCF POS 0-based (§6.3.1); CRAM AP 1-based when not delta-coded (§10.2); the VCF POS telomere rule, REF alphabet and IUPAC reduction rule; the contig-name character set (SAMv1 §1.2.1, VCF 4.5 §1.4.7); BGZF block limits, header bytes, the 28-byte EOF block and the virtual-offset formula; BAI bin sizes and the 2^29-1 limit; the tabix 0x10000 flag; the `.crai` columns; the CRAM `@SQ M5` requirement and the reader MD5 check; the faidx(5) columns and the EX-10 answer (byte 45 = `C`); the GFF3 phase definition and the EX-14 answer (phase 2); the GTF frame meaning (Ensembl and GTF2.2 both match GFF3 phase); the PAF, GAF, GFA1 C/W-line and GFA2 position conventions; the BEDPE conventions; the UCSC WIG 1-based and bedGraph 0-based statements; the Solexa/Illumina +64 ranges; every arithmetic answer (EX-05 0.101; EX-06 and misconception 8 Q≈12.97; EX-11 5.8x and 450x, with 620 M reads for 30x; Q6 GQ 8 ≈ 15.8%; Q8 -10log10(0.5) = 3.01; de novo 2 x 3.1e9 x 1.2e-8 ≈ 74); every REF base in EX-03, EX-13 and EX-15 against the toy reference; the EX-09 reverse complements; every answer key in EX-01 to EX-15 and Q1 to Q8 (each keyed answer correct, each distractor wrong for the stated reason); Kong et al. 2012 (1.20 x 10^-8 per base per generation, 78 trios, 63.2 de novo SNVs per trio, via web search). Case thread: a de novo heterozygous variant in a haploinsufficient gene (SCN1A/Dravet given as an example) is a plausible explanation for unexplained childhood seizures. No patient-specific coordinates or transcript IDs appear in this brief.

**Corrections made:**

| # | Claim (as written) | Correction | Source |
|---|---|---|---|
| 1 | §2: "Store reads as placements plus differences (SAM/BAM)" | SAM/BAM store every read base in SEQ, plus a placement (POS + CIGAR). Only CRAM stores read bases as differences against the reference. | SAMv1 §1.4 (SEQ); CRAMv3 §1 |
| 2 | §2: coordinate conversion is "the most common bug in bioinformatics" | Softened to "one of the most common sources of bugs" (the superlative is unsupported) | no source supports the superlative |
| 3 | §3.1: "SAM SEQ accepts `=ACMGRSVTWYHKDBN`" | The SAM SEQ regex is `\*\|[A-Za-z=.]+`. Only BAM is limited to those 16 codes, and it maps every other character to `N`. A validator using the 16-code list would wrongly reject valid SAM. | SAMv1 §1.4 table; §4.2.3 |
| 4 | §3.2 table, §6, EX-08: chr1 lengths 249,250,621 / 248,956,422 "[from memory - verify]" | Verified. Markers replaced with the source. hg19 chrM 16,571 and hg38 chrM 16,569 also verified. | bedtools2 `genomes/human.hg19.genome`, `human.hg38.genome` |
| 5 | §3.2 Decoys row: "Extra sequences, including EBV" | bwakit defines EBV separately from the decoys (hs38/hs37 = primary + EBV; hs38DH/hs37d5 add decoys). Reworded. | bwakit `run-gen-ref` |
| 6 | §3.3: HiFi "about Q30 or better" | HiFi is defined as ≥ Q20 (99%), with a typical median around Q30. Still [from memory - verify]. | none reachable |
| 7 | §3.4: "NovaSeq 6000 (RTA3) emits 2, 12, 23 and 37 (`#`, `-`, `8`, `F`)" | That was the original binning. Since NVCS v1.1 the values are 2, 11, 25 and 37 (`#`, `,`, `:`, `F`), which most real NovaSeq 6000 FASTQ files show. NovaSeq X: 12/24/40 from v1.2 (12/20/37 before), reportedly Q41 top bin from v1.4.0 (search summary only). A hard-coded `#-8F` detector would misclassify real data. | dada2 issue #791 (cites Illumina support); Illumina KB 000008320 via search summary |
| 8 | §3.6: "rGFA ... each base keeps a stable linear-reference coordinate"; "GFA has S, L, P and W lines" | The stable coordinate is a stable-sequence name plus an offset. Only rank-0 (`SR:i:0`) segments are on the linear reference. GFA1 also has H, C and J lines. | rGFA.md; GFA1.md |
| 9 | §3.8: the WIG track line is a "required header" | The track line is required only for UCSC custom tracks. For bigWig conversion it "must not be present". | UCSC wiggle.html (kent mirror) |
| 10 | §3.5: VCF padding rule cited to "§5.1" | The rule is VCF 4.5 §1.6.1(4); §5.1 only has examples | VCFv4.5.tex |
| 11 | §4.2 `.fai` row: "1-based inclusive (samtools-faidx(1), ...)" | samtools-faidx(1) 1.24 does not state the base. The CRAMv3 §11 example does ("the bases are counted 1-based"). Citation fixed; claim unchanged. | samtools-faidx.1; CRAMv3 §11 |
| 12 | XF-02: "start ≤ end (except circular features)" | start ≤ end holds always. Origin-crossing features keep it by adding the landmark length to end, so the circular exception is to end ≤ landmark length. | GFF3 1.26 cols 4-5; GTF2.2 via AGAT |
| 13 | XF-05: placed under "MUST" with "should equal" | The QUAL regex is a MUST. SEQ/QUAL length equality is worded "ought to" in SAMv1, but htslib rejects the record, so severity "error" stands. Wording clarified. | SAMv1 §1.4; htslib `sam.c` |
| 14 | XF-09: "Random access requires BGZF" (cites CRAMv3 §12) | Applies to BAM, BCF and bgzipped text. CRAM is not BGZF and has its own container/slice random access via `.crai`. | CRAMv3 §12; SAMv1 §4.1 |
| 15 | XF-17: `bcftools norm --check-ref` "[from memory - verify]" | Verified (modes e, w, x, s) | bcftools.txt (develop) |
| 16 | XF-26 placed under "(c) tools enforce them; the specs only recommend them" with severity "convention" | It is the reverse: BEDv1 §5 makes it normative ("must not"), and tools tolerate it. Severity changed to "error (strict BEDv1) / warning (permissive)", with a note. | BEDv1 §5 |
| 17 | XF-27 minimal violation: "index named `x.vcf.tbi` next to `x.vcf.gz`" | Not a violation for htslib, which tries `x.vcf.gz.csi`, `x.vcf.csi`, `x.vcf.gz.tbi` and then `x.vcf.tbi`, so it finds that index. Replaced with a stale-name example (`child.sorted.bam.bai` next to `child.bam`) and documented htslib's lookup order. | htslib `hts.c` `hts_idx_check_local()` |
| 18 | §6: "A start of `0` anywhere means 0-based" | False for SAM (POS 0 = no position) and VCF (POS 0 = telomere). Restricted to interval-start columns, with the two exceptions stated. Also noted that VCF has no end column. | SAMv1 §1.4; VCF 4.5 §1.6.1(2) |
| 19 | §6: "CSI is BGZF-compressed in htslib practice [from memory - verify]" | Verified: htslib writes CSI/TBI through BGZF ("w") and BAI uncompressed ("wu"). Also clarified that BGZF "bytes 12-13" are 0-based offsets and assume BC is the first extra subfield. | htslib `hts.c`; SAMv1 §4.1 |
| 20 | §6: FASTQ "`+` line every 4 lines"; SAM `@HD`/`@SQ`; WIG `track` line as signatures | Added caveats: multi-line FASTQ exists (faidx(5) indexes it), the SAM header is optional, and the WIG track line appears only in custom-track files. A validator must not require them. | faidx(5); SAMv1 §1; UCSC wiggle.html |
| 21 | §7 #3 and EX-03 explanation: `POS	POS` zero-length intervals "overlap nothing" / "would intersect nothing" | True only under strict half-open arithmetic. bedtools widens zero-length intervals to `[start-1, end+1)`, so `ref	42	42` hits features on bases 42 and 43. Both texts now say the result is tool-dependent and wrong either way. The EX-03 answer key is unchanged. | bedtools2 `Record.cpp` `adjustZeroLength()` and `intersects()` |
| 22 | EX-08 explanation: "Neither problem raises an error by itself" | Overstated. Many tools stay silent, but dictionary-checking tools (GATK) reject contig-length mismatches [from memory - verify]. The answer key is unchanged. | — |
| 23 | §7 #12 and §10: gVCF blocks "*prove*" hom-ref | Softened. A reference block carries evidence (DP/GQ/MIN_DP) that can be weak, which is the point of Q6. | VCF 4.5 §5.5 |
| 24 | Q3 (a) explanation | Added that the identical length marks GRCh38 chr1 and that an `md5` match would prove it | SAMv1 §1.3.2 |
| 25 | §11: GTF 2.2 excludes the stop codon from CDS "[from memory - verify; GTF 2.2 spec unreachable]" | Verified through a verbatim quotation of the GTF2.2 text ("the stop codon is not included in the 'CDS' feature for the terminal exon"). The GFF3 inclusion rule is also quoted. GENCODE behaviour is still unverified. | AGAT `docs/gxf.md`; GFF3 1.26 |

**Could not verify (markers kept or added):**
- GRC patch releases do not change chromosome coordinates; GENCODE/UCSC GRCh38 `chr` naming; HLA contig names such as `HLA-A*01:01:01:01` in hs38DH (the bwakit resource FASTA is not in the git repo). All are still [from memory - verify].
- Typical read lengths (2x150), exome vs genome depths (~100x vs ~30x), PacBio HiFi/CLR and ONT error profiles, SV ≥ 50 bp convention: from memory or search summaries only.
- Illumina binning specifics (NovaSeq X 12/24/40, v1.4 Q41): illumina.com, support.illumina.com and knowledge.illumina.com are unreachable (DNS failure for WebFetch). Search summary only.
- GATK rejecting contig-length mismatches; non-htslib tools not finding `x.vcf.tbi`: from memory.
- SCN1A/Dravet de novo frequency (case hook): from memory. The course owner should still choose the gene.
- Unreachable during this check: mblab.wustl.edu (GTF2.2 original), web.archive.org, illumina.com hosts, forum.qiime2.org. GitHub API access to benjjneb/dada2 was not enabled, but the issue page itself was read through WebFetch.
