# Contributing

This is a stub; it grows with each milestone. The build contract is [`PLAN.md`](PLAN.md): §11 for architecture, §12 for accuracy and style, §13 for milestones.

## Setup

You need Node 22.22.0 (see `.node-version`) and the Vite+ CLI, `vp`. Install it once, globally (from outside this folder, or see https://viteplus.dev/guide/):

```sh
npm install --global vite-plus@1.3.0
vp install            # installs pnpm 12.14.0 from devEngines, then the locked dependencies
```

Once `node_modules/` exists, `pnpm exec vp <command>` also works without the global CLI.

Use `vp install` and `vp add`, never a system pnpm 10: it cannot read the pnpm 12 lockfile. New dependencies must be pinned exactly (`savePrefix: ""` does this) and be at least 14 days old: the release-age gate in `pnpm-workspace.yaml` refuses younger versions, also in CI. Only the Vite+ toolchain's own closure is exempt (D-31).

## Commands

| Command                            | What it does                                                              |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `pnpm exec vp dev`                 | Dev server with live lesson reloads                                       |
| `pnpm exec vp check`               | Format check, lint and type check (`vp check --fix` formats)              |
| `pnpm exec vp test`                | Unit, content and widget tests                                            |
| `pnpm exec vp build`               | Builds `dist/index.html`, the one self-contained file                     |
| `node scripts/check-dist.mjs dist` | Asserts one self-contained file, the fallback text, the denylist and size |
| `pnpm exec playwright test`        | E2E on the built file over `file://` (run `vp build` first)               |

Playwright needs browsers: `pnpm exec playwright install chromium firefox webkit` on your machine, or set `PW_CHROMIUM_PATH` to a Chromium you already have.

## Writing lessons

Lessons are Markdown files in `content/lessons/<NN-section>/<NN-slug>.md`, with YAML frontmatter checked per `kind` (lesson, quiz, capstone, page). The compiler (`plugins/lesson-compiler.ts`) fails the build with `file:line:col` on authoring mistakes.

- **No raw HTML.** Any HTML tag fails the build. The only exception is a source comment, `<!-- src: SAMv1 section 1.4 -->`, which is stripped from the output and kept for the fact-check report.
- **Genomic tokens go in backticks.** CommonMark reads `<DEL>`, `<INV>` and `<DUP>` as HTML tags and `<DUP:TANDEM>` as a link, so write `` `<DEL>` ``. `<NON_REF>`, `<*>`, `{A,C,G,T}` and `MAPQ <20` are plain text either way.
- **Colons are safe.** `chr2:166,014,902`, `SA:Z:chr2,...`, `GT:AD:DP:GQ:PL` and `NM_000546.6:c.215C>G` print exactly as written; the compiler restores the text directives that remark-directive would otherwise read into them.
- **Headings.** Do not write a `#` heading: the shell renders the title. Every lesson's last H2 is `## Recap`. Heading texts are unique within a page.
- **Exercises.** Put a directive on its own line: `::predict{exercise="<lesson-id>/<slug>"}`. Directly under a `## Try it: ...` heading it is a "Try it" card; anywhere else it becomes a Quick check titled with the exercise's `title`. Inside `:::read-more{title="..."}` it is optional practice.
- **Links.** `[text](#heading-id)` becomes a route to that heading in the same lesson; other internal links use `#/...` routes. External links use `https://`.

## Adding an exercise

1. Open (or create) `src/exercises/<lesson-id>.ts` and add one exported const per exercise, typed with `satisfies` (types in `src/exercises/types.ts`). Its `id` is `<lesson-id>/<slug>`.
2. A new module is registered once, in the `modules` map of `src/exercises/registry.ts`. Every export of a registered module is an exercise, so later exercises need no registry edit.
3. Reference it from the lesson with the directive for its kind, for example `::predict{exercise="placeholder-hello/bed-to-one-based"}`.

Exercise modules are pure TypeScript: no CSS, `?raw` or other Vite-only imports, because the lesson plugin evaluates the registry in Vite's module runner. Write TAB and CR inside snippets as `\t` and `\r`: a test rejects a raw carriage return anywhere in `src/` and `content/`. In `vp dev`, an edit to any exercise module recompiles the lessons without a server restart.

## Releases and Pages

- Pull requests get a downloadable `course-html` artifact from CI.
- Pushing a tag `vX.Y.Z` runs `release.yml`: it builds once through `ci.yml`, attaches `genomic-file-formats-vX.Y.Z.html` and its `.sha256` to a GitHub Release, and deploys the same file to Pages. Running `release.yml` by hand is a dry run.
- One-time repository settings (V-29): Settings > Pages > Source: "GitHub Actions"; then Settings > Environments > `github-pages` > Deployment branches and tags: add a tag rule `v*` so release tags may deploy.
