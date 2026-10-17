// Section quiz 2: Sequences (docs/PLAN.md 6.1, Q2; D-09). Six slots; each has at least two
// variants with identical concepts and tags, or authored variants plus a seeded generator for
// the computation slots (2.1, 2.2, 2.4, 2.5). Pass mark 5 of 6. Pure TypeScript: the quiz page
// draws variants in the browser, and tests/content.test.ts checks every authored variant and 40
// generated ones per slot against the validators and the arithmetic helpers.
//
// No variant repeats a lesson exercise: the snippets are fresh (other chrM bases, other line
// widths, other quality strings, other files) and the stems ask new questions. No slot depends on
// Read-more content or on a later section.
import type {
  FormatId,
  HexAnnotation,
  McqExercise,
  McqOption,
  ParametricGenerator,
  Quiz,
  QuizVariant,
  ReferenceItem,
  Rng,
  Snippet,
  SpotTheErrorExercise,
} from "../exercises/types.ts";
import { faiByte } from "../formats/fasta.ts";
import { charToQ, expectedErrors, qToChar, qToP } from "../formats/phred.ts";

const QUIZ = "quiz-sequences";

/** An mcq whose key a helper recomputes: `computeWith` is required here. */
type ComputedMcq = McqExercise & Required<Pick<McqExercise, "computeWith">>;

// ---------------------------------------------------------------------------------------------
// Data

/**
 * GRCh38 chrM:61-1000 (the rCRS), read by HTTP Range from the Broad analysis-set FASTA
 * (`Homo_sapiens_assembly38.fasta`, .fai row `chrM 16569 3119155468 100 101`) on 2026-10-17.
 * Its first 60 bases continue seq 3.1's chrM:1-60, and chrM:115-150 reverse-complements to
 * seq 3.3's R2 read, as the note verified.
 */
const CHRM_FROM = 61;
const CHRM = [
  "CGTCTGGGGGGTATGCACGCGATAGCATTGCGAGACGCTG",
  "GAGCCGGAGCACCCTATGTCGCAGTATCTGTCTTTGATTCCTGCCTCATCCTATTATTTATCGCACCTACGTTCAATATTACAGGCGAACATACTTACTA",
  "AAGTGTGTTAATTAATTAATGCTTGTAGGACATAATAATAACAATTGAATGTCTGCACAGCCACTTTCCACACAGACATCATAACAAAAAATTTCCACCA",
  "AACCCCCCCTCCCCCGCTTCTGGCCACAGCACTTAAACACATCTCTGCCAAACCCCAAAAACAAAGAACCCTAACACCAGCCTAACCAGATTTCAAATTT",
  "TATCTTTTGGCGGTATGCACTTTTAACAGTCACCCCCCAACTAACACATTATTTTCCCCTCCCACTCCCATACTACTAATCTCATCAATACAACCCCCGC",
  "CCATCCTACCCAGCACACACACACCGCTGCTAACCCCATACCCCGAACCAACCAAACCCCAAAGACACCCCCCACAGTTTATGTAGCTTACCTCCTCAAA",
  "GCAATACACTGAAAATGTTTAGACGGGCTCACATCACCCCATAAACAAATAGGTTTGGTCCTAGCCTTTCTATTAGCTCTTAGTAAGATTACACATGCAA",
  "GCATCCCCGTTCCAGTGAGTTCACCCTCTAAATCACCACGATCAAAAGGAACAAGCATCAAGCACGCAGCAATGCAGCTCAAAACGCTTAGCCTAGCCAC",
  "ACCCCCACGGGAAACAGCAGTGATTAACCTTTAGCAATAAACGAAAGTTTAACTAAGCTATACTAACCCCAGGGTTGGTCAATTTCGTGCCAGCCACCGC",
  "GGTCACACGATTAACCCAAGTCAATAGAAGCCGGCGTAAAGAGTGTTTTAGATCACCCCCTCCCCAATAAAGCTAAAACTCACCTGAGTTGTAAAAAACT",
].join("");

/** GRCh38 chr1:10,001-10,036 in the UCSC copy: soft-masked telomere repeat (seq 3.1). */
const TELOMERE = "taaccctaaccctaaccctaaccctaaccctaaccc";
const TELOMERE_HEADER = ">chr1_tel GRCh38 chr1:10001-10036 soft-masked";

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const wrap = (seq: string, width: number): string[] =>
  Array.from({ length: Math.ceil(seq.length / width) }, (_, i) => seq.slice(i * width, (i + 1) * width));
/** Cut a string into consecutive pieces of the given lengths. */
function cut(seq: string, lengths: readonly number[]): string[] {
  let at = 0;
  return lengths.map((n) => {
    const piece = seq.slice(at, at + n);
    at += n;
    return piece;
  });
}
/** A number in a code chip: file values are exact bytes. */
const chip = (n: number) => `\`${n}\``;
/** Prose numbers with thousands separators. */
const comma = (n: number) => n.toLocaleString("en-US");
/** At most two significant digits, as an "about" answer shows them: 0.79, 0.064, 1.9, 12. */
function about(x: number): string {
  if (x >= 10) return String(Math.round(x));
  return String(Number(x.toPrecision(2)));
}

// ---------------------------------------------------------------------------------------------
// 2.1 · spot-the-error, single pick (FA-S02): a middle line shorter than its record's other
// lines; a soft-masked record and a short last line are "fine here" distractors.

interface ShortLineSpec {
  /** Bases per full line. */
  width: number;
  /** 1-based chrM position of the record's first base (61 or more). */
  start: number;
  /** Full-width lines before the record's shorter last line. */
  full: number;
  /** Which sequence line (1-based, 2..full) is short. */
  shortLine: number;
  /** How many bases it lacks. */
  shortBy: number;
  /** Bases on the record's last line (1..width-1). */
  last: number;
  /** Whether the soft-masked record comes first. */
  telomereFirst: boolean;
}

const MASKED_FINE =
  "Lowercase marks soft-masked repeat sequence. The bases are the same, and the line is as wide as its record's other full lines.";
const LAST_FINE = "The last line of a record may be shorter than the others.";

function shortLineVariant(id: string, spec: ShortLineSpec): SpotTheErrorExercise {
  const lengths = [
    ...Array.from({ length: spec.full }, (_, i) =>
      i + 1 === spec.shortLine ? spec.width - spec.shortBy : spec.width,
    ),
    spec.last,
  ];
  const from = spec.start - CHRM_FROM;
  const bases = CHRM.slice(from, from + sum(lengths));
  const end = spec.start + bases.length - 1;
  const chrm = [`>chrM_part GRCh38 chrM:${spec.start}-${end}`, ...cut(bases, lengths)];
  const telomere = [TELOMERE_HEADER, ...wrap(TELOMERE, spec.width)];
  const lines = spec.telomereFirst ? [...telomere, ...chrm] : [...chrm, ...telomere];
  const chrmHeader = spec.telomereFirst ? telomere.length + 1 : 1;
  const telHeader = spec.telomereFirst ? 1 : chrm.length + 1;
  const answer = chrmHeader + spec.shortLine;

  const fineHere: Record<string, string> = { [String(chrmHeader + lengths.length)]: LAST_FINE };
  telomere.slice(1).forEach((line, i) => {
    const n = telHeader + 1 + i;
    fineHere[String(n)] = line.length < spec.width ? LAST_FINE : MASKED_FINE;
  });

  return {
    id,
    kind: "spot-the-error",
    title: "Which line stops this FASTA from being indexed?",
    prompt: "`samtools faidx` refuses this file. Select the one line that breaks the FASTA rules.",
    source: "seq EX-01 pattern on fresh GRCh38 chrM bases",
    tags: ["validity", "application"],
    formats: ["fasta"],
    concepts: ["fasta.line-width", "fasta.soft-masking", "fasta.structure-rules"],
    singlePick: true,
    rounds: [
      {
        id: "a",
        snippet: {
          filename: "toy.fa",
          format: "fasta",
          kind: "text",
          text: `${lines.join("\n")}\n`,
          provenance: "toy",
        },
        granularity: "line",
        validation: { format: "fasta", profile: {} },
        answers: [
          {
            line: answer,
            rule: "FA-S02",
            explanation: `Line ${answer} has ${spec.width - spec.shortBy} bases, but the other full lines of \`chrM_part\` have ${spec.width}. Only a record's last line may be shorter (FA-S02).`,
          },
        ],
        fineHere,
        toolsSay: "samtools faidx 1.24 refuses the file and names the line after the short one.",
      },
    ],
  };
}

const WIDTHS = [12, 14, 15, 16, 18] as const;

const shortLineGenerator: ParametricGenerator<SpotTheErrorExercise> = {
  id: "fasta-short-line",
  generate(rng: Rng) {
    const width = rng.pick(WIDTHS);
    const full = rng.int(4, 5);
    const shortLine = rng.int(2, full);
    const shortBy = rng.int(1, 4);
    const last = rng.int(2, width - 1);
    const length = full * width - shortBy + last;
    const start = rng.int(CHRM_FROM, CHRM_FROM + CHRM.length - length);
    const telomereFirst = rng.next() < 0.5;
    return shortLineVariant(
      `${QUIZ}/2.1/w${width}-s${start}-n${full}-l${shortLine}-d${shortBy}-e${last}-${telomereFirst ? "t" : "m"}`,
      { width, start, full, shortLine, shortBy, last, telomereFirst },
    );
  },
};

// ---------------------------------------------------------------------------------------------
// 2.2 · mcq (seq Q2): the byte of a base from a .fai row. Distractors: a forgotten newline, a
// 1-based p in the formula, and OFFSET itself.

interface FaiSpec {
  fasta: string;
  name: string;
  length: number;
  offset: number;
  lineBases: number;
  lineWidth: number;
  /** 1-based. */
  position: number;
  provenance: Snippet["provenance"];
}

function faiVariant(id: string, s: FaiSpec): ComputedMcq {
  const row = `${s.name}\t${s.length}\t${s.offset}\t${s.lineBases}\t${s.lineWidth}`;
  const geometry = { offset: s.offset, lineBases: s.lineBases, lineWidth: s.lineWidth };
  const p = s.position - 1;
  const key = faiByte(geometry, p);
  const lines = Math.floor(p / s.lineBases);
  const rest = p % s.lineBases;
  const options: McqOption[] = [
    {
      id: "key",
      text: chip(key),
      correct: true,
      explanation: `p = ${comma(p)}: ${comma(lines)} full line${lines === 1 ? "" : "s"} of ${s.lineWidth} bytes, then ${rest} more. ${chip(s.offset)} + ${comma(lines)} × ${s.lineWidth} + ${rest} = ${chip(key)}.`,
    },
    {
      id: "no-newline",
      text: chip(s.offset + p),
      correct: false,
      explanation: `This counts ${s.lineBases} bytes per line and forgets each line's newline. LINEWIDTH is ${s.lineWidth}.`,
    },
    {
      id: "one-based",
      text: chip(faiByte(geometry, s.position)),
      correct: false,
      explanation: `This puts the 1-based position ${comma(s.position)} into the formula. p is the 0-based position, ${comma(p)}.`,
    },
    {
      id: "offset",
      text: chip(s.offset),
      correct: false,
      explanation: `That is OFFSET, the byte of base 1 of \`${s.name}\`.`,
    },
  ];
  return {
    id,
    kind: "mcq",
    title: "Where is this base in the file?",
    prompt: `This is the \`${s.name}\` row of \`${s.fasta}.fai\`, with TABs between its five columns.`,
    source: "seq Q2 pattern",
    tags: ["application"],
    formats: ["fai", "fasta"],
    concepts: ["fai.columns", "fai.byte-offset"],
    multi: false,
    stem: `At which byte of \`${s.fasta}\` does base ${comma(s.position)} of \`${s.name}\` (1-based) sit?`,
    snippet: {
      filename: `${s.fasta}.fai`,
      format: "fai",
      kind: "text",
      text: `${row}\n`,
      provenance: s.provenance,
    },
    options,
    computeWith: { helper: "faiByte", args: { row, position: s.position } },
  };
}

const LINE_BASES = [50, 60, 70, 80, 100] as const;

const faiGenerator: ParametricGenerator<McqExercise> = {
  id: "fai-byte",
  generate(rng: Rng) {
    const lineBases = rng.pick(LINE_BASES);
    const length = rng.int(200_000, 9_000_000);
    const offset = rng.int(7, 3_000_000);
    const position = rng.int(lineBases + 2, length);
    return faiVariant(`${QUIZ}/2.2/b${lineBases}-o${offset}-p${position}`, {
      fasta: "toy.fa",
      name: "chrZ",
      length,
      offset,
      lineBases,
      lineWidth: lineBases + 1,
      position,
      provenance: "toy",
    });
  },
};

// ---------------------------------------------------------------------------------------------
// 2.3 · mcq, recognition (seq 6, Q6): the head of a `.fa.gz`. Bytes made on 2026-10-17 from the
// same 61-base FASTA: plain gzip by GNU gzip (FLG 08, a file name), BGZF by a zlib block built to
// SAMv1 §4.1 (FLG 04, XLEN 6, the `BC` subfield, BSIZE). The viewer hides the identity (the
// badge would name the answer), so the stem does not name the file either.

const hexHead = (head: string, format: "gzip" | "bgzf", annotations: HexAnnotation[]): Snippet => ({
  filename: "ref.fa.gz",
  format,
  kind: "hex",
  hex: { head, annotations },
  provenance: "toy",
  hideIdentity: true,
});

/** The parts both 2.3 variants share. */
const recognition = (
  id: string,
  formats: FormatId[],
  snippet: Snippet,
  options: McqOption[],
): McqExercise => ({
  id,
  kind: "mcq",
  title: "Can this file be indexed as it is?",
  prompt: "Bytes are shown in hex, 16 to a row.",
  source: "seq 6, Q6",
  tags: ["recognition", "application"],
  formats,
  concepts: ["compression.gzip-vs-bgzf", "recognition.first-bytes"],
  multi: false,
  stem: "These are the first bytes of a compressed FASTA. Can `samtools faidx` index the file as it is?",
  snippet,
  options,
});

const bgzfHead = recognition(
  `${QUIZ}/2.3/a`,
  ["bgzf", "fasta"],
  hexHead("1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00 63 00 b3 4b ce 28 f2 8d", "bgzf", [
    { from: 0, to: 2, label: "gzip magic" },
    { from: 3, to: 4, label: "flags" },
    { from: 10, to: 18, label: "extra field" },
  ]),
  [
    {
      id: "bgzf",
      text: "Yes. It is BGZF, so `samtools faidx` writes a `.fai` and a `.gzi`.",
      correct: true,
      explanation:
        "Flag `04` announces an extra field, and `42 43` spells `BC`: a BGZF block. The `.gzi` maps compressed offsets to uncompressed ones.",
    },
    {
      id: "gzip",
      text: "No. It is plain gzip; recompress it with `bgzip` first.",
      correct: false,
      explanation: "Plain gzip has no `BC` subfield. These bytes carry one, so the file is already BGZF.",
    },
    {
      id: "never",
      text: "No. A compressed FASTA can never be indexed.",
      correct: false,
      explanation:
        "BGZF can be: its blocks decompress on their own, and the `.gzi` finds the block that holds a base.",
    },
    {
      id: "fai-only",
      text: "Yes, and the `.fai` alone is enough to find any base.",
      correct: false,
      explanation:
        "The `.fai` gives uncompressed offsets. Finding the compressed block that holds one needs the `.gzi` too.",
    },
  ],
);

const gzipHead = recognition(
  `${QUIZ}/2.3/b`,
  ["gzip", "fasta"],
  hexHead("1f 8b 08 08 98 be a7 6a 00 03 72 65 66 2e 66 61 00 b3 4b ce 28 f2 8d 2f", "gzip", [
    { from: 0, to: 2, label: "gzip magic" },
    { from: 3, to: 4, label: "flags" },
    { from: 10, to: 17, label: "file name" },
  ]),
  [
    {
      id: "gzip",
      text: "No. It is plain gzip: decompress it, recompress it with `bgzip`, then index it.",
      correct: true,
      explanation:
        "Flag `08` announces a file name, not an extra field, so there is no `BC` subfield. samtools stops with `Cannot index files compressed with gzip`.",
    },
    {
      id: "bgzf",
      text: "Yes. It is BGZF, so `samtools faidx` writes a `.fai` and a `.gzi`.",
      correct: false,
      explanation:
        "BGZF sets flag `04` and carries a `BC` subfield. These bytes have flag `08` and a file name.",
    },
    {
      id: "rename",
      text: "Yes, once its extension is changed to `.bgz`.",
      correct: false,
      explanation: "Renaming changes no bytes, so samtools still sees one gzip stream.",
    },
    {
      id: "plain-only",
      text: "No. It must stay uncompressed to be indexed.",
      correct: false,
      explanation:
        "An uncompressed copy can be indexed, but `bgzip` keeps the file compressed and indexable.",
    },
  ],
);

// ---------------------------------------------------------------------------------------------
// 2.4 · mcq, LO6 (seq Q3): expected errors of a quality string. Variant A keeps seq Q3's
// distractors; the generator's are the summed Q values, Q averaged before converting, and the
// mean probability per base.

/** The parts every 2.4 variant shares. */
const errorsMcq = (id: string, quality: string, options: McqOption[]): ComputedMcq => ({
  id,
  kind: "mcq",
  title: "Expected errors in a read",
  prompt: "Use the Reference card to turn characters into error probabilities.",
  source: "seq Q3 pattern",
  tags: ["application", "LO6"],
  formats: ["fastq"],
  concepts: ["quality.phred33", "quality.expected-errors"],
  multi: false,
  stem: errorsStem(quality),
  options,
  computeWith: { helper: "expectedErrors", args: { quality } },
});

const errorsStem = (quality: string) =>
  `A read's Phred+33 quality string is \`${quality}\`, one character per base. About how many errors do you expect in this read?`;

const errorsA = errorsMcq(`${QUIZ}/2.4/a`, ")))))", [
  {
    id: "key",
    text: "About 0.79",
    correct: true,
    explanation: "`)` is ASCII 41, so Q8 and P = 0.158. Five such bases add up to 0.79 expected errors.",
  },
  {
    id: "thousandths",
    text: "About 0.04",
    correct: false,
    explanation: "This reads Q8 as P = 0.008. Q8 means P = 10^{−0.8} = 0.158.",
  },
  {
    id: "sum-q",
    text: "40",
    correct: false,
    explanation: "This adds the Q values. Expected errors add the error probabilities, not the scores.",
  },
  {
    id: "all-wrong",
    text: "5",
    correct: false,
    explanation: "This counts every base as an error. Each Q8 base is wrong with probability 0.158, not 1.",
  },
]);

/** Quality characters for the generator: mostly good bases, one or two poor ones. */
const GOOD = ["I", "F", "?", ":", "5"] as const;
const POOR = ["#", "&", ")", "+", ","] as const;
/** Lesson strings that no quiz variant may reuse (L06.2). */
const LESSON_QUALITIES = new Set(["IIII#", "IIIIIIIIII5555555555"]);

function errorsVariant(quality: string): ComputedMcq | undefined {
  const qs = quality.split("").map((c) => charToQ(c));
  const n = qs.length;
  const key = expectedErrors(quality);
  const sumQ = sum(qs);
  const averaged = n * qToP(sumQ / n);
  const meanP = key / n;
  const texts = [`About ${about(key)}`, String(sumQ), `About ${about(averaged)}`, `About ${about(meanP)}`];
  if (new Set(texts).size !== texts.length) return undefined;
  // Only the key's option may show the key at its written precision (keys.ts `shows`).
  const showsKey = (text: string) => {
    const m = /-?\d+(?:\.\d+)?/.exec(text);
    if (!m) return false;
    const decimals = m[0].split(".")[1]?.length ?? 0;
    return Math.abs(Number(m[0]) - key) <= 0.5 * 10 ** -decimals + 1e-12;
  };
  if (!showsKey(texts[0]!) || texts.slice(1).some(showsKey)) return undefined;

  const groups = new Map<string, number>();
  for (const c of quality) groups.set(c, (groups.get(c) ?? 0) + 1);
  const parts = [...groups].map(([c, k]) => `${k} × ${Number(qToP(charToQ(c)).toPrecision(3))}`);
  return errorsMcq(
    `${QUIZ}/2.4/q-${quality
      .split("")
      .map((c) => c.charCodeAt(0).toString(16))
      .join("")}`,
    quality,
    [
      {
        id: "key",
        text: texts[0]!,
        correct: true,
        explanation: `Add the probabilities from the table: ${parts.join(" + ")} = ${about(key)}.`,
      },
      {
        id: "sum-q",
        text: texts[1]!,
        correct: false,
        explanation: "This adds the Q values. Expected errors add the error probabilities, not the scores.",
      },
      {
        id: "average-q",
        text: texts[2]!,
        correct: false,
        explanation:
          "This averages Q before converting. Q is logarithmic, so the average hides the worst bases.",
      },
      {
        id: "mean-p",
        text: texts[3]!,
        correct: false,
        explanation:
          "This is the mean error probability per base. The read's expected errors are the sum over all its bases.",
      },
    ],
  );
}

const errorsGenerator: ParametricGenerator<McqExercise> = {
  id: "expected-errors",
  generate(rng: Rng) {
    for (;;) {
      const n = rng.int(5, 10);
      const chars = Array.from({ length: n }, () => rng.pick(GOOD) as string);
      const poor = rng.int(1, 2);
      for (let k = 0; k < poor; k += 1) chars[rng.int(0, n - 1)] = rng.pick(POOR);
      const quality = chars.join("");
      if (LESSON_QUALITIES.has(quality) || !POOR.some((c) => quality.includes(c))) continue;
      const variant = errorsVariant(quality);
      if (variant) return variant;
    }
  },
};

// ---------------------------------------------------------------------------------------------
// 2.5 · spot-the-error, single pick (FQ-S04): three records, one quality line a character short;
// a `+` line that repeats its title exactly is a "fine here" distractor.

interface QualitySpec {
  /** Read length, the same for the three reads. */
  length: number;
  /** 1-based chrM start of each read's bases. */
  starts: [number, number, number];
  /** Quality strings, each `length` long before the defect. */
  qualities: [string, string, string];
  /** 0-based index of the record whose quality line is one character short. */
  short: number;
  /** 0-based index of the record whose `+` line repeats the title. */
  repeat: number;
}

function shortQualityVariant(id: string, s: QualitySpec): SpotTheErrorExercise {
  const lines: string[] = [];
  const fineHere: Record<string, string> = {};
  s.starts.forEach((start, i) => {
    const title = `read${i + 1} 1:N:0:GTCA`;
    const bases = CHRM.slice(start - CHRM_FROM, start - CHRM_FROM + s.length);
    const full = s.qualities[i] ?? "";
    const quality = i === s.short ? full.slice(0, -1) : full;
    const at = lines.length;
    lines.push(`@${title}`, bases, i === s.repeat ? `+${title}` : "+", quality);
    if (i === s.repeat)
      fineHere[String(at + 3)] =
        "A `+` line may repeat the title, as long as it matches exactly. This one does.";
    if (i !== s.short) fineHere[String(at + 4)] = `${s.length} quality characters for ${s.length} bases.`;
  });
  const answer = 4 * s.short + 4;
  return {
    id,
    kind: "spot-the-error",
    title: "Which line breaks this FASTQ file?",
    prompt: "One line in this file breaks the FASTQ rules. Select it.",
    source: "seq EX-09 pattern on fresh records",
    tags: ["validity", "application"],
    formats: ["fastq"],
    concepts: ["fastq.record", "fastq.structure-rules"],
    singlePick: true,
    rounds: [
      {
        id: "a",
        snippet: {
          filename: "reads.fastq",
          format: "fastq",
          kind: "text",
          text: `${lines.join("\n")}\n`,
          provenance: "toy",
        },
        granularity: "line",
        validation: { format: "fastq", profile: {} },
        answers: [
          {
            line: answer,
            rule: "FQ-S04",
            explanation: `Line ${answer} has ${s.length - 1} quality characters for ${s.length} bases. Every base needs exactly one quality character (FQ-S04).`,
          },
        ],
        fineHere,
        toolsSay: "Biopython 1.88 and samtools 1.24 both reject a quality line of the wrong length.",
      },
    ],
  };
}

/** A binned quality string: mostly `F`, some `:` and `,` (D-18's alphabet). */
function binnedQuality(rng: Rng, length: number): string {
  const chars = Array.from({ length }, () => {
    const r = rng.next();
    return r < 0.8 ? "F" : r < 0.93 ? ":" : ",";
  });
  chars[rng.int(1, length - 1)] = ":";
  return chars.join("");
}

const shortQualityGenerator: ParametricGenerator<SpotTheErrorExercise> = {
  id: "fastq-short-quality",
  generate(rng: Rng) {
    const length = rng.int(20, 30);
    const starts = [0, 1, 2].map(() => rng.int(CHRM_FROM, CHRM_FROM + CHRM.length - length)) as [
      number,
      number,
      number,
    ];
    const qualities = [0, 1, 2].map(() => binnedQuality(rng, length)) as [string, string, string];
    const short = rng.int(0, 2);
    const repeat = (short + rng.int(1, 2)) % 3;
    return shortQualityVariant(`${QUIZ}/2.5/n${length}-r${short}-t${repeat}-s${starts.join("-")}`, {
      length,
      starts,
      qualities,
      short,
      repeat,
    });
  },
};

// ---------------------------------------------------------------------------------------------
// 2.6 · mcq, LO7: which question each file answers, keeps and drops (L04-L07 At-a-glance rows).

/** The parts both 2.6 variants share. */
const lo7 = (
  id: string,
  title: string,
  formats: FormatId[],
  stem: string,
  options: McqOption[],
): McqExercise => ({
  id,
  kind: "mcq",
  title,
  prompt: "Think about what each file keeps and what it drops.",
  source: "PLAN 6.1 Q2.6",
  tags: ["LO7"],
  formats,
  concepts: ["pipeline.file-questions"],
  multi: false,
  stem,
  options,
});

const nextFile = lo7(
  `${QUIZ}/2.6/a`,
  "Which question is still open?",
  ["fastq", "fasta"],
  "You have a trio's three FASTQ pairs and the reference FASTA. Which question can you still not answer, and which file answers it next?",
  [
    {
      id: "placement",
      text: "Where each read belongs on the reference; the aligner's SAM or BAM file answers it.",
      correct: true,
      explanation:
        "FASTQ drops position, and the FASTA holds no reads. Alignment places each read, and SAM or BAM records where.",
    },
    {
      id: "confidence",
      text: "How sure the sequencer was of each base; the BAM file answers it.",
      correct: false,
      explanation: "The FASTQ already answers this: every base has a quality character.",
    },
    {
      id: "fai",
      text: "Where each reference sequence's bases sit in the file; the `.fai` answers it.",
      correct: false,
      explanation:
        "The `.fai` only speeds up lookups in the FASTA you already have. It says nothing about the reads.",
    },
    {
      id: "variants",
      text: "How each genome differs from the reference; a VCF called straight from the FASTQ files answers it next.",
      correct: false,
      explanation:
        "That question is open too, but a variant caller needs placed reads. Alignment to SAM or BAM comes first, then the VCF.",
    },
  ],
);

/** Variant B is taught by L05's At-a-glance card, so its "Review:" link goes there. */
const faiAnswers: QuizVariant = {
  tests: "random-access#recap",
  ...lo7(
    `${QUIZ}/2.6/b`,
    "What does a .fai answer?",
    ["fai", "fasta"],
    "A FASTA comes with its `.fai` index. What does the `.fai` answer, and what can it not tell you?",
    [
      {
        id: "bytes",
        text: "Where each sequence's bases sit in this one file; nothing about the bases or any sample.",
        correct: true,
        explanation:
          "A `.fai` holds a name, a length and byte geometry per sequence, for one file. It stores no bases, reads or qualities.",
      },
      {
        id: "reads",
        text: "Where each read belongs on the reference; nothing about how good the reads are.",
        correct: false,
        explanation:
          "Placing reads is the aligner's job, recorded in SAM or BAM. A `.fai` knows nothing about reads.",
      },
      {
        id: "compressed",
        text: "The bases of each sequence, stored in compact form; nothing about where they sit.",
        correct: false,
        explanation: "A `.fai` stores no bases at all: five numbers per sequence that point into the FASTA.",
      },
      {
        id: "any-copy",
        text: "Where each base sits in any copy of GRCh38; nothing about how good each base is.",
        correct: false,
        explanation:
          "Copies wrap their lines differently, so a `.fai` is valid only for the exact file it was built from.",
      },
    ],
  ),
};

// ---------------------------------------------------------------------------------------------
// Reference card: the `.fai` formula (p 0-based), the Phred formula and the Phred+33 table.

const PHRED_ROWS = 14;
const pText = (q: number) => String(Number(qToP(q).toPrecision(3)));
/** `!` (Q0) to `J` (Q41) in three column groups of 14 rows. */
const phredTable: ReferenceItem = {
  kind: "table",
  caption: "Phred+33 characters: Q and error probability",
  columns: ["Char", "Q", "P(error)", "Char", "Q", "P(error)", "Char", "Q", "P(error)"],
  rows: Array.from({ length: PHRED_ROWS }, (_, i) =>
    [i, i + PHRED_ROWS, i + 2 * PHRED_ROWS].flatMap((q) => [`\`${qToChar(q)}\``, String(q), pText(q)]),
  ),
};

export const sequences = {
  section: "sequences",
  title: "Section quiz: Sequences",
  passMark: 5,
  referenceCard: {
    title: "Reference card",
    items: [
      {
        kind: "formula",
        label: "Byte of a base, from a `.fai` row",
        formula: "byte = OFFSET + floor(p / LINEBASES) × LINEWIDTH + (p mod LINEBASES)",
        note: "p is the base's 0-based position. OFFSET, LINEBASES and LINEWIDTH are columns 3, 4 and 5 of the row.",
      },
      {
        kind: "formula",
        label: "Phred quality",
        formula: "Q = −10 × log10(P), so P = 10^{−Q/10}",
        note: "Phred+33 writes Q as the character whose ASCII code is Q + 33.",
      },
      phredTable,
    ],
  },
  slots: [
    {
      id: "2.1",
      tests: "fasta-reference#try-it-why-wont-this-index",
      tags: ["validity", "application"],
      concepts: ["fasta.line-width", "fasta.soft-masking", "fasta.structure-rules"],
      variants: [
        shortLineVariant(`${QUIZ}/2.1/a`, {
          width: 15,
          start: 61,
          full: 4,
          shortLine: 3,
          shortBy: 3,
          last: 8,
          telomereFirst: false,
        }),
      ],
      generator: shortLineGenerator,
    },
    {
      id: "2.2",
      tests: "random-access#try-it-find-the-byte",
      tags: ["application"],
      concepts: ["fai.columns", "fai.byte-offset"],
      variants: [
        faiVariant(`${QUIZ}/2.2/a`, {
          fasta: "Homo_sapiens_assembly38.fasta",
          name: "chr2",
          length: 242_193_529,
          offset: 251_446_211,
          lineBases: 100,
          lineWidth: 101,
          position: 101,
          provenance: "real-file",
        }),
      ],
      generator: faiGenerator,
    },
    {
      id: "2.3",
      tests: "random-access#gzip-versus-bgzf",
      tags: ["recognition", "application"],
      concepts: ["compression.gzip-vs-bgzf", "recognition.first-bytes"],
      variants: [bgzfHead, gzipHead],
    },
    {
      id: "2.4",
      tests: "fastq-reads#try-it-quality-as-probability",
      tags: ["application", "LO6"],
      concepts: ["quality.phred33", "quality.expected-errors"],
      variants: [errorsA],
      generator: errorsGenerator,
    },
    {
      id: "2.5",
      tests: "fastq-in-the-wild#try-it-three-broken-records",
      tags: ["validity", "application"],
      concepts: ["fastq.record", "fastq.structure-rules"],
      variants: [
        shortQualityVariant(`${QUIZ}/2.5/a`, {
          length: 24,
          starts: [301, 529, 757],
          qualities: ["FFFFFFFF:FFFFFFFFFF,FFFF", "FFF:FFFFFFFFFFFFFF:FFFFF", "FFFFFFFFFFFF,FFFFFFF:FFF"],
          short: 1,
          repeat: 2,
        }),
      ],
      generator: shortQualityGenerator,
    },
    {
      id: "2.6",
      tests: "fastq-reads#recap",
      tags: ["LO7"],
      concepts: ["pipeline.file-questions"],
      variants: [nextFile, faiAnswers],
    },
  ],
} satisfies Quiz;
