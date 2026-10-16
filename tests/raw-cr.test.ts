// Exact bytes (docs/PLAN.md 11.2): ECMAScript turns a literal CR or CRLF in a template literal
// into LF, so snippets must write CR as the escape \r. This lint rejects a raw U+000D anywhere in
// src/** (and in lesson sources, which are compiled into strings the same way).
import { globSync, readFileSync } from "node:fs";
import { expect, test } from "vite-plus/test";

const files = globSync(["src/**/*", "content/**/*"], { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => `${entry.parentPath}/${entry.name}`)
  .sort();

test("the lint sees the source tree", () => {
  expect(files.some((f) => f.endsWith("src/main.ts"))).toBe(true);
});

test.each(files)("%s has no raw U+000D", (file) => {
  const bytes = readFileSync(file);
  const lines: number[] = [];
  let line = 1;
  for (const byte of bytes) {
    if (byte === 0x0d) lines.push(line);
    if (byte === 0x0a) line += 1;
  }
  expect(lines, `raw CR on line(s) ${lines.join(", ")}; write \\r instead`).toEqual([]);
});
