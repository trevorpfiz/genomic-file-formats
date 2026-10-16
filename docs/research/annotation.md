# Research: GTF and GFF3 (gene annotation)

Research notes for the "Genomic File Formats" course, covering the GTF/GFF3 lesson. Written 2026-10-16.

**Spec versions used**

- **GFF3:** Sequence Ontology specification **v1.26** (Lincoln Stein, 18 Aug 2020). I read it in full from the SO GitHub repository. Section names below quote its headings, e.g. "Column 8", "NOTE 4", "Other Syntax".
- **GTF:** **GTF2.2** (Brent lab, 2007). The original page (mblab.wustl.edu/GTF22.html) could not be reached. GTF2.2 content comes from two places:
  - AGAT's history document, which reproduces the GTF2 (2003) text verbatim and summarizes GTF2.1 and GTF2.2;
  - UCSC's GTF help page, which summarizes GTF2.2.
- **Ensembl/GENCODE dialect:** checked against real files (see Sources).

**Evidence tags**

- **[verified: file]**: observed in a real Ensembl, GENCODE or RefSeq file.
- **[verified: test]**: I ran it with pysam 0.24.1 (htslib tabix) or gffutils 0.14 on 2026-10-16.
- **[verified: arithmetic]**: I computed it with a script.
- **[from memory - verify]**: the primary source was unreachable, so the claim relies on my memory. Check it before it ships.

In code blocks, **columns are separated by literal TAB characters**. Spaces inside GTF column 9, and spaces in `##` directives, are real spaces.

---

## 1. Purpose and place in the pipeline

**What it is.** A gene annotation file is the map legend for the reference genome. FASTA says *what the bases are*. GTF/GFF3 says *what they mean*: where each gene, transcript, exon, coding sequence (CDS) and UTR sits, on which strand, and in which reading frame.

**Producers**

- **Annotation consortia:**
  - GENCODE/Ensembl ship GTF and GFF3 for human. GENCODE marks the clinically preferred transcript with `MANE_Select` tags.
  - NCBI RefSeq ships GFF3 and GTF.
  - UCSC stores genePred tables and exports GTF with `genePredToGtf`.
- **Gene predictors and annotation pipelines** for non-model organisms (AUGUSTUS, BRAKER, MAKER; usually GFF3) [from memory - verify].
- **Transcript assemblers** such as StringTie (GTF) [from memory - verify].
- **Liftover tools** that move an annotation onto a new assembly.

**Consumers**

- splice-aware aligners (STAR builds its splice-junction database from a GTF);
- read counters (featureCounts, HTSeq group exons by `gene_id`);
- variant-effect predictors (Ensembl VEP, SnpEff), which turn "chr2:N C>T" into "gene X, transcript Y, exon 13, c.N, p.Arg→Ter";
- genome browsers (IGV, JBrowse; usually bgzipped and tabix-indexed);
- `bedtools`, which needs exons converted to BED for coverage QC (all [from memory - verify] except bedtools, whose docs say "bedtools accounts for the fact the GFF uses a one-based position and BED uses a zero-based start position").

**The disease-analysis question it answers.** The variant caller tells us *where* the child's genome differs. The gene model tells us *what that difference touches*:

- Which gene? Is it a seizure gene?
- Which transcript? Do we report on the clinical reference transcript?
- Which exon or intron? Is it near a splice site?
- What happens to the protein? Missense, stop-gain or stop-loss; and for an exon deletion, in-frame loss or frameshift?

Without the annotation, every de novo variant is just a coordinate.

```
reference FASTA (GRCh38) ─┐
gene annotation GTF/GFF3 ─┼─> overlap + translate ─> "gene, transcript, exon N, c.150, codon 50"
trio VCF / coverage WIG ──┘                          "exon 3 deleted: 100 bp, 100 mod 3 = 1 -> frameshift"
```

## 2. Mental model

**Core intuition: a gene model is a tree of intervals, flattened into one line per interval.**

```
gene  ─┬─ transcript A ─┬─ exon 1 ─ (5'UTR part, CDS part)
       │                ├─ exon 2 ─ CDS
       │                └─ exon 3 ─ (CDS part, 3'UTR part)
       └─ transcript B ─┬─ exon 1        <- the same exon, shared
                        └─ exon 3
```

The format has to solve four design problems:

1. **Trees in a line-oriented text file.** The format must stay grep-, sort- and awk-friendly. GFF was designed at a 1997 gene-finding meeting so that "each feature is described on a single line, and line order is not relevant" (AGAT history).
2. **Sharing.** Alternative transcripts reuse exons.
3. **Discontinuity.** One CDS (one protein) is spread over several exons.
4. **Reading frame across splice junctions.** A codon can straddle an intron. Translating one CDS segment on its own requires knowing how many bases to skip first.

**How the two dialects store the tree**

- **GFF3 stores pointers.** Each feature can have an `ID`. Children name their parent with `Parent=`, and a shared exon names several parents (`Parent=tx1,tx2`).
- **GTF stores group labels.** Every line repeats `gene_id "..."; transcript_id "...";`. A shared exon is written once per transcript, and you rebuild the tree by grouping lines on `transcript_id`.

**Analogy for students who code:**

- **GFF3 is a normalized relational table.** `ID` is the primary key and `Parent` is a foreign key. You join to rebuild the tree.
- **GTF is a denormalized "long" data frame.** Every row repeats its group keys, and you `group_by(transcript_id)`.

Both describe the same gene. Converting between them is a join or an un-join plus the stop-codon adjustment (see GTF-M03).

**Analogy for phase: a book torn into pages and rebound.** Exons are pages, and codons are three-letter words that can straddle a page break. Phase is the note at the top of each page: "skip N letters, they finish the word from the previous page". Delete a page, and the next page's note is wrong unless the deleted page held a whole number of words. That is the **exon length mod 3** rule (section 4).

**Why it looks the way it does**

- **Nine fixed columns** let generic tools index any dialect: `tabix -p gff` uses columns 1, 4 and 5 for GTF and GFF3 alike. Everything producer-specific is pushed into column 9.
- **1-based closed coordinates** come from the biologists' numbering in GFF1 (1997): "Sequence numbering starts at 1".
- **GFF3 limits column 3 to Sequence Ontology terms**, so that "exon" means the same thing in every file. This was one of the six stated goals of GFF3.

## 3. Anatomy

### 3.1 The nine columns

| # | GFF3 name | GTF name | Content | GFF3 v1.26 rule | GTF2.2 / Ensembl-GENCODE rule |
|---|---|---|---|---|---|
| 1 | seqid | seqname | Landmark (chromosome or contig) | No unescaped whitespace; must not start with `>`; escape characters outside `[a-zA-Z0-9.:^*$@!+_?-|]` | Must match the reference: Ensembl uses `2`, GENCODE uses `chr2` [verified: file] |
| 2 | source | source | Program or database | Free text | Free text (`HAVANA`, `ENSEMBL`, `ensembl_havana`) [verified: file] |
| 3 | type | feature | Feature type | SO term name or `SO:nnnnnnn` accession | GTF2.2: `CDS`, `start_codon`, `stop_codon` required; `5UTR`, `3UTR`, `inter`, `inter_CNS`, `intron_CNS`, `exon` optional. The Ensembl/GENCODE dialect adds `gene`, `transcript`, `UTR` or `five_prime_utr`/`three_prime_utr`, and `Selenocysteine` |
| 4-5 | start, end | start, end | Interval | Positive 1-based integers, start ≤ end, both ends inclusive | Same |
| 6 | score | score | Number | Float or `.`; "semantics ... ill-defined" | Number or `.` |
| 7 | strand | strand | Strand | `+`, `-`, `.` (unstranded), `?` (unknown) | `+` or `-` in GTF2/2.2 (AGAT table) |
| 8 | phase | frame | Bases to skip from the 5' end to reach the first complete codon | `0`, `1`, `2`; required on CDS (NOTE 4); `.` otherwise | Same meaning; `0`-`2` on CDS, start_codon and stop_codon |
| 9 | attributes | attributes | Everything else | `tag=value;tag=value`, multiple values comma-separated, unquoted | `key "value";`, separated by exactly one space; `gene_id` and `transcript_id` mandatory |

### 3.2 Annotated minimal valid GFF3 (toy gene DEMO1, plus strand)

This is a toy contig used throughout the exercises. It passed my structural checks and `gffutils` rebuilt the tree correctly [verified: test].

```
##gff-version 3
##sequence-region ctg1 1 12000
ctg1	demo	gene	1001	9000	.	+	.	ID=gene:DEMO1;Name=DEMO1;biotype=protein_coding
ctg1	demo	mRNA	1001	9000	.	+	.	ID=tx:DEMO1-201;Parent=gene:DEMO1;Name=DEMO1-201;tag=MANE_Select
ctg1	demo	exon	1001	1300	.	+	.	ID=ex1;Parent=tx:DEMO1-201
ctg1	demo	exon	3001	3150	.	+	.	ID=ex2;Parent=tx:DEMO1-201
ctg1	demo	exon	5001	5100	.	+	.	ID=ex3;Parent=tx:DEMO1-201
ctg1	demo	exon	7001	9000	.	+	.	ID=ex4;Parent=tx:DEMO1-201
ctg1	demo	five_prime_UTR	1001	1200	.	+	.	Parent=tx:DEMO1-201
ctg1	demo	CDS	1201	1300	.	+	0	ID=cds:DEMO1-201;Parent=tx:DEMO1-201
ctg1	demo	CDS	3001	3150	.	+	2	ID=cds:DEMO1-201;Parent=tx:DEMO1-201
ctg1	demo	CDS	5001	5100	.	+	2	ID=cds:DEMO1-201;Parent=tx:DEMO1-201
ctg1	demo	CDS	7001	7301	.	+	1	ID=cds:DEMO1-201;Parent=tx:DEMO1-201
ctg1	demo	three_prime_UTR	7302	9000	.	+	.	Parent=tx:DEMO1-201
###
```

| Line(s) | What to notice |
|---|---|
| `##gff-version 3` | Must be the first line ("Other Syntax"). `3.1.26` is also legal, but plain `3` is the most portable. |
| `##sequence-region ctg1 1 12000` | Space-separated. Optional, but "strongly encouraged": it lets parsers bounds-check every feature on `ctg1`. |
| gene | Top of the tree, so it has an `ID` and no `Parent`. `biotype=` is lowercase, which makes it a free application attribute. Uppercase-initial tags are reserved. |
| mRNA | `Parent=gene:DEMO1` is a part_of link. IDs may contain `:`; only `; = & ,` are reserved in column 9. |
| exon ×4 | Exon IDs are optional because exons have no children here. A second isoform would add its ID to the same exon's `Parent=` list instead of duplicating the line. |
| CDS ×4 | **Four lines, one feature.** The shared `ID=cds:DEMO1-201` makes them one discontinuous CDS (the "ID" rule), and an ID is mandatory for multi-line features. Phases 0, 2, 2, 1 chain by `next = (phase − length) mod 3`: 100 bp → 2, 150 → 2, 100 → 1. The CDS **includes the stop codon** (NOTE 5), so the total is 651 bp = 217 codons = 216 aa + stop [verified: arithmetic]. |
| UTR lines | Optional: "implied by the combination of exon and CDS" (NOTE 3). |
| `###` | All forward references are resolved. A streaming parser can now emit the finished gene. |

### 3.3 The same gene in GTF (Ensembl/GENCODE-style dialect)

```
ctg1	demo	gene	1001	9000	.	+	.	gene_id "DEMO1"; gene_name "DEMO1"; gene_type "protein_coding";
ctg1	demo	transcript	1001	9000	.	+	.	gene_id "DEMO1"; transcript_id "DEMO1-201"; gene_name "DEMO1"; tag "basic"; tag "MANE_Select";
ctg1	demo	exon	1001	1300	.	+	.	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "1";
ctg1	demo	CDS	1201	1300	.	+	0	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "1";
ctg1	demo	start_codon	1201	1203	.	+	0	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "1";
ctg1	demo	exon	3001	3150	.	+	.	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "2";
ctg1	demo	CDS	3001	3150	.	+	2	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "2";
ctg1	demo	exon	5001	5100	.	+	.	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "3";
ctg1	demo	CDS	5001	5100	.	+	2	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "3";
ctg1	demo	exon	7001	9000	.	+	.	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "4";
ctg1	demo	CDS	7001	7298	.	+	1	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "4";
ctg1	demo	stop_codon	7299	7301	.	+	0	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "4";
```

What to notice:

- **The last CDS line ends at 7298, not 7301.** GTF2 says: "Unlike Genbank annotation, the stop codon is not included in the CDS for the terminal exon". The stop codon is its own 3-bp line. The GTF CDS totals 648 bp; the GFF3 CDS totals 651 bp.
- **`start_codon` is *inside* the CDS.**
- **The `gene` line has no `transcript_id`.** That is the current Ensembl and GENCODE convention, but strict GTF2.2 requires both IDs on every line. In GENCODE v19, gene lines carried `transcript_id` equal to the `gene_id` [verified: file].
- **`tag` repeats.** It is a multi-valued key, so a dictionary-based parser that keeps the last value loses `basic`.
- **There are no `ID`/`Parent` attributes.** Hierarchy comes only from shared `gene_id` and `transcript_id` values.

### 3.4 GFF3 column 9: the reserved tags (all from "Column 9")

| Tag | Meaning | Multi-valued? |
|---|---|---|
| `ID` | Unique within the file; required for features with children or spanning several lines | no |
| `Name` | Display name, need not be unique | no |
| `Alias` | Secondary name or accession | yes |
| `Parent` | part_of link(s) to `ID`(s) | yes |
| `Target` | `target_id start end [strand]` for alignments | no |
| `Gap` | Alignment string, e.g. `M8 D3 M6 I1 M6` | no |
| `Derives_from` | Temporal, not part_of, relation (polycistronic genes, polypeptides) | no |
| `Note` | Free text | yes |
| `Dbxref` | `DBTAG:ID`; split on the **first** colon | yes |
| `Ontology_term` | e.g. `GO:0046703` | yes |
| `Is_circular` | Flag on a circular landmark | no |

"Attribute names are case sensitive." "All attributes that begin with an uppercase letter are reserved for later use. Attributes that begin with a lowercase letter can be used freely by applications."

### 3.5 Ensembl/GENCODE attribute crib (GTF)

| Key | Ensembl GTF | GENCODE GTF |
|---|---|---|
| Gene and transcript IDs | `gene_id "ENSG00000198445"; gene_version "4";` (unversioned ID plus a separate version) [verified: file] | `gene_id "ENSG00000223972.4"` (versioned) [verified: file, v19] |
| Biotype | `gene_biotype`, `transcript_biotype` [verified: file] | `gene_type`, `transcript_type` [verified: file] |
| Names | `gene_name`, `transcript_name` (`CCT8L2-201`) | `gene_name`, `transcript_name` |
| Exon | `exon_number "1"` (quoted), `exon_id`, `exon_version` [verified: file] | `exon_number 1;` (unquoted), `exon_id` [verified: file, v19] |
| Flags | `tag "CCDS"; tag "basic";` (repeated key), `ccds_id`, `transcript_support_level "NA"` [verified: file] | `tag "basic"`, `level 2;` (unquoted; 1 = verified, 2 = manual, 3 = automatic [from memory - verify]), `havana_gene`, `havana_transcript` |
| Clinical transcript | `tag "MANE_Select"`, `tag "Ensembl_canonical"` [from memory - verify] | same tags [from memory - verify] |
| UTR feature type | `five_prime_utr` / `three_prime_utr` (from Ensembl release 82, per AGAT) [verified: file] | `UTR` [from memory - verify for current releases] |

## 4. Coordinate system and conventions

- **Coordinates are 1-based and closed** in GFF1, GFF2, GTF and GFF3. Length = `end − start + 1`. The Ensembl docs give the example: "setting start-end to 1-2 describes two bases".
- **Converting to BED** (0-based, half-open): `bed_start = start − 1` and `bed_end = end`. Exon `5001-5100` becomes BED `5000 5100` and region string `ctg1:5001-5100`.
- **`start ≤ end` always, on both strands.** Strand lives in column 7 and is never expressed by swapping start and end.
- **Exception, circular landmarks:** a feature crossing the origin uses `end = landmark length + distance past the origin`. The spec's phage example is `6006 7238` on a 6,407-bp genome, with `Is_circular=true` on the landmark.
- **Zero-length features** (insertion sites) have `start = end`, and "the implied site is to the right of the indicated base" (GFF3 columns 4 and 5).
- **Strand and the 5' end.** On `-`, a feature's 5' end is its `end` coordinate. So:
  - phase is counted from `end` (the spec: "the 5' end for CDS features on the minus strand is the feature's end");
  - transcript order runs from high to low coordinates;
  - `exon_number "1"` is the rightmost exon [from memory - verify; Ensembl/GENCODE convention].
- **Phase chain rule.** Walk a transcript's CDS segments 5'→3' (descending coordinates on `-`). The first complete CDS has phase 0. Then `phase_next = (phase − length) mod 3` [verified: arithmetic against every CDS chain in the GFF3 spec's EDEN example and a RefSeq mouse gene].
- **In-frame test for an exon deletion.** Deleting (or skipping) an internal, fully coding exon of length L keeps the downstream frame **iff L mod 3 = 0**. Equivalently, the deleted exon's CDS phase equals the next CDS's phase, so you can read it straight off column 8.
  - In-frame still means one codon may change. The codon split across the new junction is rebuilt from different bases.
  - The rule does not cover the exon holding the start or the stop codon.
- **Phase vs "frame".** GFF1 (1997) and GTF2 called column 8 "frame", but it already had today's meaning. GFF1: "'1' indicates that there is one extra base, i.e., that the second base of the region corresponds to the first base of a codon". GTF2: "Note that the frame is not the length of the CDS mod 3".
  - GFF3 renamed the column "phase" and warned that it is not "frame" in the usual sense ("<codon position> modulo 3" relative to the ORF start).
  - The value's meaning never changed between GFF1, GTF and GFF3. Other formats invert it: UCSC genePred `exonFrames` uses 0→0, 1→2, 2→1 (kent `genePred.c`, `phaseToFrame`) [verified: source].
- **Headers.** GFF3 requires `##gff-version 3` on line 1; other directives are `##sequence-region`, `##species`, `##genome-build`, `##feature-ontology`, `###` and `##FASTA`. GTF has no version line. Producers add comments instead:
  - GENCODE: `##description: ... (GRCh37), version 19 (Ensembl 74)`, `##provider: GENCODE`, `##format: gtf`, `##date:` [verified: file];
  - Ensembl: `#!genome-build GRCh38.p14` and similar [from memory - verify].
- **Ordering.** Neither spec requires sorting. GFF3 allows forward references (child before parent) until a `###`. Producers usually group by gene: gene, then transcript, then its exons, CDS and codons [verified: file].
- **Compression and indexing.**
  - Provider files are `.gtf.gz` / `.gff3.gz`, usually plain gzip [from memory - verify per provider].
  - Random access needs coordinate sorting, then `bgzip`, then `tabix -p gff`. The preset means "one-based positions, `-s 1 -b 4 -e 5 -c '#'`" (tabix(1)), and the man page gives the recipe `sort -t"<TAB>" -k1,1 -k4,4n`.
  - Tests [verified: test]:
    - an unsorted file fails with `[E::hts_idx_push] Unsorted positions on sequence #1: 7299 followed by 7001`;
    - a plain-gzip file fails to index;
    - BGZF output begins with `1f 8b 08 04 ... 42 43` ("BC");
    - querying `ctg1:5050` returns the overlapping `gene`, `mRNA`/`transcript`, `exon` and `CDS` lines.
  - A GFF3 with a `##FASTA` section cannot be tabix-indexed until the FASTA is stripped.

## 5. Validity rules

Severity:

- **error**: the spec says MUST, or the data become wrong;
- **warning**: suspicious or tool-dependent;
- **convention**: de facto practice, not required by any spec.

`<TAB>` in the violation column means a literal tab.

### 5a. GFF3: structural (GFF3 v1.26)

| ID | Rule | Spec section | Minimal violation | Severity |
|---|---|---|---|---|
| GFF3-S01 | The first line is `##gff-version 3` (optionally `3.x.y`), and it appears only once | "Other Syntax"; changelog 1.21 | Line 1 `# exported by pipeline`, line 2 `##gff-version 3` | error |
| GFF3-S02 | Exactly 9 TAB-separated columns. Parsers split on tabs only; spaces are legal inside fields | "Description of the Format" | Columns separated by spaces (the spec's own examples render with spaces, a copy-paste trap) | error |
| GFF3-S03 | An undefined field is `.`, never empty | "Description of the Format" | `ctg1<TAB><TAB>gene<TAB>...` | error |
| GFF3-S04 | seqid has no unescaped whitespace and no leading `>`; characters outside `[a-zA-Z0-9.:^*$@!+_?-|]` are escaped | "Column 1" | `chr 2` | error |
| GFF3-S05 | type is an SO term or `SO:` accession that is_a `sequence_feature` | "Column 3" | `5UTR` (GTF2.2 vocabulary) instead of `five_prime_UTR` | error by spec; many tools only warn |
| GFF3-S06 | start and end are positive 1-based integers with start ≤ end (circular exception) | "Columns 4 & 5"; changelog 1.21 | start `0`; `2000<TAB>1000` | error |
| GFF3-S07 | score is a floating-point number or `.` | "Column 6" | `high` | error |
| GFF3-S08 | strand ∈ `+ - . ?` | "Column 7" | `1` | error |
| GFF3-S09 | phase ∈ `0 1 2 .`; every CDS has 0, 1 or 2 | "Column 8"; NOTE 4 ("MUST") | `CDS ... +<TAB>.<TAB>ID=cds1` | error |
| GFF3-S10 | Column 9 holds `tag=value` pairs joined by `;`, with multiple values joined by `,`. Values are not quoted; quotes become part of the value | "Column 9" | `gene_id "DEMO1"; transcript_id "DEMO1-201";` | error |
| GFF3-S11 | Percent-encode tab `%09`, newline `%0A`, CR `%0D`, `%` `%25` and control characters everywhere. In column 9, also encode `;` `%3B`, `=` `%3D`, `&` `%26` and `,` `%2C`. `+` may not stand for a space | "Description of the Format" | `Note=50% GC` (`%` not followed by hex); `Note=see notes; urgent` (`urgent` has no `=`) | error |
| GFF3-S12 | Only `Parent`, `Alias`, `Note`, `Dbxref` and `Ontology_term` may take several values | "Column 9"; changelog 1.19 | `ID=ex1,ex2` | error |
| GFF3-S13 | Tags are case-sensitive, and uppercase-initial tags are reserved: only the 11 defined ones may be used | "Column 9" | `Gene_name=DEMO1` (reserved namespace) | error |
| GFF3-S14 | No end-of-line comments. `#` starts a comment line and `##` a directive | "Other Syntax" | `...;Parent=tx1 # check this` | error |
| GFF3-S15 | `##sequence-region seqid start end` appears at most once per seqid | "Other Syntax" | Two `##sequence-region ctg1 ...` lines | error |
| GFF3-S16 | After `##FASTA`, only FASTA may follow. A line starting with `>` implies `##FASTA` | "Other Syntax" (##FASTA) | A feature line after a `>ctg1` record | error |
| GFF3-S17 | `Target` is `target_id start end [strand]`, with spaces in `target_id` written as `%20` | "Column 9" (Target) | `Target=EST23` | error |

### 5b. GFF3: semantic and consistency

| ID | Rule | Source | Minimal violation | Severity |
|---|---|---|---|---|
| GFF3-M01 | IDs are unique in the file. Lines sharing an ID are **one** discontinuous feature, so they need the same seqid, type and source (GenomeTools enforces this; a different strand only warns) | "Column 9" (ID); changelog 1.20; GenomeTools | Exon `ID=ex3` written on two lines with different `Parent`s, meant as two exons | error |
| GFF3-M02 | `ID` is required on features with children and on multi-line features | "Column 9" (ID) | Five CDS lines with no `ID`: a strict reader sees five separate one-exon CDSs | error |
| GFF3-M03 | Every `Parent` (and `Derives_from`) value resolves to an `ID` in the file | "Column 9" (Parent); GenomeTools "was not defined" | `Parent=tx:DEMO1-21` (typo); `Parent=tx1,` (trailing comma) | error |
| GFF3-M04 | Parent links must be SO part_of relations, with no cycles | "Parent (part_of) Relationships" ("should trigger a parse exception") | `gene ... Parent=tx1` while `tx1` has `Parent=gene1` (a cycle) | error |
| GFF3-M05 | After `###`, nothing may reference an ID defined before it | "Other Syntax" (###); GenomeTools | An exon after `###` whose `Parent` is an earlier mRNA | error |
| GFF3-M06 | Features lie inside their `##sequence-region`, unless the landmark is `Is_circular` | "Other Syntax"; "Circular Genomes" | Region `ctg1 1 12000`, feature end `12050` | error |
| GFF3-M07 | The seqid exists in the reference FASTA (`.fai`), and end ≤ contig length | Consistency with the build | `chr2 ... 250000000` when GRCh38 chr2 is 242,193,529 bp | error |
| GFF3-M08 | CDS phases chain: `phase_next = (phase − len) mod 3`, walking 5'→3' | Derived from "Column 8" | CDS phases `0,0,2,1` for lengths 100, 150, 100, 301 | error (wrong protein) |
| GFF3-M09 | A complete CDS includes start and stop codons: (total − first phase) is a multiple of 3, and with FASTA it starts with ATG and ends with a stop | NOTE 5 (since 1.13) | Total CDS 650 bp | warning (partial models are legitimate) |
| GFF3-M10 | A child is on the same seqid as its parent (and, in gene models, the same strand) | Implicit in the spec; GenomeTools errors | An exon on `chr3` whose parent mRNA is on `chr2` | error (tool-enforced) |
| GFF3-M11 | A child need **not** lie inside its parent: "GFF3 does not enforce a rule in which features must be wholly contained". Gene-model QC still flags exons outside their mRNA | "Parent (part_of) Relationships" | Exon `1001-1300` under mRNA `1050-9000` | warning |
| GFF3-M12 | seqid style and build match the rest of the case folder (`chr2`, `2` or `NC_000002.12`); `##genome-build` agrees | Consistency | GFF3 uses `2`; the BAM `@SQ` uses `chr2` | error (pipeline) |
| GFF3-M13 | A lowercase `parent=` is legal but is **not** a hierarchy link | "Column 9" (case-sensitive) | `ID=ex3;parent=tx:DEMO1-201`. gffutils silently dropped exon 3 from the transcript [verified: test] | warning |

### 5c. GFF3: conventions

| ID | Convention | Source | Severity |
|---|---|---|---|
| GFF3-C01 | Write `##gff-version 3` and include `##sequence-region` lines | Spec "strongly encouraged" | convention |
| GFF3-C02 | Three-level gene model: gene → mRNA/transcript → exon + CDS (+ UTR). Parent CDS on the transcript, not the gene, so UTRs can be computed | "Pathological Cases" (single-exon genes: "not recommended to parent the CDS directly onto the gene") | warning |
| GFF3-C03 | Share exons with multi-`Parent`. Give each transcript its own CDS lines, because phase is transcript-specific | Canonical gene: segment 5000-5500 has phase 0 in cds00001 and phase 1 in cds00003 | convention |
| GFF3-C04 | End each gene with `###` | "###" ("recommended") | convention |
| GFF3-C05 | For browsers, sort by (seqid, start), bgzip and tabix-index; no `##FASTA` | tabix(1) | convention (required by tabix) |
| GFF3-C06 | Namespaced IDs (`gene:ENSG...`, `transcript:ENST...`) and lowercase custom tags (`biotype=`, `tag=`, `transcript_id=`) | Ensembl GFF3 [verified: file] | convention |

### 5d. GTF: structural (GTF2.2 unless stated)

| ID | Rule | Source | Minimal violation | Severity |
|---|---|---|---|---|
| GTF-S01 | 9 TAB-separated fields; fields 1-8 always have a value (`.` if empty) | GTF2 (AGAT); Ensembl gff.html ("Fields **must** be tab-separated ... 'empty' columns should be denoted with a '.'") | Space-delimited line | error |
| GTF-S02 | start ≤ end; 1-based positive integers | GTF2 (AGAT) | `0<TAB>99` | error |
| GTF-S03 | strand is `+` or `-` | GTF2/2.2 (AGAT table) | `.` on an exon | error by GTF2.2; tools vary |
| GTF-S04 | frame is 0-2 on `CDS`, `start_codon` and `stop_codon`; `.` elsewhere | GTF2 frame definition; Ensembl gff.html | `CDS ... +<TAB>.<TAB>` | error |
| GTF-S05 | Attributes are `key "value";`. Every attribute ends with `;` and is followed by exactly one space (not a tab). Textual values are double-quoted | GTF2 (AGAT); UCSC GTF.html | `gene_id=DEMO1;transcript_id=DEMO1-201` | error |
| GTF-S06 | `gene_id` and `transcript_id` are present on every line, as the first two attributes ("Any other attributes ... must appear after these two") | GTF2/2.2 (AGAT, UCSC) | An exon line without `transcript_id` | error if missing; the order rule is a convention, since Ensembl puts `gene_version` between them [verified: file] |
| GTF-S07 | Feature vocabulary and capitalization: the GTF2.2 set; other types "will be ignored" | GTF2.1/2.2 (AGAT) | `cds` or `Exon` (silently ignored) | warning |
| GTF-S08 | `#` begins a comment anywhere, so fields may not contain `#` | GTF2 (AGAT) | `gene_name "ABC#2"` | warning |

### 5e. GTF: semantic and consistency

| ID | Rule | Source | Minimal violation | Severity |
|---|---|---|---|---|
| GTF-M01 | All lines of one `transcript_id` share seqname, strand and `gene_id` | GTF2.2 semantics; UCSC kent errAbort "all group members must be on same seq and strand" [verified: source] | One exon of a `+` transcript on `-` | error |
| GTF-M02 | `gene_id` and `transcript_id` are globally unique: the same transcript_id is never reused under two genes | GTF2 ("A unique identifier"); UCSC ("globally unique") | `transcript_id "T1"` under genes A and B | error |
| GTF-M03 | The CDS **excludes** the stop codon; `stop_codon` is separate | GTF2 (AGAT) [verified: file, Ensembl output, see Q6] | CDS ending at the `stop_codon` end | error (off-by-3 in conversions) |
| GTF-M04 | `start_codon` and `stop_codon` each total 3 bp per transcript; they may split over two lines when an intron interrupts them | GTF2 (AGAT) | A lone 2-bp `stop_codon` | error |
| GTF-M05 | CDS and codon features lie inside the same transcript's exons | GTF2.2 [from memory - verify] | A CDS extending into an intron | error |
| GTF-M06 | Frames chain as in GFF3-M08 | GTF2 frame definition | `0,0,2,1` for lengths 100, 150, 100, 298 | error |
| GTF-M07 | seqname style and build match the reference | Consistency | Ensembl `2` against a `chr2` BAM; GENCODE v19 (GRCh37) against GRCh38 reads | error (pipeline) |

### 5f. GTF: conventions (Ensembl/GENCODE dialect)

| ID | Convention | Evidence | Severity |
|---|---|---|---|
| GTF-C01 | `gene` and `transcript` summary lines (not in GTF2.2) | AGAT: Ensembl from release 75; GENCODE [verified: file] | convention |
| GTF-C02 | `gene` lines have no `transcript_id` (current), or `transcript_id` = `gene_id` (GENCODE v19) | [verified: file] | convention; strict validators flag it |
| GTF-C03 | Biotype keys: `gene_type` (GENCODE) vs `gene_biotype` (Ensembl) | [verified: file] | convention |
| GTF-C04 | Repeated keys (`tag "basic"; tag "MANE_Select";`) | [verified: file] | convention; parsers must keep lists |
| GTF-C05 | Unquoted numbers and double spaces in GENCODE (`exon_number 1;  exon_id ...`; `level 2;`) | [verified: file, v19] | convention; tolerate |
| GTF-C06 | `exon_number` counts in transcription direction | [from memory - verify] | convention |
| GTF-C07 | `tag "MANE_Select"` marks the one reporting transcript per human protein-coding gene (GRCh38) | [from memory - verify] | convention |

## 6. Recognition cues

**Decision procedure (in this order)**

1. **Nine TAB-separated columns**, with integers in columns 4 and 5 and column 7 in `+ - . ?`: a GFF-family file.
   - BED has integers in columns 2 and 3 (0-based).
   - VCF has a `#CHROM` header and POS in column 2.
   - PAF has 12+ columns with two sequence names.
2. **First line**:
   - `##gff-version 3` means GFF3;
   - `##gff-version 2` means GFF2;
   - `##gvf-version` means GVF, a GFF3 dialect for variants (GenomeTools accepts both prefixes).
3. **Column 9 syntax**:
   - `tag=value;` with no quotes means GFF3;
   - `gene_id "..."; transcript_id "...";` means GTF;
   - free text such as `Target "HBA_HUMAN" 11 55 ; E_value 0.0003` (GFF2 spec) or a bare group token such as `touch1` (UCSC GFF example) means GFF2 or GFF1-style.
4. **Column 3 vocabulary**:
   - `mRNA`, `five_prime_UTR`, `lnc_RNA`, `pseudogenic_transcript`, `biological_region` mean GFF3/SO [verified: file];
   - `transcript`, `start_codon`, `stop_codon`, `UTR`, `5UTR` mean GTF.
5. **Producer header comments**:
   - `##description:` / `##provider: GENCODE` / `##format: gtf` means GENCODE GTF [verified: file];
   - `#!genome-build` means Ensembl;
   - `#!gff-spec-version`, `#!processor` mean NCBI GFF3 [from memory - verify].

| Cue | GFF3 | GTF | GFF2 |
|---|---|---|---|
| Extensions | `.gff3`, `.gff`, `.gff3.gz` | `.gtf`, `.gtf.gz` | `.gff`, `.gff2` |
| First bytes (plain text) | `##gff-version 3` (`23 23 67 66 66`) | often a feature line, `##description:` or `#!genome-build` | `##gff-version 2` or nothing |
| Compressed | gzip `1f 8b 08`; BGZF `1f 8b 08 04` + `BC` extra field [verified: test] | same | same |
| Index files | `.tbi` (magic `TBI\1`) or `.csi` (`CSI\1`) | same | same |
| Hierarchy | `ID` / `Parent` | `gene_id` / `transcript_id` | ad hoc |
| CDS includes the stop codon? | yes (NOTE 5) | no | unspecified |

**Look-alike traps**

- **`.gff` alone is ambiguous.** It can be GFF2 or GFF3, so read line 1.
- **Ensembl's documentation calls GTF "identical to GFF version 2"** (and expands GTF as "General Transfer Format") [verified: Ensembl source]. Syntactically GTF is a GFF2 dialect, but its mandatory IDs and stop-codon rule make it a stricter contract.
- **BED12 encodes the same gene** (blocks plus thickStart/End), but it is 0-based and has 12 columns.

## 7. Common misconceptions and real-world pitfalls

1. **"GTF and GFF3 are the same thing with different extensions."**
   - Column 9 syntax differs, and so does the CDS end.
   - A real Ensembl transcript (CCT8L2-201) has a CDS of 1,674 bp in GFF3 and 1,671 bp in GTF. The GTF writes the 3-bp `stop_codon` separately [verified: file].
   - A converter that ignores this shifts every stop codon.
2. **"GFF is 0-based like BED."** It is 1-based and closed, so `end − start` is off by one; the length is `end − start + 1`. Turning GTF exons into a BED without subtracting 1 from start shifts every exon by one base (XF-15 in the foundations notes).
3. **"Phase is start mod 3" or "phase is the frame of the exon".**
   - Phase is the number of bases to skip at the 5' end of *this CDS segment*.
   - It belongs to a CDS segment *within a transcript*, not to the exon: the same exon has phase 0 in one EDEN isoform and phase 1 in another (spec example).
   - UCSC genePred `exonFrames` and Ensembl's `ensembl_phase` exon attribute use different conventions [genePred verified: source; Ensembl semantics from memory - verify]. The Ensembl GFF3 exon lines carry `ensembl_phase=-1;ensembl_end_phase=-1` [verified: file], and these are not column 8.
4. **"On the minus strand, phase is counted from `start`."** It is counted from `end`, and transcript order is descending.
5. **"`Parent` and `parent` are the same."** Tags are case-sensitive. `parent=` is a legal free attribute, so there is no error, just a silently orphaned exon [verified: test].
6. **"Shared exons get duplicated IDs."** Duplicate IDs mean "one discontinuous feature". Use `Parent=tx1,tx2` instead.
7. **"A child must sit inside its parent."** The spec explicitly does not require it (enhancers). Gene-model QC still treats it as a warning sign.
8. **"Quotes are fine in GFF3."** They are kept as part of the value: `Name="DEMO1"` names the gene `"DEMO1"`, quotes included.
9. **"Commas in a Note are punctuation."** `Note=voltage-gated, sodium channel` is two Notes. Encode the comma as `%2C`. Ensembl does exactly this: `description=phosphoinositide-3-kinase%2C catalytic%2C alpha polypeptide` [verified: file].
10. **"The spec's examples are valid files."** Not quite:
    - the rendered examples use spaces, not tabs;
    - several pathological-case CDS lines have phase `.` despite NOTE 4;
    - one example writes `Target=cdna0123+12+462`, using the forbidden `+`-for-space;
    - its FASTA header reads `>cnda0123`;
    - EDEN `cds00001` totals 2,305 bp, which is not a multiple of 3 [verified: arithmetic].
    - The phase values themselves were fixed in v1.15 and v1.16 (changelog). Even the authors found phase easy to get wrong.
11. **"chr2 and 2 are interchangeable."** Ensembl uses `2` and GENCODE uses `chr2`. A mismatch gives empty intersections, not errors.
12. **"Any GTF works with my BAM."** A GENCODE v19 header says GRCh37 [verified: file], and its coordinates are wrong for GRCh38 reads.
13. **"One gene, one transcript."** Consequences are per transcript. Report against MANE Select, and check other isoforms.
14. **"`sort` is harmless."** Coordinate sorting breaks `###` blocks and any `##FASTA` section. tabix needs it anyway, so sort a copy.
15. **"Public files are clean."** A widely used nf-core test GFF3 has no `##gff-version` line. One of its lines reads `...<TAB>2<TAB>48e<TAB>03<TAB>. . external_name=...`: a score of `2.48e+03` was mangled into three columns, giving strand `48e` and phase `03` [verified: file]. Validate before trusting.
16. **"Dictionary parsing of GTF is safe."** Repeated `tag` keys collapse to one value.

## 8. Exercise bank

**EX-01 · sort · Which dialect is it?**

Drag each snippet into **GFF3**, **GTF**, **GFF2** or **Not GFF-family**. All columns are TAB-separated; spaces inside the last column are real spaces.

```
A:
##gff-version 3
ctg1	demo	mRNA	1001	9000	.	+	.	ID=tx:DEMO1-201;Parent=gene:DEMO1
B:
ctg1	demo	exon	1001	1300	.	+	.	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "1";
C:
seq1	BLASTX	similarity	101	235	87.1	+	0	Target "HBA_HUMAN" 11 55 ; E_value 0.0003
D:
chr22	TeleGene	promoter	10010000	10010100	900	+	.	touch1
E:
ctg1	1000	9000	DEMO1-201	0	+	1200	7301	0	4	300,150,100,2000,	0,2000,4000,6000,
F:
chr1	HAVANA	gene	11869	14412	.	+	.	gene_id "ENSG00000223972.4"; transcript_id "ENSG00000223972.4"; gene_type "pseudogene"; gene_name "DDX11L1"; level 2;
```

Answers:

- **A → GFF3**: version line, `=` attributes.
- **B → GTF**: quoted values and the two mandatory IDs.
- **C → GFF2**: ACeDB-style tag-values, no gene_id/transcript_id (this is the GFF2 spec's own example).
- **D → GFF2**: a bare group token (UCSC's GFF example).
- **E → Not GFF-family**: BED12, 0-based. This is DEMO1 itself: exon 1001-1300 becomes block 0+300.
- **F → GTF**: a GENCODE v19 gene line, trimmed [verified: file].

The point: the decision comes from column 9 and the header, not from the extension.

**EX-02 · field-explorer · Anatomy of a gene model**

Use the section 3.2 GFF3. Hovering over each column shows the section 3.1 meaning. Hovering over each column-9 tag shows the section 3.4 meaning. Callouts:

- the shared CDS `ID` (one feature, four lines);
- phase `2` on 3001-3150: "skip 3001 and 3002; the first full codon is 3003-3005";
- `tag=` is lowercase, which makes it a free attribute.

**EX-03 · spot-the-error · Five broken GFF3 lines**

Each round shows the section 3.2 file with one line altered, and the learner clicks the offending field. Columns are TAB-separated. The altered line for each round:

```
1: ctg1	demo	CDS	3001	3150	.	+	.	ID=cds:DEMO1-201;Parent=tx:DEMO1-201
2: ctg1	demo	exon	5001	5100	.	+	.	ID=ex3;Parent=tx:DEMO1-21
3: ctg1	demo	exon	5001	5100	.	+	.	ID=ex3;parent=tx:DEMO1-201
4: ctg1	demo	exon	0	300	.	+	.	ID=ex1;Parent=tx:DEMO1-201
5: ctg1	demo	CDS	5001	5100	.	+	2	ID=cds:DEMO1-202;Parent=tx:DEMO1-201
```

(The `1:`-`5:` labels are not part of the file.)

1. The error is column 8 `.` on a CDS (GFF3-S09). A translator cannot know where codons start.
2. The error is that `Parent` does not resolve (GFF3-M03).
3. The error is lowercase `parent` (GFF3-M13). It is legal syntax, but exon 3 silently leaves the transcript.
4. The error is start `0`: GFF is 1-based (GFF3-S06). Someone pasted BED coordinates.
5. The other three CDS lines still say `cds:DEMO1-201`, so the error is the ID. The protein is now split into two features, and the second has a single segment (GFF3-M01/M02).

**EX-04 · fix-it · Percent-encoding**

The column-9 Note must stay one value. Columns are TAB-separated.

```
ctg1	demo	gene	1001	9000	.	+	.	ID=gene:DEMO1;Name=DEMO1;Note=Na+/K+ ratio; see lab notes, 50% done
```

- Validator: GFF3-S10, GFF3-S11 and a single-Note check.
- Valid answer: `...;Note=Na+/K+ ratio%3B see lab notes%2C 50%25 done`.
- Explanation:
  - `;` would start a new attribute with no `=`;
  - `,` would create a second Note;
  - `%` must be `%25`;
  - `+` and spaces are fine as literals. The ban is on using `+` to *mean* a space.

**EX-05 · fix-it · Repair a GTF**

Make both lines valid GTF. Columns are TAB-separated. Inside column 9, put one space after each `;`.

```
ctg1	demo	exon	1001	1300	.	+	.	gene_id=DEMO1; transcript_id=DEMO1-201
ctg1	demo	CDS	1201	1300	.	+	.	gene_id "DEMO1"; exon_number "1";
```

Answer:

```
ctg1	demo	exon	1001	1300	.	+	.	gene_id "DEMO1"; transcript_id "DEMO1-201";
ctg1	demo	CDS	1201	1300	.	+	0	gene_id "DEMO1"; transcript_id "DEMO1-201"; exon_number "1";
```

The three fixes:

- quoted `key "value";` syntax (GTF-S05);
- frame `0` on the CDS, which is the first coding segment (GTF-S04);
- the missing `transcript_id` (GTF-S06).

**EX-06 · simulator · Phase chain and exon skipping**

The table lists DEMO1-201's CDS segments with a length column, and the phase cells are empty. Learners fill in the phases using `(phase − length) mod 3`: the answers are 0, 2, 2, 1. The simulator then draws the codon grid across exons.

- Toggling off **exon 2** (150 bp): the grid downstream stays aligned. The protein goes from 216 aa to 166 aa. The codon at the new junction is c.100 plus c.251-252, a hybrid that may change one amino acid [verified: arithmetic].
- Toggling off **exon 3** (100 bp): every downstream codon shifts, and the simulator marks "frameshift".

The phase-equality shortcut appears as a hint: exon 2 phase 2 equals exon 3 phase 2.

**EX-07 · predict · The coverage dip (case thread)**

In the WIG lesson, the proband's coverage halves over ctg1:5001-5100 (DEMO1 exon 3). Commit first: is a heterozygous deletion of this exon in-frame or a frameshift?

- Reveal: **frameshift**. 100 mod 3 = 1. Equivalently, the phases differ: exon 3's CDS has phase 2 and exon 4's has phase 1.
- Follow-up prediction for exon 2: **in-frame**. 150 mod 3 = 0, and the phases are 2 and 2.
- Teaching point: the GTF/GFF3 answers the question in seconds, before anyone looks at a protein.

**EX-08 · mcq (multi-step) · Where does each variant land?**

Use DEMO1-201 (GFF3 in section 3.2). For each position, choose one of: 5' UTR, CDS (give c. position and codon), splice region, or stop codon.

| Position | Answer | Reasoning |
|---|---|---|
| ctg1:1150 | 5' UTR, c.-51 | c.1 = 1201, so 1150 = c.−51 |
| ctg1:3050 | CDS, c.150, codon 50, third base | Segment 1 holds 100 bp; 3001 = c.101 [verified: arithmetic] |
| ctg1:3152 | Intron 2, c.150+2: canonical splice donor | Exon 2 ends at 3150 |
| ctg1:7300 | Stop codon, c.650, second base: potential stop-loss | Inside the GFF3 CDS (7001-7301). In the GTF, 7300 hits only `stop_codon`, not `CDS`, so a naive "is it in a CDS line?" query on the GTF misses it |

**EX-09 · fix-it · Minus-strand phases**

DEMO2 is on `-`. Replace each `?` with a phase so the file passes GFF3-M08. Columns are TAB-separated. The lines are in file (ascending) order, and the 9001-9120 segment holds the start codon.

```
ctg2	demo	CDS	3001	3060	.	-	?	ID=cds:DEMO2-201;Parent=tx:DEMO2-201
ctg2	demo	CDS	5001	5200	.	-	?	ID=cds:DEMO2-201;Parent=tx:DEMO2-201
ctg2	demo	CDS	7001	7100	.	-	?	ID=cds:DEMO2-201;Parent=tx:DEMO2-201
ctg2	demo	CDS	9001	9120	.	-	0	ID=cds:DEMO2-201;Parent=tx:DEMO2-201
```

- Answer, top to bottom: **0, 2, 0** (and 0). Walk 5'→3' in descending coordinates: 120 bp → 0, 100 bp → 2, 200 bp → 0 [verified: arithmetic].
- The common wrong answer, 0, 0, 1, comes from walking left to right.
- Bonus question: the first complete codon of 5001-5200 starts at **5198**. On `-`, count from `end`: skip 5200 and 5199.

**EX-10 · spot-the-error · Real RefSeq lines**

This is a mouse RefSeq excerpt from the gffutils test suite [verified: file], trimmed. Columns are TAB-separated. Click every problem.

```
chr17	RefSeq	gene	6797760	6818159	.	+	.	ID=NC_000083.5:LOC100040603;Name=NC_000083.5:LOC100040603
chr17	RefSeq	mRNA	6797760	6818159	.	+	.	ID=XM_001475631.1;Parent=NC_000083.5:LOC100040603
chr17	RefSeq	protein	6806527	6812289	.	+	.	ID=;Parent=XM_001475631.1
chr17	RefSeq	CDS	6806527	6806553	.	+	0	Name=CDS:NC_000083.5:LOC100040603;Parent=XM_001475631.1,
chr17	RefSeq	CDS	6808204	6808245	.	+	0	Name=CDS:NC_000083.5:LOC100040603;Parent=XM_001475631.1,
```

The problems:

1. The `##gff-version 3` line is missing (GFF3-S01).
2. `ID=;` is an empty ID. GenomeTools reports "has no value".
3. The trailing comma in `Parent=...,` creates an empty parent (GFF3-M03).
4. A multi-line CDS has no `ID`, so a strict reader sees separate CDS features (GFF3-M02).

The phases are fine: in the full file they chain 0, 0, 0, 2, 2 over a 342-bp CDS [verified: arithmetic]. This exercise shows that "real" does not mean "valid".

**EX-11 · sort · Spec or convention?**

Bins: **GFF3 v1.26 requires**, **GTF2.2 requires**, **Both require**, **Convention only**.

| Statement | Bin |
|---|---|
| Values in double quotes | GTF2.2 |
| `##gff-version 3` on line 1 | GFF3 |
| CDS includes the stop codon | GFF3 (NOTE 5) |
| CDS excludes the stop codon | GTF2.2 |
| 1-based inclusive coordinates | Both |
| Tab-separated columns | Both |
| `gene` and `transcript` summary lines | Convention |
| `tag "MANE_Select"` | Convention |
| ID unique within the file | GFF3 |
| `gene_id` and `transcript_id` on every line | GTF2.2 |
| Child inside parent's range | Convention (the GFF3 spec explicitly does not require it) |
| `chr` prefix on seqids | Convention |
| `?` allowed as strand | GFF3 |

**EX-12 · simulator · Coordinate translator**

The learner drags an interval on a ruler and sees it in four notations. Example: exon 3 is GTF start/end 5001 and 5100, region string `ctg1:5001-5100`, length 100, and this BED line (TAB-separated):

```
ctg1	5000	5100
```

Round-trip question: what is the BED for GFF3 `three_prime_UTR` 7302-9000? Answer: start 7301, end 9000.

**EX-13 · predict · Which transcript?**

Add DEMO1-202, an isoform that skips exon 2:

```
ctg1	demo	mRNA	1001	9000	.	+	.	ID=tx:DEMO1-202;Parent=gene:DEMO1
```

Exons 1, 3 and 4 change to `Parent=tx:DEMO1-201,tx:DEMO1-202`. Predict the consequence of the ctg1:3050 variant for each transcript.

- **201:** coding, c.150.
- **202:** intronic.
- The clinical report uses the MANE Select transcript (201), and the alternative isoform is noted.
- Bonus: does 202 need its own CDS lines? **Yes.** CDS phase is transcript-specific (GFF3-C03). Here they happen to equal 201's phases (0, 2, 1), because the skipped exon is 150 bp.

## 9. Quiz bank

**Q1.** A file named `genes.gff3` begins with this line (TAB-separated; the gene ID is elided):

```
chr2	HAVANA	gene	1001	9000	.	-	.	gene_id "ENSG..."; gene_type "protein_coding";
```

What is it?

- a) Valid GFF3. *No `##gff-version` line, and there is no `=` in column 9.*
- **b) A GTF misnamed `.gff3`. A GFF3 parser will reject or misread column 9.** ✔ *Quoted `key "value";` pairs are GTF syntax.*
- c) GFF2. *Close, since GTF is a GFF2 dialect, but `gene_id` and `transcript_id` make it GTF.*
- d) BED. *BED has integer columns 2 and 3.*

**Q2.** A heterozygous deletion removes one internal, fully coding exon of 127 bp. Prediction?

- a) In-frame, because 127 is odd. *Odd or even is irrelevant; mod 3 matters.*
- **b) Frameshift, because 127 mod 3 = 1.** ✔
- c) In-frame, because the protein loses about 42 aa. *127/3 is not a whole number.*
- d) Cannot tell without RNA-seq. *RNA would confirm the effect, but the prediction follows from the gene model.*

**Q3.** On a `+` strand transcript, CDS segment 1 is 2001-2100 with phase 0, and segment 2 starts at 4001. What is segment 2's phase?

- a) 0. *That would need a length divisible by 3; 100 is not.*
- b) 1. *That is 100 mod 3, which is the leftover count, not the bases to skip.*
- **c) 2.** ✔ *(0 − 100) mod 3 = 2. One base is left over from segment 1, so 2 bases complete the codon.*
- d) `.` *A CDS must have a phase.*

**Q4.** A `-` strand transcript's 5'-most CDS segment is 8001-8200 with phase 0. The next segment 3' of it is 6001-6100. What is its phase, and where does its first full codon start?

- **a) Phase 1; the codon starts at 6099.** ✔ *(0 − 200) mod 3 = 1. On `-`, skip `end` (6100), so the codon starts at 6099.*
- b) Phase 1; the codon starts at 6002. *That counts from `start`, which is the 3' end on `-`.*
- c) Phase 0, because it is the first line in the file. *File order is not transcript order.*
- d) Phase 2; the codon starts at 6098. *200 mod 3 = 2 is the leftover count, not the phase.*

**Q5 (multi-select).** Which column-9 strings are valid GFF3 exactly as written?

- **a) `Note=K+ channel`** ✔ *A literal `+` and spaces are allowed.*
- b) `Note=50% identity` *`%` must be `%25`.*
- **c) `Note=binds Na%2C K`** ✔ *An encoded comma.*
- **d) `Name="DEMO1"`** ✔ *Valid, but the quotes become part of the name, which is almost certainly a bug.*
- e) `ID=ex1,ex2` *ID cannot take multiple values.*

**Q6.** Ensembl's GFF3 gives CCT8L2-201's CDS as chr22:16590877-16592550 (1,674 bp, `-` strand). Ensembl's GTF gives a CDS 3 bp shorter plus a `stop_codon` line [verified: file]. Why?

- **a) GTF excludes the stop codon from CDS; GFF3 includes it.** ✔ *GTF2 vs GFF3 NOTE 5. 1,671 + 3 = 1,674 = 558 codons.*
- b) GTF is 0-based. *Both are 1-based.*
- c) They are different releases. *The same transcript in the same release still differs by exactly the stop codon.*
- d) GFF3 adds a poly-A signal. *No.*

**Q7.** A GTF exon has start 1001 and end 1300 on chr2. What are the BED start and end?

- a) 1001, 1300. *This is still 1-based.*
- **b) 1000, 1300.** ✔ *start − 1, end unchanged.*
- c) 1000, 1299. *That loses the last base.*
- d) 1001, 1301. *That shifts the interval right.*

**Q8.** Which GFF3 pattern is valid?

- **a) Four CDS lines sharing `ID=cds1`, `Parent=tx1`, at different exons.** ✔ *One discontinuous feature.*
- b) Two exon lines sharing `ID=ex5`, one with `Parent=tx1` and one with `Parent=tx2`, at the same coordinates. *Write one line with `Parent=tx1,tx2`. Same-ID lines must collectively form a single feature.*
- c) `ID=ex5;Parent=tx1;Parent=tx2`. *A repeated tag. Use a comma list.*
- d) An exon with `parent=tx1`. *Valid syntax, but it creates no hierarchy.*

**Q9.** The case folder's annotation begins `##description: evidence-based annotation of the human genome (GRCh37), version 19 (Ensembl 74)`, but the reads were aligned to GRCh38. Best action?

- a) Use it: gene names do not change. *The coordinates do change between builds.*
- **b) Replace it with a GRCh38 GENCODE/Ensembl release and record the version.** ✔
- c) Add `chr` prefixes. *It already has them, and the build is the problem.*
- d) Lift over the VCF to GRCh37. *That is possible, but it moves the whole analysis off the build everything else uses.*

## 10. Case-thread hooks

- **Lesson opener.** The VCF lesson ends with one de novo SNV in the proband. "chr2:N C>T: so what?" A coordinate means nothing without the gene model, and this lesson supplies it.
- **Choosing the gene** (the sequences notes defer this decision here).
  - SCN1A is a natural pick. De novo SCN1A variants are the classic cause of Dravet syndrome. It sits on chr2 at about 166.0 Mb (GRCh38) on the **minus strand** [from memory - verify locus, strand and MANE transcript].
  - The minus strand is a feature, not a bug: it forces the descending-order, phase-from-`end` and exon_number-from-the-right lessons.
  - Real lines should be extracted at build time from a pinned GENCODE release (MANE Select transcript only) and reduced to 4-6 exons for display. Keep the toy DEMO1/DEMO2 for arithmetic drills.
- **WIG → GTF.**
  - The coverage dip over one exon becomes: look up the exon in the MANE transcript, then compute length mod 3, or compare the phases.
  - Make the dipped exon's length **not** divisible by 3, so the call is a frameshift and therefore likely loss of function.
  - Optionally offer a second exon whose deletion would be in-frame, as a contrast.
- **VCF → GTF.** Map the de novo SNV to transcript, exon, c. position and codon, as in EX-08. Include one decoy de novo variant in an intron far from splice sites, and one in a non-MANE-only exon (EX-13).
- **BEDPE → GTF.** The split-read breakpoint pair lands in intron N of the candidate gene and in an intergenic region. Learners convert GTF exons to BED to run `bedtools intersect`; the off-by-one trap is EX-12.
- **PAF/GFA.** Annotation coordinates belong to one assembly. When long reads resolve the rearrangement on a new haplotype or graph path, the gene model must be lifted over before exon numbers mean anything.
- **Capstone case folder.** Candidate files:
  - `annotation/gencode.v19.annotation.gtf`: wrong build (Q9).
  - `annotation/genes.gff3`: missing `##gff-version` and a CDS with phase `.`.
  - `annotation/candidates.gtf`: GFF3 attributes in a `.gtf` file.
  - `annotation/exons.bed`: built from the GTF without subtracting 1.
  - A correct `gencode.vNN.basic.annotation.gtf.gz` plus `.tbi`, with a magic-byte check that it is BGZF, not plain gzip.

## 11. "Read more" candidates

- **The Gap attribute vs SAM CIGAR.** Gap writes the operation before the length, space-separated: `M8 D3 M6 I1 M6` vs CIGAR `8M3D6M`. For protein-to-nucleotide matches, M/I/D count residues at 1:3. It has F/R frameshift operators ("The Gap Attribute").
- **Target strand rule.** "The source and target strands will be multiplied together": `+/-` means reverse-complement the target ("Transcript-Relative Alignments").
- **Circular genomes:** `Is_circular=true` and an end coordinate past the landmark length.
- **Percent-encoding inconsistencies** in the spec. It says "no other characters may be encoded", yet asks for `%20` inside Target IDs and requires escapes in seqids outside `[a-zA-Z0-9.:^*$@!+_?-|]`. Robust parsers decode any `%XX`.
- **Pathological cases.**
  - Polycistronic transcripts (several genes as parents of one mRNA, plus `Derives_from` on the CDSs).
  - Trans-splicing (an mRNA with two lines sharing an ID).
  - Programmed frameshifts (overlapping CDS segments, with the new segment at phase 0).
  - Inteins.
- **Format history** (AGAT):
  - GFF1 1997 → GFF2 2000 → GTF2 2003 → GTF2.1 2005 → GTF2.2 2007;
  - GFF3 2004, now at v1.26 (2020);
  - AGAT's unofficial labels "GTF2.5" (GENCODE, 2012) and "GTF3" (Ensembl ≥ 82, `five_prime_utr`/`three_prime_utr`).
- **UCSC genePred `exonFrames`**: the inverse of phase. Also the old stop-codon discrepancy between gene tracks (AGAT, quoting the UCSC FAQ).
- **GENCODE vs Ensembl GTF.** The same models, but GENCODE duplicates the chrX/chrY PAR genes and ships a reference-chromosomes-only file (AGAT, citing the GENCODE FAQ).
- **In-frame is not harmless.** It changes the junction codon, can create a stop, and can remove a critical domain. Frameshifts upstream of the last exon junction typically trigger nonsense-mediated decay (the ~50-55 nt rule) [from memory - verify].
- **Directives:** `##feature-ontology`, `##species` (an NCBI Taxonomy URL), `##genome-build`.
- **Dbxref parsing:** split on the first colon only.
- **Dialects of GFF3:** GVF (variants) and mirGFF3 (miRNA isoforms, mentioned in the spec).

## 12. Sources

**Read (primary or source code)**

- GFF3 v1.26, 18 Aug 2020: https://raw.githubusercontent.com/The-Sequence-Ontology/Specifications/master/gff3.md
- AGAT "The GTF/GFF formats" (reproduces the GFF1/GFF2/GTF2 spec text; summarizes GTF2.1, GTF2.2 and the GENCODE/Ensembl evolution): https://raw.githubusercontent.com/NBISweden/AGAT/master/docs/gxf.md
- Ensembl website source for its GFF/GTF and GFF3 docs (main branch; identical on release/113-115): https://raw.githubusercontent.com/Ensembl/ensembl-webcode/main/htdocs/info/website/upload/gff.html and `.../gff3.html`
- UCSC GTF2.2 summary: https://raw.githubusercontent.com/ucscGenomeBrowser/kent/master/src/hg/htdocs/goldenPath/help/GTF.html
- UCSC FAQformat (GFF section): https://raw.githubusercontent.com/ucscGenomeBrowser/kent/master/src/hg/htdocs/FAQ/FAQformat.html
- UCSC kent `genePred.c` (`phaseToFrame`, same-seq/strand errAbort) and `genePredExt.as`: https://raw.githubusercontent.com/ucscGenomeBrowser/kent/master/src/hg/lib/genePred.c and `.../genePredExt.as`
- GenomeTools GFF3 parser (error messages used as de facto rules): https://raw.githubusercontent.com/genometools/genometools/master/src/extended/gff3_parser.c and `src/core/parseutils.c`
- tabix(1): https://raw.githubusercontent.com/samtools/htslib/develop/tabix.1
- bedtools general usage (GFF section): https://raw.githubusercontent.com/arq5x/bedtools2/master/docs/content/general-usage.rst
- Real files:
  - Ensembl-format GTF/GFF3 excerpt (chr22; the GTF coordinates are shifted by −16,572,026 relative to the GFF3): https://raw.githubusercontent.com/nf-core/test-datasets/modules/data/genomics/homo_sapiens/genome/genome.gtf and `.../genome.gff3`
  - GENCODE v19 excerpt: https://raw.githubusercontent.com/daler/gffutils/master/gffutils/test/data/gencode-v19.gtf
  - RefSeq mouse excerpt: https://raw.githubusercontent.com/daler/gffutils/master/gffutils/test/data/mouse_extra_comma.gff3
- Tests: pysam 0.24.1 (`tabix_compress`, `tabix_index`) and gffutils 0.14, run on the toy files in this document.

**Could not reach**

- **Blocked for curl, DNS failure for WebFetch:**
  - mblab.wustl.edu/GTF22.html (the GTF2.2 spec);
  - gencodegenes.org (data_format.html, tags.html);
  - ensembl.org (live pages, read via the GitHub source instead);
  - ftp.ensembl.org (GTF README);
  - ftp.ebi.ac.uk (GENCODE README);
  - genome.ucsc.edu (read via the kent GitHub mirror instead);
  - web.archive.org;
  - agat.readthedocs.io (read via GitHub instead);
  - bioperl.org;
  - NCBI MANE README mirrors;
  - api.github.com.
- **Consequences:** claims about current GENCODE attribute lists, `level` meanings, MANE tags, Ensembl `#!` headers, `exon_number` ordering and the GTF2.2-specific wording beyond AGAT/UCSC are marked [from memory - verify].
