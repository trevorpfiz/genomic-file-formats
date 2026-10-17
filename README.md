# Genomic File Formats

An interactive course on the file formats of genomics: FASTA, FASTQ, BED, BEDPE, WIG, GTF/GFF3, SAM, BAM, CRAM, gVCF, VCF, and GFA/PAF.

Learners build an intuition for genomic data from the ground up, learn to recognize each format and judge whether a file is valid, and follow one fictional rare-disease case from blood sample to diagnosis to see how the formats fit together.

The course ships as a single self-contained HTML file: open it from disk, email it, or use the hosted copy.

**Status:** M1 in progress (vertical slice: the shell, the design system and Section 2). The course plan is [`docs/PLAN.md`](docs/PLAN.md), the research notes behind it live in [`docs/research/`](docs/research/), and the developer contract is [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Develop

You need Node 22.22.0 and the [Vite+](https://viteplus.dev/guide/) CLI (`npm install --global vite-plus@1.3.0`).

```sh
vp install                       # pnpm 12.14.0 and the locked dependencies
vp dev                           # dev server
vp check && vp test              # format, lint, types; unit and widget tests
vp build                         # dist/index.html, the single self-contained file
node scripts/check-dist.mjs dist # the one-file and content gates
vp exec playwright test          # e2e over file://
```

See [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) for authoring rules and how to add an exercise.

## License

[MIT](LICENSE). Bundled third-party code keeps its own license; see [`LICENSES/`](LICENSES/).
