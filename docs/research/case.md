# Case study: the P042 trio (the course's running rare-disease thread)

This research note gives lesson writers the **canonical** definition of the fictional case. It replaces the placeholder coordinates in the other notes (`T3`, the 368-bp deletion, chr2:166,009,959); §10.2 lists every replacement.

**Verification legend.**
- `[verified: …]`: read in a primary file during this session.
- `[computed]`: derived here from the fetched GRCh38 slice and GENCODE lines with a script.
- `[search summary]`: seen only in web-search snippets; the source itself was not readable.
- `[from memory - verify]`: from memory only.
- `[illustrative]`: invented for the story.

---

## 1. Purpose and place in the pipeline

**What the case is.** It is a single invented "ground truth", one family with six haplotypes. Every snippet in the course is a projection of that truth, produced by a deterministic generator (§3.7). Lessons, fix-it validators, quizzes and the capstone all consume it.

**The disease question it answers.** *What explains Noa's seizures, and how sure can we be?* Each format answers one sub-question that the formats before it could not:

| Course section | Sub-question | Evidence | Answer at that point |
|---|---|---|---|
| Foundations | What can be broken, and why sequence a trio? | Vignette | SNV, indel, CNV, SV. Parents let us see *new* changes. |
| FASTA | Compared with what? | GRCh38 analysis set, chr2 | SCN1A is on chr2, minus strand. |
| FASTQ | What did the sequencer see? | 3 exomes | Reads and qualities. One file arrived broken. |
| BED | Where did we look? | Capture targets | Coding exons only (plus about 100 bp of padding, where reads still spill over). A variant far outside them is invisible. |
| SAM/BAM/CRAM | Where do the reads belong? | Alignments | Reads stack on the exons. MAPQ falls in repeats. CRAM needs the exact FASTA. |
| WIG | Is anything missing? | Depth tracks | Proband-only half depth over 4 SCN1A exons. Is it a deletion? |
| gVCF → VCF | Any new small variants? | Joint trio VCF | One true de novo SNV, but it is synonymous and in SCN9A. One "de novo" fails on parental evidence. One Mendelian error sits inside the dip. |
| GTF/GFF3 | What would losing those exons do? | MANE Select model | Exons 17-20 sum to 1,135 coding bases, so the deletion shifts the frame: p.(Val806Alafs*24), predicted NMD. |
| BEDPE | Where exactly are the breakpoints? | Short-read genome | A 25-kb deletion. One end is lost in an Alu. A weak "inversion" call is probably an artefact. |
| PAF/GFA | What is the exact structure? | HiFi reads, local graph | A simple 25,213-bp deletion with 7-bp microhomology on the paternal haplotype. No population haplotype has it. |
| Capstone | Can every file be trusted? | Case folder | 14 files triaged. The diagnosis is consolidated. |

**Ethics frame.** Put this on the course's first case page and repeat it briefly at the capstone.
- Noa and her family are **fictional**.
- Genes, the reference genome, the annotation and the named SNPs (rs2298771, rs6432860 and, in a Read-more, rs3812718) are real public data.
- The deletion, the de novo SNV and all genotypes are **invented for teaching**. Any resemblance to a reported patient variant is coincidental. Do not submit them to databases.
- Nothing in the course is clinical advice. Drug and counselling remarks are narrative context only, phrased as "the clinical team…", never as instructions.
- **Avoid:**
  - real lab, hospital or vendor names;
  - a vaccine as the first-seizure trigger (accurate as a trigger, but easily misread as a cause);
  - misattributed-parentage plot twists;
  - deficit-first language. Write "a child with Dravet syndrome", not "a Dravet child".
- One sidebar can note that trio sequencing can reveal misattributed parentage and that labs have consent policies for it.

## 2. Mental model

**One truth, many lossy projections.** The six haplotypes (two per person) are the only reality. Each format keeps some facts and drops others:
- FASTQ keeps bases and qualities but drops positions.
- BED keeps where we looked but drops what we saw.
- WIG keeps how much but drops which allele.
- VCF keeps differences but drops agreement, and gVCF restores agreement.
- BEDPE keeps junctions but drops sequence.
- PAF keeps placement but drops the bases.
- GFA keeps all haplotypes but drops linear coordinates, unless rGFA tags restore them.

Diagnosis is **triangulation**: no single file proves the deletion, but six independent projections agree.

**Analogy for bioinformatics students.** Think of debugging a distributed system from logs:
- Every service (format) logs the same request (the deletion) in its own timestamp convention (0-based vs 1-based, anchor base, windows).
- Nothing looks wrong in any single log.
- The incident only becomes visible when you **join the logs on converted keys**.

The same joins catch both biology (the deletion) and bugs (an off-by-one BED, a GRCh37 header).

**Design problem the case solves.** Each format must *earn its place* by answering a question that nothing earlier could. The escalation follows the real cost/resolution ladder of a diagnostic odyssey:
1. cheap and broad: the exome;
2. reanalysis of data already paid for: coverage and Mendelian errors;
3. an orthogonal short-read technology: WGS breakpoints;
4. a definitive long-read structure.

The case also exercises the second half of the learning objective, *assessing validity*: the capstone folder mixes valid files, broken files, and valid files that are unusable in context.

## 3. Anatomy: story arc and data inventory

### 3.1 Cast and clinical vignette `[illustrative unless marked]`

**Family P042.** Sample IDs follow `sequences.md`.
- Proband **Noa** (P042-proband), 4 years old.
- Mother (P042-mother).
- Father (P042-father).
- Non-consanguineous, with no family history of epilepsy.

**Timeline.**
- **6 months.** First seizure: a prolonged (about 25 min) left-sided clonic seizure during a febrile illness.
- **6-12 months.** Recurrent prolonged seizures, febrile and afebrile, some after warm baths. Two episodes of status epilepticus.
- **14 months.** Started a sodium-channel-blocking anti-seizure medicine for "focal seizures", and the seizures increased. The team switched therapy. Sodium-channel blockers commonly aggravate seizures in Dravet syndrome `[search summary: clinical reviews; verify against GeneReviews NBK1318]`.
- **18-36 months.** Myoclonic jerks and atypical absences. Speech delay, then developmental slowing. EEG was initially normal, later showed generalized spike-wave. MRI normal.
- **2 years.** Chromosomal microarray on an older, lower-resolution platform: normal. This matters later: the platform could not resolve a 25-kb intragenic loss.
- **4 years.** Genetics clinic. The clinical picture suggests **Dravet syndrome**, but there is no molecular confirmation. A **trio exome** is ordered as a first-tier test for unexplained epilepsy `[from memory - verify: NSGC 2023 practice guideline recommends exome/genome first-tier]`.

**Why SCN1A.** Alternatives considered: STXBP1, KCNQ2, SCN2A, CDKL5 (X-linked, so ploidy complications) and PCDH19 (unusual female-limited inheritance).
- Dravet syndrome is mainly caused by heterozygous loss of function of SCN1A, through haploinsufficiency. Most cases are de novo `[search summary: about 80-90% SCN1A-positive, mostly de novo; verify]`.
- Exon-level and whole-gene deletions are an established, MLPA-detectable mechanism. Marini et al. (2009, Epilepsia) found SCN1A CNVs in **12.5% of sequence-negative Dravet** patients, about **2-3% of all Dravet**, including partial-gene deletions `[search summary of Marini 2009]`.
- Parental mosaicism is reported in roughly 5-13% of families. De Lange et al. 2019 (J Med Genet 56:75) cite 7-13% from earlier studies in their background; their own smMIP + ddPCR screen confirmed true mosaics in 4 of 80 parent couples (5%) `[search summary]`. Mosaicism has been reported for an SCN1A deletion `[search summary: J Med Case Rep 2016, PMC4810572; Marini 2009 also reports a partial SCN1A deletion inherited from a mosaic parent]`.
- ClinGen lists SCN1A haploinsufficiency as "sufficient evidence" (score 3) `[search summary; dosage.clinicalgenome.org unreachable - verify]`.

SCN1A also suits the *format* teaching:
- It is on the **minus strand**, which forces careful phase and exon-number work.
- It is large, with 29 exons in MANE.
- It sits in a sodium-channel paralog cluster [verified, GENCODE v43]: SCN3A (−), SCN2A (+), SCN1A (−), SCN9A (−), SCN7A (−). This makes MAPQ and "which gene?" questions natural.
- It has an alternative exon pair (5A/5N) and a famous common missense SNP whose GRCh38 allele is the *minor* allele.

**Outcome.** Likely diagnosis: SCN1A-related Dravet syndrome caused by a **de novo heterozygous deletion of SCN1A exons 17-20** (MANE numbering) on the paternal chromosome. It predicts a frameshift and nonsense-mediated decay, so haploinsufficiency.

Afterwards (narrative only):
- Junction-specific PCR on parental blood finds no mosaicism at the assay's sensitivity.
- The clinical team reviews the medicines.
- Genetic counselling covers a low but non-zero recurrence risk, because gonadal mosaicism cannot be excluded.

### 3.2 Ground truth (what the generator knows)

Coordinates are GRCh38 `chr2`, 1-based.

| Haplotype | Fate | 166,009,887 | rs2298771 166,036,278 | DEL 166,014,903-166,040,115 | rs6432860 166,041,354 | SCN9A 166,204,022 |
|---|---|---|---|---|---|---|
| Mother M1 | to Noa | C | C (REF) | intact | A (REF) | G |
| Mother M2 | not transmitted | C | T | intact | G | G |
| Father F1 | not transmitted | C | T | intact | G | G |
| Father F2 | to Noa, mutated in the germline | **T** (inherited rare) | T → *deleted* | **de novo deletion** | G | **A (de novo)** |

Resulting genotypes:

| Site | Noa | Mother | Father |
|---|---|---|---|
| rs2298771 | C only, called `0/0` at half depth | `0/1` | `1/1` |
| rs6432860 | `0/1` | `0/1` | `1/1` |
| 166,009,887 | `0/1` | `0/0` | `0/1`, but *called* `0/0` with GQ 12 (low depth) |
| SCN9A 166,204,022 | `0/1` (de novo) | `0/0` | `0/0` |

**Sequencing parameters** `[illustrative]`:
- Exome, 2×150: mean target depth 116× (proband), 121× (mother) and **63× (father; under-sequenced library, flagged in lab QC)**.
- Proband PCR-free WGS: 32×, insert about 450 bp.
- Proband HiFi: 28×, read N50 about 17 kb.

### 3.3 Escalation, beat by beat

**Story chronology vs lesson order.** In the lab, SNV calling and coverage QC run in parallel on the exome. The course keeps the draft lesson order (WIG right after alignments, because depth is derived from BAM) and tells two threads that converge:
- **The coverage thread.** In the WIG lesson the dip is flagged and left unexplained: *deletion or capture artefact?*
- **The small-variant thread.** In gVCF/VCF the expected route fails, but a Mendelian error inside the dip becomes a second, allele-based line of evidence. VCF 4.5 itself counts "indirect claims of abundance made using SNV variant allele frequency" as a `D` claim [verified: VCFv4.5 §3, SVCLAIM].
- **Convergence.** GTF predicts the consequence *if* exactly exons 17-20 are lost. BEDPE, PAF and GFA confirm that the breakpoints are intronic and the event is simple.

| Stage | Data | Finding | What it cannot tell → next step |
|---|---|---|---|
| A. Trio exome | FASTQ → CRAM → gVCF → joint VCF | De novo filter: 1 pass (SCN9A c.4707C>T, synonymous). 1 fail (SCN1A c.3880-46G>A: father GQ 12) | Small-variant route exhausted → look at dosage |
| B. Exome reanalysis | Depth WIG + ratio track; VCF Mendelian check | Proband ratio ≈ 0.50 at targets of exons 17-20 only (exon 25 is low in *all* three, an artefact). Mendelian error at rs2298771, inside the dip. Balanced het at rs6432860, just outside it | Breakpoints only bracketed (introns 16 and 20); a complex event is not excluded → orthogonal test |
| C. Proband short-read WGS | BAM → SV caller → BEDPE | `DEL_1` (+/−, SR=8, PE=14). Side 1 is narrow (a 28-bp window in unique sequence); side 2 is a 282-bp window = the whole AluB element. A weak `BND_2` (+/+) points into another Alu (MAPQ 0) | Repeat blocks the exact junction; is the inversion-like call real? → long reads |
| D. Proband HiFi | minimap2 PAF; phased assembly; local GFA | Junction-spanning reads split into two PAF blocks, 25,213 bp apart in the target, 0 bp apart in the query. 7-bp microhomology `CACCATG`. No inversion. The deletion is on the haplotype carrying G at rs6432860, so it is paternal. Graph: only proband hap 2 uses the deletion edge | — |
| E. Interpretation | GTF/GFF3 (MANE) | Exons 17-20 (legacy coding exons 14-17), 1,135 coding nt, frameshift p.(Val806Alafs*24); the premature stop lies in exon 21 of 29, so NMD is predicted | Report; parental junction PCR (not a file format) |

### 3.4 Verified GRCh38 facts

**SCN1A gene and transcript.**
- **SCN1A** = ENSG00000144285.23, HGNC:10585, `chr2:165,984,641-166,149,214`, strand **−** [verified: GENCODE v43 GTF].
- **MANE Select** = **ENST00000674923.1** (SCN1A-224), tags `MANE_Select`, `Ensembl_canonical` and `CCDS` [verified: GENCODE v43].
  - Equivalents: **NM_001165963.4** / NP_001159435.1 [verified: Ensembl 110 xref table in the Broad Funcotator bundle]; ENSP00000501589.1; CCDS54413.1.
  - Transcript extent `chr2:165,985,813-166,128,020`.
  - **29 exons.** Exons 1-3 are 5′UTR only; the CDS is in exons 4-29.
  - **CDS 6,030 nt including the stop, 2,009 aa.** It starts with ATG at 166,073,619-621 and ends with TAA at 165,991,245-247 [computed: translation of the slice, no internal stops].
- Older literature numbers coding exons 1-26, which here is **MANE exon − 3** `[inferred; verify against the reporting lab's convention]`. The legacy 26-exon model matches ENST00000375405 (26 exons) [verified: GENCODE v27 refFlat].

**MANE exons** (chr2, 1-based closed; c. ranges include the stop in exon 29) [verified: GENCODE v43; c. ranges and phases computed]:

| Ex | Start-End | Len | CDS (c.) | Phase | | Ex | Start-End | Len | CDS (c.) | Phase |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 166127771-166128020 | 250 | UTR | . | | 16 | 166041231-166041469 | 239 | 2177-2415 | 2 |
| 2 | 166126924-166127010 | 87 | UTR | . | | **17** | 166039423-166039596 | 174 | 2416-2589 | 0 |
| 3 | 166077710-166077801 | 92 | UTR | . | | **18** | 166037776-166038132 | 357 | 2590-2946 | 0 |
| 4 | 166073358-166073670 | 313 | 1-264 | 0 | | **19** | 166036048-166036530 | 483 | 2947-3429 | 0 |
| 5 | 166058570-166058688 | 119 | 265-383 | 0 | | **20** | 166015607-166015727 | 121 | 3430-3550 | 0 |
| 6 | 166056411-166056500 | 90 | 384-473 | 1 | | 21 | 166013744-166013898 | 155 | 3551-3705 | 2 |
| 7 | 166054638-166054766 | 129 | 474-602 | 1 | | 22 | 166012109-166012282 | 174 | 3706-3879 | 0 |
| 8 (5A) | 166052852-166052943 | 92 | 603-694 | 1 | | 23 | 166009719-166009841 | 123 | 3880-4002 | 0 |
| 9 | 166051719-166051988 | 270 | 695-964 | 2 | | 24 | 166002472-166002753 | 282 | 4003-4284 | 0 |
| 10 | 166048886-166048949 | 64 | 965-1028 | 2 | | 25 | 165999723-165999776 | 54 | 4285-4338 | 0 |
| 11 | 166047627-166047768 | 142 | 1029-1170 | 1 | | 26 | 165998038-165998175 | 138 | 4339-4476 | 0 |
| 12 | 166046770-166046976 | 207 | 1171-1377 | 0 | | 27 | 165996013-165996117 | 105 | 4477-4581 | 0 |
| 13 | 166045043-166045327 | 285 | 1378-1662 | 0 | | 28 | 165994146-165994416 | 271 | 4582-4852 | 0 |
| 14 | 166043669-166044049 | 381 | 1663-2043 | 0 | | 29 | 165985813-165992422 | 6610 | 4853-6030 | 2 |
| 15 | 166042292-166042424 | 133 | 2044-2176 | 0 | | | | | | |

Notes on the table:
- Exon 4's CDS is 166,073,358-166,073,621; its exon line includes 49 nt of UTR.
- Exon 29's CDS line is 165,991,248-165,992,422; the stop codon is a separate feature.

**Introns at the breakpoints:**
- intron 16: 166,039,597-166,041,230 (1,634 bp);
- intron 19: 166,015,728-166,036,047 (20,320 bp);
- intron 20: 166,013,899-166,015,606 (1,708 bp).

**Exons 5A and 5N.** A second 92-bp exon at 166,053,039-166,053,130 is used by 1 of the 17 SCN1A transcripts that contain an exon-5 alternative (the other 16 use MANE exon 8; SCN1A has 25 transcripts in GENCODE v43) [verified: GENCODE v43]. It is captured by the exome. It is exon **5N**, because rs3812718 (`IVS5N+5G>A`) sits exactly +5 from its donor at 166,053,034 [verified: dbSNP138 position, C>T on + = G>A on the coding strand; the "IVS5N+5" name is from memory - verify]. The same SNP's older name `IVS5-91G>A` also fits: 166,052,943 (the acceptor end of MANE exon 8) + 91 = 166,053,034 [computed]. MANE exon 8 is therefore 5A.

**The deletion** [computed]:
- `chr2:166,014,903-166,040,115` (left-aligned), **25,213 bp**.
- 7-bp microhomology `CACCATG`, so there are 8 equivalent placements up to `166,014,910-166,040,122`.
- Left end: intron 20, unique sequence.
- Right end: inside **AluB**, `chr2:166,039,936-166,040,217`. AluB is on the − orientation, 282 bp (so the BEDPE window `[166039935,166040217)` is exactly the element), and about 93% identical to an AluY consensus typed from memory. ("AluA"/"AluB" are this note's labels for two copies, not Alu subfamily names.) Subfamily assignment needs RepeatMasker `[verify]`.
- Junction (+ strand): `…CAAGCTGCTGTTC|CACCATGTTAGGCAGGATGGTCTCGATCTCC…`. The right side is Alu sequence.
- Other near-identical Alus in the slice:
  - `AluA`: 166,019,922-166,020,209 (−, 93%), inside the deleted segment;
  - 166,071,609-166,071,894 (+, 93%, intron 4), the target of the spurious `BND_2`.
- Consequence: exon 16 is spliced to exon 21, and the frameshift is p.(Val806Alafs*24) [computed by translation; verify with VEP or Mutalyzer].
- Contrast: losing only exons 17-19 is in-frame, p.(Val806_Glu1143del), 338 aa.

**SNPs used** [verified: dbSNP138 VCF in the Broad bucket]:
- **rs2298771**, `chr2:166,036,278 C>T`, exon 19.
  - Missense, CAF REF 0.2144 / ALT 0.7856.
  - In MANE terms it is NM_001165963.4:c.3199G>A p.(Ala1067Thr) [computed]. GRCh38 carries **Ala**, the minor allele. The literature's "T1067A" names the major allele first `[from memory - verify]`.
- **rs6432860**, `chr2:166,041,354 A>G`, exon 16.
  - Synonymous, same CAF; c.2292T>C p.(Val764=) [computed].
- Neither of the two candidate de novo positions (166,009,887; 166,204,022) is in dbSNP138 [verified]. dbSNP138 dates from 2013: newer dbSNP builds or gnomAD may list variants at these positions, so the course should say "absent from dbSNP138", not "novel" `[not checked against current releases]`.

**SCN9A** (de novo SNV host):
- ENSG00000169432.19, `chr2:166,195,185-166,376,001` (−).
- MANE ENST00000642356.2 = NM_001365536.1 [verified], 27 exons, 1,988 aa [computed].
- DN-1 = `chr2:166,204,022 G>A` = c.4707C>T p.(Leu1569=), in exon 26 [computed].

**Contig.** `chr2` length 242,193,529, M5 `f98db672eb0993dcfdabafe2a882905c` [verified: `@SQ` line in the Broad interval_list; `.fai`].

**Real capture targets.** The Twist Alliance Clinical Research Exome targets (Broad's interval_list conversion) for SCN1A equal the MANE CDS segments exactly. Exceptions:
- the extra 5N target;
- a 38-bp-longer exon-28 target (165,994,108-165,994,416);
- the coding part of exon 29 (165,991,245-165,992,422).

The UTR exons 1-3 are **not** targeted [verified]. Do not redistribute the vendor file. Derive the targets from GENCODE instead (§3.7).

### 3.5 Data inventory (canonical file names)

| Stage | File | Format | Key content (real coordinates) | Lesson |
|---|---|---|---|---|
| ref | `Homo_sapiens_assembly38.fasta` (+`.fai`, `.dict`) | FASTA | 3,366 sequences (see `sequences.md`). The course shows `chr2` slices | FASTA |
| A | `P042-{proband,mother,father}_S{1,2,3}_L001_R{1,2}_001.fastq.gz` | FASTQ | Phred+33, 2×150, about 60 M pairs each [illustrative] | FASTQ |
| A | `exome_targets_GRCh38.bed`; `calling_regions_pad100.bed` | BED | SCN1A targets `SCN1A_e4`…`SCN1A_e29` + `SCN1A_e5N`; ±100-bp padded calling intervals | BED |
| A | `P042-*.cram` (+`.crai`); one `.bam` (+`.bai`) | SAM/BAM/CRAM | `@RG SM:P042-proband`; reads over exons 16-21; MAPQ examples | SAM/BAM/CRAM |
| B | `P042-*.depth.wig` (fixedStep, 20-bp bins over targets); `P042-trio.ratio.bedGraph` | WIG / bedGraph | Dip at exons 17-20 (proband only); exon 25 low in all | WIG |
| A | `P042-*.g.vcf.gz` (+`.tbi`) | gVCF | Father's block at 166,009,870-166,009,902, GQ 12, MIN_DP 5. Proband's exon-19 block DP 59 vs about 118 in exon 16 | gVCF |
| A/B | `P042.trio.vcf.gz` (+`.tbi`); `P042.trio.cnv.vcf.gz` | VCF | DN-1, DN-2, rs2298771, rs6432860; exome `<DEL>` with SVCLAIM=D | VCF |
| E | `SCN1A_SCN9A.MANE.gtf`; `SCN1A.MANE.gff3` | GTF/GFF3 | GENCODE v43 lines, MANE transcripts only | GTF/GFF3 |
| C | `P042-proband.sv.bedpe` | BEDPE | `DEL_1`, `BND_2` | BEDPE |
| D | `P042-proband.hifi.paf`; `P042-proband.hifi.bam` | PAF, SAM | Split reads (2 lines) vs reference-like reads (1 line) | PAF |
| D | `P042_locus.gfa` (GFA 1.1 with W lines); `P042_locus.rgfa` | GFA | Deletion bubble + 2 SNP bubbles; illustrative panel haplotypes | GFA |
| — | `P042_case/` (capstone) | mixed | 14 files: 9 with planted defects, 1 valid but unusable here (§5a) | Capstone |

### 3.6 Annotated minimal VALID example: one deletion, every notation

Separators: every non-comment line below is **TAB-delimited** except the HGVS lines, which are plain text. Comment lines starting with `#` are labels, not file content.

```
# BED (0-based, half-open): the deleted bases, left-aligned
chr2	166014902	166040115	DEL_P042_1
# VCF 4.5, proband column only (POS = retained anchor base C; the deletion starts at POS+1)
chr2	166014902	DEL_P042_1	C	<DEL>	.	PASS	SVLEN=25213;SVCLAIM=DJ;CIPOS=0,7;HOMLEN=7;HOMSEQ=CACCATG	GT	0/1
# BEDPE (course convention, §4): window 1 around POS, window 2 around END = POS+SVLEN
chr2	166014901	166014909	chr2	166040114	166040122	DEL_P042_1	60	+	-	DEL	SOURCE=HiFi
# SAM: short-read split read. 96M ends on 166,014,902; the SA part starts on 166,040,116
LH00417:42:22GTW5LT3:2:1203:15410:22045	97	chr2	166014807	60	96M54S	=	166040297	25640	*	*	SA:Z:chr2,166040116,+,96S54M,0,1;	MC:Z:150M
# PAF: one HiFi read from the paternal haplotype gives two lines
m84046_250901_134502_s2/71435521/ccs	17842	0	8964	+	chr2	242193529	166005938	166014902	8955	8966	60	tp:A:P	NM:i:11
m84046_250901_134502_s2/71435521/ccs	17842	8964	17842	+	chr2	242193529	166040115	166048993	8869	8880	60	tp:A:P	NM:i:11
# GFA 1.1 / rGFA: the deletion is one extra link between rank-0 segments
S	s1	*	LN:i:500	SN:Z:chr2	SO:i:166014402	SR:i:0
S	s6	*	LN:i:1238	SN:Z:chr2	SO:i:166040115	SR:i:0
L	s1	+	s6	+	0M
# HGVS (text, not a file format)
NC_000002.12:g.166014910_166040122del            (3'-shifted on the + strand)
NM_001165963.4:c.2416-519_3550+704del            (3'-shifted in transcript direction = left-most genomic)
NM_001165963.4:c.(2415+1_2416-1)_(3550+1_3551-1)del   (exome-level call, breakpoints unknown)
NP_001159435.1:p.(Val806Alafs*24)                (predicted)
```

**Annotations.**
- **166014902 appears five times**: as the BED start, the VCF POS, the PAF target end of block 1, the last base of `96M`, and `SO+LN` of `s1`. Half-open intervals and the VCF anchor base meet at the same integer.
- **The right end** is `166040115`. That is the BED end, POS+SVLEN, the PAF target start of block 2 and the `SO` of `s6`. The SAM `SA` position is `166040116` because SAM POS is 1-based.
- **The PAF query is continuous** (8964 → 8964) while the target jumps 25,213 bp: a clean deletion with no inserted bases. NM = col11 − col10 = 11 (PAF-M09).
- **SVCLAIM=DJ** says depth *and* junction evidence. It is required for `<DEL>` in VCF 4.5 [verified: VCFv4.5 §3, SVCLAIM]. `CIPOS=0,7` together with `HOMSEQ` encodes the microhomology, as the spec instructs ("CIPOS should be used in conjunction with HOMSEQ") [verified]. There is no `CIEND`: VCF 4.5 says "If CIEND is missing, it is assumed to match CIPOS" [verified], which is why BEDPE window 2 is also 0..+7 around END.
- **By-construction placement, not aligner output.** The SAM and PAF lines put the cut at the left-aligned placement. Real aligners usually extend each piece through the 7 identical bases, so a BWA-style record would more likely read `103M47S` with `SA` `96S54M`, and minimap2's two PAF blocks may overlap by up to 7 query bases instead of meeting at 0. Both are equally correct. Cross-file checks (CASE-07) must therefore accept any of the 8 placements, not only the left-aligned one.

### 3.7 Example-data strategy (generator)

**Recommendation.** Use a **hybrid**: a real GRCh38 slice plus real GENCODE models for the case, and tiny synthetic `toy` contigs for concept drills (ruler, Phred, FLAG). A deterministic TypeScript generator runs offline from committed fixtures.

**Authenticity vs feasibility.**
- **A real slice wins on authenticity.**
  - Learners can paste any coordinate into a genome browser and see the exon.
  - The Alu, the microhomology, the codons and the SNP alleles are genuine.
  - MANE IDs, phases and HGVS are checkable.
- **The costs are manageable.**
  - Provenance and licensing notes: GRCh38 and dbSNP are public NCBI/GRC data, and GENCODE is freely available `[from memory - verify terms]`.
  - Large coordinates can make drills harder to read, which is why toy contigs remain for concept drills.
  - A 400-kb fixture (about 0.4 MB).
- **A purely synthetic mini-reference** is simpler and fully controllable. But it cannot use MANE, rsIDs or real exon structure, and it invites implausible biology. Use it for drills only.

**A real slice could be fetched from this sandbox.**
- `storage.googleapis.com` is reachable even though Ensembl, UCSC and NCBI are not. Procedure:
  1. Read the `chr2` line of `Homo_sapiens_assembly38.fasta.fai` in `gs://gcp-public-data--broad-references/hg38/v0/`: offset **251,446,211**, 100 bases per line, 101 bytes per line.
  2. Compute `byte(p) = 251446211 + ⌊(p−1)/100⌋·101 + (p−1) mod 100`.
  3. Request that byte range with an HTTP `Range` header and strip the newlines.
- Fetched here:
  - `chr2:165,980,001-166,150,000`: MD5 of the bare uppercase string `d0418b8e69260dafd2133fc10e22f977`;
  - `chr2:166,150,001-166,380,000`: `aba6f448e834f5ca6eb8e5464bbb5fdd`.
- Cross-check: the same 170 kb fetched from GENCODE's `GRCh38.primary_assembly.genome.fa` in the same bucket (offset 253,105,712; 60 bases per line, 61 bytes per line) was **identical**. Neither file is soft-masked.
- Annotation: GENCODE v43 GTF lines came from the Funcotator bundle by a range-request binary search. The GTF is sorted by contig then start.
- rsIDs came from `Homo_sapiens_assembly38.dbsnp138.vcf.gz` by a remote tabix query: parse `.tbi`, then range-read the BGZF blocks.

**Repo layout (proposal).**
- **`scripts/fetch-fixtures.ts`** (manual, needs network):
  - writes `fixtures/grch38/chr2_165980001-166380000.fa` with header `>chr2:165980001-166380000`;
  - writes `fixtures/gencode/v43.SCN1A_SCN9A.MANE.gtf`;
  - writes `fixtures/dbsnp/sites.tsv`;
  - writes `fixtures/PROVENANCE.md` (URLs, byte ranges, MD5/SHA-256, date);
  - **fails if any MD5 differs**.
  - For maintainers with full access, prefer official GENCODE and MANE downloads, pinned to one release. Keep ENST00000674923.1 if later releases keep it `[verify at build]`.
- **`scripts/generate-case.ts`** (offline, `pnpm gen:case`, seeded PRNG such as `sfc32("P042")`):
  1. `truth.ts`: six haplotypes as edit lists over the slice (§3.2).
  2. Read simulators: exome fragments over targets ±200 bp, WGS pairs, and HiFi reads. Use Q-binned NovaSeq-style qualities and a HiFi error rate of about 0.1%. Simulate **only reads at the locus**; library-wide totals ("61,284,112 pairs") are metadata.
  3. Alignment *by construction* instead of an aligner. Origin is known, so CIGAR, SA and NM are exact. MAPQ follows rules: segments shorter than 70 bp that lie inside an Alu get MAPQ 0.
  4. Callers:
     - depth → WIG/bedGraph;
     - binomial genotype likelihoods → PL/GQ;
     - GQ-banded gVCF blocks;
     - merge → joint VCF;
     - evidence clustering → BEDPE;
     - HiFi placement → PAF;
     - haplotype walks → GFA.
  5. `defects.ts`: produces the capstone copies plus `defects.json` (file, rule ID, line, byte).
  6. Output: small TS modules of display snippets (≤ about 300 KB embedded in the single HTML) and the capstone folder (offered as an in-page "virtual folder"; no file loading in v1).
- **Tests (`vp test`).**
  - Every valid output passes the in-browser validators.
  - Every planted defect fails with exactly the expected rule ID.
  - Snapshots guarantee determinism.
  - Optional CI job in a container with real tools (versions pinned):
    - `samtools quickcheck`;
    - `bcftools norm --check-ref e`;
    - `bedtools`;
    - `gfatools stat`;
    - `minimap2 -x map-hifi` on the simulated HiFi reads, comparing its PAF with ours.

## 4. Coordinate system and conventions

**Crosswalk for the deletion** (left-aligned placement unless stated):

| Notation | Convention | Left end | Right end |
|---|---|---|---|
| Truth / HGVS-style | 1-based closed | 166,014,903 (first deleted) | 166,040,115 (last deleted) |
| BED | 0-based half-open | start `166014902` | end `166040115` |
| VCF `<DEL>` | 1-based POS = anchor | POS `166014902` (C, retained) | POS+SVLEN = `166040115` |
| SAM split read | 1-based | `96M` ends at 166,014,902 | `SA` POS 166,040,116 (first retained) |
| BEDPE (course) | 0-based windows | `[166014901,166014909)` | `[166040114,166040122)` |
| PAF | 0-based half-open | tend `166014902` | tstart `166040115` |
| rGFA | 0-based `SO` | `s1`: SO 166014402 + LN 500 | `s6`: SO 166040115 |
| GTF/GFF3 | 1-based closed | exon 20 is 166015607-166015727 (retained flank exon 21 is 166013744-166013898) | exon 17 is 166039423-166039596 |
| WIG | 1-based `start=` | dip begins at the exon-20 block `start=166015607` | ends after the exon-17 block |
| HGVS g. | 3′ rule | 166,014,910 | 166,040,122 |

**Further conventions.**
- **The BEDPE window convention is a course decision.** The BEDPE spec defines only "start/end of the first/second end" [verified: bedtools general-usage]. The course derives windows from VCF: `[POS−1+CIPOS₀, POS+CIPOS₁)` and `[END−1+CIEND₀, END+CIEND₁)` with `END = POS+SVLEN`. This mirrors `svtools vcftobedpe` `[from memory - verify]`. For the precise (HiFi-derived) call, as in EX-08, validators accept any window ≤ 50 bp that contains the defining base. Imprecise short-read calls legitimately have wider windows (`DEL_1` side 2 is 282 bp), so the ≤ 50-bp check must not run on the capstone BEDPE: there, F10 must fail only on BEDPE-S01.
- **Minus strand.**
  - c. numbering increases as genomic coordinates *decrease*.
  - `exon_number 1` is at the highest coordinate [verified: GENCODE v43].
  - The higher genomic end of the deletion (166,040,115) is its **5′ end** in the transcript.
- **Normalization directions.**
  - VCF normalization left-aligns.
  - HGVS g. shifts 3′ on the + strand, to the *right*.
  - HGVS c. shifts 3′ along the transcript, which for this minus-strand gene is *left* on the genome. So the VCF and c. placements coincide, while g. differs by 7 bp.
- **Two exon numberings.** MANE `exon_number` 17-20 = legacy coding exons 14-17. The exon-5A/5N alternative changes legacy exon content but not the count.
- **Reference ≠ normal.** At rs2298771 the GRCh38 base is the minor allele (21%). `1/1` there is the commonest genotype.
- **Contigs and build.**
  - Everything uses `chr2`, length 242,193,529. GRCh37 `chr2` is 243,199,373 `[from memory - verify]`.
  - FASTA slices are named in samtools region style (`chr2:165980001-166380000`), so an alignment or CRAM against `chr2` cannot be decoded with them.
- **Sorting, compression and indexes.**
  - Exon lists copied in transcript order are *descending* and must be sorted before BED, tabix or bedtools `-sorted` use.
  - `.vcf.gz`, `.g.vcf.gz` and `.bed.gz` are BGZF + `.tbi`.
  - BAM has `.bai`; CRAM has `.crai`.
  - PAF and GFA are plain text; GFA stays unindexed in v1.

## 5. Validity rules: planted defects and cross-file checks

### 5a. Capstone folder `P042_case/`: per-file status and planted defect

Rule IDs refer to the other research notes. Levels: E = error, W = warning, C = convention.

| ID | File | True format | Status | Planted defect (how to detect) | Rule | Level |
|---|---|---|---|---|---|---|
| CASE-F01 | `ref/chr2_SCN1A_region.fa` + `.fai` | FASTA | valid (control) | Slice named `chr2:165980001-166380000`, 400,000 bp; `.fai` consistent | — | — |
| CASE-F02 | `fastq/P042-mother_S2_L001_R2_001.fastq.gz` | FASTQ | **invalid** | Last record ends after the `+` line, with no quality line; `gzip -t` fails | FQ-S06 | E |
| CASE-F03 | `capture/exome_targets_GRCh38.bed` | BED | **invalid (subtle)** | Starts copied from the 1-based interval_list (`166041231` instead of `166041230`); leading `track` line | CASE-03, BED-S17 | E / E (strict BEDv1 §5: "valid BED files must not have any browser or track lines"; bedtools and UCSC still accept it) |
| CASE-F04 | `bam/P042-father.bam` | BAM | **invalid** | Missing the 28-byte BGZF EOF block (copy truncated at a block boundary) | BAM-S03 | E (course). The spec says the marker "should be written" and its absence "should trigger a warning or error" (SAMv1 §4.1.2) |
| CASE-F05 | `cram/P042-proband.cram` + `.crai` | CRAM 3.1 | valid, **undecodable here** | `@SQ SN:chr2 M5:f98db672…`; the folder only has the slice FASTA, so a full GRCh38 is needed | CRAM-M02, CASE-02 | E (pipeline) |
| CASE-F06 | `coverage/P042-proband.depth.wig` | WIG | valid (control) | Shows the dip | — | — |
| CASE-F07 | `vcf/P042-father.g.vcf.gz` + `.tbi` | gVCF | valid (control) | Contains the GQ-12 block at 166,009,870-166,009,902 | — | — |
| CASE-F08 | `vcf/P042-proband.g.vcf.gz` | gVCF | **invalid as `.gz`** | Plain gzip: FLG byte lacks FEXTRA (`0x04`), e.g. `1f 8b 08 08` from `gzip file` or `1f 8b 08 00` from a stream, so there is no BGZF `BC` extra field; cannot be indexed | VCF-C02, CASE-09 | E (tooling) |
| CASE-F09 | `vcf/P042.trio.vcf.gz` + `.tbi` | VCF | **invalid (subtle)** | `##contig=<ID=chr2,length=243199373>`, the GRCh37 length, against GRCh38 data | VCF-M15, CASE-01 | E |
| CASE-F10 | `sv/P042-proband.sv.bedpe` | BEDPE | **invalid** | `BND_2` line has 9 columns (`strand2` missing) | BEDPE-S01 | E |
| CASE-F11 | `annotation/SCN1A_SCN9A.MANE.gtf` | GTF | valid (control) | GENCODE v43 lines | — | — |
| CASE-F12 | `annotation/SCN1A.MANE.gff3` | GFF3 | **invalid (subtle)** | Exon-21 CDS phase `0` instead of `2`. The phase chain breaks, and the error would wrongly make the 17-20 deletion look in-frame | GFF3-M08 (GTF-M06 is the GTF twin), CASE-11 | E |
| CASE-F13 | `longread/P042-proband.hifi.txt` | **PAF** (misleading extension) | **invalid** | One line has col 10 > col 11 (`8966	8955`) | PAF-M03 | E |
| CASE-F14 | `graph/P042_locus.gfa` | GFA 1.1 | **invalid** | `L	s1	+	s6	+	0M` removed, so the `P042-proband` hap-2 walk `>s1>s6>s8>s9` is not supported | GFA-M09 | E |

### 5b. Cross-file consistency checks

| ID | Check | Source of the rule | Example violation | Level | Status in the folder |
|---|---|---|---|---|---|
| CASE-01 | Every declared `chr2` length is 242,193,529: `.fai`, `@SQ LN`, `##contig`, PAF col 7 | SAMv1 §1.3 `@SQ`; VCF §1.4.7; PAF col 7 | `##contig=<ID=chr2,length=243199373>` | E | violated (F09) |
| CASE-02 | The CRAM's reference is available: some FASTA sequence has the `@SQ` name and M5 | CRAMv3 (reference MD5) | slice `chr2:165980001-166380000` ≠ `chr2` | E | violated (F05) |
| CASE-03 | BED target = GTF CDS: `start = GTF start − 1`, `end = GTF end`. In the last coding exon compare with CDS + `stop_codon` (the GTF CDS line excludes the stop; the target `165991244-165992422` includes it). Skip `SCN1A_e5N`, which has no MANE CDS line | BEDv1 0-based; GTF 1-based | `chr2	166041231	166041469` vs GTF 166041231-166041469 | E | violated (F03) |
| CASE-04 | Sample IDs agree across FASTQ names, `@RG SM`, VCF columns, PED | VCF §1.4.9 (PEDIGREE) | `SM:P042-mother` inside `P042-father.bam` | E | passes |
| CASE-05 | VCF and gVCF REF equals the FASTA at POS | VCF §1.6.1 (REF) | `chr2	166204022	.	T	A` (GRCh38 has G) | E | passes |
| CASE-06 | Targets with ratio ≈ 0.5 lie inside the deletion; targets with ratio ≈ 1 lie outside | biological consistency | the exon-21 target dipping too would contradict the breakpoints | W | passes |
| CASE-07 | Breakpoints agree: VCF POS (+CIPOS) ⊂ BEDPE window 1; END ⊂ window 2; PAF tend/tstart and GFA `SO`s match | §4 crosswalk | PAF block 2 starts at 166,040,215 | E | passes |
| CASE-08 | Every Mendelian error is explained (inside a called deletion) or flagged | trio logic | an error at rs6432860 would contradict a paternal deletion ending at 166,040,115 | W | passes |
| CASE-09 | Every `.gz` that needs random access is BGZF with a fresh index | SAMv1 §4.1 (BGZF); tabix | F08 | E | violated (F08) |
| CASE-10 | gVCF blocks are contiguous and non-overlapping over the padded targets | gVCF semantics | `END=166009902` followed by `POS 166009900` | E | passes |
| CASE-11 | CDS phases chain: `phase₍ₖ₊₁₎ = (3 − ((lenₖ − phaseₖ) mod 3)) mod 3` in transcript order, where lenₖ is the CDS segment length, not the exon length (they differ in exons 4 and 29) | GFF3/GTF phase definition | F12 | E | violated (F12) |
| CASE-12 | GFA rank-0 segment sequence equals FASTA[`SO`, `SO`+LN); each walk step has a 0M link | rGFA.md; GFA1 W-line | F14 | E | violated (F14) |
| CASE-13 | PAF internal arithmetic: col10 ≤ col11; start < end ≤ length | PAF.md | F13 | E | violated (F13) |
| CASE-14 | Containers are complete: gzip integrity; BGZF EOF block | SAMv1 §4.1.2 | F02, F04 | E | violated |

### 5c. Conventions the case follows (not spec requirements)

- **Report on MANE Select** (`tag "MANE_Select"`) and cite its version (C).
- **Use the 3′ rule for HGVS** and left-align VCF (C).
- **BEDPE windows follow the course convention** (C).
- **File names:**
  - `.g.vcf.gz` for gVCF;
  - Illumina `_S{n}_L00{n}_R{1,2}_001.fastq.gz`;
  - PacBio `m…/ZMW/ccs` read names `[from memory - verify]`;
  - hifiasm-style contig names `h1tg000071l` `[from memory - verify]` (C).
- **Use `chr`-prefixed contigs** throughout (C).

## 6. Recognition cues (case folder)

| File | First bytes or first line | Distinguish from |
|---|---|---|
| FASTA | `>chr2:165980001-166380000` then sequence lines | FASTQ (no `+` line every 4th line) |
| FASTQ.gz | gunzip → `@LH00417:42:…` / bases / `+` / qualities | FASTA; SAM (no tabs) |
| BED | `track …` then `chr2	166041231	166041469	SCN1A_e16` | interval_list (`@HD`/`@SQ` header, 1-based, 5 columns with `+`); bedGraph (4th column numeric) |
| BAM | `1f 8b 08 04 … 42 43 02 00` (BGZF); decompressed `BAM\1` [verified: SAMv1] | CRAM (`CRAM` + `03 01`) [verified: CRAMv3 §6]; plain `.gz` (FLG byte without `0x04`, e.g. `1f 8b 08 08` or `1f 8b 08 00`) |
| WIG | `fixedStep chrom=chr2 start=166041231 step=20 span=20` then bare numbers | bedGraph (4 columns); bigWig (binary `26 FC 8F 88`, see `intervals-signals.md`) |
| gVCF | `##fileformat=VCFv4.2` … `<NON_REF>` alleles with `END=` | plain VCF (no reference blocks) |
| VCF | `##fileformat=VCFv4.x`; a `#CHROM` line with ≥ 1 sample | gVCF; BCF (binary `BCF\2`) |
| BEDPE | 10 TAB columns, two chrom/start/end triplets, then `+ -` | BED12 (one chrom) |
| GTF | 9 columns; column 9 `gene_id "…"; transcript_id "…";` | GFF3 (`##gff-version 3`, `key=value`) |
| PAF (as `.txt`) | ≥ 12 columns: name, length, start, end, `+`/`-`, target, length… `tp:A:P` | BEDPE (no strand in col 5); SAM (`@` header, FLAG) |
| GFA | `H	VN:Z:1.1`; `S`/`L`/`W` lines | GAF (PAF-like, with a `>s1>s6` path in col 6) |
| `.tbi` / `.bai` / `.crai` | `.tbi`: BGZF, decompressing to `TBI\1` [verified: tabix spec]. `.bai`: **uncompressed** binary starting `BAI\1` [magic verified: SAMv1 §5.2, which, unlike tabix.tex, specifies no BGZF wrapper; "uncompressed" from memory - verify with `xxd`]. `.crai`: gzipped TAB-delimited text [verified: CRAMv3 §12] | — |

## 7. Common misconceptions and pitfalls (as they appear in the case)

1. **"A negative de novo filter means no de novo event."** The filter `child het, parents hom-ref` sees SNVs and indels. Inside a heterozygous deletion the child looks *homozygous*, the opposite shape.
2. **"Low depth = deletion."** Compare against the sample's own mean and against the other samples. The father's raw 61× at exon 17 is normal for him (mean 63×). The proband's 58× is half of hers (116×). Exon 25 is low in all three, which points to a short-target artefact.
3. **"No het SNPs in a region means consanguinity or bad luck."** A run of apparent homozygosity confined to a few exons, together with half depth, means hemizygosity.
4. **"De novo means pathogenic."** DN-1 is a genuine de novo SNV, but it is synonymous and in SCN9A.
5. **"The gene in the right family is the answer."** SCN9A and SCN1A are paralogs 46 kb apart on the same strand. Check `gene_name` in the GTF, not the neighbourhood.
6. **"A candidate in the right gene is evidence."** DN-2 is in SCN1A, but the father's GQ 12 cannot exclude inheritance. The truth: it is inherited.
7. **"Exon 17 is exon 17."** MANE exon 17 = legacy exon 14. Always quote the transcript.
8. **"In-frame means harmless; frameshift means certain."** Exons 17-19 alone would be in-frame (338 aa lost) and still likely damaging. NMD prediction depends on where the premature stop falls (rules of thumb: not in the last exon, and more than about 50-55 nt upstream of the last junction) `[from memory - verify]`.
9. **"POS is where the deletion starts."** For symbolic SVs, POS is the base *before* the event.
10. **"A breakpoint has one coordinate."** Microhomology gives 8 equivalent placements. VCF, HGVS g. and HGVS c. pick different ones legitimately.
11. **"MAPQ 0 means the read is wrong."** It means the placement is ambiguous. That is exactly why the Alu side of `DEL_1` is a 282-bp window, and why `BND_2` is probably an artefact.
12. **"Long reads are always right."** The PAF's col 10 ≤ col 11 and the coordinate arithmetic still need checking (F13). A walk without its link is still invalid (F14).
13. **"The reference allele is the normal allele."** At rs2298771 GRCh38 carries the minor allele.
14. **"A valid file is a usable file."** The proband CRAM is valid but useless without the exact reference.

## 8. Exercise bank

**EX-01 · predict · "Whose allele is missing?"** (VCF lesson). The body lines are TAB-delimited.

```
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	P042-proband	P042-mother	P042-father
chr2	166036278	rs2298771	C	T	3519.2	PASS	AC=3;AN=6	GT:AD:DP:GQ	0/0:58,0:58:99	0/1:61,57:118:99	1/1:0,63:63:99
chr2	166041354	rs6432860	A	G	4210.7	PASS	AC=4;AN=6	GT:AD:DP:GQ	0/1:59,62:121:99	0/1:63,60:123:99	1/1:0,66:66:99
```

Commit first: which explanation fits best? (a) sample swap; (b) a paternal deletion covering 166,036,278 but not 166,041,354; (c) a de novo T→C back-mutation; (d) allele dropout from PCR.

**Answer:** (b).
- The father can only transmit T, yet the child shows only C, at half her usual depth (58 vs about 120).
- Five kb away the child is a balanced het at full depth, so the paternal chromosome is present there.
- A swap would cause errors genome-wide.
- A back-mutation would not halve the depth.
- Allele dropout does not fit balanced, full-depth calls next door.

**EX-02 · predict · raw vs normalized depth** (WIG lesson). WIG declaration lines use single spaces; values are one per line.

```
# P042-proband.depth.wig (sample mean target depth 116x)
fixedStep chrom=chr2 start=166041231 step=20 span=20
117
121
fixedStep chrom=chr2 start=166039423 step=20 span=20
57
60
# P042-father.depth.wig (sample mean target depth 63x)
fixedStep chrom=chr2 start=166041231 step=20 span=20
64
62
fixedStep chrom=chr2 start=166039423 step=20 span=20
61
63
```

Predict: does the father also carry a deletion of exon 17?

**Answer:** No.
- The father's exon-17 depth over his mean is 61/63 ≈ 0.97.
- The proband's is 58/116 ≈ 0.50.
- Raw depths look alike only because his library was shallower.

Follow-up: the exon-25 bins read 64 (proband), 66 (mother) and 35 (father). Depth over each sample's own mean is about 0.55 in **all three** (64/116, 66/121, 35/63). A drop that every sample shares belongs to the target (a short 54-bp exon captures poorly), not to one genome. Normalized against the other samples or a reference panel (the ratio track), each ratio is about 1.0, so it is a capture artefact, not a deletion.

**EX-03 · spot-the-error · targets converted from an interval_list** (BED lesson). Data lines are TAB-delimited. Click every faulty element.

```
track name="SCN1A targets" description="converted from interval_list"
chr2	166041231	166041469	SCN1A_e16
chr2	166039423	166039596	SCN1A_e17
chr2	166037776	166038132	SCN1A_e18
chr2	166036048	166036530	SCN1A_e19
```

**Answers:**
1. Every start (column 2) is 1-based. The GTF says exon 16 starts at 166,041,231, so the BED start must be `166041230` (CASE-03).
2. The lines descend (transcript order on the minus strand), so the file is unsorted for tabix and `bedtools -sorted`. This is a recommended-practice warning, not a validity error: BEDv1 §3.4 says BED files "should be sorted".
3. The `track` line makes this a strict-BED violation (BED-S17, error under strict BEDv1 §5, "valid BED files must not have any browser or track lines"; bedtools and UCSC tolerate it).

**EX-04 · sort · "keep or reject?"** (gVCF → VCF lesson). Lines are TAB-delimited. Bins: *Keep as de novo* / *Reject: parental evidence too weak* / *Keep, but cannot explain the phenotype*.

```
chr2	166009887	.	C	T	212.6	PASS	AC=1;AN=6	GT:AD:DP:GQ	0/1:14,12:26:99	0/0:31,0:31:90	0/0:5,0:5:12
chr2	166204022	.	G	A	1388.2	PASS	AC=1;AN=6	GT:AD:DP:GQ	0/1:52,47:99:99	0/0:104,0:104:99	0/0:58,0:58:99
# father's gVCF around the first site
chr2	166009842	.	C	<NON_REF>	.	.	END=166009869	GT:DP:GQ:MIN_DP:PL	0/0:21:54:18:0,54,810
chr2	166009870	.	T	<NON_REF>	.	.	END=166009902	GT:DP:GQ:MIN_DP:PL	0/0:6:12:5:0,12,135
```

**Answers:**
- Line 1 → *reject*. The father's block gives GQ 12 and MIN_DP 5; with 5 reads a het is missed 1 time in 32.
- Line 2 → *keep, cannot explain*. The GTF lesson shows it is SCN9A c.4707C>T p.(Leu1569=).

**EX-05 · simulator · exon-frame calculator** (GTF lesson). The table holds real MANE exons 15-22 (lengths and phases from §3.4). The learner toggles exons and the tool reports removed nt, mod 3, and "phase of first deleted exon vs phase of first retained downstream exon".

Tasks and answers:
- (i) Exons 17-20: 1,135 nt, phase 0 vs 2 → **frameshift**, p.(Val806Alafs*24).
- (ii) Exons 17-19: 1,014 nt, phase 0 vs 0 → **in-frame**, p.(Val806_Glu1143del).
- (iii) The smallest frameshifting deletion that contains exon 19 → exons 19-20 (604 nt, mod 3 = 1).
- (iv) Exons 20-21 → in-frame (276 nt), even though each exon alone shifts the frame.

**EX-06 · field-explorer · two GTF lines** (GTF lesson). The first 8 columns are TAB-delimited; the attributes in column 9 are shortened from the real GENCODE v43 lines.

```
chr2	HAVANA	CDS	166015607	166015727	.	-	0	gene_id "ENSG00000144285.23"; transcript_id "ENST00000674923.1"; gene_name "SCN1A"; exon_number 20; tag "MANE_Select";
chr2	HAVANA	CDS	166013744	166013898	.	-	2	gene_id "ENSG00000144285.23"; transcript_id "ENST00000674923.1"; gene_name "SCN1A"; exon_number 21; tag "MANE_Select";
```

Hover targets: strand `-`; frame `2`; `exon_number` counted from the 5′ end at the highest coordinate.

Applied question: 121 − 0 = 121 ≡ 1 (mod 3). Why does exon 21 have phase 2? Because 2 bases must be consumed to finish the codon that exon 20 started.

**EX-07 · field-explorer + predict · a split read** (SAM lesson). TAB-delimited; SEQ and QUAL are elided as `*`.

```
LH00417:42:22GTW5LT3:2:1203:15410:22045	97	chr2	166014807	60	96M54S	=	166040297	25640	*	*	SA:Z:chr2,166040116,+,96S54M,0,1;	MC:Z:150M
```

Predict:
- (a) The last reference base of the primary alignment: **166,014,902**.
- (b) The deletion length implied by the `SA` part: 166,040,116 − 166,014,902 − 1 = **25,213**.
- (c) Why is the `SA` MAPQ 0? The 54 clipped bases are Alu sequence and match many genomic Alus equally well.
- (d) Why FLAG 97 and not 99? The pair is not "proper": TLEN 25,640 vs an insert of about 450.

**EX-08 · fix-it · VCF to BEDPE** (BEDPE lesson). The fields are TAB-delimited. Source record: `chr2	166014902	DEL_P042_1	C	<DEL>	.	PASS	SVLEN=25213;SVCLAIM=DJ;CIPOS=0,7;HOMLEN=7;HOMSEQ=CACCATG`.

Starter (invalid):

```
chr2	166014902	166014910	chr2	166040115	166040123	DEL_P042_1	60	+
```

Validator:
- exactly 10 columns here, because the task asks for both strands (BEDPE-S01 by itself also accepts 6, 7, 8 or more than 10; only 9 is ambiguous);
- strands `+ -`;
- `start1 ≤ 166014901 < end1`;
- `start2 ≤ 166040114 < end2`;
- windows ≤ 50 bp.

Accepted answer:

```
chr2	166014901	166014909	chr2	166040114	166040122	DEL_P042_1	60	+	-
```

Explanation: the starter forgot the "−1" on both sides and dropped `strand2`.

**EX-09 · predict · two PAF lines, one molecule** (PAF lesson). Use the two PAF lines from §3.6 plus this reference-like read:

```
m84046_250901_134502_s2/20185094/ccs	19307	0	19307	+	chr2	242193529	166025871	166045178	19288	19312	60	tp:A:P	NM:i:24
```

Predict:
- (a) Deleted reference bases: tstart₂ − tend₁ = **25,213**.
- (b) Inserted query bases: qstart₂ − qend₁ = **0**.
- (c) Is there an inversion? **No**; both blocks are `+`.
- (d) Which haplotype is the single-line read from? It aligns as one unbroken block from 166,025,872 (1-based) through the right breakpoint at 166,040,115 and on past rs2298771 and rs6432860. Those bases are *inside* the deletion, which the paternal haplotype lacks, so the read is from the **maternal** haplotype (C and A). It does not span the whole deleted region: it starts about 11 kb inside it.

**EX-10 · spot-the-error · the local graph** (GFA lesson). TAB-delimited. Click the line that makes the file invalid.

```
H	VN:Z:1.1
S	s1	*	LN:i:500	SN:Z:chr2	SO:i:166014402	SR:i:0
S	s2	*	LN:i:21375	SN:Z:chr2	SO:i:166014902	SR:i:0
S	s3	C	SN:Z:chr2	SO:i:166036277	SR:i:0
S	s4	T	SN:Z:PANEL01#1#ctg5	SO:i:21875	SR:i:1
S	s5	*	LN:i:3837	SN:Z:chr2	SO:i:166036278	SR:i:0
S	s6	*	LN:i:1238	SN:Z:chr2	SO:i:166040115	SR:i:0
S	s7	A	SN:Z:chr2	SO:i:166041353	SR:i:0
S	s8	G	SN:Z:PANEL01#1#ctg5	SO:i:26951	SR:i:1
S	s9	*	LN:i:500	SN:Z:chr2	SO:i:166041354	SR:i:0
L	s1	+	s2	+	0M
L	s2	+	s3	+	0M
L	s2	+	s4	+	0M
L	s3	+	s5	+	0M
L	s4	+	s5	+	0M
L	s5	+	s6	+	0M
L	s6	+	s7	+	0M
L	s6	+	s8	+	0M
L	s7	+	s9	+	0M
L	s8	+	s9	+	0M
W	GRCh38	0	chr2	166014402	166041854	>s1>s2>s3>s5>s6>s7>s9
W	PANEL01	1	ctg5	0	27452	>s1>s2>s4>s5>s6>s8>s9
W	P042-proband	1	h1tg000071l	20114	47566	>s1>s2>s3>s5>s6>s7>s9
W	P042-proband	2	h2tg000034l	8810	11049	>s1>s6>s8>s9
```

**Answer:** the last W line. `>s1>s6` needs `L	s1	+	s6	+	0M` (GFA-M09). That missing link *is* the deletion.

Follow-ups:
- Check that SeqEnd − SeqStart equals the walk length (2,239; 27,452).
- Check that `s1`'s `SO + LN` = 166,014,902.
- `PANEL01` is illustrative, not real HPRC data.

**EX-11 · sort · evidence board** (capstone warm-up). Bins: *supports a deletion of exons 17-20* / *neutral or explained otherwise* / *argues against*.

Items:
1. ratio 0.50 over the exon-17-20 targets;
2. panel-normalized ratio 1.0 at exon 25 despite low raw depth in all three samples;
3. Mendelian error at rs2298771;
4. balanced het at rs6432860;
5. SCN9A de novo synonymous;
6. `DEL_1` with SR=8, PE=14;
7. `BND_2` with MAPQ 0;
8. two-block PAF read with a 0-bp query gap;
9. only proband hap 2 uses `s1→s6`;
10. normal microarray at age 2.

**Answers:**
- Supports: 1, 3, 6, 8, 9. Item 4 also supports, because it bounds the deletion.
- Neutral: 2, 5, 7. Item 10 is neutral too: the deletion is below the array's resolution.
- Argues against: none.

**EX-12 · mcq (multi-select) · after the dip, which tests independently confirm it?**

Options and answers:
- MLPA for SCN1A ✓ (orthogonal dosage; exon-level).
- Short-read WGS ✓ (junction evidence plus depth).
- Long-read WGS ✓.
- Repeating the exome with the same kit ✗ (same capture biases).
- Re-analysing the parents' exomes only ✗ (does not test the child).

Explanation: MLPA confirms the dosage but not the breakpoints. The course follows the WGS → long-read path because the breakpoint sequence is needed for a parental junction assay.

**EX-13 · simulator · microhomology slider** (VCF/BEDPE read-more). The page shows `…GCTGCTGTTC[CACCATG]GTCAGATGAG… / …GACGGGGTTT[CACCATG]TTAGGCAGGA…`. The learner slides the cut and the tool shows the identical haplotype.

Questions and answers:
- How many placements are there? **8**.
- Which does VCF use? POS 166,014,902 with `CIPOS=0,7`.
- Which does HGVS g. use? 166,014,910-166,040,122.
- Which does HGVS c. use, for this minus-strand gene? c.2416-519_3550+704, the left-most genomic placement.

## 9. Quiz bank

**Q1.** The microarray at age 2 was normal. Best explanation?
- A) Arrays cannot detect deletions. *No: CNVs are what arrays detect.*
- **B) A 25-kb intragenic loss was below that platform's effective resolution.** *Yes: probe spacing and reporting thresholds. MLPA, exome depth or WGS resolve it.*
- C) The deletion arose after age 2. *No: a germline de novo deletion is present in every cell from conception.*
- D) Arrays only detect duplications. *No.*

**Q2.** Why did `GT[child]="het" && GT[parents]="RR"` miss the causal variant?
- A) It is not de novo. *No: parents are normal at the junction.*
- **B) Inside a heterozygous deletion the child appears homozygous, and the deletion itself is not an SNV record.** *Yes.*
- C) The GQ thresholds were too strict. *No: they removed DN-2, correctly.*
- D) The sample columns were misordered. *No: CASE-04 passes.*

**Q3.** `DEL_1` has window 1 = 28 bp but window 2 = 282 bp. Why?
- A) The caller pads the second end. *No.*
- **B) End 2 lies in an Alu; its split-read segments have MAPQ 0, so only the repeat's extent is certain.** *Yes.*
- C) The deletion is 282 bp long. *No: it is 25,213 bp.*
- D) BEDPE windows must differ. *No.*

**Q4 (multi-select).** Which MANE exon deletions preserve the SCN1A reading frame?
- A) 17-20. *No: 1,135 ≡ 1 (mod 3).*
- **B) 17-19.** *Yes: 1,014 ≡ 0.*
- **C) 20-21.** *Yes: 121 + 155 = 276 ≡ 0, although each exon alone would shift the frame.*
- D) 21 alone. *No: 155 ≡ 2, giving p.(Cys1185Ilefs*2) [computed].*

**Q5.** An older report says "deletion of SCN1A exons 14-17". The GTF says `exon_number` 17-20. Which is right?
- A) The report is wrong. *Not necessarily.*
- B) The GTF is wrong. *No.*
- **C) Both: legacy coding-exon numbering vs MANE numbering, which adds three 5′UTR exons. State the transcript.** *Yes.*
- D) They describe different deletions. *Check the coordinates; here they are the same.*

**Q6.** In the graph, every panel haplotype uses either `s3` or `s4`, and either `s7` or `s8`, but none uses `s1→s6`. Interpretation?
- **A) The SNP bubbles are common variation; the deletion edge is unique to the proband's hap 2.** *Yes (illustrative panel).*
- B) The deletion is common. *No.*
- C) The graph is invalid. *Only if the `s1→s6` link is missing (F14).*
- D) The SNPs are de novo. *No.*

**Q7.** The father is `1/1` at rs2298771. Is that abnormal?
- A) Yes: homozygous ALT. *No.*
- **B) No: ALT T is the major allele (about 79%); GRCh38 happens to carry the minor allele.** *Yes.*
- C) It shows the father carries the deletion. *No: his depth is normal.*
- D) It is a Mendelian error. *No: the error is in the child.*

**Q8.** `P042-proband.cram` will not decode with `ref/chr2_SCN1A_region.fa`. Classify the file.
- A) Invalid CRAM. *No: magic, structure and index are fine.*
- **B) Valid, but unusable without the reference whose `@SQ` name and M5 it records.** *Yes (CASE-02, CRAM-M02).*
- C) A BAM renamed. *No: the magic is `CRAM`, version 3.1.*
- D) Decodable after renaming the FASTA header to `chr2`. *No: the MD5 of a 400-kb slice ≠ the MD5 of chr2.*

**Q9.** Why did the team want the base-pair junction, not just "exons 17-20 deleted"?
- **A) To design a junction-specific assay to test the parents for low-level mosaicism, which informs recurrence-risk counselling, and to confirm no inversion or insertion.** *Yes.*
- B) To make the VCF valid. *No: imprecise SVs are valid with CIPOS.*
- C) To change the exon count. *No.*
- D) For HGVS aesthetics. *Partly, but not the main reason.*

## 10. Case-thread hooks

### 10.1 Beats per lesson (suggested 22-lesson map)

| # | Section · lesson | Case beat | Files / numbers | Cliffhanger |
|---|---|---|---|---|
| 1 | Foundations · What can break | Noa's vignette. SNV vs CNV vs SV; heterozygous loss in a dosage-sensitive gene | §3.1 | "Where do we even look?" |
| 2 | Foundations · Coordinates and strands | The minus strand. The same deletion has two ends with different names | §4 crosswalk (teaser) | — |
| 3 | Foundations · Why a trio | About 60-75 de novo SNVs per child; the search is for one | `foundations.md` | Quiz |
| 4 | FASTA · The reference | `chr2`, 242,193,529 bp, M5 `f98db672…`; a slice via `.fai` arithmetic | Analysis set | — |
| 5 | FASTA · Looking up a gene | Pull exon 19 and see codon 1067 `GCA` (Ala) | 166,036,048-530 | "GRCh38 has the minor allele?" |
| 6 | FASTQ · Three blood samples | Headers, Phred+33 | `P042-*` | — |
| 7 | FASTQ · Read-level QC | The mother's R2 is truncated (later F02) | — | Quiz |
| 8 | BED · What we looked at | Targets = CDS. UTR exons 1-3 are not captured; 5N is captured | Real targets; EX-03 | — |
| 9 | SAM · Placing reads | Reads on exons 16-21; MAPQ near the paralogs | — | — |
| 10 | BAM/CRAM · Archiving | CRAM 3.1 needs the exact FASTA (later F05) | — | — |
| 11 | SAM · Hard reads | Preview of a split read (EX-07) | — | Quiz |
| 12 | WIG · A dip | Ratio 0.50 at 4 targets; exon 25 is a decoy (EX-02) | — | "Deletion or artefact?" |
| 13 | gVCF · Proving absence | The father's GQ-12 block. The proband's exon-19 block DP 59 | EX-04 | — |
| 14 | VCF · Joint genotyping | Trio VCF; `AC=3;AN=6` | — | — |
| 15 | VCF · De novo filter and Mendel | DN-1 passes, DN-2 fails; the rs2298771 error (EX-01) | — | Quiz: "the filter found nothing useful, but something is there" |
| 16 | GTF/GFF3 · Gene models | DN-1 lands in SCN9A; MANE; exon numbering | EX-06 | — |
| 17 | GTF/GFF3 · Frame | Exons 17-20 → frameshift (EX-05) | — | Quiz: "if the breakpoints are intronic…" |
| 18 | BEDPE · Breakpoint pair | `DEL_1` plus a suspicious `BND_2` (EX-08) | — | "Alu: where exactly?" |
| 19 | PAF · One molecule | Two-block vs one-block reads (EX-09); paternal phase | — | — |
| 20 | GFA · Graphs | Bubbles, walks, stable coordinates (EX-10) | — | Quiz |
| 21 | Capstone · Case folder | 14 files, §5a/§5b | — | — |
| 22 | Capstone · Conclusion | Evidence board (EX-11); diagnosis; ethics recap; badge | — | — |

### 10.2 Reconciliation with the other notes

| Note | Placeholder | Canonical replacement |
|---|---|---|
| `alignments.md`, `intervals-signals.md` | Target T3 chr2:166,012,441-166,012,660; T1-T4 | Exon-named targets `SCN1A_e16`…`e21`. The dipped targets are e17 `166039422-166039596`, e18 `166037775-166038132`, e19 `166036047-166036530` and e20 `166015606-166015727` (BED) |
| `intervals-signals.md`, `variants.md`, `graphs.md` | `DEL_1` 368 bp at 166,012,370-166,012,738 | 25,213 bp: VCF POS 166,014,902, SVLEN 25213; BEDPE as in §3.6 (precise) or §3.5 `DEL_1` (short-read: `chr2	166014891	166014919	chr2	166039935	166040217	DEL_1	87	+	-	DEL	SR=8;PE=14`) |
| `variants.md` | De novo SNV chr2:166,009,959 C>T | DN-2 = chr2:166,009,887 C>T (c.3880-46G>A; it fails on the father's GQ). DN-1 = SCN9A chr2:166,204,022 G>A |
| `variants.md` (EX-08) | The child's "hemizygous `1/1`" | The child's hemizygous `0/0` at rs2298771 (father `1/1`), shown as a Mendelian error |
| `graphs.md` | Maternal-origin deletion on an inversion haplotype; parental long reads | Paternal origin; no real inversion (`BND_2` is an Alu mis-mapping artefact); proband-only HiFi with within-sample contrast (EX-09). The panel bubbles are the SNPs |
| `annotation.md` | "Make the dipped exon's length not divisible by 3" | Done: 1,135 nt over 4 exons; contrast 17-19 in-frame |

## 11. "Read more" candidates

- **Random access over HTTP.** The `.fai` byte formula plus `Range` requests is exactly what htslib does for remote files. It ties the FASTA lesson to the BGZF/index simulator.
- **SVCLAIM D/J/DJ (VCF 4.5).** The exome CNV is a `D` claim and the WGS/HiFi call is `DJ`. A VAF-only clue also counts as `D`. Exome record: `chr2	166015606	CNV_P042_1	C	<DEL>	.	PASS	IMPRECISE;SVLEN=23990;SVCLAIM=D;CIPOS=-1708,0;CIEND=0,1634	GT:CN	0/1:1	0/0:2	0/0:2`. The CI bounds equal the flanking introns.
- **Microhomology and the three placement rules** (EX-13). The 7-bp `CACCATG` suggests microhomology-mediated end joining `[from memory - verify mechanism claims]`.
- **Alus and short reads.** About a million copies, about 300 bp each. Why the split-read tail gets MAPQ 0 and can seed a fake inversion (`BND_2` into a + Alu in intron 4).
- **MANE Select** (one matched RefSeq/Ensembl transcript per gene, identical to GRCh38), and why it ended the "which transcript?" ambiguity `[from memory - verify definition]`.
- **Legacy numbering, 5A/5N and rs3812718.**
- **The reference carries the minor allele** at rs2298771. How often that happens genome-wide `[verify]`.
- **NMD rules of thumb** and why the premature stop in exon 21 of 29 is predicted to trigger it `[from memory - verify]`.
- **Exome CNV calling** with reference panels (normalization, GC and target-length effects; why the 54-bp exon 25 is noisy).
- **Parental mosaicism.** Roughly 5-13% of SCN1A families: de Lange 2019 cite 7-13% from earlier work and found 4 of 80 couples (5%) themselves `[search summary]`. Junction assays and counselling, without numbers presented as advice.
- **hifiasm and minigraph(-cactus) outputs.** Assembly GFA vs pangenome GFA with W lines vs rGFA `[from memory - verify tool output details]`.

## 12. Sources

**Read during this session (primary data and specs).**
- `https://storage.googleapis.com/gcp-public-data--broad-references/hg38/v0/Homo_sapiens_assembly38.fasta.fai`, plus byte ranges of `…/Homo_sapiens_assembly38.fasta` (GRCh38 analysis set; slices chr2:165,980,001-166,380,000).
- `…/hg38/v0/GRCh38.primary_assembly.genome.fa`: byte ranges (cross-check; GENCODE primary assembly FASTA).
- `…/hg38/v0/GRCh38_gencode.v27.refFlat.txt` (GENCODE v27 SCN1A transcripts).
- `…/funcotator/funcotator_dataSources.v1.8.hg38.20230908s/gencode/hg38/gencode.v43.annotation.REORDERED.gtf` (range reads) and `gencode.config` (states the origin `ftp.ebi.ac.uk/…/release_43/gencode.v43.annotation.gtf.gz`). GENCODE **v43**.
- `…/funcotator_dataSources.v1.8.hg38.20230908s/gencode_xrefseq/hg38/gencode_xrefseq_v110_38.tsv` (Ensembl 110 → RefSeq).
- `…/hg38/v0/Homo_sapiens_assembly38.dbsnp138.vcf.gz` + `.tbi` (dbSNP build 138; remote tabix).
- `…/hg38/v0/bge_TwistAllianceClinicalResearchExome_Covered_Targets_hg38.interval_list` and `.README.txt` (v1, July 2024 download).
- GCS JSON listing API for the bucket `gcp-public-data--broad-references`.
- `https://raw.githubusercontent.com/samtools/hts-specs/master/VCFv4.5.tex` (VCF 4.5: SVCLAIM, CIPOS/HOMSEQ, CNV, SV examples).
- `…/hts-specs/master/SAMv1.tex` (BGZF EOF, `BAM\1`, `BAI\1`).
- `…/hts-specs/master/SAMtags.tex` (`SA:Z`).
- `…/hts-specs/master/CRAMv3.tex` (file definition, `CRAM` 3.1).
- `…/hts-specs/master/tabix.tex` (`TBI\1`).
- `https://raw.githubusercontent.com/lh3/miniasm/master/PAF.md`.
- `https://raw.githubusercontent.com/lh3/minimap2/master/minimap2.1` (tags `tp`, `SA`, `cg`; `-Y`; presets).
- `https://raw.githubusercontent.com/GFA-spec/GFA-spec/master/GFA1.md` (S/L/W; W since v1.1).
- `https://raw.githubusercontent.com/lh3/gfatools/master/doc/rGFA.md` (SN/SO/SR; 0-based stable offsets).
- `https://raw.githubusercontent.com/arq5x/bedtools2/master/docs/content/general-usage.rst` (BEDPE).
- Sibling notes in `docs/research/` (rule IDs and existing hooks).

**Web-search snippets only** (target pages not readable here; treat as leads):
- Marini et al. 2009, Epilepsia, "SCN1A duplications and deletions detected in Dravet syndrome" (via `findanexpert.unimelb.edu.au/scholarlywork/313714…`, `cun.es/…/scn1a-duplications-and-deletions…`, `aesnet.org/abstractslisting/scn1a-deletions-and-duplications-detected-by-mlpa-in-dravet-syndrome`).
- de Lange et al. 2019, J Med Genet 56:75 (`jmg.bmj.com/content/56/2/75`).
- Case report of parental mosaicism with an SCN1A deletion (`ncbi.nlm.nih.gov/pmc/articles/PMC4810572/`).
- Drug-aggravation and treatment statements (`cdn.clinicaltrials.gov/large-docs/27/NCT02682927/Prot_000.pdf`, `doi.org/10.3390/jcm12072532`, `dovepress.com/article/download/16313`).
- ClinGen SCN1A dosage (`dosage.clinicalgenome.org/clingen_gene.cgi?sym=SCN1A`).

**Unreachable** (curl 403 via the proxy and/or WebFetch DNS failure):
- `rest.ensembl.org` and `grch38.rest.ensembl.org`;
- `api.genome.ucsc.edu`, `hgdownload.soe.ucsc.edu`;
- `eutils.ncbi.nlm.nih.gov`, `www.ncbi.nlm.nih.gov` (GeneReviews NBK1318), `pmc.ncbi.nlm.nih.gov`;
- `dosage.clinicalgenome.org`, `aesnet.org`, `link.springer.com`, `jmg.bmj.com`;
- `ftp.ebi.ac.uk` (GENCODE FTP), `mygene.info`, `www.encodeproject.org`.

Ensembl REST facts were therefore verified through GENCODE v43 and the Ensembl 110 xref table instead.

## Verification log

An independent adversarial fact-check ran on 2026-10-16. It re-fetched the primary data and specs itself rather than trusting the citations above:
- GRCh38 `chr2:165,980,001-166,380,000`, read by HTTP range from the Broad `Homo_sapiens_assembly38.fasta` and spot-checked against the GENCODE `GRCh38.primary_assembly.genome.fa`;
- the GENCODE v43 GTF (Funcotator bundle, range reads), `gencode.v43.pc_transcripts.fa`, and the Ensembl 110 xref TSV;
- dbSNP138 (remote tabix), the Twist interval_list, the GRCh38 `.dict`/`.fai` and the GRCh37 `.fai`;
- `VCFv4.5.tex`, `SAMv1.tex`, `SAMtags.tex`, `CRAMv3.tex`, `BEDv1.tex`, `tabix.tex`, `PAF.md`, `GFA1.md`, `rGFA.md`, bedtools `general-usage.rst` and `minimap2.1`.

**Corrections made** (claim → correction → source):

1. §3.4: AluB is "288 bp" → 282 bp. That is the length of its own coordinates 166,039,936-166,040,217, and it matches the 282-bp BEDPE window. Source: arithmetic; Smith-Waterman of the fetched slice against an AluY consensus (from memory): − strand, about 92.5% identity.
2. §3.4: 5N "used by 1 of 17 transcripts" → 1 of the 17 transcripts that carry an exon-5 alternative (16 use 5A). SCN1A has 25 transcripts in v43. Added the older name `IVS5-91G>A`, consistent at 166,052,943 + 91. Source: GENCODE v43 GTF; dbSNP138.
3. §3.3 stage C: "Side 1 is precise" → narrow (a 28-bp window). Source: the note's own `DEL_1` BEDPE line and Q3.
4. §1 BED row: "A variant outside them is invisible" → far outside, beyond the padding. DN-2 at c.3880-46 is intronic yet is called. Source: internal consistency.
5. §1 ethics: "the two named SNPs" → the named SNPs. rs3812718 is also used. Source: internal consistency.
6. §3.1 and §11: "Parental mosaicism about 7-13% (de Lange 2019)" → 7-13% is the range cited in that paper's background. Its own result is 4 of 80 couples (5%). Source: web-search summaries of the abstract; jmg.bmj.com unreachable.
7. EX-02 follow-up: "the [exon-25] ratio is about 1.0 in all three" contradicted the ratio defined in the same answer (depth / sample mean = 0.55 for 64/116, 66/121 and 35/63). → 0.55 in all three; about 1.0 only after cross-sample or panel normalization. EX-11 item 2 was reworded to match. Source: arithmetic.
8. EX-03 and CASE-F03: BED-S17 (`track` line) was a "warning" → error under strict BEDv1. §5 says "valid BED files must not have any browser or track lines". This now matches `intervals-signals.md` BED-S17. Descending order is relabelled a recommended-practice warning ("should be sorted", BEDv1 §3.4). Source: BEDv1.tex.
9. CASE-F04: noted that the spec level is SHOULD. The EOF marker "should be written" and its absence "should trigger a warning or error". E stays as the course level, as in `alignments.md` BAM-S03. Source: SAMv1 §4.1.2.
10. CASE-F08 and §6: plain gzip "bytes `1f 8b 08 00`" → the defining feature is the FLG byte without FEXTRA (0x04). `gzip file` usually writes `1f 8b 08 08`. Source: SAMv1 §4.1 (BGZF FLG = 4); RFC 1952 flag bits [from memory].
11. §6 index row: "BGZF → TBI\1 / BAI\1 / gzipped text" implied that `.bai` is BGZF → only `.tbi` is BGZF. `.bai` is a raw binary starting `BAI\1`, and `.crai` is gzipped text. Source: tabix.tex ("The index file is BGZF compressed"); SAMv1 §5.2; CRAMv3 §12.
12. CASE-F12: rule "GTF-M06 / GFF3 phase chain" → GFF3-M08 for the GFF3 file. CASE-11 now says len is the CDS-segment length. Source: `annotation.md` rule table.
13. EX-04: the father's first gVCF block had GQ 60 with PL `0,54,810` → GQ 54. A hom-ref GQ is the second-lowest PL. Source: GQ/PL definition; internal consistency.
14. EX-09 (d): "It spans the whole deleted region" was false. The read starts at 166,025,872, about 11 kb *inside* the deletion → it aligns through deleted bases, so it cannot be paternal. The keyed answer (maternal) is unchanged. Source: arithmetic on the PAF line.
15. §4 BEDPE convention: "Validators accept any window ≤ 50 bp" would also reject the canonical short-read `DEL_1` (282-bp window) and make F10 fail on two rules → scoped to precise calls (EX-08), and F10 must fail only on BEDPE-S01. EX-08's "10 columns (BEDPE-S01)" was clarified the same way: BEDPE-S01 alone accepts 6/7/8/10+. Source: bedtools general-usage.rst (columns 7-10 optional); `intervals-signals.md` BEDPE-S01.
16. CASE-03: added exceptions. The last coding exon's target includes the stop codon, which the GTF CDS line excludes, and `SCN1A_e5N` has no MANE CDS. Without them the check fails on the valid exon-29 target. Source: GENCODE v43 GTF; Twist interval_list.
17. §3.6: added two notes. First, the missing CIEND defaults to CIPOS (VCF 4.5: "If CIEND is missing, it is assumed to match CIPOS"), which justifies BEDPE window 2. Second, the SAM `96M54S` and the 0-bp PAF query gap are by-construction left-aligned placements; real aligners usually extend through the 7-bp microhomology, so CASE-07 must accept all 8 placements. Source: VCFv4.5.tex §3; minimap2.1.
18. §3.4: "not in dbSNP138" is now explicitly limited to that 2013 build. Source: dbSNP138 query; scope note.

**Re-verified and correct (no change):**
- **SCN1A gene and transcript.** Gene ID, HGNC, extent and strand. MANE transcript ID, tags, ENSP and CCDS; NM_001165963.4 / NP_001159435.1.
- **MANE exons.** All 29 exon coordinates, lengths, c. ranges and phases. Start and stop codons. CDS 6,030 nt, which translates to 2,009 aa with no internal stop and matches `pc_transcripts.fa`.
- **Legacy numbering.** Legacy exon = MANE − 3. ENST00000375405 has 26 exons, and its exon 11 is 33 nt shorter.
- **Introns and deletion.** All intron coordinates. The deletion: 25,213 bp, left-aligned (no further left shift), exactly 7 right shifts (`CACCATG`), and the junction and EX-13 context strings.
- **REF bases.** Every REF base used (166014902 C, 166015606 C, 166036278 C, 166041354 A, 166009887 C, 166204022 G, 166009842 C, 166009870 T; GFA s3 C, s7 A).
- **Consequences.**
  - p.(Val806Alafs*24); the stop falls in exon 21.
  - p.(Val806_Glu1143del): 338 aa, with no 3′ shift possible.
  - p.(Cys1185Ilefs*2).
  - In-frame 20-21 (276 nt); frameshift 19-20 (604 nt).
- **SNPs.**
  - rs2298771: c.3199G>A p.(Ala1067Thr), codon GCA, CAF 0.2144/0.7856.
  - rs6432860: c.2292T>C p.(Val764=), same CAF.
  - rs3812718 at 166,053,034 (+5 of the 5N donor).
- **De novo sites.**
  - DN-2: c.3880-46G>A.
  - DN-1: SCN9A c.4707C>T p.(Leu1569=) in exon 26. SCN9A has 27 exons and 1,988 aa (NM_001365536.1).
- **Paralog cluster.** Order and strands. The SCN1A-SCN9A gap is about 46 kb.
- **Reference files.**
  - chr2 length and M5; GRCh37 chr2 = 243,199,373; 3,366 sequences.
  - `.fai` offset 251,446,211 and the byte formula. GENCODE FASTA offset 253,105,712.
  - Both slice MD5s. Neither FASTA is soft-masked.
- **Twist targets.** The CDS match, with the stated exceptions (5N, exon-28 165,994,108, and exon 29 including the stop). UTR exons are untargeted.
- **Notation crosswalk.** Every BED/VCF/SAM/BEDPE/PAF/rGFA/HGVS coordinate in §3.6 and §4, including c.2416-519_3550+704 and g.166014910_166040122.
- **Arithmetic.** PAF arithmetic and NM = col11 − col10 for all three PAF lines. All GFA SO/LN/walk lengths. EX-10's only invalid line is the last W line, per GFA1 "Each consecutive pair of oriented segments must correspond to a 0-overlap link record".
- **VCF 4.5 rules.** SVCLAIM "must be specified" for DEL/DUP. The "indirect claims ... SNV variant allele frequency" quote. SVLEN is positive. END is deprecated. CIPOS must span 0. The CNV record's CIPOS/CIEND equal the flanking introns.
- **SAM/BAM/CRAM.** SAM FLAG 97, TLEN 25,640 and the SA syntax (SAMtags). BGZF/BAM/CRAM 3.1 magic bytes. minimap2 map-hifi `-g10k` makes the 25-kb gap split into two PAF blocks.
- **Answer keys.** Every remaining exercise and quiz answer key (EX-01, EX-05, EX-06, EX-07, EX-12, EX-13; Q1-Q9) has a correct keyed answer and wrong distractors.

**Could not verify** (sources unreachable or memory-only; left marked in the text):
- GeneReviews/ILAE clinical statements: sodium-channel-blocker aggravation; NSGC first-tier guideline.
- The ClinGen HI score of 3. ClinVar summaries show "sufficient evidence", consistent with it; dosage.clinicalgenome.org was unreachable.
- Marini 2009 details beyond the abstract (12.5% of sequence-negative cases, about 2-3% overall: consistent in search summaries).
- PMC4810572 (the mosaic SCN1A deletion case).
- The "IVS5N+5" naming source.
- Alu subfamily (needs RepeatMasker; the consensus used here was typed from memory).
- The MMEJ mechanism.
- NMD rules of thumb and the MANE definition wording.
- `svtools vcftobedpe` window behaviour.
- PacBio Revio and hifiasm naming conventions.
- Whether `.bai` is uncompressed (correct from memory, but not stated in SAMv1).
- Current dbSNP/gnomAD status of the two invented de novo sites.
