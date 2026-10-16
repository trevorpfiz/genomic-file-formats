// The dist check itself (docs/PLAN.md 11.5): each gate fails on a crafted file.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { checkDist, FALLBACK_TEXT, readDenylist } from "../scripts/check-dist.mjs";

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

const check = (files: Record<string, string>, fonts = 0) =>
  checkDist(dist(files), {
    pagesUrl: URL,
    denylist: ["acme"],
    testOnlyMessages: ["FASTA-T99 only in tests"],
    fonts,
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
