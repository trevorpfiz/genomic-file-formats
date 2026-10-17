# Notes for agent sessions

An interactive course on genomic file formats, built into one self-contained `dist/index.html` that works from `file://` and on GitHub Pages.

- **The plan is the contract:** `docs/PLAN.md` (§11 architecture, §12 accuracy and style, §13 milestones and acceptance). Research notes are in `docs/research/`. Do not edit either unless asked. Developer contract (module map, types, card API, directive HTML, tests): `docs/ARCHITECTURE.md`. Contributor docs: `docs/CONTRIBUTING.md`.
- **Commands** (run through the project, never a system pnpm 10, which cannot read the pnpm 12 lockfile):
  - `pnpm exec vp install` (when `node_modules/` is missing: a standalone `vp` CLI, or `npx --yes pnpm@12.14.0 --dir <repo> install` run from outside the repo, because npx inside it fails the devEngines check)
  - `pnpm exec vp check` (format, lint, type check; `pnpm exec vp fmt` writes formatting), `pnpm exec vp test`, `pnpm exec vp build`
  - `node scripts/check-dist.mjs dist`, then `pnpm exec playwright test` (needs a fresh build)
  - `pnpm exec vp add -D <pkg>@<exact>`: pins stay exact, and versions younger than 14 days are refused by the release-age gate; do not widen `minimumReleaseAgeExclude` beyond the Vite+ closure.
- **Playwright locally:** never run `playwright install`. `playwright.config.ts` uses `/opt/pw-browsers/chromium` when it exists outside CI (or `PW_CHROMIUM_PATH`) and then runs Chromium only; CI runs e2e on Chromium only; a manual CI run with `all-browsers` adds Firefox and WebKit.
- **Do not edit generated modules:** `virtual:lessons` is produced by `plugins/vite-plugin-lessons.ts`; `src/case/generated/**` is written by `gen:case` (a stub in M1, the full generator in M2) and is excluded from `vp fmt`.
- **Authoring rules:** no raw HTML in lessons (only `<!-- src: ... -->` comments); genomic tokens such as `<DEL>` in backticks; write TAB and CR in snippets as `\t` and `\r` (a test rejects raw U+000D in `src/` and `content/`); exercise modules are pure TS and are never imported from `vite.config.ts`.
- **Shipped file:** one `index.html`, everything inlined, no external requests; `check-dist` also rejects the terms in `scripts/brand-denylist.txt`.
