// The dist check (docs/PLAN.md 11.5): `node scripts/check-dist.mjs dist [--fonts N]`.
// Fails unless dist/ holds exactly one self-contained index.html that works from file:// and
// passes the content gates. Prints a size report by category.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { pagesUrl } from "./pages-url.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const FALLBACK_TEXT = "This interactive course needs JavaScript.";
/** 1.5 MB raw (docs/PLAN.md 11.5). */
export const SIZE_LIMIT = 1.5 * 1024 * 1024;
/** Planning budgets in KB: warnings, not failures. M1's measured baseline replaces them. */
export const BUDGETS_KB = {
  fonts: 140,
  "lesson HTML": 350,
  "exercise and quiz data": 250,
  "case data": 300,
  "runtime validators": 60,
  "app JS and CSS": 250,
};
/** Where M1's validators list the messages of test-only rules (docs/PLAN.md 8.2). */
export const TEST_ONLY_MESSAGES = join(ROOT, "src/validators/test-only-messages.json");

/**
 * @typedef {object} CheckOptions
 * @property {number} [fonts] Expected number of data:font/woff2 URIs (0 until M1 adds fonts).
 * @property {string} [pagesUrl] Expected Pages URL.
 * @property {string[]} [denylist] Brand terms, matched case-insensitively.
 * @property {string[]} [testOnlyMessages] Messages that must not ship.
 */

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
  const expectedFonts = options.fonts ?? 0;
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
  report.push(
    `index.html: ${kb(total)} raw, ${kb(gzipSync(html).length)} gzip; limit ${kb(SIZE_LIMIT)}`,
    `  fonts                    ${kb(fontBytes).padStart(10)}  (${fontUris.length} woff2; budget ${BUDGETS_KB.fonts} KB)`,
    `  app JS and CSS           ${kb(jsBytes + cssBytes).padStart(10)}  (JS ${kb(jsBytes)}, CSS ${kb(cssBytes)}; includes everything bundled until M1 splits it out)`,
    `  markup                   ${kb(markupBytes).padStart(10)}`,
    `  lesson HTML, exercise and quiz data, case data, runtime validators: stub; they are bundled in the JS above until M1 records a per-module baseline`,
  );
  if (fontBytes > BUDGETS_KB.fonts * 1024)
    warnings.push(`fonts over the ${BUDGETS_KB.fonts} KB planning budget`);
  if (jsBytes + cssBytes > BUDGETS_KB["app JS and CSS"] * 1024) {
    warnings.push(`app JS and CSS over the ${BUDGETS_KB["app JS and CSS"]} KB planning budget`);
  }
  if (total > SIZE_LIMIT) errors.push(`index.html is ${kb(total)}, over the ${kb(SIZE_LIMIT)} limit`);
  return { errors, warnings, report };
}

/** @param {string[]} argv */
function main(argv) {
  const dir = argv.find((a) => !a.startsWith("--")) ?? "dist";
  const fontsFlag = argv.indexOf("--fonts");
  const fonts = fontsFlag >= 0 ? Number(argv[fontsFlag + 1]) : Number(process.env.EXPECTED_WOFF2 ?? 0);
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
