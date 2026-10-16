// E2E on the built file over file:// (docs/PLAN.md 11.6). M0 scope: boot, routing, the
// placeholder widget and Preact island, offline-only requests, and the no-JavaScript fallback.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  await expect(page.locator(".outline a")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("the lesson route renders the compiled lesson, the widget and the Preact island", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`${COURSE}#/lesson/placeholder-hello`);
  await expect(page.locator("h1")).toHaveText("Placeholder: the pipeline end to end");
  await expect(page).toHaveTitle("Placeholder: the pipeline end to end · Lesson 1 · Genomic File Formats");
  await expect(page.locator(".toc li").last()).toHaveText("Recap");
  // Genomic tokens survive the compiler as written.
  await expect(page.locator("article")).toContainText("chr2:166,014,902");
  await expect(page.locator("article")).toContainText("GT:AD:DP:GQ:PL");
  await expect(page.locator("article code").first()).toHaveText("<DEL>");

  const predict = page.locator("gf-predict");
  await expect(predict.locator("h3")).toHaveText("Which base does this BED line cover?");
  await predict.getByLabel("1-based position on chr2").fill("166,014,902");
  await predict.getByRole("button", { name: "Lock in my prediction" }).click();
  await expect(predict.locator(".verdict")).toHaveText("Your prediction matches.");
  await expect(predict.locator(".verdict")).toBeFocused();

  const simulator = page.locator("gf-simulator");
  const next = simulator.getByRole("button", { name: "Next base" });
  await next.click();
  await next.click();
  await expect(simulator.getByRole("status")).toContainText("Goal reached.");
  expect(problems).toEqual([]);
});

test("a deep link scrolls to its heading, and unknown routes say Not found", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`${COURSE}#/lesson/placeholder-hello/recap`);
  await expect(page.locator("#recap")).toBeFocused();
  await page.goto(`${COURSE}#/nowhere`);
  await expect(page.locator("h1")).toHaveText("Not found");
  expect(problems).toEqual([]);
});

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
