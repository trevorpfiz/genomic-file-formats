# UX and visual design specification: "Genomic File Formats"

Status: draft v1 for build. Owner decisions in the project brief are treated as fixed. This document specifies layout, visual language, components, interaction states, accessibility, print and progress UX for the single-file HTML course.

Evidence tags used below:

- **[measured]**: measured by me from the two reference screenshots or from font files and npm packages (method stated).
- **[verified: source]**: checked against a primary source fetched for this spec (see Sources).
- **[inferred]**: reasoned from the screenshots where the live page could not be reached.
- **[decision]**: a design choice made here, open to owner review.
- **[from memory - verify]**: not checked against a source in this session.

---

## 0. Summary of key decisions

1. **Layout.** Two zones: a 44rem (704px) content column and an 18rem (288px) sticky right aside. They sit in a 1280px container on wide screens, mirroring the reference's 768 + 224 + 288 = 1280px geometry [measured]. Below 1080px the aside becomes a sticky 48px top bar that opens a sheet with two tabs: "On this page" and "Course outline".
2. **Type.** Three open-licensed families, latin subset only, embedded as woff2 data URIs:
   - **Source Serif 4** 500 for titles and H2s.
   - **Public Sans** Variable (roman and italic) for prose and UI.
   - **IBM Plex Mono** 400 and 600 for code and genomic snippets.
   Together they add about **139 KB** to the HTML file and about 105 KB over the wire with gzip [measured]. A "lean" fallback (system sans) costs 68 KB. A system-only build costs 0 KB.
3. **Color.** Warm neutrals close in feel to the reference (#F9F8F5 page, #45433E body text). The accent is **deep teal** (#0B6B66 light, #5EC4BA dark), deliberately not the reference brand's clay/orange. Every text/background pair in the token tables passes WCAG AA, and control boundaries pass 3:1 [measured with WCAG formula]. Status is always icon plus text, never color alone.
4. **Snippet viewer.** This is the course's signature component. It has a raw and an aligned view, toggleable whitespace markers (tab arrows, space dots, CR and non-ASCII chips), sticky line numbers, horizontal scroll with an "Expand" dialog, per-field column highlighting, linked SEQ/QUAL hover, a "View as table" screen-reader alternative, and a hex variant for BAM, CRAM and gzip.
5. **Exercises.** One shared card anatomy and one five-state model (idle, attempted, incorrect, correct, revealed) across all seven component types. Retries are unlimited in "Try it" exercises. Section quizzes score the first attempt per question and can be retaken. Every drag interaction has a click and keyboard alternative (WCAG 2.5.7).
6. **Progress.** Stored in `localStorage` under one namespaced, versioned key, with an in-memory fallback, a visible "not saved" notice and a copy/paste progress code. The code is needed because the hosted copy and the file:// copy have separate storage.
7. **Inspiration only.** No Anthropic or Claude names, logos, illustrations, proprietary fonts, brand accent color or copywriting. The structural ideas (breadcrumb, serif title, meta pills, READ MORE cards, "Try it" sections, Recap, lesson switcher with outline, TOC with active bar) are generic documentation patterns, and we re-skin them.

---

## 1. Reference analysis (what we are inspired by)

The live pages (academy.claude.com/courses/claude-code-101 and its /code-review lesson) were **unreachable**. WebFetch failed with a DNS error and curl got a proxy 403. Everything below comes from the two supplied screenshots. Behavior of the "Try it: sort the four findings" exercise, quizzes and Recap could not be observed and is marked [inferred].

### 1.1 Observed layout [measured from screenshots]

| Element | Observation |
|---|---|
| Container | Content column about 768px wide, gap about 224px, aside card about 287px wide. 768 + 224 + 288 = 1280px total. Same content width at a 1446px and a 2000px window. |
| Page background | #F9F9F7 (warm off-white). Aside and READ MORE card surfaces #FCFCFB. Code block #FFFFFF. |
| Text | Headings #0B0B0B (near-black). Body #52514E (warm gray, 7.53:1 on page). |
| Breadcrumb | "← Academy / Courses / Claude Code 101". Left arrow, slash separators, about 14-15px, gray. The current lesson is **not** repeated in the breadcrumb; the H1 follows directly. |
| Title (H1) | Serif, medium weight, cap height 27px, so about 40px font size. Tight tracking. |
| Meta pills | "Lesson 7" with an open-book icon, "10 min" with a clock icon. Pill fill #EDEDEB, thin border, full radius, about 28px tall. |
| Body | Sans, about 16-17px on a 26px line pitch. About 98 characters per line (long). |
| H2 | Serif, cap height 16px, so about 24px. Large space above (about 80px). |
| Inline code | Mono chip with a light border and white fill. The same style is used for keys ("Enter", "Esc"). |
| Code block | Single-line command, white, 1px border, radius about 8px, copy icon at the right. |
| READ MORE card | Full-width card: icon in a bordered square tile, "READ MORE" overline (small caps, gray), bold title ("Nothing shows up in /diff?"), chevron at the right. Collapsed by default. |
| Lists | Bullets with **bold lead-in phrase** then explanation. |
| Aside, collapsed | Card: "Lesson 7 of 12 · Claude Code 101" (small gray) over "Code review" (bold) with a chevron. Below the card, outside it, the in-page TOC: H2 titles at about 14.5px on a 32px row pitch. The **active item is bold and dark with a 2px dark bar at the left**; inactive items are gray with no visible track. Long items wrap. TOC includes "Try it: sort the four findings" and "Recap" as H2-level entries. |
| Aside, expanded | The card grows downward into the full outline and the TOC is hidden. Section labels are small gray sentence case ("Daily workflows", "Quiz"). Each lesson row has a circular check icon and a title. The current lesson row has a #F0F0EF fill. The quiz row has a right-aligned **"Passed"** pill with an icon. The last row is "Completion badge" with a gold medal icon. Row pitch is about 32px. |
| Check icons | Very low contrast (#E3E3E2 on #FCFCFB = 1.25:1). We must do better (WCAG 1.4.11 requires 3:1 for state-bearing graphics). |

### 1.2 Inferred behavior [inferred]

- "Try it" exercises are H2 sections near the end of the lesson, so they appear in the TOC. The lesson text leading into the exercise describes a scenario ("Claude's summary on top, the eight files...") and the exercise asks the learner to sort "findings" into decision categories, probably the "Decide what to do with each finding" options taught earlier.
- "Recap" is the final H2 of every lesson.
- There is one course-level quiz at the end. Our course instead has a quiz at the end of each section, a capstone and a badge.

### 1.3 What we do NOT borrow [decision]

- The names "Claude", "Anthropic" or "Academy" anywhere in UI copy. The breadcrumb root is the course title.
- Logos, the brand's spark or asterisk mark, illustrations, the gold medal artwork, or the reference's copywriting.
- Proprietary brand fonts. The reference appears to use a custom serif and sans [from memory - verify which]. We use OFL fonts.
- The brand's clay/terracotta accent (about #D97757) [from memory - verify]. Our accent is teal.
- The exact gray values. Ours are re-derived and slightly warmer, so screens should feel related but not identical.

---

## 2. Information architecture and routes

The app is a single HTML file with **hash routing**, which works from file:// and GitHub Pages; History API routing does not work from file:// [verified: vite-plugin-singlefile README].

| Route | Page | Breadcrumb | Lesson switcher label |
|---|---|---|---|
| `#/` | Course home | none | "Course overview" |
| `#/lesson/<slug>` | Lesson | `← Genomic File Formats / <Section>` | "Lesson 9 of 22 · <Section>" |
| `#/lesson/<slug>/<heading-id>` | Lesson scrolled to an H2 | same | same |
| `#/quiz/<section-slug>` | Section quiz | same | "Section quiz · <Section>" |
| `#/capstone` | Capstone: triage the case folder | `← Genomic File Formats` | "Capstone" |
| `#/badge` | Completion badge | `← Genomic File Formats` | "Completion badge" |
| `#/about` | Credits, licenses, data sources, settings | `← Genomic File Formats` | n/a |

- **Document title** on each route: `<Page title> · Lesson 9 · Genomic File Formats`. Quiz pages use `Section quiz: Alignments · Genomic File Formats`.
- **Route change** scrolls to top (or to the heading), sets the title, and moves focus to the H1 (`tabindex="-1"`) or to the target H2. The new title is announced by screen readers through focus.
- **Heading anchors**: every H2 has a stable id. On hover or focus, a small "#" link button appears at the left edge, outside the column, with accessible name "Copy link to section: <title>".

---

## 3. Page layout and grid

### 3.1 Desktop wireframe (at least 1280px)

```text
|<------------------------------ max 1280px, centered ------------------------------>|
| ← Genomic File Formats / Alignments                    +------------------------------+
|                                                        | Lesson 9 of 22 · Alignments v|
| Reading a CIGAR string            (H1, serif)          | Reading a CIGAR string       |
| (Lesson 9) (10 min) (0 of 3 exercises)                 +==============================+ <- 2px progress
|                                                        | ┃ The read's story            |
| Intro paragraph ................................       |   Operations that eat bases  |
|                                                        |   Try it: draw r001           |
| The read's story              (H2, serif)              |   Recap                       |
| Prose .......................................          |                               |
| +--------------------------------------------+         |   Theme: System v             |
| | proband_subset.sam   SAM  · 3 lines   [..] |         |                               |
| | 1 | r001  99  chr2  166013501 ...  ->      |         |                               |
| +--------------------------------------------+         |                               |
| +--------------------------------------------+         |                               |
| | [book] READ MORE                           |         |                               |
| |        Why is POS 1-based?              v  |         |                               |
| +--------------------------------------------+         |                               |
|<---------- content 44rem (704px) ---------->|<-gap->|<------ aside 18rem ------>|
```

### 3.2 Mobile wireframe (360px)

```text
+------------------------------------+
| [list] Lesson 9/22 · The read's s.. v [◐] |  <- sticky top bar, 48px
+------------------------------------+
| ← Genomic File Formats / Alignments|
| Reading a CIGAR                    |
| string                             |
| (Lesson 9) (10 min)                |
| Intro paragraph ...........        |
| +--------------------------------+ |
| | proband_subset.sam  SAM   [⋯] | |  <- toolbar collapses to a menu
| | 1 r001  99  chr2  1660135… ->  | |  <- horizontal scroll
| +--------------------------------+ |
+------------------------------------+
```

### 3.3 Grid and breakpoints [decision]

The root font size is 100%, so user font settings are respected. All sizes below are in rem with px at the default 16px.

| Name | Viewport | Layout | Gutters | Body size |
|---|---|---|---|---|
| xs | < 480px | Single column; top bar; prev/next stacked | 16px | 17px |
| sm | 480-767px | Single column; top bar | 20px | 17px |
| md | 768-1079px | Single column centered, max 44rem; top bar | 32px | 18px |
| lg | 1080-1279px | Grid: `minmax(0,44rem) 3rem 16rem`; sticky aside | 32px | 18px |
| xl | at least 1280px | Grid: `minmax(0,44rem) clamp(3rem,10vw,14rem) 18rem`, container max 1280px, centered | 40px | 18px |

- **Prose measure.** Public Sans averages 0.447em per character on English text [measured from hmtx widths on a sample paragraph]. At 18px that is about 8.0px per character, so the 704px column holds about **87 characters**. That sits within the 45-90 range typography guides recommend [from memory - verify], and is shorter than the reference's about 98. At 17px on phones the column is the screen.
- **One column width for everything.** Paragraphs, cards, snippets and figures share both edges, as in the reference. Wide content scrolls horizontally inside its own container or opens in the "Expand" dialog. Nothing breaks out of the column. This keeps the page free of horizontal scroll and simple to reflow.
- **Wide mode** applies to `#/capstone` only: the content zone grows to `min(100%, 72rem)` and the aside shows only the collapsed switcher card (no TOC) at all widths.
- **Sticky aside.** The aside is `position: sticky; top: 24px; max-height: calc(100dvh - 48px)`. Inside, the expanded outline scrolls with `overflow: auto; overscroll-behavior: contain`. The page itself uses `scrollbar-gutter: stable` so opening the outline never shifts layout [verified: BCD, Chrome 94 / Firefox 97 / Safari 18.2].
- **Sticky top bar** (below 1080px) is `position: sticky; top: 0; height: 48px` with a solid `--bg` background and a bottom border. Set `html { scroll-padding-top: 64px }` and `h2, h3, [id] { scroll-margin-top: 72px }` so anchor jumps and focused elements are never hidden under it (WCAG 2.4.11).
- **Vertical rhythm.** H2 margin-top 4rem (64px); H3 margin-top 2.25rem; paragraph spacing 1.1em; block components (snippet, card, figure, exercise) take margin-block 1.5rem, or 2rem for exercises.

### 3.4 Spacing, radii, elevation, z-index tokens [decision]

| Token | Value | Use |
|---|---|---|
| `--s-1` to `--s-10` | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px | Spacing scale (4px base) |
| `--r-chip` | 6px | Inline code chips, kbd |
| `--r-control` | 8px | Buttons, inputs, code blocks |
| `--r-card` | 14px | READ MORE, exercise, callout, aside cards |
| `--r-dialog` | 18px | Dialogs, mobile sheet |
| `--r-pill` | 999px | Meta pills, status pills |
| `--shadow-pop` | `0 1px 2px rgb(28 27 25/.08), 0 8px 24px rgb(28 27 25/.12)`; dark `0 8px 24px rgb(0 0 0/.5)` | Popovers, drag ghost, dialogs only. Cards are flat with borders, like the reference. |
| z-index | content 0, sticky aside 10, top bar 20, popovers 30 | Dialogs use the top layer via `<dialog>.showModal()`. |

---

## 4. Lesson page anatomy

The DOM order is fixed, and the visual order matches it (WCAG 1.3.2, 2.4.3):

1. Skip link: "Skip to lesson content" (first focusable element, visible on focus).
2. `<header>` (top bar, small screens only).
3. `<main>`: breadcrumb, H1, meta pills, intro, H2 sections (prose, components and exercises interleaved), "Recap" H2, lesson status line, prev/next.
4. `<aside aria-label="Course navigation">`: lesson switcher (disclosure plus outline), `<nav aria-label="On this page">` TOC, theme control.
5. Footer (small, muted): "Progress saved in this browser" state, link to About, license line.

### 4.1 Breadcrumb

- `<nav aria-label="Breadcrumb"><ol>`: `← Genomic File Formats` / `<Section name>`. The arrow is an inline SVG inside the first link, so the whole "← Genomic File Formats" is one target. The section link opens course home scrolled to that section.
- 15px Public Sans 400, `--text-muted`; links turn `--text` with an underline on hover. Separators are "/" in `--border-strong`, `aria-hidden="true"`.
- The current page is not listed, matching the reference. The H1 is the current location.
- On xs, the trail truncates with an ellipsis in the middle segment. Full text is available via a `title` attribute and via the link's accessible name.

### 4.2 Title (H1)

- Source Serif 4 500 at 2.625rem/1.1 (42px) on md and up; 2.125rem (34px) on xs and sm. `letter-spacing: -0.015em; text-wrap: balance` [verified: BCD, balance in Chrome 114 / Firefox 121 / Safari 17.5].
- 12px below the breadcrumb, 16px above the pills.

### 4.3 Meta pills

- Pills: `Lesson 9` (book-open icon), `10 min` (clock icon), and an exercise pill whose label is `0 of 3 exercises`, then `2 of 3 exercises`, then `Completed` (circle-check icon, success tint).
- Each pill: 28px tall, padding 0 10px, gap 6px, 14px Public Sans 500, `--sunken` fill, 1px `--border`, `--text-muted` text, `--r-pill`. Icons are 14px, `aria-hidden`. Pills are not interactive and have no hover state.
- Quiz pages use `Section quiz` (list-checks), `8 questions`, `Pass mark 80%`, and after passing a `Passed · 8/8` success pill.
- 32px gap from the pills to the intro paragraph.

### 4.4 Prose typography

| Role | Font | Size / line-height (md+) | Size (xs-sm) | Notes |
|---|---|---|---|---|
| H1 | Source Serif 4 500 | 42/46px | 34/38px | balance |
| H2 | Source Serif 4 500 | 28/35px | 24/30px | balance; in TOC |
| H3 | Public Sans 600 | 20/27px | 18/25px | not in TOC |
| Body | Public Sans 400 | 18/30px (1.65) | 17/27px | `--text-body`; `text-wrap: pretty` as progressive enhancement |
| Strong / lead-in | Public Sans 600 | inherit | inherit | `--text` color |
| UI (TOC, outline, buttons) | Public Sans 400/500/600 | 15/22px | 15/22px | |
| Caption, meta | Public Sans 400 | 14/20px | 14/20px | `--text-muted` |
| Overline (READ MORE, TRY IT, CASE FILE) | Public Sans 600 | 12/16px, uppercase, `letter-spacing: .08em` | same | `--text-muted` |
| Inline code | IBM Plex Mono 400 | 0.86em | 0.86em | chip (4.5) |
| Code block | IBM Plex Mono 400 | 14.5/23px | 13.5/21px | |
| Snippet viewer | IBM Plex Mono 400/600 | 14/22px | 13/20px | |

Content conventions:

- **Gene symbols** are italic in prose (*SCN1A*), following HGNC style; proteins are roman [from memory - verify]. Use `<i class="gene">`. Never italicize inside mono.
- **Numbers.** Prose uses thousands separators (166,013,501). Code and snippets show file bytes verbatim. Scores, counts and coordinates in UI use `font-variant-numeric: tabular-nums`.
- **Lists.** Bullets in `--text-muted`, 0.5em between items. Use the reference's "**Bold lead-in.** Explanation" pattern for any list item with two or more sentences.
- **Links.** `--accent`, underline 1px with `text-underline-offset: .2em`, thickness 2px on hover. External links get a small arrow-up-right icon and `rel="noopener"`. They are rare: the file must work offline.
- **Prose tables** (field definitions etc.): 15px, horizontal rules only, header row on `--sunken`, mono first column for field names, wrapped in a focusable horizontal-scroll region on small screens.
- **Hyphenation** is `hyphens: manual`, so gene names and identifiers are never auto-hyphenated. Code chips use `overflow-wrap: anywhere` so long accessions (NC_000002.12) cannot overflow.

### 4.5 Inline code chips and keys

- `<code>`: Plex Mono 400 at 0.86em, padding 0.1em 0.35em, `--raised` fill, 1px `--border`, `--r-chip`, `--text` color. These look like the reference's chips.
- `<kbd>`: same as `<code>`, plus a 2px bottom border in `--border-strong` so keys read differently from code (the reference styles them identically; we distinguish them).
- Chips never wrap mid-token except for very long tokens (`overflow-wrap: anywhere`).

### 4.6 Code block with copy button (commands and short code)

- Anatomy: optional title bar (filename or "Shell", 13px muted, bottom border), then a `<pre><code>` body on `--raised` with a 1px `--border`, `--r-control`, padding 12px 16px. Plex Mono 14.5px.
- Copy button: a 32x32px icon button (Lucide `copy`), top-right for multi-line blocks and vertically centered for single-line blocks (as in the reference). Accessible name "Copy code". On success, the icon swaps to `check` for 2s with a visible "Copied" label beside it, and a `role="status"` region announces "Copied to clipboard."
- **Copy fallback chain:** `navigator.clipboard.writeText` [verified: BCD], then `document.execCommand('copy')` on a hidden textarea, then "Couldn't copy automatically. The text is selected; press Ctrl+C (⌘C on Mac)." with the code selected. Clipboard access from file:// pages depends on the browser treating file:// as a secure context [from memory - verify per browser].
- Shell prompts (`$ `) and output lines are wrapped in `<span data-nocopy>` with `user-select: none`, and they are excluded from the copied text.
- Horizontal scroll, never wrap. Wrapping changes the meaning of commands and tabular text.

### 4.7 READ MORE disclosure cards

The purpose is optional depth: spec minutiae, history, edge cases. **Content rule:** quizzes and graded exercises never depend on READ MORE-only content [decision].

- Built on native `<details class="readmore"><summary>`. This gives disclosure semantics, Enter and Space toggling [verified: APG disclosure pattern], and automatic opening on browser find-in-page [verified: BCD `search_match_opens`, Chrome 97 / Firefox 148 / Safari 26.2].
- Summary row (min-height 64px, padding 12px 16px): a 32x32px icon tile (`--raised`, 1px `--border`, radius 8px, Lucide `book-open` 16px), a two-line text block (overline "READ MORE", then the title in 16px Public Sans 600 `--text`), and a chevron-down that rotates 180° when open (instant under reduced motion).
- Card: `--surface`, 1px `--border`, `--r-card`. Hover: border `--border-strong`. Focus-visible: the standard focus ring on the summary.
- Body: padding 0 20px 20px 64px, aligned under the title. 16.5px prose; may contain code blocks, snippets and figures, but **no graded exercises**.
- Opening animation (optional): height animation via `::details-content` plus `interpolate-size: allow-keywords` where supported. These are Chromium-first [verified: BCD, interpolate-size Chrome 129 only; ::details-content Chrome 131 / Firefox 143 / Safari 18.4]. Elsewhere it opens instantly.
- In print, all READ MORE cards are forced open (section 13).

Variants share this anatomy with a different overline and icon:

- "SPEC DETAIL" (Lucide `scroll-text`) for verbatim spec rules with section citations.
- "WHY IT MATTERS" (Lucide `target`) for clinical relevance.

### 4.8 Callouts (always visible)

Anatomy: 1px border, 4px left rule, tinted background, 16px padding, `--r-card`, overline label with icon. The label text carries the meaning; color only reinforces it.

| Variant | Overline + icon | Light bg / rule | Dark bg / rule | Use |
|---|---|---|---|---|
| Note | NOTE · `info` | `--info-bg` / `--info` | same tokens | Neutral clarification |
| Tip | TIP · `lightbulb` | `--accent-subtle` / `--accent` | same | Practical shortcut |
| Watch out | WATCH OUT · `triangle-alert` | `--warning-bg` / `--warning` | same | Pitfalls (e.g. 0-based vs 1-based) |
| From the spec | FROM THE SPEC · `scroll-text` | `--surface` / `--border-strong` | same | Short verbatim quote plus citation ("SAMv1 §1.4") |
| Case file | CASE FILE · `folder-open` | `--case-bg` / `--case-border` | same | Story beats (4.9) |

Limit: at most one callout per screenful. Never stack two callouts directly.

### 4.9 Case file callout (story thread)

The fictional trio story runs through the course, so it gets a recognizable "case folder" treatment:

- Header row: a mini **pedigree glyph** (inline SVG, 40x24px) for father (square), mother (circle) and proband (filled square, since affected, with the proband arrow), using standard pedigree symbols [from memory - verify: NSGC pedigree nomenclature]. Next to it the overline "CASE FILE" and a step label ("Step 4 of 11: Coverage").
- Body: 1-3 short paragraphs; can include **file chips** (mono chip plus size: `proband.cram · 6.1 GB`) that link to the snippet in the lesson.
- Background `--case-bg` (#F5EFE3 light, #2A251C dark): body text 8.63:1 and 10.07:1 [measured].
- The pedigree glyph has `role="img"` and `aria-label="Trio: father and mother unaffected; son, the proband, affected"`.
- The story must not use flashing or rapid animation anywhere, given the seizure context (WCAG 2.3.1 and simple sensitivity).

### 4.10 Figures and diagrams

- `<figure>` plus **inline SVG**, authored with CSS custom properties (`fill: var(--fig-accent)`, `stroke: currentColor`) so figures theme automatically. No raster images except where unavoidable (embedded as data URIs).
- SVG text uses real `<text>` in Public Sans at no less than 12px rendered size, and Plex Mono for bases and coordinates.
- Caption: `<figcaption>` 14px `--text-muted`, prefixed "Figure 5.2:". The caption explains what to notice, not just what it is.
- Alt text: `role="img"` with `aria-labelledby` pointing to `<title>` and `<desc>`. Complex figures add a "Describe this figure" READ MORE card holding a text or table equivalent.
- **Genome-browser conventions**, shared across lessons so learners build one visual vocabulary:
  - Ruler on top with tabular tick labels, 1-based by default. When a figure shows 0-based coordinates, a "0-based" tag sits on the ruler.
  - Gene model: thick boxes for CDS exons, thinner boxes for UTRs, a line for introns with strand chevrons every 40px.
  - Reads: thin bars with a pointed end showing strand. Mismatches are drawn as the base letter in a box.
  - Coverage (WIG): a single-series area chart, `--accent` at 25% fill with a 1.5px `--accent` line, a baseline, 3-4 y ticks labelled "Depth", and no gridlines. Dips are annotated with a bracket and a text label, never color alone.
  - Breakpoints (BEDPE): two intervals joined by an arc, with each foot labelled.
- **Pipeline map** (course home, section intros, capstone, badge). One reusable diagram of the bigger picture: FASTQ to SAM/BAM/CRAM to gVCF to VCF, plus BED targets, WIG coverage, GTF/GFF3 annotation, BEDPE breakpoints and PAF/GFA long reads, each node labelled with its format. Node states:
  - not yet visited: outline only
  - visited: filled `--sunken` plus label
  - mastered (section quiz passed): `--accent-subtle` fill plus a check icon
  The state is shown by shape and icon as well as fill. The text equivalent is an ordered list with the same states.
- Max width is the column. Large diagrams may horizontally scroll inside a focusable region with an "Expand" button (same dialog as the snippet viewer).

### 4.11 Recap section [decision]

The last H2 is always "Recap":

1. 3-5 bullets, each with a bold lead-in (the reference list pattern) stating a takeaway in the learner's terms.
2. An **"At a glance" format card** when the lesson introduces a format. It is a two-column definition grid: Extension(s), Text or binary, Delimiter, Coordinates, Header lines, Index file, Spec. Plex Mono for values. These cards are also gathered on the course home ("Format cheat sheet", printable).
3. A one-line "Next:" story hook linking to the next lesson.

### 4.12 Lesson status line and prev/next navigation

- Status line above the nav:
  - `circle-check` "Lesson complete" (success), or
  - `circle-dashed` "2 exercises left in this lesson", where each remaining exercise is a link that jumps to it.
- Nav: `<nav aria-label="Lesson navigation">` with two cards in a 1fr 1fr grid (stacked on xs, with Previous first in both DOM and visual order).
  - Card: overline "PREVIOUS" or "NEXT", then the title on one line in 16px 600 and the meta "Lesson 8 · 9 min" on the next. Arrow icon at the outer edge.
  - Next card: `--accent` 1px border and an accent arrow. Previous card: neutral border.
  - The whole card is a single link (min-height 72px).
  - At a section end, Next points to the section quiz. After the last quiz, it points to the capstone, then the badge.
- There are no single-key keyboard shortcuts for navigation, which avoids WCAG 2.1.4 conflicts.

---

## 5. Type system and fonts

### 5.1 Recommendation [decision; sizes measured]

| Role | Family (npm package, version) | Files embedded (latin subset only) | Raw woff2 |
|---|---|---|---|
| Display / H1-H2 | Source Serif 4 (`@fontsource/source-serif-4` 5.3.1, OFL-1.1) | `source-serif-4-latin-500-normal.woff2` | 21.0 KB |
| Text and UI | Public Sans Variable, wght 100-900 (`@fontsource-variable/public-sans` 5.3.0, OFL-1.1) | `public-sans-latin-wght-normal.woff2`, `public-sans-latin-wght-italic.woff2` | 26.2 + 27.6 KB |
| Code and snippets | IBM Plex Mono (`@fontsource/ibm-plex-mono` 5.3.0, OFL-1.1) | `ibm-plex-mono-latin-400-normal.woff2`, `ibm-plex-mono-latin-600-normal.woff2` | 14.4 + 15.3 KB |
| **Total** | | 5 files | **104.5 KB raw, 139.3 KB as base64 in the HTML, 105.4 KB gzipped** [measured] |

Why these:

- **Source Serif 4** gives the editorial serif title feel of the reference with an open license. One static weight (500) covers H1 and H2.
- **Public Sans** is a neutral grotesque (x-height 0.517em) [measured]. At 0.447em per character it gives an 87-character line at 18px in the 704px column. Source Sans 3 was rejected: at 0.387em per character it would put about 100 characters on a line [measured]. The variable font gives every weight the UI needs (400, 500, 600) plus a true italic for gene symbols and emphasis, for about the cost of two static files.
- **IBM Plex Mono** has no programming ligatures in the subset (GSUB features are only ccmp, dnom, frac, numr) [measured]. Ligatures must never alter genomic text: JetBrains Mono, by contrast, ships `calt` [measured], which can merge sequences like `<*>`, a real gVCF ALT allele [from memory - verify which sequences it ligates]. Plex Mono's zero has three contours (dotted or slashed), so it is distinguishable from O [measured]. Its x-height (0.516) matches Public Sans (0.517), so inline code sits evenly in prose [measured]. It is also the cheapest of the candidates measured.

Alternatives measured:

| Option | Contents | HTML cost (base64) | Gzipped |
|---|---|---|---|
| **Lean** | Serif 500 + Plex Mono 400/600; sans = system-ui stack | 67.5 KB | 51.1 KB |
| **Rich** | Source Serif 4 opsz variable (true display optical sizes) + Inter Variable roman/italic + JetBrains Mono Variable | 342.3 KB | 259.1 KB |
| **System only** | No embedded fonts | 0 KB | 0 KB |
| Pitfall | Importing each package's `index.css` (all 5-7 subsets; the static packages also list a `.woff` fallback per face) | at least 490 KB | n/a |

The static Source Serif 4 instance is the default optical size (opsz 14) [measured from package metadata], which is slightly heavier and looser at 42px than a display cut. The Rich option fixes that for about 98 KB more. That is not worth it for v1.

### 5.2 How to embed (build gotcha)

vite-plugin-singlefile's recommended config sets `build.assetsInlineLimit = () => true`, so **every** asset referenced from CSS becomes a data URI [verified: plugin `src/index.ts`]. The @fontsource static CSS lists `url(...woff2) format('woff2'), url(...woff) format('woff')` per face, and `index.css` declares every subset [verified: package contents]. Both would be inlined. Therefore:

- **Do not** `import "@fontsource/..."` or its CSS. Write our own `fonts.css` with five `@font-face` rules pointing directly at the latin woff2 files in `node_modules`, for example:

```css
@font-face {
  font-family: "Public Sans";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("@fontsource-variable/public-sans/files/public-sans-latin-wght-normal.woff2") format("woff2");
}
```

  Whether Vite resolves a bare package path inside CSS `url()` should be checked during the build [from memory - verify]. A relative `node_modules/...` path or a Vite alias works as a fallback.
- **Build check (CI):** the built `dist/index.html` must contain exactly 5 `data:font/woff2` URIs, no `.woff"` URLs, and no `https://` font URLs.
- **Glyph coverage.** The latin subset ranges are `U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD` [verified: package CSS]. They include the middle dot (U+00B7), en and em dashes, the minus sign and up/down arrows, but **not** → (U+2192), ⇥ (U+21E5), ✓, ✗, ≤ or ≥. Therefore:
  - all UI arrows, checks and crosses are SVG icons (6.1)
  - tab markers in the snippet viewer are drawn with CSS, not with a glyph
  - prose may use → and ≥ (they fall back to a system font), but snippets must not depend on them
- **Licensing.** OFL-1.1 permits embedding and redistribution with the license. Include the OFL notices for the three families in `LICENSES/` in the repo and on the `#/about` page, and keep the font names as is (no "reserved font name" conflicts arise from unmodified use) [from memory - verify OFL RFN wording].

### 5.3 Fallback stacks (also the System-only build)

```css
--font-serif: "Source Serif 4", "Iowan Old Style", "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
--font-sans:  "Public Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono:  "IBM Plex Mono", ui-monospace, "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, "Liberation Mono", monospace;
```

- Mono everywhere: `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0;`. This is defensive in case a fallback mono has ligatures.
- `font-synthesis: none` on mono, so no fake bold or italic. Snippets use only 400 and 600.
- Because fonts are inline, there is no network wait. `font-display: swap` is kept for the brief decode period.

---

## 6. Color and design tokens

### 6.1 Icons

**Lucide** (`lucide-static` 1.58.0, ISC license, MIT-compatible) [verified: npm registry]. Import about 35 individual SVGs as raw strings (about 300-500 bytes each, about 12 KB total), not the whole package. Names verified to exist in the Lucide repo [verified]: `book-open, clock, copy, check, chevron-down, chevron-right, arrow-left, arrow-right, circle, circle-check, circle-dashed, circle-dot, circle-dot-dashed, circle-x, circle-question-mark, award, badge-check, medal, lock, lightbulb, triangle-alert, info, scroll-text, target, folder-open, file-text, grip-vertical, rotate-ccw, eye, maximize-2, sun, moon, monitor, list, list-checks, hash, text-search, text-wrap, pilcrow, space, arrow-right-to-line, corner-down-left, mouse-pointer-click, dna, printer, download, upload`.

Icons are 16px in UI and 14px in pills, with `stroke-width: 1.75` and `currentColor`. Decorative icons get `aria-hidden="true"`; icon-only buttons get an accessible name.

### 6.2 Core tokens: light theme

Contrast ratios were computed with the WCAG 2.x relative-luminance formula [measured].

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--bg` | #F9F8F5 | Page | n/a |
| `--surface` | #FDFCFA | Cards: READ MORE, exercise, aside, callouts | n/a |
| `--raised` | #FFFFFF | Code blocks, snippet viewer, inputs, bins | n/a |
| `--sunken` | #F0EEE8 | Pills, hover rows, current outline row, table headers | n/a |
| `--border` | #E2DED6 | Decorative card borders | Decorative only |
| `--border-strong` | #8A857B | Control boundaries (inputs, radios, checkboxes, bins), whitespace markers, hollow status icons | 3.46 on bg, 3.67 on raised, 3.16 on sunken |
| `--text` | #1C1B19 | Headings, strong, active TOC, selected | 16.21 on bg |
| `--text-body` | #45433E | Prose | 9.30 on bg, 8.52 on sunken |
| `--text-muted` | #68645C | Meta, labels, inactive TOC, captions | 5.54 on bg, 5.08 on sunken, 5.89 on raised |
| `--accent` | #0B6B66 | Links, primary buttons, focus ring, progress bar, "Next" card | 5.98 on bg; white text on accent 6.35 |
| `--accent-hover` | #085551 | Hover and pressed | 8.14 on bg |
| `--accent-subtle` | #E2F0EE | Selected items, Tip callout, mastered nodes | accent on it 5.42; text on it 14.70 |
| `--focus` | = `--accent` | 2px focus outline, 2px offset | 5.98 vs bg (3:1 needed) |
| `--success` / `--success-bg` | #1D7A3E / #E5F3E9 | Correct, Passed, valid | 5.06 on bg; 4.69 on its bg; white on success 5.38 |
| `--error` / `--error-bg` | #B3261E / #FBEAE7 | Incorrect, invalid, diagnostics | 6.15 on bg; 5.61 on its bg |
| `--warning` / `--warning-bg` | #8A5200 / #FBF0DA | Watch-out callouts, hints | 5.65 on its bg |
| `--info` / `--info-bg` | #2B5AA8 / #E6EEFA | Note callouts | 5.74 on its bg |
| `--mark` | #FFEDB0 | Highlighted token or find highlight | text on it 14.75 |
| `--case-bg` / `--case-border` | #F5EFE3 / #D9CBB0 | Case file callouts | body text 8.63, muted 5.14 |
| `--gold` / `--gold-fill` | #8C6200 / #E2B84A | Badge text accents / badge illustration only | #8C6200 on bg 5.12 |

### 6.3 Core tokens: dark theme

| Token | Value | Contrast |
|---|---|---|
| `--bg` | #1A1917 | n/a |
| `--surface` | #201F1C | n/a |
| `--raised` | #252421 | n/a |
| `--sunken` | #2E2C28 | n/a |
| `--border` | #3B3934 | Decorative |
| `--border-strong` | #7A756C | 3.84 on bg, 3.39 on raised, 3.04 on sunken |
| `--text` | #F2F0EB | 15.43 on bg |
| `--text-body` | #D5D2CA | 11.63 on bg, 9.22 on sunken |
| `--text-muted` | #A29E95 | 6.58 on bg, 5.22 on sunken, 5.81 on raised |
| `--accent` | #5EC4BA | 8.43 on bg; **dark text (#1A1917) on accent buttons**: 8.43 |
| `--accent-hover` | #80D4CB | 10.20 on bg |
| `--accent-subtle` | #163330 | accent on it 6.50 |
| `--success` / `--success-bg` | #63C985 / #15301F | 8.55 / 6.93 |
| `--error` / `--error-bg` | #F28B80 / #3B1C19 | 7.35 / 6.43 |
| `--warning` / `--warning-bg` | #E6B45E / #362A14 | 7.38 |
| `--info` / `--info-bg` | #8AB4F8 / #1B2940 | 6.93 |
| `--mark` | #4B4120 | text on it 8.88 |
| `--case-bg` / `--case-border` | #2A251C / #4D4332 | body 10.07, muted 5.70 |
| `--gold` / `--gold-fill` | #E2B84A / #E2B84A | 9.36 on bg |

### 6.4 Data colors (snippets and figures)

**Field tints** for per-column highlighting in the snippet viewer. They cycle 1-8. Hues are spaced around the wheel, loosely following the Okabe-Ito colorblind-safe palette [from memory - verify]. They are **always paired with a non-color cue** (column header label, outline, legend), so hue discrimination is never required.

| # | Light | Dark | Text on tint (light / dark) |
|---|---|---|---|
| f1 blue | #DCEAF9 | #1F3651 | 14.08 / 10.82 |
| f2 orange | #FCE5CC | #4A3217 | 14.11 / 10.48 |
| f3 green | #DCEFE2 | #1D3E2A | 14.33 / 10.39 |
| f4 purple | #ECE2F6 | #372B4C | 13.75 / 11.44 |
| f5 yellow | #F8EFC4 | #443E18 | 14.86 / 9.47 |
| f6 teal | #D5EEEE | #163F40 | 14.17 / 10.14 |
| f7 rose | #F8DCE6 | #4B2434 | 13.42 / 11.52 |
| f8 stone | #E8E5DF | #35332F | 13.69 / 11.07 |

**Base colors** for the optional "Color bases" toggle (off by default). They follow the genome-browser convention A green, C blue, G orange, T red [from memory - verify IGV defaults], darkened for text contrast. The letter itself is the information, so color is redundant by design.

| Base | Light (on #FFF) | Dark (on #252421) |
|---|---|---|
| A | #1A7334 (5.92) | #6BCB86 (7.77) |
| C | #1F5BB8 (6.47) | #7FAEF5 (6.86) |
| G | #9A5700 (5.62) | #E3A857 (7.39) |
| T | #B42330 (6.51) | #F28A8F (6.51) |
| N / other | `--text-muted` | `--text-muted` |

**Quality (Phred) bars:** bar height encodes Q, which is the primary cue. Color is a 4-step single-hue accent ramp, and Q<20 bars also get diagonal hatching, so the "low quality" category survives grayscale and forced colors.

### 6.5 Theme mechanics

- `<meta name="color-scheme" content="light dark">`. Tokens live on `:root`. Dark values apply under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` and again under `:root[data-theme="dark"] { … }`, with `color-scheme` set to match so native controls and scrollbars follow. `light-dark()` would be terser [verified: BCD, Chrome 123 / Firefox 120 / Safari 17.5], but the duplicated block is simpler to reason about and fully supported.
- **Toggle:** three-way System / Light / Dark.
  - Desktop: a small control at the bottom of the aside ("Theme: System" as a menu button with three `menuitemradio` items).
  - Mobile: an icon button in the top bar (sun, moon or monitor icon; accessible name "Theme: System").
  - Course home and About: a visible segmented radio group.
- **No flash:** a tiny inline `<script>` in `<head>`, wrapped in try/catch, reads the stored preference and sets `data-theme` before first paint.
- **Forced colors (Windows High Contrast)** [verified: BCD, `forced-colors` Chrome 89 / Firefox 89 / Safari 16]:
  - all states use outline or border plus icons, not background fills alone
  - selected and focused items get `outline: 2px solid Highlight`
  - field tints may disappear, which is fine because they are redundant
  - drag ghosts get `border: 1px solid CanvasText`

### 6.6 Motion tokens

| Token | Value | Use |
|---|---|---|
| `--dur-1` | 120ms | Hover, color changes |
| `--dur-2` | 200ms | Disclosure chevrons, popovers |
| `--dur-3` | 320ms | Sort fly-back, reveal panels |
| `--ease` | cubic-bezier(0.2, 0.7, 0.2, 1) | All |

Under `prefers-reduced-motion: reduce` [verified: BCD], all transforms and height animations are removed, smooth scrolling becomes instant, and only opacity fades of `--dur-1` or less remain (section 11).

---

## 7. Snippet viewer (genomic text)

This one component renders every curated snippet. Spot-the-error, field-explorer, fix-it (read-only preview), sort item cards and the capstone all build on it.

### 7.1 Anatomy

```text
+-----------------------------------------------------------------------+
| [file] proband.targets.bed   BED6   4 lines · tab-delimited           |  <- header bar
|        [Whitespace ◻] [Align ◻] [Colors ◻] [Expand] [Copy]            |  <- toolbar (⋯ menu on xs)
+----+------------------------------------------------------------------+
|  # | chrom   chromStart  chromEnd   name        score  strand         |  <- column header row (Align on)
+----+------------------------------------------------------------------+
|  1 | chr2 →  166845620 → 166845900 → SCN1A_ex26 → 0 → -               |
|  2 | chr2 →  166847500 → 166848200 → SCN1A_ex24 → 0 → -               |
| ...                                                       [fade] ->   |
+----+------------------------------------------------------------------+
| … 1,204 more lines not shown                       Legend: col 2 ...  |  <- footer (optional)
+-----------------------------------------------------------------------+
```

- **Header bar** (13px, `--text-muted`, bottom border): file icon (`file-text`, or `dna` for sequence files), filename in mono `--text`, format badge (a pill such as `BED6`, `FASTQ`, `SAM`, `VCF 4.5`, `GFA 1.1`), and meta ("4 lines · tab-delimited" or "binary · 1.2 GB"). In "identify the format" exercises the author hides the badge and genericizes the filename to `file_07.txt`.
- **Toolbar**: toggle buttons (`aria-pressed`) and actions. On xs, everything except Copy moves into a "⋯ View options" menu.
- **Body**: `--raised` background, Plex Mono 14px/22px, `white-space: pre`, `tab-size: 4`.
- **Gutter**: line numbers, right-aligned, `--text-muted`, `user-select: none`, `aria-hidden="true"`, `position: sticky; left: 0` with a `--raised` background and a right border, so numbers stay visible during horizontal scroll.

### 7.2 Views and toggles

| Control | Default | Behavior |
|---|---|---|
| **Raw / Aligned** ("Align columns") | Raw for reading. Aligned when the lesson is about columns. | Raw shows exact characters; tabs render at `tab-size`. Aligned renders each line as a row of cells padded to the widest cell plus 2ch, with a sticky column-header row naming each field (field names come from the format schema; numbered "col 13+" beyond the schema). It is labelled "Aligned view: display only". Implemented with CSS grid or per-column min-widths, **not** by replacing tabs with spaces, so user text-spacing overrides (WCAG 1.4.12) cannot misalign columns. |
| **Whitespace** | Off for reading. **On** in fix-it and spot-the-error where whitespace matters (author sets it per snippet). | Tab: a CSS-drawn right arrow across the tab's width (1px line plus chevron, `--border-strong`, 3:1 or better). Space: a centered "·" (U+00B7 is in the Plex Mono latin subset) [measured]. Trailing whitespace: `--error-bg` fill plus a dotted underline. CR (`\r`): a small "CR" chip. Missing final newline: a "no newline at end" chip after the last line. **Unexpected characters** (NBSP U+00A0, smart quotes, en dash, zero-width chars, BOM): a chip showing the code point ("U+00A0") with a tooltip naming it. Copy-paste corruption is a real validity failure, so this matters. |
| **Colors** ("Color columns" for tabular; "Color bases" for sequence) | Off | Columns cycle field tints f1-f8 (6.4). Bases use the base palette. |
| **Wrap** | Off; offered only for FASTA sequence lines | Soft-wraps sequence at 60 columns with a continuation marker in the gutter. Never offered for tabular formats. |
| **Header** (VCF `##`, SAM `@`, GFF `##`) | Expanded when 8 lines or fewer, else collapsed | Collapsed shows "▸ 37 header lines" as a button row (a disclosure). Header and meta lines render in `--text-muted`. |
| **Expand** | n/a | Opens the same viewer in a modal `<dialog>` at `min(96vw, 1400px)` by `90dvh`. Esc closes and focus returns to the Expand button. |
| **Copy** | n/a | Copies the **exact raw text**: tabs, CRs and the final newline preserved, never the aligned rendering or markers. Confirmation as in 4.6. |
| **Download** (optional) | n/a | Saves the snippet under its filename via a Blob URL, for learners who want to run real tools. |
| **View as table** | n/a | Swaps the visual for a real `<table>` (header row of field names, a `<th scope="row">` line number, one cell per field). It is the screen-reader-friendly view and is offered for every tabular format. Its state is announced. |

Toggle states (whitespace, colors) are remembered per viewer **globally** as preferences, not per snippet. A snippet's author default wins on first render of an exercise.

### 7.3 Per-field highlighting and linked positions

- Each field is a `<span data-col="n">`. Hover or focus on a field highlights the **whole column** across all lines: tint background plus a 1px `--border-strong` outline on the hovered cell. In Aligned view the column header label is also bolded.
- A small inline label floats above the hovered cell (`col 2 · chromStart`). It follows the WCAG 1.4.13 rules: hoverable, Esc-dismissible, persistent while hovered.
- **Linked SEQ/QUAL**: hovering base *i* in a FASTQ line 2 (or SAM column 10) highlights character *i* of line 4 (or column 11) and shows "base 37: G · quality 'F' = Q37". This teaches the 1:1 length rule visually.
- **Record grouping** for FASTQ: a faint separator every 4 lines, plus optional gutter role labels (`@`, `seq`, `+`, `qual`) under the "Show record parts" toggle.
- **FASTA**: header lines (`>`) in Plex Mono 600 `--text`; sequence in 400.
- **Comment and header lines** (`#`, `##`, `@HD`, `track`, `browser`): `--text-muted`, never italic.

### 7.4 Scrolling and sizing

- `overflow-x: auto` on the body region, which is `tabindex="0"`, `role="region"` and `aria-label="<filename>, scrollable"`. Keyboard users can scroll it with the arrow keys.
- **Scroll shadows**: a 24px gradient fade appears at a clipped edge only while more content exists in that direction. The first time a viewer overflows, a hint chip appears at the right edge: "Scroll for more →" (SVG arrow), auto-hidden after the first scroll.
- Max visible lines: 200. Beyond that, a footer reads "… N more lines not shown". Curated snippets should rarely need this.
- Mobile: 13px/20px; the gutter narrows to the digit count plus 1ch.
- WCAG 1.4.10 Reflow: two-dimensional scrolling inside the snippet region is acceptable because code and data tables "require two-dimensional layout for usage or meaning" [verified: WCAG 1.4.10 text]. **The page itself never scrolls horizontally.**

### 7.5 Hex variant (BAM, CRAM, BGZF, gzip)

- Columns: offset (8 hex digits, muted), 16 bytes as hex in two groups of 8, and ASCII (non-printables as `.`). Plex Mono 13.5px.
- Head and tail mode: "first 16 bytes … 1.2 GB not shown … last 32 bytes", with the ellipsis row in `--text-muted`.
- **Byte-range annotations** with labelled brackets and tints, for example "gzip magic `1f 8b`", "BGZF extra field `BC`", "CRAM magic `CRAM` + version 3.0", and "28-byte BGZF EOF block". Hovering a hex byte highlights its ASCII counterpart and vice versa.
- Screen-reader view: "View as table" lists each annotated range with offset, bytes and meaning.
- Used by the "sort (hex)" exercise ("Is this BAM truncated?") and by the capstone.

### 7.6 Accessibility of raw text

Screen readers read tab characters as nothing or as a pause, so `chr2	166845620` can come out as one word. Hence:

- every tabular viewer offers "View as table"
- the code region has `aria-describedby` pointing to a visually hidden summary: "BED, 4 lines, 6 tab-separated columns: chrom, chromStart, chromEnd, name, score, strand."
- long sequences in field popovers are summarized ("SEQ: 150 bases, begins ACGTTG…") rather than read letter by letter

---

## 8. Interactive components

### 8.1 Shared exercise card anatomy

```text
+-------------------------------------------------------------------------+
| [target] TRY IT · SORT                          (○ Not started)    [?]  |  <- header
| Sort the six snippets by format                         (H3 or H2)      |
| Drag each card into a bin, or select a card and then choose a bin.      |  <- how-to line
|                                                                         |
|   ... component body ...                                                |
|                                                                         |
| [ Check ]  [ Reset ]                         Hint · Show answer         |  <- action bar
| +---------------------------------------------------------------------+ |
| | ✗ Not quite. 4 of 6 are in the right bin. ...      [Try again]     | |  <- feedback panel
| +---------------------------------------------------------------------+ |
+-------------------------------------------------------------------------+
```

- **Container**: `<section class="exercise" aria-labelledby="ex-title">` on `--surface` with a 1px `--border`, `--r-card` radius and 20px padding (16px on xs). A 3px `--accent` top rule distinguishes exercises from READ MORE cards and callouts.
- **Overline**: "TRY IT · <TYPE>" for the main exercise (an **H2**, so it appears in the TOC as "Try it: …", like the reference). "QUICK CHECK · <TYPE>" for the small exercises woven into prose (an **H3**, not in the TOC, with a lighter body). Type labels: Sort, Spot the error, Fix it, Explore the fields, Simulator, Predict, Multiple choice.
- **Status pill** (top-right, `role="status"` text):
  - `○ Not started` (hollow circle, `--border-strong`)
  - `◐ In progress` (`circle-dot-dashed`)
  - `✗ Not yet` (`circle-x`, error)
  - `✓ Correct` (`circle-check`, success)
  - `[eye] Answer shown` (`eye`, muted)
  The icon and text always appear together.
- **Help** (`?`, `circle-question-mark`): opens a small popover explaining how this exercise type works, including the keyboard method. It sits in the same place on every exercise card (WCAG 3.2.6 Consistent Help).
- **Action bar**:
  - Primary "Check" (accent button, 40px tall, or 44px on touch).
  - Secondary "Reset" (`rotate-ccw`).
  - Tertiary text buttons right-aligned: "Hint" (when hints exist) and "Show answer" (appears per the retry policy).
  - On xs the action bar wraps, with primary first.
  - Ctrl/Cmd+Enter triggers Check anywhere inside the card. This is a modifier shortcut, so it complies with WCAG 2.1.4.
- **Feedback panel**: appears below the action bar. It contains a verdict line (icon plus a bold word: "Correct.", "Not quite.", "Answer shown."), 1-3 sentences of explanation, an optional "Rule:" line citing the spec (linking to the relevant READ MORE), and follow-up actions ("Try again", "Show answer", "Continue reading ↓"). Success tint for correct, error tint for incorrect, neutral `--sunken` for revealed.

### 8.2 State model (all component types)

| State | Entered when | Visual | Counts toward lesson completion |
|---|---|---|---|
| **idle** | First render, or after Reset | Status `○ Not started`; Check enabled | No |
| **attempted** | The learner has made any input but not checked, or edits after an incorrect check | `◐ In progress` | No |
| **incorrect** | Check finds errors. Partial correctness is a flavor of incorrect: "4 of 6 correct" | `✗ Not yet`; per-item ✗ marks plus text; error panel | No |
| **correct** | Check passes | `✓ Correct`; per-item ✓; success panel; inputs locked, except "Reset" | **Yes** |
| **revealed** | The learner chose "Show answer" (or reveal after a Predict commit; see 8.8) | `[eye] Answer shown`; correct answer displayed with explanations; inputs locked | **Yes** (flagged as revealed in progress data) |

- **Retry from incorrect:** "Try again" returns to *attempted*, keeping correct parts where the type allows it (see the table below). Editing input after an incorrect check also returns to *attempted*.
- **Reset** from any state returns to *idle* (after a correct or revealed state it asks "Reset this exercise? Your result stays recorded." The completion record is not removed).
- **Persistence:** state, attempt count, first-try result, last answer and the revealed flag are saved (section 12). On reload the exercise restores to its last state with feedback visible.

### 8.3 Feedback copy style [decision]

- **Lead with the verdict word**, then the reason grounded in the learner's own data: "Correct. Column 2 is 0-based, so `166845620` is the 166,845,621st base." Not "Correct!" alone.
- **Incorrect, first attempt:** point at evidence, don't give the answer. "Not quite. Look at line 3 again: what does the strand column allow?"
- **Incorrect, after hints:** name the rule. "BED requires chromEnd ≥ chromStart. Line 3 has 900 < 1000."
- **Partial:** count, then what happens next. "4 of 6 are in the right bin. The two marked ✗ went back to Unsorted."
- **Revealed:** neutral, never shaming. "Here's the answer, with why each item belongs where it does."
- Voice: second person, present tense, sentence case, plain words. Avoid "wrong", "oops", "simply", "obviously", exclamation marks (at most one, only on the badge page) and emoji.
- Length: verdict plus at most 40 words per explanation. Per-option explanations are at most 30 words each.
- Use exact file values in code chips (`1000`) and thousands separators in prose (1,000).
- Every explanation names the **format rule** and, where useful, the **why it matters**: "…so the variant caller would never see these reads."

### 8.4 Retry and reveal policy

| Type | "Try it" and Quick check (formative) | Section quiz (graded) |
|---|---|---|
| mcq | Unlimited. After an incorrect attempt, only the chosen options' explanations show; inputs stay editable. "Show answer" appears after 2 incorrect attempts. | One attempt. After Check, all per-option explanations show. |
| sort | Unlimited. "Try again" returns incorrect items to the pool; correct ones stay locked. "Show answer" after 2 attempts. | One attempt; then the full answer. |
| spot-the-error | Unlimited. Wrongly picked tokens stay marked "checked: fine here" (dashed outline). Hint after 2 misses; "Show answer" after 3. | One pick per error. |
| fix-it | Unlimited, with live validation. Hint ladder of 3 levels; "Show solution" available after the first Check. | Not used in quizzes. |
| field-explorer | Not graded; completes when all fields are visited or the learner presses "Done exploring". An embedded mcq, if any, follows the mcq rules. | n/a |
| simulator | Completes when its challenge goals are met; free exploration is always allowed. "Show me" per goal after 2 attempts. | Can be embedded as a question with one attempt. |
| predict | One committed prediction; reveal always follows. Correct if it matches, else revealed. Both count as complete. | Scored on the committed prediction. |

### 8.5 Focus management, keyboard and screen readers (shared rules)

- **On Check:** focus moves to the feedback panel's verdict line (`tabindex="-1"`). The panel is also a `role="status"` region, so the result is announced even if the learner keeps working elsewhere (WCAG 4.1.3). Follow-up buttons come next in tab order.
- **On Try again:** focus moves to the first incorrect item, or the first input.
- **On Show answer:** focus moves to the panel's verdict ("Answer shown.").
- **On Reset:** focus moves to the first interactive element; announces "Exercise reset."
- **Live validation** (fix-it) **never moves focus** and is announced only on explicit Check or when the text first becomes valid (debounced 1s), so it is not chatty.
- All custom widgets expose name, role and value (WCAG 4.1.2). All targets are at least 24x24px (WCAG 2.5.8); we aim for 32px in UI and 44px for option rows on touch.
- No time limits anywhere (WCAG 2.2.1).
- Actions fire on pointer up, and a drag can be cancelled by dropping back or pressing Esc (WCAG 2.5.2).

### 8.6 spot-the-error

**Purpose:** find the line or field that makes a snippet invalid.

- **Body:** snippet viewer in interactive mode. The author sets granularity: **line** (each line selectable) or **field** (each field selectable). A counter: "Find the 1 error" or "Errors found: 1 of 3".
- **Pointer:** hovering shows a 1px `--border-strong` outline and a pointer cursor. Click or tap **selects** (2px `--accent` outline plus `--accent-subtle` fill). Clicking again deselects. **Check** commits the selection, so accidental taps on mobile don't count.
- **Keyboard:** the snippet is one tab stop using the `role="grid"` pattern with a roving tabindex. Up and Down move between lines; Left and Right move between fields (field mode); Home and End go to the first or last field; Space or Enter toggles selection. Each cell's accessible name is "Line 3, field 2 of 6, chromStart, value 1000". The selected state uses `aria-selected`.
- **Feedback:**
  - Correct: the token gets a success outline plus a ✓ badge. An **explanation row** is inserted directly under that line inside the viewer (full-width, success tint) with the rule and a "Now fix it ↓" link when a fix-it follows.
  - Incorrect: the token gets an error outline plus ✗. A short per-distractor explanation, if authored, appears ("`-` is a valid strand value."). Otherwise: "That field is fine here."
  - Clean picks stay marked with a dashed outline so they aren't repeated.
- **Hints:** Hint 1 names the line; Hint 2 names the field or rule.
- **Reduced motion:** no pulse or shake on incorrect. Under normal motion, a single 120ms outline color transition only; **never shake** (shaking is a vestibular trigger).

### 8.7 fix-it

**Purpose:** edit a snippet until a live validator says it is valid and the goal checks pass.

```text
| [file] trio.ped  PED   ● 2 problems                                     |
| [Insert tab ⇥] [Whitespace ◼]                                           |
| 1 | FAM1 → P1 → F1 → M1 → 1 → 2                                         |
| 2 | FAM1 → F1 → 0 → 0 → 1 → 1                                           |
| 3 ✗ FAM1 · M1 · 0 · 0 · 2 · 1          <- error gutter mark plus wavy underline
| Goal:  ✓ parses as PED   ✗ uses tabs between fields   ✓ keeps 3 people   |
| Problems (2)                                                            |
|  ✗ Line 3: fields are separated by spaces; this file uses tabs. [Go to] |
| [ Check ]  [ Reset ]                        Hint · Show solution        |
```

- **Editor:** a mono editable area with a line-number gutter, whitespace markers **on by default**, and an error gutter (`circle-x` icon on offending lines). Offending ranges get a **wavy underline** plus an error tint, so the problem is not shown by color alone.
  - Required attributes: `spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off"`. iOS would otherwise turn `chr1` into `Chr1` [from memory - verify].
  - Smart punctuation cannot always be disabled, so the validator flags U+201C/U+201D/U+2018/U+2019 and NBSP with a clear message.
  - Implementation choice (textarea plus highlight overlay, or a small editor library) is open. These UX rules apply either way.
- **Tab key:** inside the editor, **Tab inserts a literal tab character**, since these formats are tab-delimited. To leave the editor, the learner presses **Esc, then Tab** (or Shift+Tab). This is stated in the how-to line and the help popover: "Tab inserts a tab. Press Esc, then Tab, to move on." That satisfies WCAG 2.1.2's "advised of the method" clause [verified: WCAG 2.1.2 text].
  - A toggle in the help popover, "Tab key moves focus", flips this behavior and is remembered.
  - An **"Insert tab ⇥" button** in the toolbar, because touch keyboards have no Tab key.
- **Validation:** runs on every edit (debounced 250ms) and updates the problem pill (`● 2 problems` or `✓ Valid PED`), the gutter marks and the **Problems list**. Each problem shows: icon, line and column (field name), a plain message, the found value, and what's expected. Click or Enter on a problem moves the caret there.
- **Goal checks:** a checklist under the editor ("keeps 3 people", "intervals sorted") stops the learner from passing by deleting content. Each goal shows ✓ or ✗ with text.
- **Check:** announces the summary ("Valid PED. All 3 goals met." or "2 problems remain. First: line 3, fields separated by spaces."). The exercise becomes *correct* only on Check, with validator and goals all passing.
- **Hint ladder:**
  1. Where to look (line).
  2. Which rule.
  3. What to type.
  **Show solution** shows a **diff** between the learner's text and a minimal valid solution (removed segments struck through with `--error-bg`, added segments underlined with `--success-bg`, plus/minus line prefixes, and whitespace markers on). Then "Use this solution" or "Keep editing".
- **Reset:** restores the original broken snippet, with a 10-second "Undo reset" toast.
- **Undo:** Ctrl/Cmd+Z works as normal.

### 8.8 sort

**Purpose:** place items into labelled bins (snippets into formats, statements into valid or invalid, hex dumps into complete / truncated / not BAM / CRAM). An **ordered variant** arranges items in sequence, such as pipeline steps.

- **Layout:**
  - An "Unsorted" pool on top, then bins in an auto-fit grid (min 180px per bin; 2-4 per row on desktop, stacked on xs).
  - Each bin: `--raised` fill, 1.5px **dashed** `--border-strong` outline (3:1 or better), a label header with a count ("FASTQ · 2"), and "Drop here" placeholder text when empty.
  - **Item cards:** `--surface` fill, 1px `--border`, `--r-control`, grip handle (`grip-vertical`) on the left, content (text, or a snippet excerpt of up to 4 lines in mono, or a hex excerpt), and a "Move to…" menu button (`⋯`) on the right. Long excerpts truncate with a fade and a "View full" button that opens the expanded viewer.
- **Pointer drag:**
  - The drag starts from the grip handle (`touch-action: none` on the handle only, so touch scrolling elsewhere still works) after 4px of movement.
  - A ghost with `--shadow-pop` follows the pointer. The bin under the pointer gets a solid `--accent` outline and "Release to place in FASTQ" text. The page auto-scrolls near viewport edges.
  - Dropping outside any bin returns the card to where it came from.
- **Click and tap alternative** (WCAG 2.5.7, no dragging needed):
  - Tap a card to **select** it (`aria-pressed="true"`, accent outline). Every bin then shows a "Move here" button; tap a bin or its button to move the card. Tap the card again to deselect.
  - The **"Move to…" menu** on each card lists all bins plus "Unsorted" (menu button pattern). This is the most explicit path for screen-reader users.
- **Keyboard:**
  - Tab reaches each card. Space or Enter **picks up** a card, and a live region announces: "Picked up: 'FASTQ snippet B'. Use arrow keys to choose a bin, Enter to drop, Escape to cancel."
  - Left/Right or Up/Down cycles the destination bin, with each one announced ("FASTQ bin, 1 item").
  - Enter or Space drops ("Placed in FASTQ. 3 items left unsorted."). Esc cancels.
  - Focus stays on the moved card in its new position.
- **Check:**
  - If items remain unsorted: "Place all items first: 2 are still in Unsorted." Nothing is graded and the state stays *attempted*.
  - Otherwise each card gets a ✓ or ✗ badge with text ("Correct" or "Belongs elsewhere") and a "Why?" disclosure revealing its explanation.
- **Try again:** incorrect cards fly back to Unsorted (320ms, instant under reduced motion). Correct cards stay locked (`aria-disabled="true"`, label suffix "correct, locked").
- **Show answer:** moves all cards to the correct bins, marks them with an `eye` "shown" badge, and opens all "Why?" explanations.
- **Ordered variant:** a vertical list with drag handles plus **Move up / Move down** buttons per item (and Alt+Up/Down when an item is focused). After Check, feedback per item says "In place" or "Should come earlier" / "Should come later".

### 8.9 field-explorer

**Purpose:** learn what each column or field of a record means by direct inspection.

- **Body:** snippet viewer in Aligned view with Colors on, plus a **legend panel** below: a definition list with one row per field (column number, name, value in this record, meaning, type or allowed values, and a spec citation). On wide screens it is two columns of rows.
- **Pointer:** hover or focus on a field highlights its column and its legend row, and shows a popover anchored to the field:
  - the field name as a heading, then "col 6 · strand"
  - the value in this record with its interpretation ("`-`: reverse strand, so the gene reads right to left")
  - a "More in legend ↓" link
- **Popover behavior** (WCAG 1.4.13): it stays while the pointer is over the field or the popover, Esc dismisses it, and tapping pins it (tap elsewhere or press the close button to unpin).
- **Mobile:** no floating popovers. Tapping a field expands its legend row in place and scrolls it into view if needed.
- **Keyboard:** one tab stop into the record, with a roving tabindex and Left/Right between fields (Up/Down between lines for multi-line snippets). The popover shows on focus; Enter pins it. Screen reader: each field's accessible name is "Field 6 of 6, strand, value minus", with `aria-describedby` set to its legend row.
- **Progress:** visited fields get a small dot under them. A counter reads "Explored 7 of 11 fields". The state is *correct* when all are visited or "Done exploring" is pressed; it never fails.
- **"View as table"** is available as in 7.2.

### 8.10 simulator

**Purpose:** an interactive model of a concept. The planned set includes the coordinate ruler, FLAG bit decoder, CIGAR-to-alignment drawer, Phred converter, BGZF/index random-access demo, gVCF block expander, GFA graph drawer, read-to-reference ribbon, rGFA stable coordinates, breakend decoder and anchor-base builder (from the research exercise banks).

**Generic anatomy:**

```text
| SIMULATOR · FLAG bit decoder                                (✓ 1 of 2 goals) |
| [controls: number input "FLAG = 99" | 12 labelled checkboxes, one per bit ]   |
| [visualization: two mates on a mini reference with strand arrows]             |
| Readout: "99 = 1 + 2 + 32 + 64: paired, proper pair, mate reverse, first"     |
| Presets: [83] [99] [147] [163] [4]                                            |
| Goals:  ✓ Make a read that is paired and first in pair                        |
|         ○ Make its mate: reverse strand, second in pair            [Show me]  |
| [ Reset ]                                                                     |
```

- **Controls first, then visualization, then readout.** Controls are native inputs wherever possible (number, range, checkbox, select) with visible labels. Custom draggable handles (for example the ruler's start and end) are `role="slider"` with `aria-valuemin/max/now` and `aria-valuetext` ("Start: base 3; BED start 2; GFF start 3"). Arrows step by 1, PageUp/PageDown by 10, Home and End jump to the limits.
- **Two-way binding:** changing any representation updates all the others. For example, the FLAG number updates the checkboxes, and toggling a bit updates the number.
- **Readout:** plain-language sentence in a `role="status"` region, debounced 500ms. Computed numbers use `tabular-nums`.
- **Presets:** chips with real values from the case.
- **Goals:** 1-3 challenge statements make simulators gradable. A goal is detected automatically when the state matches, then shows ✓ plus a one-line explanation. "Show me" after 2 failed tries sets the state and marks the goal revealed. The simulator is *correct* when all goals are met.
- **Animation** (BGZF seek, gVCF block expansion): **never autoplay**. Controls are Play, Step and Reset. Under reduced motion, Play becomes Step-only and transitions are instant.
- **Graph drawer (GFA):** nodes are focusable in DOM order. Arrow keys move between adjacent nodes along edges, and a text **adjacency list** is shown under the drawing ("s1+ → s2+, s2+ → s3−"). The list is the screen-reader equivalent and is also printed.
- **Mobile:** controls stack above the visualization; the visualization scales to width with a minimum 12px label size, and scrolls horizontally if it would get smaller.

### 8.11 predict

**Purpose:** commit to a prediction before seeing the answer.

- **Input kinds:** choice chips (single select), number field (with unit and tolerance), slider, or "pick a region" on a ruler.
- **Flow:**
  1. The learner sets an input.
  2. The primary button **"Lock in my prediction"** is enabled once there is input.
  3. On lock, the input becomes read-only, showing "Your prediction: 3".
  4. The **reveal panel** opens (fade only, 200ms; instant under reduced motion) with the actual value, a comparison ("You predicted 3; the CIGAR consumes 8 reference bases") and an explanation, often with the related simulator or figure showing the result.
- "Skip and show answer" is a tertiary link; it records *revealed*.
- **Scoring:** matching (within tolerance) gives *correct*, otherwise *revealed*. Both complete the exercise and neither is framed as failure: "Predictions are for thinking: any committed answer counts."
- **Multi-item predict** ("CIGAR arithmetic, four quick ones"): a compact list of inputs, one lock button for all, and a per-item reveal row.

### 8.12 mcq

**Purpose:** single- or multi-select questions with explanations per option.

- **Markup:** `<fieldset>` with a `<legend>` stem. Single select uses native radios, following the APG radio group keyboard pattern: Tab into the group, arrows move and select [verified: APG radio group]. Multi-select uses native checkboxes, and the instruction says "Select all that apply." The number of correct options is not given, unless the author decides otherwise.
- **Option rows:** full-width cards (min-height 44px, padding 12px 16px), with the input on the left. The label wraps the whole row so the row is the click target. Selected: `--accent` 1.5px border plus `--accent-subtle` fill plus a checked control (the control itself is the non-color cue).
- **After Check:** each relevant option gets a result line under its label:
  - `✓ Correct answer` (success)
  - `✗ Your choice: incorrect` (error)
  - `◌ Missed: this is also correct` (warning, multi-select only)
  Then the option's explanation follows. The result lines are linked to the option via `aria-describedby`, so screen readers hear them when focus revisits the option.
- **Partial (multi-select):** "2 of 3 correct choices, 1 incorrect." Try again keeps the selection editable.
- **Matrix variant** ("Where does each variant land?"): a table with one row per item and a `<select>` (or radio row) per item. One Check grades all rows, with per-row ✓/✗ plus an explanation.
- **Stem content** may include a snippet viewer or figure; the option list follows it.

---

## 9. Section quizzes, Passed badge and capstone

### 9.1 Quiz page layout

- Route `#/quiz/<section>`. Breadcrumb; H1 "Section quiz: Alignments"; pills `Section quiz`, `8 questions`, `about 8 min`, `Pass mark 80%`.
- Intro: one paragraph stating the scoring rule plainly: "Each question counts on your first answer. You'll see explanations right away. Retake as often as you like; your best score is kept."
- **Progress strip** under the intro (in flow, not sticky), `role="status"`: "Answered 3 of 8 · 3 correct", plus a segmented bar (one segment per question, each showing ✓, ✗ or empty with an icon, not just color).
- **Questions:** all on one page (printable, easy to review, screen-reader friendly), each a card like the exercise card:
  - overline "QUESTION 3 OF 8"
  - stem
  - component (mcq, predict, spot-the-error, small sort, matrix)
  - "Check answer" button
  Graded mode: one attempt, then the full explanations. Questions unlock in any order.
- **Results card** (after the last question is checked; focus moves to its heading):
  - Large score in Source Serif 4 at 42px with tabular figures: "7 / 8".
  - Pass: success panel, the Passed badge, and "You passed the Alignments quiz." Then "Next: <first lesson of next section>" as a primary button.
  - Not yet: neutral panel (not red): "6 / 8. You need 7 to pass." Below it, a list of missed questions, each with a "Review: <lesson section>" link (each question maps to the lesson heading it tests), then "Retake quiz".
- **Retake** shuffles option order (and swaps in alternate question variants where authored), clears answers, and keeps the best result. "Passed" never goes away once earned.
- Quizzes are **not gated**: learners may take them anytime. Course home suggests them after the section's lessons.

### 9.2 Passed badge

- Pill: `badge-check` icon plus "Passed" text, `--success-bg` fill, `--success` text (4.69:1), 1px border at success 40% alpha, 24px tall, 13px 600.
- Placements:
  - outline row, right-aligned (as in the reference)
  - quiz H1 pills ("Passed · 8/8")
  - course home section headers
  - badge requirements list
- Accessible name in the outline: "Section quiz: Alignments, passed, best score 8 of 8".

### 9.3 Capstone: triage the case folder

- Route `#/capstone`, wide mode (3.3).
- **Two-pane layout** on at least 960px. The left pane (300px) is a "case folder" list of files: icon (text or binary), filename, size and status (`○` untriaged, `✓` triaged correctly, `✗` needs another look, `[eye]` shown). The right pane is the **inspector**:
  - the snippet viewer (text or hex), and
  - "Your call", a form with: **Format** (select among the 12 course formats plus "index file" and "other"); **Valid?** (radio: Valid / Invalid); if Invalid, **What's wrong?** (spot-the-error inside the viewer, or a select of reasons).
  - "Submit for this file" gives per-file feedback and advances to the next untriaged file, with focus moving to the new file's inspector heading.
- Below 960px: the list becomes a drill-down page. Selecting a file opens the inspector with a "← Case folder" back button.
- The list is a simple list of buttons with `aria-current="true"` on the open file.
- Progress: "7 of 12 files triaged · 6 correct" (`role="status"`).
- The capstone is complete when every file is correct or revealed.
- Ending: a **"Case report"** summary table (file, format, verdict, the rule that decided it), the completed pipeline map, and a short story conclusion. The final CTA is "Claim your completion badge".

---

## 10. Navigation: lesson switcher, course outline, in-page TOC, mobile bar

### 10.1 Lesson switcher card (aside top)

- **Collapsed** (default on every page load):
  - A card (`--surface`, 1px `--border`, `--r-card`, padding 12px 14px) that is entirely one `<button aria-expanded="false" aria-controls="outline">`.
  - Line 1: "Lesson 9 of 22 · Alignments" (13px `--text-muted`). Line 2: lesson title (15px 600 `--text`). Chevron-down at the right.
  - A **2px course progress bar** along the card's bottom inner edge (`--accent` on `--sunken`), with visually hidden text "Course progress: 12 of 33 items complete".
  - Accessible name: "Lesson 9 of 22, Reading a CIGAR string. Show course outline."
- **Expanded:**
  - The card grows downward to show the outline, and the TOC below it is hidden (as in the reference). The chevron flips.
  - The panel's max-height fills the viewport below the card top and scrolls internally. On open, the current row is scrolled into view (`block: "center"`).
  - Focus stays on the toggle button (disclosure pattern [verified: APG disclosure]). Esc collapses the panel and returns focus to the toggle, and clicking outside collapses it.
- **Outline structure:**
  - `<nav aria-label="Course outline">`, then per section a small heading (13px `--text-muted`, sentence case, for example "Sequences: FASTA and FASTQ"), then `<ol>` rows.
  - Rows: 32px minimum height, padding 4px 8px, `--r-control`. A 16px **status icon** (table below), then the title (15px, wrapping allowed), then any right-aligned extras.
  - **Current row:** `--sunken` fill, 600 weight, `aria-current="page"`, and a 2px `--text` left bar. Bar and weight are the non-color cues, since the fill alone is only 1.13:1.
  - Hover: `--sunken` fill.
  - Section quiz rows: list-checks icon plus "Section quiz" plus the **Passed** pill when passed.
  - Then "Capstone" (folder-open icon), then "Completion badge" (`award` icon; `lock` overlay until earned).
  - Selecting a row navigates and collapses the panel.
- **Status icons** (all at least 3:1 against the row background):

| Status | Icon | Color | Accessible text |
|---|---|---|---|
| Not started | `circle` (hollow) | `--border-strong` | "not started" |
| In progress | `circle-dot-dashed` | `--accent` | "in progress" |
| Complete | `circle-check` | `--success` | "complete" |
| Quiz passed | `circle-check` + Passed pill | `--success` | "passed, best 8 of 8" |
| Quiz not passed yet | `circle-dot-dashed` + "Retake" text | `--text-muted` | "attempted, best 5 of 8" |
| Badge locked or earned | `award` + `lock` / `award` filled gold | `--text-muted` / `--gold-fill` | "locked" / "earned" |

### 10.2 In-page TOC with scroll-spy

- Below the switcher card, 16px gap. A visually hidden heading "On this page" (the reference shows none), then `<nav aria-label="On this page"><ol>`.
- Items are **H2s only**, including "Try it: …" and "Recap". Long titles wrap.
- Style:
  - 14.5px/20px, row padding 6px 0 6px 12px
  - inactive items `--text-muted`
  - a 1px `--border` track down the left edge (a small addition to the reference, for orientation)
  - **active item** `--text` at 600 weight with a **2px `--text` bar** overlaying the track
  - exercise items show a right-aligned 14px status icon (hollow or check)
- **Scroll-spy:** an IntersectionObserver on H2s with `rootMargin: "-72px 0px -65% 0px"` [verified: BCD]. The active item is the last heading whose top has passed the 35% line, falling back to the first. At the page bottom, the last item becomes active.
  - Active state uses `aria-current="location"`.
  - The bar moves with a 120ms transform, instant under reduced motion.
- **Click:** scrolls to the heading (`smooth`, or `auto` under reduced motion), updates the hash with `replaceState`, moves focus to the heading (`tabindex="-1"`), and **locks** the active item to the clicked one until scrolling settles, so the bar doesn't flicker through intermediate items.
- If the TOC is taller than the space left in the aside, it scrolls internally, keeping the active item in view.
- Theme control at the bottom of the aside (6.5).

### 10.3 Mobile and tablet top bar (below 1080px)

- Sticky bar, 48px: left a `<button>` with a list icon and "9/22 · <current H2 title, ellipsized>" plus a chevron; right the theme icon button. Below 360px wide the "9/22" prefix drops.
- The button opens a **modal sheet**: `<dialog>` via `showModal()` [verified: BCD, Chrome 37 / Firefox 98 / Safari 15.4], sliding from the top (instant under reduced motion). It is max-height 85dvh, full width, with radius 0 0 18px 18px. Contents:
  - header: "Lesson 9 of 22" plus a Close button (`x`)
  - a two-tab segmented control (APG tabs): **On this page** (default when the lesson has 2 or more H2s) and **Course outline**
  - the same TOC and outline components as the desktop aside
- Focus moves into the dialog (to the selected tab). Esc, Close, or tapping the backdrop closes it and returns focus to the bar button. Selecting an item closes the sheet, then navigates or scrolls.
- The page behind is inert (native modal dialog behavior).
- The bar's label updates with scroll-spy (no live announcement; it is a visual aid).

---

## 11. Motion and reduced motion

| Element | Default | `prefers-reduced-motion: reduce` |
|---|---|---|
| READ MORE open | Height plus fade, 200ms (where supported) | Instant |
| Chevron rotate | 200ms | Instant |
| TOC active bar | 120ms translate | Instant |
| Smooth scroll (TOC, "Go to" links) | `smooth` | `auto` |
| Sort drag ghost / fly-back | Ghost follows pointer; 320ms fly-back | Ghost still follows (direct manipulation); items jump instantly |
| Feedback panel | 120ms fade plus 4px rise | Opacity only, 120ms or none |
| Incorrect answer | Outline color change only (never shake) | Same |
| Predict reveal | 200ms fade | Instant |
| Simulator animations | Play / Step; 300-600ms per step | Step only, instant transitions |
| Mobile sheet | 200ms slide | Instant |
| Badge earned | Badge scales 0.96 to 1 plus a one-time drift of 12 small A/C/G/T letters (no flashing, under 2s) | Static badge, no particles |

No element flashes more than 3 times per second anywhere (WCAG 2.3.1), and nothing autoplays.

---

## 12. Progress and state

### 12.1 What is stored [decision]

- **Key:** one `localStorage` key, `genomic-file-formats:v1`. Chromium gives all file:// pages a single shared origin, so the key must be namespaced [from memory - verify per browser].
- **Value:** JSON, written debounced (300ms) after each state change:

```json
{
  "schema": 1,
  "updatedAt": "2026-10-16T12:00:00Z",
  "lessons": { "fastq-records": { "visitedAt": "…", "exercises": {
      "ex-sort-formats": { "state": "correct", "attempts": 2, "firstTry": false, "revealed": false, "answer": { } } } } },
  "quizzes": { "alignments": { "best": 7, "of": 8, "passedAt": "…", "attempts": 2, "current": { } } },
  "capstone": { "files": { "file_07": { "state": "correct" } } },
  "badge": { "earnedAt": null, "name": "" },
  "prefs": { "theme": "system", "whitespace": false, "colorBases": false, "tabMovesFocus": false }
}
```

- **Derived, not stored:**
  - Lesson complete means all its exercises are correct or revealed.
  - Section complete means all its lessons are complete.
  - The badge is earned when all section quizzes are passed and the capstone is complete [decision; see Open questions].
- Unknown exercise IDs (from content edits) are ignored. A schema bump runs a migration function, or else keeps prefs and resets the rest with a notice.
- **Sync:** a `storage` event listener updates other open tabs of the same origin.
- Every storage access is wrapped in try/catch. Storage is probed once at boot (write and read back a test key).

### 12.2 When storage is unavailable or fails

Private windows, blocked site data, quota errors and some file:// configurations can all disable storage.

- The app switches to **in-memory mode**. Everything works for the session.
- A **non-blocking notice** appears at the top of `<main>` once per session: `--warning-bg`, `triangle-alert` icon, text "Your progress can't be saved in this browser window. You can keep going; to keep your progress, copy a progress code from Settings before closing." Buttons: "Copy progress code" and "Dismiss".
- The footer status changes from "Progress saved in this browser" (`circle-check`) to "Progress not saved" (`triangle-alert`).

### 12.3 Progress code (export and import)

- The hosted (https) copy and an emailed file:// copy have **separate storage**, so learners need a bridge. On course home and `#/about`:
  - "Copy progress code": a base64url-encoded, compressed JSON, copied to the clipboard and also shown in a read-only textarea.
  - "Paste progress code": a textarea plus an "Import" button. It validates, then shows "This will replace your current progress (12 items) with the imported progress (19 items)." with Confirm and Cancel.
- Also offered as "Download progress (.json)" and "Upload progress" for learners who prefer files.

### 12.4 How progress is shown

| Where | What |
|---|---|
| Lesson switcher card | "Lesson N of 22" plus the 2px course progress bar |
| Course outline rows | Status icons (10.1), Passed pills, badge lock |
| Lesson meta pills | "2 of 3 exercises" changing to "Completed" |
| In-page TOC | Status icons on "Try it" items |
| Exercise cards | Status pill (8.1) |
| Lesson footer | Status line with links to any remaining exercises |
| Course home | "Continue: Lesson 9 · Reading a CIGAR string" primary button; overall "12 of 33 items · 4 of 8 quizzes passed"; per-section progress; the **pipeline map** with nodes lighting up by format mastered |
| Badge page | Requirements checklist with live status |

### 12.5 Reset

"Reset all progress" (on `#/about`, destructive style) opens a confirm dialog listing what will be erased, with the buttons "Erase progress" (error-styled) and "Cancel" (default focus). Preferences are kept unless "Also reset preferences" is ticked.

---

## 13. Completion badge page

- Route `#/badge`; H1 "Completion badge".
- **Locked state:**
  - The badge illustration in grayscale at 60% opacity with a `lock` icon, and the text "Your badge unlocks when you finish these:".
  - A requirements checklist, each item with an icon, text and a link: "Pass all 8 section quizzes (5 of 8)", "Complete the capstone (in progress)". Optional context: "Lessons complete: 18 of 22".
- **Earned state:**
  - **Badge illustration** (our own inline SVG, about 240px): a hexagonal medallion. Inside, a stylized motif of stacked read bars over a reference line with a small double helix, the course title on a ribbon ("Genomic File Formats"), "12 formats" and the earned date. Colors: `--accent`, `--gold-fill` and neutrals. It must look complete in grayscale.
  - Text: a short summary of what the learner can now do, mirroring the learning objective (recognize and validate FASTA, FASTQ, BED, BEDPE, WIG, GTF/GFF3, SAM, BAM, CRAM, gVCF, VCF, GFA/PAF), plus the completed **pipeline map** as "the case, start to finish".
  - Optional "Name on badge" text field (stored locally only; label "Name to show on your badge (optional, stays on this device)").
  - Buttons: "Download badge (SVG)", "Download badge (PNG)" (canvas render), "Print certificate".
  - Honesty line in small text: "Self-issued course completion; not an accredited credential."
- Earned-moment motion per section 11. Focus goes to the H1 and the live region announces "Badge earned".

---

## 14. Course home (brief)

- H1 "Genomic File Formats", a one-sentence promise, and pills (`about 3 hours`, `22 lessons`, `8 quizzes`, `Capstone`).
- Primary button: "Start the course", or "Continue: Lesson 9 · …" for returning learners.
- The learning objective, shown verbatim as a quote callout.
- A Case file teaser introducing the trio, with the pedigree glyph.
- The pipeline map (4.10) with progress states.
- "How this course works": a legend of the seven exercise types with one-line keyboard tips each.
- Full course outline (the same component as 10.1, always expanded, with per-lesson minutes and statuses), the format cheat sheet link, settings (theme, progress code, reset), and credits.

---

## 15. Print styles

- `@media print` forces **light tokens** regardless of theme, sets body to 10.5pt / 1.45 and code to 8.5pt, and `@page { margin: 16mm }`.
- **Hidden:** the aside, top bar, skip link, toolbars, copy and expand buttons, theme control, exercise action bars, prev/next nav, storage notices and tooltips.
- **Expanded:** every READ MORE is forced open. A `beforeprint` handler sets `open` on all `<details>` and `afterprint` restores the previous state. Collapsed snippet header blocks also expand.
- **Snippets:** `white-space: pre-wrap; overflow-wrap: anywhere` with a "↪" continuation marker in the gutter (an SVG background, not a glyph), line numbers kept, and whitespace markers printed if they are on. Each snippet has a 0.5pt border. `break-inside: avoid` applies to snippets up to about 25 lines; longer ones may break, with the header repeated as "(continued)" via a print-only element.
- **Exercises** print as static content: prompt, then options as a list with empty boxes (☐ via CSS-drawn squares), then a note "Interactive in the course: open <URL>#/lesson/<slug>/<id>". If the learner has already completed the exercise, their answer and the explanations are printed. Otherwise, answers are **not** printed (no answer leaks).
- **Quizzes** print questions without answers unless completed. Results print if available.
- **Figures** print in color where available. Field tints keep their outlines, and quality bars keep hatching.
- **Links:** external links print their URL after the text (`a[href^="http"]::after { content: " (" attr(href) ")" }`). Internal links don't.
- A print-only header line holds the course title, lesson number and title, and the print date.
- Headings get `break-after: avoid`; figures, callouts and exercise cards get `break-inside: avoid`.
- The **badge page** prints as a one-page certificate (badge, name, date, objective summary, honesty line). The route adds `class="print-landscape"` so that `@page { size: landscape }` applies there only.
- A "Format cheat sheet" page (`#/cheatsheet`, optional) prints all "At a glance" cards two per page.

---

## 16. Accessibility checklist (WCAG 2.2 AA)

Criterion texts were checked in the w3c/wcag source repository [verified]. Each item is testable.

**Perceivable**

- [ ] **1.1.1** Every figure has `role="img"` plus title and desc. Complex figures have a text or table equivalent. Decorative icons are `aria-hidden`.
- [ ] **1.3.1** Headings are real H1/H2/H3, one H1 per route. Exercises use fieldset and legend. Tables use `<th scope>`. Outline and TOC are lists inside `<nav>`. "View as table" exists for tabular snippets.
- [ ] **1.3.2 / 2.4.3** DOM order equals visual order (prev before next; pool before bins; legend after snippet).
- [ ] **1.4.1 Use of color:** every status uses icon plus text. Selection uses outline plus fill. Diagnostics use a wavy underline plus icon. Field tints and base colors are redundant [verified: 1.4.1 text].
- [ ] **1.4.3 Contrast (minimum):** all text tokens pass 4.5:1 on their backgrounds (6.2 and 6.3 tables) [measured].
- [ ] **1.4.4 / 1.4.10 Reflow:** works at 320 CSS px (400% zoom of 1280). The page never scrolls horizontally; only snippet, table and diagram regions scroll in two dimensions, which the exception allows [verified: 1.4.10 text].
- [ ] **1.4.11 Non-text contrast:** control boundaries, bins, radio and checkbox rings, whitespace markers, status icons and the focus ring are at least 3:1 (`--border-strong` 3.04-3.84; accent 5.98/8.43) [measured]. The reference's 1.25:1 check icons are *not* copied.
- [ ] **1.4.12 Text spacing:** no fixed-height text containers; aligned snippets use cells, not space padding.
- [ ] **1.4.13 Content on hover or focus:** field popovers, glossary popovers and tooltips are hoverable, dismissible with Esc, and persistent [verified: 1.4.13 text; APG tooltip].

**Operable**

- [ ] **2.1.1 Keyboard:** every exercise is fully operable by keyboard (8.6-8.12), including sort (pick up, move and drop) and simulators (sliders).
- [ ] **2.1.2 No keyboard trap:** fix-it's Tab-inserts-tab is escapable with Esc then Tab, and this is **stated on screen**. There is a toggle to make Tab move focus [verified: 2.1.2 text].
- [ ] **2.1.4 Character key shortcuts:** no single-key shortcuts; only Ctrl/Cmd+Enter.
- [ ] **2.2.1 Timing:** no timers in quizzes or exercises.
- [ ] **2.3.1 Three flashes:** no flashing content, especially given the seizure storyline.
- [ ] **2.4.1 Bypass blocks:** "Skip to lesson content" link.
- [ ] **2.4.2 Page titled:** a per-route `document.title`.
- [ ] **2.4.6 / 2.4.10** Descriptive headings and labels ("Try it: sort the six snippets by format").
- [ ] **2.4.7 Focus visible:** a 2px `--focus` outline with 2px offset on `:focus-visible` for every interactive element. It is never removed.
- [ ] **2.4.11 Focus not obscured (minimum):** `scroll-padding-top` covers the 48px sticky bar. Popovers never cover the focused trigger [verified: 2.4.11 text].
- [ ] **2.5.2 Pointer cancellation:** actions on pointer up; drags cancellable.
- [ ] **2.5.3 Label in name:** icon-button names include any visible text ("Copy" for "Copy code").
- [ ] **2.5.7 Dragging movements:** sort and ordered sort have tap-to-select, "Move to…" menus and up/down buttons. Ruler handles also accept typed values or arrow keys [verified: 2.5.7 text].
- [ ] **2.5.8 Target size (minimum):** all targets are at least 24x24px. UI uses 32px, and touch options use 44px. Inline links in prose are exempt [verified: 2.5.8 text].

**Understandable**

- [ ] **3.1.1** `<html lang="en">`.
- [ ] **3.2.1 / 3.2.2** Focus and input never trigger navigation by themselves. Selecting an outline row is an explicit activation.
- [ ] **3.2.3 / 3.2.4** Consistent navigation and consistently named components across lessons.
- [ ] **3.2.6 Consistent help:** the "?" help on exercise cards is always in the same position. The About page link is always in the footer.
- [ ] **3.3.1 / 3.3.3** Fix-it diagnostics identify the line, field and rule, and suggest the fix.
- [ ] **3.3.2** Every input has a visible label, including the progress-code and name fields.
- [ ] **3.3.7 Redundant entry:** the optional badge name is remembered. No other re-entry.

**Robust**

- [ ] **4.1.2 Name, role, value:** custom widgets follow APG patterns (disclosure, radio group, tabs, menu button, grid for spot-the-error, slider). Sort items expose `aria-pressed` while selected.
- [ ] **4.1.3 Status messages:** feedback panels, copy confirmations, validity changes, sort moves and quiz progress all use `role="status"` (polite). Nothing is assertive [verified: 4.1.3 text].

**Also check**

- [ ] `prefers-reduced-motion` (section 11), `forced-colors` (6.5) and 200% browser zoom.
- [ ] Manual screen-reader passes: NVDA with Firefox, VoiceOver with Safari (macOS and iOS), TalkBack with Chrome.
- [ ] Automated: axe-core run in Vitest against rendered lesson DOM as a dev dependency [from memory - verify Vitest 5 plus jsdom compatibility].

---

## 17. Implementation notes for the single-file build

- **No external requests at runtime.** Fonts, icons and figures are all inline. A CI check greps the built HTML for `http://`, `https://` (except in `href` links to specs and the repo), and `@import url(`.
- **Budget** (excluding course text): fonts 139 KB, icons about 12 KB, CSS about 40 KB, app JS about 120-200 KB minified (the editor choice dominates). Target under 1.5 MB total HTML so email attachment stays easy [decision].
- `<head>` order: charset, viewport, color-scheme meta, the theme bootstrap script, inline CSS, then the title.
- Respect `file://` limits: hash routing, no workers or worklets needed, and no cookies [verified: plugin README "What doesn't work"].
- Feature-detect `HTMLDialogElement.prototype.showModal`, `navigator.clipboard` and IntersectionObserver, with graceful fallbacks: a non-modal panel, the execCommand copy, and static TOC highlighting of the first item.

---

## 18. Open questions for the owner

1. **Badge rule:** should the badge also require all 22 lessons complete, or only all section quizzes plus the capstone (the current proposal)?
2. **Pass mark:** is 80% on first attempts right for section quizzes, or should it be lower (70%) given that "succeeds at the quizzes" is a success criterion?
3. **Quiz layout:** all questions on one page (proposed, for review and print), or one at a time like many course platforms? The reference's quiz layout could not be observed.
4. **Accent hue:** teal is proposed. An alternative is deep indigo (#3B4DB8-ish), if the owner prefers distance from "clinical green".
5. **Body font:** Public Sans is recommended for measure and cost. If the owner wants closer resemblance to the reference's sans, Inter Variable is +44 KB.
6. **Download snippet:** should learners be able to save curated snippets as files (useful for trying real tools), or is copy enough for v1?
7. **Fix-it editor:** a lightweight textarea-overlay editor (smaller) or a full editor library (better editing and accessibility, larger)? This affects the size budget.

---

## Sources

**Reference material (viewed)**

- Screenshot 1 (collapsed aside with in-page TOC): reference screenshot supplied by the course owner (not committed). Viewed; colors and geometry sampled with Pillow.
- Screenshot 2 (expanded lesson switcher with course outline): reference screenshot supplied by the course owner (not committed). Viewed; colors, glyph heights and geometry sampled with Pillow.

**Unreachable**

- https://academy.claude.com/courses/claude-code-101/code-review: WebFetch DNS failure (ENOTFOUND); curl proxy 403. Exercise, quiz and Recap behavior therefore marked [inferred].
- https://academy.claude.com/courses/claude-code-101: same failure.
- https://www.w3.org/TR/WCAG22/ and https://www.w3.org/WAI/ARIA/apg/: WebFetch DNS failure; used the W3C GitHub sources below instead.
- https://developer.mozilla.org/: curl blocked; used MDN browser-compat-data on GitHub instead.
- WebSearch for the lesson phrase ("sort the four findings") returned no relevant pages (third-party "Claude Code 101" syllabi only).

**Primary sources fetched (raw.githubusercontent.com unless noted)**

- WCAG 2.2 success criterion texts, w3c/wcag `main`:
  - `guidelines/sc/22/dragging-movements.html`
  - `guidelines/sc/22/target-size-minimum.html`
  - `guidelines/sc/22/focus-not-obscured-minimum.html`
  - `guidelines/sc/21/reflow.html`
  - `guidelines/sc/21/non-text-contrast.html`
  - `guidelines/sc/21/content-on-hover-or-focus.html`
  - `guidelines/sc/21/status-messages.html`
  - `guidelines/sc/21/text-spacing.html`
  - `guidelines/sc/20/no-keyboard-trap.html`
  - `guidelines/sc/20/use-of-color.html`
- WAI-ARIA Authoring Practices, w3c/aria-practices `main`:
  - `content/patterns/disclosure/disclosure-pattern.html`
  - `content/patterns/radio/radio-group-pattern.html`
  - `content/patterns/tooltip/tooltip-pattern.html`
  - `content/patterns/listbox/listbox-pattern.html` (fetched, skimmed)
- vite-plugin-singlefile: `richardtallent/vite-plugin-singlefile/main/README.md` and `src/index.ts` (`assetsInlineLimit = () => true`; Vite 8 `codeSplitting: false`). npm latest is 2.3.3.
- MDN browser-compat-data, mdn/browser-compat-data `main`:
  - `html/elements/details.json` (`name`, `search_match_opens`)
  - `html/elements/dialog.json`
  - `html/global_attributes.json` (`inert`, `hidden=until-found`)
  - `css/types/color.json` (`light-dark()`)
  - `css/at-rules/media.json` (`forced-colors`, `prefers-reduced-motion`, `prefers-color-scheme`, `prefers-contrast`)
  - `css/properties/scrollbar-gutter.json`, `tab-size.json`, `interpolate-size.json`, `text-wrap.json`, `text-wrap-style.json`
  - `css/selectors/details-content.json`
  - `api/IntersectionObserver.json`, `api/Clipboard.json`
- npm registry (registry.npmjs.org), package metadata and tarballs, downloaded and measured locally:
  - `@fontsource/source-serif-4` 5.3.1
  - `@fontsource-variable/source-serif-4` 5.3.1
  - `@fontsource-variable/public-sans` 5.3.0
  - `@fontsource/ibm-plex-mono` 5.3.0
  - `@fontsource/ibm-plex-sans` 5.3.0
  - `@fontsource-variable/inter` 5.3.0, `@fontsource/inter` 5.3.0
  - `@fontsource-variable/jetbrains-mono` 5.3.0, `@fontsource/jetbrains-mono` 5.3.0
  - `@fontsource-variable/source-sans-3` 5.3.1
  - `@fontsource-variable/source-code-pro`
  - `@fontsource-variable/instrument-sans` 5.3.0
  - `@fontsource-variable/newsreader` 5.3.0, `@fontsource-variable/literata` 5.3.0
  All are OFL-1.1. Measured: woff2 sizes, base64 and gzip sizes, GSUB features, x-heights, average character widths, zero-glyph contours and latin `unicode-range`. Tool: fontTools 4.67.0.
- Lucide icons: `lucide-icons/lucide/main/icons/<name>.svg` (each name listed in 6.1 returned 200); npm `lucide-static` 1.58.0, ISC.
- Project research docs (for exercise types and case details): `/home/user/genomic-file-formats/docs/research/{alignments,annotation,foundations,graphs,intervals-signals,sequences,variants}.md`.

**From memory (verify before relying on them)**

- Recommended line length of 45-90 characters (e.g. Butterick, *Practical Typography*).
- HGNC convention of italic human gene symbols.
- NSGC standardized pedigree symbols.
- Okabe-Ito colorblind-safe palette.
- IGV default base colors.
- The reference's proprietary fonts and brand accent value.
- Chromium's single shared origin for file:// storage.
- Clipboard API availability on file://.
- iOS autocapitalization in contenteditable and textarea.
- Which character sequences JetBrains Mono ligates.
- Whether Vite resolves bare package paths in CSS `url()`.
- OFL Reserved Font Name wording.
- axe-core with Vitest 5 compatibility.
