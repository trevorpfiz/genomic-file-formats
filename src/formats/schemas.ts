// Field names per format: the schema names that exercise keys, validator diagnostics
// (`Diagnostic.field`) and the snippet viewer's aligned view share ("chromStart", "QUAL").
// Pure data; the single source: src/widgets/columns.ts imports FORMAT_COLUMNS from here.
import type { FormatId } from "../exercises/types.ts";
import { FAI_COLUMNS } from "./fasta.ts";

const VCF = ["CHROM", "POS", "ID", "REF", "ALT", "QUAL", "FILTER", "INFO", "FORMAT"];

/** TAB-separated column names per format, in column order. */
export const FORMAT_COLUMNS: Readonly<Partial<Record<FormatId, readonly string[]>>> = {
  fai: FAI_COLUMNS,
  bed: [
    "chrom",
    "chromStart",
    "chromEnd",
    "name",
    "score",
    "strand",
    "thickStart",
    "thickEnd",
    "itemRgb",
    "blockCount",
    "blockSizes",
    "blockStarts",
  ],
  bedgraph: ["chrom", "chromStart", "chromEnd", "dataValue"],
  bedpe: ["chrom1", "start1", "end1", "chrom2", "start2", "end2", "name", "score", "strand1", "strand2"],
  gtf: ["seqname", "source", "feature", "start", "end", "score", "strand", "frame", "attribute"],
  gff3: ["seqid", "source", "type", "start", "end", "score", "strand", "phase", "attributes"],
  sam: ["QNAME", "FLAG", "RNAME", "POS", "MAPQ", "CIGAR", "RNEXT", "PNEXT", "TLEN", "SEQ", "QUAL"],
  vcf: VCF,
  gvcf: VCF,
  paf: [
    "qname",
    "qlen",
    "qstart",
    "qend",
    "strand",
    "tname",
    "tlen",
    "tstart",
    "tend",
    "nmatch",
    "alen",
    "mapq",
  ],
  ped: ["FID", "IID", "PID", "MID", "SEX", "PHENOTYPE"],
  blast6: [
    "qseqid",
    "sseqid",
    "pident",
    "length",
    "mismatch",
    "gapopen",
    "qstart",
    "qend",
    "sstart",
    "send",
    "evalue",
    "bitscore",
  ],
  interval_list: ["contig", "start", "end", "strand", "name"],
};

/** Line-based formats: the field name of each kind of line (validator diagnostics use these). */
export const FASTA_FIELDS = { header: "header", name: "name", sequence: "sequence" } as const;
export const FASTQ_FIELDS = {
  title: "title",
  sequence: "sequence",
  separator: "separator",
  quality: "quality",
} as const;
