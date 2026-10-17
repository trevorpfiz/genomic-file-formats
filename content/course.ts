// The course manifest (docs/PLAN.md D-37): every planned page with its status, in outline
// order, and the map from each concept to the page that introduces it. Course-wide tests assert
// over the built pages plus this manifest, so a milestone can merge before the whole course
// exists. The "all built" assertion switches on in M7.
//
// Status "built" means the page's content file exists and compiles (a phase-A stub counts);
// "planned" pages have no file yet. Pure TypeScript: the browser (outline, switcher, progress
// over 30 items), the lessons plugin (section ids) and the tests import it.

export type PageStatus = "planned" | "built";
export type PageKind = "lesson" | "quiz" | "capstone" | "page";

export interface Section {
  id: string;
  /** "Sequences: FASTA and FASTQ". */
  title: string;
  /** Short name for the switcher ("Lesson 4 of 22 · Sequences"). */
  short: string;
  /** Folder under content/lessons/. */
  folder: string;
}

export interface PlannedPage {
  /** The page's frontmatter id: "fasta-reference", "quiz-sequences", "capstone", "home". */
  id: string;
  kind: PageKind;
  /** Section id; pages outside the outline (home, about) have none. */
  section?: string;
  title: string;
  /** Path relative to the repository root. */
  file: string;
  /** The page's route (D-22). */
  route: string;
  status: PageStatus;
  /** Course-map minutes (docs/PLAN.md 4); quizzes about 8, the capstone about 35. */
  minutes?: number;
  /** Lessons only: 1-22, in course order. */
  lesson?: number;
  /** One of the 30 outline items with a completion state (22 lessons, 7 quizzes, capstone). */
  outline: boolean;
}

export const sections: readonly Section[] = [
  { id: "foundations", title: "Foundations", short: "Foundations", folder: "01-foundations" },
  { id: "sequences", title: "Sequences: FASTA and FASTQ", short: "Sequences", folder: "02-sequences" },
  { id: "regions", title: "Regions: BED", short: "Regions", folder: "03-regions" },
  {
    id: "alignments",
    title: "Alignments: SAM, BAM and CRAM",
    short: "Alignments",
    folder: "04-alignments",
  },
  {
    id: "coverage-and-variants",
    title: "Coverage and variants: WIG, VCF and gVCF",
    short: "Coverage and variants",
    folder: "05-coverage-and-variants",
  },
  { id: "annotation", title: "Annotation: GTF and GFF3", short: "Annotation", folder: "06-annotation" },
  {
    id: "sv-and-graphs",
    title: "Structural variants and graphs: BEDPE, PAF and GFA",
    short: "Structural variants and graphs",
    folder: "07-sv-and-graphs",
  },
  {
    id: "capstone-and-conclusion",
    title: "Capstone and conclusion",
    short: "Capstone and conclusion",
    folder: "08-capstone-and-conclusion",
  },
];

const folderOf = (section: string): string => {
  const found = sections.find((s) => s.id === section);
  if (!found) throw new Error(`content/course.ts: unknown section "${section}"`);
  return found.folder;
};

const lesson = (
  section: string,
  lessonNumber: number,
  id: string,
  title: string,
  minutes: number,
  status: PageStatus = "planned",
): PlannedPage => ({
  id,
  kind: "lesson",
  section,
  title,
  file: `content/lessons/${folderOf(section)}/${String(lessonNumber).padStart(2, "0")}-${id}.md`,
  route: `#/lesson/${id}`,
  status,
  minutes,
  lesson: lessonNumber,
  outline: true,
});

const quiz = (section: string, title: string, status: PageStatus = "planned"): PlannedPage => ({
  id: `quiz-${section}`,
  kind: "quiz",
  section,
  title,
  file: `content/lessons/${folderOf(section)}/99-quiz.md`,
  route: `#/quiz/${section}`,
  status,
  minutes: 8,
  outline: true,
});

/** Every page, in outline order (docs/PLAN.md 4), then the pages outside the outline. */
export const pages: readonly PlannedPage[] = [
  lesson("foundations", 1, "from-blood-to-diagnosis", "From a blood sample to a diagnosis", 8),
  lesson("foundations", 2, "genome-as-text", "The genome as text", 8),
  lesson("foundations", 3, "coordinates", "Coordinates: fence posts and panels", 9),
  quiz("foundations", "Section quiz: Foundations"),
  lesson("sequences", 4, "fasta-reference", "FASTA: the reference everyone is compared against", 9, "built"),
  lesson("sequences", 5, "random-access", "Random access: indexes and compression", 8, "built"),
  lesson("sequences", 6, "fastq-reads", "From molecules to reads: FASTQ", 8, "built"),
  lesson("sequences", 7, "fastq-in-the-wild", "FASTQ in the wild", 9, "built"),
  quiz("sequences", "Section quiz: Sequences", "built"),
  lesson("regions", 8, "bed-targets", "BED: where did we look?", 8),
  lesson("regions", 9, "bed-in-practice", "BED in practice: blocks, sorting and indexes", 9),
  quiz("regions", "Section quiz: Regions"),
  lesson("alignments", 10, "alignment-primer", "Placing reads on the map", 8),
  lesson("alignments", 11, "sam-records", "SAM: reading a record", 9),
  lesson("alignments", 12, "bam-cram", "BAM and CRAM: archiving cheaply", 9),
  quiz("alignments", "Section quiz: Alignments"),
  lesson("coverage-and-variants", 13, "wig-coverage", "WIG: a dip over four exons", 9),
  lesson("coverage-and-variants", 14, "vcf-records", "VCF: variants and genotypes", 9),
  lesson("coverage-and-variants", 15, "gvcf-blocks", "gVCF: proving absence", 8),
  lesson("coverage-and-variants", 16, "de-novo-search", "The de novo search", 8),
  quiz("coverage-and-variants", "Section quiz: Coverage and variants"),
  lesson("annotation", 17, "gene-models", "Gene models: GTF and GFF3", 10),
  lesson("annotation", 18, "frame-and-phase", "Frame and phase: what losing exons 17-20 does", 9),
  quiz("annotation", "Section quiz: Annotation"),
  lesson("sv-and-graphs", 19, "bedpe-breakpoints", "BEDPE: the breakpoint pair", 10),
  lesson("sv-and-graphs", 20, "paf-long-reads", "PAF: one molecule, end to end", 9),
  lesson("sv-and-graphs", 21, "gfa-graphs", "GFA: graphs, walks and stable coordinates", 10),
  quiz("sv-and-graphs", "Section quiz: Structural variants and graphs"),
  {
    id: "capstone",
    kind: "capstone",
    section: "capstone-and-conclusion",
    title: "Capstone: triage the case folder",
    file: "content/lessons/08-capstone-and-conclusion/00-capstone.md",
    route: "#/capstone",
    status: "planned",
    minutes: 35,
    outline: true,
  },
  lesson("capstone-and-conclusion", 22, "closing-the-case", "Closing the case", 9),
  {
    id: "home",
    kind: "page",
    title: "Genomic File Formats",
    file: "content/home.md",
    route: "#/",
    status: "built",
    outline: false,
  },
  {
    id: "about",
    kind: "page",
    title: "About this course",
    file: "content/about.md",
    route: "#/about",
    status: "built",
    outline: false,
  },
];

/** The 30 outline items, in order. */
export const outlineItems: readonly PlannedPage[] = pages.filter((p) => p.outline);

export const pageById = (id: string): PlannedPage | undefined => pages.find((p) => p.id === id);

/**
 * Concept id -> id of the page that introduces it (in main text, never only in a Read-more).
 * Lesson frontmatter `introduces` and `requires` use these ids; a quiz slot's `concepts` must be
 * introduced in its section or an earlier one. Listed for the built pages, plus the concepts
 * of planned earlier pages that built pages already require (their lessons must introduce them).
 * Section 2's vocabulary is a phase-A proposal: content agents may refine it, keeping this map,
 * the frontmatter, the exercises' and the quiz slots' `concepts` in step.
 */
export const conceptIntroducers: Readonly<Record<string, string>> = {
  // L01 from-blood-to-diagnosis (planned)
  "pipeline.file-questions": "from-blood-to-diagnosis",
  // L02 genome-as-text (planned)
  "seq.alphabet": "genome-as-text",
  "seq.reverse-complement": "genome-as-text",
  "validity.severities": "genome-as-text",
  "validity.verdicts": "genome-as-text",
  "validity.tools-say": "genome-as-text",
  "ref.contig-names": "genome-as-text",
  "ref.md5": "genome-as-text",
  // L03 coordinates (planned)
  "coords.zero-based": "coordinates",
  "coords.one-based": "coordinates",
  "coords.region-strings": "coordinates",
  // L04 fasta-reference
  "fasta.record": "fasta-reference",
  "fasta.header-metadata": "fasta-reference",
  "fasta.line-width": "fasta-reference",
  "fasta.soft-masking": "fasta-reference",
  "fasta.structure-rules": "fasta-reference",
  "ref.analysis-set": "fasta-reference",
  // L05 random-access
  "fai.columns": "random-access",
  "fai.byte-offset": "random-access",
  "fai.one-file": "random-access",
  "fai.empty-record": "random-access",
  "compression.gzip-vs-bgzf": "random-access",
  "compression.bgzf-eof": "random-access",
  "compression.virtual-offset": "random-access",
  "compression.gzi": "random-access",
  // L06 fastq-reads
  "sequencing.paired-end": "fastq-reads",
  "sequencing.depth": "fastq-reads",
  "sequencing.exome-vs-genome": "fastq-reads",
  "sequencing.read-groups": "fastq-reads",
  "quality.phred": "fastq-reads",
  "quality.phred33": "fastq-reads",
  "quality.expected-errors": "fastq-reads",
  "quality.binning": "fastq-reads",
  "fastq.record": "fastq-reads",
  "fastq.read-id": "fastq-reads",
  // L07 fastq-in-the-wild
  "fastq.wrapped": "fastq-in-the-wild",
  "fastq.pairs-in-sync": "fastq-in-the-wild",
  "fastq.truncation": "fastq-in-the-wild",
  "fastq.structure-rules": "fastq-in-the-wild",
  "quality.encoding-detection": "fastq-in-the-wild",
  "recognition.first-bytes": "fastq-in-the-wild",
};
