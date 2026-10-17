// WCAG 2.2 AA contrast of the design tokens, in both themes (docs/PLAN.md 10.3, 10.6; ux 6.2-6.4):
// text tokens reach 4.5:1 on every surface and tint they can sit on; control boundaries, focus
// rings and status icons reach 3:1 (1.4.11). axe checks the rendered pages in e2e.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return new Map(
    [...css.slice(open + 1, close).matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

const luminance = (hex: string): number => {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const SURFACES = ["--bg", "--surface", "--raised", "--sunken"];
const TINTS = ["--case-bg", "--accent-subtle", "--info-bg", "--warning-bg", "--error-bg", "--success-bg"];
const FIELD_TINTS = ["--mark", "--f1", "--f2", "--f3", "--f4", "--f5", "--f6", "--f7", "--f8"];

const PAIRS: [fg: string, bg: string, min: number][] = [
  ...["--text", "--text-body", "--text-muted"].flatMap((fg) =>
    [...SURFACES, ...TINTS, ...FIELD_TINTS].map((bg): [string, string, number] => [fg, bg, 4.5]),
  ),
  ...["--accent", "--accent-hover"].flatMap((fg) =>
    [...SURFACES, "--accent-subtle", "--case-bg", "--info-bg", "--warning-bg"].map(
      (bg): [string, string, number] => [fg, bg, 4.5],
    ),
  ),
  ["--on-accent", "--accent", 4.5],
  ["--on-accent", "--accent-hover", 4.5],
  ...["success", "error", "warning", "info"].flatMap((s) =>
    [`--${s}-bg`, ...SURFACES].map((bg): [string, string, number] => [`--${s}`, bg, 4.5]),
  ),
  ...[...SURFACES, "--case-bg"].map((bg): [string, string, number] => ["--gold", bg, 4.5]),
  ...["--border-strong", "--accent"].flatMap((fg) =>
    [...SURFACES, ...TINTS].map((bg): [string, string, number] => [fg, bg, 3]),
  ),
];

describe.each([
  ["light", block(":root {")],
  ["dark", block(':root[data-theme="dark"] {')],
])("%s theme", (_name, tokens) => {
  test.each(PAIRS)("%s on %s reaches %s:1", (fg, bg, min) => {
    const a = tokens.get(fg);
    const b = tokens.get(bg);
    expect(a, fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(b, bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(a!, b!)).toBeGreaterThanOrEqual(min);
  });
});

test("the WCAG formula gives the known extremes", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
  expect(contrast("#777777", "#777777")).toBe(1);
});
