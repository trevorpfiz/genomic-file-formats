// E2E on the built file over file:// (docs/PLAN.md 11.6): boot, routing over Section 2, the
// embedded fonts, the card-based predict widget and the Preact island (mounted with injected
// data), an axe smoke in both themes, offline-only requests and the no-JavaScript fallback.
// widgets.spec.ts has a path per component, shell.spec.ts the shell and progress, and
// section2.spec.ts the axe matrix over the real Section 2 pages and a keyboard-only walkthrough.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pagesUrl } from "../../scripts/pages-url.mjs";

const COURSE = pathToFileURL(resolve("dist/index.html")).href;
const PAGES_URL = pagesUrl();
const FALLBACK = "This interactive course needs JavaScript.";

/** Collect page errors, console errors and any request that is not the file itself or data:. */
function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith("data:") && url.split("#")[0] !== COURSE) problems.push(`request: ${url}`);
  });
  return problems;
}

test("the built file boots over file:// with no errors and no network", async ({ page }) => {
  const problems = watch(page);
  await page.goto(COURSE);
  await expect(page.locator("h1")).toHaveText("Genomic File Formats");
  await expect(page.locator("#fallback")).toHaveCount(0);
  await expect(page.locator(".outline-home a.outline-row").first()).toContainText(
    "FASTA: the reference everyone is compared against",
  );
  expect(problems).toEqual([]);
});

test("the five embedded fonts are declared and load from the file", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`${COURSE}#/lesson/fasta-reference`);
  const faces = await page.evaluate(async () => {
    await document.fonts.ready;
    // Engines differ on quoting the family name.
    return [...document.fonts].map((f) => `${f.family.replaceAll('"', "")} ${f.style} ${f.weight}`).sort();
  });
  expect(faces).toEqual([
    "IBM Plex Mono normal 400",
    "IBM Plex Mono normal 600",
    "Public Sans italic 100 900",
    "Public Sans normal 100 900",
    "Source Serif 4 normal 500",
  ]);
  expect(await page.evaluate(() => document.fonts.check('500 42px "Source Serif 4"'))).toBe(true);
  expect(problems).toEqual([]);
});

test("a Section 2 lesson renders with its TOC, and its quiz page renders", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`${COURSE}#/lesson/fasta-reference`);
  await expect(page.locator("h1")).toHaveText("FASTA: the reference everyone is compared against");
  await expect(page).toHaveTitle(
    "FASTA: the reference everyone is compared against · Lesson 4 · Genomic File Formats",
  );
  await expect(page.locator(".toc li").last()).toHaveText("Recap");
  await expect(page.locator("gf-pipeline-map li[data-current]")).toHaveCount(2);
  await page.goto(`${COURSE}#/quiz/sequences`);
  await expect(page.locator("h1")).toHaveText("Section quiz: Sequences");
  await expect(page.locator("gf-quiz .quiz-question")).toHaveCount(6);
  await expect(page.locator("gf-quiz .quiz-reference")).toBeVisible();
  expect(problems).toEqual([]);
});

test("the card-based predict widget and the Preact island work in the built file", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`${COURSE}#/lesson/fasta-reference`);
  await page.evaluate(() => {
    const main = document.querySelector("main article")!;
    const base = { source: "e2e", tags: ["concept"], formats: ["bed"], concepts: ["coords.zero-based"] };
    const predict = document.createElement("gf-predict") as HTMLElement & { data?: unknown };
    predict.dataset.mode = "quick-check";
    predict.data = {
      ...base,
      id: "e2e/predict",
      kind: "predict",
      title: "Which base does this BED line cover?",
      prompt: "A BED line reads `chr2 166014901 166014902`.",
      items: [
        { label: "1-based position on chr2", input: { type: "number", answer: 166014902, tolerance: 0 } },
      ],
      reveal: "The interval holds position 166,014,902.",
    };
    const simulator = document.createElement("gf-simulator") as HTMLElement & { data?: unknown };
    simulator.data = {
      ...base,
      id: "e2e/ruler",
      kind: "simulator",
      simulator: "coordinate-ruler",
      title: "Step the ruler",
      prompt: "Step to the BED interval 166,014,901 to 166,014,902.",
      init: { position: 166014900 },
      goals: [
        {
          id: "reach",
          text: "Reach the interval.",
          when: "showsBedInterval",
          args: { start: 166014901, end: 166014902 },
          explanation: "Reached.",
          witness: [],
        },
      ],
      textView: "table",
    };
    main.append(predict, simulator);
  });

  const predict = page.locator("gf-predict");
  await expect(predict.locator(".card-overline")).toHaveText("Quick check · Predict");
  await predict.getByLabel("1-based position on chr2").fill("166,014,902");
  await predict.getByRole("button", { name: "Lock in my prediction" }).click();
  await expect(predict.locator(".card-verdict")).toContainText("Correct.");
  await expect(predict.locator(".card-verdict")).toBeFocused();
  await expect(predict.locator(".card-status")).toHaveText("Correct");

  const simulator = page.locator("gf-simulator");
  const next = simulator.getByRole("button", { name: "Next base" });
  await next.click();
  await next.click();
  await expect(simulator.locator(".readout")).toContainText("Goal reached.");
  await expect(simulator).toHaveAttribute("data-state", "correct");
  expect(problems).toEqual([]);
});

test("a deep link focuses its heading, and unknown routes say Not found", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`${COURSE}#/lesson/random-access/recap`);
  await expect(page.locator("#recap")).toBeFocused();
  await page.goto(`${COURSE}#/nowhere`);
  await expect(page.locator("h1")).toHaveText("Not found");
  expect(problems).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe: no serious or critical findings on a lesson (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`${COURSE}#/lesson/fastq-reads`);
    await expect(page.locator("h1")).toHaveText("From molecules to reads: FASTQ");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    // Typed locally: axe-core's own types are not resolvable from here (it is not a direct dependency).
    const violations: { id: string; impact?: string | null; nodes: { target: unknown[] }[] }[] =
      results.violations;
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the static fallback and the Pages URL are visible", async ({ page }) => {
    const problems = watch(page);
    await page.goto(COURSE);
    const fallback = page.locator("#fallback");
    await expect(fallback).toBeVisible();
    await expect(fallback).toContainText(FALLBACK);
    await expect(fallback.getByRole("link", { name: PAGES_URL })).toBeVisible();
    await expect(fallback.getByRole("link", { name: PAGES_URL })).toHaveAttribute("href", PAGES_URL);
    await expect(page.locator("noscript p").getByRole("link", { name: PAGES_URL })).toBeVisible();
    expect(problems).toEqual([]);
  });
});
