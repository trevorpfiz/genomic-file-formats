---
kind: page
id: about
title: About this course
---

_Genomic File Formats_ is an interactive course for bioinformatics students. It teaches you to recognize the common genomic file formats and to judge whether a file is valid. The whole course is one HTML file. You can open it from disk, email it, or use the hosted copy.

## Specifications, tools and data

The lessons are written against these versions. Each section confirms its own entries when it is written, so this list grows with the course.

| Kind                          | Pinned version                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sequence specs                | faidx(5) and samtools-faidx(1) from htslib and samtools 1.24; bgzip(1); SAMv1 version 1.6 for BGZF and quality strings; the FASTQ description by Cock and colleagues, 2010 |
| Alignment specs               | SAM and BAM version 1.6; SAMtags, September 2024; CRAM 3.1; CSI version 1; tabix                                                                                           |
| Variant specs                 | VCF 4.5, and VCF 4.2 for the files GATK writes in the story                                                                                                                |
| Interval and annotation specs | BEDv1 of 2022-01-05; GFF3 1.26; GTF 2.2, as described by AGAT and UCSC                                                                                                     |
| Graph and long-read specs     | GFA 1.0 to 1.2 of 2022-06-07; PAF; rGFA and GAF                                                                                                                            |
| Tools                         | samtools, htslib and bcftools 1.24; minimap2 2.31-r1302; gfatools 0.5-r296; Biopython 1.88; bedtools, recorded when the example files are built                            |
| Data                          | GRCh38, Broad analysis set; GENCODE release 43; dbSNP build 138                                                                                                            |

## Data sources

- **Reference genome.** GRCh38 from the Genome Reference Consortium, in the Broad Institute's analysis set. The case reads in the sequences section come from a slice of chromosome 2, `chr2:165,980,001-166,150,000`.
- **Gene annotation.** GENCODE release 43, for gene models and capture targets in later sections.
- **Known variant sites.** dbSNP build 138, for the rsIDs the story uses.
- **The case.** The family, their samples, and every variant and genotype in the story are invented.

Attribution and terms for each extract are listed in the course repository.

## Licenses

- **Course code and text.** MIT License.
- **Fonts.** Source Serif 4, Public Sans and IBM Plex Mono, under the SIL Open Font License 1.1. They are embedded unmodified, latin subset only.
- **Icons.** Lucide, under the ISC License.
- **Preact.** The library that runs the simulators, under the MIT License.

The full license texts follow at the end of this page.

## Privacy

The course has no analytics and sends nothing anywhere. Your progress stays in this browser's storage. A progress code moves it between copies of the course.

## Report an error

Found a mistake? Open an issue in the [course repository](https://github.com/trevorpfiz/genomic-file-formats/issues). Fixes ship as new versions of the file.
