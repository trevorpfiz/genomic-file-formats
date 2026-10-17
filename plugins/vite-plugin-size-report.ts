// The size report behind check-dist's per-category baseline (docs/PLAN.md 11.5, R-07).
//
// The shipped file is one minified script, so module boundaries are gone by the time
// check-dist reads it. This plugin records them at build time: for each JS chunk it sums the
// rendered (pre-minify) length of every module per category, then scales the shares to the
// chunk's minified size. check-dist measures CSS and fonts exactly in the HTML and adds the CSS
// to "app JS and CSS". The report is written outside the output directory, keyed by the
// SHA-256 of the built index.html, so check-dist only uses it for the build it describes and
// dist/ keeps exactly one file.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite-plus";

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
    generateBundle(_options, bundle) {
      const js = empty();
      const rendered = empty();
      const modules: SizeReport["largest"] = [];
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        const chunkRendered = empty();
        let total = 0;
        for (const [id, info] of Object.entries(output.modules)) {
          const category = categoryOf(id);
          chunkRendered[category] += info.renderedLength;
          total += info.renderedLength;
          const name = id.startsWith("\0") ? id.slice(1) : relative(root, id).replaceAll("\\", "/");
          modules.push({ id: name, category, rendered: info.renderedLength });
        }
        const minified = Buffer.byteLength(output.code);
        for (const key of Object.keys(js) as SizeCategory[]) {
          rendered[key] += chunkRendered[key];
          js[key] += total ? Math.round((chunkRendered[key] / total) * minified) : 0;
        }
      }
      const largest = modules.sort((a, b) => b.rendered - a.rendered).slice(0, 25);
      pending = { js, rendered, largest };
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
