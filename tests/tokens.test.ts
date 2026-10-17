// Design tokens (docs/PLAN.md 10.3; ux-design.md 6.2-6.5): every colour token has a light and a
// dark value, the two dark blocks agree, print uses the light values, and the decided accent
// (D-25) and theme selectors are in place.
import { readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";

const css = readFileSync("src/styles/tokens.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Custom properties declared in the first block that follows `selector`. */
function block(selector: string, from = 0): Map<string, string> {
  const start = css.indexOf(selector, from);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]));
}

const light = block(":root {");
const mediaDark = block(':root:not([data-theme="light"]) {', css.indexOf("prefers-color-scheme: dark"));
const forcedDark = block(':root[data-theme="dark"] {');
const print = block(':root:not([data-theme="light"]) {', css.indexOf("@media print"));
const colours = [...mediaDark.keys()];

test("the dark blocks agree and cover exactly the colour tokens", () => {
  expect(colours.length).toBeGreaterThan(40);
  expect([...forcedDark.entries()]).toEqual([...mediaDark.entries()]);
  for (const key of colours) expect(light.has(key), key).toBe(true);
});

test("print uses the light values", () => {
  for (const key of colours) expect(print.get(key), key).toBe(light.get(key));
});

test("the decided accent: teal #0B6B66 light, #5EC4BA dark (D-25)", () => {
  expect(light.get("--accent")?.toUpperCase()).toBe("#0B6B66");
  expect(mediaDark.get("--accent")?.toUpperCase()).toBe("#5EC4BA");
});

test("every ux token is defined", () => {
  const expected = [
    "--bg",
    "--surface",
    "--raised",
    "--sunken",
    "--border",
    "--border-strong",
    "--text",
    "--text-body",
    "--text-muted",
    "--accent",
    "--accent-hover",
    "--accent-subtle",
    "--focus",
    "--success",
    "--success-bg",
    "--error",
    "--error-bg",
    "--warning",
    "--warning-bg",
    "--info",
    "--info-bg",
    "--mark",
    "--case-bg",
    "--case-border",
    "--gold",
    "--gold-fill",
    "--shadow-pop",
    "--f1",
    "--f8",
    "--base-a",
    "--base-t",
    "--font-serif",
    "--font-sans",
    "--font-mono",
    "--s-1",
    "--s-10",
    "--r-chip",
    "--r-control",
    "--r-card",
    "--r-dialog",
    "--r-pill",
    "--dur-1",
    "--dur-2",
    "--dur-3",
    "--ease",
  ];
  for (const key of expected) expect(light.has(key), key).toBe(true);
});

test("theme selectors follow ux 6.5", () => {
  expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{/);
  expect(css).toContain(':root[data-theme="dark"] {');
  expect(css).toContain(':root[data-theme="light"] {');
});
