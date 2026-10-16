// Content tests (docs/PLAN.md 11.6): compile every content file with the real compiler and the
// real registry, and check the pages against the course manifest (D-37). Grows with each
// milestone; M0 covers compilation, ids, directives, orphans, links, the manifest and
// simulator witnesses.
import { globSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { conceptIntroducers, pages as manifest, sections } from "../content/course.ts";
import { compileLesson, ROUTE, type CompiledPage, type RegistryEntry } from "../plugins/lesson-compiler.ts";
import { exercises } from "../src/exercises/registry.ts";
import { models } from "../src/widgets/simulators/models.ts";

const files = globSync("content/lessons/**/*.md").sort();
const registry = new Map<string, RegistryEntry>(
  Object.entries(exercises).map(([id, e]) => [id, { kind: e.kind, title: e.title }]),
);
const compiled: [string, CompiledPage][] = await Promise.all(
  files.map(
    async (f) => [f, await compileLesson(readFileSync(f, "utf8"), f, { registry })] as [string, CompiledPage],
  ),
);

describe.each(compiled)("%s", (file, page) => {
  test("is listed in the manifest as built, with the same id, kind and title", () => {
    const entry = manifest.find((p) => p.file === file);
    expect(entry, `${file} is not in content/course.ts`).toBeDefined();
    expect(entry).toMatchObject({
      id: page.meta.id,
      kind: page.meta.kind,
      title: page.meta.title,
      status: "built",
    });
  });

  test("sits in its section's folder", () => {
    if (!("section" in page.meta)) return;
    const section = sections.find((s) => s.id === (page.meta as { section: string }).section);
    expect(section, `unknown section "${page.meta.section}"`).toBeDefined();
    expect(file.startsWith(`content/lessons/${section?.folder}/`)).toBe(true);
  });

  test("links point at course routes", () => {
    for (const link of page.links) expect(link.href).toMatch(ROUTE);
  });
});

test("page ids are unique", () => {
  const ids = compiled.map(([, p]) => p.meta.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every built manifest page has a compiled file", () => {
  const built = manifest.filter((p) => p.status === "built" && p.file.startsWith("content/lessons/"));
  expect(built.map((p) => p.file).sort()).toEqual(files);
});

test("manifest ids are unique", () => {
  expect(new Set(manifest.map((p) => p.id)).size).toBe(manifest.length);
});

test("cross-page links resolve against compiled headings and exercises", () => {
  const targets = new Map(
    compiled.map(([, p]) => [
      p.meta.id,
      new Set([...p.headings, ...p.widgets.map((w) => w.ref.replaceAll("/", "--"))]),
    ]),
  );
  for (const [file, page] of compiled) {
    for (const link of page.links) {
      const m = ROUTE.exec(link.href);
      if (!m?.[1]) continue;
      const known = targets.get(m[1]);
      const planned = manifest.some((p) => p.id === m[1]);
      expect(known || planned, `${file}:${link.line} links to unknown page ${m[1]}`).toBeTruthy();
      if (known && m[2]) expect(known.has(m[2]), `${file}:${link.line} ${link.href}`).toBe(true);
    }
  }
});

test("every exercise is used by exactly one page (no orphans)", () => {
  const used = compiled.flatMap(([, p]) => p.widgets.filter((w) => registry.has(w.ref)).map((w) => w.ref));
  expect(used.sort()).toEqual(Object.keys(exercises).sort());
});

test("every concept a built lesson introduces is mapped to it, and every requirement is introduced", () => {
  for (const [, page] of compiled) {
    if (page.meta.kind !== "lesson") continue;
    for (const concept of page.meta.introduces) expect(conceptIntroducers[concept]).toBe(page.meta.id);
    for (const concept of page.meta.requires) expect(conceptIntroducers[concept], concept).toBeDefined();
  }
});

describe.each(Object.values(exercises).filter((e) => e.kind === "simulator"))("simulator $id", (exercise) => {
  if (exercise.kind !== "simulator") return;
  const model = models[exercise.simulator];

  test("has a model", () => {
    expect(model).toBeDefined();
  });

  test.each(exercise.goals)("goal $id: init alone does not reach it; the witness does", (goal) => {
    if (!model) return;
    const check = model.goalChecks[goal.when];
    expect(check, `unknown goal check ${goal.when}`).toBeDefined();
    const init = model.init(exercise.init);
    expect(check?.(init, goal.args)).toBe(false);
    const end = goal.witness.reduce((state, action) => model.reduce(state, action), init);
    expect(check?.(end, goal.args)).toBe(true);
  });
});
