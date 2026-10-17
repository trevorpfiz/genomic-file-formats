// The dist check itself (docs/PLAN.md 11.5): each gate fails on a crafted file.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { categoryOf } from "../plugins/vite-plugin-size-report.ts";
import { BUDGETS_KB, checkDist, FALLBACK_TEXT, readDenylist, SIZE_LIMIT } from "../scripts/check-dist.mjs";

const URL = "https://example.github.io/course/";
const fallback = `${FALLBACK_TEXT} Save the file and open it in a desktop browser, or use <a href="${URL}">${URL}</a>.`;
const page = (head = "", body = "") =>
  `<!doctype html><html><head>${head}<script type="module">console.log(1)</script></head><body><noscript><p>${fallback}</p></noscript><main id="main"><div id="fallback"><p>${fallback}</p></div></main>${body}</body></html>`;

const dirs: string[] = [];
function dist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gf-dist-"));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const check = (files: Record<string, string>, fonts = 0, sizeReportDir = dist({})) =>
  checkDist(dist(files), {
    pagesUrl: URL,
    denylist: ["acme"],
    testOnlyMessages: ["FASTA-T99 only in tests"],
    fonts,
    sizeReportDir,
  });

test("a self-contained file passes", () => {
  const body = `<a href="https://samtools.github.io/hts-specs/SAMv1.pdf">SAMv1</a><a href="#/lesson/x">x</a>`;
  expect(check({ "index.html": page(`<link rel="icon" href="data:image/svg+xml,x">`, body) }).errors).toEqual(
    [],
  );
});

test("a second file fails", () => {
  expect(check({ "index.html": page(), "assets/app.js": "" }).errors[0]).toMatch(/exactly one index.html/);
});

test.each([
  ["an external script", page(`<script src="./app.js"></script>`)],
  ["a stylesheet link", page(`<link rel="stylesheet" href="data:text/css,">`)],
  ["a relative image", page("", `<img src="fig.svg">`)],
  ["a CSS url()", page(`<style>body{background:url(bg.png)}</style>`)],
  ["a remote font", page(`<style>@font-face{src:url("https://fonts.example/x.woff2")}</style>`)],
  ["a CSS @import string", page(`<style>@import "https://fonts.example/x.css";</style>`)],
  ["a single-quoted style attribute url()", page("", `<p style='background:url(a.png)'>x</p>`)],
  ["an SVG xlink:href", page("", `<svg><use xlink:href="sprite.svg#a"></use></svg>`)],
])("%s fails", (_label, html) => {
  expect(check({ "index.html": html }).errors.length).toBeGreaterThan(0);
});

test("the expected number of woff2 data URIs is enforced", () => {
  const html = page(`<style>@font-face{src:url(data:font/woff2;base64,AAAA)}</style>`);
  expect(check({ "index.html": html }, 1).errors).toEqual([]);
  expect(check({ "index.html": html }, 0).errors[0]).toMatch(/expected 0 data:font\/woff2/);
});

test("the fallback text and the Pages URL are required", () => {
  const html = page().replaceAll(URL, "https://elsewhere.example/");
  expect(check({ "index.html": html }).errors.join("\n")).toMatch(/Pages URL/);
  expect(check({ "index.html": page().replace(FALLBACK_TEXT, "Hello.") }).errors.join("\n")).toMatch(
    /fallback text/,
  );
});

test("brand terms fail, case-insensitively", () => {
  expect(check({ "index.html": page("", "<p>Made with ACME</p>") }).errors[0]).toMatch(
    /brand denylist: "acme"/,
  );
});

test("test-only validator messages fail", () => {
  expect(check({ "index.html": page("", "<p>FASTA-T99 only in tests</p>") }).errors[0]).toMatch(/test-only/);
});

test("the repository denylist names the brand terms", () => {
  expect(readDenylist()).toEqual(["anthropic", "claude"]);
});

describe("per-category size report", () => {
  const categories = {
    "lesson HTML": 3000,
    "exercise and quiz data": 2000,
    "case data": 1000,
    "runtime validators": 500,
    "app JS and CSS": 420_000,
  };

  test("uses the build's report for this exact file, and warns over a budget", () => {
    const html = page("<style>p{color:red}</style>");
    const hash = createHash("sha256").update(html).digest("hex");
    const reports = dist({ [`${hash}.json`]: JSON.stringify({ html: hash, js: categories }) });
    const { report, warnings, errors } = check({ "index.html": html }, 0, reports);
    expect(errors).toEqual([]);
    expect(report.find((l) => l.includes("lesson HTML"))).toMatch(/2\.9 KB .*budget 250 KB/);
    expect(report.find((l) => l.includes("app JS and CSS"))).toMatch(/410\.2 KB/);
    expect(warnings).toEqual(["app JS and CSS over the 400 KB budget"]);
  });

  test("without a matching report, content is counted in the JS and the report says so", () => {
    const reports = dist({ "0000.json": JSON.stringify({ html: "0000", js: categories }) });
    const { report, warnings } = check({ "index.html": page() }, 0, reports);
    expect(report.some((l) => l.includes("no per-module size report"))).toBe(true);
    expect(report.some((l) => l.includes("lesson HTML"))).toBe(false);
    expect(warnings).toEqual([]);
  });

  test("the budgets fit under the hard limit", () => {
    const sum = Object.values(BUDGETS_KB).reduce((a, b) => a + b, 0);
    expect(sum * 1024).toBeLessThan(SIZE_LIMIT);
  });

  test.each([
    ["\0virtual:lessons", "lesson HTML"],
    ["/repo/src/exercises/fasta-reference.ts", "exercise and quiz data"],
    ["/repo/src/quizzes/sequences.ts", "exercise and quiz data"],
    ["/repo/src/case/generated/fastq.ts", "case data"],
    ["/repo/src/validators/runtime/fasta.ts", "runtime validators"],
    ["/repo/src/formats/phred.ts", "runtime validators"],
    ["/repo/src/widgets/card.ts", "app JS and CSS"],
    ["/repo/node_modules/preact/dist/preact.module.js", "app JS and CSS"],
  ])("module %s counts as %s", (id, category) => {
    expect(categoryOf(id)).toBe(category);
  });
});
