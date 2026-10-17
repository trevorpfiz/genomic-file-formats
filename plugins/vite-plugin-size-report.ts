// The size report behind check-dist's per-category baseline (docs/PLAN.md 11.5, R-07).
//
// The shipped file is one minified script, so module boundaries are gone by the time
// check-dist reads it. This plugin records them at build time. For each JS chunk it joins the
// rendered (pre-minify) code of every module per category and minifies each category on its
// own (whitespace and names, without dead-code removal, which would drop declarations used by
// other categories). Minification shrinks code far more than string-heavy modules (lesson HTML
// barely shrinks), so one chunk-wide ratio would under-report content and over-report code;
// per-category minified sizes keep that difference. They are then scaled to sum to the chunk's
// real minified size (cross-category effects are small). If a category does not minify, the
// chunk falls back to rendered-length shares. check-dist measures CSS and fonts exactly in the
// HTML and adds the CSS to "app JS and CSS". The report is written outside the output
// directory, keyed by the SHA-256 of the built index.html, so check-dist only uses it for the
// build it describes and dist/ keeps exactly one file.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { minify, type Plugin } from "vite-plus";

/** The categories of docs/PLAN.md 11.5, except fonts (check-dist measures them in the HTML). */
export type SizeCategory =
  | "lesson HTML"
  | "exercise and quiz data"
  | "case data"
  | "runtime validators"
  | "app JS and CSS";

export interface SizeReport {
  /** SHA-256 (hex) of the index.html this report describes. */
  html: string;
  /** Estimated minified JS bytes per category. */
  js: Record<SizeCategory, number>;
  /** How `js` was estimated: per-category minification, or rendered-length shares (fallback). */
  method: "minified per category" | "rendered shares";
  /** Rendered (pre-minify) bytes per category, for reference. */
  rendered: Record<SizeCategory, number>;
  /** The largest modules by rendered length, project-relative, for finding what grew. */
  largest: { id: string; category: SizeCategory; rendered: number }[];
}

/** Where reports live, relative to the project root: outside dist/, ignored by git. */
export const SIZE_REPORT_DIR = "node_modules/.cache/gf-size-report";

/** The category of a module id (an absolute path, or `\0virtual:lessons`). */
export function categoryOf(id: string): SizeCategory {
  const path = id.replaceAll("\\", "/");
  if (path.includes("virtual:lessons")) return "lesson HTML";
  if (/\/src\/(exercises|quizzes)\//.test(path)) return "exercise and quiz data";
  if (path.includes("/src/case/")) return "case data";
  // The browser validators and the format parsers they (and the simulators) run on.
  if (/\/src\/(validators|formats)\//.test(path)) return "runtime validators";
  return "app JS and CSS";
}

const empty = (): Record<SizeCategory, number> => ({
  "lesson HTML": 0,
  "exercise and quiz data": 0,
  "case data": 0,
  "runtime validators": 0,
  "app JS and CSS": 0,
});

const CATEGORIES = Object.keys(empty()) as SizeCategory[];

/** Minified bytes of one category's joined module code, or undefined when it does not parse. */
async function minifiedBytes(category: SizeCategory, code: string): Promise<number | undefined> {
  if (!code) return 0;
  try {
    const result = await minify(`${category}.js`, code, { module: true, compress: false });
    return result.errors.length ? undefined : Buffer.byteLength(result.code);
  } catch {
    return undefined;
  }
}

/**
 * Split a chunk's minified size across categories in proportion to `weights` (per-category
 * minified sizes, or rendered lengths), so the parts add up to the chunk.
 */
export function apportion(
  weights: Record<SizeCategory, number>,
  minified: number,
): Record<SizeCategory, number> {
  const total = CATEGORIES.reduce((sum, key) => sum + weights[key], 0);
  const out = empty();
  for (const key of CATEGORIES) out[key] = total ? Math.round((weights[key] / total) * minified) : 0;
  return out;
}

export function sizeReport(): Plugin {
  let root = process.cwd();
  let pending: Omit<SizeReport, "html"> | undefined;
  return {
    name: "gf-size-report",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    // Runs before vite-plugin-singlefile (enforce "post") inlines and deletes the chunks.
    async generateBundle(_options, bundle) {
      const js = empty();
      const rendered = empty();
      const modules: SizeReport["largest"] = [];
      let method: SizeReport["method"] = "minified per category";
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const chunkRendered = empty();
        const code: Record<SizeCategory, string[]> = {
          "lesson HTML": [],
          "exercise and quiz data": [],
          "case data": [],
          "runtime validators": [],
          "app JS and CSS": [],
        };
        for (const [id, info] of Object.entries(output.modules)) {
          const category = categoryOf(id);
          chunkRendered[category] += info.renderedLength;
          if (info.code) code[category].push(info.code);
          const name = id.startsWith("\0") ? id.slice(1) : relative(root, id).replaceAll("\\", "/");
          modules.push({ id: name, category, rendered: info.renderedLength });
        }
        const sizes = await Promise.all(CATEGORIES.map((key) => minifiedBytes(key, code[key].join("\n"))));
        const weights = empty();
        CATEGORIES.forEach((key, i) => (weights[key] = sizes[i] ?? Number.NaN));
        const ok = CATEGORIES.every((key) => Number.isFinite(weights[key]));
        if (!ok) method = "rendered shares";
        const parts = apportion(ok ? weights : chunkRendered, Buffer.byteLength(output.code));
        for (const key of CATEGORIES) {
          rendered[key] += chunkRendered[key];
          js[key] += parts[key];
        }
      }
      const largest = modules.sort((a, b) => b.rendered - a.rendered).slice(0, 25);
      pending = { js, method, rendered, largest };
    },
    writeBundle(options) {
      if (!pending || !options.dir) return;
      const html = readFileSync(join(options.dir, "index.html"));
      const hash = createHash("sha256").update(html).digest("hex");
      const dir = resolve(root, SIZE_REPORT_DIR);
      mkdirSync(dir, { recursive: true });
      const report: SizeReport = { html: hash, ...pending };
      writeFileSync(join(dir, `${hash}.json`), `${JSON.stringify(report, null, 2)}\n`);
      pending = undefined;
    },
  };
}
