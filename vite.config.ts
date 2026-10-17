import { defineConfig, type Plugin } from "vite-plus";
import { viteSingleFile } from "vite-plugin-singlefile";
import { lessons } from "./plugins/vite-plugin-lessons.ts";
import { sizeReport } from "./plugins/vite-plugin-size-report.ts";
import { pagesUrl } from "./scripts/pages-url.mjs";

const PAGES_URL = pagesUrl();
// CI passes a tag (v1.2.3) or a full commit SHA; show a SHA in its short form so the
// footer and About pill stay narrow on phones.
const RAW_VERSION = process.env.COURSE_VERSION ?? "dev";
const COURSE_VERSION = /^[0-9a-f]{40}$/.test(RAW_VERSION) ? RAW_VERSION.slice(0, 7) : RAW_VERSION;

/** index.html is not touched by `define`, so its static fallback gets the URL here. */
const htmlConstants: Plugin = {
  name: "gf-html-constants",
  transformIndexHtml: {
    order: "pre",
    handler: (html) => html.replaceAll("%PAGES_URL%", PAGES_URL),
  },
};

export default defineConfig({
  base: "./",
  define: {
    __COURSE_VERSION__: JSON.stringify(COURSE_VERSION),
    __PAGES_URL__: JSON.stringify(PAGES_URL),
  },
  build: {
    modulePreload: { polyfill: false },
  },
  // The registry is loaded by the plugin through Vite's module graph, never imported here
  // (importing it would restart the dev server on every exercise edit).
  plugins: [
    lessons({ registry: "src/exercises/registry.ts", course: "content/course.ts" }),
    htmlConstants,
    // Before viteSingleFile, which inlines and deletes the chunks it measures.
    sizeReport(),
    viteSingleFile(),
  ],
  test: {
    include: ["src/**/*.test.{ts,tsx}", "plugins/**/*.test.ts", "tests/**/*.test.ts"],
  },
  fmt: {
    printWidth: 110,
    ignorePatterns: [
      "dist/**",
      "test-results/**",
      "playwright-report/**",
      "pnpm-lock.yaml",
      // Planning documents are edited outside the code workflow.
      "docs/PLAN.md",
      "docs/research/**",
      // Exact bytes from gen:case (docs/PLAN.md 9.3); the generator owns their layout.
      "src/case/generated/**",
    ],
  },
  lint: {
    ignorePatterns: ["dist/**", "test-results/**", "playwright-report/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
