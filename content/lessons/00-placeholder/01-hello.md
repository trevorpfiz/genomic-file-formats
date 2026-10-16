---
kind: lesson
id: placeholder-hello
section: placeholder
title: "Placeholder: the pipeline end to end"
minutes: 8
objectives: [LO5]
introduces: [placeholder.bed-to-one-based]
requires: []
caseBeat: "M0 placeholder, removed in M1"
specs: ["BEDv1 1.0 section 1.1"]
---

This placeholder lesson proves the build pipeline: Markdown with directives, typed exercise data, a widget and a Preact island, all in one HTML file. M1 replaces it with real lessons.

## Two ways to number the same base

A region string such as chr2:166,014,902 counts bases from 1. BED counts the gaps between bases from 0, so the same base is the interval from 166,014,901 to 166,014,902. <!-- src: BEDv1 section 1.1 (0-based, half-open) -->

A symbolic allele such as `<DEL>` sits in backticks. Tags such as SA:Z:chr2,166040123,+,75S75M,60,0; and FORMAT strings such as GT:AD:DP:GQ:PL print as written.

::predict{exercise="placeholder-hello/bed-to-one-based"}

:::read-more{title="Why BED is 0-based"}
BED inherits the UCSC browser's internal numbering, where a start and an end subtract to the length.
:::

## Try it: step the ruler

::simulator{exercise="placeholder-hello/ruler-step"}

## Recap

:::recap

- **Posts or panels.** Region strings count bases from 1; BED counts gaps from 0.
- **Only starts differ.** The BED end equals the 1-based position of the last base.

:::
