# Research: VCF and gVCF (with trio genotyping and PED)

Research notes for the "Genomic File Formats" course, covering the gVCF and VCF lessons and the trio de novo step. Written 2026-10-16. Rule-ID prefixes are `VCF-` and `GVCF-`.

**How to read the evidence tags**

- **[verified: spec]**: read in the hts-specs LaTeX source (VCFv4.5.tex at commit e821e4f, 2026-02-24; VCFv4.2/4.3/4.4.tex at c101c79; repository HEAD 510c107). Section numbers are those of the VCF 4.5 PDF unless stated.
- **[verified: test]**: I ran the snippet through htslib/bcftools 1.24 (via pysam 0.24.1) on 2026-10-16. The tool's own message is quoted.
- **[verified: GRCh38]**: every REF base in this document was checked against the Broad `Homo_sapiens_assembly38.fasta` (HTTP byte ranges of chr2:166,009,001-166,017,000) with `bcftools norm --check-ref e`.
- **[verified: source]**: read in GATK (master) or Strelka (v2.9.x) source code or the GATK docs repository.
- **[from memory - verify]**: the primary source could not be reached. Check it before the claim ships.

**Separator convention.** In code blocks every VCF header line (`#CHROM...`), data line and PED line uses single real TAB characters between columns. `##` meta-information lines contain no tabs. Where a snippet deliberately uses spaces, the text says so.

**Case coordinates.** The variants sit inside the GRCh38 *SCN1A* locus on chr2 and reuse the illustrative capture targets and the 368-bp deletion from `intervals-signals.md`. The SNV at chr2:166,009,959 lies in illustrative target T2, **not** in a verified SCN1A exon. The REF bases are real.

---

## 1. Purpose and place in the pipeline

**VCF** (Variant Call Format) records *where a sample's genome differs from the reference*, and the genotype of every sample at each such site.

- **Producers:** variant callers (GATK HaplotypeCaller + GenotypeGVCFs, DeepVariant, bcftools call, DRAGEN, Strelka); SV callers (Manta, LUMPY/SVTyper, Sniffles); imputation; and databases (dbSNP, ClinVar, gnomAD all publish VCF).
- **Consumers:** filtering (`bcftools view/filter`, GATK VQSR or hard filters); annotation (VEP, `bcftools csq`, SnpEff), which joins VCF to GTF/GFF3; trio tools (`bcftools +mendelian2`, `+trio-dnm3`, GATK PossibleDeNovo) [verified: source]; browsers (IGV); and population databases.
- **Disease question:** *Which differences does the child carry, which did each parent pass on, and which are new?* VCF is where "a coverage dip" or "a read mismatch" becomes a *claim* with a probability attached.

**gVCF** (genomic VCF) is a VCF for **one** sample that also covers the non-variant stretches, in compressed *reference blocks*.

- **Producer:** `gatk HaplotypeCaller -ERC GVCF` (also DRAGEN, DeepVariant). Illumina's older Strelka/Isaac gVCF is a different dialect (§3.6).
- **Consumers:** `GenomicsDBImport` or `CombineGVCFs`, then `GenotypeGVCFs`, which turns N gVCFs into one multi-sample VCF.
- **Disease question:** *Is the father really homozygous reference here, or did we simply not look?* A de novo call is a claim about **three** genotypes. Two of them are "nothing to see", and only a gVCF can say that with a confidence.

The trio workflow (command forms verified in GATK source javadoc):

```
child.bam  --HaplotypeCaller -ERC GVCF--> child.g.vcf.gz   (+ .tbi)
mother.bam --HaplotypeCaller -ERC GVCF--> mother.g.vcf.gz
father.bam --HaplotypeCaller -ERC GVCF--> father.g.vcf.gz
      \__ GenomicsDBImport (or CombineGVCFs) __/
                       |
                 GenotypeGVCFs  ------------------> trio.vcf.gz (+ .tbi)
                       |                                 |
                 trio.ped (who is whose parent) --> de novo / Mendelian filters --> annotate with GTF
```

```
gatk HaplotypeCaller -R Homo_sapiens_assembly38.fasta -I child.bam -O child.g.vcf.gz -ERC GVCF
gatk GenomicsDBImport -V child.g.vcf.gz -V mother.g.vcf.gz -V father.g.vcf.gz --genomicsdb-workspace-path trio_db -L chr2
gatk GenotypeGVCFs -R Homo_sapiens_assembly38.fasta -V gendb://trio_db -O trio.vcf.gz
```

## 2. Mental model

**A VCF is a list of edits to the reference, plus a per-person checklist.** Each data line says: *at this position, the reference reads `REF`; some genomes read one of `ALT` instead.* After that, one column per person answers *which of those versions do you carry, on each of your copies, and how sure are we?*

The spec's own phrasing: the record describes "a-REF-t" and each alternative haplotype is "a-ALT-t" (§2) [verified: spec]. The format is built around three design problems.

1. **Many samples, few variant sites.** Two humans differ at roughly 1 in 1,000 bases, so VCF stores only *sites*, not genomes. The sample columns form a sites × samples matrix.
2. **Indels have no "position" of their own.** A deleted base sits *between* two retained bases, so VCF anchors every simple indel on the preceding reference base. That is why `REF` and `ALT` share a first letter and why the deletion "starts" at `POS+1`.
3. **Absence is ambiguous.** A missing line can mean "reference here" or "no reads here". A variants-only VCF cannot tell them apart. The gVCF adds *reference blocks*: "positions 166,009,951-166,009,970: homozygous reference, at least 26 reads, GQ 84".

**Analogy: tracked changes in a shared manuscript.** The reference genome is the published text everyone cites (one fixed edition: GRCh38). A VCF is the tracked-changes sidebar:

- *line 3, word "C" -> "T"* is the substitution.
- Each reviewer (sample) ticks which edits appear in their copy, once per copy they hold (diploid).
- A deletion comment is pinned to the word *before* the cut, because you cannot pin a comment to nothing.
- The gVCF is a reviewer who also initials every page they actually read, page ranges included. "No comment on page 12" now means "read it, no change" rather than "never opened it".
- The joint VCF is the editor's merged sidebar for all three reviewers.

## 3. Anatomy

### 3.1 Annotated minimal valid trio VCF

This is a joint-genotyped trio VCF. It passed htslib parsing, BCF conversion, `tabix -p vcf`, `bcftools index`, and `bcftools norm -f GRCh38 --check-ref e` [verified: test, GRCh38].

```
##fileformat=VCFv4.5
##reference=file:///refs/GRCh38/Homo_sapiens_assembly38.fasta
##contig=<ID=chr2,length=242193529,assembly=GRCh38>
##FILTER=<ID=PASS,Description="All filters passed">
##FILTER=<ID=LowQual,Description="QUAL below 30">
##ALT=<ID=DEL,Description="Deletion">
##INFO=<ID=AC,Number=A,Type=Integer,Description="Allele count in genotypes, for each ALT allele">
##INFO=<ID=AN,Number=1,Type=Integer,Description="Total number of alleles in called genotypes">
##INFO=<ID=DP,Number=1,Type=Integer,Description="Combined depth across samples">
##INFO=<ID=SVLEN,Number=A,Type=Integer,Description="Length of structural variant">
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=AD,Number=R,Type=Integer,Description="Read depth for each allele">
##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Read depth">
##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Conditional genotype quality">
##FORMAT=<ID=PL,Number=G,Type=Integer,Description="Phred-scaled genotype likelihoods">
##PEDIGREE=<ID=CHILD,Father=FATHER,Mother=MOTHER>
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	CHILD	MOTHER	FATHER
chr2	166009959	.	C	T	512.3	PASS	AC=1;AN=6;DP=101	GT:AD:DP:GQ:PL	0/1:17,18:35:99:520,0,480	0/0:38,0:38:99:0,99,1485	0/0:28,0:28:84:0,84,1260
chr2	166012370	.	T	<DEL>	.	PASS	AC=1;AN=6;SVLEN=368	GT	0/1	0/0	0/0
chr2	166013043	.	TTC	T	233.1	PASS	AC=2;AN=6;DP=96	GT:AD:DP:GQ:PL	0/1:15,16:31:99:240,0,310	0/1:19,17:36:99:228,0,390	0/0:29,0:29:87:0,87,1305
```

| Line | What it shows |
|---|---|
| `##fileformat=VCFv4.5` | Must be line 1. Without it htslib reports "unknown file type" [verified: test]. |
| `##contig` | Declares the name and length used in CHROM. It is recommended for VCF and required for BCF (§1.4.7). |
| `##INFO` / `##FORMAT` | ID, Number, Type, Description. `Number=A/R/G` tie the value count to the alleles (§3.4). |
| `##ALT=<ID=DEL>` | Declares the symbolic allele used in record 2. |
| `##PEDIGREE` | Optional in-file pedigree (§1.4.9). Most trio tools want a separate PED file instead (§3.7). |
| Record 1 | **De novo candidate.** The child is `0/1` with 17 REF and 18 ALT reads. Both parents are `0/0` with GQ 99 and 84. `PL` has 3 values (`0/0,0/1,1/1`), and the 0 sits at the called genotype. |
| Record 2 | **Symbolic deletion.** POS 166,012,370 is the *base before* the event (a T in GRCh38). SVLEN=368, so the deleted bases are 166,012,371-166,012,738 and htslib computes the record end as 166,012,738 [verified: test]. Its FORMAT is only `GT`, which is legal because FORMAT is chosen per record. |
| Record 3 | **Inherited indel.** `TTC -> T` at the anchor T (166,013,043) deletes the `TC` at 166,013,044-045 inside a `TCTCTCTC` repeat. The child and mother are `0/1`, so the child inherited it from the mother. |

### 3.2 Meta-information lines (§1.4)

- **Unstructured:** `##key=value`. The value must not start with `<` (`##fileDate`, `##source`, `##reference`).
- **Structured:** `##key=<ID=...,k=v,...>`. ID is required and unique within each key (4.3+). Fields should be ordered ID, Number, Type, Description, but parsers must not rely on the order. Optional fields are quoted strings, e.g. `Source="ClinVar",Version="20220804"`.
- **INFO / FORMAT:** required fields are `ID, Number, Type, Description`. INFO Types are `Integer, Float, Flag, Character, String`. FORMAT has no Flag. A Flag has `Number=0`. Description is double-quoted, with `\"` and `\\` escapes.
- **FILTER:** `ID, Description`. **ALT:** `ID, Description`. SV ID first levels are `DEL, INS, DUP, INV, CNV`, with optional subtypes such as `DUP:TANDEM`, `INS:ME`, `CNV:TR`.
- **contig:** `ID` plus reserved `length`, `md5` (the SAM-style MD5), `URL`. Names follow the SAM rule `[0-9A-Za-z!#$%&+./:;?@^_|~-][0-9A-Za-z!#$%&*+./:;=?@^_|~-]*` (4.3+).
- **PEDIGREE:** `##PEDIGREE=<ID=Child,Father=F,Mother=M>`, or `Original=` for clonal derivation (tumour from germline), or `##pedigreeDB=URL`.
- **Other defined lines:** `##SAMPLE`, `##META` (added in 4.3), `##assembly` (a FASTA of breakpoint assemblies).
- **Meta lines are optional**, but must be well-formed if present. BCF requires every used tag and contig to be declared (§1.4). htslib behaves accordingly: it *warns* on undeclared tags while reading VCF and *refuses* to write BCF ("Unchecked error (2 Tag not defined in header)") [verified: test].

### 3.3 The eight fixed columns (§1.6.1)

| # | Column | Rule |
|---|---|---|
| 1 | CHROM | Contig name. No whitespace. All records for one CHROM form a contiguous block ("must" since 4.3; "should" in 4.2). |
| 2 | POS | 1-based position of the first base in REF. Sorted ascending within a CHROM, and ties are allowed. Telomeric breakends use 0 or N+1. |
| 3 | ID | `;`-separated identifiers such as `rs6054257`, or `.`. No identifier "should" appear in more than one record. |
| 4 | REF | One or more of A,C,G,T,N (case-insensitive) matching the reference. IUPAC codes in the reference are reduced to the first base alphabetically (R becomes A; 4.3+). |
| 5 | ALT | `,`-separated alleles. Each is bases, `*`, `<ID>`, `<*>`, a breakend string, or `.` when there is no ALT. |
| 6 | QUAL | Phred `-10log10 P(call in ALT is wrong)`. If ALT is `.`, it is `-10log10 P(variant)`. Unknown is `.`. Type Float. |
| 7 | FILTER | `PASS`, a `;` list of failed filter IDs, or `.` meaning *no filters applied*. `0` is reserved. |
| 8 | INFO | `.` or `;`-separated `key[=v[,v]]`. Keys match `^([A-Za-z_][0-9A-Za-z_.]*\|1000G)$`. Duplicate keys are not allowed. Spaces are allowed in values (4.3+). `; = ,` and `%` must be percent-encoded. |

Reserved INFO keys include `AA, AC(A), AD(R), AF(A), AN, DB, DP, END, H2, H3, MQ, NS, SB, SOMATIC, VALIDATED`. In 4.5, `END` is "Deprecated... a computed field" [verified: spec].

### 3.4 FORMAT and genotype columns (§1.6.2)

- `FORMAT` is a `:`-separated key list matching `^[A-Za-z_][0-9A-Za-z_.]*$`. **GT must come first if present.** Duplicates are not allowed. In 4.5, if any local-allele field is present, `LAA` comes right after GT.
- One column per sample follows, with values in FORMAT order. Missing values are `.`. Trailing fields may be dropped, but GT "should" stay. A sample column may not have *more* subfields than FORMAT has keys (htslib: "Incorrect number of FORMAT fields") [verified: test].

**GT encoding.**

- Allele indices: `0` = REF, `1` = first ALT, `2` = second ALT.
- Separators: `/` unphased, `|` phased (relative to `PS`).
- Ploidy: haploid `1` (male X outside the PARs, Y, MT); diploid `0/1`; triploid `0/0/1`.
- Missing: `./.` diploid, `.` haploid. Partially missing `0/.` is legal.
- From 4.4, GT is a *prefix* notation whose first indicator is optional, so `/0/1` equals `0/1` and `|0/1/2` is a partially phased triploid [verified: spec].

**Number codes.** For a record with *n* ALT alleles and ploidy *P*:

| Number | Count | Example (n = 2, diploid) |
|---|---|---|
| integer k | k | `HQ` = 2 |
| `A` | n (one per ALT) | `AC=1,1` |
| `R` | n+1 (REF first) | `AD=17,18,0` |
| `G` | C(n+P, P), one per genotype | `PL` has 6 values |
| `.` | varies / unknown | `CIPOS` |
| `LA`, `LR`, `LG`, `P`, `M` | 4.5 FORMAT only: local alleles, per GT allele, base modifications | `LPL`, `PSL`, `M5mC` |

**Genotype order for G fields (§1.6.2, "Genotype Ordering").** Diploid `a/b` with a ≤ b sits at index `b(b+1)/2 + a`. For n = 1 the order is `00,01,11`. For n = 2 it is `00,01,11,02,12,22`. Triploid with n = 2 gives 10 values.

**Reserved FORMAT keys you will meet:**

- `AD` (R), `DP`, `GQ`, `PL` and `GL` (G), `FT` (per-sample filter), `PS` (phase set).
- `GQ` is "conditional genotype quality", `-10log10 P(genotype call is wrong | site is variant)`. GATK computes it as the difference between the two smallest PLs (= the second-smallest PL, since PLs are normalized so the best is 0) and caps it at 99 [verified: source, `calculateGQFromPLs`].
- 4.5 additions: `LEN` (length of a `<*>` block), and `LAA/LAD/LPL` (local alleles).

### 3.5 Allele grammar: anchor bases, multiallelics, `*`, symbolic alleles, breakends

**Anchor (padding) base.** If REF or an ALT would otherwise be empty, both strings include the base *before* the event, and POS points at that base. At contig position 1, they include the base *after* instead. Complex substitutions where every allele is non-empty need no padding (§1.6.1 item 4).

- Insertion of `TC` after the T at 166,013,043: `166013043 T TTC`.
- Deletion of that `TC`: `166013043 TTC T`. The deleted bases are POS+1..POS+2.
- A MAF-style `G -` is **not** VCF. htslib reads it, but `bcftools norm` stops: "Non-ACGTN alternate allele at chr2:... VCF:'-'" [verified: test].

**Multiallelic records.** These put every allele segregating at a locus on one line: `20 1110696 . A G,T`. When alleles overlap differently, REF spans the union, as in `20 2 . TCG TG,T,TCAG` (§5.1, example 3). After splitting with `bcftools norm -m-`, a sample that carried the *other* ALT shows `0` in the split record. In split files, `0` means "not this ALT" [verified: test].

**`*` allele (4.2+).** "Allele missing due to overlapping deletion." A deletion that starts upstream covers this position in that haplotype. For example, a mother who is `G/*` at an SNV inside her own heterozygous deletion. Do not confuse it with `<*>`.

**Symbolic alleles `<ID>`.**

- POS is the base *before* the event, and a padding base is required.
- In 4.4+, `SVLEN` "must be specified" and is positive. In 4.2/4.3, SVLEN was the length difference, negative for deletions (`SVLEN=-205` with `END`).
- In 4.5, `END` is deprecated and computed. 4.4 added `SVCLAIM` (D = depth/abundance, J = junction, DJ = both) and deprecated `SVTYPE`.
- htslib 1.24 derives the same end (166,012,738) from `SVLEN=368`, `SVLEN=-368` or `END` under either version header [verified: test].
- With **no** SVLEN or END, htslib gives the `<DEL>` a 1-bp extent, so an indexed query of chr2:166012500-166012600 *misses* it [verified: test].

**`<*>` (4.3+).** The "unspecified allele": any allele not otherwise listed. It is the reference-confidence placeholder of gVCF, and unlike other symbolic alleles its block *includes* POS. 4.5 says `<NON_REF>` "should be treated as an alias of `<*>`" [verified: spec].

**Breakends.** Each novel adjacency is two records (mates), and the ALT combines the replacement string *t*, a mate position *p*, and bracket direction:

| ALT | Meaning (spec table, §5.4) |
|---|---|
| `t[p[` | piece extending to the right of p is joined after t |
| `t]p]` | reverse-complemented piece extending left of p is joined after t |
| `]p]t` | piece extending to the left of p is joined before t |
| `[p[t` | reverse-complemented piece extending right of p is joined before t |

The case deletion written as breakends. It is valid and REF-checked when the §3.1 header also declares `##INFO=<ID=MATEID,Number=A,Type=String,Description="ID of mate breakend">`; without that line, htslib warns and BCF output fails [verified: test, GRCh38]:

```
chr2	166012370	bnd_L	T	T[chr2:166012739[	.	PASS	MATEID=bnd_R	GT	0/1	0/0	0/0
chr2	166012739	bnd_R	A	]chr2:166012370]A	.	PASS	MATEID=bnd_L	GT	0/1	0/0	0/0
```

### 3.6 gVCF anatomy (three dialects)

**(a) GATK gVCF (HaplotypeCaller `-ERC GVCF`).** These are the child's records around the de novo SNV. Structure and field semantics follow GATK source; the values are constructed. The file parses, and `bcftools merge --gvcf` accepts it [verified: test].

```
##fileformat=VCFv4.2
##ALT=<ID=NON_REF,Description="Represents any possible alternative allele not already represented at this location by REF and ALT">
##FORMAT=<ID=MIN_DP,Number=1,Type=Integer,Description="Minimum DP observed within the GVCF block">
##GVCFBlock70-80=minGQ=70(inclusive),maxGQ=80(exclusive)
##GVCFBlock90-99=minGQ=90(inclusive),maxGQ=99(exclusive)
##INFO=<ID=END,Number=1,Type=Integer,Description="Stop position of the interval">
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	CHILD
chr2	166009901	.	T	<NON_REF>	.	.	END=166009958	GT:DP:GQ:MIN_DP:PL	0/0:34:90:30:0,90,1350
chr2	166009959	.	C	T,<NON_REF>	512.3	.	DP=35	GT:AD:DP:GQ:PL	0/1:17,18,0:35:99:520,0,480,571,534,1105
chr2	166009960	.	A	<NON_REF>	.	.	END=166010040	GT:DP:GQ:MIN_DP:PL	0/0:33:75:25:0,75,1125
```

(The other `##FORMAT`/`##INFO`/`##contig` lines are omitted for space.)

- **Every** record carries `<NON_REF>`, including variant records. That is why the variant's `PL` has 6 values: three alleles, diploid.
- A **block** has REF = the first base only, ALT = `<NON_REF>`, QUAL `.`, and an inclusive `END`.
- Block FORMAT values summarise the block [verified: source, `HomRefBlock.java`]:
  - `GQ` = minimum (derived from element-wise minimum PLs);
  - `DP` = **median** depth;
  - `MIN_DP` = minimum depth;
  - `PL` = element-wise minimum.
- **GQ banding.** Consecutive hom-ref sites merge while their GQ stays inside one band. A band change starts a new block.
  - GATK 4 default `-GQB` bounds are 1, 2, ..., 60, 70, 80, 90, 99. That gives one-point bands below 60, then [60,70), [70,80), [80,90), [90,99), [99,100). GQ is capped at 99 [verified: source, `HaplotypeCallerArgumentCollection.java`].
  - Each band is declared as `##GVCFBlock<lo>-<hi>=minGQ=<lo>(inclusive),maxGQ=<hi>(exclusive)`.
  - The GATK3-era FAQ example used bands [5, 20, 60] [verified: source, gatk-docs].
  - `--floor-blocks` writes the band floor as GQ and drops PL and MIN_DP.
- **`-ERC BP_RESOLUTION`** writes one record per position instead of blocks.
- **Zero coverage still writes `0/0`.** GATK's FAQ example ends with a block of `0/0:44:0:44:0,0,0`. In joint genotyping, a hom-ref with **GQ 0 becomes `./.`**, and with DP 0 a bare `./.` ("in the 'no data' case set to plain no-call") [verified: source, `GATKVariantContextUtils.makeGenotypeCall`].

**(b) VCF 4.5 standard form.** `<*>` replaces `<NON_REF>`, and the per-sample `FORMAT LEN` replaces `INFO END`. That allows blocks of different lengths for different samples in a multi-sample file.

- A missing LEN is inferred from END.
- In a multi-sample file, positions already covered by a sample's earlier `<*>` block must show GT `.` for that sample.
- htslib 1.24 honours LEN: `chr2 166009951 T <*> ... GT:DP:GQ:LEN 0/0:28:84:20` gives rlen 20 and end 166,009,970 [verified: test].

**(c) Illumina (Strelka/Isaac) gVCF.**

- Non-variant blocks have ALT `.`, QUAL `.`, INFO `END=...;BLOCKAVG_min30p3a`, and FORMAT `GT:GQX:DP:DPF:MIN_DP`.
- Sites join a block while each of GQX, DP and DPF stays in [x, y] with y ≤ max(x+3, 1.3x). The label is built from defaults of 30% and 3 [verified: source, Strelka `gvcf_options.hh`, `gvcf_writer.cpp`; Illumina help page via search snippet only].
- It has no `<NON_REF>` and no per-site PLs in blocks. GATK warns that such files "lack... accurate genotype likelihoods for every position" and cannot feed GenotypeGVCFs [verified: source, CombineGVCFs javadoc].
- An illustrative block line (format per the Strelka writer; the values are invented):

```
chr2	166009901	.	T	.	.	PASS	END=166009958;BLOCKAVG_min30p3a	GT:GQX:DP:DPF:MIN_DP	0/0:90:34:0:30
```

**Why gVCF exists.**

1. **Hom-ref versus no data.** Merging variants-only VCFs cannot tell a sample that is hom-ref from one with no reads. GATK's retired joint-calling article calls this "Clearer distinction between homozygous reference sites and sites with missing data" [verified: source, gatk-docs].
2. **The N+1 problem.** Multi-sample calling from BAMs means that "every time you get even one new sample... you have to re-call all samples from scratch". With gVCFs, you call only the new sample and rerun the cheap GenotypeGVCFs step [verified: source, gatk-docs].

**What joint genotyping does.** `bcftools merge --gvcf` (a CombineGVCFs analogue) on the three trio gVCFs splits every sample's blocks at the child's variant. The parents' block likelihoods are carried onto the new allele [verified: test]:

```
chr2	166009951	.	T	<NON_REF>	.	.	END=166009958	GT:DP:GQ:MIN_DP:PL	0/0:34:90:30:0,90,1350	0/0:38:99:31:0,99,1485	0/0:28:84:26:0,84,1260
chr2	166009959	.	C	T,<NON_REF>	512.3	.	DP=35	GT:AD:DP:GQ:PL:MIN_DP	0/1:17,18,0:35:99:520,0,480,571,534,1105:.	0/0:.:38:99:0,1485,1485,99,1485,1485:31	0/0:.:28:84:0,1260,1260,84,1260,1260:26
```

GenotypeGVCFs then, by default, keeps only sites that are variant after genotyping (`--include-non-variant-sites` keeps the rest) [verified: source]. It writes the ALT without `<NON_REF>` [from memory - verify], which gives record 1 of §3.1.

### 3.7 PED file (trio tools)

A PED file is whitespace-delimited (GATK accepts spaces or tabs) with six mandatory columns: Family ID, Individual ID, Paternal ID, Maternal ID, Sex (1 = male, 2 = female, other = unknown), Phenotype (-9/0 missing, 1 unaffected, 2 affected). Parent ID `0` means not in the dataset [verified: source, gatk-docs "Pedigree / PED files"]. `bcftools +mendelian2 -P` reads `<ignored>,proband,father,mother,sex` [verified: source].

```
FAM01	CHILD	FATHER	MOTHER	1	2
FAM01	FATHER	0	0	1	1
FAM01	MOTHER	0	0	2	1
```

The child's sex is not fixed by the story. Code 1 is used here only so the chrX exercise works (see open questions).

## 4. Coordinate system and conventions

- **1-based, closed.** POS is the first base of REF, and REF covers POS..POS+len(REF)-1. `END` and `LEN` are 1-based inclusive. Region strings (`chr2:166009959-166009959`) are 1-based inclusive [verified: test, tabix query].
- **What an indel's POS means.**
  - For a padded indel, POS is the *anchor*, and the event starts at POS+1.
  - For a symbolic SV, the deleted span is POS+1..POS+SVLEN.
  - So the `<DEL>` at POS 166,012,370 deletes 1-based 166,012,371-166,012,738. That is exactly the BED interval `chr2 166012370 166012738`: the VCF anchor coordinate equals the BED start of the deleted bases. This is a useful bridge to the BED and BEDPE lessons.
  - `<*>` blocks are the exception: they *include* POS.
- **Strand.** VCF alleles are always on the reference forward strand, and there is no strand column. SCN1A is a minus-strand gene, so a genomic `C>T` is `G>A` in transcript (c.) terms. Breakend brackets encode the orientation of joined pieces, not gene strand.
- **Sorting.**
  - The spec requires each CHROM to form one contiguous block (4.3+ "must") with POS ascending inside it. It does not mandate an order *between* contigs.
  - htslib indexing enforces both: "Unsorted positions on sequence #1: 166009976 followed by 166009959" and "Chromosome blocks not continuous" [verified: test].
  - GATK additionally expects contig order to match the reference dictionary [from memory - verify].
- **Headers.** All `##` lines first, then exactly one `#CHROM` line. 4.5 "clarified that the header line is indeed mandatory". htslib errors without it: "No sample line" [verified: test].
- **Text encoding.** UTF-8 with no BOM, and LF or CRLF line endings (4.3+). htslib 1.24 accepts CRLF [verified: test].
- **Compression.** `bgzip` (BGZF) produces a gzip-compatible series of blocks that are indexable. Plain `gzip` output is readable but not indexable: `tabix` fails with "building of index ... failed", and bcftools says "in a format that cannot be usefully indexed" [verified: test].
- **Indexes.**
  - **`.tbi`** (tabix) handles chromosomes up to 512 Mbp (2^29) (tabix.1, htslib 1.24).
  - **`.csi`** has a configurable `min_shift` (default 14) and covers lengths up to 2^31 (bcftools-index docs). `bcftools index` makes CSI by default, and `-t` makes TBI.
  - The index records each record's end, which comes from REF length, SVLEN or END, or LEN. A symbolic allele without a length therefore indexes as 1 bp (§3.5).
- **BCF** is the binary twin (BCF2.2). It is BGZF-compressed, needs complete headers, and is indexed with `.csi`.

## 5. Validity rules

Severity: **error** = the spec says MUST (or the format cannot be parsed or indexed). **warning** = the spec says SHOULD/recommended, or the file is likely wrong. **convention** = de facto practice that tools enforce. "4.5 §x" is the VCFv4.5 section, and version notes say where earlier versions differ. The tool column reports htslib/bcftools 1.24 behaviour [verified: test]. In the example cells, any gap inside a code span between VCF columns is a real TAB. **A recurring lesson: htslib *loads* many invalid files silently.**

### 5a. Structural rules

| ID | Rule | Source | Minimal violation | Severity | htslib 1.24 |
|---|---|---|---|---|---|
| VCF-S01 | Line 1 is `##fileformat=VCFvX.Y` | 4.5 §1.4.1 (all 4.x) | first line `##reference=...` | error | "unknown file type" |
| VCF-S02 | Meta lines start `##` and precede the header. A structured line has a unique `ID` per key | §1.4; ID uniqueness explicit 4.3+ | two `##INFO=<ID=DP,...>` | error | n/t |
| VCF-S03 | INFO/FORMAT lines have ID, Number, Type, Description; FILTER/ALT have ID, Description; Flag has Number=0; Description is quoted | §1.4.2-1.4.5 | `##INFO=<ID=DB,Number=1,Type=Flag,...>` | error | n/t |
| VCF-S04 | Exactly one `#CHROM` line: the 8 fixed names in order, then `FORMAT` + sample IDs, tab-separated | §1.5 (4.5 "clarified mandatory") | header joined by spaces | error | "Could not parse the "#CHROM.." line ... spaces are present instead of tabs" |
| VCF-S05 | Sample IDs unique | §1.5 | `CHILD MOTHER MOTHER` | error | "Duplicated sample name 'MOTHER'" |
| VCF-S06 | Data lines are tab-delimited: 8 fixed fields, and with samples, FORMAT + exactly one column per sample | §1.6 | father column missing | error | "Number of columns ... does not match the number of samples (2 vs 3)". A 7-column line gives "truncated file" |
| VCF-S07 | No empty fields; missing is `.` | §1 intro; explicit 4.3+ | `PASS		GT` (empty INFO) | error (spec) | **accepted**, rewritten as `.` |
| VCF-S08 | No trailing tab; last line ends with a newline | §1.5-1.6, 4.3+ | `...0/0:0,84,1260	` | error (spec) | **accepted** |
| VCF-S09 | POS is an integer ≥ 1 (0 or N+1 only for telomeric breakends) | §1.6.1 | `chr2	0	.	C	T...` | error | accepted. Only tabix warns: "Coordinate <= 0 detected" |
| VCF-S10 | REF uses only A,C,G,T,N (any case); ALT alleles are bases, `*`, `.`, `<ID>`, `<*>` or breakend strings | §1.6.1 items 4-5 | ALT `-` | error | read OK; `norm`: "Non-ACGTN alternate allele" |
| VCF-S11 | QUAL is a Float or `.` | §1.6.1 item 6 | QUAL `high` | error | **silently becomes 0** |
| VCF-S12 | FILTER is `PASS`, `.`, or `;`-list of declared IDs; `0` reserved | §1.6.1 item 7 ("must" since 4.3) | FILTER `0` | error | warns; BCF write fails |
| VCF-S13 | INFO keys match the regex, have no duplicates, and a Flag has no value | §1.6.1 item 8 (regex and duplicates 4.3+) | `DP=101;DP=99`; `DB=1` | error | **accepted**; keeps the first DP; accepts `DB=1` |
| VCF-S14 | FORMAT keys are unique and **GT first** | §1.6.2 (GT-first in every 4.x) | `AD:GT` | error | **accepted, genotypes silently lost** (pysam GT = `()`) |
| VCF-S15 | A sample column has no more subfields than FORMAT keys | §1.6.2 | `0/1:17,18:35:99:520,0,480:7` | error | "Incorrect number of FORMAT fields" |
| VCF-S16 | GT syntax is allele indices or `.` joined by `/` or `\|` (4.4+ allows a leading indicator) | §1.6.2 GT | `0-1`; `0/1/` | error | "Invalid character '-' in 'GT'"; "Couldn't read GT data" |
| VCF-S17 | Values match Type: Integer is 32-bit signed, minus -2^31..-2^31+7; Float follows the regex | §1.3 | `DP=10.5` (Integer) | error | **silently truncated to 10** |
| VCF-S18 | Value count matches Number (A, R, G, k) | §1.4.2 | `AD=17,18,3` at a biallelic site | error | **not checked** |
| VCF-S19 | Contig names match the SAM-style regex and are not reserved symbolic names | §1.4.7 (4.3+; 2019 change) | `##contig=<ID=<DEL>>` | error | n/t |
| VCF-S20 | UTF-8, no BOM, no disallowed control characters; special characters percent-encoded | §1.2 (4.3+) | `NOTE=a;b` inside a value | error | n/t |

"n/t" = not tested.

### 5b. Semantic and consistency rules

| ID | Rule | Source | Minimal violation | Severity | Tool behaviour |
|---|---|---|---|---|---|
| VCF-M01 | REF equals the reference at POS..POS+len-1 | §1.6.1 item 4 | `chr2 166011200 G` (GRCh38: T) | error | read OK; `norm -c e`: "Reference allele mismatch at chr2:166011200 .. REF_SEQ:'T' vs VCF:'G'" |
| VCF-M02 | Every CHROM is declared in `##contig` | §1.4.7 (recommended for VCF, required for BCF) | records on `2` with only `chr2` declared | warning (VCF) / error (BCF) | "Contig '2' is not defined in the header"; BCF write fails |
| VCF-M03 | Every INFO/FORMAT/FILTER ID used is declared | §1.4 ("recommended"; BCF requires) | `XYZ=1` undeclared | warning / error (BCF) | "INFO 'XYZ' ... not defined in the header, assuming Type=String" |
| VCF-M04 | Each CHROM is one contiguous block; POS ascends within it | §1.6.1 items 1-2 (4.3+ must; 4.2 should) | 166009976 then 166009959 | error | indexing fails ("Unsorted positions", "Chromosome blocks not continuous") |
| VCF-M05 | POS and record end ≤ contig length | §1.4.7 + §1.6.1 | POS 242193600 on chr2 (length 242,193,529) | error | **not checked against `##contig`**; `norm` fails on the FASTA |
| VCF-M06 | Padding base and POS shift: simple indels and symbolic alleles anchor on the preceding base (the following base at position 1) | §1.6.1 item 4; §1.4.5 | `166016003 G -` instead of `166016002 TG T` | error | see VCF-S10 |
| VCF-M07 | ALT alleles differ from REF and from each other | §1.6.1 item 5 | `C	C` | error | `norm`: "Duplicate alleles at chr2:166009959" |
| VCF-M08 | GT indices ≤ number of ALT alleles | §1.6.2 | `0/2` with one ALT | error | **accepted**; pysam returns `(0, None)` |
| VCF-M09 | A/R/G arrays agree with the ALT count and ploidy; PL zero at the called genotype (GATK) | §1.6.2 genotype ordering | 3 PL values with 2 ALTs | error / warning | not checked |
| VCF-M10 | Symbolic SV alleles carry SVLEN (4.4+ "must"; positive); END, if present, equals the computed end | §3 (SVLEN, END) | `T	<DEL>` with no SVLEN | error (4.4+) | accepted; **indexed as 1 bp, missed by region queries** |
| VCF-M11 | Breakend mates point at each other (MATEID), with consistent positions and brackets | §5.4 | `bnd_L` ALT points to 166012740 but its mate sits at 166012739 | error | n/t |
| VCF-M12 | `*` appears only where an upstream deletion overlaps | §1.6.1 item 5 (4.2+) | `*` at a site with no overlapping deletion | warning | n/t |
| VCF-M13 | Ploidy fits sex and region (haploid on male non-PAR X, Y, MT) | §1.6.2 GT ("should") | `0/1` on male chrX non-PAR | warning | n/t |
| VCF-M14 | IDs are not repeated across records | §1.6.1 item 3 ("should") | `rs1` on two lines | warning | accepted |
| VCF-M15 | Contig names and build match the FASTA/BAM (`chr2` vs `2`; GRCh38 vs GRCh37), checked via `##contig` length/md5 | §1.4.7 (md5 per SAM) | `##contig=<ID=2,...>` against a `chr`-style FASTA | error (pipeline) | `norm`: "faidx_fetch_seq failed at 2:166009959" |
| VCF-M16 | Sample IDs match the PED / `##PEDIGREE` IDs and roles | §1.4.9; GATK PED doc | PED names `FATHER` as mother | warning | n/t |

### 5c. De facto conventions

| ID | Convention | Enforced by | Severity |
|---|---|---|---|
| VCF-C01 | **Normalized** indels: parsimonious and left-aligned (not required by the spec, which only requires padding) | `bcftools norm -f`, `vt normalize`; any comparison between call sets | convention |
| VCF-C02 | `.vcf.gz` is BGZF (bgzip), not plain gzip | tabix/bcftools index | convention (tool-required) |
| VCF-C03 | An index sits next to the file (`.tbi` ≤ 512 Mbp contigs, otherwise `.csi`) and is rebuilt after any edit | htslib; GATK | convention |
| VCF-C04 | Contig order follows `##contig` / reference-dictionary order | GATK [from memory - verify] | convention |
| VCF-C05 | Multiallelics are split (`norm -m-`) before per-allele filtering and annotation; afterwards `0` means "not this ALT" | annotation pipelines | convention |
| VCF-C06 | `##reference` and `##contig` carry length (and md5) | spec "recommended"; BCF required | convention |
| VCF-C07 | GQ capped at 99; GQ = gap between the two smallest PLs | GATK [verified: source] | convention |
| VCF-C08 | Extensions: `.vcf`, `.vcf.gz`, `.vcf.bgz`, `.bcf`; `.g.vcf.gz` for gVCF | GATK, bcftools | convention |

### 5d. gVCF rules

| ID | Rule | Source | Minimal violation | Severity |
|---|---|---|---|---|
| GVCF-S01 | GATK gVCF: every record ends its ALT list with `<NON_REF>`, declared in `##ALT` | GATK FAQ, HaplotypeCaller output [verified: source]; VCF 4.5 §5.5 alias | variant record `C	T` with no `<NON_REF>` | error (GenotypeGVCFs input) |
| GVCF-S02 | A block record has a single-base REF matching the reference at POS, ALT `<NON_REF>`/`<*>`, QUAL `.`, `END ≥ POS` (or 4.5 `LEN ≥ 1`) | GATK FAQ; 4.5 §5.5 | `END=166009900` on a block starting at 166009901 | error |
| GVCF-S03 | `MIN_DP` declared as FORMAT; GQ bands declared as `##GVCFBlock` lines | GATK source | `MIN_DP` used undeclared | convention |
| GVCF-M01 | Records tile the processed intervals without gaps or overlaps (a deletion may span following positions) | GATK `GVCFBlockCombiner` | a gap 166009951-166009970 between blocks: "not processed" ≠ hom-ref | warning |
| GVCF-M02 | A block's GQ lies in one declared band and is the minimum; DP is the median; `MIN_DP ≤ DP` | GATK `HomRefBlock` | `GQ=99` with `PL=0,90,1350` | warning |
| GVCF-M03 | `0/0` with GQ 0 (or DP 0, PL `0,0,0`) is **no evidence**, not hom-ref. GenotypeGVCFs emits `./.` | GATK `makeGenotypeCall` [verified: source] | treating `0/0:0:0:0:0,0,0` as a confident parent call | error (interpretation) |
| GVCF-M04 | VCF 4.5 multi-sample: a sample's positions covered by its earlier `<*>` block have GT `.` in later overlapping records; missing LEN is inferred from END | 4.5 §5.5 | a sample `0/0` at a position already inside its own block | error (4.5) |
| GVCF-C01 | Only HaplotypeCaller (or compatible) gVCFs feed GenotypeGVCFs. UnifiedGenotyper `EMIT_ALL_SITES` and Strelka gVCFs "look superficially like" them but lack reference-confidence likelihoods | GATK FAQ and CombineGVCFs javadoc | Illumina block (ALT `.`) passed to CombineGVCFs | convention (tool-enforced) |
| GVCF-C02 | One sample per HaplotypeCaller gVCF. Multi-sample gVCFs come from CombineGVCFs; GenomicsDB workspaces serve large cohorts | GATK javadoc | n/a | convention |

## 6. Recognition cues

**Signatures:**

- Line 1 is `##fileformat=VCFv4.x`.
- The header is `#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO` (+ `	FORMAT	sample...`).
- Columns 4-5 are short base strings or `<...>`, column 8 is `key=value;...`, and sample columns look like `0/1:17,18:35:99`.

**gVCF tells:**

- `<NON_REF>` or `<*>` in ALT on most lines;
- `END=` on lines whose ALT is only `<NON_REF>`;
- `##GVCFBlock` lines and a `MIN_DP` FORMAT;
- one sample column;
- a `.g.vcf.gz` name.

Illumina gVCF has ALT `.` plus `BLOCKAVG_min30p3a` and `GQX`.

**Bytes** [verified: test]:

| File | First bytes | After BGZF decompression |
|---|---|---|
| `.vcf.gz` (bgzip) | `1f 8b 08 04 ... 06 00 42 43 02 00` (gzip with the FEXTRA "BC" field) | `##fileformat=VCFv4.5` |
| plain-gzip `.vcf.gz` | `1f 8b 08 08` (FNAME flag, no BC field) | same text, but not indexable |
| `.bcf` | `1f 8b 08 04 ... 42 43` | `BCF\x02\x02` |
| `.tbi` | BGZF | `TBI\x01` |
| `.csi` | BGZF | `CSI\x01` |

**Look-alikes:**

- **GFF3/GTF:** 9 columns, `##gff-version 3`, start/end/strand columns.
- **BED/BEDPE:** no `##fileformat`, 0-based starts, no REF/ALT.
- **SAM:** `@HD`/`@SQ` headers, 11 mandatory columns.
- **MAF (Mutation Annotation Format):** a `Hugo_Symbol` header and `-` for empty alleles.
- **PLINK `.ped/.map`:** genotypes as letter pairs after 6 columns.
- **Consumer genotype exports:** `rsid chromosome position genotype`.
- **Spreadsheets:** comma-separated `CHROM,POS,REF,ALT`.
- **HGVS strings:** `NC_000002.12:g.166009959C>T`.

A PED file looks like a 6-column table with `0` placeholders and sex/phenotype codes 1/2.

## 7. Common misconceptions and real-world pitfalls

1. **"No line means homozygous reference."** It may mean zero reads. Only a gVCF block, or GQ/DP in a joint VCF, can show the parent is hom-ref.
2. **"`0/0` in a gVCF means confidently reference."** GATK writes `0/0:0:0:0:0,0,0` for zero-coverage stretches. Read GQ and MIN_DP. GenotypeGVCFs turns GQ-0 hom-refs into `./.`.
3. **"POS is where the indel starts."** POS is the anchor base, and the deletion starts at POS+1. Off-by-one in the other direction happens when converting to BED.
4. **"Different coordinates mean different variants."** `166009976 TA T`, `166009977 AA A`, `166009981 AA A`, `166009982 AT T` and `166009976 TAAAAAAT TAAAAAT` are the same deletion. `bcftools norm -f` maps all of them to `166009976 TA T` [verified: test]. Normalize before comparing or annotating.
5. **"A file that loads is valid."** htslib 1.24 silently turned `QUAL=high` into 0, truncated `DP=10.5` to 10, ignored GT when it was not first, and accepted `0/2` at a biallelic site and wrong-length AD/PL arrays [verified: test]. Validate against the spec and the reference.
6. **`.` versus `PASS` in FILTER.** `.` means *no filters were applied*, not "passed".
7. **QUAL versus GQ.** QUAL is site-level: is there any ALT here? GQ is per sample and *conditional* on the site being variant. A high-QUAL site can hold a low-GQ parent.
8. **`*` versus `<*>`.** `*` is "deleted by an upstream deletion". `<*>`/`<NON_REF>` is "any unobserved allele" in reference-confidence records.
9. **After a multiallelic split, `0` means "not this ALT".** A mother who is `0/2` becomes `0/0` in the split ALT-1 record [verified: test].
10. **Version drift.** SVLEN for deletions is negative in 4.2/4.3 and positive from 4.4. `END` is deprecated in 4.5. `<NON_REF>` became an alias of `<*>` only in 4.5. Check the `##fileformat` line before interpreting.
11. **`chr2` versus `2`, and GRCh37 versus GRCh38.** Wrong builds give REF mismatches or silent empty intersections. `bcftools +mendelian2 --rules` defaults to **GRCh37** PAR rules, so pass `--rules GRCh38` [verified: source].
12. **gzip is not bgzip, and a stale index lies.** Re-bgzip and re-index after every edit.
13. **INFO `AF` is the cohort's frequency** (here, the trio), not the population frequency. Population rarity comes from gnomAD annotation.
14. **Sample columns are just names.** A swapped PED or a sample mix-up creates genome-wide Mendelian errors, not one de novo.
15. **GQ/DP filters drop records without those fields.** A trio filter on `FMT/GQ` and `FMT/DP` returned the SNV but silently dropped the GT-only `<DEL>`, which is the child's actual de novo deletion [verified: test]. SVs need their own filter path.
16. **Phred intuition.**
    - GQ 20 means a 1% chance the genotype is wrong.
    - GQ 84 means about 4 × 10^-9.
    - GQ 15 means about 3%.
    - GQ 99 is a cap, not a measurement.

## 8. Exercise bank

All snippets use the §3.1 header unless stated. Sample columns are CHILD, MOTHER, FATHER. **Every column separator in data and `#CHROM` lines is a single TAB.**

**EX-01 · field-explorer · the de novo record**

```
chr2	166009959	.	C	T	512.3	PASS	AC=1;AN=6;DP=101	GT:AD:DP:GQ:PL	0/1:17,18:35:99:520,0,480	0/0:38,0:38:99:0,99,1485	0/0:28,0:28:84:0,84,1260
```

- **Hover targets:** each column, each INFO key, each FORMAT key, and each sample subfield.
- **Embedded check** ("tap the subfield that says how many reads support T in the child"): the `18` in `17,18`.
- **Explanation:** AD is `Number=R` (REF first). PL `520,0,480` follows `0/0,0/1,1/1`, so the 0 marks `0/1`. GQ = 480 capped to 99.

**EX-02 · simulator (anchor-base builder) · write the indel**

- **Setup:** reference chr2:166,016,000-166,016,005 is `CTTGTG`. A MAF file reports `chr2 166016003 G -`. The learner builds the VCF record by dragging the anchor.
- **Answer:** `chr2 166016002 . TG T`.
- **Explanation:** an empty allele is illegal, so prepend the preceding base and move POS back 1. The base before the G is a T, not a G, so this is already left-aligned [verified: test, GRCh38].

**EX-03 · predict, then simulator (normalizer) · how many ways?**

- **Setup:** reference chr2:166,009,974-166,009,984 is `TTTAAAAAATT` (six A's at 166,009,977-982). One A is deleted.
- **Predict:** how many single-anchor VCF records (`XA -> X`) describe this exact haplotype?
- **Answer:** six. The anchors are 166,009,976 (`TA T`) and 166,009,977-981 (`AA A`). A seventh, right-anchored form `166009982 AT T` is also legal VCF. The simulator slides the gap and shows that every form yields the same haplotype.
- **Explanation:** VCF fixes a syntax, not a unique spelling. `bcftools norm` picks the leftmost, parsimonious form, `166009976 TA T`, for all of them [verified: test].

**EX-04 · predict · genotype order**

- **Setup:** a site has `REF=C`, `ALT=T,G`, and diploid samples. Which 0-based index of `PL` holds the likelihood of `T/G`?
- **Answer:** 4. The order is `00,01,11,02,12,22`, and `b(b+1)/2 + a = 2·3/2 + 1 = 4`.
- **Follow-up:** how many values do AC, AD and PL have? 2 (A), 3 (R), 6 (G).

**EX-05 · spot-the-error · six records, five broken**

Use the §3.1 header. The file loads in htslib without a single error.

```
chr2	166009959	.	C	T	512.3	PASS	AC=1;AN=6;DP=101	GT:AD:DP:GQ:PL	0/1:17,18:35:99:520,0,480	0/0:38,0:38:99:0,99,1485	0/0:28,0:28:84:0,84,1260
chr2	166011200	.	G	C	48.2	PASS	AC=1;AN=6	GT	0/1	0/0	0/0
chr2	166012370	.	T	<DEL>	.	PASS	AC=1;AN=6	GT	0/1	0/0	0/0
chr2	166013043	.	TTC	T	233.1	PASS	AC=2;AN=6;DP=96	GT:AD:DP:GQ:PL	0/1:15,16:31:99:240,0,310	0/2:19,17:36:99:228,0,390	0/0:29,0:29:87:0,87,1305
chr2	166014200	.	C	T	high	PASS	AC=1;AN=4	GT	0/1	0/0	./.
chr2	166015500	.	A	G	640.2	PASS	AC=2;AN=6	AD:GT	30,0:0/0	0,34:1/1	29,0:0/0
```

- **Answer:** line 1 is valid. Each of the others has one error:
  - **Line 2:** REF `G`, but GRCh38 has `T` (VCF-M01; only `norm --check-ref` catches it).
  - **Line 3:** `<DEL>` without SVLEN (VCF-M10; its extent becomes 1 bp).
  - **Line 4:** mother `0/2` with only one ALT (VCF-M08).
  - **Line 5:** QUAL `high` (VCF-S11; htslib stores 0).
  - **Line 6:** GT not first (VCF-S14; genotypes silently lost).
- **Explanation:** these are all [verified: test]. The lesson is that tolerant parsers are not validators.

**EX-06 · fix-it · make it index**

The broken file is below. **The `#CHROM` line deliberately uses single spaces.** Every other data-line separator is a TAB.

```
##fileformat=VCFv4.5
##contig=<ID=chr2,length=242193529>
##INFO=<ID=DP,Number=1,Type=Integer,Description="Combined depth across samples">
##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">
##FORMAT=<ID=GQ,Number=1,Type=Integer,Description="Conditional genotype quality">
#CHROM POS ID REF ALT QUAL FILTER INFO FORMAT CHILD MOTHER FATHER
chr2	166013043	.	TTC	T	233.1	PASS	DP=96	GT:GQ	0/1:99	0/1:99	0/0:87
2	166009959	.	C	T	512.3	PASS	DP=101	GT:GQ	0/1:99	0/0:99	0/0:84
chr2	166016003	.	G	-	50	PASS	DP=88	GQ:GT	99:0/1	99:0/0	99:0/0
```

- **Validator messages in order:**
  1. header uses spaces (VCF-S04);
  2. contig `2` undeclared or mismatched (VCF-M02/M15);
  3. not sorted, chr2 block split (VCF-M04);
  4. `-` allele (VCF-S10/M06);
  5. GT not first (VCF-S14).
- **Target state** (passes htslib, index, and `norm --check-ref e` [verified: test]):

```
#CHROM	POS	ID	REF	ALT	QUAL	FILTER	INFO	FORMAT	CHILD	MOTHER	FATHER
chr2	166009959	.	C	T	512.3	PASS	DP=101	GT:GQ	0/1:99	0/0:99	0/0:84
chr2	166013043	.	TTC	T	233.1	PASS	DP=96	GT:GQ	0/1:99	0/1:99	0/0:87
chr2	166016002	.	TG	T	50	PASS	DP=88	GT:GQ	0/1:99	0/0:99	0/0:99
```

**EX-07 · simulator (gVCF block expander) · what does the father say at 166,009,959?**

These are the father's gVCF body lines (TAB-separated):

```
chr2	166009901	.	T	<NON_REF>	.	.	END=166009950	GT:DP:GQ:MIN_DP:PL	0/0:30:90:27:0,90,1350
chr2	166009951	.	T	<NON_REF>	.	.	END=166009970	GT:DP:GQ:MIN_DP:PL	0/0:28:84:26:0,84,1260
chr2	166009971	.	A	<NON_REF>	.	.	END=166010040	GT:DP:GQ:MIN_DP:PL	0/0:31:93:27:0,93,1395
```

- **Task:** click position 166,009,959 on a ruler. The simulator highlights the covering block.
- **Answer:** block 2. Hom-ref with GQ ≥ 84 (block minimum) and at least 26 reads, so P(wrong) ≈ 4 × 10^-9.
- **Toggle "no data":** the same block becomes `0/0:0:0:0:0,0,0`. Now the answer is "no evidence". GenotypeGVCFs would write `./.` [verified: source].
- **Explanation:** the GT is identical in both versions. The evidence lives in GQ and MIN_DP.

**EX-08 · sort · classify the trio sites**

Bins: *high-confidence de novo candidate*, *low-confidence de novo*, *Mendelian violation, not de novo-shaped*, *inherited (consistent)*, *insufficient evidence*. Body lines are TAB-separated, with `FORMAT GT:DP:GQ`.

```
chr2	166009959	.	C	T	512.3	PASS	.	GT:DP:GQ	0/1:35:99	0/0:38:99	0/0:28:84
chr2	166011200	.	T	C	48.2	PASS	.	GT:DP:GQ	0/1:9:15	0/0:40:99	0/0:36:99
chr2	166012500	.	A	G	210.5	PASS	.	GT:DP:GQ	1/1:14:42	0/1:37:99	0/0:33:99
chr2	166013043	.	TTC	T	233.1	PASS	.	GT:DP:GQ	0/1:31:99	0/1:36:99	0/0:29:87
chr2	166014200	.	C	T	301.7	PASS	.	GT:DP:GQ	0/1:31:99	0/0:36:99	./.
chr2	166015500	.	A	G	640.2	PASS	.	GT:DP:GQ	0/0:30:90	1/1:34:99	0/0:29:87
```

**Answer:**

| Site | Bin | Why |
|---|---|---|
| 959 | high-confidence de novo | All three GQ ≥ 20 (GATK hiConfDeNovo rule) |
| 200 | low-confidence de novo | Child GQ 15: ≥ 10 but < 20 (loConfDeNovo); DP 9 |
| 500 | Mendelian violation | A `0/1 × 0/0` mating cannot give `1/1`. The site lies inside the child's 166,012,371-738 deletion, so the child is *hemizygous* for the maternal G at half depth (14). The paternal chromosome carries the deletion. |
| 043 | inherited | Maternal; consistent |
| 200 (166,014,200) | insufficient evidence | The father has no call |
| 500 (166,015,500) | Mendelian violation | A `1/1` mother must transmit G. Suspect a sample swap, a genotyping error, or a maternal deletion |

**EX-09 · simulator (breakend decoder) · build the junction**

- **Task:** given the deletion 166,012,371-166,012,738 and its flanking bases (T at 166,012,370, A at 166,012,739), the learner picks the bracket form for each mate.
- **Answer:** `T[chr2:166012739[` at 166,012,370 and `]chr2:166012370]A` at 166,012,739.
- **Then:** compare with the one-line `<DEL>` and the BEDPE row in `intervals-signals.md`.

**EX-10 · predict · what does the tool do?**

The learner commits a guess for each edit before revealing htslib's actual behaviour [verified: test]:

| Edit | htslib behaviour |
|---|---|
| (a) `QUAL=high` | silently 0 |
| (b) `DP=10.5` in an Integer field | truncated to 10 |
| (c) `DP=101;DP=99` | first value kept |
| (d) spaces in the `#CHROM` line | hard error |
| (e) records out of order | read OK, indexing fails |
| (f) undeclared INFO key | warning, BCF write fails |

**EX-11 · sort · which dialect?**

Bin these into *GATK gVCF*, *VCF 4.5 gVCF*, *Illumina gVCF*, *plain VCF*, *not VCF*:

- `T	<NON_REF>	...	END=166009958` → GATK gVCF
- `T	<*>	...	GT:DP:GQ:LEN	0/0:28:84:20` → VCF 4.5 gVCF
- `T	.	.	PASS	END=...;BLOCKAVG_min30p3a` → Illumina gVCF
- `C	T	512.3	PASS` → plain VCF
- `chr2	166012370	166012738` → not VCF (BED)
- `Hugo_Symbol...` → not VCF (MAF)

**EX-12 · mcq (multi) · which commands build a usable index?**

1. `bgzip trio.vcf && tabix -p vcf trio.vcf.gz` ✓
2. `gzip trio.vcf && tabix -p vcf trio.vcf.gz`: plain gzip is not BGZF [verified: test].
3. `bcftools view -Oz -o trio.vcf.gz trio.vcf && bcftools index -t trio.vcf.gz` ✓
4. `sort trio.vcf | bgzip > x.gz && tabix -p vcf x.gz`: plain `sort` compares POS as text (`99` after `166009959`). In non-C locales it also ignores `#` when collating, so header lines can land among records [from memory - verify]. Use `bcftools sort`.

## 9. Quiz bank

**Q1.** A deletion of 368 bp is written `chr2 166012370 . T <DEL> . PASS SVLEN=368`. Which bases are deleted (1-based)?

- a) 166,012,370-166,012,737. *That includes the anchor; POS is the base before.*
- **b) 166,012,371-166,012,738** ✓ *Symbolic SVs start after POS.*
- c) 166,012,370-166,012,738. *That is 369 bases.*
- d) Unknown without END. *4.4+ derives the end from SVLEN.*

**Q2.** In the joint VCF the father is `0/0:28:84` at the child's de novo site. In his gVCF the covering block reads `0/0:0:0:0:0,0,0`. What should you conclude?

- a) Confirmed de novo. *The VCF line contradicts the evidence.*
- **b) The inputs disagree. A block with DP 0 and GQ 0 is no evidence, so recheck which gVCF went into joint genotyping** ✓ *GenotypeGVCFs would emit `./.` for that block.*
- c) The father is mosaic. *Nothing here measures mosaicism.*
- d) GQ 84 overrides the gVCF. *GQ 84 cannot arise from zero reads.*

**Q3.** Two labs report `chr2 166009981 . AA A` and `chr2 166009976 . TA T` for the mother. Same variant?

- **a) Yes. Both delete one A from the six-A run; `norm` maps both to `166009976 TA T`** ✓
- b) No, the positions differ. *Representation is not identity.*
- c) No, the REF alleles differ. *Both REFs are the anchor plus one A.*
- d) Only if the IDs match. *IDs are optional labels.*

**Q4.** A record has `ALT=T,<NON_REF>`, and the child's PL is `520,0,480,571,534,1105`. Which genotype is called?

- a) `1/1`. *Index 2 = 480.*
- **b) `0/1`** ✓ *The 0 is at index 1. The order is 00,01,11,02,12,22.*
- c) `0/2`. *Index 3 = 571.*
- d) It cannot be read without GL. *PL is sufficient.*

**Q5.** `FILTER` is `.` on every line of a vendor VCF. What does that mean?

- a) Every site passed. *That would be `PASS`.*
- **b) No filters were applied, so you still need to filter** ✓
- c) Every site failed. *Failures list filter IDs.*
- d) The file is invalid. *`.` is legal.*

**Q6.** A VCF loads in IGV and pysam without warnings. A strict validator flags the GT of 300 samples. Most likely cause?

- **a) FORMAT lists `AD:GT...`. GT is not first, so htslib silently drops the genotypes** ✓
- b) The CRLF line endings. *They are legal in 4.3+ and htslib accepts them.*
- c) Phased `|` genotypes. *They are legal.*
- d) The missing `##FILTER=<ID=PASS>` line. *PASS need not be declared.*

**Q7.** Why does the trio use gVCF → joint genotyping instead of calling each sample to a variants-only VCF and merging?

- a) gVCF files are smaller. *They are larger than variants-only VCFs.*
- **b) A merged variants-only file cannot tell "parent hom-ref" from "parent not covered", and adding a sample would otherwise mean re-calling everyone (N+1)** ✓
- c) VCF cannot hold three samples. *It can.*
- d) GenotypeGVCFs aligns reads better. *It never sees reads.*

**Q8.** The child is `1/1` at chr2:166,012,500 (DP 14), the mother `0/1`, the father `0/0`. The same region shows half coverage in the child. Best interpretation?

- a) A homozygous de novo SNV. *That needs two independent mutations.*
- **b) A Mendelian violation explained by a paternal-chromosome deletion: the child is hemizygous for the maternal allele** ✓ *It fits the `<DEL>` and the WIG dip.*
- c) Contamination. *Foreign reads push calls toward heterozygous; they do not create a clean hom-alt at half depth.*
- d) A sample swap. *A swap would cause violations genome-wide, not in one 368-bp window.*

## 10. Case-thread hooks

- **Lesson opener (gVCF).** Three `*.g.vcf.gz` files arrive, one per blood sample. Ask before anything else: *the father has no line at 166,009,959; does he carry the variant?* The gVCF block answers it (EX-07). Motivate N+1 with "a sibling's sample arrives next month".
- **Joint genotyping beat.** Show `bcftools merge --gvcf` splitting blocks at the child's variant (§3.6), then the final trio VCF (§3.1).
- **De novo filter (VCF).**
  - The `bcftools view -i 'GT[0]="het" && GT[1]="RR" && GT[2]="RR" && FMT/GQ[0]>=20 && FMT/GQ[1]>=20 && FMT/GQ[2]>=20 && FMT/DP[1]>=10 && FMT/DP[2]>=10'` filter returns the SNV at 166,009,959 [verified: test].
  - The twist: the same filter *drops* the `<DEL>` because it has no GQ/DP. The real lesson-ending finding is that the child also carries a de novo 368-bp deletion over target T3. It comes from the SV caller and agrees with the WIG dip and with EX-08's hemizygous `1/1`.
- **Handoff to GTF.** "chr2:166,009,959 C>T: so what?" Remember that SCN1A is on the minus strand, so the c. change is G>A. *The coordinate must be re-picked at build time to fall in a real SCN1A MANE exon, with the REF re-checked against GRCh38.*
- **Handoff to BEDPE.** The breakend form of the deletion (§3.5) converts to the BEDPE row in `intervals-signals.md`. The anchor POS 166,012,370 equals the BED start.
- **Handoff to PAF/GFA.** Long reads resolve whether the deletion is simple or part of a rearrangement. If it is complex, the VCF uses `EVENT`/`EVENTTYPE` to group breakends (4.4+).
- **Capstone case-folder candidates:**
  - `trio.vcf.gz` without `.tbi`, or with a stale one;
  - `child.g.vcf.gz` compressed with plain gzip;
  - `father.all_sites.vcf` from UnifiedGenotyper `EMIT_ALL_SITES` (looks like a gVCF but is invalid for joint genotyping);
  - an Illumina gVCF (`BLOCKAVG_min30p3a`) mixed into the GATK set;
  - `annot.vcf` with `2` contigs against the `chr2` reference;
  - a PED with mother and father swapped;
  - a VCF with QUAL `high` that "loads fine".

## 11. "Read more" candidates

- **Genotype ordering formula** for any ploidy, and the triangular matrix (§1.6.2).
- **Local alleles (4.5):** `LAA`, `LAD`, `LPL` keep PL arrays small in cohorts with many ALTs. `<NON_REF>` became an alias of `<*>`, and FORMAT `LEN` gives per-sample block lengths.
- **QUAL's two definitions:** P(no variant) when ALT is present, P(variant) when ALT is `.`.
- **Breakend details:** inserted sequence in `t`, single breakends (`.A`, `T.`), telomeres at POS 0/N+1, and `CIPOS`/`HOMSEQ` micro-homology.
- **SV version history:** SVLEN sign (4.2/4.3 negative deletions → 4.4 positive), SVCLAIM D/J, END deprecated (4.5), SVTYPE deprecated (4.4).
- **Percent-encoding** of `: ; = % , CR LF TAB` (4.3+). **IUPAC** reference bases are reduced to the first base alphabetically.
- **Reserved integers:** -2^31..-2^31+7 are unusable because BCF uses them as sentinels (missing, END_OF_VECTOR).
- **BCF2:** header dictionaries; why undeclared tags can be read in VCF but not written to BCF.
- **Phasing:** `PS` versus 4.4's `PSL/PSO/PSQ`; partial phasing in polyploids.
- **Other 4.4/4.5 extensions:** base modifications (`M5mC`, 4.5) and tandem repeats (`<CNV:TR>`, `RN/RUS/RUC`, 4.4).
- **tabix/CSI internals:** BAI-style binning with 16 kb linear windows. `.tbi` stops at 2^29; CSI's `min_shift`/`depth` extend it.
- **GATK band defaults and `--floor-blocks`;** Strelka's `min30p3a` rule; DRAGEN uses its own GQ cutoffs (search snippet only).
- **GATK PossibleDeNovo** [verified: source]:
  - The site must be biallelic, and the trio must be a parents-hom-ref/child-het violation.
  - `hiConfDeNovo`: child GQ ≥ 20 and both parents ≥ 20 (`--denovo-parent-gq-threshold`), with DP ≥ `--denovo-depth-threshold` (default 0).
  - `loConfDeNovo`: child GQ ≥ 10 and parents GQ > 0.
  - In both cases, the ALT allele count must be < max(4, 0.1% of samples).
  - Lab filters such as allele balance 0.3-0.7 are local practice [from memory - verify].
- **Mendelian rules on chrX for males** (`bcftools +mendelian2 -p 1X:`), and PAR coordinates per build.
- **Spec errata worth a sidebar (master, 2026-10-16):**
  - In §5.3 the SV example puts `delbp2` at POS 2 with REF `A`. Given `chrA = ATGCGAAAAAAATGT`, the mate should be POS 5 with REF `G`. Its `<INS>` row gives REF `T` at POS 14, where the sequence has `G`.
  - The §5.5 gVCF example has `...0,60,900;14` (a `;` where `:` belongs). Its 4396 row lists 6 FORMAT keys for 4 values.
  - Moral: even the spec's examples need a validator.

## 12. Sources

### Read in full or in the relevant parts, with versions

- `https://raw.githubusercontent.com/samtools/hts-specs/master/VCFv4.5.tex`: VCF 4.5, last changed e821e4f (2026-02-24); repository HEAD 510c107 (2026-08-11). Primary source for all rules.
- `.../hts-specs/master/VCFv4.4.tex`, `VCFv4.3.tex`, `VCFv4.2.tex` (c101c79), and `VCFv4.1.tex`: version differences and change lists.
- `.../hts-specs/master/tabix.tex` (38f353f) and `CSIv1.tex` (85c048d).
- `https://raw.githubusercontent.com/samtools/htslib/develop/tabix.1` (htslib 1.24, 9 July 2026) and `bgzip.1`.
- `https://raw.githubusercontent.com/samtools/bcftools/develop/doc/bcftools.txt`: `norm`, `merge --gvcf`, `convert --gvcf2vcf`, `index`, plugin list. Also `.../plugins/mendelian2.c` (usage text).
- GATK master source on raw.githubusercontent.com (`broadinstitute/gatk/master/src/main/java/org/broadinstitute/hellbender/...`):
  - `HaplotypeCallerArgumentCollection.java` (GQ bands, floor-blocks), `HaplotypeCaller.java` (`-ERC GVCF` usage);
  - `utils/variant/writers/GVCFBlockCombiner.java`, `GVCFWriter.java`, `HomRefBlock.java`, `GVCFBlock.java`;
  - `utils/variant/GATKVCFConstants.java`, `utils/variant/GATKVariantContextUtils.java` (no-call logic);
  - `tools/walkers/GenotypeGVCFs.java`, `tools/walkers/CombineGVCFs.java`, `tools/genomicsdb/GenomicsDBImport.java`;
  - `tools/walkers/annotator/PossibleDeNovo.java`.
- `https://github.com/broadinstitute/gatk-docs` (git clone, master), read in full:
  - `gatk3-faqs/What_is_a_GVCF_and_how_is_it_different_from_a_'regular'_VCF?.md`
  - `gatk3-dictionary/Spanning_or_overlapping_deletions_(*_allele).md`
  - `gatk3-dictionary/Pedigree___PED_files.md`
  - `gatk2-ancient/Why_do_joint_calling_rather_than_single-sample_calling?_[RETIRED].md`
  - `blog-2012-to-2019/2014-03-06-The_GATK_reference_model_pipeline_for_incremental_joint_discovery,_in_full_detail.md`
- `https://github.com/Illumina/strelka` (branch v2.9.x): `docs/userGuide/README.md`, `src/c++/lib/applications/starling/gvcf_options.{hh,cpp}`, `gvcf_writer.cpp`, `gvcf_header.cpp`, `gvcf_block_site_record.cpp`.
- `https://raw.githubusercontent.com/sequencing/gvcftools/master/README.md` (it only points to the unreachable Google Sites page).
- `https://raw.githubusercontent.com/EBIvariation/vcf-validator/master/README.md`: a strict validator with error/warning levels and `vcf_assembly_checker` for REF checks. Supported VCF versions were not stated [verify].

### Real reference data

- `https://s3.amazonaws.com/broad-references/hg38/v0/Homo_sapiens_assembly38.fasta`: HTTP byte range for chr2:166,009,001-166,017,000 (`.fai`: offset 251446211, 100 bases/line). Used for every REF base and `norm --check-ref`.

### Search results only (snippets, pages not opened)

- Illumina "gVCF Files" help pages (help.basespace.illumina.com; support.illumina.com BaseSpace field descriptions): ALT `.`, END, `BLOCKAVG_min30p3a` wording, and "printed site block sample values are the minimum".
- The GATK article 360035531812 is titled "GVCF - Genomic Variant Call Format" (not "Genotype"). The snippet says NON_REF, END and `##GVCFBlock` work as described in the FAQ above.
- The DRAGEN "gVCF Output" pages (support-docs.illumina.com, v39/v42) exist and use DRAGEN-specific GQ band defaults. The values were not seen.

### Unreachable (DNS failure or blocked)

- `gatk.broadinstitute.org` (both the "Genotype-" and "Genomic-Variant-Call-Format" URLs, article 360035531812). Its content was replaced by the gatk-docs FAQ and GATK source.
- `help.basespace.illumina.com/articles/descriptive/gvcf-files/` (cited by the VCF spec itself), `sites.google.com/site/gvcftools/home/about-gvcf`, `support-docs.illumina.com` (DRAGEN).
- `api.github.com` and the `gh` CLI for gatk-docs (403: repository not enabled for the session; `git clone` worked).
### Not consulted

- PLINK PED documentation (`zzz.bwh.harvard.edu/plink`; not attempted). PED columns were taken from the GATK PED article and the bcftools usage text.
