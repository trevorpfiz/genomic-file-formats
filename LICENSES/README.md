# Third-party licenses

The course's code and text are under the MIT license in [`../LICENSE`](../LICENSE).

Third-party assets bundled into the built `index.html` keep their own licenses. Their notices live in this folder, and the course shows the same texts on its `#/about` page: the shell imports these files at build time, so the page and this folder cannot drift apart (docs/PLAN.md O-01, D-24; OQ-8, option a).

| File             | Covers                                                                                                                                                                                                                                                                                                                        | Arrives in |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `MIT-preact.txt` | Preact 10.29.8, bundled into the course's JavaScript                                                                                                                                                                                                                                                                          | M0         |
| `OFL-1.1.txt`    | Embedded fonts, latin subsets as 5 woff2 files: Source Serif 4 500 (`@fontsource/source-serif-4` 5.3.0), Public Sans Variable roman and italic (`@fontsource-variable/public-sans` 5.3.0), IBM Plex Mono 400 and 600 (`@fontsource/ibm-plex-mono` 5.3.0). The copyright lines are quoted from each font file's own name table | M1         |
| `ISC-lucide.txt` | Lucide icons (`lucide-static` 1.49.0), inlined as SVG strings; the file also carries the MIT notice for the icons Lucide derives from Feather                                                                                                                                                                                 | M1         |

Only the packages listed here ship in the file. Development tools (for example `@axe-core/playwright` and `axe-core`, MPL-2.0, used only by the e2e tests) never reach `dist/index.html`. Data sources (GRCh38, GENCODE, dbSNP) are credited in `DATA-SOURCES.md` when their extracts land (M2).

Source Serif 4's name table reserves the font name "Source" (OFL-1.1, condition 3). The course embeds the file as Fontsource ships it, under its own name; whether that subset counts as a Modified Version is the open question V-34 in `docs/PLAN.md`.
