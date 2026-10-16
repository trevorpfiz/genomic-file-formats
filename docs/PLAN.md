# Genomic File Formats: course and build plan

Status: plan v3, 2026-10-16. v2 was revised after a four-lens review (science, pedagogy, UX, engineering); v3 applies the owner's answers to the questions in §15, given 2026-10-16 (only OQ-6 stays open). Appendix C logs both rounds: what changed, what was substituted and what was rejected. This is the build contract for the people and agents who write, design and engineer the course.

**Inputs.** The ten research notes in `docs/research/` (Appendix A). Where a note has a "Verification log", the log takes precedence over the note's earlier text. `case.md` is the canonical definition of the story and replaces the placeholder coordinates used in the other notes (its §10.2), except where this plan overrides it (§9.5). Claims this plan depends on that are not yet confirmed in a primary source carry a `V-xx` reference to the verification register (§12.4). Nothing in this plan should be read as a fact that is not in the notes or the specs.

**Abbreviations.**
- Research notes: `found` (foundations.md), `seq` (sequences.md), `int` (intervals-signals.md), `aln` (alignments.md), `var` (variants.md), `ann` (annotation.md), `gph` (graphs.md), `case` (case.md), `ux` (ux-design.md), `tech` (tech-architecture.md). `seq EX-01` means exercise EX-01 in sequences.md; `case Q3` means quiz item Q3 in case.md.
- Plan labels: `L04` = lesson 4; `L04.2` = the second interaction in lesson 4; `L04.0` = the section opener in the first lesson of a section (narrative since v3, not an interaction); an item marked "Optional practice (Read more)" keeps its ID but is ungraded (§5); `Q2.3` = slot 3 of section quiz 2; `F01`-`F15` = capstone files; `D-xx` = plan decision (§2); `OQ-x` = owner question (§15); `V-xx` = verification item (§12.4); `R-xx` = risk (§14). Rule IDs (`BED-S17`, `CASE-03`, `XF-12`, ...) are the research notes' own IDs.
- "TAB" means one literal tab character. Snippets quoted inline in this plan show TABs as spaces; every snippet in the course keeps the exact separators of its source.

---

## 0. Summary

**What we are building.** *Genomic File Formats*, an interactive course for bioinformatics students, shipped as **one self-contained HTML file** that can be emailed or opened from disk (`file://`). The same bytes are published on GitHub Pages. The repo is public. Code and course text are MIT-licensed; the bundled fonts (OFL-1.1) and icons (ISC) keep their own licenses, with notices in `LICENSES/` and on `#/about` (OQ-8, option a).

**Objective.** The learner recognizes each file type and assesses its validity. We cover 14 types: the owner's 12 items, with GTF/GFF3 and GFA/PAF each counted as two (D-07). They are FASTA, FASTQ, BED, BEDPE, WIG, GTF, GFF3, SAM, BAM, CRAM, gVCF, VCF, PAF and GFA. Index and compression companions (`.fai`, `.gzi`, `.bai`, `.csi`, `.tbi`, `.crai`; gzip vs BGZF) are taught along the way.

**Shape.**
- **Eight sections:** seven content sections with **22 lessons** of 8-10 minutes each (**about 193 min**), each section capped by a **6-question quiz** (about 8 min). Then a **capstone**: triage a 15-file case folder (about 35 min). Then the closing lesson and a **completion badge**.
- **Timing:** the owner chose named content cuts (OQ-2, option B): prose capped at 600 words per lesson, narrative section openers, and smaller items moved to optional practice. The lesson path is about 3 h 13 min, inside the owner's 3 h 10 min ± 5 min; with the 7 quizzes (about 56 min) and the capstone (about 35 min) it is about 4 h 44 min. Both figures come from a per-unit minutes model (§11.6) that the M1 micro-pilot calibrates.
- **Interactions:** 69 graded exercises in the lessons, 3-4 per lesson, at most about 450 prose words apart, with one in nearly every H2 section. The six section openers are narrative, and 14 smaller items are optional, ungraded practice in collapsed Read-more cards. Every lesson has a TOC aside and ends with a Recap.

**Story.** Family P042: Noa, a fictional 4-year-old with a Dravet-like history, and her parents. The story escalates in five steps, in the order the course presents them:
1. Trio exome: no convincing de novo SNV.
2. Exome reanalysis: a coverage dip over four exons, plus a Mendelian error inside it.
3. Gene model: what losing those exons would do.
4. Short-read WGS: a breakpoint pair.
5. HiFi long reads and a local graph: the exact structure.

The answer is a de novo, paternal, heterozygous **25,213-bp deletion of SCN1A MANE exons 17-20**. It is predicted to shift the frame. The reference genome, annotation and SNPs are real public data (GRCh38, GENCODE v43, dbSNP138); the variants and genotypes are invented.

**How validity is taught.** L02 defines what "valid" means: three severities (error, warning, convention) and three verdicts (Valid, Invalid, Valid but unusable here) that every later exercise, quiz and the capstone reuse. Each format then has:
- a recognition exercise;
- a validity exercise (spot-the-error or fix-it);
- quiz items, including a recognition and a validity item in every quiz from Q2 on;
- a capstone file.

TypeScript validators implement the notes' rule IDs. They are spec-strict, with a "Tools say" note, because samtools, bcftools, bedtools and gfatools silently accept many invalid files (aln §5, var §5, gph §5). Content tests check every answer key against the validators. Only the rules that fix-it exercises need ship in the browser; the rest run at test time (D-11, §8.2).

**Architecture.**
- **Toolchain:** Vite+ 1.3.0, with vite-plugin-singlefile 2.3.3 inlining everything into the one file. The owner-pinned toolchain is exempt from the 14-day release-age gate (D-31).
- **Lessons:** Markdown with remark-directive, compiled by a project plugin that loads exercise data through Vite's module graph.
- **Widgets:** custom elements, with Preact islands for the simulators; every simulator has a pure model and a text view.
- **Runtime:** hash routes; localStorage with merge-on-write, an in-memory fallback and a compact progress code; static no-JavaScript fallback text.
- **Tests:** four layers, plus e2e tests on the built file over `file://` in light and dark themes.
- **Release:** tag-driven. One build feeds both the GitHub Release and GitHub Pages.

**First milestone (M1).** A vertical slice for owner review: app shell, design system, all seven component types, FASTA/FASTQ validators, and Section 2 (Sequences: 4 lessons plus its quiz). M0 first proves that a clean CI install works with the release-age gate on.

**Owner questions (§15).** The owner answered eight of the nine on 2026-10-16: the case is approved; the lessons are cut to about 3 h 10 min (option B); the badge rule, pass mark, accent and body font are as proposed; small GRCh38, GENCODE and dbSNP extracts ship in the repo once V-05 confirms their terms; fonts and icons keep their own licenses (option a); and the research notes stay as they are. Only OQ-6, a clinical reviewer, is open, with a deadline of before v1.0. Until one is named, and in v1.0 if none is, clinical claims stay narrative-only and hedged.

---

## 1. Goals, audience and measurable success criteria

### 1.1 Goals

- **G1. Owner objective (verbatim):** "Demonstrate understanding of different data formats and types by recognizing each file type and assessing its validity. Data formats to include FASTA, FASTQ, BED, BEDPE, WIG, GTF/GFF3, SAM, BAM, CRAM, gVCF, VCF, and GFA/PAF."
- **G2. Intuition over memorization.** The learner can explain *why* each format looks the way it does: the design problem it solves, and what it keeps and what it drops. Lookup tables (ASCII, FLAG bits) are provided, never memorized.
- **G3. The bigger picture.** The learner can follow one case from a blood sample to a diagnosis, and can say which question each format answers in finding the cause of a disease.
- **G4. Learners succeed.** Learners complete the interactive components and pass the quiz that caps each section.
- **G5. Product.** One accessible file (WCAG 2.2 AA) that works offline, in light and dark themes. Content is maintainable by bioinformaticians, not only front-end developers.

### 1.2 Audience

- **Who.** Bioinformatics students, for example first-year graduate students in a methods course. They know some biology (DNA, genes, transcription at undergraduate level) and some programming. The analogies assume Python slicing or R indexing.
- **Style.** Fundamentals are brisk. The main text carries the spec detail that decides validity; deeper spec minutiae go in optional "Read more" cards placed next to the paragraph they deepen. Quizzes never depend on Read-more-only content (D-09, enforced by a concepts test).
- **What learners do not need.** No command line or installed tools: commands appear only as context, because nothing runs in the course.
- **Not clinical.** The course gives no clinical advice; clinical remarks are narrative (D-35).

**Non-goals for v1.**
- A free-form "Format Lab" or loading the learner's own files. Fix-it editors cap their input at snippet size (§7.2).
- Running real tools in the browser.
- BCF, bigWig and bigBed beyond recognition.
- GFA2 and GAF beyond a Read-more card (D-16).
- An accredited credential.
- Analytics or telemetry (D-34).
- A cheat-sheet route, a glossary route and a PNG badge export (post-v1 backlog, §13).

### 1.3 Success criteria

| Owner criterion | How the course meets it | Build-time check (CI) | Pilot check (M8 targets) |
|---|---|---|---|
| Recognize each file type | Course objective LO1. Every format gets a recognition exercise, quiz items and a capstone file. Format lessons teach recognition cues and end with an "At a glance" card | Coverage test: every one of the 14 formats has at least 1 exercise tagged `recognition`, at least 1 tagged `validity`, at least 1 quiz slot and at least 1 capstone file (matrix in §3.3). Q2-Q7 each have at least 1 `recognition` slot in every variant combination | ≥ 80% of pilot learners name the format of ≥ 13 of 15 capstone files on first submission |
| Assess validity | LO2-LO4. One verdict vocabulary from L02 onward; rule-ID validators; spot-the-error and fix-it in every format lesson; a mini-triage in L12; three capstone verdicts with a balanced key (6 Valid, 2 Valid but unusable here, 7 Invalid) | Answer-key tests (§11.6). Q2-Q7 each have at least 1 `validity` slot (a single-pick spot-the-error on a fresh snippet). Every planted capstone defect fails with exactly its rule IDs | ≥ 75% get ≥ 12 of 15 capstone files fully right (format, verdict and, when not Valid, the reason) without "Show answer" |
| Intuitive understanding, not memorization | A mental-model analogy per format; predict-before-reveal; a simulator for each core mechanism; quizzes favour application and supply lookup tables on a Reference card | ≥ 18 of 22 lessons contain a predict or simulator. In every quiz and every variant combination, ≥ 3 of 6 slots are tagged `application` (a novel snippet or a computation). No quiz variant repeats a lesson exercise's snippet or stem-and-key | Think-aloud: asked "what does this format keep and drop?" for 3 random formats, ≥ 75% give ≥ 2 adequate answers (rubric) |
| See how the formats fit together | One case thread; a case beat in every lesson; a narrative section opener on the pipeline map in the first lesson of S2-S7 (ungraded since v3); "Answers / Keeps / Drops / Next file" rows on every At-a-glance card; an LO7 slot in every quiz; the coordinate crosswalk (started in L03, extended in six lessons, paid off in L22); the capstone leads into L22 before the badge | Every lesson has a `caseBeat`. Every format At-a-glance card has the four rows. Every quiz has ≥ 1 slot tagged `LO7`. The capstone exercises the cross-file rules CASE-01 to CASE-14 | ≥ 70% sort the L22 evidence board correctly on the first check |
| Succeed at the interactive components and quizzes | Unlimited formative retries, hint ladders, and "Show answer" after 2 tries (ux §8.4). 6-question quizzes with a Reference card, unlimited retakes on fresh variants, and the best score kept. No timers | Every exercise is solvable: fix-it solutions validate, and each simulator goal is reached by replaying its witness actions on the pure model (§7.5). Every quiz slot has ≥ 2 variants with the same concept tags | ≥ 80% pass every quiz within 2 attempts. Median first-attempt score ≥ 4 of 6. Items answered correctly by < 40% or > 95% are rewritten |
| Fundamentals first, building up | Foundations is 3 lessons, including "What makes a file valid?"; concept primers open later sections (D-04). Prerequisites are explicit | Frontmatter `introduces` and `requires`. The build fails if a lesson requires a concept that a later lesson introduces, or if a quiz slot's concepts are introduced only in a later section or only inside a Read-more | No pilot learner flags an undefined term. Any flagged term gets an inline definition |
| Clear prose, interactions throughout | 3-4 graded interactions per lesson (D-06 allows 3-5), placed inside the sections they practise; prose ≤ 600 words per lesson (OQ-2); optional practice in collapsed Read-more cards; a style guide (§12.6) | Content lint: ≤ 600 prose words per lesson outside Read-more cards (D-05); ≤ 450 prose words between interactions; the first interaction within about 300 words or by the end of the first content H2; ≤ 300 words between the last interaction and the Recap; every content H2 has an interaction except at most one concept-primer section; at most 2 consecutive Read-more cards and none just before the Recap; average sentence ≤ 22 words, none over 40; a banned-word list | ≤ 2 "confusing passage" flags per lesson after one revision round |
| Every lesson has a TOC aside | The shell builds the aside TOC from each lesson's H2s, including "Try it: …" and "Recap". Quiz, capstone, home and badge pages have their own aside contents (§10.1) | e2e: every lesson route shows a TOC with ≥ 3 entries, ending in "Recap"; every route shows the switcher and the theme control | — |
| Light and dark themes; progress saved where possible, failing gracefully | Tokens plus a System / Light / Dark toggle; storage probe, merge-on-write, fallback notice and progress code (ux §12) | e2e: theme toggle; axe in both themes and in seeded exercise states; persistence across reload; two tabs and two copies do not erase progress; a throwing-storage init script in Chromium, Firefox and WebKit | Manual on real Safari over `file://`: the notice appears and the progress code round-trips |
| About 3 hours (owner size) | The owner chose option B (OQ-2, 2026-10-16): named content cuts, not lesson merges, bring the lessons to about 193 min (3 h 13 min): prose ≤ 600 words per lesson, narrative section openers, and 14 items moved to optional Read-more practice, two of them the parts trimmed from L12.3 and L22.3 (Appendix C.1). Lessons are 8-10 min. With 7 quizzes (about 56 min) and the capstone (about 35 min) the path is about 4 h 44 min; quiz and capstone times are stated on their pills | Minutes lint (§11.6): warn when a lesson's estimate differs from its frontmatter by > 1 min; fail outside 8-12 min per lesson, or outside 185-195 min for the 22 lessons together | Median lesson ≤ 12 min, quiz ≤ 10 min, capstone ≤ 40 min; summed lesson medians ≤ about 3 h 15 min (timed in the M1 micro-pilot and the M8 pilot) |

Pilot evidence comes from 5-8 volunteer students: observed think-alouds with per-item timings, plus the progress codes they choose to export. The progress code carries attempts and first-try flags (ux §12.1). No telemetry (D-34).

---

## 2. Decisions log

### 2.1 Decisions made with the owner

| ID | Decision | Rationale (one line) |
|---|---|---|
| O-01 | One self-contained HTML file, emailable and openable from `file://`; the same file on GitHub Pages; public MIT repo. MIT covers code and course text; the bundled fonts (OFL-1.1) and icons (ISC) keep their own licenses, with notices in `LICENSES/` and on `#/about` (OQ-8, option a) | Zero-install distribution to students and classes |
| O-02 | The learning objective as quoted in G1, covering the 12 named format items | The owner's objective |
| O-03 | Audience: bioinformatics students; brisk fundamentals; spec minutiae in "Read more" | Matches a graduate methods course |
| O-04 | About 3 hours of lessons: 22 lessons of 8-12 minutes, brought to about 3 h 10 min (190 ± 5 min) by named content cuts, not lesson merges, with moved exercises kept as optional practice (OQ-2, option B, 2026-10-16); a quiz per section, a capstone and a completion badge | Fits one or two class sessions; the assessments (about 1.5 h) are stated separately |
| O-05 | One fictional rare-disease trio, a 4-year-old with unexplained seizures, along the draft beats | A story makes every format answer a real question |
| O-06 | Curated snippets only; no Format Lab in v1; validators run on learner-edited text in fix-it exercises | Controlled, checkable content |
| O-07 | Vite+ 1.3.0 ("vp") pinned exactly, pnpm, TypeScript, vite-plugin-singlefile 2.3.3 | Already smoke-tested end to end |
| O-08 | UI/UX inspired by the reference course pages the owner supplied, using none of that brand's names, logos, fonts or assets (the brand is named only in the owner's brief and in `docs/research/ux-design.md`, which the owner keeps public as it is, OQ-9; the shipped course and the `check-dist` denylist are unchanged) | Proven reading layout; legal and brand safety |
| O-09 | Light and dark themes (follows the system, with a toggle); progress saved in the browser where possible, failing gracefully | Comfort; `file://` limits |
| O-10 | Component vocabulary: spot-the-error, fix-it, sort, field-explorer, simulator, predict, mcq | A shared language across the team |
| O-11 | Prose with interactions woven through it; a TOC aside on every lesson | The owner's success criteria |
| O-12 | Owner answers of 2026-10-16 (§15): case approved (OQ-1); option-B time cuts (OQ-2); badge rule and pass mark as proposed (OQ-3, OQ-4); teal and Public Sans (OQ-5); GRCh38, GENCODE v43 and dbSNP138 extracts in the repo (OQ-7); license scope a (OQ-8); research notes kept as they are (OQ-9). OQ-6 (clinical reviewer) stays open until before v1.0 | Recorded in O-01, O-04, O-08, D-04-D-06, D-09, D-10, D-17, D-19, D-24, D-25 and Appendix C |

### 2.2 Decisions this plan makes

| ID | Decision | Rationale (one line) |
|---|---|---|
| D-01 | `case.md` is canonical. Its §10.2 retires the placeholders: targets T1-T4/T3, the 368-bp `DEL_1`, the de novo SNV at chr2:166,009,959, and the inversion. Their format mechanics are kept, re-keyed to the case or moved to toy data. §9.5 lists where this plan overrides case.md | The placeholders are biologically wrong (aln and gph banners) or create an implausible double de novo event (var banner) |
| D-02 | Seven content sections plus a capstone section. One-lesson topics are merged so every quiz caps ≥ 2 lessons: WIG joins the variants section ("Coverage and variants"); BEDPE joins PAF/GFA ("Structural variants and graphs"). That gives 7 quizzes | A full quiz after a single lesson is heavy; the merges follow the story (converging threads; breakpoints → molecule → graph) |
| D-03 | Keep the draft lesson order: WIG right after alignments, before gVCF/VCF. Tell two threads that converge in L16 | Depth is derived from BAM; case §3.3 designs this convergence |
| D-04 | Foundations has 3 lessons; L02 defines validity ("What makes a file valid?"). Concept primers open later sections: sequencing and quality open L06, alignment intuition is L10, variants and genotypes open L14, gene models open L17. Random access (gzip vs BGZF, sorting, indexes) is taught at first use in L05. Each section's first lesson opens with the pipeline map and a narrative LO7 prompt ("which question is still open, and which file answers it?"), ungraded since v3 (OQ-2) | "Teach prerequisites before they are used" without front-loading; validity is half the objective |
| D-05 | 22 lessons, about 193 lesson minutes (8-10 each), after the owner's option-B cuts (OQ-2, 2026-10-16): prose capped at 600 words per lesson (outside Read-more cards); narrative section openers; 14 items moved to optional Read-more practice, including the parts trimmed from L12.3 and L22.3. Minutes come from the per-unit model in §11.6; the minutes lint keeps every lesson within 8-12 and the 22 lessons within 190 ± 5 min. The 600-word cap is a ceiling and 8 minutes a floor: if a lesson written to the cap measures under 8 minutes (most likely L01, L02, L08 or L16, which have the least interaction time, and at the margin L05, L10 or L15, whose graded items come to about 4 minutes or less in the model), the floor wins and the lesson may keep the prose that brings it to 8 minutes (the lint warns). Quizzes about 8 minutes; capstone about 35 minutes; both stated on their pills | The owner chose option B to reach about 3 h 10 min of lessons; content is cut by name, never by merging lessons (merges would create 16-minute lessons) |
| D-06 | 3-5 graded interactions per lesson (3-4 after the v3 cuts); narrative openers and optional practice do not count. ≤ 450 prose words between interactions; the first within about 300 words; one in every content H2 except at most one concept-primer section. One or two "Try it: …" H2s per lesson (in the TOC); the others are "Quick check" H3s whose heading text is the exercise title | One graded interaction every 2-3 minutes; matches the reference TOC pattern (ux §8.1) |
| D-07 | Coverage counts 14 formats: GTF and GFF3, and PAF and GFA, are separate rows | Each half gets its own recognition and validity exercise; no format hides behind its twin |
| D-08 | The capstone has 15 files: case §5a's 14 plus `F15`, a SAM file. Verdicts are Valid / Invalid / Valid but unusable here, with the meanings defined in L02 and mapped from rule metadata (D-11). The key is balanced (6 / 2 / 7); at most 4 of the 9 non-valid files repeat a defect the lessons foreshadowed, and the other 5 apply a taught rule to a new file. `F05` (a CRAM whose reference is absent) and `F08` (a spec-valid gVCF that is plain gzip, so no `.tbi` can be built) are the "unusable here" files. A file counts as correct when format, verdict and, if not Valid, the reason are all right | Every format appears; answering "Invalid" every time scores 7 of 15; the capstone tests transfer, not recall of the story |
| D-09 | Section quiz: 6 scored questions on one page, graded together by "Submit quiz"; explanations appear only after submission; pass at ≥ 5 of 6. Every slot has ≥ 2 variants with identical concept tags (computation slots are parametric). Retakes draw fresh variants; the best score is kept; "Passed" is permanent. A Reference card supplies lookup tables. No fix-it in quizzes. No question depends on Read-more-only content or on a later section's concepts. No variant repeats a lesson exercise | Strict enough to mean something, robust to retaking from memory, and free of answer cueing between items (pass mark 5 of 6 confirmed by the owner, OQ-4) |
| D-10 | The badge needs all 7 quizzes passed and the capstone complete. Lesson completion is not required (ux §12.1). The capstone's only primary call to action is "Next: Closing the case"; the badge call to action sits at the end of L22 and on the outline's badge row; the badge page shows "Closing the case: not yet read" when L22 is incomplete | Measures the objective, not clicks (rule confirmed by the owner, OQ-3); keeps the synthesis lesson on the main path |
| D-11 | Validators are spec-strict, with three severities (error / warning / convention), a "Tools say" note where tools behave differently, and per-exercise rule profiles. Each rule also carries a verdict mapping: an error that states something false or breaks the format → **Invalid**; a missing dependency, a naming-convention mismatch with identical lengths, or a convention this analysis's tools require (BGZF + index, single TABs) → **Valid but unusable here**; warnings never decide a verdict. A BGZF data file without its EOF marker is presumed truncated (CASE-14) and is Invalid, in every format. Specific calls are in §8.3 | The research shows that tools accept invalid files silently; the objective is validity; one rule per byte condition |
| D-12 | Files that GATK writes in the story declare `##fileformat=VCFv4.2`, as GATK writes them: the three gVCFs and the joint trio VCF (GenomicsDBImport → GenotypeGVCFs). The exome CNV VCF and the precise SV record come from a "VCF 4.5-aware caller" (said so in their case callouts) and declare VCF 4.5. Teaching snippets declare the version whose rules they exercise. The validator applies version-dependent rules (SVLEN sign, SVCLAIM, END) according to the declared version | A real-world dialect next to the current spec, without a version header that GATK would never write; var misconception 10 |
| D-13 | The BEDPE window convention is a declared course rule (case §4): windows are derived from VCF POS/CIPOS and END/CIEND, 0-based. It is a course convention: `svtools vcftobedpe` writes `POS + CIPOS[0]` without the −1, so its start differs by one (V-22, closed by reading the svtools source). The ≤ 50-bp window check runs only in the precise-call exercise (case EX-08). No lesson repeats case.md's "mirrors svtools" | The BEDPE spec does not define windows; honest attribution |
| D-14 | Long reads are proband-only HiFi, and the case has no inversion (`BND_2` is an Alu artefact). gph's three-piece inversion read is kept as a drill on a synthetic contig, re-run with minimap2 offline | Matches case §10.2 and avoids false biology (gph banner) while keeping the strand and `tp:A:I` mechanics |
| D-15 | The GFA population panel (`PANEL01`) is illustrative and labelled "illustrative, not real HPRC data" in the UI. No HPRC extract in v1 | Real panel data needs access and checking (gph and case open questions) |
| D-16 | GFA2 and GAF appear only in a Read-more card in L21, with optional ungraded practice. No graded item, sort bin or quiz slot uses them | Pangenome tools use GFA 1.x (gph §3.8); keeps L21 within budget |
| D-17 | The proband is Noa, female ("she"), per case.md. Her PED sex code is 2; the pedigree glyph is a filled circle with the proband arrow. Haploid chrX is a Read-more topic, shown on the father, with the note that a GATK call set needs explicit ploidy settings for it (V-39). Approved by the owner with the timeline, disclaimers and illustrative panel (OQ-1, 2026-10-16) | case.md is canonical; var's PED sex code 1 and ux's "son" glyph were placeholders |
| D-18 | Case FASTQ/SAM read names use the NovaSeq 6000-style pattern verified in seq §3.3 (`A00123:8:H7KJ2DSXY:<lane>:<tile>:<x>:<y>`), with case.md's lane, tile and x/y values, for example `A00123:8:H7KJ2DSXY:2:1203:15410:22045`. Case quality strings use the 4-level NovaSeq 6000 alphabet `# , : F` (Q2/11/25/37; found §3.4 correction 7, dada2 #791). The anatomy example in L06 uses seq §3.3's verified chrM R1/R2 pair. The prose never says which instrument a serial prefix implies | Names and quality bins now describe one instrument family; case.md's `LH…` names paired a NovaSeq X-style prefix with NovaSeq 6000 bins (V-06) |
| D-19 | Fixtures: a real GRCh38 chr2 slice, GENCODE v43 MANE lines and dbSNP138 sites, plus toy contigs for drills. Capture targets are derived from GENCODE CDS, named by MANE exon (`SCN1A_e4` … `SCN1A_e29`), plus `SCN1A_alt8_5N` for the alternative to MANE exon 8 (legacy 5N; MANE exon 8 is legacy 5A). The small GRCh38, GENCODE v43 and dbSNP138 extracts ship in the repo under their own terms, with attribution in `DATA-SOURCES.md` (OQ-7, approved; still subject to V-05). The vendor (Twist) file is never committed | case §3.7; one numbering system in target names; redistribution caution |
| D-20 | Binary demo bytes (BAM, CRAM, BGZF, gzip, `.bai`, `.crai`, `.tbi`) are built by the pinned fixture builder (D-32) and committed as base64. Decoded views are precomputed: a short "decoded" chip for every binary, and the full decoded text for compressed text files and for the BAM/CRAM headers the capstone needs. The browser needs no DEFLATE library in v1 | Authentic bytes, no runtime dependency (tech §15); inspection and grading need the whole decoded text |
| D-21 | Authoring uses Architecture A: Markdown plus remark-directive, compiled by a local Vite plugin; widgets are custom elements; simulators are Preact islands. Raw HTML in lessons fails the build, except `<!-- src: … -->` source comments, which the compiler strips and collects for the fact-check report. CommonMark parses `<DEL>`, `<INV>` and `<DUP>` as HTML tags, so genomic tokens like these must sit in backticks; the error message says so. `<NON_REF>`, `<*>`, `{A,C,G,T}` and `MAPQ <20` stay text. Text-directive restoration also covers coordinates (`chr2:166,014,902`), tags (`SA:Z:chr2,…`) and FORMAT strings (`GT:AD:DP:GQ:PL`), each with a round-trip test | Errors surface at build time; parse behaviour verified with unified 11.0.5, remark-parse 11.0.0, remark-gfm 4.0.1 and remark-directive 4.0.0 |
| D-22 | Routes follow ux §2: `#/`, `#/lesson/<slug>`, `#/lesson/<slug>/<heading-id>`, `#/lesson/<slug>/<exercise-id>`, `#/quiz/<section>`, `#/capstone`, `#/badge`, `#/about`, and a "Not found" view. No cheat-sheet or glossary route in v1 | The explicit `lesson/` namespace avoids collisions (tech used `#/<id>`) |
| D-23 | Storage keys `genomic-file-formats:v1:progress` and `genomic-file-formats:theme`. The progress code is a compact projection (states, attempts, first-try and revealed flags, quiz best and pass dates, capstone states; no answers), deflate-raw compressed with the native `CompressionStream` where available (V-40), base64url, with a version prefix and a checksum. A `.json` download keeps the full state | Namespaced, because Chromium shares one `file://` store (tech §9); a code of a few kilobytes at most is practical to paste and email |
| D-24 | Fonts: Source Serif 4 500, Public Sans Variable (roman and italic), IBM Plex Mono 400/600, latin subset only, with hand-written `@font-face` rules (ux §5), shipped under OFL-1.1 with notices in `LICENSES/` and on `#/about` | Plex Mono has no ligatures, which matters for strings such as `<*>`. Public Sans confirmed by the owner (OQ-5); license scope settled as option a (OQ-8) |
| D-25 | Accent: teal, #0B6B66 (light) and #5EC4BA (dark) | Every pair passes WCAG AA; not the reference brand's colour; confirmed by the owner (OQ-5) |
| D-26 | Fix-it editor: a native textarea with a highlight overlay. Input is capped at the validators' snippet scope (about 300 lines, 64 KB). On coarse pointers, the editor, its overlay and all inputs are at least 16px | Smallest bundle; native editing and accessibility (ux open question 7); no Format Lab by paste; no iOS focus zoom (V-41) |
| D-27 | Text snippets get "Copy" and "Download" (Blob URL). Compressed text files offer their decompressed copy, labelled as such. Full binary bytes are downloadable only for the small toy binaries | Lets learners try real tools on their own without a Format Lab; summaries cannot rebuild real binaries |
| D-28 | Mobile is supported through the Pages URL. Opening the emailed file on iOS is not supported. `index.html` carries static fallback text inside `<main>` and a `<noscript>` copy, both naming the Pages URL, which the shell replaces at boot | Viewers that run no script (email previews; iOS Quick Look, tech §9, from memory) must still show the message |
| D-29 | Without storage (for example Safari on `file://`): keep progress in memory, show a notice, offer the progress code, and link to the Pages URL (`__PAGES_URL__`, defined at build time) | tech §15 recommends both |
| D-30 | Quiz layout: all 6 questions on one page, one "Submit quiz" button, explanations after submission | Easier to review, print and use with a screen reader (ux §9.1); no cueing between items |
| D-31 | A 14-day release-age gate (`minimumReleaseAge`) for dependencies, with `minimumReleaseAgeExclude` listing the owner-pinned toolchain and its exact-pinned closure: `vite-plus`, `@voidzero-dev/*`, `vitest`, `@vitest/*`, `oxlint`, `@oxlint/*`, `oxlint-tsgolint` and its platform packages, `oxfmt` and its platform packages, `@oxc-project/*`, `vite-plugin-singlefile`, plus the rest of the closure found in M0 (V-42): `yuku-parser`, `yuku-core`, `@yuku-core/*`, `@yuku-toolchain/*`, and the exact versions `postcss@8.5.29`, `magic-string@1.4.3` and `tinybench@6.2.2` (drop these three once they are 14 days old, about 2026-10-19 to 2026-10-24). pnpm 12.14.0 itself is owner-pinned through `devEngines` and sits outside the gate. Other pins: setup-vp v1.21.1 (peeled commit `3754dd7d`; move to v1.21.2, peeled commit `68f39c78`, after 2026-10-25), Preact 10.29.8, Playwright 1.63.0, happy-dom 20.14.5. This overrides tech §13's "pin an older version" rule for the owner-pinned closure only | vite-plus 1.3.0 was published on 2026-10-16 and pins `oxfmt =0.73.0`, `oxlint =1.88.0`, `oxlint-tsgolint =7.0.2004`, `vitest 5.0.5` and its own core, all days old, so no older version can satisfy them (npm registry, checked 2026-10-16) |
| D-32 | Real tools run in two places. (1) The **fixture builder**: a container image pinned by digest, with exact samtools/htslib/bcftools, bedtools, minimap2 and gfatools versions, builds every binary fixture and `toy40k.paf`, and writes a manifest of the SHA-256 of each text input. A blocking content test recomputes those hashes from the current generated modules. (2) The **oracle cross-check**: weekly and non-blocking; it runs the tools over every snippet and supplies "Tools say" notes | Binaries can never silently go stale; the cross-check stays off the critical path |
| D-33 | Pages deploys only from release tags matching `v[0-9]+.[0-9]+.[0-9]+`; pull requests get a downloadable build artifact | The hosted page always equals the released file; pre-release tags do not deploy |
| D-34 | No analytics or telemetry. Pilot evidence comes from think-alouds and volunteered progress codes | Privacy; static file |
| D-35 | Language: person-first ("a child with Dravet syndrome"); fictional-case disclaimers; clinical remarks as narrative ("the clinical team…"); no flashing content | case §1 ethics; ux §4.9 and WCAG 2.3.1 |
| D-36 | Progress writes are merges, never overwrites. Every flush reads the stored JSON, merges it with memory and writes the result; storage events and progress-code imports use the same merge (import offers "replace" only as an explicit choice). Unknown keys are preserved verbatim. Merge rules are monotonic: correct and revealed never revert; attempts and best score take the maximum; `passedAt` and `earnedAt` take the earliest | Chromium shares one `file://` store across copies; "Passed" must stay permanent (D-09) |
| D-37 | A course manifest (`content/course.ts`) lists every planned page with its status (planned or built) and a concept-to-introducer map. Course-wide tests assert over built pages plus the manifest; the "all built" assertion switches on in M7 | Milestones can merge with green CI before the whole course exists |

---

## 3. Course-level learning objectives and coverage

### 3.1 Objectives

| ID | By the end, the learner can… | Owner objective |
|---|---|---|
| LO1 | Identify which of the 14 formats (or which companion: `.fai`, `.gzi`, `.bai`, `.tbi`, `.crai`) a snippet, hex dump or file is, name the decisive cue, and tell look-alikes apart: BED4 vs bedGraph, FASTQ vs SAM header, PAF vs BLAST tabular / BEDPE, GTF vs GFF3 vs legacy GFF, gzip vs BGZF, BAM vs CRAM, gVCF vs VCF | **Recognize** each file type |
| LO2 | Find and fix structural violations of each format's spec, and name the rule broken | **Assess validity** |
| LO3 | Detect files that are wrong in meaning or context: wrong build or contig names or lengths, stale index, missing reference, broken phase chain, Mendelian impossibilities, cross-file disagreement | **Assess validity** |
| LO4 | Tell three things apart, and say why: *spec-valid*, *accepted by tools* and *usable here*. A file that loads can be invalid; a valid file can be unusable | **Assess validity** |
| LO5 | Convert coordinates between 0-based half-open and 1-based closed conventions, and between formats, without off-by-one errors | Supports both |
| LO6 | Read Phred-scaled fields (base quality, MAPQ, QUAL, GQ) as probabilities and judge how strong the evidence is | Supports validity; G2 |
| LO7 | Explain which diagnostic question each format answers, what it keeps and drops, and which file to open next | G3 |
| LO8 | Trace one variant through every notation (BED, VCF, SAM, BEDPE, PAF, rGFA, GTF/GFF3, HGVS) | G3 |

### 3.2 How the objectives are assessed

| Objective | Formative (lessons) | Summative |
|---|---|---|
| LO1 | Recognition sorts L07.3, L12.1, L13.2, L15.3, L17.2, L21.4; recognition cues in each format lesson | Q2.3, Q3.5, Q4.5, Q5.2, Q6.1, Q7.4; the capstone's "Format" field for all 15 files |
| LO2 | Every graded spot-the-error and fix-it (L18.4 and L09.2 round B are optional practice since v3) | Q2.1, Q2.5, Q3.2, Q4.6, Q5.4, Q6.5, Q7.2, Q7.5; the capstone's "What's wrong?" field |
| LO3 | L02.3, L05.2, L08.3, L12.2, L12.3, L15.2, L16.x, L18.1-L18.3, L21.3 | Q1.4, Q3.4, Q6.6; capstone cross-file rules CASE-01 to CASE-14 |
| LO4 | The verdict sort L02.2; "Tools say" reveals (L07.2b, L09.3, L11.4, L14.3); L12.2; the L12.3 mini-triage | Q1.4, Q3.3, Q4.4; capstone verdicts (F05, F08 are "unusable here") |
| LO5 | L03 (all three; L03.1 goal 2 is optional practice); crosswalk items in L05.2, L12.1, L19.1 (e), L20.1, L21.2 (W-line item); L08.1-2, L10.2, L13.2, L13.4, L19.3 (L20.3 is optional practice since v3) | Q1.1-1.3, Q3.1, Q5.1, Q5.3, Q7.3 (fresh numbers, never the case integers) |
| LO6 | L06.2, L10.3, L15.2 (GQ readout), L16.2 | Q2.4, Q4.3, Q5.5 |
| LO7 | Graded: L01.3; L12.3. Ungraded: the narrative section openers L04.0, L08.0, L10.0, L13.0, L17.0, L19.0 (no longer checks since v3); "Answers / Keeps / Drops / Next file" on every At-a-glance card; case beats | Q1.6, Q2.6, Q3.6, Q4.4, Q5.6, Q6.6, Q7.6; L22.1 (on the main path after the capstone); the capstone case report is a display, not an assessment |
| LO8 | L03 teaser, L19.3, L20.2, L21.2 (the `s1` item), L22.3 (goals 2-3, including HGVS) | Q5.3, Q7.3 |

### 3.3 Coverage matrix (format × where it is taught and tested)

Every row has at least one recognition exercise and one validity exercise and appears in a quiz and in the capstone. The content test in §11.6 enforces this over built pages (D-37). Every exercise the table counts is graded and on the main path: optional practice (Read more) never counts toward coverage (§5), and the one optional item the table mentions (L18.4, in the GFF3 row) is marked as such. Each v3 time cut was checked against this matrix and §3.2 before it was applied (Appendix C.1); L17.3, GTF's only validity exercise, stays on the main path for that reason.

| Format | Introduced | Recognition exercise | Validity exercise | Quiz | Capstone |
|---|---|---|---|---|---|
| FASTA | L04 | L07.3 (seq EX-05, items 1-2) | L04.2 (seq EX-01 spot), L04.3 (seq EX-04 fix-it) | Q2.1, Q2.2 | F01: Valid (`.fai` consistent) |
| FASTQ | L06 | L07.3 (seq EX-05, items 6-7) | L07.2 (seq EX-09 spot, 3 rounds) | Q2.4, Q2.5, Q2.6 | F02: Invalid (FQ-S06, CASE-14) |
| BED | L08 | L07.3 (item 5), L13.2 | L03.3 (found EX-03 fix-it), L08.3 (case EX-03 spot), L09.1 (int E5 fix-it), L09.2 (int E4 spot, rounds C-D), L09.3 (int E14 sort) | Q3.1-Q3.6 | F03: Valid (the sorted, track-free targets; contrast with L08.3) |
| BEDPE | L19 | L21.4 (gph EX-07 item) | L19.3 (case EX-08 fix-it) | Q7.1, Q7.2 | F10: Invalid (BEDPE-S05) |
| WIG (and bedGraph) | L13 | L13.2 (derived from int E6) | L13.4 (int E9 spot) | Q5.1 | F06: Valid |
| GTF | L17 | L17.2 (ann EX-01) | L17.3 (ann EX-05 fix-it; the only GTF validity exercise, so it stays graded) | Q6.1, Q6.4 | F11: Valid |
| GFF3 | L17 | L17.2 (ann EX-01) | L18.3 (ann EX-09 fix-it); L18.4 (ann EX-03 spot) is optional practice since v3 | Q6.3, Q6.5 | F12: Invalid (GFF3-M08, CASE-11) |
| SAM | L11 | L21.4 (item), Q4.5 | L11.1 (aln EX-07 fix-it), L11.4 (aln EX-06 spot) | Q4.1, Q4.2, Q4.6 | F15: Invalid (SAM-S13) |
| BAM | L12 | L12.1 (aln EX-11 hex sort) | L12.1 (file B, EOF marker missing) | Q4.5 | F04: Valid (EOF present; `@SQ` agrees) |
| CRAM | L12 | L12.1 (file D) | L12.2 (aln EX-12: reference mismatch) | Q4.4, Q4.5 | F05: Valid but unusable here (CRAM-M02, CASE-02) |
| gVCF | L15 | L15.3 (var EX-11 sort) | L15.2 (block-tiling goal, CASE-10) | Q5.2, Q5.5 | F07: Valid; F08: Valid but unusable here (VCF-C02, CASE-09) |
| VCF | L14 | L15.3 ("plain VCF" bin) | L14.3 (var EX-05 spot, rebuilt) | Q5.3, Q5.4, Q5.6 | F09: Invalid (VCF-M15, CASE-01) |
| PAF | L20 | L21.4 (items) | L20.4 (gph EX-05 fix-it) | Q7.3, Q7.4 | F13: Invalid (PAF-M02, CASE-13; misleading `.txt`) |
| GFA | L21 | L21.4 (items) | L21.1 (goal: GFA-M09), L21.3 (case EX-10 spot) | Q7.5 | F14: Invalid (CASE-12: a rank-0 segment differs from GRCh38) |
| Companions (`.fai`, `.gzi`, `.bai`, `.csi`, `.tbi`, `.crai`; gzip vs BGZF) | L05, L12 | L07.3 (item 8: BGZF hex), L12.1 (`.bai`, `.tbi` items) | L05.2 (empty record), L05.3 (mcq), L12.3 (stale `.fai`) | Q2.3, Q4.5 | Viewed with F01, F04, F05, F07, F09 |

---

## 4. Course map

Sections, lessons and quizzes, after the owner's option-B cuts (OQ-2; Appendix C.1 lists every cut). Minutes are estimates from the per-unit model in §11.6 (prose at 150 words per minute plus per-item interaction allowances; optional practice excluded) and are recalibrated in the M1 micro-pilot. The components column lists the graded interactions; "Try it" interactions are H2s in the TOC; the others are Quick checks. "Narrative opener" is the section opener on the pipeline map, which is no longer an interaction (D-04). Items after "optional:" are ungraded practice in collapsed Read-more cards (§5).

| # | Lesson (slug) | Min | Objectives | Case beat | Interactive components | Quiz |
|---|---|---|---|---|---|---|
| **S1** | **Foundations** | | | | | |
| L01 | From a blood sample to a diagnosis (`from-blood-to-diagnosis`) | 8 | LO7 | Step 1 · Trio exome: Noa's vignette; trio exome ordered | sort · predict (Try it) · sort (matrix): file ↔ question | |
| L02 | The genome as text (`genome-as-text`) | 8 | LO1, LO3, LO4 | GRCh38 analysis set; SCN1A on chr2, minus strand | predict · sort: three verdicts · spot-the-error (Try it) | |
| L03 | Coordinates: fence posts and panels (`coordinates`) | 9 | LO5 | Teaser: the deletion's two ends have different numbers in different files | simulator: ruler (Try it; goals 1 and 3) · sort · fix-it · optional: ruler goal 2 | |
| Q1 | Section quiz: Foundations | ~8 | LO3, LO4, LO5, LO7 | | 6 questions | pass ≥ 5/6 |
| **S2** | **Sequences: FASTA and FASTQ** | | | | | |
| L04 | FASTA: the reference everyone is compared against (`fasta-reference`) | 9 | LO1, LO2, LO7 | The lab's reference; chr2 length and M5 | narrative opener · field-explorer · spot-the-error (Try it) · fix-it | |
| L05 | Random access: indexes and compression (`random-access`) | 8 | LO2, LO3, LO5 | Fetching an SCN1A slice by byte arithmetic | simulator: `.fai` calculator (Try it) · predict · mcq · optional: BGZF demo (simulator) | |
| L06 | From molecules to reads: FASTQ (`fastq-reads`) | 8 | LO1, LO6 | Three blood samples, three FASTQ pairs; the father's smaller library | predict · simulator: Phred (Try it) · field-explorer | |
| L07 | FASTQ in the wild (`fastq-in-the-wild`) | 9 | LO1, LO2, LO4 | Transfers are checked on arrival | predict · spot-the-error (Try it) · sort (Try it) | |
| Q2 | Section quiz: Sequences | ~8 | LO1, LO2, LO6, LO7 | | 6 | pass ≥ 5/6 |
| **S3** | **Regions: BED** | | | | | |
| L08 | BED: where did we look? (`bed-targets`) | 8 | LO2, LO3, LO5, LO7 | Capture targets = coding exons; UTR exons 1-3 not captured | narrative opener · predict · predict · spot-the-error (Try it) | |
| L09 | BED in practice: blocks, sorting and indexes (`bed-in-practice`) | 9 | LO2, LO4 | Preparing targets for tabix | fix-it · spot-the-error (2 rounds) · sort: verdicts (Try it) · optional: spot round B | |
| Q3 | Section quiz: Regions | ~8 | LO1-LO5, LO7 | | 6 | pass ≥ 5/6 |
| **S4** | **Alignments: SAM, BAM and CRAM** | | | | | |
| L10 | Placing reads on the map (`alignment-primer`) | 8 | LO5, LO6, LO7 | Reads on exons 16-21; repeats and MAPQ | narrative opener · simulator: CIGAR drawer (Try it) · predict · predict | |
| L11 | SAM: reading a record (`sam-records`) | 9 | LO1, LO2, LO4 | `@RG SM:P042-proband` becomes the sample name | fix-it · simulator: FLAG · spot-the-error (Try it) · optional: field-explorer | |
| L12 | BAM and CRAM: archiving cheaply (`bam-cram`) | 9 | LO1-LO4, LO7 | Exomes to CRAM 3.1; keep the exact FASTA | sort, hex (Try it) · mcq · mini-triage of two files (Try it) · optional: a third file | |
| Q4 | Section quiz: Alignments | ~8 | LO1, LO2, LO4, LO6, LO7 | | 6 | pass ≥ 5/6 |
| **S5** | **Coverage and variants: WIG, VCF and gVCF** | | | | | |
| L13 | WIG: a dip over four exons (`wig-coverage`) | 9 | LO1, LO2, LO5, LO7 | Step 2 · Exome reanalysis: proband ratio ≈ 0.50 over exons 17-20; exon 25 is a decoy | narrative opener · sort · simulator: exon-dip explorer (Try it) · spot-the-error · optional: depth-flags sort | |
| L14 | VCF: variants and genotypes (`vcf-records`) | 9 | LO2, LO4, LO5 | The joint trio file (`VCFv4.2`, as GATK writes it) | sort · field-explorer · spot-the-error (Try it) | |
| L15 | gVCF: proving absence (`gvcf-blocks`) | 8 | LO1, LO3, LO6 | The father's GQ-12 block | mcq · simulator: gVCF expander (Try it; goals 1 and 3) · sort · optional: "no data" goal | |
| L16 | The de novo search (`de-novo-search`) | 8 | LO3, LO6, LO7 | DN-1 passes, DN-2 fails; the Mendelian error inside the dip | predict · sort (Try it) · predict (Try it) · mcq | |
| Q5 | Section quiz: Coverage and variants | ~8 | LO1, LO2, LO5-LO8 | | 6 | pass ≥ 5/6 |
| **S6** | **Annotation: GTF and GFF3** | | | | | |
| L17 | Gene models: GTF and GFF3 (`gene-models`) | 10 | LO1, LO2, LO7 | Step 3 · Interpretation: MANE Select; DN-1 lands in SCN9A | narrative opener · field-explorer · sort (Try it) · fix-it · predict | |
| L18 | Frame and phase: what losing exons 17-20 does (`frame-and-phase`) | 9 | LO2, LO3 | 1,135 coding nt, so the frame shifts | predict · simulator: frame calculator (Try it; goals 1-2) · fix-it · optional: frame goal 3, spot-the-error | |
| Q6 | Section quiz: Annotation | ~8 | LO1-LO3, LO7 | | 6 | pass ≥ 5/6 |
| **S7** | **Structural variants and graphs: BEDPE, PAF and GFA** | | | | | |
| L19 | BEDPE: the breakpoint pair (`bedpe-breakpoints`) | 10 | LO2, LO5, LO7, LO8 | Step 4 · Short-read WGS: `DEL_1` and a suspect `BND_2` | narrative opener · field-explorer (3 follow-ups) · simulator: junction drawer · fix-it (Try it) · optional: 2 follow-ups | |
| L20 | PAF: one molecule, end to end (`paf-long-reads`) | 9 | LO2, LO5, LO8 | Step 5 · HiFi and graph: two blocks, 25,213 bp apart; paternal | field-explorer · predict (Try it) · fix-it · optional: predict (flip the read) | |
| L21 | GFA: graphs, walks and stable coordinates (`gfa-graphs`) | 10 | LO1, LO2, LO8 | Only the proband's hap 2 uses the deletion edge | simulator: graph drawer (Try it) · predict (2 items) · spot-the-error (Try it) · sort · optional: 2 walk-length items | |
| Q7 | Section quiz: Structural variants and graphs | ~8 | LO1, LO2, LO5, LO7, LO8 | | 6 | pass ≥ 5/6 |
| **S8** | **Capstone and conclusion** | | | | | |
| — | Capstone: triage the case folder (`#/capstone`) | ~35 | LO1-LO4 | Can every file be trusted? 15 files | Inspector: format, verdict, reason per file | Complete when all 15 files are correct or revealed |
| L22 | Closing the case (`closing-the-case`) | 9 | LO7, LO8 | Evidence board; the diagnosis; ethics recap | sort (Try it) · simulator: placements and normalization (goals 2-3) · mcq · optional: mcq, slider goal 1 | |
| — | Completion badge (`#/badge`) | — | | | | All 7 quizzes passed + capstone complete |

**Totals** (plan v3, after the owner's option-B cuts, OQ-2).
- **Lessons:** 22, totalling about 193 min (3 h 13 min), 8-10 min each, inside the owner's 190 ± 5 min. By section: S1 25, S2 34, S3 17, S4 26, S5 34, S6 19, S7 29, S8 9. (v2: 223 min; Appendix C.1 lists every cut.)
- **Quizzes:** 7 × about 8 min = 56 min.
- **Capstone:** about 35 min.
- **End to end:** about 284 min (4 h 44 min).
- **Graded interactions:** 69 exercises in the lessons, 3-4 per lesson. The six section openers are narrative and are not interactions. (v2: 80, that is 74 exercises and 6 opener checks.)
- **Optional practice:** 14 ungraded items in collapsed Read-more cards (Appendix C.1), excluded from completion, the exercise pills, coverage counts and the minutes model. The optional GFA2/GAF and gph EX-10 practice that L21 already had in v2 is not counted here.
- **Outline items with a completion state:** 30 (22 lessons, 7 quizzes, the capstone), plus the badge.

---

## 5. Lesson-by-lesson design

**Conventions for every lesson.**
- **TOC.** The TOC lists exactly the lesson's H2s. "Try it: …" headings are H2s and appear in the TOC; a Try-it card renders no heading of its own and is labelled by that H2 (`aria-labelledby`). Quick checks are H3s whose text is the exercise's title (for example "How long is target e17?"), with a non-heading overline "QUICK CHECK · PREDICT"; they do not appear in the TOC. Heading texts are unique within a lesson (content test).
- **Section openers.** The first lesson of S2-S7 opens with the pipeline map, the current node highlighted, and the prompt "Which question is still open, and which file answers it?" (`L04.0`, `L08.0`, `L10.0`, `L13.0`, `L17.0`, `L19.0`). Since v3 (OQ-2) the opener is narrative: the prompt and its answer are prose beside the map, not a graded check, so it is not an interaction and has no card. L10, L13 and L17 now have no graded interaction in their first H2, so that H2 stays under about 250 words and the first graded interaction still comes within about 300 words.
- **Optional practice (since v3).** Items that the owner's time cuts moved off the main path (OQ-2) are marked "Optional practice (Read more)" in place below, with their content kept. Each sits in a collapsed Read-more card titled "Optional practice: …". A moved goal, round, item or file becomes its own small exercise (the same widget with only that part). Optional items are ungraded: they are not H2s or Quick checks, never appear in the TOC, and are excluded from completion, the exercise pill, coverage counts and the minutes model. A whole exercise keeps its place in the section; a part split off a graded exercise goes in a card right after that exercise. Either way, no Read-more card may be the last block before the Recap: when it would be, the card goes just before the section's last graded exercise instead. Appendix C.1 lists all 14.
- **Case file callouts.** These carry the story. Use at most one per screenful (ux §4.8). Label them in presentation order with a stage name: "Case step 1 of 5 · Trio exome", "2 of 5 · Exome reanalysis", "3 of 5 · Interpretation", "4 of 5 · Short-read WGS", "5 of 5 · HiFi and graph". case.md's letters A-E stay internal. Callouts never name a capstone file or hint at its defect.
- **Recap.** The last H2 is always "Recap": 3-4 bullets with bold lead-ins; an "At a glance" card when the lesson introduces a format; and a one-line "Next:" hook. At-a-glance fields: extensions, text or binary, delimiter, coordinates (its crosswalk row), header lines, index file, spec, and four rows that tie the format into the pipeline: **Answers** (its question), **Keeps**, **Drops**, **Next file**.
- **Coordinate crosswalk.** A card started in L03 with the formats seen so far and extended by a one-item crosswalk check folded into an existing interaction in L05 (`.fai` OFFSET), L12 (BAM `pos`), L19 (BEDPE), L20 (PAF) and L21 (GFA W lines, rGFA `SO`); L13 covers WIG vs bedGraph. L22 shows it complete.
- **Read more placement.** Each Read-more topic below names the section it deepens (→ §n) and sits directly after the paragraph it deepens, which is before that section's exercises (the lists below give topics per section, not their order on the page). Lint: at most 2 consecutive Read-more cards, and none as the last block before the Recap. Exercises inside a Read-more are optional: the compiler marks them `optional`, and they are excluded from completion, the exercise pill and coverage counts.
- **Interaction lines** below give: ID · type · content (source) · answer · the concept it forces the learner to apply.
- **Re-keyed exercises.** "Re-keyed" means the source exercise is rebuilt on case.md coordinates by the generator (§9.3). Its rule and answer logic stay the same, and content tests recompute its answer.
- **Not graded.** Read-more topics are optional and never graded.

### Section 1 · Foundations

#### L01 · From a blood sample to a diagnosis
`from-blood-to-diagnosis` · 8 min · LO7 · Sources: case §1, §2, §3.1; found §1, §3.5

**TOC:** 1. Meet the P042 family · 2. What can break in a genome · 3. Try it: how many new variants? · 4. The map of formats · 5. Recap

1. **Meet the P042 family** (the lesson's one section without an interaction). A case-file callout, "Case step 1 of 5 · Trio exome", with the pedigree glyph (D-17) and Noa's timeline (case §3.1):
   - at 6 months, a prolonged febrile seizure;
   - recurrent prolonged seizures, febrile and afebrile;
   - a sodium-channel-blocking medicine was followed by *more* seizures, so the team switched therapy (narrative only; V-01);
   - myoclonic jerks and developmental slowing;
   - normal MRI;
   - a normal microarray at age 2;
   - at 4, a genetics clinic suspects Dravet syndrome with no molecular confirmation, and a trio exome is ordered as a first-tier test (V-01).

   The ethics callout appears here as the course's first case page (case §1, §9.6): the family is fictional; the reference data is real; the variants are invented; nothing is clinical advice.
   **Read more (→ §1):** "What trio sequencing can reveal besides de novo variants" (misattributed parentage; labs have consent policies; case §1).
2. **What can break in a genome.** A diploid genome is two copies. Variant classes by size: SNV, MNV, indel, CNV and SV (found §3.5). A change can matter by altering a protein or by changing dosage. Introduce the organizing idea: "one truth, many lossy projections" (case §2).
   - **L01.1 Quick check · sort.** Six generic events into SNV / MNV / small indel / structural or copy-number:

     | Event | Bin |
     |---|---|
     | C becomes T at one position | SNV |
     | adjacent CT becomes GA | MNV |
     | TC deleted | indel |
     | one A inserted | indel |
     | an 8-kb stretch holding two exons deleted | SV/CNV |
     | a 2.4-kb segment flipped in place | SV |

     *Forces:* size and kind define the class, and the class decides later which files and callers can see the change. Items stay far from the ≥ 50-bp convention (V-37).
3. **Try it: how many new variants?** De novo means present in the child and absent from both parents. A Mendelian error is a genotype pattern no inheritance mode explains. A de novo call is a claim about three genotypes.
   - **L01.2 Try it · predict (number).** "About how many brand-new SNVs does a child carry?" Accept 40-100. Reveal: 2 × 3.1 × 10^9 × 1.2 × 10^−8 ≈ 74 expected (exponents rendered with `<sup>`); about 63 observed per trio (Kong 2012, V-38). Follow-up choice: how many fall in the exome (1-2% of the genome)? → about one (found §3.5). *Forces:* the search is for one needle among dozens, which is why the parents and the filters are needed.
   **Read more (→ §3):** "Where the de novo rate comes from" (V-38).
4. **The map of formats.** The pipeline diagram (found §1, ux §4.10), with one question per node (case §1 table).
   - **L01.3 Quick check · sort (matrix: one select per row).** Match five files to the question each answers: reference FASTA → "Compared with what?"; FASTQ → "What did the sequencer read?"; BED targets → "Where did we look?"; BAM/CRAM → "Where does each read belong?"; VCF → "How does this genome differ from the reference?". On Check, the matched nodes light up on the map. *Forces:* each file answers one question, so a diagnosis chains them. What each format *drops* is taught in its own lesson (the At-a-glance "Drops" row), once the learner has seen the format.

**Case beat:** Step 1 begins. Cliffhanger: "Compared with what?"
**Recap:** **Two copies.** A heterozygous change affects one copy. **Size sets the class.** **A de novo claim is three claims.** **Each file answers one question.** Next: the reference, and what makes a file valid.

#### L02 · The genome as text
`genome-as-text` · 8 min · LO1, LO3, LO4 · Sources: found §2, §3.1-3.2, §3.7, EX-08, EX-09; SAMv1 §1.2.1, §1.3.2; bedtools genome files

**TOC:** 1. Four letters, two strands · 2. What makes a file valid? · 3. Try it: builds, names and lengths · 4. Recap

1. **Four letters, two strands.** A, C, G, T and N; IUPAC codes exist. A FASTA stores one strand, 5′→3′ (the + strand). A reverse complement needs **both** reversing and complementing. SCN1A lies on the minus strand, so its coding sequence reads right to left along the reference (case §3.4). One sentence on masking: lowercase marks repeats and keeps the same bases (practised in L04.2).
   - **L02.1 Quick check · predict (text).** Reverse-complement `CAGCGGCAT` → `ATGCCGCTG`. Then `ATGCCRAT` → `ATYGGCAT` (found EX-09). The prompt shows the complement pairs it needs (A↔T, C↔G, R↔Y, N↔N). *Forces:* both steps; IUPAC codes complement too.
   **Read more (→ §1):** IUPAC codes and complements (found §3.1 table).
2. **What makes a file valid?** (new; found §3.7, D-11)
   - **Anatomy of a genomic text file**, as a table (found §3.7): meta/header lines (`##fileformat=…`, `@SQ`, `##gff-version 3`, `H VN:Z:1.0`); a column header line (VCF `#CHROM …`); records, one per line, TAB-delimited, with fixed leading columns; missing-value tokens (`.`, `*`, `-1`, `255`); key-value bags (`DP=14;AF=0.5`, `ID=x;Parent=y`, `gene_id "x";`); typed tags (`NM:i:1`, `LN:i:45`).
   - **Three severities:** *error* (the spec says must, or the file states something false); *warning* (the spec says should, or the file is probably wrong); *convention* (practice that tools rely on).
   - **Three verdicts**, used for the rest of the course: **Valid**; **Invalid** (breaks an error-level rule of its format, or contradicts a fact it records, such as a contig length); **Valid but unusable here** (no rule broken, but this analysis cannot use it as it is: a dependency is missing, the names follow another convention, or a tool requirement such as an index cannot be met). "Tools say" notes describe what tools do; they never decide the verdict.
   - **L02.2 Quick check · sort (4 items)** into Valid / Invalid / Valid but unusable here:

     | Item | Bin |
     |---|---|
     | a GRCh38 annotation file whose contig names, lengths and MD5s match the lab's reference | Valid |
     | a file whose header declares chr2 as 242,193,529 bp and which has a record at position 243,000,000 | Invalid (it contradicts its own header) |
     | a correct GRCh37 call set, to be used in the lab's GRCh38 analysis | Valid but unusable here (another build) |
     | a GRCh38 file that names contigs `2` instead of `chr2`, with identical lengths | Valid but unusable here (rename first) |

     *Forces:* validity is about the file's own rules and facts; usability is about this analysis.
3. **Try it: builds, names and lengths.** The build is the "map edition" (found §2). GRCh37 vs GRCh38; `chr1` vs `1`. Contig lengths fingerprint the build: chr1 is 248,956,422 (GRCh38) vs 249,250,621 (GRCh37); chr2 is 242,193,529 vs 243,199,373 (bedtools genome files, verified in found and gph). The MD5 digest is the strongest fingerprint (SAMv1 §1.3.2).
   - **L02.3 Try it · spot-the-error (line)** (found EX-08). Four labelled header excerpts. Answer: both VCF `##contig` lines (`chr1` 249250621 and `chrM` 16571 are hg19 lengths; XF-11/XF-13) and the BED line `1 65508 65578` (naming; XF-12). Reveal: many tools raise no error, so these show up later as missing overlaps (GATK's behaviour: V-19). *Forces:* lengths reveal the build; names reveal the convention. No knowledge of the formats is needed beyond reading "name plus length".
   **Read more (→ §3):** Analysis sets: ALT contigs, decoys, EBV, HLA names with `*` and `:` (found §3.2; seq §10). hg19 `chrM` is not GRCh37 `MT` (XF-13). T2T-CHM13. The full M5 recipe (SAMv1 §1.3.2; its one-sentence version is main text in L12).

**Case beat:** The lab uses the Broad GRCh38 analysis set. SCN1A sits at chr2:165,984,641-166,149,214 (−) in a sodium-channel cluster (case §3.4).
**Recap:** **Reverse and complement.** **Valid, invalid, or unusable here.** **Lengths and MD5 fingerprint the build.** **Mixing builds gives confident nonsense, not errors.** Next: numbering the bases.

#### L03 · Coordinates: fence posts and panels
`coordinates` · 9 min · LO5 · Sources: found §2, §4, EX-01 to EX-04; int E1; SAMv1 §1.2; BEDv1 §1.3, §1.6

**TOC:** 1. Two ways to number the same bases · 2. Try it: the coordinate ruler · 3. Which convention does each file use? · 4. Converting without off-by-one errors · 5. Recap

1. **Two ways to number the same bases** (concept primer). Fence posts (0-based half-open) vs fence panels (1-based closed). Python `s[2:4]` vs R `s[3:4]`. The 45-bp toy reference `ref` (SAMv1 §1.1). A table covers first base, length formula, single base, empty interval, adjacency and conversion (found §4.1).
2. **Try it: the coordinate ruler.**
   - **L03.1 Try it · simulator (coordinate ruler)** (found EX-01; int E1). Goals:
     1. Select `TTAGATAA` → BED `6 14`, GFF `7 14`, region `ref:7-14`, length 8 by both formulas.
     2. **Optional practice (Read more)** since v3: type BED `6 14` and predict the bases before they highlight. It is a separate ruler with only this goal, in a collapsed card after L03.1.
     3. Make the zero-length interval `20 20` → "insertion point between bases 20 (C) and 21 (T)" (found EX-02).

     *Forces:* posts vs panels; empty intervals are legal in BED.
3. **Which convention does each file use?** The rows of found §4.2 for the formats met so far, plus the SAMv1 §1.2 quotation. The coordinate crosswalk card starts here.
   - **L03.2 Quick check · sort** (found EX-04, cut to formats seen in L01-L03). 0-based on disk: BED chromStart. 1-based: VCF POS, SAM POS, GFF3 start, samtools region `chr2:100-200`. Stretch pair: bedGraph start (0-based) and WIG `variableStep` position (1-based). *Forces:* the feature and variant formats people type (VCF, SAM, GFF/GTF, region strings) are 1-based; BED-family intervals are 0-based half-open. Each later format lesson adds its row to the card.
   **Read more (→ §3):** "The whole crosswalk", previewed and never graded here: SAM, VCF, GFF/GTF and WIG are 1-based; BED-family files, binary encodings (BAM, BCF) and the minimap2/GFA family (PAF, GAF, GFA W lines, rGFA `SO`) are 0-based; WIG is the only UCSC-defined format that is 1-based.
4. **Converting without off-by-one errors.** Only starts change; ends stay. Region strings are 1-based even for BED files (XF-20).
   - **L03.3 Quick check · fix-it** (found EX-03). VCF SNVs copied into BED as `POS POS`. Validator: 4 columns; start < end; end ≤ 45; end − start = 1; `ref[start:end]` equals the REF letter. Solution: `ref 41 42`, `ref 8 9`, `ref 29 30`. *Forces:* a single base at 1-based p is `[p−1, p)`. Reveal: bedtools widens zero-length intervals, so the result is tool-dependent and wrong either way.
   **Read more (→ §4):** bedtools zero-length widening; the tabix BED/GFF flag (`0x10000`); VCF telomere positions 0 and N+1; GFA2 tick marks.

**Case teaser** (a callout with 2 rows of case §4): the first deleted base, 1-based 166,014,903, is BED start `166014902`, and that is also the VCF POS of the anchor base. Promise: "we'll meet this integer five times" (paid off in L22; graded LO5 items always use fresh numbers).
**Recap:** **Posts or panels.** **Only starts differ.** **Know each format's convention on disk.** **Region strings are always 1-based.** Next: Section quiz, then FASTA.

### Section 2 · Sequences: FASTA and FASTQ

#### L04 · FASTA: the reference everyone is compared against
`fasta-reference` · 9 min · LO1, LO2, LO7 · Sources: seq §1-§3.1, §5, §10, EX-01, EX-04; faidx(5); SAMv1 §1.3

**TOC:** 1. The reference: a labelled string · 2. Try it: why won't this index? · 3. Recap

1. **The reference: a labelled string.**
   - **L04.0 Section opener (narrative, not graded).** The pipeline map with the FASTA and FASTQ nodes highlighted. The prose asks "Which question is still open, and which file answers it?" and answers it: "Compared with what?": the reference FASTA. *Purpose:* each section answers the next open question.
   - The `>` header: the name is the first word, and the description is ignored by tools.
   - Sequence lines, and why uniform line widths matter (bridge to L05).
   - Soft-masked lowercase.
   - FASTA has no formal spec: faidx(5) defines "indexable".
   - The GRCh38 analysis set in one paragraph: 3,366 sequences, including the primary chromosomes, ALT contigs, decoys, EBV and HLA alleles; decoys and EBV catch reads that would otherwise mis-map (seq §10).
   - **L04.1 Quick check · field-explorer.** The real Broad chr1 header (seq §10): `>chr1  AC:CM000663.2  gi:568336023  LN:248956422  rl:Chromosome  M5:6aef897c3d6ff0c78aff06ac189178dd  AS:GRCh38`, whose separators are two spaces, not tabs. Embedded check (mcq): "Which token does samtools use as the sequence name, and which value would a CRAM check this sequence against?" → `chr1`; the `M5` digest (carried into `@SQ M5`). *Forces:* name vs description; the description carries the length and MD5 used later by `@SQ` and CRAM.
   **Read more (→ §1):** Analysis-set counts: 25 primary, 42 `_random`, 127 `chrUn_`, 261 `_alt`, `chrEBV`, 2,385 decoys and 525 HLA alleles; chr1 begins with 10,000 `N`s (seq §10). The iGenomes UCSC hg38 copy and the Broad copy have different chr1 M5s (IUPAC `M`/`R` vs `N`; seq pitfall 5; UCSC's own hgdownload `hg38.fa` was not checked).
2. **Try it: why won't this index?**
   - **L04.2 Try it · spot-the-error (line)** (seq EX-01). Answer: line 3 (16 bases in the middle of a record whose lines are 20). A soft-masked lowercase line is a "fine here" distractor ("lowercase is a masked repeat; the bases are the same"). Each line's accessible name and the "Show lengths and separators" gutter give its character count (§7.8). Reveal: samtools reports `unexpected "A" at line 4`, so read error messages one line back. *Forces:* FA-S02 (uniform line length); case is not quality.
   - **L04.3 Quick check · fix-it** (seq EX-04). Checks FA-S01, FA-S03 and FA-M01. Solution: delete the comment line, delete the blank line, and delete or rename the duplicate `>chrM_demo`. If only the first two are fixed, the validator shows a warning-level pass ("samtools accepts this with `Ignoring duplicate sequence`"). *Forces:* the three structural rules; warning vs error.
   **Read more (→ §2):** Protein FASTA and Pearson `;` comments. Names containing `*`, `:` and `|` (SAMv1 Appendix A region parsing).

**Case beat** (step 1 of 5 · Trio exome): the reference is `Homo_sapiens_assembly38.fasta`: chr2 is 242,193,529 bp, `M5:f98db672eb0993dcfdabafe2a882905c` (case §3.4). The course shows chr2 slices named `chr2:165980001-166380000`; to anything that matches `@SQ` names, such a slice is a different sequence from `chr2` (case §4).
**Recap and At a glance: FASTA.** Answers: "Compared with what?" Keeps: one strand's bases, with names. Drops: qualities and anything about a sample. Next file: FASTQ, then the `.fai`. **The name is the first word.** **Constant line width makes random access possible.** **Lowercase means masked, not wrong.** Next: finding one base in 3 GB.

#### L05 · Random access: indexes and compression
`random-access` · 8 min · LO2, LO3, LO5 · Sources: seq §3.2, §3.4, EX-02, EX-03; found §4.5, Q4; SAMv1 §4.1; bgzip(1); tabix.tex

**TOC:** 1. The .fai: five numbers per sequence · 2. Try it: find the byte · 3. gzip versus BGZF · 4. Recap

1. **The .fai: five numbers per sequence** (concept primer, ≤ 300 words). NAME, LENGTH, OFFSET, LINEBASES and LINEWIDTH. For the base at 0-based position p (1-based position − 1): `byte = OFFSET + floor(p / LINEBASES) * LINEWIDTH + (p mod LINEBASES)` (seq §3.2). A stale index silently returns header text (FA-M05; seq Q7).
   **Read more (→ §1):** CR-LF arithmetic (LINEWIDTH 22 instead of 21).
2. **Try it: find the byte.**
   - **L05.1 Try it · simulator (`.fai` calculator)** (seq EX-02).
     - Task 1: in `chrM_demo 60 38 20 21`, 1-based base 45 (p = 44) is at byte 84 (`A`): 38 + 2·21 + 4.
     - Task 2: chr1:10,001 is at byte 10206 in the iGenomes UCSC hg38 copy, 10254 in the iGenomes NCBI GRCh38 copy and 10212 in the Broad copy.

     *Forces:* the same sequence sits at different bytes, so a `.fai` belongs to exactly one file. The content-test helper asserts the 0-based p convention.
   - **L05.2 Quick check · predict (2 items)** (seq EX-03, plus a crosswalk item). Item 1: a FASTA with an empty middle record: how many `.fai` rows? → 2 (`chr1_tel 36 10 20 21`, `chrM_demo 20 72 20 21`); `chrUn_empty` is silently dropped. Item 2 (crosswalk): is OFFSET counted from 0 or from 1? → 0 (a 0-based byte offset). *Forces:* "accepted" is not the same as "what you meant" (FA-M03); the crosswalk gains its first byte-level row.
3. **gzip versus BGZF.**
   - gzip is one stream. BGZF is independent blocks of ≤ 64 KiB with a `BC` extra field.
   - The 28-byte EOF block. SAMv1 §4.1.2 says it "should be written" and that its absence "should trigger a warning or error". This course applies one rule everywhere: a BGZF data file without the marker is presumed truncated (CASE-14), so its verdict is Invalid. Tools say: samtools prints a warning and carries on.
   - A virtual offset is `coffset<<16 | uoffset`.
   - `.gzi` maps compressed offsets to uncompressed offsets.
   - This trade-off returns in BED (tabix), BAM (BAI) and VCF (`.tbi`).
   - **Optional practice (Read more)** since v3: the BGZF random-access demo (simulator), in a collapsed card before L05.3, which ends the lesson. Play/Step only, never autoplay; a step log is its text view. Steps: find the block, inflate it, skip `uoffset` bytes.
   - **L05.3 Quick check · mcq** (found Q4; until v3 the demo's embedded check, kept graded so that §3 keeps an interaction). "Why can tabix index `bgzip` output but not `gzip` output?" → (b) independent blocks make virtual offsets possible. *Forces:* sorted data + block compression + an index built from that exact file = random access.
   **Read more (→ §3):** "Random access over HTTP": the course's own fixtures were fetched with the `.fai` formula and `Range` requests (case §3.7, §11). The `.gzi` layout: bgzip block sizes vary, so never assume 65,280 (seq §3.4).

**Case beat** (step 1 of 5): fetching an SCN1A slice from the Broad FASTA: chr2 OFFSET 251,446,211; 100 bases and 101 bytes per line (case §3.7).
**Recap and At a glance: `.fai`, `.gzi`, BGZF.** Answers: "Where in this file is base p?" Keeps: byte offsets and line geometry. Drops: the bases themselves; it is valid only for one exact file. Next file: FASTQ. **Five numbers find any base.** **Rebuild the index after any edit.** **gzip is a scroll; BGZF is bound volumes, and the last volume says "the end".** Next: reads.

#### L06 · From molecules to reads: FASTQ
`fastq-reads` · 8 min · LO1, LO6 · Sources: found §3.3-3.4, EX-05, EX-11; seq §2-§3.3, EX-06, EX-07; SAMv1 §1.2

**TOC:** 1. How a sequencer turns DNA into reads · 2. Try it: quality as probability · 3. Anatomy of a FASTQ record · 4. Recap

1. **How a sequencer turns DNA into reads** (concept primer).
   - Library; paired-end R1 and R2 point toward each other; insert size.
   - Short vs long reads. Figures are only qualitative until V-10 is resolved.
   - Depth C = N·L/G; breadth.
   - Exome vs genome.
   - Multiplexing and read groups.
   - **L06.1 Quick check · predict** (found EX-11). 60 M pairs of 2×150 → 18 Gb → about 5.8× over a genome, or about 450× raw over a 40-Mb exome → it is an exome. *Forces:* C = N·L/G.
2. **Try it: quality as probability.** Q = −10·log10 P. The Phred table (found §3.4). Phred+33. Never average Phred values. Binned alphabets are inferred from the number of distinct characters (D-18).
   - **L06.2 Try it · simulator (Phred converter) with follow-up predicts** (found EX-05; seq EX-07). Goal: decode `I` = Q40, `5` = Q20, `?` = Q30, `#` = Q2. Follow-ups (in the same card, §7 `followUps`): predict the expected errors of `IIIIIIIIII5555555555` → 0.101; then `IIII#` → 0.6314. *Forces:* the scale is logarithmic, so the worst bases dominate.
   **Read more (→ §2):** Why 33? Solexa scores and Phred+64 history (seq §11). Binned qualities on current instruments (V-06). The HiFi Q93 maximum (V-08).
3. **Anatomy of a FASTQ record.** Four lines; the `+` separator; quality length equals sequence length.
   - **L06.3 Quick check · field-explorer** (seq EX-06). The chrM R1/R2 headers from seq §3.3. Embedded check: which fields must match between R1 and R2? → everything before the space, and the index; only the read number differs. *Forces:* the read ID is the first word and becomes the SAM QNAME. Field meanings are marked for V-06.
   **Read more (→ §3):** Long-read headers.

**Case beat** (step 1 of 5): three blood samples become `P042-proband_S1_L001_R1_001.fastq.gz` and so on: 2×150, read names per D-18 (`A00123:8:H7KJ2DSXY:…`). The exomes reach mean target depths of 116× (proband), 121× (mother) and 63× (father). The father's library yielded about half the read pairs of the others (about 32 M against about 60 M, illustrative), which lab QC flagged; that is why his depth is lower (case §3.2, §9.5).
**Recap and At a glance: FASTQ.** Answers: "What did the sequencer read, and how sure was it?" Keeps: bases, per-base qualities and read IDs. Drops: where each read belongs. Next file: SAM/BAM. **Q is a probability on a log scale.** **Sum probabilities, not Q values.** **One quality character per base.** Next: when files misbehave.

#### L07 · FASTQ in the wild
`fastq-in-the-wild` · 9 min · LO1, LO2, LO4 · Sources: seq §5, §7, EX-05, EX-09, EX-10, EX-12; bwa(1)

**TOC:** 1. When four lines aren't four lines · 2. Try it: three broken records · 3. Try it: which file is this? · 4. Recap

1. **When four lines aren't four lines.** Wrapped FASTQ is legal, and a quality line can begin with `@` or `+`.
   - **L07.1 Quick check · predict** (seq EX-10). Answer: 2 records. r1 has 30 bases. Line 6 is quality starting with `@` (Q31); line 10 is quality starting with `+`. Chunking by 4 lines produces nonsense. *Forces:* the record ends when the quality length equals the sequence length.
   - **Pairs travel together.** Mates are paired by position (bwa); filtering one file shifts every later pair (seq EX-12).
   - **Truncation.** A file that ends inside a record is truncated (FQ-S06): the last record stops early, and a gzipped copy fails `gzip -t`. Its verdict is Invalid.
   - **Encoding detection.** Any character below `;` proves Phred+33.
   **Read more (→ §1):** Interleaved files and `bwa -p`. Zero-length reads after trimming (FQ-C04). readfq's leniency. TABs in headers written by `samtools fastq -T`.
2. **Try it: three broken records.**
   - **L07.2 Try it · spot-the-error (line, 3 rounds)** (seq EX-09).
     - (a) Line 4: 35 quality characters for 36 bases (the line descriptions show 36 and 35).
     - (b) Line 3: the repeated title differs (`1001` vs `1000`). A "Tools disagree" badge explains that Biopython rejects it and samtools fqidx 1.24 accepts it.
     - (c) Line 1 starts with `>`.

     *Forces:* FQ-S04, FQ-S03, FQ-S01; spec-valid vs tool-accepted.
3. **Try it: which file is this?**
   - **L07.3 Try it · sort** (seq EX-05). Eight items into: nucleotide FASTA / protein FASTA / FASTQ / `.fai` / not FASTA or FASTQ (TAB-separated header) / BED / invalid or can't tell. Below 600 px, and whenever a sort has more than 4 bins, each item has a "Place in…" select as its primary control (§7.3).

     | Item | Bin |
     |---|---|
     | 1 | nucleotide FASTA |
     | 2 | protein FASTA (UniProt header: V-09) |
     | 3 | not FASTA or FASTQ (TAB-separated header); the reveal names it a SAM `@SQ` line, met in L11 |
     | 4 | `.fai` |
     | 5 | BED |
     | 6 | FASTQ |
     | 7 | invalid |
     | 8 | can't tell (BGZF hex; the annotated `BC` range is shown first) |

     *Forces:* first-byte and column cues; BGZF hides its content until decompressed.

**Case beat** (step 1 of 5): the sequencing core checks every transfer with `gzip -t` and record counts on arrival, because a truncated FASTQ still looks fine at the top. (No file is named; which file in the case folder fails is a capstone question.)
**Recap.** **Parse by length, not by line count.** **Pairs travel together.** **A file that ends inside a record is Invalid.** **Tools enforce different subsets of the rules.** Next: Section quiz.

### Section 3 · Regions: BED

#### L08 · BED: where did we look?
`bed-targets` · 8 min · LO2, LO3, LO5, LO7 · Sources: int §2-§4; case §3.4, §4, EX-03; BEDv1 §1.3-§1.7, §3.4, §5

**TOC:** 1. Capture targets: the regions we examined · 2. Three to twelve columns · 3. Try it: targets converted from an interval_list · 4. Recap

1. **Capture targets: the regions we examined.**
   - **L08.0 Section opener (narrative, not graded).** The map with the BED node highlighted. The prose asks "Before trusting 'no variant here', which question must be answered, and by which file?" and answers it: "Where did we look?": the targets BED. *Purpose:* absence of a call means nothing until you know the region was examined.
   - Exome capture: targets are the MANE CDS segments, plus `SCN1A_alt8_5N` (exon 5N: in MANE numbering, the alternative to exon 8, which is legacy 5A), a longer target for exon 28, and exon 29's coding part including the stop codon. UTR exons 1-3 are not targeted (case §3.4).
   - Padded calling intervals (±100 bp).
   - Far outside the targets (beyond the padding) means effectively not looked at. Reads spill about 100 bp past target edges, which is why DN-2 at c.3880-46 is called (case verification correction 4).
   - **L08.1 Quick check · predict.** `chr2 166039422 166039596 SCN1A_e17`: length? → 174 bp. Browser position? → chr2:166,039,423-166,039,596. *Forces:* length is end − start; the browser adds 1 to the start only.
   **Read more (→ §1):** Target vs covered vs padded files (V-12).
2. **Three to twelve columns.** BED3-BED12 and BEDn+m (int §3.1). A BED line is a Python slice of a chromosome.
   - **L08.2 Quick check · predict** (int E3, re-keyed). A padding interval `chr2 166039322 166039422` and target e17: does `bedtools intersect` report an overlap? → no (bookended). What does `bedtools merge` give? → `chr2 166039322 166039596`. *Forces:* half-open adjacency; merge joins bookended intervals by default.
   **Read more (→ §2):** BEDv1 §4 information that travels out of band (build, column meanings). The BEDv1 contig-name regex vs HLA names.
3. **Try it: targets converted from an interval_list.**
   - **L08.3 Try it · spot-the-error (field and line)** (case EX-03). Answers:
     - every start is 1-based (exon 16 should start at `166041230`; CASE-03, BED-M05);
     - the lines descend (BED-C01, a recommended-practice warning; this round's profile includes conventions, §7.1);
     - the `track` line (BED-S17: an error under strict BEDv1 §5; "Tools say: UCSC custom tracks and bedtools accept it").

     *Forces:* converting 1-based to BED; strict vs permissive.
   **Read more (→ §3):** The interval_list format (V-12).

**Case beat** (step 1 of 5): `exome_targets_GRCh38.bed`, derived from GENCODE CDS rather than the vendor file (D-19).
**Recap and At a glance: BED.** Answers: "Where did we look?" Keeps: intervals, with optional names, scores, strands and blocks. Drops: what was seen there, and which build it belongs to. Next file: the alignments. **Start 0-based, end exclusive.** **Length = end − start.** **A target list is a list of where we looked.** Next: BED in practice.

#### L09 · BED in practice: blocks, sorting and indexes
`bed-in-practice` · 9 min · LO2, LO4 · Sources: int §3.1, §4, §5a-§5c, E4, E5, E14; BEDv1 §1.5, §1.8-§1.9, §3.4-§3.6; tabix(1)

**TOC:** 1. BED12: one line, many blocks · 2. Sorted, tab-separated, indexed · 3. Try it: valid BED or not? · 4. Recap

1. **BED12: one line, many blocks.** thickStart/thickEnd; blocks are relative to chromStart; BED10 and BED11 are prohibited.
   - **L09.1 Quick check · fix-it** (int E5). blockStarts written as absolute coordinates → solution `0,1500,3512,` (a trailing comma is optional). Validator: BED-S13, BED-S14, BED-S15. *Forces:* relative offsets; the first block starts at 0 and the last ends at chromEnd. (On the owner's v3 cut list, but kept graded: without it L09 would have 2 graded interactions, below D-06's 3, and §1 none. Round B of L09.2 moves instead.)
   **Read more (→ §1):** bigBed and autoSql. Why BED10 and BED11 are banned.
2. **Sorted, tab-separated, indexed.** Sorting: LC_ALL=C or natural order are both fine, as long as each chromosome is contiguous. BEDv1 allows any whitespace, but tools need single TABs. `start ≤ end` always (BED-S05). bgzip + tabix. Files with track lines should be named `.track`.
   - **L09.2 Quick check · spot-the-error (2 rounds, C and D; round B is optional practice since v3)** (int E4, re-keyed to case targets). Each line's description (character count, separator kind, leading whitespace) is part of its accessible name and of the "Show lengths and separators" gutter (§7.8).
     - B, **Optional practice (Read more)** since v3, in a collapsed card after L09.2: space-separated (valid BEDv1, but bedtools and tabix need TABs: BED-C02, so "valid but unusable here"). L09.3's space-separated item grades the same case.
     - C: a leading-space "comment" line (BED-S16).
     - D: `chr2 242193500 242193600` runs past chr2's length (BED-M01; the round's context supplies the contig lengths).

     *Forces:* the whitespace and contig rules. (Round A, start > end, was cut for time; BED-S05 is main text above and in the quiz pool.)
   **Read more (→ §2):** Tabix internals (the `0x10000` flag, 16-kb windows). bedtools' handling of zero-length intervals.
3. **Try it: valid BED or not?**
   - **L09.3 Try it · sort** (int E14). Bins: Valid / Invalid / Valid but unusable here (L02's verdicts). "Tools say" notes appear on reveal; they are not a bin.

     | Item | Bin |
     |---|---|
     | `chr2 100 100` | Valid |
     | a BED10 line | Invalid |
     | strand `*` | Invalid |
     | a file with a `track` line | Invalid (Tools say: UCSC and bedtools accept it) |
     | `chrUn_KI270435v1` as chrom | Valid |
     | space-separated BED3 | Valid but unusable here (bedtools and tabix need TABs) |
     | score `7.3e-05` | Invalid in BEDv1 (Tools say: bedtools accepts any string) |
     | itemRgb `0` | Valid |

     *Forces:* LO4 with the course's three verdicts. The "space-separated" item is shown in "View as table" as one cell with a "separator: space" note, never silently re-split (§7.8).

**Case beat** (step 1 of 5): the targets file must lose its track line and be sorted, bgzipped and tabix-indexed before the calling pipeline can use it.
**Recap.** **Blocks are offsets.** **Tabs, sorted, BGZF.** **Spec-valid is not the same as usable here.** Next: Section quiz.

### Section 4 · Alignments: SAM, BAM and CRAM

#### L10 · Placing reads on the map
`alignment-primer` · 8 min · LO5, LO6, LO7 · Sources: found §3.6, Q8; aln §2, §3.4, EX-03, EX-04; case EX-07; SAMv1 §1.2, §1.4

**TOC:** 1. Where did this read come from? · 2. Try it: matches, insertions, deletions and clips · 3. How sure is the placement? · 4. Recap

1. **Where did this read come from?** (concept primer).
   - **L10.0 Section opener (narrative, not graded).** The prose asks "We have reads and a reference. Which question is still open, and which file answers it?" and answers it: "Where does each read belong?": SAM/BAM from the aligner.
   - Alignment as placement plus differences (aln §2 sticky-note analogy). SEQ is stored on the forward strand (callback to L02's reverse complement).
2. **Try it: matches, insertions, deletions and clips.** The CIGAR table showing which operations consume the read and which consume the reference (aln §3.4).
   - **L10.1 Try it · simulator (CIGAR-to-alignment drawer)** (aln EX-03). Read `TTAGATAAAGGATACTG`, POS 7, `8M2I4M1D3M`. Predict the last reference position → 22, then build the alignment operation by operation. Its text view is a three-row text alignment with reference positions. *Forces:* I consumes only the read; D consumes only the reference.
   - **L10.2 Quick check · predict (3 items)** (aln EX-04, re-keyed). Query length / reference span / end:
     - `3S6M1P1I4M` at POS 9 → 14 / 10 / 18;
     - `6M14N5M` at POS 16 → 11 / 25 / 40;
     - the case split read `96M54S` at POS 166014807 → 150 / 96 / 166,014,902.

     `6H5M` is worked in the reveal. *Forces:* end = POS + reference-consuming operations − 1.
   **Read more (→ §2):** Why aligners clip rather than write a 25-kb `D` (affine gap costs; aln EX-04 explanation). `M` includes mismatches (`=`/`X`, `--eqx`). Padded SAM.
3. **How sure is the placement?** MAPQ is Phred-scaled placement confidence (L06). A read whose sequence occurs in several places, such as a repeat element, cannot be placed confidently. Pairs, insert size, discordant pairs, split reads.
   - **L10.3 Quick check · predict** (found Q8). A read has two equally good placements → MAPQ about 3, or 0. *Forces:* P(wrong) = 0.5 → Q ≈ 3.

**Case beat** (step 1 of 5 · Trio exome): exome reads stack on SCN1A exons 16-21. A preview of step 4: the clipped tail of a split read near the deletion is Alu sequence, so that piece gets MAPQ 0 (case EX-07). SCN1A's paralogs (SCN3A, SCN2A, SCN9A, SCN7A; case §3.1) matter for a different check, "which gene is this?", in L17.
**Recap.** **A CIGAR is an edit script.** **Two consumption rules.** **MAPQ is about placement, not read quality.** Next: the SAM record.

#### L11 · SAM: reading a record
`sam-records` · 9 min · LO1, LO2, LO4 · Sources: aln §3.1-§3.6, §5a-§5b, EX-01, EX-06, EX-07; SAMv1 §1.3-§1.5; SAMtags

**TOC:** 1. The header: @HD, @SQ, @RG, @PG · 2. Eleven mandatory fields · 3. Try it: click the broken field · 4. Recap

(v3: the former H2 "Try it: decode the FLAG" is folded into §2, and L11.3 becomes §2's Quick check. Once L11.2 became optional practice, §2 would otherwise have had no graded interaction.)

1. **The header: @HD, @SQ, @RG, @PG.** The header regex; `@HD` comes first; `@SQ SN/LN/M5`; `@RG ID/SM` carries sample identity.
   - **L11.1 Quick check · fix-it** (aln EX-07; moved here from L12). Move `@HD` to line 1 and add `ID:P042-proband.L001` to the `@RG` line, so that it matches `RG:Z`. Checks SAM-S03, SAM-S05 and SAM-M08. *Forces:* the header is part of validity, and read groups carry sample identity.

   The former recognition sort is retired here; its look-alike lines return, freshly written, in Q4.5 and Q7.4.
   **Read more (→ §1):** Sort orders (natural vs lexicographic).
2. **Eleven mandatory fields.** The table (aln §3.2). CIGAR's query-consuming operations add up to the length of SEQ (SAM-S12), and QUAL has one character per base (SAM-S13). Optional tags `NM`, `MD`, `SA`, `RG`, `MC`. TLEN signs. Only 0x4 decides "unmapped".
   - **One read, several lines.** A secondary line (0x100) is an alternative placement. A supplementary line (0x800) is another piece of a chimeric read, linked by `SA`. Exactly one line per read is primary (SAM-S18). A duplicate (0x400) is a copy of a molecule already seen: it is kept but marked, and callers skip it.
   - **L11.2 Optional practice (Read more) · field-explorer** (since v3, in a collapsed card before L11.3) on the spec example line `r001 99 ref 7 30 8M2I4M1D3M = 37 39 TTAGATAAAGGATACTG * RG:Z:rg1` (aln §3.6). Embedded check (mcq): "Which two fields give the alignment's last reference base?" → POS and CIGAR. *Forces:* every field's meaning, including TLEN = 39.
   **Read more (→ §2):** MD and NM. TLEN's two historical definitions. Secondary vs supplementary records in depth tools.
   - **L11.3 Quick check · simulator (FLAG bit decoder)** (aln EX-01; H3 title "Decode the FLAG"; a "Try it" H2 until v3). Goals: (1) pair the mates: 99↔147, 83↔163, 77↔141, 73↔133; (2) decode 1123 (a duplicate), 355 (a secondary line) and 2161 (a supplementary piece). The bits are native checkboxes, which is also the text view. *Forces:* mates agree crosswise (my 0x20 = your 0x10; my 0x8 = your 0x4); exactly one of each pair has 0x40; 0x100, 0x400 and 0x800 mark lines that are not independent evidence.
3. **Try it: click the broken field.**
   - **L11.4 Try it · spot-the-error (field)** (aln EX-06).
     - a1 QUAL: 7 characters for 8 bases (SAM-S13).
     - a2 RNAME: `chr1` is not an `@SQ` (SAM-M01).
     - a3 CIGAR: a soft clip in the middle (SAM-S11).
     - a4 POS: 0 on a mapped record (SAM-M03).
     - a5 is valid.

     The reveal includes "Tools say": samtools rejects a1, warns on a2 and a4, and accepts a3 silently. *Forces:* LO4.

**Case beat** (step 1 of 5): the proband BAM header: `@SQ SN:chr2 LN:242193529 M5:f98db672…` and `@RG SM:P042-proband`. That SM value becomes the VCF column name.
**Recap and At a glance: SAM.** Answers: "Where does each read belong, and how well does it fit?" Keeps: every read base and quality, plus its placement. Drops: nothing about the reads, which is why it is large. Next file: BAM or CRAM. **Eleven fields, then tags.** **FLAG is twelve checkboxes.** **One read can have several lines.** **Parsers are not validators.** Next: BAM and CRAM.

#### L12 · BAM and CRAM: archiving cheaply
`bam-cram` · 9 min · LO1-LO4, LO7 · Sources: aln §3.7-§3.8, §5d-§5e, §7, EX-11, EX-12; SAMv1 §1.3.2, §4-§5; CRAMv3 §1, §6, §8-§12; samtools.1

**TOC:** 1. BAM: the same records, block-compressed · 2. Try it: is this BAM complete? · 3. CRAM: storing only the differences · 4. Try it: triage two files · 5. Recap

1. **BAM: the same records, block-compressed** (concept primer, ≤ 300 words). BGZF (from L05) + `BAM\1` + binary records with 0-based `pos` (= POS − 1). BAI and CSI (BAI cannot address positions ≥ 2^29). The EOF block, under L05's rule: a BAM without it is presumed truncated and Invalid. A BAM cut at a BGZF block boundary still passes `gzip -t`.
2. **Try it: is this BAM complete?**
   - **L12.1 Try it · sort (hex, 6 items)** (aln EX-11; bytes from the fixture builder, D-32). Bins: Complete BAM / BAM without EOF marker (presumed truncated) / Not a BAM / CRAM / Index file. Answer:
     - A is a complete BAM (ends with the 28-byte EOF block);
     - B has its EOF marker missing: it is the same file minus its last 28 bytes, so every record is still present, and it cannot be told apart from a file cut at a block boundary;
     - C is not a BAM (plain gzip with FLG `08`, no `BC` field);
     - D is CRAM 3.0 (`CRAM\3\0` plus the 38-byte EOF container);
     - E is a `.bai` (`BAI\1`; V-15);
     - F is a `.tbi` (BGZF whose decoded chip reads `TBI\1`).

     Follow-up (crosswalk): BAM stores `pos` as POS − 1; is the on-disk value 0- or 1-based? → 0-based. On phones the hex viewer shows 8 bytes per row and leads with each file's annotated range (§7.8). *Forces:* magic bytes and end markers; the dangerous file is the one that "works".
   **Read more (→ §2):** BAI bins and virtual offsets (aln EX-13; the bin is recomputed for the case read by `reg2bin`).
3. **CRAM: storing only the differences.**
   - Reference-based compression. `@SQ M5` is required unless the reference is embedded in the CRAM (`embed_ref`); the reference MD5 is checked per slice (CRAMv3).
   - M5 is the MD5 of the sequence uppercased with whitespace removed, so re-wrapping or soft-masking a copy does not change it (SAMv1 §1.3.2).
   - Keep the exact FASTA. htslib ≥ 1.22 no longer falls back to the EBI reference server.
   - **L12.2 Quick check · mcq** (aln EX-12). The father's CRAM fails with an MD5 mismatch when decoded with `-T hg19.fa`. Answer (b): obtain the FASTA whose chr2 M5 is `f98db672…`. Per-option reveal: `ignore_md5=1` silently corrupts bases. *Forces:* a valid file that cannot be used without its reference.
   **Read more (→ §3):** CRAM internals and the EOF container that spells "EOF". CRAM 3.1 as the htslib default since 1.22, and the htslib benchmark sizes (NovaSeq data 515 MB as BAM, 207 MB as CRAM 3.0, 176 MB as CRAM 3.1). `embed_ref` and lossy options. Which htsjdk releases read CRAM 3.1 (V-17).
4. **Try it: triage two files.**
   - **L12.3 Try it · mini-triage** (the capstone inspector with two files and the §6.2 form; trimmed from three in v3, OQ-2). Fresh toy files; none is in the capstone folder, and no (file, rule) pair recurs there:
     - `toy.fa.fai`, shown with its FASTA as a companion tab: its OFFSET predates an edit to the FASTA header, so the `.fai` is Invalid (FA-M05, FAI-M01) while the FASTA is fine;
     - `small.bam`, whose tail ends in the EOF block and whose `@SQ` agrees with `toy.fa`: Valid;
     - **Optional practice (Read more)** since v3, in a collapsed card before L12.3, which ends the lesson: `targets_b38.bed`, which names contigs `2` with GRCh38 lengths: Valid but unusable here until renamed to `chr2` (BED-M02). Of the three files it is the one practised elsewhere (L02.2, L02.3; Q1.4, Q3.4); the `.fai` is the companions row's validity item (§3.3), and the BAM keeps a Valid file in the key.

     *Forces:* the first cross-format triage, with L02's three verdicts on the form and a stated reason, before the capstone.

**Case beat** (step 1 of 5): the core converts the exomes to CRAM 3.1 and must archive `Homo_sapiens_assembly38.fasta` alongside them.
**Recap and At a glance: BAM, CRAM, `.bai`/`.csi`/`.crai`.** Answers: the same question as SAM, compactly and with random access. Keeps: BAM keeps every base; CRAM keeps the differences from a named reference. Drops: CRAM drops the reference bases themselves, so the FASTA must travel with it. Next file: depth (WIG) and genotypes (gVCF/VCF). **BAM is SAM in BGZF.** **Check the EOF marker.** **CRAM needs the exact reference.** Next: Section quiz.

### Section 5 · Coverage and variants: WIG, VCF and gVCF

#### L13 · WIG: a dip over four exons
`wig-coverage` · 9 min · LO1, LO2, LO5, LO7 · Sources: int §2-§5e, E6, E9, E10; aln EX-02; case §3.3, EX-02; UCSC wiggle.html and bedgraph.html (kent mirror); bwgCreate.c; samtools-depth(1)

**TOC:** 1. Depth as a signal · 2. fixedStep, variableStep and bedGraph · 3. Try it: deletion or artefact? · 4. Recap

1. **Depth as a signal** (concept primer since v3, under about 250 words).
   - **L13.0 Section opener (narrative, not graded).** The prose asks "Which question is still open, and which file answers it?" and answers it: "How much DNA covers each exon?": a depth track (WIG or bedGraph), computed from the BAM.
   - Depth is counted from BAM: `samtools depth` skips UNMAP, SECONDARY, QCFAIL and DUP records by default; supplementary pieces count (samtools-depth(1)). WIG is a "sensor log" (int §2).
   - **L13.1 Optional practice (Read more) · sort (5 items)** (aln EX-02 subset; moved here from Q4.6 in v2; optional since v3, in a collapsed card after the depth paragraph. WIG recognition stays graded in L13.2, and no quiz slot uses it). Counted or skipped by `samtools depth`? 99 → counted; 2145 → counted (supplementary); 1123 → skipped (DUP); 355 → skipped (SECONDARY); 133 → skipped (UNMAP). *Forces:* depth counts independent evidence, read through the flags from L11.
2. **fixedStep, variableStep and bedGraph.** Declaration lines; WIG is 1-based with `start=` and `span`; bedGraph is 0-based; bigWig is binary.
   - **L13.2 Quick check · sort (recognition**, derived from int E6 logic and §6).

     | Item | Bin |
     |---|---|
     | `fixedStep chrom=chr2 start=166039423 step=20 span=20` | WIG |
     | `track type=wiggle_0 name="proband_depth"` | WIG |
     | `chr2 166039422 166039596 SCN1A_e17` | BED |
     | a 4-column line under `track type=bedGraph` | bedGraph |
     | `chr2 166039422 166039596 0.49` | ambiguous (BED4 or bedGraph) |

     Follow-up choice for the ambiguous line: "What would settle it?" → a `track type=bedGraph` line, or the producer's documentation. Credit needs both "ambiguous" and the right follow-up. *Forces:* declaration lines vs 4-column lines.
   **Read more (→ §2):** The fixedStep `span` default (UCSC doc says 1; wigToBigWig uses `step`). bigWig magic `26 FC 8F 88`. UCSC custom tracks store values in 128 bins, which loses precision.
3. **Try it: deletion or artefact?**
   - **L13.3 Try it · simulator (exon-dip explorer) with a predict gate** (int E10 adapted; case EX-02).
     - Predict first: "Does the father also carry a deletion of exon 17?" → no. His exon-17 depth over his own mean is 61/63 ≈ 0.97; the proband's is 58/116 ≈ 0.50.
     - Then toggle raw vs normalized depth. A second panel shows exon 25: about 0.55 in all three samples, so it is a capture artefact, and about 1.0 after panel normalization.
     - Text view: an exon-by-sample table of depth and ratio that follows the raw/normalized toggle.

     *Forces:* normalize to each sample's own mean and compare across samples; a dip is a candidate, not a proof.
   - **L13.4 Quick check · spot-the-error (line)** (int E9, re-keyed). `variableStep chrom=chr2 span=50`: the second item overlaps the first (WIG-M02). Reveal: wigToBigWig's message prints 0-based starts. *Forces:* span arithmetic in a 1-based format (the WIG and bedGraph rows of the crosswalk).
   **Read more (→ §3):** Exome CNV calling with reference panels.

**Case beat** (step 2 of 5 · Exome reanalysis): the proband's ratio is ≈ 0.50 at the targets of exons 17-20 only. The coverage thread pauses on "deletion or capture artefact?"
**Recap and At a glance: WIG and bedGraph.** Answers: "How much DNA covers each region?" Keeps: one value per position or interval. Drops: which allele and which read. Next file: the genotypes (gVCF/VCF). **WIG is 1-based; bedGraph is 0-based.** **Normalize before you conclude.** **A shared dip belongs to the target, not the genome.** Next: VCF.

#### L14 · VCF: variants and genotypes
`vcf-records` · 9 min · LO2, LO4, LO5 · Sources: found §3.5, EX-12; var §2-§5c, EX-01, EX-05; VCF 4.5 §1.3-§1.6, §3; case §3.2

**TOC:** 1. Variants as edits to the reference · 2. Inside a VCF record: columns and genotypes · 3. Try it: six records, five broken · 4. Recap

1. **Variants as edits to the reference** (concept primer). REF/ALT; the anchor base; the "tracked changes" analogy (var §2).
   - **L14.1 Quick check · sort** (found EX-12). SNV `C→G`; MNV `CT→GA`; insertions `C→CA` and `G→GTTT`; deletions `AG→A` and `ACGT→A`; symbolic `<DEL>` and `<INV>`. *Forces:* the shared first base is padding.
2. **Inside a VCF record: columns and genotypes.** Meta lines, `##fileformat` first; some rules depend on the declared version, and GATK writes `VCFv4.2`. The 8 fixed columns; FORMAT, with GT first; Number codes A/R/G; FILTER `.` vs `PASS`. GT encodings (`0/1`, `1|0`, `./.`). QUAL (about the site) vs GQ (about one sample's genotype). The reference allele is not necessarily the normal allele.
   - **L14.2 Quick check · field-explorer** (var EX-01, rebuilt on the DN-1 trio record from case EX-04). Embedded check (mcq): "Which value is the child's ALT read count?" → `47`. *Forces:* AD is Number=R, with REF first.
   **Read more (→ §2):** Haploid chrX outside the PARs, shown on the father (D-17); a GATK call set needs explicit ploidy settings to write it (V-39). Version drift: SVLEN sign, SVCLAIM, END, `<*>` (var misconception 10). Genotype ordering: the PL index is `b(b+1)/2 + a` (var EX-04: `T/G` is at index 4). Normalization in brief (practised in L22.3).
3. **Try it: six records, five broken.**
   - **L14.3 Try it · spot-the-error (line)** (var EX-05, rebuilt on case records with the same five defects; the snippet declares `##fileformat=VCFv4.5`, as a 4.5-aware caller would write it). Line 1 is valid; the other lines break VCF-M01 (REF mismatch), VCF-M10 (`<DEL>` without SVLEN, a 4.4+ rule), VCF-M08 (`0/2` with one ALT), VCF-S11 (QUAL `high`) and VCF-S14 (GT not first). "Tools say": htslib loads all of them; QUAL becomes 0; the missing SVLEN gives a 1-bp extent that region queries miss. *Forces:* LO4.
   **Read more (→ §3):** Breakends. `*` vs `<*>`. Errata in the spec's own examples (var §11).

**Case beat** (step 1 of 5): `P042.trio.vcf.gz` declares `##fileformat=VCFv4.2`, as GATK writes it, and `##contig=<ID=chr2,length=242193529>`; its sample columns are `P042-proband`, `P042-mother` and `P042-father` (case §3.5; D-12).
**Recap and At a glance: VCF.** Answers: "How does each genome differ from the reference?" Keeps: sites with alleles, qualities and per-sample genotypes. Drops: the reads, and any statement about positions without a line. Next file: gVCF, the evidence for "nothing here". **POS is the anchor for indels and symbolic alleles.** **GT first, values matching their Number.** **A file that loads is not a valid file.** Next: proving absence.

#### L15 · gVCF: proving absence
`gvcf-blocks` · 8 min · LO1, LO3, LO6 · Sources: var §3.6, §5d, EX-07, EX-11, Q7; case EX-04, CASE-10; VCF 4.5 §5.5; GATK source (via var)

**TOC:** 1. No line is not the same as no variant · 2. Try it: what does the father's file say? · 3. From three gVCFs to one trio VCF · 4. Recap

1. **No line is not the same as no variant.** A missing line may mean hom-ref or no reads.
   - **L15.1 Quick check · mcq** (var Q7). Why gVCF and joint genotyping? → (b) a merged variants-only file cannot tell "hom-ref" from "not covered", and adding a sample would mean re-calling everyone (N+1). *Forces:* the absence problem.
2. **Try it: what does the father's file say?** The GATK block anatomy. Block summaries: GQ is the minimum, DP the median, MIN_DP the minimum, PL the element-wise minimum. GATK 4's default bands. `0/0` with GQ 0 is not evidence. Dialects: GATK `<NON_REF>`, VCF 4.5 `<*>` with `LEN`, Illumina `BLOCKAVG`.
   - **L15.2 Try it · simulator (gVCF block expander)** (var EX-07, re-keyed to the father's case gVCF in case EX-04). Text view: a block table (POS, END, GT, GQ, MIN_DP) plus a "Go to position" number input, which satisfies goal 1 as well as a click on the ruler does. Goals:
     1. Go to 166,009,887 → block 166,009,870-166,009,902 with GQ 12 and MIN_DP 5. The readout: GQ 12 means about a 6% chance (10^−1.2) that this hom-ref call is wrong, and with 5 reads a het is missed 1 time in 32.
     2. **Optional practice (Read more)** since v3: toggle "no data" → GenotypeGVCFs would write `./.` (V-20 for the exact zero-coverage form). It is a separate expander with only this goal, in a collapsed card after L15.2, so no graded item depends on the unconfirmed V-20 form. (A substitute cut that offsets keeping L17.3; Appendix C.1.)
     3. Find the block that overlaps its neighbour: a planted CASE-10/GVCF-M01 violation, `END=166009902` followed by `POS 166009900`.

     *Forces:* the evidence lives in GQ and MIN_DP, not in GT; blocks must tile.
   **Read more (→ §2):** VCF 4.5 `<*>` and FORMAT `LEN`. GATK GQ band defaults and `--floor-blocks`.
3. **From three gVCFs to one trio VCF.** GenomicsDBImport → GenotypeGVCFs; the output keeps GATK's `VCFv4.2` header. `<NON_REF>` is dropped from ALT. A GQ-0 hom-ref becomes `./.`.
   - **L15.3 Quick check · sort** (var EX-11; the BED item re-keyed to `chr2 166014902 166040115`). Bins: GATK gVCF / VCF 4.5 gVCF / Illumina gVCF / plain VCF / not VCF. *Forces:* recognition cues (`<NON_REF>` + `END`; `<*>` + `LEN`; ALT `.` + `BLOCKAVG`).
   **Read more (→ §3):** Illumina (Strelka) gVCFs cannot feed GenotypeGVCFs. The PL caution for `bcftools merge --gvcf` (var §3.6).

**Case beat** (step 1 of 5): three `.g.vcf.gz` files arrive. The proband's exon-19 block has DP 59, against about 118 in exon 16: a second hint of the dip (case §3.5).
**Recap and At a glance: gVCF.** Answers: "Is 'nothing here' backed by evidence?" Keeps: reference blocks with depth and GQ. Drops: per-base detail inside a block (a block keeps minima and a median). Next file: the joint VCF. **Blocks carry the evidence for "nothing here".** **Read GQ and MIN_DP, not GT.** **Joint genotyping turns three gVCFs into one VCF.** Next: the de novo search.

#### L16 · The de novo search
`de-novo-search` · 8 min · LO3, LO6, LO7 · Sources: var §10, §11 (PossibleDeNovo), misconception 15; case §3.2-§3.3, EX-01, EX-04, Q2, §11 (SVCLAIM read-more)

**TOC:** 1. The de novo filter · 2. Try it: keep or reject? · 3. Try it: whose allele is missing? · 4. Recap

1. **The de novo filter.** The bcftools expression from var §10: child het, parents `RR`, all GQ ≥ 20, parental DP ≥ 10. GATK's high-confidence rule: all GQ ≥ 20.
   - **L16.1 Quick check · predict (multi-select).** Which trio records pass? → DN-1 only. DN-2 fails on the father's GQ 12; rs2298771 and rs6432860 are not het-with-hom-ref-parents. A follow-up shows the exome CNV record (`GT:CN` only) is silently dropped too, because it has no GQ or DP (var misconception 15). *Forces:* filters are claims about three genotypes, and SVs need their own path.
   **Read more (→ §1):** GATK PossibleDeNovo thresholds. PED files: Noa's sex code is 2, the father's is 1; `bcftools +mendelian2 --rules GRCh38`.
2. **Try it: keep or reject?**
   - **L16.2 Try it · sort** (case EX-04). Bins: keep as de novo / reject, parental evidence too weak / keep, but cannot explain the phenotype. Line 1 (DN-2) → reject: the father's block has GQ 12 and MIN_DP 5. Line 2 (DN-1) → keep, but cannot explain (resolved in L17). *Forces:* GQ is a probability; "absent" needs evidence.
3. **Try it: whose allele is missing?** When the filter finds nothing useful:
   - The child looks *homozygous* inside a heterozygous deletion, which is the opposite of the de novo shape.
   - The exome CNV call carries `SVCLAIM=D` (depth evidence). An SNV allele-fraction clue also counts as a D claim (VCF 4.5 §3). That CNV VCF declares VCF 4.5; its callout says it comes from a 4.5-aware CNV caller (D-12).
   - Its CIPOS and CIEND equal the flanking introns (case §11).
   - **L16.3 Try it · predict (choice)** (case EX-01). Answer (b): a paternal deletion that covers 166,036,278 but not 166,041,354. *Forces:* combining genotype, depth and inheritance.
   - **L16.4 Quick check · mcq** (case Q2). Why did the filter miss the cause? → (B) inside a heterozygous deletion the child appears homozygous, and the deletion is not an SNV record. *Forces:* the limits of a format-shaped search.
   **Read more (→ §3):** Mendelian rules on chrX for males. Parental mosaicism, roughly 5-13% (search summary; V-01).

**Case beat** (step 2 of 5 · Exome reanalysis): the threads converge. The coverage dip, a Mendelian error inside it and a balanced het just outside it point to a paternal deletion bracketed by introns 16 and 20. Cliffhanger: which exons, and what does losing them do?
**Recap.** **A de novo filter sees SNVs and indels only.** **Weak parental evidence means "not yet".** **A Mendelian error can be a deletion's fingerprint.** Next: Section quiz.

### Section 6 · Annotation: GTF and GFF3

#### L17 · Gene models: GTF and GFF3
`gene-models` · 10 min · LO1, LO2, LO7 · Sources: ann §1-§3, §5d-§5f, EX-01, EX-05; case §3.4, EX-06; GFF3 v1.26; GTF2.2 via AGAT gxf.md and UCSC GTF.html

**TOC:** 1. Genes, transcripts, exons and CDS · 2. Two dialects, one gene · 3. Try it: which dialect is it? · 4. MANE Select and exon numbering · 5. Recap

1. **Genes, transcripts, exons and CDS** (concept primer).
   - **L17.0 Section opener (narrative, not graded).** The prose asks "Which question is still open, and which file answers it?" and answers it: "What would losing exons 17-20 do to the protein?": the gene model (GTF/GFF3).
   - Genes, transcripts, exons, introns (GT…AG), UTRs and CDS. A gene model is a tree of intervals flattened into one line per interval (ann §2).
2. **Two dialects, one gene.** GFF3 stores pointers (`ID`/`Parent`, like a relational table). GTF repeats group labels (`gene_id`/`transcript_id`, like a long data frame). Both have nine columns and are 1-based. GFF3's CDS includes the stop codon; GTF's excludes it.
   - **L17.1 Quick check · field-explorer** (case EX-06): the GENCODE v43 CDS lines for exons 20 and 21. Hover targets: strand `-`; frame `2`; `exon_number`, counted from the 5′ end at the highest coordinate. Embedded check (mcq): "Which column holds the frame, and from which end does exon numbering start on this strand?" → column 8; from the highest coordinate. *Forces:* columns 7-9 on the minus strand. (Why exon 21's phase is 2 is L18.1's follow-up, after phase has been taught.)
3. **Try it: which dialect is it?**
   - **L17.2 Try it · sort** (ann EX-01). Bins: GFF3 / GTF / legacy GFF (GFF1 or GFF2) / not GFF-family. A → GFF3; B → GTF; C → legacy GFF; D → legacy GFF (a bare group token; the "Why?" text says that it is strictly the GFF1 `[group]` style, and that GFF2 expects tag-value pairs); E → not GFF-family (BED12); F → GTF (GENCODE v19). *Forces:* decide from column 9 and the header, not the extension.
   - **L17.3 Quick check · fix-it** (ann EX-05; a line-level profile with GTF-S01 to S08 plus "CDS inside an exon"). Solution: quoted `key "value";` attributes; frame `0` on the first CDS; the missing `transcript_id` added. *Forces:* GTF-S05, GTF-S04, GTF-S06. (On the owner's v3 cut list, but kept graded: it is GTF's only validity exercise (§3.3). No other L17 item can move either: L17.2 is the only GTF/GFF3 recognition item, and L17.1 and L17.4 are the only interactions in §2 and §4. The 3 minutes come from L15.2 goal 2, L18.2 goal 3 and L22.2; Appendix C.1.)
   **Read more (→ §3):** A brief history from GFF1 to GTF2.2. Ensembl vs GENCODE dialects (V-14).
4. **MANE Select and exon numbering.**
   - The MANE Select transcript is ENST00000674923.1 = NM_001165963.4, with 29 exons; exons 1-3 are 5′ UTR only.
   - Legacy exon number = MANE exon number − 3 (case §3.4). The alternative exon 5N keeps its legacy name: in MANE numbering it is the alternative to exon 8, which is legacy 5A (the L08 target `SCN1A_alt8_5N`).
   - Check `gene_name`, not the neighbourhood: SCN1A sits in a paralog cluster, and SCN9A is 46 kb away.
   - **L17.4 Quick check · predict.** "Which gene does DN-1 at chr2:166,204,022 fall in?" → SCN9A (166,195,185-166,376,001; SCN1A ends at 166,149,214). The reveal resolves L16: c.4707C>T p.(Leu1569=) is synonymous. *Forces:* annotation turns a coordinate into a consequence.
   **Read more (→ §4):** GFF3 reserved column-9 tags and percent-encoding (ann EX-04). SO term names (`lnc_RNA` vs `lncRNA`).

**Case beat** (step 3 of 5 · Interpretation) begins with `SCN1A_SCN9A.MANE.gtf` (GENCODE v43 lines).
**Recap and At a glance: GTF and GFF3.** Answers: "Which gene, transcript and exon is this, and what does a change do?" Keeps: feature intervals and their hierarchy. Drops: the sequence (it points into the FASTA). Next file: the breakpoints (BEDPE). **One tree, two encodings.** **The CDS stop codon differs between them.** **Quote the transcript.** Next: phase.

#### L18 · Frame and phase: what losing exons 17-20 does
`frame-and-phase` · 9 min · LO2, LO3 · Sources: found EX-14; ann §4, §5b, EX-03, EX-09; case §3.4, EX-05, EX-06; GFF3 v1.26 column 8, NOTE 4

**TOC:** 1. Phase: bases to skip · 2. Try it: the exon-frame calculator · 3. When the file gets phase wrong · 4. Recap

1. **Phase: bases to skip.** Codons can straddle introns. Phase is the number of bases to skip at the 5′ end of this CDS segment, counted from `end` on the minus strand. Chain rule: `next = (phase − length) mod 3` (ann §4).
   - **L18.1 Quick check · predict, with a follow-up** (found EX-14; case EX-06). A + strand CDS piece of 100 bp with phase 0: what is the next piece's phase? → 2. Follow-up on the L17.1 lines: exon 20's CDS is 121 nt with phase 0; why does exon 21 have phase 2? → 121 ≡ 1 (mod 3), so 2 bases must finish the codon that exon 20 started. *Forces:* phase is "bases to skip", not "start mod 3".
2. **Try it: the exon-frame calculator.**
   - **L18.2 Try it · simulator (exon-frame calculator)** (case EX-05; real MANE exons 15-22). Text view: an exon table with checkboxes and the readout. Goals:
     1. Exons 17-20: 1,135 nt; phase 0 vs 2 → frameshift, p.(Val806Alafs*24) (V-03).
     2. Exons 17-19: 1,014 nt → in-frame, p.(Val806_Glu1143del).
     3. **Optional practice (Read more)** since v3: exons 20-21: in-frame (276 nt), although each exon alone shifts the frame. It is a separate calculator with only this goal, in a collapsed card after L18.2; goals 1-2 already apply the summed-length rule and the phase-equality shortcut. (A substitute cut that offsets keeping L17.3; Appendix C.1.)

     The "smallest frameshifting deletion that contains exon 19" task (exons 19-20, 604 nt) is an optional preset. *Forces:* the summed-length rule and the phase-equality shortcut.
   **Read more (→ §2):** Nonsense-mediated decay rules of thumb (V-02). Exons 5A/5N and rs3812718 (V-33). "In-frame is not harmless."
3. **When the file gets phase wrong.** A phase that breaks the chain (GFF3-M08); a `Parent` that names no existing ID (GFF3-M03); a CDS without a phase (GFF3-S09).
   - **L18.3 Quick check · fix-it** (ann EX-09). DEMO2 on the minus strand. Solution: phases 0, 2, 0 from top to bottom. The common wrong answer 0, 0, 1 triggers the hint "walk 5′→3′, which means descending coordinates". *Forces:* GFF3-M08 on the minus strand.
   - **L18.4 Optional practice (Read more) · spot-the-error (2 rounds)** (ann EX-03, rounds 1 and 3; the round profiles include warnings). Since v3 it sits in a collapsed card before L18.3, which then ends the lesson. GFF3 validity stays graded in L18.3, and no quiz slot uses GFF3-M13.
     - Phase `.` on a CDS (GFF3-S09).
     - Lowercase `parent` (GFF3-M13; legal, but the exon silently leaves the transcript).

     *Forces:* structural vs semantic errors.
   **Read more (→ §3):** The GFF3 spec's own examples are not all valid. UCSC genePred `exonFrames`, the inverse of phase.

**Case beat** (step 3 of 5): losing exons 17-20 removes 1,135 coding nt and shifts the frame. The premature stop falls in exon 21 of 29, so NMD is predicted (V-02), told as narrative. Cliffhanger: this holds only if the breakpoints are intronic, so where exactly are they?
**Recap.** **Phase is bases to skip.** **Deleting exons: sum their lengths mod 3.** **On the minus strand, count from `end`.** Next: Section quiz.

### Section 7 · Structural variants and graphs: BEDPE, PAF and GFA

#### L19 · BEDPE: the breakpoint pair
`bedpe-breakpoints` · 10 min · LO2, LO5, LO7, LO8 · Sources: int §2-§3.2, §5d, E12; case §3.3, §3.6, §4, EX-07, EX-08, Q3; bedtools general-usage.rst; bedFilePE.cpp; LUMPY SV_Pair.cpp; svtools `vcftobedpeconverter.py`; SAMtags SA

**TOC:** 1. From split reads to breakpoints · 2. Two intervals, two strands · 3. Try it: write the BEDPE line · 4. Recap

1. **From split reads to breakpoints.**
   - **L19.0 Section opener (narrative, not graded).** The prose asks "The exome bracketed the deletion. Which question is still open, and which file answers it?" and answers it: "Where exactly are the two ends joined?": a breakpoint pair (BEDPE) from whole-genome reads.
   - Proband PCR-free WGS (32×, insert about 450 bp). The `SA` tag; discordant pairs.
   - **L19.1 Quick check · field-explorer with follow-up predicts** (case EX-07: `96M54S` with `SA:Z:chr2,166040116,+,96S54M,0,1;`).
     - (a) The last reference base of the primary is 166,014,902.
     - (b) The implied deletion is 166,040,116 − 166,014,902 − 1 = 25,213 bp.
     - (c) **Optional practice (Read more)** since v3: the `SA` MAPQ is 0 because the clipped bases are Alu sequence.
     - (d) **Optional practice (Read more)** since v3: FLAG 97, not 99: TLEN 25,640 is far from a proper pair.
     - (e) Crosswalk: is a BEDPE `start1` 0- or 1-based? → 0-based, like BED.

     *Forces:* SAM 1-based arithmetic turns into a breakpoint. Since v3, follow-ups (c) and (d) form one optional card after L19.1; their minute keeps L19.2 graded.
2. **Two intervals, two strands.**
   - BEDPE columns: 6, 7, 8 or 10+ are accepted, never 9 (BEDPE-S01). Each window has `start ≤ end` (BEDPE-S05, a course rule by analogy with BED; bedtools keeps such lines silently).
   - Windows describe uncertainty; they are not the deleted region.
   - Strand pairs in the LUMPY/svtools convention: `+-` deletion, `-+` duplication, `++`/`--` inversion. Other producers use other strand conventions; check the producer's documentation.
   - The course window convention (D-13): `[POS−1+CIPOS₀, POS+CIPOS₁)` around POS and the same around END. It is a course convention; `svtools vcftobedpe` starts one base later, because it does not subtract 1.
   - `DEL_1`: window 1 is 28 bp in unique sequence; window 2 is the 282-bp Alu.
   - **L19.2 Quick check · simulator (junction drawer)** (int E12). Challenge: build a tandem duplication (same chromosome, `-` then `+`). Text view: an adjacency list. *Forces:* strand pairs encode orientation. (On the owner's v3 cut list, but kept graded: without it L19 would have 2 graded interactions, below D-06's 3, and §2 none. L19.1's follow-ups (c) and (d) move instead.)
   **Read more (→ §2):** BEDPE and VCF breakends (svtools bracket mapping). `:::unverified{ref="V-23"}` 10x Long Ranger is reported to write `+ +` for every call (search summary only). "Alus and short reads": `BND_2` into an intron-4 Alu with MAPQ 0 (case §11).
3. **Try it: write the BEDPE line.**
   - **L19.3 Try it · fix-it** (case EX-08). Starting point: the precise VCF record (VCF 4.5, from the 4.5-aware caller; D-12). Validator: exactly 10 columns; strands `+ -`; `start1 ≤ 166014901 < end1`; `start2 ≤ 166040114 < end2`; windows ≤ 50 bp. Solution: `chr2 166014901 166014909 chr2 166040114 166040122 DEL_P042_1 60 + -`. Reveal: the starting line forgot the −1 on both sides and dropped `strand2`. The reveal also uses case Q3's reasoning on `DEL_1`. *Forces:* VCF 1-based anchor + CIPOS → 0-based windows.
   **Read more (→ §3):** `pairtobed -type ispan`. UCSC interact.

**Case beat** (step 4 of 5 · Short-read WGS): `P042-proband.sv.bedpe` holds `DEL_1` (SR=8, PE=14) and a weak `BND_2`. Cliffhanger: "Alu: where exactly? Is the inversion-like call real?"
**Recap and At a glance: BEDPE.** Answers: "Which two places in the genome are joined?" Keeps: two windows, two strands and a score. Drops: the sequence at the junction. Next file: long-read alignments (PAF). **Two windows, two strands.** **Windows are uncertainty, not extent.** **Never 9 columns.** Next: long reads.

#### L20 · PAF: one molecule, end to end
`paf-long-reads` · 9 min · LO2, LO5, LO8 · Sources: gph §2-§5c, EX-03, EX-04, EX-05; case §3.6, EX-09; PAF.md; minimap2(1) 2.31

**TOC:** 1. Twelve columns, no sequence · 2. Try it: read the two-block molecule · 3. Strands and pieces · 4. Recap

1. **Twelve columns, no sequence.** The "plagiarism checker's report" analogy (gph §2). 0-based half-open coordinates; target coordinates are always on the forward strand; col 10 is residue matches and col 11 is block length; every interval lies inside its sequence, so an end never exceeds the length (PAF-M02); `tp:A:P` marks every piece of a split read. Production SV callers read BAM, not PAF (verified in gph).
   - **L20.1 Quick check · field-explorer** on case PAF block 1 (case §3.6). Embedded check (mcq): "Are columns 3-4 and 8-9 0- or 1-based, and which column is the block length?" → 0-based half-open; column 11. *Forces:* the PAF columns, and PAF's row in the crosswalk.
2. **Try it: read the two-block molecule.**
   - **L20.2 Try it · predict (3 items)** (case EX-09; the two PAF lines from case §3.6 plus a reference-like read).
     - (a) Deleted reference bases: tstart₂ − tend₁ = 25,213. (The reveal adds: inserted query bases = 0.)
     - (b) Inversion? No: both blocks are `+`.
     - (c) The one-line read is maternal, because it aligns through bases the paternal haplotype lacks.

     *Forces:* PAF arithmetic and phase by haplotype.
3. **Strands and pieces.** Pieces are not written in query order; approximate mode vs `-c`. The three-piece inversion read lives on the synthetic contig (D-14).
   - **L20.3 Optional practice (Read more) · predict** (gph EX-04 on the toy contig). Flip the read: query intervals mirror to [qlen − qe, qlen − qs); strands flip; target columns stay. *Forces:* each sequence is described on its own forward strand. Since v3 it sits in a collapsed card before L20.4, which then ends the lesson. LO5 keeps graded practice in L20.1's crosswalk item; LO8 keeps L20.2.
   - **L20.4 Quick check · fix-it** (gph EX-05 on the toy contig). A colleague "fixed" a `-` line. Solution: swap cols 8/9 and cols 10/11. Messages clear in order: PAF-M01, PAF-M03, PAF-M04. *Forces:* never swap target coordinates for minus-strand lines.
   **Read more (→ §3):** minimap2 tags (`cs`; `de` vs `dv`; `tp:A:I`). The approximate-mode trap (gph EX-03). Indexing PAF with tabix (`-s6 -b8 -e9 -0`). "By-construction placements": real aligners extend through the 7-bp microhomology, and every one of the 8 placements is correct (case §3.6).

**Case beat** (step 5 of 5 · HiFi and graph): junction-spanning reads split into two PAF blocks, 25,213 bp apart on the target and 0 bp apart on the query. The microhomology is `CACCATG`. The deletion lies on the haplotype with G at rs6432860, so it is paternal. There is no inversion, so `BND_2` was an artefact.
**Recap and At a glance: PAF.** Answers: "Where does each piece of a long read align?" Keeps: coordinates, strand and match counts. Drops: the bases. Next file: the graph (GFA). **Placement without bases.** **Target always forward-strand.** **Order pieces by query start.** Next: graphs.

#### L21 · GFA: graphs, walks and stable coordinates
`gfa-graphs` · 10 min · LO1, LO2, LO8 · Sources: gph §2-§5g, EX-07, EX-08; case EX-10, Q6, CASE-12; GFA1.md (2022-06-07); rGFA.md

**TOC:** 1. Segments, links and walks · 2. Try it: draw and spell a haplotype · 3. Stable coordinates with rGFA · 4. Try it: find the line that breaks the graph · 5. Recap

1. **Segments, links and walks** (concept primer, ≤ 300 words). The "transit map" analogy (gph §2). A bidirected graph; L-line orientations; `0M` blunt links; W lines (HapIndex 0 means haploid; SeqEnd − SeqStart should equal the walk's length, and a mismatch is a warning, GFA-M10); P vs W; bubbles. Segment and path names share one namespace and contain no whitespace, `+,` or `-,` (GFA-M01, GFA-S04).
2. **Try it: draw and spell a haplotype.**
   - **L21.1 Try it · simulator (GFA graph drawer)** (gph EX-08, toy §3.6). Text view: an adjacency list plus the spelled walk. Goals:
     1. Spell the POP01 walk → `ACGTTGCAGGATCCATTTAGCATTCCCGGGAGCTTA` (the GRCh38 walk is spelled in the reveal).
     2. Name the bubble: an inversion (`<s4`).
     3. Add `W PROBAND 2 hap2ctg 0 28 >s1>s3<s4>s5` → GFA-M09 ("step s1+ → s3+ has no 0-overlap link"; gfatools accepts it silently).

     *Forces:* reverse-complement traversal; walks need links.
3. **Stable coordinates with rGFA.** `SN`, `SO`, `SR`; `SO` is 0-based (implied by the spec's examples; gfatools `gfa2bed` prints `[SO, SO+LN)`). A rank-0 segment must carry exactly the reference bases at `[SO, SO+LN)` (CASE-12); gfatools does not check this.
   - **L21.2 Quick check · predict (2 items; trimmed from 4 in v3)** (case EX-10 follow-ups, plus a crosswalk item).
     - `s1` (`SO:i:166014402`, `LN:i:500`) ends at 166,014,902.
     - **Optional practice (Read more)** since v3: the GRCh38 walk length is 166041854 − 166014402 = 27,452.
     - **Optional practice (Read more)** since v3: the proband's hap-2 walk is 500 + 1,238 + 1 + 500 = 2,239 (= 11049 − 8810).
     - Crosswalk: is a W line's SeqStart 0- or 1-based? → 0-based (BED-like).

     *Forces:* the same integer as in BED and VCF (LO8). The two walk-length items form one optional card after L21.2. The `s1` and crosswalk items stay graded: moving all of L21.2, as the owner's list proposed, would leave §3 without a graded interaction while §1, the primer, already has none, and would make the crosswalk card's GFA row and L21's only LO8 item ungraded.
4. **Try it: find the line that breaks the graph.**
   - **L21.3 Try it · spot-the-error (line)** (case EX-10). Answer: the last W line. `>s1>s6` needs `L s1 + s6 + 0M` (GFA-M09), and that missing link *is* the deletion. *Forces:* walk validity.
   - **L21.4 Quick check · sort (5 items)** (gph EX-07; items re-keyed to the case where they used placeholder coordinates). Bins: PAF · SAM · BEDPE · GFA1 · look-alike (BLAST tabular). Each item's decisive cue: strand plus lengths for PAF; FLAG plus CIGAR for SAM; two chromosome columns for BEDPE; a leading record letter for GFA; a float in column 3 for BLAST. *Forces:* LO1 across the last block of formats.
   **Read more (→ §4):** GFA2 and GAF in one paragraph each, with optional ungraded practice (D-16). J lines in GFA 1.2. Overlaps in assembly graphs: the gph EX-10 fix-it, offered as optional practice (marked `optional`, not counted). HPRC scale. PanSN names. "Absent from the pangenome means rare, not pathogenic."

**Case beat** (step 5 of 5): `P042_locus.gfa`. In the illustrative panel (D-15) the SNP bubbles are common, and only the proband's hap 2 uses `s1→s6` (case Q6).
**Recap and At a glance: GFA.** Answers: "Which paths through the genome do these haplotypes take?" Keeps: segments, links and walks. Drops: linear coordinates, unless rGFA tags restore them. Next file: the whole case folder. **Segments are stations; walks are train lines.** **Every step needs a 0M link.** **rGFA keeps GRCh38 addresses, and rank-0 bases must match GRCh38.** Next: Section quiz, then the capstone.

### Section 8 · Capstone and conclusion

The capstone activity (`#/capstone`) is specified in §6.2. It comes before L22 in the outline, and its only primary call to action is "Next: Closing the case" (D-10). The switcher reads "Lesson 22 of 22 · Capstone and conclusion".

#### L22 · Closing the case
`closing-the-case` · 9 min · LO7, LO8 · Sources: case §1, §3.3, §3.6, §4, §5c, §7, EX-11, EX-12, EX-13, Q9; var EX-03

**TOC:** 1. The evidence board · 2. Try it: what supports the deletion? · 3. One deletion, every notation · 4. What happens next for the family · 5. Recap

1. **The evidence board.** Diagnosis is triangulation: no single file proves the deletion, but six projections from three independent technologies (exome, short-read WGS, HiFi) agree (case §2).
   **Read more (→ §1):** Why the microarray at age 2 was normal: case Q1, the resolution of that platform.
2. **Try it: what supports the deletion?**
   - **L22.1 Try it · sort** (case EX-11). Supports: items 1, 3, 4, 6, 8, 9. Neutral or explained otherwise: items 2, 5, 7, 10. Argues against: none. Follow-up: group the supporting items by data source → exome (1, 3, 4), short-read WGS (6), HiFi (8, 9). *Forces:* separating evidence from noise, and counting independent data sources rather than files.
   - **L22.2 Optional practice (Read more) · mcq (multi)** (case EX-12; since v3, in a collapsed card after L22.1). MLPA ✓, short-read WGS ✓, long-read WGS ✓; repeating the same exome kit ✗; re-analysing only the parents' exomes ✗. *Forces:* orthogonal confirmation. (A substitute cut that offsets keeping L17.3: it is lab practice beyond the objectives, and L22.1 keeps LO7 graded; Appendix C.1.)
3. **One deletion, every notation.** The completed crosswalk card (case §3.6, §4): `166014902` appears five times; the right end is `166040115`; the `SA` position is `166040116` because SAM is 1-based. The full rule: SAM, VCF, GFF/GTF and WIG are 1-based; BED-family files, binary encodings (BAM, BCF) and the minimap2/GFA family (PAF, GAF, GFA W lines, rGFA `SO`) are 0-based; WIG is the only UCSC-defined format that is 1-based. **HGVS** in one paragraph: g. numbers count along the chromosome; c. numbers count along the coding sequence from the A of the ATG, so on the minus-strand SCN1A they grow as genomic coordinates fall; HGVS places an ambiguous indel at its 3′-most position, while VCF normalization left-aligns (case §4, §5c).
   - **L22.3 Quick check · simulator (placements and normalization; the microhomology slider)** (case EX-13; var EX-03). Text view: the list of the 8 placements with their VCF and HGVS strings. Goals (trimmed to goals 2 and 3 in v3, OQ-2; both LO8, and goal 3 carries HGVS):
     1. **Optional practice (Read more)** since v3: how many placements? → 8. It is a separate slider with only this goal, in a collapsed card after L22.3.
     2. Which does VCF normalization choose? → the left-most: POS 166,014,902 with `CIPOS=0,7`. A preset replays var EX-03's six spellings of one A deletion, which `bcftools norm` maps to `166009976 TA T`.
     3. Which do HGVS g. and c. use? → g. 166,014,910-166,040,122 (3′ on the + strand); c.2416-519_3550+704, the left-most genomic placement, because 3′ in the transcript is left on the genome (V-03).

     *Forces:* legitimate representations differ, and each notation's rule picks one.
4. **What happens next for the family** (narrative; case §3.1 "Afterwards"):
   - Junction-specific PCR on parental blood finds no mosaicism at the assay's sensitivity.
   - The clinical team reviews the medicines.
   - Counselling covers a low but non-zero recurrence risk.
   - **L22.4 Quick check · mcq** (case Q9). Why the base-pair junction? → (A) to design a junction assay for parental mosaicism and to confirm there is no inversion or insertion. *Forces:* why exact breakpoints matter.
   **Read more (→ §4):** MANE Select. Parental mosaicism (V-01).

**Ethics recap:** a short repeat of the L01 callout (case §1).
**Recap.** **Triangulate across formats and data sources.** **Validate before you trust.** **Every format earned its place by answering a question the earlier ones could not.** Next: "Claim your completion badge" (the badge call to action lives here and on the outline's badge row, D-10).

---

## 6. Section quizzes, capstone and completion badge

### 6.1 Section quizzes

**Format and rules** (D-09, D-30; ux §9.1, adapted):
- Route `#/quiz/<section>`. Pills read "Section quiz", "6 questions", "about 8 min", "Pass mark 5 of 6".
- All six questions are on one page and can be answered in any order.
- **Reference card.** A collapsible card at the top holds the lookup tables the section uses: the IUPAC complement pairs (Q1); the ASCII / Phred+33 table and the `.fai` formula with p 0-based (Q2); the FLAG bit table and the CIGAR consumption table (Q4); the Phred table (Q5); the phase-chain rule (Q6). It never holds coordinate conventions, verdict definitions or recognition cues, because those are what the quizzes assess. Items are written so that applying the table is the hard part, with distractors drawn from typical misreadings of it (Q8 read as P = 0.008, summed Q values, a 1-based p in the `.fai` formula).
- **Graded mode.** The learner answers every card, then "Submit quiz" grades all six at once; unanswered cards count as incorrect after a confirmation. Explanations, taken from the source note's per-option explanations, appear only after submission, so no explanation can answer a later item in the same attempt. Content review also checks the slot order for cueing.
- **Allowed types:** mcq (single or multi), predict (number, text or choice), spot-the-error with a single pick, sort with ≤ 4 items, and the matrix variant. No fix-it.
- **Results card:** focus moves only to the results heading. It shows the score. On a pass: the "Passed" badge. Otherwise: a neutral panel listing missed questions, each with a "Review: <lesson heading>" link built from the slot's `tests` field.
- **Retakes:** unlimited. Each attempt draws the next authored variant of every slot (cycling through at least two) or, for parametric slots, fresh values from a seeded generator, and shuffles the options. The best score is kept, and "Passed" never disappears (D-36).
- **Recording:** stored as `quizzes[<section>] = { best, of: 6, passedAt, attempts, current }` (ux §12.1).
- **Composition** (a content test over every variant combination):
  - at least 3 of 6 slots tagged `application` (a novel snippet or a computation);
  - Q2-Q7: at least 1 slot tagged `recognition` (a `hideIdentity` snippet or a hex head) and at least 1 tagged `validity` (a single-pick spot-the-error on a fresh snippet, or a validity mcq whose options carry `validation`);
  - every quiz: at least 1 slot tagged `LO7`;
  - every format in the section appears;
  - every slot has at least 2 variants with identical `concepts` tags;
  - no variant's snippet text, or its stem-and-key pair, equals a lesson exercise's;
  - LO5 slots never key to the case integers (166014902, 166014903, 166040115, 166040116) or to a case target;
  - every slot's `concepts` are introduced outside a Read-more, in that section or an earlier one.

"Taught in" names where the concept is introduced in main text. "Parametric" means the content test generates and checks many values with the helpers in §11.6.

**Q1 Foundations**

| Slot | Type | Tags | Variant A (source) → key | Variant B or parametric | Taught in |
|---|---|---|---|---|---|
| 1.1 | mcq | application, LO5 | found Q1: BED `chr2 1000 1003` as 1-based closed → 1001-1003 | parametric (fresh contig, start and length); distractors are the three classic errors (start kept; both ends shifted; end decremented) | L03 §1, §4 |
| 1.2 | predict (numbers) | application, LO5 | the 1-based closed feature `chr7:2,001-2,050` → BED `chr7 2000 2050`, length 50 (XF-20) | parametric; the source appears as a region string or as a GFF3 line | L03 §4 |
| 1.3 | mcq | application, LO5 | BED `chr5 500 500` → the insertion point between 1-based bases 500 and 501 (length 0) | parametric position; distractors "base 500", "base 501", "invalid BED" | L03.1 goal 3, L03 §1 |
| 1.4 | sort (4) | validity, LO3, LO4 | four fresh situations into Valid / Invalid / Valid but unusable here, built around found Q3: a file using `1` where the lab uses `chr1`, with identical lengths → unusable here until renamed | built around an hg19 `chrM` length (16,571) in a GRCh38 analysis (XF-13: another build → unusable here). Each variant also has a fresh Valid item and a fresh Invalid item | L02 §2, §3 |
| 1.5 | predict (text) | application | reverse-complement a fresh 9-base string containing one IUPAC code (Reference card: complement pairs) | parametric | L02 §1 |
| 1.6 | mcq | LO7 | "A clinician asks whether exon 1 of a gene was examined at all. Which file answers that, and why can't the VCF?" → the targets BED; a VCF lists only differences | "A collaborator asks which genome the reads were compared with. Which file answers, and what in it proves the version?" → the reference FASTA; its names, lengths and MD5s | L01 §4, L02 §3 |

**Q2 Sequences**

| Slot | Type | Tags | Variant A (source) → key | Variant B or parametric | Taught in |
|---|---|---|---|---|---|
| 2.1 | spot-the-error (single pick) | validity, application | a fresh toy FASTA built from GRCh38 chrM bases: one middle line is shorter than its record's other lines (FA-S02); a soft-masked line is a "fine here" distractor | parametric sequence and position | L04 §2 |
| 2.2 | mcq | application | seq Q2: in the Broad FASTA (`.fai` row `chr2 242193529 251446211 100 101`), the byte of chr2:101 → 251446312 | parametric row and 1-based position; distractors from a forgotten newline, an unconverted 1-based p and returning OFFSET | L05 §1-§2 |
| 2.3 | mcq | recognition, application | the head of a `.fa.gz`, `1f 8b 08 04 … 06 00 42 43 02 00` → BGZF; `samtools faidx` can index it (writing `.fai` and `.gzi`) | the head `1f 8b 08 08 …` → plain gzip; re-compress with `bgzip` (seq Q6's reasoning) | L05 §3 |
| 2.4 | mcq | application, LO6 | seq Q3: expected errors of `)))))` → about 0.79 | parametric quality strings of 5-10 characters; distractors from summing Q values, averaging Q before converting, and reading Q8 as P = 0.008 | L06 §2 |
| 2.5 | spot-the-error (single pick) | validity, application | a fresh three-record FASTQ in which one record's quality line is one character short (FQ-S04) | parametric record and position | L06 §3, L07 §2 |
| 2.6 | mcq | LO7 | "You have the three FASTQ pairs and the reference FASTA. Which question can you still not answer, and which file answers it next?" → where each read belongs; the aligner's SAM/BAM | "What does a `.fai` answer, and what can it not tell you?" → where each sequence's bases sit in this exact file; nothing about the bases themselves or about any sample | L01.3, L04-L07 At-a-glance rows |

**Q3 Regions**

| Slot | Type | Tags | Variant A (source) → key | Variant B or parametric | Taught in |
|---|---|---|---|---|---|
| 3.1 | predict (numbers) | application, LO5 | ann Q7: GTF exon 1001-1300 → BED `1000 1300` | parametric (never a case target) | L08 §1, L03 §4 |
| 3.2 | spot-the-error (single pick) | validity, application | a fresh 5-line BED6 in which one line has strand `*` (BED-S09) | a fresh 5-line BED6 in which one score is `1200` (BED-S08) | L08 §2 |
| 3.3 | mcq multi | LO4 | int Q4: why does `tabix -p bed` fail on a vendor file? → track lines; plain gzip; spaces (not: natural sort order; gene names in column 4) | why does `bedtools intersect -sorted` fail on a targets file? → descending lines; one chromosome split into two blocks (not: names in column 4; BED4 vs BED6) | L09 §2 |
| 3.4 | mcq | validity, LO3 | int Q8: two BED files give zero overlaps and no error → one uses `chr2`, the other `2` | overlaps are found but sit kilobases from the genes → different builds (BED carries no build) | L09 §2, L02 §3 |
| 3.5 | mcq | recognition, application | a `hideIdentity` BED12 line → BED12 (options: BED6 / BED12 / GTF / not BED) | a 9-column GTF line saved as `targets.bed` → GTF (1-based, 9 columns) | L08 §2, L09 §1 |
| 3.6 | mcq | LO7 | "An exome VCF has no call at a deep-intronic position 5 kb from any exon. What do you check before reading that as 'reference', and why?" → the targets and padded calling intervals: beyond the padding, nothing was examined | "Padding adds 100 bp to each side of every target. A variant 60 bp into an intron is called; one 400 bp in is not. Why?" → reads spill about 100 bp past target edges; 400 bp is beyond the padding, so it was not examined | L08 §1 |

**Q4 Alignments**

| Slot | Type | Tags | Variant A (source) → key | Variant B or parametric | Taught in |
|---|---|---|---|---|---|
| 4.1 | mcq | application | aln Q1: FLAG 133 with RNAME and POS set → unmapped, placed at its mate's position for sorting | parametric over curated FLAG values not used in L11.3 (the helper decodes) | L11 §2 |
| 4.2 | mcq multi | application | aln Q2: `r003` with FLAGs 0 and 2064 → pieces of one chimeric read; exactly one line is primary; 2064 = supplementary + reverse | a fresh read with FLAGs 16 and 2048 → the same three conclusions with the strands mirrored | L11 §2 |
| 4.3 | mcq | application, LO6 | "A read has MAPQ 20. What does that tell you?" → about a 1% chance that its placement is wrong, and nothing about its base qualities | parametric MAPQ, including 0 (ambiguous) and 255 (unavailable); distractors "base quality", "P = Q/100", "percent identity" | L10 §3 |
| 4.4 | mcq | LO4, LO7 | aln Q4: an emailed CRAM won't decode → send or name (by M5) the exact FASTA, or re-encode with `embed_ref` | seq Q9: a soft-masked, re-wrapped copy of the same FASTA → it decodes, because M5 is computed on the uppercased sequence without whitespace | L12 §3 |
| 4.5 | sort (4) | recognition, application | four fresh items into SAM text / BAM / CRAM / index file: a SAM record line; a BGZF head whose decoded chip reads `BAM\1`; `43 52 41 4d 03 01` (CRAM 3.1); `42 41 49 01` (`.bai`) | a SAM `@SQ` header line; another BAM; a CRAM 3.0 head; a BGZF head decoding to `TBI\1` (`.tbi`) | L11 §1, L12 §1-§2 |
| 4.6 | spot-the-error (single pick) | validity, application | a fresh 4-record SAM in which one record's CIGAR consumes 76 query bases while SEQ has 75 (SAM-S12) | a fresh 4-record SAM in which one record's QUAL is one character shorter than its SEQ (SAM-S13) | L10 §2, L11 §2 |

**Q5 Coverage and variants**

| Slot | Type | Tags | Variant A (source) → key | Variant B or parametric | Taught in |
|---|---|---|---|---|---|
| 5.1 | mcq | application, LO5 | int Q7's pattern on fresh numbers: `variableStep chrom=chr5 span=20` / `30001 61` → bedGraph `chr5 30000 30020 61` | parametric (never a case exon) | L13 §2 |
| 5.2 | mcq | recognition, application | a fresh record with ALT `<NON_REF>`, `END=` and `GT:DP:GQ:MIN_DP:PL` → a GATK gVCF reference block (options: GATK gVCF block / VCF 4.5 gVCF block / variant record in a plain VCF / bedGraph line) | a fresh record with ALT `<*>` and FORMAT `LEN` → a VCF 4.5 gVCF block | L15 §2-§3 |
| 5.3 | mcq | application, LO5, LO8 | var Q1's pattern on toy coordinates: `chr9 120000 . T <DEL> . PASS SVLEN=368;SVCLAIM=DJ` → deleted 120,001-120,368 (formerly Q1.3's variant, which tested this before L14) | found EX-15: `ref 14 . AG A` → the deleted base in BED is `ref 14 15` | L14 §1 |
| 5.4 | spot-the-error (single pick) | validity, application | a fresh 5-record VCF (declaring VCFv4.5) in which one record's FORMAT is `AD:GT` (VCF-S14) | the same task with QUAL `high` on one record (VCF-S11) | L14 §2-§3 |
| 5.5 | mcq | application, LO6 | found Q6: the father is `0/0` with DP 3 and GQ 8 → not yet confirmed (GQ 8 ≈ 16% chance the genotype is wrong) | parametric GQ and DP, never the lesson's GQ 12 | L15 §2, L16 §1 |
| 5.6 | mcq | LO7 | "In a merged variants-only VCF, a site where the child is het has no line for the father. Which file says whether he was actually covered there, and how?" → his gVCF: the reference block's DP, MIN_DP and GQ | "Which file tells you whether a depth dip is shared by all three samples?" → the per-sample depth tracks (WIG/bedGraph), normalized; a VCF records only sites with calls | L13 §3, L15 §1-§2 |

**Q6 Annotation**

| Slot | Type | Tags | Variant A (source) → key | Variant B or parametric | Taught in |
|---|---|---|---|---|---|
| 6.1 | mcq | recognition, application | ann Q1: `genes.gff3` whose column 9 reads `gene_id "…"; gene_type "…";` → a GTF misnamed `.gff3` | a `##gff-version 3` file with `ID=…;Parent=…`, saved as `.gtf` → a GFF3 misnamed `.gtf` | L17 §2 |
| 6.2 | mcq | application | ann Q2: deleting a 127-bp fully coding exon → frameshift (127 mod 3 = 1) | parametric over real MANE exon combinations not used in L18 (for example exons 9-10, 22-23, 5-7); the helper computes the key | L18 §1-§2 |
| 6.3 | mcq | application | ann Q4: a minus-strand segment 6001-6100 after an 8001-8200 segment with phase 0 → phase 1; first full codon at 6099 | ann Q3: a + strand segment 2001-2100 with phase 0; the next segment → phase 2 | L18 §1 |
| 6.4 | mcq | application | ann Q6: CCT8L2's GTF CDS is 3 bp shorter than its GFF3 CDS → GTF excludes the stop codon | parametric: a + strand GFF3 CDS ends at X → the GTF CDS ends at X − 3, and a `stop_codon` line covers X − 2 to X | L17 §2 |
| 6.5 | spot-the-error (single pick) | validity, application | a fresh DEMO-like GFF3 in which an exon's `Parent` names no existing ID (GFF3-M03) | the same task with phase `.` on a CDS (GFF3-S09) | L18 §3 |
| 6.6 | mcq | LO7, LO3 | ann Q9: the annotation says GRCh37 (Ensembl 74) but the reads are on GRCh38 → replace it with a GRCh38 release and record the version | "A VCF line reads chr2:X G>A. Which file turns it into gene, transcript and exon, and what must that file share with the VCF?" → a GTF/GFF3 of the same build and contig naming | L17 §4, L02 §3 |

**Q7 Structural variants and graphs**

| Slot | Type | Tags | Variant A (source) → key | Variant B or parametric | Taught in |
|---|---|---|---|---|---|
| 7.1 | mcq | application | a fresh BEDPE line on toy coordinates with strands `+ +` → inversion (LUMPY/svtools convention) | a fresh line with chrom1 ≠ chrom2 → translocation (BEDPE-M03) | L19 §2 |
| 7.2 | spot-the-error (single pick) | validity, application | a fresh 3-line BEDPE in which one line has 9 columns (BEDPE-S01) | the same task with strand `F` on one line (BEDPE-S06) | L19 §2 |
| 7.3 | mcq | application, LO5, LO8 | gph Q3's pattern on the toy contig: PAF target columns `toy40k … 12000 20130` → BED `toy40k 12000 20130` and SAM POS 12001 | parametric (never case PAF block 1) | L20 §1 |
| 7.4 | mcq | recognition, application | a `hideIdentity` 12-column PAF line with `tp:A:P` → PAF (options: PAF / BLAST tabular / BEDPE / SAM) | a BLAST tabular line (a float identity in column 3) → BLAST tabular | L20 §1, L21 §4 |
| 7.5 | mcq multi | validity | gph Q4: which single edits make the spec's GFA invalid? → a P line reusing a segment name (GFA-M01); a W line over non-0M links (GFA-M09); `+,` inside a name (GFA-S04) | the same task on the toy pangenome graph with fresh edits: removing a link a walk uses → invalid; replacing a sequence by `*` with `LN` → valid; writing a link from the other side → valid; a W length mismatch → a warning only (GFA-M10) | L21 §1-§4 |
| 7.6 | mcq | LO7 | "A PAF line places a HiFi read across the junction. To check the junction's bases, which file do you open, and why?" → the HiFi BAM (or the reads with the FASTA): PAF keeps placement and drops the bases | "Which file answers 'has anyone else's haplotype taken this path?'" → the pangenome GFA's W lines (here an illustrative panel) | L20 §1, L21 §3-§4 |

### 6.2 Capstone: triage the case folder

**Layout and flow** (ux §9.3, adapted per D-08):
- **Layout:** wide mode. The aside column is dropped; the switcher card and the theme control sit in a header row above the panes, and the container grows to 72rem plus gutters (§10.1). Two panes (the case-folder list and the inspector) appear when the content zone is at least 960 px wide (a container query); otherwise a drill-down.
- **Inspector content:**
  - text files in the snippet viewer; F01 shows its head and tail with an "N lines omitted" marker, plus its `.fai`;
  - compressed text files in two tabs, "Container (hex)" and "Decompressed text" (D-20);
  - BAM and CRAM in the hex viewer with their decoded header text;
  - companions such as `.fai`, `.crai` and `.tbi` on tabs.
- **Case notes panel:** the reference facts a learner may consult: the chr2 length and M5 from the `.fai`/`.dict`; the MANE CDS segment lengths (not their phases); a "Look up a reference base" field backed by the compact table of positions the REF and segment checks need (§11.5); and the lookup tables from the quiz Reference cards.
- **Per-file form:**
  - **Format:** the 14 formats, plus "index or companion file" and "other".
  - **Verdict:** Valid / Invalid / Valid but unusable here (L02's definitions).
  - **What's wrong?** Only when the verdict is not Valid: an authored list of 4-5 reasons, or a click on the offending line or annotated byte range.
  - **Submit:** gives per-file feedback citing the rule ID and spec. A file is correct when its format, verdict and (if not Valid) reason are all right. "Show answer" unlocks after 2 incorrect submissions.
- **Grading:** keys are precomputed. At test time, `validateFolder` runs over the generated folder, and a content test asserts that each file's key (verdict, rule IDs, target line or byte range) equals the validator's result. The shipped grader only compares answers with keys, so it needs no validators and no FASTA (§8.5).
- **Completion:** when every file is correct or revealed (ux §9.3).
- **Ending:** a "Case report" table (file, format, verdict, deciding rule) and the completed pipeline map. The only primary call to action is "Next: Closing the case" (L22). The badge call to action sits at the end of L22 and on the outline (D-10).
- **Recording:** `capstone.files[<id>] = { state, attempts, revealed }`.
- **Content tests:** no capstone snippet duplicates a lesson snippet; no capstone (file, rule) pair matches a lesson exercise; at most 4 non-valid files are tagged `foreshadowed` in `defects.ts`.

```ts
export interface CapstoneFile {
  id: string;                                       // "F04"
  snippet: Snippet;                                 // text, hex or compressed-text (§7)
  companions?: Snippet[];                           // .fai, .tbi, .crai on tabs
  key: {
    format: FormatId;
    verdict: "valid" | "invalid" | "unusable-here";
    rules: RuleId[];                                // exactly what validateFolder reports
    reasons: { id: string; text: string; correct: boolean }[];
    target?: { line?: number; field?: string; byteRange?: [number, number] };
    foreshadowed?: boolean;                         // the defect class was shown in a lesson
  };
}
```

| ID | File | True format | Verdict | Deciding rule(s) | What the learner must notice | Origin |
|---|---|---|---|---|---|---|
| F01 | `ref/chr2_SCN1A_region.fa` + `.fai` | FASTA | Valid | — | A slice named `chr2:165980001-166380000`, 400,000 bp; the `.fai` is consistent | control |
| F02 | `fastq/P042-mother_S2_L001_R2_001.fastq.gz` | FASTQ | Invalid | FQ-S06, CASE-14 | In the decompressed text, the last record ends after `+`; gzip integrity fails | foreshadowed (L07 §1 teaches truncation; no case beat names the file) |
| F03 | `capture/exome_targets_GRCh38.bed` | BED | Valid | — | The sorted, track-free, 0-based targets (`SCN1A_e16` starts at `166041230`); learners who remember L08.3's broken conversion must check, not recall | control |
| F04 | `bam/P042-father.bam` + `.bai` | BAM | Valid | — | The hex tail ends with the 28-byte EOF block; the decoded header's `@SQ SN:chr2 LN:242193529 M5:f98db672…` agrees with the `.fai` | control |
| F05 | `cram/P042-proband.cram` + `.crai` | CRAM | Valid but unusable here | CRAM-M02, CASE-02 | `@SQ SN:chr2 M5:f98db672…`; the folder only has the slice FASTA | foreshadowed (L12.2) |
| F06 | `coverage/P042-proband.depth.wig` | WIG | Valid | — | It shows the dip | control |
| F07 | `vcf/P042-father.g.vcf.gz` + `.tbi` | gVCF | Valid | — | The GQ-12 block at 166,009,870-166,009,902; the blocks tile (CASE-10) | control |
| F08 | `vcf/P042-proband.g.vcf.gz` | gVCF | Valid but unusable here | VCF-C02, CASE-09 | Plain gzip: the FLG byte lacks FEXTRA, so there are no BGZF blocks and no `.tbi` can be built; GenomicsDBImport and region queries fail. The VCF records are valid. Re-compressing with `bgzip` fixes it | foreshadowed (L12.1 file C) |
| F09 | `vcf/P042.trio.vcf.gz` + `.tbi` | VCF | Invalid | VCF-M15, CASE-01 | `##contig=<ID=chr2,length=243199373>`, the GRCh37 length, on GRCh38 records | foreshadowed (L02 §3 lengths) |
| F10 | `sv/P042-proband.sv.bedpe` | BEDPE | Invalid | BEDPE-S05 | On the `BND_2` line, window 1's start is greater than its end. Tools say: bedtools keeps the line silently | re-planted |
| F11 | `annotation/SCN1A_SCN9A.MANE.gtf` | GTF | Valid | — | GENCODE v43 lines | control |
| F12 | `annotation/SCN1A.MANE.gff3` | GFF3 | Invalid | GFF3-M08, CASE-11 | Exon 9's CDS phase is `0` instead of `2`: exon 8's CDS is 92 nt with phase 1, so the chain gives (1 − 92) mod 3 = 2 | re-planted |
| F13 | `longread/P042-proband.hifi.txt` | PAF (misleading extension) | Invalid | PAF-M02, CASE-13 | One line's query end (column 4) exceeds its query length (column 2) | re-planted |
| F14 | `graph/P042_locus.gfa` | GFA 1.1 | Invalid | CASE-12 | The rank-0 segment `s7` (`SO:i:166041353`) has sequence `G`, but GRCh38 has `A` at 166,041,354 (rs6432860's REF; the Case notes base lookup confirms it). Tools say: gfatools does not compare segments with a FASTA | re-planted |
| F15 | `bam/P042-proband.SCN1A.sam` | SAM | Invalid | SAM-S13 | One record's QUAL is one character shorter than its SEQ | re-planted |

The folder has 6 valid controls, 2 files that are valid but unusable here, and 7 invalid files. Four of the nine non-valid files repeat a defect class the lessons foreshadowed; five apply a taught rule to a file the lessons never showed broken. Learners spend about 2-2.5 minutes per file, about 35 minutes in all.

### 6.3 Completion badge

- **Rule (D-10; confirmed by the owner, OQ-3):** earned when all 7 section quizzes are passed and the capstone is complete. Derived, not stored; `badge.earnedAt` is set the first time the rule becomes true.
- **Locked state:** a grey badge with a lock and a live requirements checklist, for example "Pass all 7 section quizzes (5 of 7)" and "Complete the capstone (in progress)". Optional context: "Lessons complete: 18 of 22", plus "Closing the case: not yet read" when L22 is incomplete.
- **Earned state:**
  - Our own inline-SVG hexagonal medallion (ux §13), labelled "Genomic File Formats" and "14 formats", with the earned date.
  - A summary of what the learner can now do, mirroring the objective.
  - The completed pipeline map.
  - An optional "Name on badge" (stored locally only).
  - Buttons: "Download badge (SVG)" and "Print certificate". A PNG export is in the post-v1 backlog.
  - The honesty line: "Self-issued course completion; not an accredited credential."
- **SVG exporter.** The download is a standalone SVG built for the purpose, not a serialization of the in-page badge: literal light-theme hex colours (no `var(--…)`); text converted to paths (or a subsetted woff2 data URI inside an SVG `<style>`); explicit `xmlns`, `width`, `height` and `viewBox`. An e2e test downloads it, loads it into a blank page without the app's CSS, and compares a screenshot with the in-page badge.
- **Motion:** a one-time drift of A/C/G/T letters, under 2 s, with no flashing. It is static under reduced motion.

---

## 7. Interactive component library

All exercises share one card anatomy and one five-state model (ux §8.1-§8.2):

| State | Status label | Icon (Lucide SVG, `aria-hidden`) | Counts toward completion |
|---|---|---|---|
| idle | Not started | `circle` | no |
| attempted | In progress | `circle-dot-dashed` | no |
| incorrect | Not yet | `circle-x` | no |
| correct | Correct | `circle-check` | yes |
| revealed | Answer shown | `eye` | yes |

Every status uses an SVG icon next to its text label, never colour alone, and never a text glyph or emoji (the embedded latin subsets lack ✓, ✗, →, ≤ and ≥; ux §5.2; §12.6).
- **Retries.** Formative retries are unlimited. "Show answer" appears after 2 incorrect attempts (3 for spot-the-error). Quizzes are graded once per attempt on "Submit quiz" (ux §8.4, D-09).
- **Focus and announcements.** On Check, focus moves to the verdict line, which is not a live region, so screen readers announce it once. Live regions are used only where focus stays put: fix-it validity, sort moves and copy confirmations. In quizzes, "Submit quiz" moves focus only to the results heading.
- **Headings.** A Quick check's H3 text is the exercise title; "QUICK CHECK · <TYPE>" is a non-heading overline. A card under a "Try it:" H2 renders no heading of its own and sets `aria-labelledby` to that H2.
- **Feedback style.** Lead with the verdict; ground the reason in the learner's data; keep explanations to ≤ 40 words and per-option explanations to ≤ 30 (ux §8.3).
- **Events.** Widgets fire one bubbling `gf:solved` event with `{ id, state, attempts, firstTry, revealed }`.
- **Optional exercises.** The compiler marks exercises inside `:::read-more` as `optional`; they are excluded from completion, the "N of M exercises" pill and coverage counts. This includes the 14 "Optional practice" items of v3 (§5). Content tests still check their keys. The "Used in" lists below name graded uses first and optional practice separately.

**Shared data types** (sketch; `src/exercises/types.ts`):

```ts
export type FormatId =
  | "fasta" | "fai" | "gzi" | "fastq" | "bed" | "bedgraph" | "bedpe" | "wig" | "gtf" | "gff3"
  | "sam" | "bam" | "bai" | "csi" | "cram" | "crai" | "vcf" | "gvcf" | "tbi" | "paf" | "gfa"
  | "gaf" | "ped" | "gzip" | "bgzf" | "blast6" | "interval_list" | "other";
export type RuleId = string;                       // "BED-S17", "CASE-03", "XF-12", ...
export type Severity = "error" | "warning" | "convention";
export type Verdict = "valid" | "invalid" | "unusable-here";
export type Kind = "spot-the-error" | "fix-it" | "sort" | "field-explorer" | "simulator" | "predict" | "mcq";

export interface Snippet {
  filename: string;                                // shown in the viewer header; genericized when hideIdentity
  format: FormatId;
  kind: "text" | "hex" | "compressed-text";
  text?: string;                                   // exact characters; TAB and CR are written as \t and \r escapes (§11.2)
  hex?: HexView;                                   // binaries, and the container view of compressed text (D-20)
  decodedText?: string;                            // compressed-text: the full decompressed text, precomputed
  provenance: "toy" | "case" | "spec-example" | "real-file";  // drives the "illustrative" label
  hideIdentity?: boolean;                          // recognition items: no badge, file_07.txt
  download?: "text" | "decompressed" | "bytes" | "none";      // D-27; "bytes" only for small toy binaries
  view?: { whitespace?: boolean; aligned?: boolean; headerCollapsed?: boolean; lineInfo?: boolean };
}
export interface HexView {
  head: string; tail?: string; omittedBytes?: number;
  annotations: { from: number; to: number; label: string }[];  // "gzip magic", "BC subfield", "EOF block"
  decoded?: string;                                // a short chip, e.g. "BAM\1…" or the decoded header text
}
export interface Validation {
  format: FormatId; profile: ValidatorProfile; context?: ValidationContext;
  severities?: Severity[];                         // in scope for key checks; default ["error"]
}
interface ExerciseBase {
  id: string;                                      // "<lesson-id>/<slug>", stable across reordering
  kind: Kind; title: string; prompt: string;       // title is also the Quick check's H3 text
  source: string;                                  // "case EX-03", "seq EX-01 (re-keyed)"
  tags: ("recognition" | "validity" | "application" | "concept" | "LO7")[];
  formats: FormatId[]; concepts: string[]; hints?: string[];
  verification?: string[];                         // V-ids this item depends on (§12.3)
  followUps?: (PredictExercise | McqExercise | SpotTheErrorExercise)[];  // one card, one status
  optional?: boolean;                              // set by the compiler inside :::read-more
}
```

### 7.1 spot-the-error

- **Behavior.**
  - The snippet viewer in interactive mode, at line or field granularity, with a counter ("Errors found: 1 of 3").
  - A selection commits only on Check, so stray mobile taps do not count.
  - A correct pick shows the "Correct" icon and an explanation row inserted under that line.
  - An incorrect pick shows "Not yet" plus a per-distractor note, or "That field is fine here".
  - Clean picks stay dashed so they are not repeated.
  - Multi-round mode handles exercises such as int E4 and ann EX-03.
  - `acceptAlso` covers knock-on errors: a click there is not marked wrong and reveals as a knock-on.
- **Data:**

```ts
export interface SpotTheErrorExercise extends ExerciseBase {
  kind: "spot-the-error";
  rounds: {
    snippet: Snippet; granularity: "line" | "field";
    validation: Validation;                        // format, profile, context (reference, contigs, folder), severities
    answers: { line: number; field?: string; rule: RuleId; explanation: string }[];  // field = schema name
    acceptAlso?: { line: number; field?: string; note: string }[];
    fineHere?: Record<string, string>;             // "line:field" -> note
    toolsSay?: string;                             // "samtools 1.24 accepts a3 silently"
  }[];
}
```

- **Key check.** For each round: answers ⊆ diagnostics(validation) ⊆ answers ∪ acceptAlso, matched on (line, field name, rule), counting only diagnostics whose severity is in `validation.severities`. Rounds that key a warning or a convention (L08.3 BED-C01; in optional practice, L09.2 round B BED-C02 and L18.4 GFF3-M13) say so in their severities. Cross-file rounds (L02.3) pass a `folder` in the context.
- **Accessibility.**
  - The `role="grid"` pattern with a roving tabindex: Up/Down move between lines, Left/Right between fields, Space/Enter toggles. Each cell's accessible name reads like "Line 3, field 2 of 6, chromStart, value 166041231".
  - Each line's accessible name ends with its description, computed for every line so that it gives nothing away: character count, separator kind ("3 tabs" or "3 spaces"), leading or trailing whitespace, CR, and non-ASCII code points. The same text appears in the visible "Show lengths and separators" gutter (§7.8). A DOM test checks, for each whitespace or length exercise (L04.2, L07.2, L09.2, L09.3), that the defective line can be told apart from the accessibility tree alone.
  - Target size: in interactive modes the line height is at least 26 px (28 px on coarse pointers), and every field cell's hit area is at least 24 × 24 px (in Raw view a pseudo-element pads it). An e2e assertion checks every `[role=gridcell]` box.
  - No shake animation.
- **Used in:** L02.3, L04.2, L07.2, L08.3, L09.2, L11.4, L13.4, L14.3, L21.3; quiz single-pick items; the capstone "What's wrong?" click. Optional practice: L09.2 round B, L18.4.

### 7.2 fix-it

- **Behavior.**
  - A textarea with a highlight overlay (D-26). Whitespace markers are on, with an error gutter and wavy underlines.
  - Tab inserts a literal TAB; Esc then Tab leaves the editor (stated on screen); an "Insert tab" button serves touch devices.
  - Validation is debounced at 250 ms. A Problems list shows line, column, message, found and expected values.
  - Input is capped at the validators' snippet scope (about 300 lines, 64 KB). Above the cap, validation stops and the panel says: "This exercise checks small snippets; use real tools for whole files."
  - On coarse pointers, the editor and its overlay are at least 16 px, at the same size, so iOS does not zoom on focus (V-41); the viewport meta never sets `maximum-scale`.
  - Goal checks stop learners from passing by deleting content.
  - A three-step hint ladder. "Show solution" shows a diff.
  - The exercise is correct only when, on Check, there are no error-level diagnostics in its profile and every goal passes.
- **Data:**

```ts
export interface FixItExercise extends ExerciseBase {
  kind: "fix-it";
  starter: Snippet;
  validation: Validation;
  goals: { id: string; text: string; check: GoalCheckId; args?: unknown }[];  // "keepsRecords", "strands", "windowContains"
  solution: string;                                // a minimal valid answer; content tests validate it
  expectStarterRules: RuleId[];                    // the starter must fail with exactly these
  hints: [string, string, string];
}
```

- **Accessibility.** Native textarea; the "advised of the method" rule for the Tab key (WCAG 2.1.2); `spellcheck`, `autocapitalize` and `autocorrect` off; smart quotes and NBSP are flagged. An e2e geometry test in each engine types a TAB, scrolls a long line, and checks that the overlay span for a known error lines up with the textarea text.
- **Used in:** L03.3, L04.3, L09.1, L11.1, L17.3, L18.3, L19.3, L20.4. Not used in quizzes.

### 7.3 sort

- **Behavior.**
  - An Unsorted pool plus labelled bins. Items can be text, snippet excerpts or hex excerpts.
  - Drag starts from a grip handle. As alternatives: tap to select then tap a bin, a "Move to…" menu, or the keyboard (pick up, cycle bins, drop, Esc).
  - Below 600 px, or whenever a sort has more than 4 bins, each item carries an inline "Place in…" select as its primary control (the matrix pattern); dragging stays available on wide screens.
  - Check grades only when every item is placed. A wrong item flies back to the pool; correct ones lock. Each item has a "Why?" disclosure.
  - An ordered variant uses Move up/down buttons; the matrix variant (one select per row) serves L01.3.
- **Data:**

```ts
export interface SortExercise extends ExerciseBase {
  kind: "sort"; ordered?: boolean; matrix?: boolean;
  bins: { id: string; label: string }[];
  items: { id: string; content: string | Snippet; bin: string; why: string;
           validityFromValidator?: boolean; validation?: Validation }[];
}
```

  With `validityFromValidator`, the content test runs the item's `validation` and checks that its bin equals the verdict mapped from the diagnostics (D-11).
- **Accessibility.** Dragging is never required (WCAG 2.5.7). Moves are announced in a live region.
- **Used in:** L01.1, L01.3 (matrix), L02.2, L03.2, L07.3, L09.3, L12.1 (hex), L13.2, L14.1, L15.3, L16.2, L17.2, L21.4, L22.1; quiz sorts with ≤ 4 items. Optional practice: L13.1.

### 7.4 field-explorer

- **Behavior.**
  - The snippet viewer in Aligned view with Colors on, plus a legend.
  - Hovering or focusing a field highlights its column and legend row and shows a popover with name, value, meaning and citation. Tapping pins the popover; on mobile the legend row expands instead.
  - An "Explored 7 of 11 fields" counter. Exploring alone never completes the exercise: every field-explorer ends with an embedded check or follow-ups that make the learner apply what the fields mean (lint).
- **Data:**

```ts
export interface FieldExplorerExercise extends ExerciseBase {
  kind: "field-explorer";
  snippet: Snippet;
  fields: { line: number; col: number; name: string; meaning: string; allowed?: string; cite: string }[];
  check?: McqExercise;                             // required unless followUps are present
}
```

- **Accessibility.** A roving tabindex across fields. Popovers meet WCAG 1.4.13 (hoverable, dismissible, persistent). Each field's `aria-describedby` points to its legend row.
- **Used in:** L04.1, L06.3, L14.2, L17.1, L19.1 (with follow-ups), L20.1. Optional practice: L11.2. (The former diagram mode is gone: L01.3 is now a matrix sort.)

### 7.5 simulator

- **Behavior.**
  - Layout runs controls, then visualization, then a plain-language readout. Representations are bound both ways.
  - Presets use real case values.
  - 1-3 goals, detected automatically; "Show me" appears after 2 tries.
  - Animations never autoplay: Play, Step and Reset only, and Step-only under reduced motion.
  - Simulators are Preact islands inside custom elements (D-21).
- **Contract.** Each simulator exports a pure model, separate from its view, that node tests can drive:

```ts
export interface SimulatorModel<S, A> {
  init(args: Record<string, unknown>): S;
  reduce(state: S, action: A): S;
  goalChecks: Record<GoalCheckId, (state: S, args?: unknown) => boolean>;
  text(state: S): TextView;                        // the table, list or log the text view renders
}
export type SimulatorId =
  | "coordinate-ruler" | "fai-calculator" | "bgzf-demo" | "phred-converter" | "cigar-drawer"
  | "flag-decoder" | "exon-dip-explorer" | "gvcf-expander" | "exon-frame-calculator"
  | "junction-drawer" | "gfa-drawer" | "microhomology-slider";
export interface SimulatorExercise extends ExerciseBase {
  kind: "simulator"; simulator: SimulatorId;
  init: Record<string, unknown>; presets?: { label: string; state: Record<string, unknown> }[];
  predictGate?: PredictExercise;                   // e.g. L13.3 commits before the reveal
  goals: { id: string; text: string; when: GoalCheckId; args?: unknown; explanation: string;
           witness: unknown[] }[];                 // actions that reach the goal from init
  textView: "table" | "list" | "log";              // required
}
```

  The content test replays each goal's `witness` through `reduce` from `init` and asserts that the goal fires, and that `init` alone does not satisfy it. A widget DOM test reaches every goal with the keyboard only, through the text view where the visual needs pointing.
- **Accessibility.** Native inputs where possible. Custom handles use `role="slider"` with `aria-valuetext`. Readouts sit in a `role="status"` region, debounced at 500 ms. Every simulator has a text view, which screen readers and print also use (WCAG 1.1.1, 1.3.1, 2.1.1).

| Simulator | Concept | Text view | Used in |
|---|---|---|---|
| `coordinate-ruler` | Posts vs panels; empty intervals | positions list; start/end number inputs select a range | L03.1 (goal 2 as optional practice) |
| `fai-calculator` | `.fai` byte arithmetic | the formula with its values filled in | L05.1 |
| `bgzf-demo` | Blocks, virtual offsets, why gzip cannot be indexed | a step log | Optional practice in L05 (since v3; its mcq stays graded as L05.3); Read more in L12 |
| `phred-converter` | Q ↔ P; expected errors | a character → Q → P table | L06.2 |
| `cigar-drawer` | Consumption rules; alignment end | a three-row text alignment with reference positions | L10.1 |
| `flag-decoder` | FLAG bits; mate consistency; secondary, supplementary, duplicate | native checkboxes for the 12 bits | L11.3 |
| `exon-dip-explorer` | Raw vs normalized depth; artefact vs deletion | an exon-by-sample table of depth and ratio that follows the toggle | L13.3 |
| `gvcf-expander` | Block evidence; GQ/MIN_DP; tiling | a block table (POS, END, GT, GQ, MIN_DP) plus a "Go to position" input | L15.2 (goal 2 as optional practice) |
| `exon-frame-calculator` | Length mod 3; phase equality | an exon table with checkboxes and the readout | L18.2 (goal 3 as optional practice) |
| `junction-drawer` | Strand pairs → SV type | an adjacency list | L19.2 |
| `gfa-drawer` | Walks, orientations, missing links | an adjacency list plus the spelled walk | L21.1 |
| `microhomology-slider` | Equivalent breakpoint placements; VCF normalization vs HGVS 3′ rule | the 8 placements with their VCF and HGVS strings | L22.3 (goal 1 as optional practice) |

(The former `anchor-base-builder` is retired: padding is practised in L14.1, and normalization moved into L22.3.)

### 7.6 predict

- **Behavior.** Inputs can be choice chips, a number with a tolerance, text (normalized for case and whitespace) or a region on a ruler (with number inputs as the keyboard path). "Lock in my prediction" makes the input read-only, then the reveal panel opens. A match records *correct*; anything else records *revealed*, and both complete the exercise ("predictions are for thinking"). A multi-item form shares one lock button.
- **Data:**

```ts
export interface PredictExercise extends ExerciseBase {
  kind: "predict";
  items: { label: string; input:
      | { type: "choice"; options: string[]; answer: number | number[] }
      | { type: "number"; answer: number; tolerance: number; unit?: string }
      | { type: "text"; answer: string; normalize?: ("case" | "whitespace")[] }
      | { type: "region"; answer: [number, number] } }[];
  reveal: string;
  computeWith?: string;                            // required for number and region items, and for computable text
}
```

- **Accessibility.** Labelled inputs. The reveal is announced. A "Skip and show answer" link is available.
- **Used in:** L01.2, L02.1, L05.2, L06.1, L06.2 (follow-ups), L07.1, L08.1, L08.2, L10.2, L10.3, L16.1, L16.3, L17.4, L18.1, L19.1 (follow-ups), L20.2, L21.2; quiz predict slots. Optional practice: L19.1 follow-ups (c) and (d), L20.3, L21.2's two walk-length items. The section openers (L04.0 … L19.0) are narrative since v3 and use no widget.

### 7.7 mcq

- **Behavior.**
  - A `fieldset`/`legend`. Single-select uses native radios; multi-select uses native checkboxes with "Select all that apply".
  - Option rows are the click targets.
  - After Check (or "Submit quiz"), each option shows Correct, Your choice or Missed, each with its SVG icon and its explanation.
  - A matrix variant has one select per row.
- **Data:**

```ts
export interface McqExercise extends ExerciseBase {
  kind: "mcq"; multi: boolean; stem: string; snippet?: Snippet;
  options: { id: string; text: string; correct: boolean; explanation: string;
             snippet?: Snippet; validation?: Validation; validityFromValidator?: boolean }[];
}
export interface QuizSlot {
  id: string; tests: string /* "<lesson-id>#<heading-id>" */;
  tags: ExerciseBase["tags"]; concepts: string[]; verification?: string[];
  variants: (McqExercise | PredictExercise | SpotTheErrorExercise | SortExercise)[];  // at least 2
  generator?: string;                              // parametric slots: a helper that yields fresh variants
}
export interface Quiz { section: string; slots: QuizSlot[]; passMark: number /* 5 */; referenceCard: string[] }
```

  A validity mcq whose options show snippets ("which line is valid?", "which edits make the GFA invalid?") marks them `validityFromValidator`, so the content test checks each option against the validators.
- **Accessibility.** APG radio-group keyboard pattern. Result lines are linked to their options with `aria-describedby`.
- **Used in:** L05.3; the embedded checks of L04.1, L06.3, L14.2, L17.1 and L20.1; L12.2, L15.1, L16.4, L22.4; most quiz slots. Optional practice: L11.2's embedded check, L22.2.

### 7.8 Shared infrastructure components

- **Snippet viewer** (ux §7). The course's signature component:
  - raw and aligned views; whitespace markers (tab arrows, space dots, CR chips, Unicode code-point chips for NBSP, smart quotes and BOM);
  - a "Show lengths and separators" gutter toggle, whose text is also part of each line's accessible name (§7.1);
  - sticky line numbers; Expand dialog; Copy (exact bytes) and Download (D-27);
  - per-field highlighting; linked SEQ/QUAL highlighting on hover and on focus; collapsible headers;
  - "View as table" for screen readers. It never re-splits a line on a separator the file does not use: a space-separated line in a TAB file shows as one cell with a "separator: space" note;
  - in interactive modes, line height ≥ 26 px (28 px on coarse pointers) and field hit areas ≥ 24 × 24 px.
- **Hex viewer** (ux §7.5): head and tail, labelled byte-range annotations, a decoded chip. Below 600 px it shows 8 bytes per row. In sort excerpts it leads with the authored annotated range. When a hex view is a pick target, the annotated byte range is the target, not single bytes.
- **Compressed-text viewer:** two tabs, "Container (hex)" and "Decompressed text".
- **Pipeline map:** inline SVG with an ordered-list text equivalent. Below about 600 px it lays out vertically, top to bottom, with BED, WIG and GTF/GFF3 as side branches and node targets of at least 44 px. Used on the home page, in L01, in the section openers, at the end of the capstone and on the badge page.
- **Quiz page** with its Reference card; **capstone inspector**, also used in miniature by the L12.3 mini-triage.
- **Exercise card**, **callouts** (note, tip, watch out, from the spec, case file), **READ MORE / SPEC DETAIL / WHY IT MATTERS** disclosures on native `<details>`, **code block** with copy, **At-a-glance card** (with Answers / Keeps / Drops / Next file rows), **coordinate crosswalk card**.

---

## 8. Validators

### 8.1 Contract

Validators are pure, DOM-free TypeScript in `src/validators/<format>.ts`. Content tests, unit tests, fix-it widgets and the test-time capstone key builder share them.

```ts
export interface Diagnostic {
  rule: RuleId; severity: Severity;
  line: number; col?: number; field?: string;      // 1-based line; field name from the format schema
  message: string; found?: string; expected?: string;
  spec: string;                                    // "BEDv1 §5", "SAMv1 v1.6 §1.4 item 6"
  toolsSay?: string;                               // "bedtools 2 and UCSC accept track lines"
}
export interface RuleMeta {
  id: RuleId; severity: Severity;
  verdict: "invalid" | "unusable-here" | "none";   // D-11 verdict mapping
  runtime: boolean;                                // ships in the browser (used by a fix-it profile)
}
export interface ValidationContext {
  contigs?: Record<string, number>;                // from .fai/.dict
  md5?: Record<string, string>;
  reference?: (chrom: string, start0: number, end0: number) => string | undefined;  // REF checks
  declaredType?: string;                           // e.g. "bed9+1"
  version?: string;                                // VCF/GFA declared version
  companions?: Record<string, string | HexView>;   // .fai text, .tbi summary, mate FASTQ ...
  folder?: Record<string, Snippet>;                // cross-file (XF) rounds
}
export interface ValidatorProfile { include?: RuleId[]; exclude?: RuleId[]; escalate?: RuleId[]; mode?: "strict" | "tool" }
export type Validator = (input: string | HexView, ctx?: ValidationContext, profile?: ValidatorProfile) => Diagnostic[];
export function validateFolder(files: Record<string, Snippet>): Diagnostic[];   // CASE-01..CASE-14, XF rules
export function verdictOf(diags: Diagnostic[]): Verdict;  // via RuleMeta.verdict: any "invalid" → invalid; else any "unusable-here" → unusable-here; else valid
```

### 8.2 Scope

- **Text formats** are parsed fully, at snippet size: up to about 300 lines and 64 KB, which is also the fix-it input cap. Errors cascade minimally: one root cause, one diagnostic (tech §10 fixed a 3-error cascade to 2). Knock-on lines therefore produce no diagnostic; keys list them in `acceptAlso`.
- **Binary formats** (BAM, CRAM, BGZF, gzip, `.bai`, `.csi`, `.tbi`, `.crai`, `.gzi`) are checked on precomputed `HexView` summaries: magic, FLG/`BC` field, EOF block or container, version, and decoded header text (D-20). Rules that need full record decoding (for example BAM-S05, BAM-M01) are covered by the oracle cross-check, not by our validators.
- **Context** comes from the case folder or the exercise. For example, VCF-M01 needs `reference`; FA-M05/FAI-M01 need the `.fai` companion; BED-M01 needs `contigs`; CASE-12 needs the FASTA bases.
- **Content-driven rule coverage.** v1 implements the structural (S) rules of every format that has a graded snippet, because they make "no other diagnostics" meaningful, plus every M, C, GVCF, XF and CASE rule that content references (fix-it profiles, spot and sort keys, quiz variants, capstone keys). All other rule IDs from the notes go to a v1.x backlog. CI prints a rule-usage report (rule → exercises).
- **Runtime vs test-only.** Only the rules used by fix-it profiles ship in the browser, with their messages, spec citations and "Tools say" texts: the fix-its in L03.3, L04.3, L09.1, L11.1, L17.3, L18.3, L19.3 and L20.4 cover BED, FASTA, SAM, GTF, GFF3, BEDPE and PAF. Every other rule lives in test-only modules that the build never imports; spot, sort, quiz and capstone widgets compare answers with precomputed keys. A check-dist assertion confirms that no test-only rule message reaches `dist/index.html`.

### 8.3 Rules implemented per format

Implemented = the structural rules of each listed format plus the referenced M/C/XF/CASE rules (§8.2); the ranges below are the notes' full rule sets.

| Format | Rule IDs (from the notes) | Severity and verdict calls this plan makes (D-11) | Fix-it / spot / capstone use |
|---|---|---|---|
| FASTA, `.fai`, `.gzi` | FA-S01-S06, FAI-S01-S02, FA-M01-M07, FAI-M01-M02, FA-C01-C04, GZ-S01-S02 | A leading blank line is a warning. FA-M01 (duplicate name) is a warning ("samtools keeps the first"), escalated to error in cross-file checks against `@SQ`. FA-M06 never flags IUPAC codes (GRCh38 contains M and R). FAI-M02 is a convention. GZ-S02 (missing BGZF EOF block) is an error at course level, the same rule as BAM-S03 and CASE-14: the spec says "should", and samtools only warns | L04.2, L04.3, L05.2, L12.3; F01 |
| FASTQ | FQ-S01-S07, FQ-M01-M04, FQ-C01-C05 | FQ-S03 is an error (Cock 2010), with "Tools say: samtools fqidx 1.24 accepts". FQ-M01 is a heuristic: any character below `;` proves +33; everything ≥ `@` gives "possibly +64" (warning). ≤ 4 distinct characters gives an info note "binned" | L07.2; F02 |
| BED | BED-S01-S19, BED-M01-M06, BED-C01-C06 | Strict BEDv1 by default: S06 (dotted names) and S17 (track lines) are errors with "Tools say" notes. C01, C02 and C06 are conventions; C02 and C06 map to "unusable here" where the exercise's pipeline needs bedtools or tabix. M02 maps to "unusable here" when names differ but lengths match. BED-S03 needs `declaredType` | L03.3, L08.3, L09.1-L09.3; optional practice: L09.2 round B, L12.3's third file; F03 |
| BEDPE | BEDPE-S01-S06, BEDPE-M01-M05, BEDPE-C01-C04; course goals (window contains the defining base; ≤ 50 bp only in L19.3) | S05 is a course rule (bedtools never reaches its check) and decides F10. M04 is a warning: it applies the LUMPY/svtools convention, and is convention-dependent | L19.3; F10 |
| WIG, bedGraph | WIG-S01-S07, WIG-M01-M05, WIG-C01-C04, WIG-G01-G03 | S01 applies only in "custom track" mode. `NaN` is a warning, `.`/`NA` an error. M05 is an error (doc MUST) with "Tools say: wigToBigWig accepts per-section spans" | L13.4; F06 |
| GFF3 | GFF3-S01-S17, GFF3-M01-M13, GFF3-C01-C06 | S05 checks against SO names plus an allow-list of legacy names (`lnc_RNA`, `protein`), which give a warning. S13 is an error (enforced by GenomeTools). M11 is a warning. M08 decides F12 | L18.3; optional practice: L18.4; F12 |
| GTF | GTF-S01-S08, GTF-M01-M07, GTF-C01-C07 | Missing IDs (S06) are an error; ID order is a warning (Ensembl violates it). C02 (gene lines without `transcript_id`) is a convention. S03 is an error per GTF2.2 with "tools vary". Unquoted numbers are at most a warning | L17.3; F11 |
| SAM | SAM-S01-S20, SAM-M01-M17, SAM-C01-C12 | S08 (space in QNAME) and S15 (`-` in SEQ) are errors per the spec, with "Tools say: samtools accepts". S12 and S13 (length agreement) are errors; S13 decides F15. M05 is an error (course choice, following htsjdk). M11 checks the sign only; magnitude is implementation-defined. M08 is an error when `@RG` lines exist and a warning otherwise | L11.1, L11.4; F15 |
| BAM | BAM-S01-S04 and S07 on summaries; S05-S06, M01-M03 via the oracle; C01-C02 as conventions | S03 is an error at course level (the spec says "should", and the explanation says so), the same rule as GZ-S02; it maps to Invalid (presumed truncated, CASE-14) | L12.1; F04 (passes) |
| CRAM | CRAM-S01-S06 on summaries; CRAM-M01-M04; C01-C04 | M02/M03 map to "valid but unusable here", not "invalid". `@SQ M5` is required unless the reference is embedded | L12.1, L12.2; F05 |
| VCF | VCF-S01-S20, VCF-M01-M17, VCF-C01-C08 | Dispatched by declared version (D-12; GATK files declare 4.2): SVLEN sign, SVCLAIM required from 4.4, END deprecated in 4.5. Strict where htslib is lenient (S11, S13, S14, S17, S18, M08), each with a "Tools say" note. C02 (plain gzip instead of BGZF) maps to "unusable here" (with CASE-09), never to Invalid. M15 maps to "unusable here" for a naming-only mismatch with identical lengths, and to Invalid together with CASE-01 when a declared length contradicts the data (F09) | L14.3, L15.3; F08, F09 |
| gVCF | GVCF-S01-S03, GVCF-M01-M04, GVCF-C01-C02, plus the VCF rules | M01 tiling is checked against the padded targets in the capstone (CASE-10). M03 is surfaced as an interpretation warning | L15.2; F07, F08 |
| PAF | PAF-S01-S06, PAF-M01-M09, PAF-C01-C06 | C01 `--paf-no-hit` lines are accepted and flagged as unmapped. M04 is an error with `cg`, a warning without, and adjusted by `nn:i`. M02 decides F13 | L20.4; F13 |
| GFA, rGFA | GFA-S01-S11, GFA-M01-M15, GFA-R01-R05, GFA-C01-C05 | R04 is a warning. M10's length mismatch is a warning (start > end is an error). M13 (version vs record types) is a warning. CASE-12 needs the FASTA bases and decides F14 | L21.1, L21.3; F14 |
| Cross-file | XF-01-XF-28 where referenced; CASE-01-CASE-14 | Verdict map: CASE-01, -03, -05, -11, -12, -13 and -14 → Invalid (the file states something false or is incomplete); CASE-02 and -09 → Valid but unusable here; CASE-04, -06, -07, -08 and -10 by their level. CASE-07 accepts all 8 equivalent placements (case §3.6) | L02.3; capstone |

### 8.4 Message style

Template: **`<Location>: <plain-language problem>. Found <x>; expected <y>. <Rule ID> · <spec §>`**, optionally followed by **`Tools say: …`**.

Examples:
- "Line 2, field 2 (chromStart): this start looks 1-based. Found `166041231`; the GTF exon starts at 166,041,231, so BED needs `166041230`. CASE-03 · BEDv1 §1.3."
- "Line 4: quality has 35 characters for 36 bases. FQ-S04 · Cock et al. 2010. Tools say: Biopython and samtools both reject this."

Rules for messages:
- Use second person, present tense, sentence case, no blame words.
- Show values exactly as they appear in the file, in code chips; use thousands separators in prose.
- Report one diagnostic per root cause.
- Warnings never block a fix-it unless its profile escalates them.

### 8.5 How exercises use validators

- **fix-it:** live validation with the exercise's `profile` and `context`, plus goals, using runtime rules only. For example, ann EX-05 runs only GTF-S01-S08 and "CDS inside an exon", because transcript-level rules would reject even the correct two-line answer (ann EX-05 note).
- **spot-the-error:** a content test requires answers ⊆ diagnostics ⊆ answers ∪ `acceptAlso`, matched on (line, field name, rule), within the round's `severities` (§7.1).
- **sort and mcq with validity bins or options:** each item's bin (or option's correctness) must equal `verdictOf` its diagnostics.
- **Capstone:** at test time, `validateFolder` builds the keys; every planted defect produces exactly its listed rule IDs, and every valid control produces no error-level diagnostic (case §3.7 test plan). The browser ships only the keys and reason texts.

---

## 9. Case study and example data

### 9.1 Story arc

Learner-facing labels use the presentation order ("Case step n of 5 · <name>"); case.md's letters stay internal.

| Case step (case §3.3 letter) | Lessons | Data | Finding | What it cannot tell |
|---|---|---|---|---|
| Vignette | L01-L03 | — | Dravet-like history; normal microarray at 2; trio exome ordered | — |
| 1 · Trio exome (A) | L04-L12, L14-L16 | FASTQ → CRAM → gVCF → joint VCF | De novo filter: DN-1 passes (SCN9A, synonymous), DN-2 fails (father GQ 12) | Small-variant route exhausted |
| 2 · Exome reanalysis (B) | L13, L16 | Depth WIG, ratio bedGraph, Mendelian check, exome CNV `<DEL>` with SVCLAIM=D | Ratio ≈ 0.50 at exons 17-20 only; exon 25 is an artefact; Mendelian error at rs2298771; balanced het at rs6432860 | Breakpoints only bracketed |
| 3 · Interpretation (E) | L17, L18 | MANE GTF/GFF3 | Exons 17-20 = 1,135 coding nt → frameshift, p.(Val806Alafs*24); NMD predicted | Needs intronic breakpoints |
| 4 · Short-read WGS (C) | L19 | BAM → BEDPE | `DEL_1` (SR=8, PE=14), side 2 inside an Alu; weak `BND_2` | The repeat blocks the exact junction |
| 5 · HiFi and graph (D) | L20, L21 | PAF, local GFA | Two-block reads; 7-bp microhomology; paternal; no inversion; deletion edge unique to the proband | — |
| Consolidation | Capstone, L22 | 15-file folder | Every file triaged; diagnosis consolidated | Parental junction PCR (not a file format) |

GTF/GFF3 is taught before BEDPE, as in the draft order. The story tells it as "what *would* losing exons 17-20 do?", then confirms it with the breakpoints (case §3.3 "Convergence").

### 9.2 Data inventory

**Case files** (case §3.5, plus F15; overrides in §9.5):

| File(s) | Format | Content | Lessons |
|---|---|---|---|
| `Homo_sapiens_assembly38.fasta` (+`.fai`, `.dict`); fixture slice `chr2:165,980,001-166,380,000` | FASTA | 3,366 sequences; chr2 242,193,529 bp, M5 `f98db672…` | L04, L05, capstone F01 |
| `P042-{proband,mother,father}_S{1,2,3}_L001_R{1,2}_001.fastq.gz` | FASTQ | Phred+33, 2×150, read names and quality bins per D-18; library totals (metadata): about 60 M pairs for the proband and the mother, about 32 M for the father | L06, L07, F02 |
| `exome_targets_GRCh38.bed`; `calling_regions_pad100.bed` | BED | `SCN1A_e4` … `SCN1A_e29` + `SCN1A_alt8_5N`; ±100-bp padding | L08, L09, F03 |
| `P042-*.cram` (+`.crai`); one `.bam` (+`.bai`); `P042-proband.SCN1A.sam` | SAM/BAM/CRAM | `@RG SM:P042-*`; reads over exons 16-21; WGS split read `96M54S` | L10-L12, L19, F04, F05, F15 |
| `P042-*.depth.wig`; `P042-trio.ratio.bedGraph` | WIG, bedGraph | fixedStep 20-bp bins over targets; dip at exons 17-20; exon 25 low in all three | L13, F06 |
| `P042-*.g.vcf.gz` (+`.tbi`) | gVCF (`VCFv4.2`, GATK) | The father's block 166,009,870-166,009,902 with GQ 12, MIN_DP 5; the proband's exon-19 block DP 59 | L15, L16, F07, F08 |
| `P042.trio.vcf.gz` (+`.tbi`) | VCF (`VCFv4.2`, GATK joint genotyping) | DN-1, DN-2, rs2298771, rs6432860 | L14, L16, F09 |
| `P042.trio.cnv.vcf.gz`; the precise SV record (case §3.6) | VCF 4.5 (a 4.5-aware caller) | exome `<DEL>` with SVCLAIM=D; the HiFi-precise `<DEL>` with SVCLAIM=DJ | L16, L19 |
| `SCN1A_SCN9A.MANE.gtf`; `SCN1A.MANE.gff3` | GTF, GFF3 | GENCODE v43 lines, MANE transcripts only | L17, L18, F11, F12 |
| `P042-proband.sv.bedpe` | BEDPE | `DEL_1` `chr2 166014891 166014919 chr2 166039935 166040217 DEL_1 87 + - DEL SR=8;PE=14`; `BND_2` | L19, F10 |
| `P042-proband.hifi.paf`; `P042-proband.hifi.bam` | PAF, SAM | Split reads (2 lines) vs reference-like reads (1 line) | L20, F13 |
| `P042_locus.gfa` (GFA 1.1 with W lines); `P042_locus.rgfa` | GFA | Deletion bubble plus 2 SNP bubbles; illustrative panel | L21, F14 |

**Toy and drill fixtures** (all from the notes):

| Fixture | Content | Source | Lessons |
|---|---|---|---|
| `toy/ref.fa` | The 45-bp `ref` from the SAMv1 §1.1 example | SAMv1 | L03, L10-L12 |
| `toy/toy.fa` | `chrM_demo` (first 60 bp of GRCh38 chrM), `chr1_tel` (chr1:10001-10036, soft-masked) | seq §3.1 | L04, L05, L07, L12.3 |
| `toy/chrM_R1R2.fastq` | R1 = chrM:1-36; R2 = reverse complement of chrM:115-150 | seq §3.3 | L06 |
| `toy/demo_genes.gff3`, `.gtf` | DEMO1 (+ strand), DEMO2 (− strand) | ann §3.2-§3.3, EX-09 | L17, L18, Q6.5 |
| `toy/bed12.bed` | UCSC `cloneA`; `txA` with absolute blockStarts | int §3.1, E5 | L09 |
| `toy/gfa_spec.gfa`, `toy/pangenome_toy.gfa` | GFA1 spec example; 36-bp blunt toy with W lines | gph §3.5, §3.6 | L21, Q7.5 |
| `toy/toy40k.paf` | Three-piece inversion read, re-run with minimap2 2.31 on the random 40-kb contig, unshifted, target named `toy40k` (D-14) | gph EX-02 to EX-05 | L20, Q7.3 |
| `toy/vcf_drills.vcf` | Real chr2 bases for normalization drills (166,009,974-984 `TTTAAAAAATT`) | var EX-03 | L22.3 preset |
| `binary/*.b64` + `*.view.json` + `MANIFEST.json` | BAM, CRAM 3.0/3.1, plain gzip, BGZF, `.bai`, `.csi`, `.crai`, `.tbi` bytes, decoded views and full decoded texts, from the fixture builder; the manifest records the SHA-256 of each text input | aln EX-11; seq EX-05 item 8 | L05, L07, L12, quizzes, capstone |

### 9.3 Generation strategy

Hybrid data (case §3.7; D-19): a real GRCh38 slice with real GENCODE models for the case, and tiny synthetic or real toy contigs for concept drills.

1. **`scripts/fetch-fixtures.ts`** is manual and needs the network. It writes:
   - `fixtures/grch38/chr2_165980001-166380000.fa`, header `>chr2:165980001-166380000`. Fetch by HTTP Range from the public Broad bucket using the `.fai` formula; MD5s `d0418b8e69260dafd2133fc10e22f977` (165,980,001-166,150,000) and `aba6f448e834f5ca6eb8e5464bbb5fdd` (166,150,001-166,380,000).
   - `fixtures/gencode/v43.SCN1A_SCN9A.MANE.gtf`.
   - `fixtures/dbsnp/sites.tsv`.
   - `fixtures/PROVENANCE.md`: URLs, byte ranges, checksums, date.

   It **fails if any checksum differs**.
2. **`scripts/generate-case.ts`** (`vpr gen:case`) is offline and deterministic, with a seeded PRNG (`sfc32("P042")`):
   1. `truth.ts`: six haplotypes as edit lists over the slice (case §3.2).
   2. Read simulators: exome fragments over targets ±200 bp, WGS pairs, HiFi reads. Only reads at the locus are simulated; library totals are metadata (D-18 names and bins; the father's library is about half the size of the others). The FASTQ records that M1 shipped and the owner signed off are pinned: the generator emits them verbatim, and a test checks it.
   3. Alignment **by construction**, so CIGAR, `SA` and `NM` are exact. MAPQ follows rules: segments < 70 bp inside an Alu get MAPQ 0.
   4. Callers:
      - depth → WIG/bedGraph;
      - binomial genotype likelihoods → PL/GQ;
      - GQ-banded gVCF blocks (headers `VCFv4.2`);
      - merge → joint VCF (`VCFv4.2`);
      - evidence clustering → BEDPE;
      - HiFi placement → PAF;
      - haplotype walks → GFA.
   5. **Re-keying of research exercises:** int E3, E4, E9; aln EX-04 (case row), EX-13; var EX-01, EX-05, EX-07, EX-11; gph EX-07. Each is rebuilt on case coordinates with the same rule and answer logic, and content tests recompute its key. Quiz items are never re-keyed to case coordinates; they use fresh or toy data (§6.1).
   6. `defects.ts` writes the capstone copies and `defects.json` (file, rule IDs, line or byte range, `foreshadowed` flag).
   7. **Output:** TS modules under `src/case/generated/` (embedded case data ≤ 300 KB: F01 as head and tail plus its `.fai`, and a compact table of the reference bases that REF and rank-0 segment checks need) and the capstone folder as an in-page virtual folder. Generated modules are committed; CI re-runs the generator and fails on any diff.
3. **`scripts/fixtures/`** is the fixture builder (D-32): a container image pinned by digest, with samtools/htslib/bcftools 1.24, a pinned bedtools release (recorded at M2; the notes read bedtools master on 2026-10-16), minimap2 2.31-r1302 and gfatools 0.5-r296. It builds every binary fixture (D-20) and `toy40k.paf`, writes decoded views and full decoded texts, and records in `fixtures/binary/MANIFEST.json` the SHA-256 of each text input it read. A blocking content test recomputes those hashes from the current generated modules and fails with "rebuild the binary fixtures" on any mismatch. It runs locally (`vpr fixtures:build`) or from the manual `fixtures.yml` workflow.
4. **`scripts/oracle/`** is the weekly, non-blocking cross-check (D-32): the same image runs the real tools over every snippet and reports disagreements with our validators as a summary, which supplies "Tools say" notes.

### 9.4 Consistency guarantees (tests in `tests/case.test.ts`)

- **Cross-file rules:** CASE-01 to CASE-14 run on the generated folder. They are violated **only** in the planted files: CASE-01 (F09), CASE-02 (F05), CASE-09 (F08), CASE-11 (F12), CASE-12 (F14), CASE-13 (F13) and CASE-14 (F02); CASE-03 now passes on the valid F03. Each planted defect fails with exactly its rule IDs, including the format rules BEDPE-S05 (F10), PAF-M02 (F13) and SAM-S13 (F15). This supersedes case §5b's status column for F03, F04, F10, F13 and F14 (§9.5).
- **REF bases:** every VCF/gVCF REF and every rank-0 GFA segment except the planted F14 segment matches the FASTA slice (CASE-05, CASE-12). In the oracle cross-check, `bcftools norm --check-ref e` confirms this.
- **Breakpoints agree everywhere** (CASE-07): VCF POS + CIPOS lies inside BEDPE window 1; END lies inside window 2; PAF tend/tstart and the GFA `SO`s match. All 8 placements are accepted. F10's defect is on the `BND_2` line, so CASE-07 still passes.
- **Arithmetic invariants:**
  - deletion 25,213 bp;
  - exons 17-20 sum to 1,135;
  - phase chain per CASE-11, using the CDS-segment length (not the exon length; they differ in exons 4 and 29);
  - PAF NM = col 11 − col 10;
  - W-line lengths 2,239 and 27,452.
- **Determinism:** snapshot tests; the fetch step checks MD5s; the binary manifest hashes match (§9.3).
- **Placeholders gone:** a grep test fails if retired placeholder coordinates (`166012370`, `166012738`, `166009959`, `166013500`, `166015900`) or retired names (`LH00417`, `SCN1A_e5N`) appear in content or generated modules outside explicitly labelled toy fixtures.

### 9.5 Reconciliation with the research notes

| Note | Placeholder or claim | Course uses |
|---|---|---|
| int, aln | Targets T1-T4 / T3 (illustrative, intronic in reality) | Exon-named targets `SCN1A_e16`…`e21`; dipped targets e17-e20 (case §10.2) |
| int, var, gph | 368-bp `DEL_1` at 166,012,370-166,012,738 | 25,213-bp deletion: VCF POS 166,014,902; BEDPE per case §3.5/§3.6 |
| var | De novo SNV at chr2:166,009,959 | DN-2 = chr2:166,009,887 C>T (fails on parental GQ); DN-1 = SCN9A chr2:166,204,022 G>A |
| var | Child "hemizygous `1/1`" | Hemizygous `0/0` at rs2298771, father `1/1` |
| gph | Maternal deletion on an inversion haplotype; parental long reads | Paternal origin; no inversion; proband-only HiFi; inversion mechanics on `toy40k` (D-14) |
| ann | "Make the dipped exon's length not divisible by 3" | 1,135 nt over 4 exons; contrast with exons 17-19, which are in-frame |
| seq vs case | NovaSeq 6000 vs NovaSeq X style headers; case.md's `LH00417:42:22GTW5LT3:…` names with NovaSeq 6000 bins | `A00123:8:H7KJ2DSXY:…` names with `# , : F` bins (D-18) |
| case §3.5 | `SCN1A_e5N` target name | `SCN1A_alt8_5N`; CASE-03's skip rule names it (D-19) |
| case §3.5 | "about 60 M pairs each" | Father about 32 M pairs, consistent with his 63× depth (§9.2) |
| case §4 | BEDPE windows "mirror `svtools vcftobedpe`" | Course convention; svtools starts one base later (D-13; V-22 closed) |
| case §3.5 | Trio VCF declared VCF 4.5 (implied) | GATK-written files declare `VCFv4.2`; the CNV VCF and the precise SV record declare 4.5 (D-12) |
| case §5a/§5b | 14-file folder without SAM; F03, F04, F10, F13, F14 defects; F08 "invalid as `.gz`" | 15 files with a balanced key (§6.2): F03 and F04 are valid controls; F10, F13 and F14 are re-planted; F08 is "valid but unusable here" (D-08) |
| var, ux | Child's sex (PED code 1; "son" glyph) | Female, PED code 2; glyph is a circle (D-17) |

### 9.6 Ethics note (shown on the first case page, L01, and recapped in L22)

- Noa and her family are **fictional**.
- Genes, the reference genome, the annotation and the named SNPs (rs2298771, rs6432860 and, in a Read-more, rs3812718) are real public data.
- The deletion, the de novo SNV and all genotypes are **invented for teaching**. Any resemblance to a reported patient variant is coincidental. Do not submit them to databases.
- Nothing is clinical advice. Drug and counselling remarks are narrative ("the clinical team…").
- **Avoid:**
  - real lab, hospital or vendor names;
  - a vaccine as the first-seizure trigger;
  - misattributed-parentage plot twists (one Read-more may mention consent policies);
  - deficit-first language.
- Use "absent from dbSNP build 138", never "novel" (V-31).
- No flashing or rapid animation anywhere, given the seizure storyline (WCAG 2.3.1).

---

## 10. UX and visual design (summary of ux-design.md, with this plan's adjustments)

**Reference and limits.** The layout is inspired by the reference course pages the owner supplied (screenshots measured with Pillow; the live pages were unreachable). We borrow generic documentation patterns: breadcrumb, serif H1, meta pills, READ MORE cards, "Try it" H2s, Recap, a lesson switcher with an outline, and a TOC with an active bar. We use none of that brand's names, logos, fonts, accent colour, illustrations or copy (ux §1.3). `check-dist` rejects the reference brand's names and domain in the built file (a case-insensitive denylist in `scripts/brand-denylist.txt`). The research notes, which name the brand and its measured geometry, stay in the public tree as they are: the owner is fine with `docs/research/ux-design.md` naming the course whose design inspired this one (OQ-9). The shipped course still uses none of that brand's names, logos, fonts or assets (O-08), and the denylist stays.

### 10.1 Layout

| Breakpoint | Layout |
|---|---|
| ≥ 1280px | Grid `minmax(0,44rem) clamp(3rem,10vw,14rem) 18rem`, container max 1280px; sticky aside (`top: 24px`) |
| 1080-1279px | `minmax(0,44rem) 3rem 16rem` |
| < 1080px | A single column of at most 44rem, with a sticky 48px top bar. The bar opens a modal sheet with two tabs: "On this page" and "Course outline" |

- The page never scrolls horizontally; snippets and tables scroll inside their own regions.
- **Capstone wide mode.** The aside column is dropped: the switcher card and the theme control sit in a header row above the panes, and the container grows to 72rem plus gutters. The two-pane inspector switches on with a container query on the content zone (≥ 960 px), not on the viewport width.
- **Lesson page order:** skip link (scripted, §11.3); breadcrumb `← Genomic File Formats / <Section>`; H1 (serif); pills (`Lesson 9`, `9 min`, `0 of 3 exercises` changing to `Completed`; optional practice is not counted); intro; H2 sections with interactions; Recap; status line; prev/next cards.
- **Aside, per route:**
  - lessons: the switcher card ("Lesson 9 of 22 · Alignments" over the title, a chevron, and a 2px course-progress bar over the 30 items), then the H2 TOC with scroll-spy and a 2px active bar, then the theme control;
  - quizzes: the switcher, then a TOC of "Question 1" … "Question 6" and "Results" whose status icons mirror the progress strip, then the theme control;
  - capstone: the switcher and the theme control in the wide-mode header row;
  - home, badge and About: the switcher and the theme control.
- **Expanded outline:** sections, each with lesson rows carrying status icons; the quiz row with a "Passed" pill; "Capstone and conclusion" with the capstone and L22; Completion badge (locked until earned).
- **Coarse pointers:** inputs, selects, textareas and the fix-it editor are at least 16px; the viewport meta never sets `maximum-scale` (V-41).

### 10.2 Typography

- **Source Serif 4 500:** H1 42/46 (34 on phones) and H2 28/35.
- **Public Sans Variable:** body 18/30 (17/27 on phones), UI 15/22 (16 for form controls on coarse pointers), H3 20/27 at weight 600.
- **IBM Plex Mono 400/600:** code 14.5/23, snippets 14/22; interactive snippet modes use a line height of at least 26px (§7.8).
- **Embedding:** latin subset only, as 5 woff2 data URIs: 104.5 KB raw, 139.3 KB base64, 105.4 KB gzip. Use hand-written `@font-face` rules; never import the package CSS, which would inline more than 490 KB. The fonts ship under OFL-1.1, with notices in `LICENSES/` and on `#/about` (OQ-8, option a).
- **Mono settings:** `font-variant-ligatures: none`.
- **Glyphs:** the latin subsets lack ✓, ✗, →, ≤, ≥, ≈ and Unicode superscripts, so UI marks are SVG icons and exponents use `<sup>` (§12.6).
- **Gene symbols** are italic in prose (V-32).

### 10.3 Key tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | #F9F8F5 | #1A1917 |
| `--surface` | #FDFCFA | #201F1C |
| `--raised` | #FFFFFF | #252421 |
| `--sunken` | #F0EEE8 | #2E2C28 |
| `--border` / `--border-strong` | #E2DED6 / #8A857B | #3B3934 / #7A756C |
| `--text` / `--text-body` / `--text-muted` | #1C1B19 / #45433E / #68645C | #F2F0EB / #D5D2CA / #A29E95 |
| `--accent` / `--accent-hover` / `--accent-subtle` | #0B6B66 / #085551 / #E2F0EE | #5EC4BA / #80D4CB / #163330 |
| `--success` / `--error` / `--warning` / `--info` | #1D7A3E / #B3261E / #8A5200 / #2B5AA8 | #63C985 / #F28B80 / #E6B45E / #8AB4F8 |
| `--case-bg` / `--case-border` | #F5EFE3 / #D9CBB0 | #2A251C / #4D4332 |

- **Contrast.** Every base text pair passes WCAG AA; control boundaries pass 3:1 (ux §6). Exercise states, tints and the dark theme are checked by axe in e2e (§11.6), not only by the token tables.
- **Field tints** f1-f8 are always paired with a non-colour cue. Base colours are an opt-in toggle.
- **Theme mechanics.** Tokens live on `:root`. Dark values apply under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and again under `:root[data-theme="dark"]`. A no-flash inline script reads `genomic-file-formats:theme` inside try/catch. The toggle is three-way: System / Light / Dark.
- **Forced colours** use outlines and icons.

### 10.4 Components, motion, progress and print

- **Components:** see §7 and ux §7-§9.
- **Motion:** 120/200/320 ms tokens; reduced motion removes transforms; nothing autoplays; nothing flashes.
- **Progress UI** (ux §12.4):
  - lesson pills and the status line, whose links to remaining exercises use stable exercise ids (§11.3);
  - outline icons;
  - home page: "Continue: Lesson N", an overall count ("12 of 30 items · 4 of 7 quizzes passed") and the pipeline map with mastered nodes;
  - a notice when storage is unavailable, with "Copy progress code";
  - home and About offer "Copy/Paste progress code" (the one transfer mechanism; import merges by default, D-36) and "Download progress (.json)" for a full-state export.
- **Print** (ux §15):
  - light tokens; the aside and toolbars hidden; READ MORE forced open;
  - snippets wrap with continuation markers;
  - exercises print without answers unless already completed; simulators print their text views;
  - the badge prints as a one-page landscape certificate.

### 10.5 Adjustments this plan makes to ux-design.md

- **Pedigree glyph:** female proband, so a filled circle with the arrow. Accessible label: "Trio: father and mother unaffected; daughter, the proband, affected" (D-17).
- **Counts:** "7 quizzes"; course progress over 30 items; quiz pills "6 questions", "about 8 min" and "Pass mark 5 of 6"; capstone "about 35 min".
- **Capstone:** 15 files with a balanced key; the format select lists 14 formats plus "index or companion" and "other"; three verdicts (D-08); the ending's only primary call to action is "Next: Closing the case", and the badge call to action moves to the end of L22 (ux §9.3 named the badge as the final call to action).
- **Quizzes:** one "Submit quiz" button and explanations after submission (D-30), replacing ux §9.1's per-card Check.
- **Headings:** Quick-check H3s use the exercise title; the "QUICK CHECK · TYPE" label is a non-heading overline.
- **Status marks:** Lucide icons, never text glyphs (§7).
- **Settled questions:** fix-it editor = textarea overlay (D-26); Download is offered for text and decompressed copies (D-27). The owner confirmed the teal accent and Public Sans (OQ-5) and the license scope: fonts under OFL-1.1 and icons under ISC, with notices (OQ-8, option a).

### 10.6 Accessibility (WCAG 2.2 AA)

The ux §16 checklist is the acceptance list for M8. The critical items:
- keyboard alternatives for every drag (2.5.7), and a "Place in…" select on narrow screens;
- an escapable Tab key in fix-it (2.1.2);
- feedback announced once: focus to the verdict, live regions only where focus stays (4.1.3);
- focus never hidden under the sticky bar (2.4.11);
- targets ≥ 24 × 24px, including field cells inside snippets (2.5.8; §7.1, §7.8);
- per-line descriptions so that length and whitespace defects can be found without sight (1.3.1);
- a text view for every simulator, which also reaches every goal from the keyboard (1.1.1, 2.1.1);
- descriptive, unique headings (2.4.6);
- a scripted skip link that works over `file://` (2.4.1);
- no flashing (2.3.1);
- "View as table" for every tabular snippet;
- `forced-colors` and `prefers-reduced-motion` support;
- static fallback text when scripts do not run (D-28).

---

## 11. Technical architecture

### 11.1 Authoring model (D-21; tech §5-§7)

**Content files.** Lessons live in `content/lessons/<NN-section>/<NN-slug>.md`; quizzes, the capstone and the home and About pages use the same compiler, distinguished by a `kind` field. The compiler (`plugins/lesson-compiler.ts`) runs: unified → remark-parse → remark-frontmatter → remark-gfm → remark-directive → source-comment stripper → raw-HTML check → directive mapper → link rewriter → remark-rehype → heading ids/TOC → image collector → rehype-stringify.

**Loading exercise data.** The Vite plugin `plugins/vite-plugin-lessons.ts` loads the exercise, quiz and snippet registries through Vite's module graph: `server.ssrLoadModule()` in dev, so that editing or adding any imported module invalidates the registry without a restart, and a fresh module runner per build (confirm the Vite 8 API in M0, V-44). The fallback, if that proves fragile, is a static scan of `src/exercises/**`, `src/quizzes/**` and `src/case/generated/**` for `id:` literals, with `addWatchFile` on each file. The registry is never imported from `vite.config.ts` (tech gotcha 7). Node's own ESM cache is not used to reload modules: it keeps child modules even when the parent is re-imported with a cache-busting query. `tsconfig.json` sets `verbatimModuleSyntax`, `erasableSyntaxOnly` and `allowImportingTsExtensions` (with `noEmit`), so `vp check` rejects what a strip-only loader would reject (type imports without `type`, enums, extensionless imports).

**Frontmatter** (validated at build time, with a schema per `kind`):

```yaml
kind: lesson                   # lesson | quiz | capstone | page
id: fasta-reference            # stable slug: routes and progress keys
section: sequences
title: "FASTA: the reference everyone is compared against"
minutes: 9
objectives: [LO1, LO2, LO7]
introduces: [fasta.record, fasta.soft-masking, ref.analysis-set]
requires: [seq.alphabet, seq.reverse-complement, validity.verdicts, coords.region-strings]
caseBeat: "1 · Trio exome · the reference"
specs: ["faidx(5) htslib 1.24", "SAMv1 v1.6 §1.2.1, §1.3.2"]
```

- Lesson rules (`caseBeat`, minutes 8-12, a TOC ending in "Recap") apply only to `kind: lesson`. Quizzes route as `#/quiz/<section>`, the capstone as `#/capstone`; pages are exempt from lesson lints.
- There is no `number` field: the folder and file prefixes set the order, and the shell numbers lessons from it.

**Directives.**
- **Leaf directives:** `::spot-the-error{exercise="…"}`, `::fix-it{…}`, `::sort{…}`, `::field-explorer{…}`, `::predict{…}`, `::mcq{…}`, `::simulator{exercise="…"}` (simulators have exercise data because they have goals), `::quiz{section="…"}`, `::pipeline-map`, `::snippet{id="…"}`. Quiz and snippet ids resolve against the same registry as exercises.
- **Container directives:** `:::read-more{title}`, `:::spec-detail{title}`, `:::why-it-matters{title}`, `:::case-file{step}`, `:::note`, `:::tip`, `:::watch-out`, `:::from-the-spec{cite}`, `:::recap`, `:::at-a-glance{format}`, `:::unverified{ref="V-06"}`. The last is allowed in dev builds; tag builds fail if any remain (§12.3). Exercises inside `:::read-more` are marked `optional`.
- **Text directives:** none. The compiler restores them to literal text, which covers `:c` in HGVS, `:chr17`, coordinates (`chr2:166,014,902`, parsed as a directive named `166`), tags (`SA:Z:chr2,…`) and FORMAT strings (`GT:AD:DP:GQ:PL`). Compiler tests round-trip each of these, plus `<DEL>`, `<INV>` and `<!-- src: … -->`, to exactly the original text or the documented error.
- **"Try it" vs "Quick check":** the author writes the `## Try it: …` heading in Markdown and puts the directive under it. A directive without its own heading renders as a Quick check whose H3 text is the exercise title.
- **Raw HTML** in Markdown fails the build (tech gotcha 11), except `<!-- src: … -->` source comments, which are stripped and collected into the fact-check report. The error says: "Raw HTML is not allowed. If this is a genomic token such as `<DEL>`, wrap it in backticks."
- **Links.** The compiler rewrites `[text](#id)` to `#/lesson/<this-lesson>/<id>` and fails on any `#/…` link that does not resolve against the compiled heading and exercise ids.

**Exercise data** lives in `src/exercises/<lesson-id>.ts`, one exported const per exercise using `satisfies`, registered by id in `src/exercises/registry.ts`. These modules are pure TS: no Vite-only imports. Quizzes live in `src/quizzes/<section>.ts`. Generated case snippets live in `src/case/generated/`. The course manifest is `content/course.ts` (D-37), and the verification register is data in `content/verification.ts` (§12.3).

**Widgets** are custom elements in light DOM (no shadow DOM, so the theme tokens apply). They are vanilla TS for simple widgets and Preact islands for simulators and stateful widgets; each simulator has a pure `model.ts` and a `view.tsx`. JSX goes through Vite 8's Oxc transform via `jsxImportSource: "preact"`, with no Babel.

### 11.2 Repository layout

```
genomic-file-formats/
├─ .github/workflows/{ci.yml, release.yml, fixtures.yml, oracle.yml}
├─ .gitattributes                     # * text=auto eol=lf; fixtures/** -text; *.b64 -text; src/case/generated/** -text
├─ .editorconfig                      # LF; never trims whitespace in fixtures/ or generated modules
├─ .node-version                      # 22.22.0 (exact; mirrored in devEngines)
├─ package.json                       # "vite-plus": "catalog:"; devEngines pnpm 12.14.0, node 22.22.0; scripts dev/check/test/build/e2e/gen:case/fixtures:build
├─ pnpm-workspace.yaml                # catalog vite-plus 1.3.0; savePrefix ""; minimumReleaseAge + minimumReleaseAgeExclude (D-31)
├─ vite.config.ts  playwright.config.ts  tsconfig.json
├─ index.html                         # data-URI favicon, no-flash theme script, static fallback + <noscript> (D-28)
├─ content/
│  ├─ course.ts                       # manifest: planned/built pages, concept introducers (D-37)
│  ├─ verification.ts                 # the V-register as data (§12.3)
│  ├─ lessons/
│  │  ├─ 01-foundations/{01-from-blood-to-diagnosis.md, 02-genome-as-text.md, 03-coordinates.md, 99-quiz.md}
│  │  ├─ 02-sequences/{04-fasta-reference.md, 05-random-access.md, 06-fastq-reads.md, 07-fastq-in-the-wild.md, 99-quiz.md}
│  │  ├─ 03-regions/{08-bed-targets.md, 09-bed-in-practice.md, 99-quiz.md}
│  │  ├─ 04-alignments/{10-alignment-primer.md, 11-sam-records.md, 12-bam-cram.md, 99-quiz.md}
│  │  ├─ 05-coverage-and-variants/{13-wig-coverage.md, 14-vcf-records.md, 15-gvcf-blocks.md, 16-de-novo-search.md, 99-quiz.md}
│  │  ├─ 06-annotation/{17-gene-models.md, 18-frame-and-phase.md, 99-quiz.md}
│  │  ├─ 07-sv-and-graphs/{19-bedpe-breakpoints.md, 20-paf-long-reads.md, 21-gfa-graphs.md, 99-quiz.md}
│  │  └─ 08-capstone-and-conclusion/{00-capstone.md, 22-closing-the-case.md}
│  ├─ home.md  about.md
│  └─ figures/                        # inline-SVG sources (theme-aware)
├─ plugins/{lesson-compiler.ts, vite-plugin-lessons.ts}
├─ src/
│  ├─ main.ts
│  ├─ shell/        # router, progress (merge), storage, lessons glob, toc/scroll-spy, outline, theme, copy, home, about, badge (+ SVG exporter)
│  ├─ widgets/      # spot-the-error, fix-it, sort, field-explorer, predict, mcq, quiz, capstone, snippet-viewer, hex-viewer
│  │  └─ simulators/  # the 12 simulators in §7.5: <id>/model.ts (pure) + <id>/view.tsx
│  ├─ exercises/    # types.ts, registry.ts, <lesson-id>.ts
│  ├─ quizzes/      # <section>.ts (with generators for parametric slots)
│  ├─ formats/      # shared tokenizers and schemas (field names) used by validators and viewers
│  ├─ validators/   # one file per format + folder.ts (CASE/XF); runtime/ (fix-it rules only) vs test-only rule modules; *.test.ts
│  ├─ case/generated/  # committed output of gen:case
│  └─ styles/       # tokens.css, fonts.css (5 latin @font-face), prose.css, widgets.css, print.css
├─ fixtures/{grch38/, gencode/, dbsnp/, toy/, binary/ (with MANIFEST.json), PROVENANCE.md}
├─ scripts/{fetch-fixtures.ts, generate-case.ts, check-dist.mjs, minutes-lint.ts, brand-denylist.txt, fixtures/, oracle/}
├─ tests/{content.test.ts, case.test.ts, coverage.test.ts, e2e/course.spec.ts}
├─ LICENSE (MIT)  LICENSES/{OFL-1.1.txt, ISC-lucide.txt}  DATA-SOURCES.md (attribution and terms for the GRCh38, GENCODE v43 and dbSNP138 extracts; OQ-7 approved, V-05)
└─ docs/{PLAN.md, CONTRIBUTING.md, research/ (public, kept as written; OQ-9)}
```

**`pnpm-workspace.yaml`** (sketch; the platform-package scope names are confirmed from the lockfile in M0, and pattern support in pnpm 12 is V-42):

```yaml
catalog:
  vite-plus: 1.3.0
savePrefix: ""
minimumReleaseAge: 20160            # 14 days, in minutes
minimumReleaseAgeExclude:           # owner-pinned toolchain and its exact-pinned closure (D-31)
  - vite-plus
  - "@voidzero-dev/*"
  - vitest
  - "@vitest/*"
  - oxlint
  - "@oxlint/*"
  - oxlint-tsgolint
  - "@oxlint-tsgolint/*"
  - oxfmt
  - "@oxfmt/*"
  - "@oxc-project/*"
  - vite-plugin-singlefile
  - yuku-parser                     # vite-plus-core pins yuku-parser =0.19.0 (M0, V-42)
  - yuku-core
  - "@yuku-core/*"
  - "@yuku-toolchain/*"
  - postcss@8.5.29                  # version-only entries: range floors under 14 days old at M0
  - magic-string@1.4.3
  - tinybench@6.2.2
```

**Exact bytes.** `.gitattributes` keeps a Windows checkout from rewriting fixtures and generated modules. Snippets are TypeScript strings, and ECMAScript normalizes a literal CR or CRLF in a template literal to LF, so authors and the generator write TAB and CR as `\t` and `\r` escapes. A lint rejects a raw U+000D anywhere in `src/**`, and a DOM test checks that the snippet viewer shows CR chips for a known CRLF snippet.

### 11.3 Routing

- **Hash routes** (D-22): `#/`, `#/lesson/<slug>`, `#/lesson/<slug>/<heading-id>`, `#/lesson/<slug>/<exercise-id>`, `#/quiz/<section>`, `#/capstone`, `#/badge`, `#/about`; any other `#/…` renders "Not found" with the outline. `history.pushState` to another path throws on `file://` (tech §8).
- **Skip link and in-page jumps.** The skip link is scripted: it focuses `<main tabindex="-1">` and calls `preventDefault`, so it never changes the hash. Every exercise card has a stable DOM id derived from its exercise id (`/` replaced by `--`); status-line links and "Review:" links use `#/lesson/<slug>/<exercise-id>`.
- **Links:** navigation uses plain `<a href="#/…">`, so Back and Forward work. TOC clicks call `scrollIntoView` and then `history.replaceState`. Bare `#heading` anchors never reach the output; the compiler rewrites them (§11.1).
- **Route change:** render; set `document.title` (`<Page> · Lesson N · Genomic File Formats`); scroll; move focus to the H1 or the target H2 or exercise; rebuild the scroll-spy `IntersectionObserver`.

### 11.4 State and progress persistence

- **Keys** (D-23): `genomic-file-formats:v1:progress` holds JSON in the ux §12.1 schema: `schema`, `updatedAt`, lessons with per-exercise `{state, attempts, firstTry, revealed, answer}`, quizzes, capstone, badge and prefs other than the theme. `genomic-file-formats:theme` holds the theme.
- **Probe:** at boot, write and read back a test key inside try/catch.
- **Writes are merges** (D-36). Every access is in try/catch. Flushes are debounced at 300 ms, and each one reads the stored JSON, merges it with memory and writes the result. Unknown keys are preserved verbatim, so an older or newer copy sharing Chromium's `file://` store cannot erase them. Merge rules are monotonic: correct and revealed never revert; attempts and best score take the maximum; `passedAt` and `earnedAt` take the earliest. The `storage` listener merges incoming state the same way. A schema bump runs a migration or resets with a notice.
- **Fallback:** keep state in memory; show the notice; the footer reads "Progress not saved"; offer the progress code; link to the Pages URL (D-29).
- **Progress code** (D-23): a compact projection without answers, compressed with `CompressionStream("deflate-raw")` where available and left uncompressed otherwise (V-40), base64url, with a version prefix that also says whether it is compressed, and a CRC-32 checksum. Import validates the checksum, then merges; "replace" is an explicit choice. A test asserts that a fully completed course encodes to a few kilobytes at most.
- **Full export:** "Download progress (.json)" writes the whole state, answers included. There is no `.json` upload in v1; the code is the one transfer mechanism.
- **Derived values:** lesson complete = every non-optional exercise correct or revealed; badge per D-10.

### 11.5 Build

- **`vite.config.ts`** (tech §7.1): `base: "./"`; `define: { __COURSE_VERSION__, __PAGES_URL__ }` (the Pages URL comes from the repository owner and name in CI); `build.modulePreload.polyfill: false`; plugins `lessons({ registry })` then `viteSingleFile()`; `test.include` for `*.test.ts`; fmt and lint as in tech §7.1, with type-aware lint.
- **`index.html` fallback** (D-28): inside `<main>`, the course title, a one-line description, and "This interactive course needs JavaScript. Save the file and open it in a desktop browser, or use <Pages URL>." A `<noscript>` copy repeats it. The shell replaces the block at boot.
- **Fonts:** a hand-written `fonts.css` with 5 latin woff2 files. The bare specifier `url("@fontsource-variable/…woff2")` resolves and inlines (verified in tech §4.1). They stay, under OFL-1.1 (OQ-8, option a).
- **Case data:** F01 is embedded as head and tail plus its `.fai`; the reference bases that REF and rank-0 segment checks need are a compact position → base table; capstone keys and reason texts are embedded, validators and the FASTA slice are not (§6.2, §8.2).
- **Output:** exactly one `dist/index.html`. `scripts/check-dist.mjs` asserts:
  - one file;
  - no `<script src>`, no stylesheet `<link>`, no non-`data:` `url()`, `src` or `href` in markup (except external spec links in `<a>`);
  - exactly 5 `data:font/woff2` URIs;
  - the static fallback text and the Pages URL are present in the raw HTML;
  - no match for the brand denylist (case-insensitive);
  - no test-only validator message (§8.2);
  - size ≤ **1.5 MB raw**, with a per-category report: fonts, lesson HTML, exercise and quiz data, case data, runtime validators, app JS and CSS. Planning budgets (warnings, not failures): fonts 140 KB, lessons 350 KB, exercises and quizzes 250 KB, case data 300 KB, runtime validators 60 KB, app JS and CSS 250 KB (about 1.35 MB). The measured M1 baseline replaces these estimates.

### 11.6 Test strategy

| Layer | Runner | Asserts |
|---|---|---|
| Validator unit tests | `vp test` (node) | Every rule ID used by content (§8.2) has at least one passing and one failing fixture taken from the notes' "minimal violation" column; exact line and column; edge cases (CRLF, missing final newline, empty input, BOM); no cascades. CI prints the rule-usage report |
| **Content tests** | `vp test` (node, real compiler) | See the list below |
| Case tests | `vp test` | §9.4, including the binary-fixture manifest hashes |
| Simulator model tests | `vp test` (node) | Each goal's witness reaches it from `init`; `init` alone does not (§7.5) |
| Widget DOM tests | `vp test` with happy-dom | Right and wrong interactions; the keyboard path for sort, spot, fix-it and every simulator goal; `gf:solved` fires exactly once; an unknown id renders a visible error; the reveal policy; merge rules (D-36); line descriptions tell defective lines apart; CR chips |
| E2E on the built file | Playwright (chromium, firefox, webkit) over `pathToFileURL("dist/index.html")` | See the list below |
| Dist check | `node scripts/check-dist.mjs dist` | §11.5 |
| Oracle cross-check (weekly, non-blocking, D-32) | `oracle.yml`, pinned image | Real tools on every snippet: `samtools quickcheck`/`view`, `bcftools view`/`norm --check-ref e`, `bedtools`, `gfatools stat`, `minimap2 -x map-hifi`. Disagreements with our validators are reported as a summary |

**Content tests:**
- Every content file compiles under its `kind`; ids are unique; every directive (including `::quiz` and `::snippet`) resolves; no orphan exercises; every internal link resolves; heading texts are unique within a lesson.
- Raw-HTML and text-directive round trips: `<DEL>`, `<INV>`, `<!-- src: … -->`, `chr2:166,014,902`, `SA:Z:chr2,…`, `GT:AD:DP:GQ:PL` (§11.1).
- **spot-the-error:** answers ⊆ diagnostics ⊆ answers ∪ `acceptAlso`, on (line, field name, rule), within the round's severities (§7.1).
- **fix-it:** the starter fails with exactly `expectStarterRules`; the solution has zero errors in its profile and passes its goals; every profile uses runtime rules only.
- **sort and mcq with validity:** each bin or option matches `verdictOf` its diagnostics.
- **predict and quiz arithmetic:** recomputed by helpers (coordinate conversion, Phred sums, MAPQ and GQ → probability, `.fai` bytes with p 0-based, `reg2bin`, phase chain, frame by summed length, CIGAR spans, FLAG decoding, PAF arithmetic, reverse complement). `computeWith` is required for number and region items.
- **simulators:** witness replay (§7.5).
- **mcq:** a single-select has exactly one correct option; every option has an explanation.
- **Quizzes:** the composition rules of §6.1 over every variant combination; at least 2 variants per slot with identical concepts; no variant repeats a lesson exercise's snippet or stem-and-key; LO5 slots avoid the case integers; each slot's `tests` anchor exists outside a Read-more; each slot's concepts are introduced outside a Read-more in that section or an earlier one.
- **Capstone:** keys equal `validateFolder`'s results; no capstone snippet or (file, rule) pair comes from a lesson; at most 4 files are `foreshadowed`; the verdict tally is 6 / 2 / 7.
- **Coverage matrix** (§3.3) and frontmatter prerequisites, over built pages plus the manifest (D-37); the "all built" assertion switches on in M7.
- **Verification:** graded items (exercises, quiz slots, capstone keys) may list only confirmed V-ids; with `COURSE_RELEASE=1`, any `:::unverified` fails the build (§12.3).
- **Content lint:** ≤ 600 prose words per lesson outside Read-more cards (OQ-2; D-05's 8-minute floor may allow more, reported as a warning); ≤ 450 prose words between interactions; the first interaction within about 300 words or by the end of the first content H2; ≤ 300 words between the last interaction and the Recap; an interaction in every content H2 except at most one concept-primer section; in these rules an "interaction" is a graded one, so narrative openers and optional practice do not count; no Read-more card as the last block before the Recap; Read-more placement (§5); field-explorers end with a check or follow-ups; style lint per §12.6, including no emoji and none of ✓ ✗ → ≤ ≥ ≈ or Unicode superscripts in UI strings; no raw U+000D in `src/**`.
- **Minutes model** (`scripts/minutes-lint.ts`): prose words / 150, plus per-unit allowances: sort 0.2 min per item (at least 0.5); spot-the-error 0.75 per round; predict 0.5 per item; simulator 1 per goal; fix-it 1 per expected starter rule; mcq 0.75; field-explorer 1 plus its check; mini-triage 1 per file; follow-ups by their own type. Warn when the estimate differs from the frontmatter by more than 1 min; fail outside 8-12. Fail when the 22 lessons together fall outside 185-195 min, the owner's 190 ± 5 (OQ-2). Read-more text and optional exercises, including the 14 optional practice items, are excluded. The M1 micro-pilot records per-item timings and recalibrates the allowances.

**E2E:**
- No page or console errors.
- No requests besides the file and `data:` URIs.
- Every outline route renders; every lesson shows a TOC ending in "Recap"; every route shows the switcher and the theme control.
- One smoke path per component type and per simulator.
- The theme toggle with no flash.
- Progress survives a reload where storage works. Two pages in one browser context (two tabs of one copy, and in Chromium two differently named copies) never lose a correct state or a "Passed" (D-36).
- A throwing-storage init script shows the notice, and the progress code round-trips.
- Quiz submission, focus on the results heading and the "Passed" pill; badge unlock on seeded progress.
- `@axe-core/playwright` on every route, with `colorScheme` light and dark and once with `data-theme` forced each way; seeded-progress fixtures render every exercise state (incorrect, correct, revealed, selected sort cards, the expanded outline, the solution diff, hex annotations on tints) before scanning; serious or critical findings fail (V-36). One `forcedColors: "active"` smoke screenshot.
- Every `[role=gridcell]` box is at least 24 × 24 px.
- With `javaScriptEnabled: false`, the static fallback and the Pages URL are visible.
- The skip link and a status-line link work over `file://`.
- Downloads over `file://` in all three engines: a `download` event with the expected bytes for a text snippet, the progress JSON and the badge SVG (V-27); the downloaded SVG renders standalone like the in-page badge.
- The fix-it overlay geometry test (§7.2) in each engine.

### 11.7 CI/CD, GitHub Pages and Releases

- **`ci.yml`** runs on pull requests, pushes to `main`, `workflow_call` and manual dispatch:
  1. checkout; setup-vp pinned by SHA (D-31) with the node version from `.node-version` and `cache: true`; `vp install` with the frozen lockfile and the release-age gate on;
  2. `vp check`, `vp test`, then `vpr gen:case -- --check` (generated modules up to date; vite-plus 1.3.0 ships the `vpr` runner);
  3. `vp build` with `COURSE_VERSION` = tag or SHA, `__PAGES_URL__` from the repository, and `COURSE_RELEASE=1` when `github.ref_type == 'tag'`; `check-dist`;
  4. install Playwright browsers and run e2e;
  5. upload the `course-html` artifact (retention 14 days).
- **`release.yml`** runs on tags matching `v[0-9]+.[0-9]+.[0-9]+` only. It calls `ci.yml` once, so the build happens once:
  - **Release job:** downloads the artifact; writes `genomic-file-formats-vX.Y.Z.html` and its `.sha256`; runs `gh release create --verify-tag --generate-notes`.
  - **Pages job:** `actions/upload-pages-artifact` then `actions/deploy-pages` in the `github-pages` environment.
  - The Release and Pages serve the same bytes.
- **`fixtures.yml`:** manual dispatch; builds the binary fixtures in the pinned image (D-32) and opens a pull request with the results and the manifest.
- **`oracle.yml`:** weekly, and on changes to `fixtures/**` or `scripts/generate-case.ts`. Non-blocking.
- **Pins:** every action is pinned by commit SHA (tech §11.1); Renovate or Dependabot bumps them, subject to the 14-day gate (D-31). All workflows must pass `actionlint`.
- **One-time repo settings:** Pages source = "GitHub Actions"; the `github-pages` environment allows release tags (V-29).
- **Versioning:** SemVer for the course file. Content fixes are patches; new or changed exercises are minor; a progress-schema change is major, with a migration. `#/about` shows `__COURSE_VERSION__`, the spec versions (§12.2), data sources and licenses.

---

## 12. Content accuracy and review process

### 12.1 Spec citations per lesson

Each lesson's frontmatter `specs` and "From the spec" callouts cite these sources. Section numbers follow the notes, which checked them against each document's heading structure.

| Lessons | Primary sources (version) |
|---|---|
| L01, L16, L22 (narrative) | case §3.1 clinical statements, all flagged V-01; Kong et al. 2012 (V-38) |
| L02, L03 | SAMv1 v1.6 §1.2, §1.2.1, §1.3.2; BEDv1 §1.3, §1.6; GFF3 v1.26 cols 4-5; VCF 4.5 §1.6.1; PAF.md; GFA1.md W lines; UCSC wiggle.html; bedtools `human.hg19/hg38.genome`; found §3.7 (file anatomy) |
| L04, L05 | faidx(5) and samtools-faidx(1), htslib/samtools 1.24; bgzip(1); htslib `faidx.c`, `bgzf.c`; SAMv1 §4.1 (including §4.1.2, the EOF marker); tabix.tex |
| L06, L07 | SAMv1 §1.2, §1.4 (QUAL); Cock et al. 2010 supplementary README; Biopython 1.88 `QualityIO`; bwa(1); dada2 #791 (binning) |
| L08, L09 | GA4GH BEDv1 (hts-specs commit 9ddbc52, 2022-01-05) §1.3-§1.10, §3.4-§3.6, §4, §5; tabix(1); bedtools `general-usage.rst`, `merge.rst` |
| L10-L12 | SAMv1 v1.6 (hts-specs 510c107) §1-§5; SAMtags (to Sept 2024); CRAMv3 (3.0/3.1) §1, §6, §8-§12, including "The SQ:MD5 checksum is required unless the reference sequence has been embedded"; CSIv1; samtools.1 (1.24); htslib benchmarks |
| L13 | UCSC `wiggle.html`, `bedgraph.html`, `bigWig.html` (kent master mirror); kent `bwgCreate.c`; samtools-depth(1) |
| L14-L16 | VCF 4.5 (hts-specs e821e4f) §1.2-§1.6, §3, §5; VCF 4.2-4.4 change lists; GATK master source and gatk-docs (as cited in var); bcftools 1.24 manual |
| L17, L18 | GFF3 v1.26 (SO, 2020); GTF2/2.2 via AGAT `gxf.md` and UCSC `GTF.html` (V-13); GENCODE v43 GTF lines; Ensembl `gff.html` |
| L19 | bedtools `general-usage.rst`, `bedFilePE.cpp`; LUMPY `SV_Pair.cpp`; svtools `vcftobedpeconverter.py` (master, read 2026-10-16); SAMtags `SA`; VCF 4.5 §3 (CIPOS, CIEND, HOMSEQ, SVCLAIM) |
| L20, L21 | PAF.md (miniasm); minimap2(1) 2.31-r1302 and source; GFA1.md (2022-06-07); GFA2.md; rGFA.md (gfatools) |
| L22 | case §3.6, §4, §5c (computed crosswalk; HGVS placement rules); var EX-03 (normalization); HGVS strings computed (V-03) |

### 12.2 Pinned versions (shown on `#/about`)

| Specs | Tools and data |
|---|---|
| SAM/BAM v1.6; SAMtags (Sept 2024); CRAM 3.1; CSI v1; tabix; VCF 4.5 (VCF 4.2 for the GATK-written files); BEDv1 (2022-01-05); GFF3 1.26; GTF 2.2 (via AGAT and UCSC); GFA 1.0-1.2 (2022-06-07); PAF.md; rGFA/GAF | samtools/htslib/bcftools 1.24; minimap2 2.31-r1302; gfatools 0.5-r296; bedtools (the release in the fixture image, recorded at M2; the notes read bedtools master on 2026-10-16); Biopython 1.88; GATK (master source and gatk-docs as read by var on 2026-10-16); kent `wigToBigWig`/`bwgCreate.c` (master, 2026-10-16); svtools (master, 2026-10-16); GRCh38 Broad analysis set; GENCODE v43 (ENST00000674923.1, NM_001165963.4; V-04); dbSNP build 138 |

"Tools say" notes about tools outside the fixture image (Biopython, GATK, kent) are tagged "from the research notes (version …)", so the oracle summary does not report them as unchecked.

**When a spec or tool changes:** open an issue. Re-run the oracle cross-check. Diff the affected rule IDs. Update the rule texts, examples and "Tools say" notes. Release a minor version.

### 12.3 Fact-check pass (per lesson, before merge)

1. **Author.** The author writes from the notes only. Every number, rule and quotation carries an inline source comment in the Markdown source (`<!-- src: case §3.4 -->`), which the compiler strips from the output and collects into a fact-check report (§11.1).
2. **Automated checks.** Content, case, coverage and minutes tests; the oracle cross-check for snippets.
3. **Adversarial reviewer.** A second person or agent re-derives every claim from the primary sources, mirroring the research verification logs. They record corrections in the PR description.
4. **Unverified claims** are wrapped in `:::unverified{ref="V-xx"}`. They render with a subtle "to be verified" style in dev builds and **fail release builds** (`COURSE_RELEASE=1`, set in CI for tag builds). Graded content (exercises, quiz slots, capstone keys) lists the V-ids it depends on in its `verification` field; the content test fails if any of them is still open in `content/verification.ts`.
5. **Clinical review** of the narrative lessons L01, L16, L18 and L22 before v1.0 (OQ-6, still open). Until the owner names a reviewer, and in v1.0 if none is named, the V-01 to V-03 claims stay narrative-only and hedged.
6. **Errata.** Learners report errors through GitHub Issues, linked from `#/about`. Fixes ship as patch releases.

### 12.4 Verification register (claims to confirm before they ship)

| ID | Claim (where used) | Status / plan |
|---|---|---|
| V-01 | Clinical statements: Dravet mostly due to SCN1A and mostly de novo; sodium-channel blockers aggravate seizures; ClinGen haploinsufficiency score 3; NSGC 2023 first-tier testing; Marini 2009; parental mosaicism 5-13% (L01, L16, L22 narrative and Read-more) | Unreachable sources. Narrative only, until checked by the clinical reviewer (OQ-6) |
| V-02 | NMD rule of thumb, 50-55 nt (L18, L22) | Read-more and narrative only, phrased "predicted" |
| V-03 | p.(Val806Alafs*24), p.(Val806_Glu1143del), `c.2416-519_3550+704del`, `g.166014910_166040122del` (L18, L22) | Computed by case.md. Verify with VEP or Mutalyzer in M6 |
| V-04 | MANE IDs unchanged in the pinned GENCODE release (L17) | Re-check at fixture fetch |
| V-05 | Redistribution terms for GENCODE, dbSNP and GRCh38 slices; the Twist file is never committed | The owner approved shipping the extracts (OQ-7, 2026-10-16), subject to this check. Confirm the terms and record them in `DATA-SOURCES.md` before M2 merges fixtures; a restricted source falls back to synthetic sequence |
| V-06 | Illumina header field meanings, `_S1_L001_R1_001` naming, binned Q values per instrument (L06) | Field-explorer text kept generic until checked. Case read names now follow the verified NovaSeq 6000 pattern (D-18); the NovaSeq X prefix and bins are not used |
| V-07 | Cock 2010 paper details, including the Illumina 1.5+ `B` indicator (Read more L06) | Read more only; no quiz item uses it |
| V-08 | PacBio HiFi Q93 maximum; PacBio and hifiasm naming (L06 Read more; case names) | Not graded |
| V-09 | UniProt P69905 header (seq EX-05, item 2) | Item text limited to the residues confirmed by search |
| V-10 | Typical read lengths, depths, HiFi accuracy (L06, L20 prose) | Qualitative wording until confirmed |
| V-11 | GRC patches don't move coordinates; GENCODE `chr` naming; HLA names in hs38DH (L02 Read more) | Read more only |
| V-12 | interval_list layout; vendor target, covered and padded conventions (L08 Read more) | Read more only; no graded item uses interval_list |
| V-13 | GTF2.2 wording (frame `.` elsewhere; CDS inside exons; capitalization; strand set) | Validator severities follow §8.3 notes |
| V-14 | GENCODE attribute set and tag spellings; `level` meanings; UTR feature names; gzip vs BGZF downloads | Use only attributes present in the v43 fixture lines |
| V-15 | `.bai` is uncompressed | htslib source writes it uncompressed (`"wu"`; found correction 19); confirm on fixture-builder bytes. Graded items identify `.bai` by its `BAI\1` magic (SAMv1 §5.2) only |
| V-16 | `.crai` alignment start base | Not taught |
| V-17 | Which released htsjdk, GATK and Picard versions read CRAM 3.1 (L12 Read more) | Phrase as "check your tool's version" |
| V-18 | BAM-C02: which header copy wins | Not taught as fact |
| V-19 | GATK contig-order and contig-length rejection (L02, L14) | Phrase as "dictionary-checking tools such as GATK may reject" |
| V-20 | GATK's exact zero-coverage block form `0/0:0:0:0:0,0,0` (L15.2 toggle) | Simulator labels it "illustrative" until confirmed. Since v3 the toggle goal is optional practice, so no graded item depends on it |
| V-21 | DRAGEN gVCF band defaults | Read more only |
| V-22 | svtools `vcftobedpe` window behaviour | **Closed.** svtools `vcftobedpeconverter.py` (master, read 2026-10-16) sets start = POS + CIPOS[0] and end = POS + CIPOS[1], with no −1, and does the same with END and CIEND. The course convention starts one base earlier (D-13) |
| V-23 | 10x Long Ranger BEDPE strands | `:::unverified` in an L19 Read-more only; never in main text or graded items |
| V-24 | IGV BEDPE arcs; deepTools, igvtools, `genomecov -bg` and `samtools depth` outputs; Juicer columns | Kept out of graded look-alike items |
| V-25 | Dot-plot tools consume PAF; GO `.gaf` header `!gaf-version: 2.2` (L21 Read more) | Read more only |
| V-26 | Alu subfamily; MMEJ mechanism (L22 Read more) | Say "repeat element"; no mechanism claim |
| V-27 | Firefox and Safari `file://` storage; iOS opening email attachments; Clipboard API, Blob downloads and file inputs on `file://` | Playwright Firefox/WebKit in M1 (storage) and M7 (downloads); real Safari manually in M8 |
| V-28 | "T1067A" naming; the "IVS5N+5" name (Read more) | Read more only |
| V-29 | `github-pages` environment needs a tag rule for release tags | Check on the real repo in M0 |
| V-30 | Exome junction-read plausibility (int E15) | Not used; the case takes BEDPE from WGS |
| V-31 | DN sites absent from newer dbSNP and gnomAD | Prose says "absent from dbSNP build 138" |
| V-32 | UI conventions: pedigree symbols, HGNC italics, Okabe-Ito, IGV base colours | Low risk; design review |
| V-33 | rs3812718 naming; 5A/5N history | Read more only |
| V-34 | OFL Reserved Font Name wording; Lucide ISC | Check at M1 (licenses page; OQ-8, option a) |
| V-35 | The reference carries the minor allele at many sites genome-wide (Read more) | No numbers unless sourced |
| V-36 | axe-core with Vitest 5 / Playwright | Check in M1 |
| V-37 | SV ≥ 50 bp convention | L01 sort avoids the boundary |
| V-38 | Kong 2012: 1.2×10^-8 per base, 63.2 de novo SNVs per trio | Search summary only; verify the abstract |
| V-39 | A GATK call set writes haploid chrX genotypes only with explicit ploidy settings; HaplotypeCaller's default ploidy is 2 (L14 Read more) | From memory. Read more only |
| V-40 | `CompressionStream("deflate-raw")` is available in current Chromium, Firefox and WebKit (progress code) | From memory. Feature-detected, with an uncompressed fallback; e2e covers both paths |
| V-41 | iOS Safari zooms the page when a focused input's font is under 16 px | From memory. Inputs are ≥ 16 px on coarse pointers; checked on iOS in M8 |
| V-42 | pnpm 12 `minimumReleaseAge` units (minutes) and glob patterns in `minimumReleaseAgeExclude`; the platform package names of oxlint-tsgolint and oxfmt | Confirm in M0 from the pnpm docs and the lockfile |
| V-43 | SCN1A exons are uniquely mappable by 150-bp reads despite the paralog cluster | Not used: the course no longer ties MAPQ to the paralogs (L10) |
| V-44 | The Vite 8 / Vite+ API for loading modules through the dev server's module graph from a plugin (`ssrLoadModule` or the module runner) | Prototype in M0; fall back to the static id scan (§11.1) |

### 12.5 Accuracy rules for writers

- **Rule IDs and spec sections** are quoted as the notes give them.
- **Illustrative content** is labelled in the UI wherever data is illustrative: the population panel, library totals, read names, the timeline.
- **Use the notes' verified numbers**, for example 242,193,529, never rounded variants, in code chips and graded items.
- **Spec vs tool behaviour:** when they differ, say both. "BEDv1 forbids track lines; bedtools and UCSC accept them."
- **No unflagged clinical claims** in graded content.
- **Where this plan overrides case.md** (§9.5), follow the plan: never repeat "mirrors svtools", the `LH…` read names or the `SCN1A_e5N` name.
- **Case-file labels** use the step names in presentation order, never case.md's letters.
- **Never name or hint at a capstone file's defect** in a case beat or callout.

### 12.6 Style guide (enforced in part by lint)

- **Voice:** second person, present tense, sentence case. Plain words. No "simply", "obviously", "just" or exclamation marks (except one on the badge page), and no emoji.
- **Glyphs:** UI marks (checks, crosses, arrows, eyes) are Lucide SVG icons next to text labels, never text glyphs; exponents use `<sup>`. A lint rejects emoji and ✓ ✗ → ≤ ≥ ≈ and Unicode superscripts in UI strings.
- **Headings:** descriptive and unique within a lesson; a Quick check's heading is its exercise title.
- **Sentences:** average ≤ 22 words, none over 40. Lists use "**Bold lead-in.** Explanation."
- **Gene symbols** italic in prose (*SCN1A*); numbers with thousands separators in prose; exact bytes in code chips; genomic tokens such as `<DEL>` always in backticks.
- **Exercise copy** follows ux §8.3: verdict first; ≤ 40 words per explanation; name the rule and why it matters.

---

## 13. Milestones

Each milestone is merged only when its acceptance criteria hold in CI and, where stated, after owner review. Course-wide tests assert over built pages plus the course manifest (D-37), so a partial course can pass; each planted capstone defect is checked in the milestone that ships its format's validator.

**M0 · Repository bootstrap**
- Scaffold with Vite+ 1.3.0 (catalog pin), pnpm via `devEngines`, TypeScript (`verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions` with `noEmit`) and vite-plugin-singlefile 2.3.3. `.node-version` is 22.22.0, mirrored in `devEngines`.
- `pnpm-workspace.yaml` with the release-age gate and the owner-pinned exclusions (D-31); confirm the exclusion names and patterns from the lockfile (V-42).
- `.gitattributes`, `.editorconfig` and the raw-CR lint.
- A lesson-plugin skeleton compiles one placeholder lesson and loads one placeholder exercise through Vite's module graph (V-44). A course-manifest skeleton.
- Add `check-dist` (including the fallback-text, Pages-URL and denylist checks), `ci.yml`, `release.yml` (dry run), `LICENSE` (MIT), `LICENSES/`, a `CONTRIBUTING.md` stub and Renovate/Dependabot.
- Look up the SHA for setup-vp v1.21.1 (D-31). Check V-29.
- *Acceptance:*
  - a clean CI `vp install` with the frozen lockfile succeeds with the release-age gate on;
  - `vp check`, `vp test` and `vp build` pass in CI;
  - `dist/` holds exactly one `index.html`;
  - Playwright opens it over `file://` with zero non-`data:` requests on all three engines; with JavaScript disabled, the fallback text and Pages URL show;
  - on the soaked pins, which differ from the prototypes' versions (Preact 11.0.1, happy-dom 21.0.3, Playwright 1.64.1): a Preact 10.29.8 island builds via `jsxImportSource` and renders from `file://`, a happy-dom 20.14.5 widget test passes, and the Playwright 1.63.0 `file://` suite passes; the measured Preact size is recorded;
  - in `vp dev`, an exercise added to a child module appears without a server restart;
  - `actionlint` passes; all dependencies are pinned exactly.

**M1 · Vertical slice: shell, design system and Section 2 (Sequences) with its quiz** (owner review gate)
- **Shell:**
  - routes per D-22; the aside per route (switcher, outline, scroll-spy TOC, theme control); mobile top bar and sheet;
  - theme toggle with no flash;
  - progress store with merge-on-write (D-36), probe, fallback notice and the compact progress code;
  - scripted skip link; stable exercise ids; prev/next and the status line; minimal home and About pages; the static no-JS fallback.
- **Design system:**
  - tokens (light and dark, teal accent per OQ-5), the 5 fonts (OFL-1.1, OQ-8 option a), Lucide icons (ISC), callouts;
  - READ MORE, code block with copy;
  - snippet viewer (raw, aligned, whitespace, line descriptions, view as table, interactive-mode metrics), hex viewer (head/tail with annotations, 8-byte rows on phones) and compressed-text viewer;
  - exercise card with the five-state model.
- **Components:** all seven types (with `followUps`), the quiz page with its Reference card and "Submit quiz", and the `fai-calculator`, `bgzf-demo` and `phred-converter` simulators, each with a pure model, witnesses and a text view.
- **Validators:** FASTA/`.fai` (runtime rules for L04.3), FASTQ, and the gzip/BGZF summary checks.
- **Content:** L04-L07 complete (prose ≤ 600 words each, 12 graded interactions, the narrative L04 opener, the BGZF demo as optional practice, Read-mores, Recaps, At-a-glance cards with their four pipeline rows) and Quiz 2 with at least 2 variants per slot. Case FASTQ snippets come from a minimal generator stub that emits case.md's records with D-18 names and bins; M2's generator reproduces them verbatim.
- **Tests:** all layers for this scope; axe on these routes in both themes and in seeded exercise states.
- *Acceptance:*
  - the owner completes Section 2 and Quiz 2 from an emailed copy and from the PR artifact, keyboard-only;
  - no serious or critical axe findings, in light or dark;
  - the minutes lint puts L04-L07 at 8-9 minutes (course map: 9, 8, 8, 9);
  - `check-dist` records the per-category size baseline, within budget;
  - F02's planted defect, built from the stub's records, fails with exactly FQ-S06 and CASE-14;
  - a 2-3 student micro-pilot records per-item timings; the minutes model and the course-map minutes are recalibrated from it;
  - **the owner signs off on look, feel, voice and component behaviour.**

**M2 · Case data pipeline**
- `fetch-fixtures.ts` and `generate-case.ts` with `truth.ts`, simulators, by-construction alignment and callers, `defects.ts` (15 files, balanced key, `foreshadowed` flags) and the re-keyed exercise snippets.
- The fixture builder (D-32): an image pinned by digest with exact tool versions (the bedtools release is recorded here), building the binary fixtures, the full decoded texts and `toy40k.paf`, with `MANIFEST.json`. V-05 is resolved before fixtures are committed.
- *Acceptance:*
  - the fetch step reproduces both slice MD5s;
  - the generator is deterministic (snapshots) and emits M1's FASTQ records verbatim;
  - every CASE rule behaves as in §9.4 (violated only in the planted files), and every generator invariant holds;
  - F01 grades Valid; every REF base matches; the placeholder grep test passes;
  - the blocking manifest-hash test passes, and changing one generated SAM line makes it fail;
  - embedded case data ≤ 300 KB (F01 as head and tail, plus the base table);
  - the first oracle cross-check has run and its disagreements are triaged (non-blocking).

**M3 · Sections 1 and 3 (Foundations, Regions) with Quizzes 1 and 3**
- L01-L03 and L08-L09; the BED validator (strict profile, "Tools say" notes, verdict mapping); `coordinate-ruler` and the pipeline map (with its vertical phone layout).
- *Acceptance:* all exercise keys pass the content tests; Q1 and Q3 satisfy the composition rules over every variant combination; F03 grades Valid; the coverage-matrix rows for BED are complete; the prerequisite check passes for L01-L09.

**M4 · Section 4 (Alignments) with Quiz 4**
- L10-L12; the SAM validator; BAM and CRAM summary validators; `cigar-drawer` and `flag-decoder`; the hex sort with fixture-builder bytes; the L12.3 mini-triage on the capstone inspector.
- *Acceptance:* every SAM rule used by content has fixtures; aln EX-06's keys pass the key check; the EX-11 bytes come from real tools (resolving aln's "could not verify" note); F04 grades Valid; F05 grades "Valid but unusable here" with CRAM-M02 and CASE-02; F15 fails with exactly SAM-S13.

**M5 · Section 5 (Coverage and variants) with Quiz 5**
- L13-L16; WIG/bedGraph, VCF (version-dispatched) and gVCF validators; `exon-dip-explorer` and `gvcf-expander` with their text views.
- *Acceptance:* the rebuilt var EX-05 has exactly 5 diagnostics on lines 2-6; the de novo filter helper returns DN-1 only, and the oracle cross-check's `bcftools` run agrees or its disagreement is documented; the gVCF tiling goal triggers CASE-10; F06 and F07 grade Valid; F08 grades "Valid but unusable here" with VCF-C02 and CASE-09; F09 fails with exactly VCF-M15 and CASE-01.

**M6 · Sections 6 and 7 with Quizzes 6 and 7**
- L17-L21; GTF, GFF3, BEDPE, PAF and GFA/rGFA validators; `exon-frame-calculator`, `junction-drawer` and `gfa-drawer`. Resolve V-03.
- *Acceptance:*
  - phase-chain helpers reproduce case §3.4 phases;
  - case EX-08's solution validates;
  - case EX-10's only error is GFA-M09 on the last W line;
  - every `acceptAlso` entry in a shipped exercise has a widget test;
  - F10 (BEDPE-S05), F12 (GFF3-M08, CASE-11), F13 (PAF-M02, CASE-13) and F14 (CASE-12) fail with exactly their rules; F11 grades Valid.

**M7 · Capstone, L22, badge and finishing**
- The capstone inspector over 15 files with precomputed keys; L22 with the `microhomology-slider` (including its normalization goal); the badge page with the standalone SVG exporter and the print certificate; a complete course home (pipeline map, outline, "Continue"); About (versions, licenses, data sources); print styles.
- *Acceptance:*
  - each of F01-F15 grades as in §6.2, and the tally is 6 / 2 / 7;
  - the capstone ending leads to L22, and L22 to the badge;
  - the badge unlocks only under D-10 (e2e with seeded progress), and the downloaded SVG matches the in-page badge;
  - print preview of a lesson, a quiz and the badge matches ux §15;
  - the "all built" coverage assertion is switched on and passes.

**M8 · Hardening and v1.0 release**
- Full fact-check pass; no `:::unverified` left; clinical review done (OQ-6). If the owner has named no reviewer by then, the OQ-6 fallback applies instead: the V-01 to V-03 claims are confirmed narrative-only and hedged.
- WCAG 2.2 AA audit (ux §16) with NVDA+Firefox, VoiceOver+Safari (macOS, and iOS via Pages, including focus zoom, V-41) and TalkBack+Chrome.
- Manual Safari `file://` check (V-27).
- Pilot with 5-8 students against the §1.3 targets, including per-lesson, per-quiz and capstone timings, then one revision round.
- Performance and size check; oracle cross-check green or its disagreements documented.
- Tag `v1.0.0`.
- *Acceptance:*
  - every §1.3 pilot target met, or a documented owner waiver;
  - the course-map minutes are within 2 minutes of the pilot medians, or OQ-2 is reopened;
  - no serious or critical accessibility issues open;
  - the Release asset and the Pages site have identical SHA-256;
  - the `#/about` page lists every spec, tool and data version (§12.2).

**Post-v1 backlog:** a cheat-sheet route; a glossary route; PNG badge export (the SVG exporter's output drawn to a canvas at 2×); `.json` progress upload; rule IDs from the notes that no content references (§8.2); graded GFA2/GAF items; a real HPRC panel.

---

## 14. Risks and mitigations

| ID | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R-01 | The lessons overrun the owner's option-B target (planned 193 min, 3 h 13 min; 4 h 44 min end to end), or a lesson falls outside 8-12 min | Medium / medium | Option-B cuts (OQ-2): 600-word prose cap, narrative openers, 14 items as optional practice (including the two trims); minutes lint per lesson (8-12) and for the course (185-195 min); D-05's floor rule for the lessons with the least interaction time (L01, L02, L08, L16; at the margin L05, L10, L15); M1 micro-pilot timings; quiz and capstone times stated on their pills; OQ-2 reopens if the M8 pilot misses the course map (§13) |
| R-02 | Factual errors or unverified claims reach learners | Medium / high | Verification register as data; graded items declare V-ids; `:::unverified` fails release builds; adversarial review; clinical reviewer; errata via patch releases |
| R-03 | The clinical storyline is misread as advice, or upsets learners | Low / high | Ethics note on the first case page and at the end; narrative framing; person-first language; no flashing; no real institutions |
| R-04 | Our validators disagree with the spec or with real tools (false positives or negatives) | Medium / high | Rule-ID fixtures from the notes' minimal violations; structural rules implemented for every graded format; the weekly oracle cross-check; per-exercise profiles; "Tools say" notes |
| R-05 | Storage on `file://` differs by browser (Safari throws; Firefox scopes by path; Chromium shares one store) | High / medium | Namespaced keys; merge-on-write (D-36); in-memory fallback; notice; progress code; Pages link; e2e with throwing storage on three engines |
| R-06 | Learners open the emailed file in a viewer that runs no script (iOS Quick Look, email previews) | Medium / medium | Static fallback text and `<noscript>` naming the Pages URL (D-28); e2e with JavaScript disabled |
| R-07 | The single file grows too large (fonts, data, Preact) | Medium / medium | Per-category size report and budgets in `check-dist`; measured M1 baseline; F01 as head and tail; capstone keys precomputed; only fix-it rules ship in the browser |
| R-08 | Complex widgets (drag, graph drawer, hex, fix-it Tab, pick-in-snippet) fail accessibility | Medium / high | APG patterns; keyboard and click alternatives; simulator text views; line descriptions; 24-px targets asserted in e2e; DOM tests of keyboard paths; manual screen-reader passes in M8 |
| R-09 | Third-party data licensing (GENCODE, dbSNP, GRCh38; Twist) | Low / high | The owner approved shipping the extracts (OQ-7); V-05 confirms the terms before M2; attribution and terms in `DATA-SOURCES.md`; no vendor file; fallback: synthetic slice for any source V-05 finds restricted |
| R-10 | Case biology looks implausible to experts (repeats, by-construction breakpoints, illustrative panel, GATK version headers) | Medium / medium | case.md design (BEDPE from WGS; Alu window; 8 placements disclosed); GATK files declare VCFv4.2 (D-12); one instrument family in read names and bins (D-18); "illustrative" labels; clinical and expert review |
| R-11 | Specs drift (for example VCF 4.6, GFA updates) | Medium / low | Pinned versions on `#/about`; re-verification procedure (§12.2) |
| R-12 | Toolchain immaturity (Vite+ 1.3.0, pnpm 12, fresh releases) | Medium / medium | Exact pins; a 14-day gate with the owner-pinned closure excluded (D-31); M0 proves a clean frozen install with the gate on; soaked pins re-tested in M0; documented gotchas (tech §14) |
| R-13 | Quiz answer keys sit in the file | Certain / low | Accepted: self-study course with an honest badge |
| R-14 | Fix-it frustration (tabs, touch keyboards, smart quotes, iOS zoom) | Medium / medium | "Insert tab" button; whitespace markers on; smart-quote and NBSP detection; 16-px inputs on coarse pointers; hint ladder; "Show solution" diff |
| R-15 | Case density overloads learners, or the capstone becomes a recall test | Medium / medium | Toy contigs for drills; at most one case callout per screenful; callouts never name capstone defects; at most 4 foreshadowed capstone defects; a balanced key; content tests against lesson duplicates |
| R-16 | Contributors make authoring mistakes | Medium / low | Architecture A fails the build with `file:line:col`; tsconfig matches what the loader accepts; helpful raw-HTML message; link validation; `CONTRIBUTING.md` lists common errors |
| R-17 | Pages tag deployments are blocked by environment rules | Low / low | V-29 at M0; manual fallback deploy |
| R-18 | Scope creep toward a Format Lab | Medium / medium | Non-goal stated (O-06); fix-it input cap; Download (D-27) covers "try real tools" |
| R-19 | Progress regresses when several copies or tabs share one store, erasing a "Passed" | Medium / high | Read-modify-write merges with monotonic rules (D-36); unknown keys preserved; merge-by-default import; a two-page e2e test |
| R-20 | Binary fixtures go stale after a generator change | Medium / medium | Fixture-builder manifest of input hashes and a blocking content test (D-32) |
| R-21 | The license of the shipped file is not what "MIT" suggests | Low / medium | Settled before M1 (OQ-8, option a): MIT for code and course text, OFL-1.1 fonts and ISC icons, with notices in `LICENSES/` and on `#/about`; V-34 at M1 |
| R-22 | Public docs read as a measured copy of a named brand's layout | Low / medium | The owner accepts the research notes as they are (OQ-9); the plan uses neutral wording; the shipped file names no brand (O-08) and the `check-dist` denylist enforces it |

---

## 15. Owner questions

The owner answered on 2026-10-16. Eight questions are resolved; OQ-6 is the only open one. Appendix C.1 lists where each answer was applied.

1. **OQ-1 · Case sign-off.** RESOLVED 2026-10-16: approved as written (Noa, she; the illustrative timeline; the disclaimers; the illustrative GFA panel; D-15, D-17).
2. **OQ-2 · Time budget.** RESOLVED 2026-10-16: option B, named content cuts (no lesson merges) to about 3 h 10 min, with moved exercises kept as optional, ungraded Read-more practice; applied after coverage checks as 193 lesson minutes and 284 end to end (§4, Appendix C.1). Four listed items stay graded, wholly or in part: L17.3 (GTF's only validity exercise), L09.1 and L19.2 (D-06's three graded interactions per lesson) and two of L21.2's four items (an interaction in §3). Substitutes from L09, L15, L18, L19 and L22 were moved instead (Appendix C.1).
3. **OQ-3 · Badge rule.** RESOLVED 2026-10-16: as proposed, all 7 quizzes passed plus the capstone complete (D-10).
4. **OQ-4 · Quiz pass mark.** RESOLVED 2026-10-16: as proposed, 5 of 6 (D-09).
5. **OQ-5 · Visual identity.** RESOLVED 2026-10-16: as proposed, teal #0B6B66 / #5EC4BA with Public Sans (D-24, D-25).
6. **OQ-6 · Clinical reviewer.** OPEN. Can you name a clinical geneticist or genetic counsellor to review the narrative lessons (L01, L16, L18, L22) and the claims in V-01 to V-03? *Deadline:* before v1.0 (M8). *Fallback:* until a reviewer is named, and in v1.0 if none is, those claims stay narrative-only and hedged (§12.3).
7. **OQ-7 · Third-party data in the repo.** RESOLVED 2026-10-16: approved; small GRCh38, GENCODE v43 and dbSNP138 extracts ship with attribution and terms in `DATA-SOURCES.md`, still subject to V-05 confirming the terms (D-19).
8. **OQ-8 · License scope of the shipped file.** RESOLVED 2026-10-16: option a, MIT for code and course text; bundled fonts under OFL-1.1 and icons under ISC, with notices in `LICENSES/` and on `#/about` (O-01, D-24).
9. **OQ-9 · Brand references in the public research notes.** RESOLVED 2026-10-16: keep as is; `docs/research/ux-design.md` may openly name the course whose design inspired this one, while the shipped course uses none of that brand's names, logos, fonts or assets (O-08; the `check-dist` denylist stays).

---

## Appendix A · Research notes index

| Path | Scope | Key sections used in this plan |
|---|---|---|
| `docs/research/foundations.md` | DNA as text, builds, sequencing, Phred, coordinate conventions per format, compression and indexes, file anatomy, biology primer; XF-01-XF-28; 15 exercises; 8 quiz items | §3-§4 (anatomy, convention table), XF rules, EX-01-EX-15, Q1-Q8 → L01-L03, L06, L10, L14, L18; Quizzes 1, 5 |
| `docs/research/sequences.md` | FASTA, FASTQ, `.fai`, `.gzi`; tested with samtools 1.24 and Biopython 1.88; FA/FAI/FQ/GZ rules; GRCh38 distributions (Broad and iGenomes copies) | §3, §5, §7, EX-01-EX-14, Q1-Q9 → L04-L07; Quizzes 2, 4 |
| `docs/research/intervals-signals.md` | BED (BEDv1), BEDPE (bedtools), WIG/bedGraph/bigWig (UCSC + kent); BED/BEDPE/WIG rules; 15 exercises | §3-§7, E1-E14, Q1-Q8 → L08, L09, L13, L19; Quizzes 3, 5, 7 |
| `docs/research/alignments.md` | SAM v1.6, BAM, CRAM 3.0/3.1, BAI/CSI; tested with samtools 1.24; SAM/BAM/CRAM rules | §3, §5, §7, EX-01-EX-13, Q1-Q8 → L10-L13; Quiz 4; F04, F05, F15 |
| `docs/research/variants.md` | VCF 4.2-4.5, gVCF dialects, joint genotyping, PED, de novo filters; tested with htslib/bcftools 1.24 | §3-§7, §10, EX-01-EX-12, Q1-Q8 → L14-L16, L22; Quiz 5 |
| `docs/research/annotation.md` | GFF3 v1.26, GTF2.2 (via AGAT and UCSC), Ensembl/GENCODE dialects; phase rules; DEMO1/DEMO2 | §3-§5, §7, EX-01-EX-13, Q1-Q9 → L17, L18; Quizzes 3, 6 |
| `docs/research/graphs.md` | PAF, minimap2 tags, GFA1 (1.0-1.2), rGFA, GFA2/GAF in brief; tested with minimap2 2.31 and gfatools 0.5 | §3-§7, EX-03-EX-12, Q1-Q5 → L20, L21; Quiz 7 (case-specific items superseded per its banner) |
| `docs/research/case.md` | **Canonical case**: family P042, SCN1A exons 17-20 deletion; verified GRCh38/GENCODE v43/dbSNP138 facts; data inventory; capstone folder; CASE rules; generator plan | All sections → §5 case beats, §6.2, §9 (overrides in §9.5) |
| `docs/research/ux-design.md` | Layout, tokens, fonts, snippet viewer, seven component types, quizzes, capstone, badge, progress, print, WCAG 2.2 AA | §2-§16 → §7, §10 (adjustments in §10.5) |
| `docs/research/tech-architecture.md` | Prototypes A and B; Architecture A; build, routing, storage, tests, CI/CD | §1-§14 → §11 (overrides: D-31 release-age exclusions; §11.1 module loading; D-36 merges) |

## Appendix B · Disposition of the researchers' open questions

| Note | Question (short) | Disposition |
|---|---|---|
| foundations | Which gene and variant | D-01 (SCN1A, case.md) |
| foundations | chr1 lengths; GENCODE `chr` naming; HLA contig names | Lengths verified (bedtools genome files); naming → V-11 |
| foundations | GTF CDS excludes the stop codon | Verified via the AGAT quote of GTF2.2; GENCODE behaviour → V-14 |
| foundations | `.csi` BGZF; `.crai` 1-based start | `.csi` verified (htslib `hts.c`); `.crai` → V-16 (not taught) |
| foundations | rGFA SO 0-based "implied" | Taught as implied (L21) |
| foundations | Brief too long | D-04, D-05 |
| foundations | Read lengths, depths, error rates | V-10 |
| sequences | Cock 2010 details; Illumina headers; binned Q; HiFi Q93; HBA header | V-07, V-06, D-18, V-08, V-09 |
| sequences | Seizure gene and location | D-01 |
| sequences | Validator: lenient or strict | D-11 (strict + "Tools say" + verdict mapping) |
| sequences | CRAM decoding with a same-M5 copy | Verified (seq Q9 test); used in the Q4.4 variant, with the M5 recipe in L12 main text |
| sequences | Length | D-05 |
| intervals | SCN1A targets illustrative | D-01, D-19 (real MANE exons; `SCN1A_alt8_5N`) |
| intervals | BEDv1 strict vs tool-valid | D-11 (both shown; tool requirements map to "unusable here") |
| intervals | Simple or complex event | D-14 (simple; `BND_2` artefact) |
| intervals | Vendor, interval_list, narrowPeak, Juicer, IGV, deepTools facts | narrowPeak verified; the rest → V-12, V-24; 10x strands → V-23 (Read-more only) |
| intervals | Exome split-read plausibility | Case uses WGS for BEDPE; V-30 |
| annotation | Gene and release to pin | D-19 (GENCODE v43), V-04 |
| annotation | GTF2.2 wording; GENCODE attributes | V-13, V-14 |
| annotation | GTF order and `transcript_id` on gene lines | D-11 (warning, convention) |
| annotation | GVF and Gap vs CIGAR cross-links | Read more in L17 only |
| annotation | Length | D-05 |
| alignments | T3 coordinates | D-01 |
| alignments | htsjdk CRAM 3.1 | V-17 |
| alignments | SAM-S08/S15 severity; TLEN | D-11 |
| alignments | BAM-C02 | V-18 |
| alignments | Length | D-05 |
| variants | Child's sex | D-17; approved (OQ-1) |
| variants | 166,009,959 placement | D-01 (DN-1/DN-2) |
| variants | Primary VCF version | D-12 (GATK files 4.2; 4.5 where its features matter) |
| variants | Strict vs htslib leniency | D-11 |
| variants | GATK contig order; `<NON_REF>` removal; `sort` locale; allele-balance filters | `<NON_REF>` removal verified; the rest → V-19 or Read-more phrasing |
| variants | DRAGEN bands | V-21 |
| variants | Spec errata | Read-more sidebar in L14; an upstream report is optional (M8) |
| variants | Length | D-05 |
| graphs | Approve the inversion design | Superseded by case.md (D-14); approved within OQ-1 |
| graphs | Fictional population or HPRC | D-15; approved (OQ-1) |
| graphs | GFA2/GAF recognition-only | D-16 (Read-more only) |
| graphs | Repeat-breakpoint simplification | Disclosed (L20 Read more, case §3.6) |
| graphs | Tool facts (SV callers on BAM, racon, hifiasm, Flye, wfmash; GRCh37 chr2) | Verified in the gph log; dot-plots and GO `.gaf` → V-25 |
| graphs | Length | D-05 |
| case | Lesson order | D-03 |
| case | BEDPE window convention | D-13; V-22 closed (svtools starts one base later) |
| case | Clinical claims | V-01, V-02; OQ-6 open (fallback: narrative-only and hedged) |
| case | GENCODE/MANE release | D-19, V-04 |
| case | Fixture terms | V-05; extracts approved (OQ-7) |
| case | Long reads proband-only | D-14 |
| case | Population panel labelling | D-15; approved (OQ-1) |
| case | Name, pronoun, timeline | Approved (OQ-1) |
| case | Length | D-05 |
| ux-design | Badge rule; pass mark | D-10, D-09; confirmed (OQ-3, OQ-4) |
| ux-design | Quiz layout; fix-it editor; download | D-30 (one "Submit quiz"), D-26, D-27 |
| ux-design | Accent; body font | D-24, D-25; confirmed (OQ-5); font licensing settled (OQ-8, option a) |
| ux-design | `file://` origin, clipboard, Vite `url()`, ligatures | Vite bare paths verified (tech §4.1); ligatures moot with Plex Mono (D-24); the rest → V-27 |
| tech | Firefox and Safari storage | V-27; e2e projects in M1; manual Safari in M8 |
| tech | Progress code acceptability | D-23 (compact, compressed), D-29 |
| tech | iOS email attachments | D-28 (static fallback) |
| tech | Pages environment tag rule | V-29 |
| tech | Version soak | D-31 (owner-pinned closure excluded from the gate) |
| tech | Binary demo data | D-20 |
| tech | Oracle CI job | D-32 (blocking fixture builder + weekly cross-check) |

## Appendix C · Review and decision log

### C.1 Owner decisions applied, 2026-10-16 (plan v2 → v3)

The owner answered the §15 questions on 2026-10-16. Eight are resolved and OQ-6 stays open. This entry lists every change, each substitution made to protect coverage and why, and the new totals.

**Answers and where they were applied**

| Question | Answer | Applied in |
|---|---|---|
| OQ-1 Case sign-off | Approved as written | D-17, §15, Appendix B |
| OQ-2 Time budget | Option B: named content cuts to about 3 h 10 min, no merges; moved exercises become optional Read-more practice; coverage protected | Status line, abbreviations, §0, §1.3, O-04, O-12, D-04-D-06, §3.2, §3.3, §4, §5 (conventions and all 22 lessons), Q4.1, §7, §8.3, §10.1, §11.1, §11.6, V-20, M1, R-01 |
| OQ-3 Badge rule | All 7 quizzes passed + capstone complete | D-10, §6.3, Appendix B |
| OQ-4 Quiz pass mark | 5 of 6 | D-09, Appendix B |
| OQ-5 Visual identity | Teal #0B6B66 / #5EC4BA; Public Sans | D-24, D-25, §10.5, M1, Appendix B |
| OQ-6 Clinical reviewer | Still open; deadline before v1.0; fallback: claims narrative-only and hedged | §0, §12.3, M8, §15, Appendix B |
| OQ-7 Third-party data | Approved, subject to V-05 | D-19, §11.2, V-05, R-09, Appendix B |
| OQ-8 License scope | Option a | §0, O-01, D-24, §10.2, §10.5, §11.5 (the system-font branch removed from the fonts note and `check-dist`), M1, V-34, R-21 |
| OQ-9 Brand references | Keep the research notes as they are | O-08, §10, §11.2, R-22 |

**How the time cuts were checked.** The owner's option-B list was the starting point. Each item was checked against the coverage matrix (§3.3: every format keeps a graded recognition and a graded validity exercise), the LO table (§3.2: every LO keeps formative practice) and the lesson rules of D-06 (3-5 graded interactions per lesson; an interaction in every content H2 except at most one concept primer).

| Owner-listed item | Result | Reason |
|---|---|---|
| L03.1 goal 2 | Moved | Goals 1 and 3 stay graded (goal 3 teaches Q1.3); LO5 keeps L03.1-L03.3 |
| L05.3 simulator (keep its mcq) | Moved; the mcq stays graded as L05.3 | L05 keeps 3 graded interactions and §3 keeps one; companion validity keeps L05.2 and L12.3 |
| L09.1 | **Kept** | BED would stay covered (L03.3, L08.3, L09.2, L09.3), but L09 would fall to 2 graded interactions (D-06 needs 3) and its §1 would have none |
| L11.2 | Moved | No SAM coverage cell uses it. Its H2 would have had no graded interaction, so the former "Try it: decode the FLAG" H2 is folded into "Eleven mandatory fields" and L11.3 becomes that section's Quick check (TOC now 4 entries; Q4.1's anchor is now L11 §2) |
| L13.1 | Moved | WIG recognition is L13.2 and WIG validity L13.4; no quiz slot uses L13.1. L13 §1 becomes the lesson's one concept primer without an interaction |
| L17.3 | **Kept** | GTF's only validity exercise. No other L17 item can move: L17.2 is the only GTF/GFF3 recognition item, and L17.1 and L17.4 are the only interactions in §2 and §4 (§1, the primer, has none once the opener is narrative) |
| L18.4 | Moved | GFF3 validity stays graded in L18.3; no quiz slot uses GFF3-M13 |
| L19.2 | **Kept** | L19 would fall to 2 graded interactions |
| L20.3 | Moved | LO5 keeps L20.1's PAF crosswalk item; L20 keeps 3 interactions |
| L21.2 | **Moved in part** (the two walk-length items) | The `s1` item (LO8: the same integer as in BED and VCF) and the W-line crosswalk item (LO5) stay. Moving all of L21.2 would leave §3 without a graded interaction while §1 already has none, and would leave the crosswalk card's GFA row and L21's only LO8 item ungraded |
| Prose cap, narrative openers | Applied | The openers keep their IDs and the map; LO7 keeps graded practice in L01.3 and L12.3, plus an LO7 slot in every quiz |
| Trims: L12.3, L22.3 | Applied | L12.3 drops `targets_b38.bed`, the file whose lesson is practised elsewhere (L02.2, L02.3; Q1.4, Q3.4), and keeps the stale `.fai` (Invalid) and a Valid BAM. L22.3 drops goal 1 (count the placements) and keeps goals 2-3, which carry LO8 and HGVS. Both dropped parts become optional practice, not deletions |

**Substitutions.** Each kept item is offset, as far as the rules allow, by moving another item to optional practice. Together the substitutes recover 4.5 of the 7 kept minutes: 2.75 of L17.3's 3, 0.75 of L09.1's 2, all of L19.2's 1 and none of the 1 minute kept in L21.2. None breaks coverage, leaves a lesson under 3 graded interactions or 8 minutes, or leaves an H2 without an interaction.

| Kept item (minutes) | Substitute moved to optional practice (minutes) | Why this substitute |
|---|---|---|
| L17.3 (3) | L15.2 goal 2, the "no data" toggle (1); L18.2 goal 3, exons 20-21 (1); L22.2, the orthogonal-confirmation mcq (0.75) | Goal 2 rests on V-20, an unconfirmed GATK form, so it is safer ungraded; goal 3 repeats the summed-length rule of goals 1-2 in L17's own section (S6); L22.2 is lab practice beyond the objectives, and L22.1 keeps LO7 graded |
| L09.1 (2) | L09.2 round B, space-separated BED (0.75) | L09.3's space-separated item grades the same case (BED-C02, "unusable here") |
| L19.2 (1) | L19.1 follow-ups (c) `SA` MAPQ 0 and (d) FLAG 97 (1) | Same lesson; follow-ups (a), (b) and the crosswalk item (e) stay graded |
| Two L21.2 items (1) | None | No further cut was found that kept every rule above |

The owner's list as written comes to about 190 min. The kept items add 7 min back and the substitutes take 4.5 min out, so the lessons total about 193 min. That is 3 min over 190, inside the owner's ± 5.

**Time accounting** (per-unit model, §11.6)

| Cut | Minutes |
|---|---|
| Prose capped at 600 words per lesson; largest in the prose-heavy lessons | about −12 |
| Six section openers made narrative (0.5 each) | −3 |
| Owner-listed items moved as listed: L03.1 goal 2 (1), the L05 BGZF demo (1), L11.2 (1.75), L13.1 (1), L18.4 (1.5), L20.3 (1.5) | −7.75 |
| L21.2's two walk-length items | −1 |
| Trims: L12.3's third file (1), L22.3 goal 1 (1) | −2 |
| Substitutes: L09.2 round B (0.75), L15.2 goal 2 (1), L18.2 goal 3 (1), L19.1 (c)-(d) (1), L22.2 (0.75) | −4.5 |
| **Total** | **about −30: 223 → about 193 (per-lesson figures rounded)** |

| Lesson | v2 | v3 | Lesson | v2 | v3 |
|---|---|---|---|---|---|
| L01 | 9 | 8 | L12 | 10 | 9 |
| L02 | 9 | 8 | L13 | 11 | 9 |
| L03 | 10 | 9 | L14 | 10 | 9 |
| L04 | 10 | 9 | L15 | 10 | 8 |
| L05 | 9 | 8 | L16 | 9 | 8 |
| L06 | 10 | 8 | L17 | 11 | 10 |
| L07 | 9 | 9 | L18 | 11 | 9 |
| L08 | 9 | 8 | L19 | 11 | 10 |
| L09 | 11 | 9 | L20 | 11 | 9 |
| L10 | 10 | 8 | L21 | 11 | 10 |
| L11 | 11 | 9 | L22 | 11 | 9 |

**Final list of items moved to optional practice (14).** Each sits in a collapsed "Optional practice" Read-more card in its own section, with its content kept (§5):
1. L03.1 goal 2 (predict the bases of BED `6 14`);
2. the L05 BGZF random-access demo (its mcq stays graded as L05.3);
3. L09.2 round B (space-separated BED; substitute);
4. L11.2 (field-explorer on `r001`);
5. L12.3's third file, `targets_b38.bed` (trim);
6. L13.1 (counted or skipped by `samtools depth`);
7. L15.2 goal 2 ("no data" toggle; substitute);
8. L18.2 goal 3 (exons 20-21; substitute);
9. L18.4 (GFF3 spot-the-error, 2 rounds);
10. L19.1 follow-ups (c) and (d) (substitute);
11. L20.3 (flip the read);
12. L21.2's two walk-length items;
13. L22.2 (orthogonal confirmation; substitute);
14. L22.3 goal 1 (count the placements; trim).

**Structural consequences.**
- L11: H2s 2 and 3 merged, as above. L12: §4 is now "Try it: triage two files". L13: §1 is labelled a concept primer.
- In L10, L13 and L17 the first H2 no longer has a graded interaction, so it stays under about 250 words, keeping the first graded interaction within about 300 words (§5).
- Placement: no optional card is the last block before the Recap. Where one would be, it goes before the section's last graded exercise (L05, L12, L18); L20.3 already sat before L20.4 and keeps its place.
- 18 of 22 lessons still contain a graded predict or simulator, the §1.3 minimum. L04 lost its predict with the opener; L09, L12 and L14 had none in v2.
- New lint checks (§11.6): ≤ 600 prose words per lesson; the 22 lessons together within 185-195 min; "interaction" means a graded one.
- The prose cap and the 8-minute floor meet in the lessons with the least interaction time (L01, L02, L08, L16; at the margin L05, L10 and L15). D-05 lets the floor win there, with a lint warning, rather than ship a lesson under 8 minutes. This tie-break is a plan decision, not an owner answer; the owner may overrule it.

**New totals.** Lessons about 193 min (3 h 13 min), 8-10 min each; by section S1 25, S2 34, S3 17, S4 26, S5 34, S6 19, S7 29, S8 9. Quizzes 7 × about 8 = 56 min. Capstone about 35 min. End to end about 284 min (4 h 44 min). 69 graded exercises, 3-4 per lesson (v2: 80 interactions, that is 74 exercises plus 6 opener checks). 14 optional practice items.

**Still open.** OQ-6 (clinical reviewer; before v1.0; fallback as above). Per-lesson minutes stay model estimates until the M1 micro-pilot recalibrates them; if the M8 pilot misses the course map by more than 2 minutes per lesson, OQ-2 reopens (§13).

### C.2 Review (plan v1 → v2)

This is the v2 record. Where it mentions OQ-2, OQ-3, OQ-8 or OQ-9, it describes those questions as they stood before the owner answered them; §15 and C.1 record the answers.

A four-lens review (science, pedagogy, UX, engineering) raised 83 findings: 1 blocker, 33 major and 49 minor. Each claim was checked against the research notes and, where the notes were not enough, against primary sources:
- npm registry (2026-10-16): vite-plus 1.3.0 was published that day, pins `oxfmt =0.73.0`, `oxlint =1.88.0`, `oxlint-tsgolint =7.0.2004` and `vitest 5.0.5`, requires node `^22.18.0 || ^24.11.0 || >=26.0.0`, and ships a `vpr` bin.
- svtools `vcftobedpeconverter.py` (master): windows are `POS + CIPOS[0]` to `POS + CIPOS[1]`, with no −1.
- CRAMv3.tex: "The SQ:MD5 checksum is required unless the reference sequence has been embedded".
- SAMv1.tex §4.1.2: the EOF marker "should be written", and its absence "should trigger a warning or error".
- VCFv4.5.tex mentions BGZF only for BCF.
- unified 11.0.5 + remark-parse 11.0.0 + remark-gfm 4.0.1 + remark-directive 4.0.0, run locally: `<DEL>`, `<INV>`, `<DUP>` and `<!-- src: … -->` parse as `html` nodes; `<NON_REF>` and `<*>` stay text; `chr2:166,014,902`, `SA:Z:chr2,…` and `GT:AD:DP:GQ:PL` produce text directives.

No finding was rejected as wrong. Every blocker and major finding was applied; most minor findings were applied; some were applied in part or through a different mechanism, as listed below.

**Science (16)**

| Finding | Disposition | Where |
|---|---|---|
| F08 graded "Invalid" on a convention (major) | Applied: "Valid but unusable here"; tally and D-08 rationale updated | D-08, D-11, §3.3, §6.2, §8.3 |
| Missing BGZF EOF block treated two ways | Applied: one course rule (presumed truncated → Invalid, CASE-14) in L05 and L12; GZ-S02 escalated; L12.1 B reworded; "cut at a block boundary" | L05 §3, L12 §1-§2, §8.3 |
| Paralogs said to explain MAPQ | Applied: paralogs motivate "which gene?"; MAPQ motivated by the Alu tail; V-43 records the unused claim | L10 case beat, L17 §4 |
| "10x writes `+ +`" in graded main text | Applied: moved to an `:::unverified` Read-more; neutral main-text wording; BEDPE-M04 "convention-dependent" | L19 §2, §8.3, V-23 |
| V-22 resolvable; case.md "mirrors svtools" | Applied: verified and closed; D-13 and L19 say svtools differs by one | D-13, L19 §2, V-22, §9.5 |
| GATK trio VCF declared 4.5 | Applied: GATK-written files declare 4.2; CNV VCF and precise SV record 4.5; haploid chrX moved to Read-more with a ploidy note (V-39) | D-12, D-17, L14, L15, §9.2 |
| NovaSeq X names with NovaSeq 6000 bins | Applied: NovaSeq 6000-style names from seq §3.3 | D-18, §9.2, §9.5 |
| `SCN1A_e5N` mixes numbering systems | Applied: renamed `SCN1A_alt8_5N`, plus a sentence in L08 and L17 | D-19, L08 §1, L17 §4, §9.5 |
| "Six independent projections" | Applied: "three independent technologies"; L22.1 groups items by data source | L22 §1-§2 |
| L03.2 rule misclassifies PAF, BEDPE, GFA | Applied: rule reworded and the full crosswalk moved to a Read-more preview and L22 | L03 §3, L22 §3 |
| `.fai` p not marked 0-based | Applied, with a helper assertion | L05 §1-§2 |
| "UCSC"/"NCBI" rows are iGenomes copies | Applied: relabelled; hgdownload not checked | L04 Read more, L05.1 |
| L17.2 item D keyed "GFF2" | Applied: bin "legacy GFF (GFF1 or GFF2)"; nuance in "Why?" | L17.2 |
| Father "under-sequenced" with 60 M pairs | Applied: about 32 M pairs in metadata and the callout | L06 case beat, §9.2, §9.3 |
| "Not in targets means not looked at" | Applied: case.md's corrected wording | L08 §1 |
| `@SQ M5` required, without the embedded exception | Applied | L12 §3, §8.3 |

**Pedagogy (19)**

| Finding | Disposition | Where |
|---|---|---|
| Q4 tests concepts taught later or only in Read-more (major) | Applied: secondary/supplementary/duplicate paragraph in L11; second FLAG goal; depth sort moved to L13. **In part:** the depth sort was not also added to Q5, whose six slots carry the required recognition, validity, LO6 and LO7 items | L11 §2-§3, L13.1, §6.1 |
| Foundations sort needs later formats; Q1 tests VCF early (major) | Applied: L03.2 cut to formats seen; crosswalk card extended in later lessons (folded into existing interactions rather than six new predicts, to protect time); Q1.2 replaced; padding item moved to Q5.3 | L03, §5 conventions, Q1, Q5.3 |
| Quiz slots repeat lesson interactions (major) | Applied: all 42 slots redesigned on fresh data; content test against duplicates; LO5 slots avoid the case integers; Q3.5's 1,135 variant dropped | §6.1, §11.6 |
| Too few retake variants (major) | Applied: ≥ 2 variants per slot with identical concepts; parametric computation slots | D-09, §6.1, §7.7 |
| No recognition or validity in most quizzes (major) | Applied: one of each in Q2-Q7 via a composition test. Q3's suggested interval_list item was replaced by BED12 vs GTF, because the interval_list layout is unverified (V-12) | §6.1 |
| LO6 mis-mapped (major) | Applied: MAPQ slot Q4.3; GQ slot Q5.5 as a primary item; GQ readout in L15.2; §3.2 corrected | §3.2, L15.2, Q4.3, Q5.5 |
| Capstone defects repeat lessons; lopsided key (major) | Applied: 5 defects re-planted (F10, F12, F13, F14, F15), 4 foreshadowed (F02, F05, F08, F09); "seed for F0x" lines removed; key 6/2/7; a file counts only with format, verdict and reason. F04 became a valid control instead of the suggested `@SQ LN` plant, which would repeat F09's defect class | D-08, §6.2, L07/L12 case beats, §9.4 |
| The big picture is set up and paid off but not practised (major) | Applied: At-a-glance Answers/Keeps/Drops/Next rows; section openers on the map; an LO7 slot per quiz; L01.3 recast as a matching; capstone routes to L22 before the badge (chosen over requiring L22.1 for the badge, which was left to the owner in OQ-3; the owner kept quizzes plus capstone in v3) | §5, L01, §6.1, D-10 |
| Validity never defined in Foundations (major) | Applied: "What makes a file valid?" in L02 with the anatomy table and a verdict sort; same bins in L09.3 and every validity sort; L12.3 mini-triage | L02, L09.3, L12.3, D-11 |
| Overloaded lessons (major) | Applied: L12.1 fix-it moved into L11 (replacing the recognition sort, whose items moved to Q4.5/Q7.4); normalizer moved to L22.3; chrX and version drift to Read-more; L21.1 spells one walk; GFA2/GAF bins dropped; OQ-2 offered content cuts (option B chosen in v3) | L11, L12, L14, L21, L22, OQ-2 |
| Minutes model underestimates (major) | Applied: per-unit allowances at 150 wpm; every lesson recomputed and fitted to 9-11 min; quiz ~8 min, capstone ~35 min; totals and OQ-2 restated | D-05, §4, §11.6, OQ-2 |
| No reference material on quiz pages (major) | Applied: a Reference card per quiz; distractors from misreadings | §6.1 |
| Variants depending on Read-more content | Applied: concepts test; M5 sentence in L12 main text; the encoding variant is gone | §6.1, §11.6, L12 §3 |
| L17.1 asks about phase before phase is taught | Applied: question moved to L18.1's follow-up | L17.1, L18.1 |
| Explanations cue later items | Applied: explanations after "Submit quiz" | D-09, D-30, §6.1 |
| Lint cap too loose; L10 splits concept and practice | Applied: 450 words; placement rules; L10 reordered so the drawer sits in its CIGAR section (instead of adding a sort there) | D-06, §1.3, L10 |
| Field-explorers without a check | Applied: checks on L04.1, L11.2 and others; lint | §7.4 |
| Companion recognition; L07.3 bin; L21.4 bins | Applied: `.bai`/`.tbi` items in L12.1 and Q4.5; bin relabelled; GFA2/GAF bins dropped | L07.3, L12.1, L21.4 |
| HGVS in LO8 but never taught | Applied: HGVS paragraph and a slider goal in L22.3 | L22 §3 |

**UX (23)**

| Finding | Disposition | Where |
|---|---|---|
| Pick targets under 24 px (major) | Applied: interactive metrics, padded hit areas, byte-range targets, e2e assertion | §7.1, §7.8, §10.6 |
| Length and whitespace defects need sight (major) | Applied: per-line descriptions in accessible names and a visible gutter; "View as table" never re-splits; DOM test | §7.1, §7.8, L04.2, L07.2, L09.2-3 |
| Simulators without text views (major) | Applied: `textView` required, specified per simulator; keyboard-only DOM tests | §7.5 |
| No no-JS fallback (major) | Applied: static fallback and `<noscript>`; check-dist and e2e checks | D-28, §11.5, §11.6 |
| Interactions not spread through sections (major) | Applied: boundary and per-H2 lint; L10 reordered; field-explorer added to L20 §1; several lessons' H2s restructured | §1.3, §5, L10, L20 |
| Capstone ending invites skipping L22 (major) | Applied: single "Next: Closing the case" call to action; S8 renamed; nudge on the badge page | D-10, §4, §6.2, §6.3 |
| Badge export would lose colours and fonts (major) | Applied for SVG: standalone exporter and e2e. **In part:** PNG export moved to the backlog (engineering minor on scope), so it is not specified | §6.3, §13 backlog |
| Dark theme and states not checked (major) | Applied: axe in both schemes and forced themes, seeded states, forced-colors smoke | §11.6, M1 |
| Read-more cards stacked before Recap | Applied: per-section placement and lint; complement pairs inline in L02.1 | §5 conventions, L02 |
| Stage letters out of order | Applied: "Case step n of 5 · name" labels; §0 reordered | §0, §5, §9.1 |
| Glyphs and emoji in status labels | Applied: Lucide icons; `<sup>` exponents; lint | §7, §10.2, §12.6 |
| Identical "Quick check" headings | Applied: titles as H3s; overline; Try-it cards labelled by their H2; uniqueness test | §5, §7 |
| Aside undefined on non-lesson routes | Applied | §10.1, §11.6 |
| Skip link and in-page jumps vs hash router | Applied: scripted skip link; exercise ids routable | §11.3 |
| Pipeline map on phones | Applied: vertical layout, 44-px nodes | §7.8 |
| Sorts and hex on phones | Applied: "Place in…" select; 8-byte hex rows; annotated range first | §7.3, §7.8 |
| iOS focus zoom | Applied (V-41) | D-26, §7.2, §10.1 |
| Interactions the data types cannot express | Applied: `followUps`; L13.2 free text replaced by a follow-up choice | §7, L06.2, L13.2, L19.1 |
| Double announcements | Applied | §7 |
| Capstone wide mode too narrow | Applied: aside column dropped; container query | §6.2, §10.1 |
| Brand names in the build and public docs | Applied in the plan (neutral wording, denylist). **In part:** the research notes are outside this plan's edit scope, so OQ-9 asked the owner (answered in v3: keep them as they are) | §10, O-08, OQ-9 |
| Progress code size | Applied (merged with the engineering minor) | D-23, §11.4 |
| `<!-- src -->` comments vs the raw-HTML rule | Applied (merged with the engineering major) | D-21, §11.1, §12.3 |

**Engineering (25)**

| Finding | Disposition | Where |
|---|---|---|
| Release-age gate blocks the owner-pinned toolchain (blocker) | Applied: exclusions for the exact-pinned closure; M0 frozen-install check; tech §13 rule overridden for that closure only | D-31, §11.2, M0 |
| `<DEL>` and `<!-- src -->` vs the raw-HTML rule (major) | Applied: source comments stripped and collected; backtick rule and message; round-trip tests | D-21, §11.1, §12.3 |
| Registry reload, strip-only TS, `.node-version` (major) | Applied: Vite module graph (V-44) with a static-scan fallback; tsconfig flags; exact 22.22.0; quiz and snippet ids in the registry | §11.1, §11.2, M0 |
| Data types cannot express key checks (major) | Applied: `validation` per round, item and option; subset assertion; field names | §7.1, §7.3, §7.7, §8.5 |
| Simulator goals not testable (major) | Applied: pure models with witnesses; `computeWith` required | §7.5, §7.6 |
| Validator scope beyond the owner's need (major) | Applied in part: content-driven coverage, runtime vs test-only rules, backlog and usage report. Structural rules of every graded format are still implemented (test-only), because the "no other diagnostics" key check needs them | §8.2, §8.3 |
| Size projection omits payload (major) | Applied: F01 head/tail, base table, precomputed keys, per-category report and M1 baseline | §6.2, §11.5, R-07 |
| Compressed files cannot be inspected or graded (major) | Applied: `compressed-text` snippets, `CapstoneFile`, download rules | D-20, D-27, §6.2, §7 |
| Oracle on the critical path (major) | Applied: blocking fixture builder with a manifest; weekly cross-check | D-32, §9.3, §11.7, M2 |
| Milestone criteria out of order (major) | Applied: course manifest; defect checks per milestone; M2 reproduces M1's records | D-37, §13 |
| Progress overwrites across copies and tabs (major) | Applied: merge semantics and tests | D-36, §11.4, R-19 |
| MIT vs bundled fonts and icons (major) | Applied: OQ-8; §0 and O-01 reworded | §0, O-01, OQ-8 |
| Exact bytes unprotected (major) | Applied: `.gitattributes`, `.editorconfig`, escapes, CR lint and test | §11.2 |
| No `kind` in frontmatter | Applied; glossary page dropped | §11.1, §11.2 |
| M6 cites an unused exercise; Read-more exercises counted | Applied | §5, §7, M6 |
| Unverified-claim check has nothing to check | Applied: `verification` fields, register as data, `COURSE_RELEASE` | §7, §12.3, §11.7 |
| Fix-it input unbounded | Applied | §7.2, §8.2 |
| Pages URL, fallback, tag pattern, `vpr` | Applied | D-28, D-29, D-33, §11.5, §11.7 |
| Downloads untested on `file://` | Applied (PNG export in the backlog) | §11.6, V-27 |
| Progress code includes answers | Applied | D-23, §11.4 |
| Soaked pins differ from prototypes | Applied | M0 |
| Features beyond the owner's request | Applied in part: cheat sheet, glossary route, PNG export and `.json` upload moved to the backlog; the print certificate (print styles exist anyway) and the `.json` download (full-state export) stay | §1.2, §6.3, §10.4, §13 |
| Tool versions not pinned | Applied: bedtools via the fixture image; Biopython, GATK, kent and svtools versions listed; "from the research notes" tags | §12.2 |
| axe dark; overlay geometry | Applied (merged with the UX major) | §7.2, §11.6 |
| Links not validated | Applied: rewrite and resolve | §11.1, §11.6 |
