# Technical architecture: Genomic File Formats course

Status: recommendation, backed by two working prototypes. Date: 2026-10-16.
Scope: how lessons are written, compiled, tested and shipped as ONE self-contained HTML file that works from `file://` (emailed or opened from disk) and is also served from GitHub Pages.

Every number in this document comes from a command that was run (Node 22.22.0, Vite+ 1.3.0, pnpm 12.14.0, headless Chromium 141.0.7390.37 driven by Playwright 1.64.1). The prototypes live in the session scratchpad (`tech-proto/proto-a` and `tech-proto/proto-b`), which does not persist, so the code that matters is reproduced below. Claims not tested in this environment are marked **[source-read]** (inferred from browser source code), **[forum report]** or **[from memory - verify]**.

---

## 1. Decision summary

1. **Write lessons in Markdown with directives (Architecture A). Do not use MDX.** A small custom Vite plugin (unified + remark-directive) compiles each `.md` lesson at build time into `{ meta, html, toc, widgets }`. Widgets are custom elements (`<gf-fix-it exercise="...">`) that start up at runtime and read typed exercise data from TS modules.
2. **Widget internals:** use vanilla TS for simple widgets. For stateful simulators, mount Preact components inside the custom element ("islands"). TSX gets type-checked by `vp check`, and **no `@preact/preset-vite` or Babel is needed**: Vite 8's Oxc transform handles JSX from `tsconfig.json`'s `jsxImportSource`. Preact adds 13.5 KB raw / 5.6 KB gzip. Lit (15.0 KB / 5.8 KB gzip) also works, but its templates are not type-checked by `vp check`.
3. **One file:** `vite-plugin-singlefile` 2.3.3 inlines all JS, CSS, fonts and images as `data:` URIs. A plain multi-file Vite build **fails from file://** (CORS on the module script, verified). CI asserts that `dist/` holds exactly one `index.html` and that it fits a size budget.
4. **Routing:** hash routes `#/<lesson-id>` and `#/<lesson-id>/<heading-id>`. `history.pushState` to another path throws `SecurityError` on file:// (verified).
5. **Progress:** `localStorage` under a namespaced, versioned key. A probe in try/catch falls back to in-memory storage and shows a visible notice, plus an optional export/import "progress code". Persistence differs a lot by browser on file:// (Section 9).
6. **Tests:** four layers: validator unit tests (node), content tests (compile every lesson and check every answer key against the validators), widget DOM tests (happy-dom), and Playwright e2e against the **built** file over file://.
7. **CI/CD:** GitHub Actions with `voidzero-dev/setup-vp@v1.21.2`, pinned by commit SHA. A tag push builds once, attaches that same artifact to the GitHub Release, and deploys it to Pages. Both workflows pass `actionlint` 1.7.12.

---

## 2. Constraints that drive the architecture

| Constraint | Architectural consequence |
|---|---|
| One HTML file, emailable, opened from disk | Inline all assets. No runtime `fetch()` of local files, no lazy chunks, no external fonts. |
| Same file hosted on GitHub Pages | `base: "./"`. Hash routing, so no server rewrites. Build once, deploy that same artifact. |
| ~22 lessons of 8-12 min, quizzes, capstone, badge (~30 routes) | All lessons are in the bundle (eager glob) but only one is rendered at a time. Stable slug ids. |
| Interactive components woven through prose | The authoring syntax must place widgets inline, anywhere in the text, with little syntax. |
| Validators run on learner-edited text (fix-it) | Validators are pure TS, shared by the widgets, unit tests and content tests. |
| Curated snippets only, no Format Lab | Exercise data is typed TS, reviewable in PRs. Answer keys are machine-checked. |
| Contributors are bioinformatics people, not front-end devs | Authoring should be Markdown. Mistakes should fail the build with `file:line:col`, not blank the page at runtime. |
| Light and dark theme, Academy-like layout, no Anthropic brand assets | CSS tokens on `:root` plus `[data-theme]` and `prefers-color-scheme`. Open fonts only (OFL). |

---

## 3. Prototypes built

Both prototypes were scaffolded with the known-good command and then given the same features: three lessons (one complete FASTA lesson with prose, an h2/h3 TOC, a code block, a "Read more" callout, a recap, a **spot-the-error** and a **fix-it** exercise), typed exercise data, a FASTA validator, hash routing, an aside TOC with scrollspy, a lesson switcher with completion checks, a theme toggle, progress persistence and latin-subset fonts.

```bash
npx --yes --package=vite-plus@1.3.0 vp create vite:application --directory proto-a \
  --no-interactive --no-git --no-agent --no-hooks --no-editor --package-manager pnpm
cd proto-a
pnpm exec vp add -D vite-plugin-singlefile@2.3.3 unified@11.0.5 remark-parse@11.0.0 \
  remark-directive@4.0.0 remark-gfm@4.0.1 remark-frontmatter@5.0.0 remark-rehype@11.1.2 \
  rehype-stringify@10.0.1 unist-util-visit@5.1.0 vfile@6.0.3 yaml@2.9.1 \
  @fontsource-variable/source-serif-4@5.3.1 @fontsource-variable/inter@5.3.0 \
  @fontsource-variable/jetbrains-mono@5.3.0 happy-dom@21.0.3 @types/mdast @types/hast \
  preact@11.0.1 @playwright/test@1.64.1
```

- **A (Markdown + directives):** `plugins/lesson-compiler.ts` (unified pipeline), `plugins/vite-plugin-lessons.ts` (Vite plugin), `src/widgets/*.ts` (custom elements), `src/widgets/PhredSimulator.tsx` (a Preact island added later to test the hybrid), `src/shell/*` (router, progress, lessons glob).
- **B (MDX + Preact):** `@mdx-js/rollup@3.1.1` with `jsxImportSource: "preact"`, `remark-mdx-frontmatter@6.0.0`, `@preact/preset-vite@2.10.6` (peer: `@babel/core` 7.x; 7.29.7 installed, because 8.0.7 triggers a peer warning) and `preact@11.0.1`. Lessons `import` components and exercise data and pass them as JSX props.

Both prototypes passed the same 24-check Playwright script (`e2e-file.mjs`) against the built file opened over `file://`.

---

## 4. Measured comparison

### 4.1 Results table

| Criterion | A: Markdown + directives + custom elements | B: MDX + Preact |
|---|---|---|
| `vp build` gives ONE html, everything inlined | Yes: `dist/index.html` only. The first build also emitted `favicon.svg` (fixed with a data-URI favicon; see Gotchas) | Yes: `dist/index.html` only |
| Works from file:// (routing, no fetch, no module errors) | 24/24 checks. 1 network request (the file itself). DOMContentLoaded 37 ms, load 88 ms | 24/24 checks |
| Total size (raw / gzip) | 198.1 KB / 145.1 KB (vanilla widgets); 211.7 KB / 150.7 KB with one Preact island and 2 images | 211.3 KB / 150.4 KB |
| JS | 12.4 KB / 5.2 KB (vanilla); 25.9 KB / 10.8 KB with Preact island | 25.6 KB / 10.4 KB |
| CSS without fonts | 3.1 KB / 1.2 KB | 3.1 KB / 1.2 KB |
| Fonts (3 latin variable woff2) | 181.8 KB / 136.9 KB as 3 `data:font/woff2;base64` URIs | same |
| 25 synthetic lessons (~1,974 words each) | 521.6 KB total, JS 335.9 KB | 535.0 KB total, JS 349.3 KB |
| @fontsource woff2 referenced from CSS inlined as `data:` | Yes (bare-specifier `url("@fontsource-variable/...woff2")` is resolved and inlined) | Yes |
| Dev server cold start | 1.41 s | 1.17 s |
| HMR: prose edit | 179 ms, no reload (lessons module self-accepts) | 57 ms, no reload |
| HMR: widget code edit | Full page reload (~0.5 s); custom elements cannot be redefined. Route and progress survive (hash + storage) | True HMR, state kept (Prefresh via preset) ~0.4 s |
| HMR: exercise data edit | Full reload ~0.5 s (server **restart** if the registry is imported by `vite.config.ts`; avoided, see 7.2) | HMR ~0.3 s |
| Typo in widget name | **Build fails**; dev overlay shows `Unknown widget directive "::spot-the-eror"` with a code frame at 44:1 | **Build passes**; runtime page error `Expected component SpotTheEror to be defined` |
| Unknown exercise id / import | **Build fails**: `Unknown exercise id "fasta-fix-headr" in ::fix-it` at file:35:1 | **Build fails**: `[MISSING_EXPORT] "fastaWrapWidht" is not exported` |
| Wrong exercise type passed to a widget | Caught by content tests (kind check) and visible widget error | **Not caught**: build and `vp check` pass |
| `{A,C,G,T}` in prose | Rendered literally | **Builds, then crashes at runtime** (`ReferenceError: A is not defined`; blank page for that route) |
| `MAPQ <20` or `##INFO=<ID=DP,...>` in prose | Rendered literally (escaped) | **Build error** (MDX parses `<` as JSX) |
| HGVS-like `NM_000546.6:c.215C>G`, `GRCh38:chr17` | remark-directive treats `:c`/`:chr17` as text directives; the plugin turns them back into text (verified literal output) | Literal |
| Relative images `![](./fig.svg)` | Not handled by default; ~15 plugin lines turn them into imports, inlined as `data:` (verified to render) | Not handled by default; build passes, image broken on file:// (2 failed requests). Needs a rehype import plugin |
| `vp check` on lesson sources | `.md` is **formatted** by Oxfmt (only `*x*` to `_x_`; directives preserved). Not linted or type-checked; the plugin and content tests validate instead | `.mdx` is **formatted**, and Oxfmt **changed meaning**: a list inside `<Recap>` was collapsed into literal text "- A genome..." (verified in the built DOM). Not linted ("No files found to lint"), not type-checked |
| `vp check` on widget and exercise TS/TSX | Yes (24 files, ~2 s); TSX prop errors caught (TS2322 verified) | Yes for `.ts/.tsx`; **not for props passed in `.mdx`** |
| Extra toolchain | unified/remark (build-time only, nothing shipped) | MDX compiler, Preact preset, Babel 7 (dev only) |

### 4.2 Bundle size notes

- Fonts dominate. Importing the package entry (`@import "@fontsource-variable/source-serif-4"` and friends) inlines **every** `unicode-range` subset, because the browser never gets the chance to skip unused subsets: **894.9 KB raw / 667.4 KB gzip (25 data URIs)**, against **198.1 KB / 145.1 KB** with hand-written latin-only `@font-face` rules.
- Synthetic lessons repeat text, so their gzip numbers are meaningless. Real prose from `docs/research/foundations.md` is about 6.2 bytes/word and compresses about 2.4x (53.7 KB to 22.4 KB). Projection for the full course: roughly 45k words of lesson prose plus markup (~350 KB) + widgets/validators (~60-100 KB) + 3-4 fonts (180-235 KB) ≈ **0.6-0.8 MB raw, about 0.3 MB gzip**. That is far below email attachment limits. CI enforces a budget (start at 1.5 MB).
- A minimal LitElement costs 15.0 KB / 5.8 KB gzip. Preact 11 plus hooks costs 13.5 KB / 5.6 KB gzip in the same build.
- Vite still injects its modulepreload polyfill into the inline script (seen in the output). Disable it with `build.modulePreload: { polyfill: false }` or `viteSingleFile({ removeViteModuleLoader: true })`.

### 4.3 Authoring difficulty for a content contributor

**A (Markdown):** contributors learn one frontmatter block and four directive shapes:

```md
---
id: fasta-reference
section: Sequences
title: The reference genome as a FASTA file
minutes: 10
---

Every read is compared against **GRCh38**...

::spot-the-error{exercise="fasta-wrap-width"}

:::read-more{title="How the .fai index computes byte offsets"}
Each `.fai` line stores ...
:::

::phred-simulator

:::recap
- A record is a `>` header plus sequence lines.
:::
```

Exercise data is written in TS with autocompletion and type errors (`satisfies SpotTheErrorExercise`). Mistakes fail the build or the dev overlay with a code frame. GitHub's Markdown preview shows the directives as plain text, which is readable. Pitfalls: nested containers need more colons (`::::`), and raw HTML is silently dropped (make it a build error; Gotcha 11).

**B (MDX):** every lesson needs relative `import` lines. Prose must avoid `<` and `{` (common in genomics: `MAPQ <20`, `##INFO=<...>`, `{A,C,G,T}`). JSX blocks need blank lines inside, or the formatter rewrites them. Several mistakes only show up at runtime, and props are not type-checked. Better HMR for component authors does not offset these costs for content authors.

---

## 5. Decision record

**Decision:** Architecture A. Markdown lessons with remark-directive are compiled by a project-local Vite plugin. Widgets are custom elements. Simple widgets use vanilla TS; stateful simulators mount Preact islands inside the custom element. One output file via vite-plugin-singlefile.

**Why:**

1. **Errors surface at build time.** Unknown widgets, unknown exercise ids and malformed frontmatter fail `vp build` and show in the dev overlay with `file:line:col`. MDX defers misspelled components and stray `{...}` expressions to runtime, where one bad lesson blanks the page.
2. **Prose is safe for genomics text.** Markdown escapes `<` and leaves `{...}` alone. The one directive pitfall (`:c`, `:chr17` read as text directives) is neutralized centrally in the plugin and covered by a test.
3. **The formatter is safe on content.** Oxfmt preserved directive syntax in `.md`, but it changed the rendered output of an `.mdx` file.
4. **Smaller and simpler.** No runtime Markdown parser and no framework are needed for the core (12.4 KB JS). Nothing on the authoring path requires Babel.
5. **Typed where it matters.** Exercise data, quizzes, validators and widget code are TS/TSX, checked by `vp check`. The Markdown-to-data link (ids) is checked by the plugin and by content tests.

**Costs we accept:** widget-code edits trigger a full page reload in dev (~0.5 s; route and progress survive). We maintain a ~200-line compiler and plugin. Relative images and raw-HTML policy need explicit handling (done in the prototype).

**Rejected:** B (MDX + Preact), for the reasons above. Lit as the default widget library was also rejected: it is fine at runtime, but templates are not type-checked by `vp check`/tsgolint. Revisit only if a component author strongly prefers it.

---

## 6. Lesson authoring format (spec)

- **Location and order:** `content/lessons/<NN-section>/<NN-slug>.md`. Folder and file prefixes set the order. The frontmatter `id` (a slug) is the stable identity used in routes and progress, so renaming or reordering files never loses progress.
- **Frontmatter:** `id`, `section`, `title`, `minutes` (required). Optional: `summary` and `objectives`. Validated at build time.
- **Headings:** `##` and `###` get slug ids and feed the aside TOC. `#` is reserved for the title, which the shell renders.
- **Leaf directives (widgets):** `::<widget>{exercise="<id>"}` for `spot-the-error`, `fix-it`, `sort`, `field-explorer`, `predict`, `mcq`. Simulators take no exercise: `::cigar-simulator`, `::flag-decoder`, `::phred-simulator`, `::bgzf-demo`, `::gvcf-expander`, `::gfa-drawer`, plus `::quiz{id="sequences"}`. Each name maps to a custom-element tag in one table (`WIDGET_TAGS` and `SIMULATOR_TAGS`).
- **Container directives:** `:::read-more{title="..."}`, `:::recap`, and later `:::case-file` for story beats and `:::note`.
- **Text directives:** none defined. Any `:word` in prose is restored to literal text.
- **Code blocks:** fenced with a format tag (```` ```sam ````). The shell adds a copy button. A build-time rehype step can add column spans for tab-separated formats later.
- **Images:** relative paths next to the lesson are turned into imports and inlined. For theme-aware diagrams, use inline SVG (a widget or a `?raw` import into a component), because `<img>` SVG cannot use `currentColor`.
- **Raw HTML:** forbidden. The compiler should fail on mdast `html` nodes. Today remark-rehype silently drops them (verified: `<kbd>` disappeared).
- **Exercise data:** `src/exercises/<format>.ts`, one exported const per exercise, typed with `satisfies`, and registered by id in `src/exercises/registry.ts`. Keep these modules **pure TS** (no `?raw`, CSS or Vite-only imports), because the plugin loads the registry with Node's native type stripping.

---

## 7. Build pipeline

### 7.1 `vite.config.ts`

```ts
import { defineConfig } from "vite-plus";
import { viteSingleFile } from "vite-plugin-singlefile";
import { lessons } from "./plugins/vite-plugin-lessons.ts";

export default defineConfig({
  base: "./",
  define: { __COURSE_VERSION__: JSON.stringify(process.env.COURSE_VERSION ?? "dev") },
  build: { modulePreload: { polyfill: false } },
  plugins: [lessons({ registry: "src/exercises/registry.ts" }), viteSingleFile()],
  test: { include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"] },
  fmt: { printWidth: 110, ignorePatterns: ["dist/**", "test-results/**", "playwright-report/**"] },
  lint: {
    ignorePatterns: ["dist/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
```

`tsconfig.json` adds `"jsx": "react-jsx", "jsxImportSource": "preact"`, and `include` covers `src`, `plugins`, `tests`, `vite.config.ts` and `playwright.config.ts`, so `vp check` type-checks all of them.

### 7.2 Lesson plugin (as prototyped)

```ts
export function lessons({ registry }: { registry: string }): Plugin {
  const registryPath = resolve(registry);
  let cache: { mtime: number; ids: Set<string> } | null = null;
  const exerciseIds = async () => {
    const mtime = statSync(registryPath).mtimeMs;
    if (cache?.mtime !== mtime) {
      // Node >= 22.18 strips types natively; NOT imported from vite.config.ts on purpose
      const mod = await import(`${pathToFileURL(registryPath).href}?t=${mtime}`);
      cache = { mtime, ids: new Set(Object.keys(mod.exercises)) };
    }
    return cache.ids;
  };
  return {
    name: "gf-lessons",
    enforce: "pre",
    async transform(source, id) {
      if (!id.endsWith(".md")) return null;
      this.addWatchFile(registryPath);
      try {
        const lesson = await compileLesson(source, id, { exerciseIds: await exerciseIds() });
        const imports = lesson.images.map((src, i) => `import __img${i} from ${JSON.stringify(src)};`);
        const html = lesson.images.reduce(
          (expr, _s, i) => `${expr}.replaceAll("__GF_IMG_${i}__", __img${i})`,
          JSON.stringify(lesson.html),
        );
        const code = `${imports.join("\n")}\nexport default { ...${JSON.stringify({ ...lesson, html: "" })}, html: ${html} };`;
        return { code, map: null, moduleType: "js" };
      } catch (err) {
        const e = err as { message: string; line?: number; column?: number };
        this.error({ message: e.message, id, loc: { line: e.line ?? 1, column: e.column ?? 0 } });
      }
    },
  };
}
```

The compiler (`plugins/lesson-compiler.ts`, ~170 lines) runs `remark-parse` → `remark-frontmatter` → `remark-gfm` → `remark-directive` → frontmatter reader → directive mapper → `remark-rehype` → heading ids/TOC → image collector → `rehype-stringify`. The directive mapper:

- sets `data.hName`/`hProperties` to turn `::fix-it{exercise}` into `<gf-fix-it exercise="...">`;
- turns `:::read-more` into `<details class="read-more"><summary>`;
- restores unknown `textDirective` nodes to literal `:name[label]`;
- fails with `file.fail(msg, node)` (wrapped in a `never`-returning helper so TypeScript narrows) for an unknown widget, a missing or unknown exercise id, an unknown container, or missing frontmatter.

The same `compileLesson` function is imported by the content tests, so tests and build cannot drift apart.

### 7.3 Runtime wiring

```ts
// src/shell/lessons.ts
const modules = import.meta.glob<CompiledLesson>("/content/lessons/**/*.md", { eager: true, import: "default" });
export const lessons = Object.keys(modules).sort().map((k) => modules[k]!);
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (mod) window.dispatchEvent(new CustomEvent("gf:lessons-updated", { detail: mod.lessons }));
  });
}
```

The shell sets `main.innerHTML = lesson.html`; the HTML is trusted because it was compiled from repository content at build time. Custom elements upgrade themselves. A widget reports success with a bubbling `gf:solved` CustomEvent, and the shell records it in progress. A Preact island is a 6-line wrapper:

```tsx
class PhredSimulatorElement extends HTMLElement {
  connectedCallback() { render(<PhredSimulator />, this); }
  disconnectedCallback() { render(null, this); }
}
customElements.define("gf-phred-simulator", PhredSimulatorElement);
```

Widgets render into light DOM (no shadow DOM), so the theme tokens and prose styles apply and tests can query them directly.

---

## 8. Hash routing design (~30 routes in one file)

| Route | View |
|---|---|
| `#/` | Course home: outline, resume button, theme toggle |
| `#/<lesson-id>` | Lesson (for example `#/fasta-reference`) |
| `#/<lesson-id>/<heading-id>` | Lesson scrolled to a heading; TOC links and shareable deep links |
| `#/quiz/<section-id>` | Section quiz; "Passed" badge in the outline at the pass threshold |
| `#/capstone` | Case-folder triage |
| `#/badge` | Completion badge, unlocked when all quizzes and the capstone pass |
| `#/about` | Version (`__COURSE_VERSION__`), licenses (MIT code, OFL fonts), credits |
| anything else | "Not found" with the outline (the prototype fell back to lesson 1; do not do that in production) |

Rules, all verified in the prototypes unless noted:

- Navigation between lessons uses plain `<a href="#/...">` links, so back and forward work (tested: Back returned to the previous lesson and heading).
- TOC clicks call `preventDefault`, `scrollIntoView` and then `history.replaceState(null, "", "#/lesson/heading")`, so scrolling through headings does not flood the history.
- Bare `#heading` anchors are never used, because they would replace the route.
- `history.pushState` to a different **path** throws `SecurityError` on file:// in Chromium. Hash-only and query-only changes succeed, so hash routing is the only portable choice.
- On each route change: render, set `document.title`, scroll to the top or to the heading, move focus to the `<h1>` (`main` has `tabindex="-1"`) for screen readers, and rebuild the scrollspy `IntersectionObserver` (`rootMargin: "0px 0px -70% 0px"`; the active TOC entry was confirmed).
- The lesson switcher in the aside ("Lesson N of M, Section / Title") expands into the full outline grouped by section, with checkmarks from progress. The lesson order and the `widgets` list come from compiled metadata, so "lesson complete" can mean "all exercises in it solved".

---

## 9. Progress persistence on file://

### 9.1 Browser behavior

| Browser | file:// localStorage | Scope | Evidence |
|---|---|---|---|
| Chromium 141 (Chrome, Edge) | Works and **persists across browser restarts** | **One area shared by every file:// page.** A different local file (`file:///etc/hostname`) read the course's key. `location.origin` reports `"file://"`, while CORS treats the origin as `null` | Tested (persistent profile, relaunch) |
| Firefox | Works [source-read; forum report] | **Per file path** (fragment ignored). Moving or renaming the file, or opening a second copy, starts with empty progress | Gecko `ContentPrincipal::GenerateOriginNoSuffixFromURI` uses the full spec when `security.fileuri.strict_origin_policy` is `true` (the default in `StaticPrefList.yaml`). Local-storage-next-gen keys on the principal origin. A Mozilla support thread reports per-file-path storage since Firefox 92. Not tested here (no Firefox binary) |
| Safari (macOS) | **Throws `SecurityError` ("The operation is insecure")** unless the user enables Develop > Disable Local File Restrictions [forum report; source-read] | n/a | Apple Developer Forums thread 87778 (Safari 11+). WebKit `ScriptExecutionContext::canAccessResource` denies LocalStorage to local origins unless `needsStorageAccessFromFileURLsQuirk` is set by the embedder. `LocalDOMWindow::localStorage()` can also return `null` when storage is disabled |
| iOS / iPadOS | Opening an emailed .html usually goes to a Quick Look preview with limited or no script execution [from memory - verify] | n/a | Point mobile learners to the Pages URL |
| GitHub Pages (https) | Works in all browsers | Origin `https://<owner>.github.io` is **shared by all of that owner's project sites**, so keys must be namespaced | Standard same-origin rule |

MDN says "each file: URL seems to have its own unique local-storage area" in current browsers. Our Chromium 141 test contradicts that, so do not rely on either claim.

### 9.2 Design (implemented and tested in both prototypes)

```ts
const KEY = "genomic-file-formats:v1:progress"; // namespaced: Chromium shares one file:// store
function probeStorage(): Storage | null {
  try {
    const s = window.localStorage; // may throw (Safari) or be null (WebKit with storage disabled)
    s.setItem("__gf_probe__", "1");
    s.removeItem("__gf_probe__");
    return s;
  } catch { return null; }
}
```

- Every read and write is wrapped in try/catch. Corrupt JSON falls back to the in-memory copy. Unknown lesson ids are ignored, so an older or newer copy of the course sharing the Chromium store does no harm.
- When the probe fails: keep progress in memory and show a small notice ("Progress will not be saved in this browser"). Tested with an `addInitScript` that makes the `localStorage` getter throw `SecurityError`: no page errors, the notice appears, and checkmarks still work for the session.
- Recommended v1 extra: an "Export / import progress" control that copies a short base64 JSON code. It covers Safari on file://, moved files in Firefox and switching devices, and needs no server.
- Store the theme choice under a separate key (`genomic-file-formats:theme`). Apply it from a tiny inline classic `<script>` in `<head>` (in try/catch) to avoid a flash of the wrong theme.

---

## 10. Test strategy

| Layer | Runner and environment | What it asserts | Prototype evidence |
|---|---|---|---|
| Validator unit tests | `vp test`, node | Each format validator accepts known-good fixtures and reports each error code at the right line and column; edge cases (CRLF, trailing newline, empty input) | 7 FASTA tests. A test caught a cascading-errors UX bug (missing `>` reported 3 errors; fixed to 2) |
| Content tests | `vp test`, node | Every lesson compiles with the **real** compiler. Every directive references a registered exercise. Lesson ids are unique. No orphan exercises. **spot-the-error:** the set of validator error lines equals `[answerLine]` and the code equals `expectCode`. **fix-it:** the starter is invalid and the solution is valid. Planned: **mcq** has exactly one correct option for single-select and every option has an explanation; **sort** gives every item a valid bin; each section ends with a quiz | Changing `answerLine` 3 → 4 failed with `expected [3] to deeply equal [4]` |
| Widget DOM tests | `vp test` with `// @vitest-environment happy-dom` at the top of the file | Interaction (wrong and right clicks, typing until valid, keyboard alternative for sort), `gf:solved` fired exactly once, an unknown id renders a visible error instead of throwing | 3 tests; B used `@testing-library/preact` 3.2.4 |
| E2E on the built file | `@playwright/test` against `pathToFileURL("dist/index.html")`; projects for chromium, firefox and webkit | No page or console errors. **No requests other than the file and `data:` URIs** (also catches broken images). Every route in the outline renders. Smoke path through one widget. Progress survives a reload where storage works; the fallback notice appears where it does not. A throwing-storage init script runs in every engine | 3 tests passed in 2.7 s on Chromium via `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` |
| Dist check | `node scripts/check-dist.mjs dist` | Exactly one `index.html`; no `<script src>`, stylesheet `<link>` or non-`data:` `url()`/`src`/`href` in the markup; size budget | Passed on the single file; rejected the multi-file build |

Notes:

- `vp test` runs Vitest 5. Tests import from `vite-plus/test`. Keep e2e files as `*.spec.ts` so the Vitest `include` (`*.test.ts`) skips them.
- Playwright's WebKit build is **not** Safari: file:// storage depends on embedder settings. That is why the storage-fallback path is forced with an init script instead of trusting the engine's behavior.
- Locally in this sandbox, do not run `playwright install`; pass `PW_CHROMIUM_PATH`. The config reads it: `launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: ... } : {}`.
- Optional later: an "oracle" CI job that writes every snippet to disk and runs real tools (`samtools view`, `bcftools view`, `gfatools`) to cross-check the hand-written validators. Also optional: `@axe-core/playwright` accessibility scans.

Timings in the prototype: `vp check` about 2 s for lint and types plus about 1 s for formatting; `vp test` 0.9-1.4 s; `vp build` 0.3-0.5 s of bundling (1.8-2.5 s wall clock including CLI start-up).

---

## 11. CI/CD on GitHub Actions

### 11.1 Pinned actions (looked up 2026-10-16 with `git ls-remote` and a bare clone; `api.github.com` was blocked for this repo)

| Action | Version | Commit SHA |
|---|---|---|
| `voidzero-dev/setup-vp` | **v1.21.2** (tagged 2026-10-11; previous v1.21.1 on 2026-09-21) | `68f39c78aaf39be468cabd2afb09c162574c84af` |
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/upload-artifact` | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| `actions/download-artifact` | v8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` |
| `actions/upload-pages-artifact` | v5.0.0 | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
| `actions/deploy-pages` | v5.0.1 | `368f82528645a54fb793d4d04e342629a3f51346` |

The setup-vp README warns that the moving `v1` tag is frozen at v1.15.0 and tells users to pin an exact tag or SHA. The Vite+ CI guide says not to use `v1`. setup-vp reads the Vite+ version from the `vite-plus` catalog entry, installs it, runs `vp install`, and caches with `cache: true`. If the project's policy requires a two-week soak period, pin v1.21.1 until v1.21.2 is 14 days old.

### 11.2 `.github/workflows/ci.yml` (passes actionlint 1.7.12)

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
  workflow_call:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: voidzero-dev/setup-vp@68f39c78aaf39be468cabd2afb09c162574c84af # v1.21.2
        with:
          node-version-file: .node-version
          cache: true
      - run: vp check
      - run: vp test
      - run: vp build
        env:
          COURSE_VERSION: ${{ github.ref_type == 'tag' && github.ref_name || github.sha }}
      - name: Assert one self-contained file within budget
        run: node scripts/check-dist.mjs dist
      - name: Install Playwright browsers
        run: vp exec playwright install --with-deps chromium firefox webkit
      - name: E2E on the built file over file://
        run: vp exec playwright test
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: course-html
          path: dist/index.html
          if-no-files-found: error
          retention-days: 14
```

### 11.3 `.github/workflows/release.yml` (passes actionlint 1.7.12)

```yaml
name: Release
on:
  push:
    tags: ["v*"]
permissions:
  contents: read
jobs:
  ci:
    uses: ./.github/workflows/ci.yml
  github-release:
    needs: ci
    runs-on: ubuntu-24.04
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: course-html
      - name: Attach the single HTML file to the GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ github.ref_name }}
        run: |
          cp index.html "genomic-file-formats-${TAG}.html"
          sha256sum "genomic-file-formats-${TAG}.html" > "genomic-file-formats-${TAG}.html.sha256"
          gh release create "$TAG" --repo "$GITHUB_REPOSITORY" --verify-tag --generate-notes \
            "genomic-file-formats-${TAG}.html" "genomic-file-formats-${TAG}.html.sha256"
  pages:
    needs: ci
    runs-on: ubuntu-24.04
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2
        with:
          name: course-html
          path: site
      - uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5.0.0
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346 # v5.0.1
```

Design points:

- The file is **built once** in the `ci` job. The Release asset and the Pages site are the same bytes, with a published `.sha256`.
- Releases use the preinstalled `gh` CLI, so no third-party release action is needed.
- Pages is deployed only from release tags, so the hosted page always equals the latest released file. Pull requests get a downloadable `course-html` artifact as a preview.
- One-time repository settings: Settings > Pages > Source = "GitHub Actions". The `github-pages` environment must allow deployments from `v*` tags. GitHub creates it limited to the default branch [from memory - verify]; the docs confirm that environments support "Selected branches and tags" rules.
- Add Renovate or Dependabot to bump the SHA pins. The setup-vp README says both can manage pinned tags.

---

## 12. Repository layout

```
genomic-file-formats/
├─ .github/workflows/{ci.yml, release.yml}
├─ .node-version                    # 22 (>= 22.18 for native TS import in the plugin) or 24
├─ package.json                     # "vite-plus": "catalog:", devEngines pnpm 12.14.0, scripts: dev/check/test/build/e2e
├─ pnpm-workspace.yaml              # catalog vite-plus 1.3.0, savePrefix: "", release-age settings
├─ pnpm-lock.yaml
├─ vite.config.ts                   # lessons plugin + singlefile + test/lint/fmt
├─ playwright.config.ts
├─ tsconfig.json
├─ index.html                       # shell markup, data-URI favicon, no-flash theme script
├─ content/
│  └─ lessons/
│     ├─ 00-foundations/01-what-can-break.md ... 99-quiz.md
│     ├─ 01-sequences/01-fasta-reference.md, 02-fastq-reads.md, ..., 99-quiz.md
│     ├─ ... (intervals, alignments, signals, variants, annotation, structural, graphs)
│     ├─ 90-capstone/01-case-folder.md
│     └─ figures/ (shared SVG/PNG, inlined at build time)
├─ plugins/
│  ├─ lesson-compiler.ts            # unified pipeline (Node only; shared with content tests)
│  └─ vite-plugin-lessons.ts
├─ src/
│  ├─ main.ts
│  ├─ shell/                        # router.ts, progress.ts, lessons.ts, toc.ts, outline.ts, theme.ts, copy.ts, about.ts
│  ├─ widgets/                      # spot-the-error.ts, fix-it.ts, sort.tsx, field-explorer.tsx, predict.ts, mcq.tsx, quiz.tsx
│  │  └─ simulators/                # coordinate-ruler, flag-decoder, cigar-drawer, phred, bgzf-demo, gvcf-expander, gfa-drawer (.tsx)
│  ├─ exercises/                    # types.ts, registry.ts, fasta.ts, fastq.ts, bed.ts, sam.ts, vcf.ts, ..., quizzes/*.ts
│  ├─ formats/                      # shared tokenizers (field splitting, SAM FLAG/CIGAR, VCF header) used by validators + field-explorer
│  ├─ validators/                   # one file per format + *.test.ts; pure, DOM-free
│  └─ styles/                       # tokens.css (light/dark), fonts.css (latin-only @font-face), prose.css, widgets.css
├─ tests/
│  ├─ content.test.ts
│  └─ e2e/course.spec.ts
├─ scripts/check-dist.mjs
├─ LICENSE                          # MIT (code and course text, per owner)
├─ LICENSES/OFL-1.1.txt             # embedded fonts; also listed at #/about
└─ docs/
   ├─ research/ (this file and the content research)
   └─ CONTRIBUTING.md               # authoring guide: directives, exercise ids, `vp dev`, common errors
```

Recommended `package.json` scripts (the template's `"build": "tsc && vp build"` is redundant, because `vp check` already type-checks):

```json
{ "dev": "vp dev", "check": "vp check", "test": "vp test", "build": "vp build", "e2e": "playwright test" }
```

---

## 13. Toolchain and dependency policy

| Package | Version tested | Notes |
|---|---|---|
| vite-plus | 1.3.0 (Vite 8.3.4, Rolldown 1.2.14, Vitest 5.0.5, Oxlint 1.88.0, tsgolint 7.0.2004, Oxfmt 0.73.0) | via pnpm catalog; setup-vp reads it |
| pnpm | 12.14.0 (via `devEngines`) | use `vp install` / `vp add`, not system pnpm 10 |
| typescript | ~6.0.2 (6.0.3 resolved) | |
| vite-plugin-singlefile | 2.3.3 | sets `assetsInlineLimit: () => true`, `cssCodeSplit: false`, `codeSplitting: false` on Vite 8 |
| unified / remark-parse / remark-directive / remark-gfm / remark-frontmatter / remark-rehype / rehype-stringify | 11.0.5 / 11.0.0 / 4.0.0 / 4.0.1 / 5.0.0 / 11.1.2 / 10.0.1 | build-time only |
| unist-util-visit / vfile / yaml / @types/mdast / @types/hast | 5.1.0 / 6.0.3 / 2.9.1 / 4.0.4 / 3.0.5 | `vfile` must be a direct dependency (pnpm strict) |
| preact | 11.0.1 (published 2026-10-08; 10.29.8 is the mature 10.x) | islands only |
| @fontsource-variable/source-serif-4, inter, jetbrains-mono | 5.3.1, 5.3.0, 5.3.0 | OFL-1.1; latin `wght` files only (~51 + 48 + 40 KB woff2) |
| happy-dom | 21.0.3 used (published 2026-10-15); **pin 20.14.5 (2026-09-12)** for the repo | |
| @playwright/test | 1.64.1 used (2026-10-14); 1.63.0 (2026-09-04) if a soak period is wanted | browsers installed in CI only |

Policy: pin exact versions (`savePrefix: ""` in `pnpm-workspace.yaml` makes `vp add` write exact versions; verified). Prefer releases older than one to two weeks. When pnpm 12's release-age gate blocks a fresh release, pin an older version rather than growing `minimumReleaseAgeExclude`.

---

## 14. Gotchas (all observed unless marked)

1. **A multi-file build does not work from file://.** Chromium blocked `assets/index-*.js` and the CSS with `Access to script ... from origin 'null'` / `net::ERR_FAILED`. Always build with vite-plugin-singlefile and run `check-dist`.
2. **`<link rel="icon" href="./src/favicon.svg">` is emitted as a separate file** ("NOTE: asset not inlined"). Use a `data:image/svg+xml,...` favicon written directly in `index.html`.
3. **The fontsource package entry inlines all subsets:** 916 KB instead of 203 KB. Write latin-only `@font-face` rules with `url("@fontsource-variable/<pkg>/files/<pkg>-latin-wght-normal.woff2")`. Vite resolves the bare specifier, and singlefile inlines it.
4. **remark-directive reads `:c` in `NM_000546.6:c.215C>G` and `:chr17` in `GRCh38:chr17` as text directives.** The plugin restores unknown text directives to literal text; keep a test for it.
5. **MDX (if ever revisited):** `<` in prose fails the build; `{A,C,G,T}` builds and then crashes at runtime; misspelled components only fail at runtime; props are not type-checked; relative images are not inlined.
6. **Oxfmt formats `.md` and `.mdx`.** On `.md` it only normalized emphasis and kept directives. On `.mdx` it rewrote `<Recap>\n- item\n</Recap>` to one line, turning the list into text. Blank lines inside JSX blocks prevent this.
7. **Importing the exercise registry from `vite.config.ts` restarts the dev server on every exercise edit** ("src/exercises/fasta.ts changed, restarting server..."). Load it inside the plugin with Node's native TS import plus `this.addWatchFile` instead (verified: page reload, no restart). This needs Node ≥ 22.18 and registry modules free of Vite-only imports.
8. **Relative images inside compiled HTML strings are invisible to Vite.** Convert them to imports in the plugin. Use inline SVG when a diagram must follow the theme (`currentColor` does not reach `<img>`).
9. **Chromium shares one localStorage across every file:// page.** GitHub Pages project sites share `<owner>.github.io`. Always use a namespaced, versioned key.
10. **`history.pushState` to another path throws `SecurityError` on file://.** Use hash routes, and never use bare `#heading` anchors.
11. **Raw HTML in Markdown is silently dropped** by remark-rehype's defaults (`<kbd>` vanished). Make the compiler fail on `html` nodes so authors find out.
12. **System pnpm 10 calls the pnpm 12 lockfile "broken"** (it is a multi-document YAML file) and ignores it. Always use `vp install` / `vp add` (setup-vp does this in CI).
13. **pnpm strict `node_modules`:** a type-only import of `vfile` failed `vp check` (TS2307) until `vfile` was added as a direct devDependency.
14. **`vfile.fail()` does not narrow types.** Wrap it in a `never`-returning helper.
15. **Oxlint `no-misused-spread`** flags `[...string]`. Use `string.search(regex)` in validators.
16. **The modulepreload polyfill is inlined uselessly.** Disable it (Section 4.2).
17. **Widget-code edits in dev cause a full reload** (vanilla custom elements, and Preact islands without Prefresh). Adding `@preact/preset-vite` would bring HMR back but pulls in Babel 7 (and `@babel/core` 8 trips its peer range).
18. **The template's `build` script runs `tsc && vp build`**, and `vp build` prints a note suggesting `vpr build` for scripts. Keep scripts thin and let `vp check` do type checking.
19. **setup-vp `@v1` is frozen at v1.15.0.** Pin the exact SHA.
20. **The Pages environment may reject tag deployments** until a `v*` tag rule is added [from memory - verify].
21. **Font licensing:** OFL fonts embedded in the file need their license shipped (an `#/about` route plus `LICENSES/OFL-1.1.txt`).

---

## 15. Open questions and risks

- **Safari on file:// has no persistence.** Is an export/import progress code acceptable for v1, or should the course tell Safari users to use the Pages URL? (Recommendation: both; show the notice with a Pages link.)
- **Firefox file:// behavior** was read from source and forum reports, not tested. Run the Playwright Firefox project in CI on the first PR to confirm, and test real Safari manually once before v1.0.
- **iOS email-attachment viewing** is unverified. Decide whether mobile support means "Pages URL only".
- **BAM/CRAM/BGZF demos need binary data.** Generate the bytes offline with real tools, commit them as small base64 constants in TS, and decompress in the browser only if needed (a DEFLATE library such as fflate adds about 8 KB [from memory - verify]).
- **Quiz integrity is out of scope.** Answer keys are in the file by design (self-study course).
- **Accessibility of drag-and-drop sort:** design a click/keyboard alternative from the start and cover it in widget DOM tests.

---

## 16. Reproduce the evidence

```bash
# build + measure
pnpm exec vp build && node size-breakdown.mjs dist/index.html
node e2e-file.mjs "$PWD/dist/index.html"         # 24 checks: routing, widgets, storage, restart, throwing storage
node scripts/check-dist.mjs dist
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm exec playwright test --project=chromium
pnpm exec vp check && pnpm exec vp test
# HMR timing (dev server on a fixed port)
pnpm exec vp dev --port 5181 --strictPort &
node hmr-test.mjs http://localhost:5181/ "$PWD/content/lessons/02-sequences/01-the-reference.md" "#/fasta-reference" '::spot-the-eror{exercise="fasta-wrap-width"}'
# workflow lint
actionlint .github/workflows/*.yml
```

(The scripts `size-breakdown.mjs`, `e2e-file.mjs`, `hmr-test.mjs`, `hmr-widget.mjs`, `pushstate.mjs` and `img-check.mjs` were in the session scratchpad (`tech-proto/`), which does not persist.)

---

## Sources

Primary sources read in this session:

- Vite+ 1.3.0 local docs: `node_modules/vite-plus/docs/guide/check.md`, `guide/ci.md`, `config/lint.md`, `config/test.md`, `config/run.md`; `vp toolchain` output.
- setup-vp: https://raw.githubusercontent.com/voidzero-dev/setup-vp/main/action.yml and `README.md` (pinning guidance, `v1` frozen at v1.15.0). Tags and dates from `git ls-remote` and a bare clone of https://github.com/voidzero-dev/setup-vp.
- GitHub actions tags and SHAs via `git ls-remote`: actions/checkout, actions/upload-artifact, actions/download-artifact, actions/upload-pages-artifact (`action.yml` at v5.0.0), actions/deploy-pages (`action.yml` at v5.0.1).
- GitHub Docs source: https://raw.githubusercontent.com/github/docs/main/content/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages.md, `.../content/actions/reference/workflows-and-actions/deployments-and-environments.md`, `.../content/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments.md`.
- vite-plugin-singlefile README: https://raw.githubusercontent.com/richardtallent/vite-plugin-singlefile/main/README.md, and its `dist/esm/index.js` (recommended build config, Vite 8 `codeSplitting: false`).
- MDN localStorage page source: https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/api/window/localstorage/index.md (file: URL behavior "undefined"; `SecurityError` cases).
- Firefox (Gecko) source, https://raw.githubusercontent.com/mozilla-firefox/firefox/main/: `caps/ContentPrincipal.cpp` (file origin = full spec under strict policy; `file://UNIVERSAL_FILE_URI_ORIGIN` when not strict), `caps/BasePrincipal.cpp` (`GetStorageOriginKey` uses the directory for file:), `modules/libpref/init/StaticPrefList.yaml` (`security.fileuri.strict_origin_policy: true`; legacy localStorage implementation off by default), `dom/quota/PrincipalUtils.cpp`.
- WebKit source, https://raw.githubusercontent.com/WebKit/WebKit/main/: `Source/WebCore/dom/ScriptExecutionContext.cpp` (`canAccessResource` denies LocalStorage to local origins without the quirk), `Source/WebCore/dom/Document.cpp` (quirk and file-path separation), `Source/WebCore/page/LocalDOMWindow.cpp` (`localStorage()` may return null), `Source/WebCore/page/SecurityOrigin.cpp`/`.h`, `Source/WTF/Scripts/Preferences/UnifiedWebPreferences.yaml` (`NeedsStorageAccessFromFileURLsQuirk` default true, embedder-controlled).
- Apple Developer Forums, "Safari 11 gets SecurityError (DOM exception 18) when accessing localStorage": https://developer.apple.com/forums/thread/87778
- npm registry metadata (versions, publish dates, peer dependencies) from https://registry.npmjs.org for every package listed in Section 13.

Secondary (search-result summaries only; pages not reachable):

- Mozilla Support thread on per-file-path localStorage since Firefox 92: https://support.mozilla.org/ca/questions/1349979
- Bugzilla 507361 "localStorage doesn't work in file:/// documents": https://bugzilla.mozilla.org/show_bug.cgi?id=507361
- "Firefox's file uri origin policy and web fonts": https://stuffandnonsense.co.uk/blog/firefoxs_file_uri_origin_policy_and_web_fonts

Unreachable in this environment: developer.mozilla.org, bugzilla.mozilla.org, support.mozilla.org and onezeronull.com (WebFetch DNS failure); api.github.com for voidzero-dev/setup-vp ("GitHub access to this repository is not enabled for this session"; tags were read with `git ls-remote` instead). No Firefox or Safari binary was available, so the per-browser file:// storage claims for those two engines are inferred, not tested.
