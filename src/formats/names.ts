// Display names for format ids: viewer badges, At-a-glance titles and the capstone's format
// select. Pure data, shared by the compiler and the browser.
import type { FormatId } from "../exercises/types.ts";

export const FORMAT_NAMES: Readonly<Record<FormatId, string>> = {
  fasta: "FASTA",
  fai: ".fai",
  gzi: ".gzi",
  fastq: "FASTQ",
  bed: "BED",
  bedgraph: "bedGraph",
  bedpe: "BEDPE",
  wig: "WIG",
  gtf: "GTF",
  gff3: "GFF3",
  sam: "SAM",
  bam: "BAM",
  bai: ".bai",
  csi: ".csi",
  cram: "CRAM",
  crai: ".crai",
  vcf: "VCF",
  gvcf: "gVCF",
  tbi: ".tbi",
  paf: "PAF",
  gfa: "GFA",
  gaf: "GAF",
  ped: "PED",
  gzip: "gzip",
  bgzf: "BGZF",
  blast6: "BLAST tabular",
  interval_list: "interval_list",
  other: "Other",
};

export const isFormatId = (value: string): value is FormatId => Object.hasOwn(FORMAT_NAMES, value);
