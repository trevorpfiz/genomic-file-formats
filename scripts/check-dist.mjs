// The dist check (docs/PLAN.md 11.5): `node scripts/check-dist.mjs dist [--fonts N]`.
// Fails unless dist/ holds exactly one self-contained index.html that works from file:// and
// passes the content gates. Prints a size report by category.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { pagesUrl } from "./pages-url.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const FALLBACK_TEXT = "This interactive course needs JavaScript.";
/** 1.5 MB raw (docs/PLAN.md 11.5). */
export const SIZE_LIMIT = 1.5 * 1024 * 1024;
/**
 * Per-category budgets in KB: warnings, not failures (docs/PLAN.md 11.5), checked against the
 * measured M1 baseline (M1_BASELINE_KB; the size report minifies each category on its own, so
 * string-heavy content is no longer under-counted):
 * - lesson HTML: Section 2's four lessons measure about 10.3 KB each, and the quiz page, home
 *   and About about 7 KB together. 22 lessons, 7 quiz pages, the capstone, home and About
 *   project to about 240 KB, so the budget is 300 KB (the plan said 350);
 * - app JS and CSS: the shell, seven exercise types, the quiz page, three simulators, Preact
 *   and the CSS measure about 322 KB. M1's simulators average about 13 KB minified, so nine
 *   more, the capstone inspector and the badge exporter project to about 460 KB, above the
 *   400 KB budget kept here (the plan said 250); the owner decides between lighter simulators
 *   and a larger budget (docs/PLAN.md 11.5);
 * - exercise and quiz data: about 7 KB per lesson and 17 KB per quiz project to about 280 KB,
 *   above the plan's 250 KB, which is kept for the same decision;
 * - case data, runtime validators and fonts keep the plan's estimates.
 * The sum (1,450 KB) stays under SIZE_LIMIT.
 */
export const BUDGETS_KB = {
  fonts: 140,
  "lesson HTML": 300,
  "exercise and quiz data": 250,
  "case data": 300,
  "runtime validators": 60,
  "app JS and CSS": 400,
};
/**
 * M1's measured baseline in KB (Section 2 and Quiz 2 built, after the M1 review fixes), measured
 * with the per-category minification of vite-plugin-size-report.ts, for comparison in the report.
 */
export const M1_BASELINE_KB = {
  fonts: 139.4,
  "lesson HTML": 47.6,
  "exercise and quiz data": 45.5,
  "case data": 5.1,
  "runtime validators": 7.9,
  "app JS and CSS": 322.0,
};
/** Where vite-plugin-size-report.ts writes its per-module report, keyed by the HTML's SHA-256. */
export const SIZE_REPORT_DIR = join(ROOT, "node_modules/.cache/gf-size-report");
/** The 5 latin woff2 files of src/styles/fonts.css (docs/PLAN.md D-24, 11.5). */
export const EXPECTED_FONTS = 5;
/** Where M1's validators list the messages of test-only rules (docs/PLAN.md 8.2). */
export const TEST_ONLY_MESSAGES = join(ROOT, "src/validators/test-only-messages.json");

/**
 * @typedef {object} CheckOptions
 * @property {number} [fonts] Expected number of data:font/woff2 URIs (default EXPECTED_FONTS).
 * @property {string} [pagesUrl] Expected Pages URL.
 * @property {string[]} [denylist] Brand terms, matched case-insensitively.
 * @property {string[]} [testOnlyMessages] Messages that must not ship.
 * @property {string} [sizeReportDir] Where to look for the build's size report.
 */

/**
 * @typedef {object} SizeReport
 * @property {string} html SHA-256 of the index.html it describes.
 * @property {Record<string, number>} js Estimated minified JS bytes per category.
 * @property {string} [method] "minified per category" or "rendered shares".
 */

/**
 * The build's per-module size report, if the build that wrote this HTML recorded one.
 * @param {string} html
 * @param {string} [dir]
 * @returns {SizeReport | undefined}
 */
export function readSizeReport(html, dir = SIZE_REPORT_DIR) {
  const hash = createHash("sha256").update(html).digest("hex");
  const file = join(dir, `${hash}.json`);
  if (!existsSync(file)) return undefined;
  const report = JSON.parse(readFileSync(file, "utf8"));
  return report?.html === hash && report.js ? report : undefined;
}

/**
 * @typedef {object} CheckResult
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {string[]} report
 */

/** @param {string} file */
export function readDenylist(file = join(ROOT, "scripts/brand-denylist.txt")) {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

/** @param {string} file */
function readTestOnlyMessages(file = TEST_ONLY_MESSAGES) {
  if (!existsSync(file)) return [];
  const list = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(list) || !list.every((m) => typeof m === "string")) {
    throw new Error(`${file} must be a JSON array of strings`);
  }
  return /** @type {string[]} */ (list);
}

/** @param {string} dir */
function listFiles(dir) {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
}

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * Check a built dist directory.
 * @param {string} dir
 * @param {CheckOptions} [options]
 * @returns {CheckResult}
 */
export function checkDist(dir, options = {}) {
  const expectedFonts = options.fonts ?? EXPECTED_FONTS;
  const url = options.pagesUrl ?? pagesUrl();
  const denylist = options.denylist ?? readDenylist();
  const testOnly = options.testOnlyMessages ?? readTestOnlyMessages();
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const report = [];

  // One file.
  const files = listFiles(dir);
  if (files.length !== 1 || files[0] !== "index.html") {
    errors.push(`dist must hold exactly one index.html; found: ${files.join(", ") || "nothing"}`);
  }
  if (!files.includes("index.html")) return { errors, warnings, report };
  const html = readFileSync(join(dir, "index.html"), "utf8");

  // Separate script and style bodies from the markup.
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  const markup = html
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi, "<script$1></script>")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>");

  // No external scripts or stylesheets; no non-data: src/href except links in <a>.
  for (const [, attrs = ""] of scripts) {
    if (/\ssrc\s*=/i.test(attrs)) errors.push(`external script: <script${attrs}>`);
  }
  for (const tag of markup.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const name = (tag[1] ?? "").toLowerCase();
    const attrs = tag[2] ?? "";
    if (name === "link" && /\brel\s*=\s*["']?[^"'>]*stylesheet/i.test(attrs)) {
      errors.push(`stylesheet <link>: ${tag[0].slice(0, 120)}`);
    }
    for (const attr of attrs.matchAll(
      /\s(src|href|xlink:href|srcset|poster|action|formaction|data|background|manifest)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    )) {
      const value = (attr[2] ?? attr[3] ?? attr[4] ?? "").trim();
      if (value.startsWith("data:") || value.startsWith("#")) continue;
      const external = /^(https?:\/\/|mailto:)/i.test(value);
      if (name === "a" && (attr[1] ?? "").toLowerCase() === "href" && external) continue;
      errors.push(
        `<${name} ${attr[1]}="${value.slice(0, 80)}"> is not a data: URI and would load from outside the file`,
      );
    }
  }
  const css = [
    ...styles.map((m) => m[1] ?? ""),
    ...[...markup.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2] ?? ""),
  ].join("\n");
  // `@import "x.css"` loads a stylesheet without url().
  for (const m of css.matchAll(/@import\s+(["'])([^"']*)\1/gi)) {
    if (!(m[2] ?? "").startsWith("data:")) errors.push(`CSS @import "${(m[2] ?? "").slice(0, 80)}"`);
  }
  for (const m of css.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)) {
    const value = m[2] ?? "";
    if (!value.startsWith("data:") && !value.startsWith("#"))
      errors.push(`CSS url(${value.slice(0, 80)}) is not a data: URI`);
  }

  // Fonts.
  const fontUris = [...html.matchAll(/data:font\/woff2[;,][^"')\s]*/g)].map((m) => m[0]);
  if (fontUris.length !== expectedFonts) {
    errors.push(`expected ${expectedFonts} data:font/woff2 URIs, found ${fontUris.length}`);
  }

  // Static fallback and the Pages URL (D-28).
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(markup)?.[1] ?? "";
  const noscript = /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/i.exec(markup)?.[1] ?? "";
  const linksTo = (/** @type {string} */ block) =>
    block.includes(`href="${url}"`) && block.includes(`>${url}</a>`);
  if (!main.includes(FALLBACK_TEXT)) errors.push(`<main> lacks the fallback text "${FALLBACK_TEXT}"`);
  if (!linksTo(main)) errors.push(`<main> fallback does not link to the Pages URL ${url}`);
  if (!noscript.includes(FALLBACK_TEXT) || !linksTo(noscript)) {
    errors.push(`<noscript> lacks the fallback text or a link to the Pages URL ${url}`);
  }

  // Brand denylist (O-08).
  const lower = html.toLowerCase();
  for (const term of denylist) {
    const at = lower.indexOf(term.toLowerCase());
    if (at >= 0)
      errors.push(`brand denylist: "${term}" appears near "${html.slice(Math.max(0, at - 30), at + 30)}"`);
  }

  // Test-only validator messages never ship (docs/PLAN.md 8.2).
  for (const message of testOnly) {
    if (html.includes(message)) errors.push(`test-only validator message shipped: "${message}"`);
  }

  // Size, with a report by category.
  const total = Buffer.byteLength(html);
  const fontBytes = fontUris.reduce((n, u) => n + u.length, 0);
  const jsBytes = scripts.reduce((n, m) => n + Buffer.byteLength(m[2] ?? ""), 0);
  const cssBytes = styles.reduce((n, m) => n + Buffer.byteLength(m[1] ?? ""), 0) - fontBytes;
  const markupBytes = total - jsBytes - cssBytes - fontBytes;
  report.push(`index.html: ${kb(total)} raw, ${kb(gzipSync(html).length)} gzip; limit ${kb(SIZE_LIMIT)}`);
  /** @param {string} name @param {number} bytes @param {string} note */
  const line = (name, bytes, note) => {
    const budget = /** @type {Record<string, number>} */ (BUDGETS_KB)[name];
    const baseline = /** @type {Record<string, number>} */ (M1_BASELINE_KB)[name];
    const extra = [
      note,
      budget ? `budget ${budget} KB` : "",
      baseline ? `M1 baseline ${baseline.toFixed(1)} KB` : "",
    ]
      .filter(Boolean)
      .join("; ");
    report.push(`  ${name.padEnd(24)} ${kb(bytes).padStart(10)}${extra ? `  (${extra})` : ""}`);
    if (budget && bytes > budget * 1024) warnings.push(`${name} over the ${budget} KB budget`);
  };
  line("fonts", fontBytes, `${fontUris.length} woff2`);
  const sizes = readSizeReport(html, options.sizeReportDir);
  if (sizes) {
    // JS per category: each category minified on its own, scaled to the minified script (or
    // rendered-length shares when a category did not minify); CSS is exact.
    const js = sizes.js;
    const app = (js["app JS and CSS"] ?? 0) + cssBytes;
    const how = sizes.method === "rendered shares" ? "estimated from module shares" : "minified per category";
    line("lesson HTML", js["lesson HTML"] ?? 0, how);
    line("exercise and quiz data", js["exercise and quiz data"] ?? 0, "estimated");
    line("case data", js["case data"] ?? 0, "estimated");
    line("runtime validators", js["runtime validators"] ?? 0, "estimated; with the format parsers");
    line("app JS and CSS", app, `JS ${kb(app - cssBytes)}, CSS ${kb(cssBytes)}`);
  } else {
    line(
      "app JS and CSS",
      jsBytes + cssBytes,
      `JS ${kb(jsBytes)}, CSS ${kb(cssBytes)}; all content included`,
    );
    report.push(
      "  no per-module size report for this file (run `vp build`; the report is keyed by the file's hash), so content is counted in the JS above",
    );
  }
  report.push(`  ${"markup".padEnd(24)} ${kb(markupBytes).padStart(10)}`);
  if (total > SIZE_LIMIT) errors.push(`index.html is ${kb(total)}, over the ${kb(SIZE_LIMIT)} limit`);
  return { errors, warnings, report };
}

/**
 * `[dir] [--fonts N]`, in any order (`--fonts 5 dist` and `dist --fonts=5` both work).
 * @param {string[]} argv
 */
export function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { fonts: { type: "string" } },
    allowPositionals: true,
  });
  const fonts = Number(values.fonts ?? process.env.EXPECTED_WOFF2 ?? EXPECTED_FONTS);
  if (!Number.isInteger(fonts) || fonts < 0)
    throw new Error(`--fonts needs a whole number, got "${values.fonts}"`);
  return { dir: positionals[0] ?? "dist", fonts };
}

/** @param {string[]} argv */
function main(argv) {
  const { dir, fonts } = parseCli(argv);
  const { errors, warnings, report } = checkDist(dir, { fonts });
  for (const line of report) console.log(`check-dist: ${line}`);
  for (const w of warnings) console.warn(`check-dist: warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`check-dist: error: ${e}`);
    process.exitCode = 1;
    return;
  }
  console.log(`check-dist: ok (${relative(process.cwd(), join(dir, "index.html"))})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
