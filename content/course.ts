// The course manifest (docs/PLAN.md D-37): every planned page with its status, and the map from
// each concept to the page that introduces it. Course-wide tests assert over the built pages
// plus this manifest, so a milestone can merge before the whole course exists. The "all built"
// assertion switches on in M7.

export type PageStatus = "planned" | "built";
export type PageKind = "lesson" | "quiz" | "capstone" | "page";

export interface Section {
  id: string;
  title: string;
  /** Folder under content/lessons/. */
  folder: string;
  /** M0 scaffolding, removed when real content lands (M1). */
  temporary?: boolean;
}

export interface PlannedPage {
  id: string;
  kind: PageKind;
  /** Section id; pages outside the outline (home, about) have none. */
  section?: string;
  title: string;
  /** Path relative to the repository root. */
  file: string;
  status: PageStatus;
  temporary?: boolean;
}

export const sections: readonly Section[] = [
  { id: "placeholder", title: "Placeholder", folder: "00-placeholder", temporary: true },
  { id: "foundations", title: "Foundations", folder: "01-foundations" },
  { id: "sequences", title: "Sequences: FASTA and FASTQ", folder: "02-sequences" },
  { id: "regions", title: "Regions: BED", folder: "03-regions" },
  { id: "alignments", title: "Alignments: SAM, BAM and CRAM", folder: "04-alignments" },
  {
    id: "coverage-and-variants",
    title: "Coverage and variants: WIG, VCF and gVCF",
    folder: "05-coverage-and-variants",
  },
  { id: "annotation", title: "Annotation: GTF and GFF3", folder: "06-annotation" },
  {
    id: "sv-and-graphs",
    title: "Structural variants and graphs: BEDPE, PAF and GFA",
    folder: "07-sv-and-graphs",
  },
  { id: "capstone-and-conclusion", title: "Capstone and conclusion", folder: "08-capstone-and-conclusion" },
];

const lesson = (
  section: string,
  file: string,
  id: string,
  title: string,
  status: PageStatus = "planned",
): PlannedPage => {
  const folder = sections.find((s) => s.id === section)?.folder ?? section;
  return { id, kind: "lesson", section, title, file: `content/lessons/${folder}/${file}`, status };
};
const quiz = (section: string, title: string): PlannedPage => {
  const folder = sections.find((s) => s.id === section)?.folder ?? section;
  return {
    id: `quiz-${section}`,
    kind: "quiz",
    section,
    title,
    file: `content/lessons/${folder}/99-quiz.md`,
    status: "planned",
  };
};

export const pages: readonly PlannedPage[] = [
  {
    ...lesson(
      "placeholder",
      "01-hello.md",
      "placeholder-hello",
      "Placeholder: the pipeline end to end",
      "built",
    ),
    temporary: true,
  },
  lesson(
    "foundations",
    "01-from-blood-to-diagnosis.md",
    "from-blood-to-diagnosis",
    "From a blood sample to a diagnosis",
  ),
  lesson("foundations", "02-genome-as-text.md", "genome-as-text", "The genome as text"),
  lesson("foundations", "03-coordinates.md", "coordinates", "Coordinates: fence posts and panels"),
  quiz("foundations", "Section quiz: Foundations"),
  lesson(
    "sequences",
    "04-fasta-reference.md",
    "fasta-reference",
    "FASTA: the reference everyone is compared against",
  ),
  lesson("sequences", "05-random-access.md", "random-access", "Random access: indexes and compression"),
  lesson("sequences", "06-fastq-reads.md", "fastq-reads", "From molecules to reads: FASTQ"),
  lesson("sequences", "07-fastq-in-the-wild.md", "fastq-in-the-wild", "FASTQ in the wild"),
  quiz("sequences", "Section quiz: Sequences"),
  lesson("regions", "08-bed-targets.md", "bed-targets", "BED: where did we look?"),
  lesson(
    "regions",
    "09-bed-in-practice.md",
    "bed-in-practice",
    "BED in practice: blocks, sorting and indexes",
  ),
  quiz("regions", "Section quiz: Regions"),
  lesson("alignments", "10-alignment-primer.md", "alignment-primer", "Placing reads on the map"),
  lesson("alignments", "11-sam-records.md", "sam-records", "SAM: reading a record"),
  lesson("alignments", "12-bam-cram.md", "bam-cram", "BAM and CRAM: archiving cheaply"),
  quiz("alignments", "Section quiz: Alignments"),
  lesson("coverage-and-variants", "13-wig-coverage.md", "wig-coverage", "WIG: a dip over four exons"),
  lesson("coverage-and-variants", "14-vcf-records.md", "vcf-records", "VCF: variants and genotypes"),
  lesson("coverage-and-variants", "15-gvcf-blocks.md", "gvcf-blocks", "gVCF: proving absence"),
  lesson("coverage-and-variants", "16-de-novo-search.md", "de-novo-search", "The de novo search"),
  quiz("coverage-and-variants", "Section quiz: Coverage and variants"),
  lesson("annotation", "17-gene-models.md", "gene-models", "Gene models: GTF and GFF3"),
  lesson(
    "annotation",
    "18-frame-and-phase.md",
    "frame-and-phase",
    "Frame and phase: what losing exons 17-20 does",
  ),
  quiz("annotation", "Section quiz: Annotation"),
  lesson("sv-and-graphs", "19-bedpe-breakpoints.md", "bedpe-breakpoints", "BEDPE: the breakpoint pair"),
  lesson("sv-and-graphs", "20-paf-long-reads.md", "paf-long-reads", "PAF: one molecule, end to end"),
  lesson("sv-and-graphs", "21-gfa-graphs.md", "gfa-graphs", "GFA: graphs, walks and stable coordinates"),
  quiz("sv-and-graphs", "Section quiz: Structural variants and graphs"),
  {
    id: "capstone",
    kind: "capstone",
    section: "capstone-and-conclusion",
    title: "Capstone: triage the case folder",
    file: "content/lessons/08-capstone-and-conclusion/00-capstone.md",
    status: "planned",
  },
  lesson("capstone-and-conclusion", "22-closing-the-case.md", "closing-the-case", "Closing the case"),
  { id: "home", kind: "page", title: "Genomic File Formats", file: "content/home.md", status: "planned" },
  { id: "about", kind: "page", title: "About this course", file: "content/about.md", status: "planned" },
];

/** Concept id -> id of the page that introduces it. Filled in as lessons are written. */
export const conceptIntroducers: Readonly<Record<string, string>> = {
  "placeholder.bed-to-one-based": "placeholder-hello",
};
