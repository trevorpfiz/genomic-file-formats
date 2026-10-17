// The pipeline map's nodes (ux-design.md 4.10; docs/PLAN.md 7.8): one node per question in the
// case, labelled by format. Shared by the compiler (which validates `::pipeline-map{highlight}`)
// and the pipeline-map widget. Pure data.

export interface PipelineNode {
  id: string;
  /** The node label: the format(s) it stands for. */
  label: string;
  /** The question the file answers (case.md section 1; L01.3). */
  question: string;
  /** Side branches lay out beside the main line on wide screens (BED, WIG, GTF/GFF3). */
  branch?: boolean;
}

export const PIPELINE_NODES: readonly PipelineNode[] = [
  { id: "fasta", label: "FASTA reference", question: "Compared with what?" },
  { id: "fastq", label: "FASTQ", question: "What did the sequencer read?" },
  { id: "bed", label: "BED targets", question: "Where did we look?", branch: true },
  { id: "alignments", label: "SAM, BAM, CRAM", question: "Where does each read belong?" },
  { id: "wig", label: "WIG, bedGraph", question: "How much DNA covers each region?", branch: true },
  { id: "gvcf", label: "gVCF", question: "Is 'nothing here' backed by evidence?" },
  { id: "vcf", label: "VCF", question: "How does this genome differ from the reference?" },
  {
    id: "annotation",
    label: "GTF, GFF3",
    question: "Which gene, transcript and exon is this, and what does a change do?",
    branch: true,
  },
  { id: "bedpe", label: "BEDPE", question: "Which two places in the genome are joined?" },
  { id: "paf", label: "PAF", question: "Where does each piece of a long read align?" },
  { id: "gfa", label: "GFA", question: "Which paths through the genome do these haplotypes take?" },
];

export const PIPELINE_NODE_IDS: ReadonlySet<string> = new Set(PIPELINE_NODES.map((n) => n.id));
