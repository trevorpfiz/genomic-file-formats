// Content tests (docs/PLAN.md 11.6): compile every content file with the real compiler and the
// real registry, check the pages against the course manifest (D-37), and check every exercise
// and quiz key against the validators and the arithmetic helpers (the checks and the key
// conventions are in src/validators/keys.ts). Over built pages only: a stub lesson or an empty
// quiz passes vacuously, and each check bites as soon as content arrives.
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { conceptIntroducers, outlineItems, pages as manifest, sections } from "../content/course.ts";
import {
  compileLesson,
  CONCEPT_ID,
  ROUTE,
  type CompiledPage,
  type RegistryEntry,
} from "../plugins/lesson-compiler.ts";
import { CONTENT_GLOBS, contentFiles } from "../plugins/vite-plugin-lessons.ts";
import { exercises, quizzes, registry as registryRecord, snippets } from "../src/exercises/registry.ts";
import { exerciseDomId } from "../src/shell/ids.ts";
import { RULES } from "../src/validators/all.ts";
import {
  questionProblems,
  questionsOf,
  quizProblems,
  snippetProblems,
  snippetsIn,
  stringsIn,
  unknownRules,
  type Located,
  type QuizContext,
} from "../src/validators/keys.ts";
import { models } from "../src/widgets/simulators/models.ts";

const root = process.cwd();
const files = contentFiles(root, CONTENT_GLOBS).map((f) => relative(root, f));
const registry = new Map<string, RegistryEntry>(Object.entries(registryRecord));
const sectionIds = new Set(sections.map((s) => s.id));
const compiled: [string, CompiledPage][] = await Promise.all(
  files.map(
    async (f) =>
      [f, await compileLesson(readFileSync(f, "utf8"), f, { registry, sections: sectionIds })] as [
        string,
        CompiledPage,
      ],
  ),
);
const pageById = new Map(compiled.map(([, p]) => [p.meta.id, p]));
const order = new Map(manifest.map((p, i) => [p.id, i]));

/** `test.each` over a list that may still be empty (stubs): one vacuous test instead. */
function eachOrNone<T>(name: string, list: readonly T[], label: (t: T) => string, fn: (t: T) => void): void {
  if (!list.length) {
    test(`${name}: none yet`, () => {});
    return;
  }
  test.each(list.map((t) => [label(t), t] as const))(`${name}: %s`, (_l, t) => fn(t));
}

// ---------------------------------------------------------------------------------------------
// Pages and the manifest (D-37)

describe.each(compiled)("%s", (file, page) => {
  test("is listed in the manifest as built, with the same id, kind, title and route", () => {
    const entry = manifest.find((p) => p.file === file);
    expect(entry, `${file} is not in content/course.ts`).toBeDefined();
    expect(entry).toMatchObject({
      id: page.meta.id,
      kind: page.meta.kind,
      title: page.meta.title,
      route: page.route,
      status: "built",
    });
  });

  test("sits in its section's folder", () => {
    if (!("section" in page.meta) || !page.meta.section) return;
    const section = sections.find((s) => s.id === (page.meta as { section: string }).section);
    expect(section, `unknown section "${page.meta.section}"`).toBeDefined();
    expect(file.startsWith(`content/lessons/${section?.folder}/`)).toBe(true);
  });

  test("links point at course routes", () => {
    for (const link of page.links) expect(link.href).toMatch(ROUTE);
  });

  test("lesson minutes match the course map", () => {
    if (page.meta.kind !== "lesson") return;
    expect(page.meta.minutes).toBe(manifest.find((p) => p.id === page.meta.id)?.minutes);
  });

  test("heading ids are unique", () => {
    expect(new Set(page.headings).size).toBe(page.headings.length);
  });
});

test("page ids are unique", () => {
  const ids = compiled.map(([, p]) => p.meta.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every built manifest page has a compiled file, and every planned page has none", () => {
  const built = manifest.filter((p) => p.status === "built");
  expect(built.map((p) => p.file).sort()).toEqual([...files].sort());
});

test("the manifest lists 30 outline items: 22 lessons, 7 quizzes and the capstone (D-37)", () => {
  expect(outlineItems).toHaveLength(30);
  expect(outlineItems.filter((p) => p.kind === "lesson").map((p) => p.lesson)).toEqual(
    Array.from({ length: 22 }, (_, i) => i + 1),
  );
  expect(outlineItems.filter((p) => p.kind === "quiz")).toHaveLength(7);
  expect(outlineItems.filter((p) => p.kind === "capstone")).toHaveLength(1);
  expect(new Set(manifest.map((p) => p.id)).size).toBe(manifest.length);
  // The course map's lesson minutes sum to about 193 (docs/PLAN.md 4).
  const minutes = outlineItems.filter((p) => p.kind === "lesson").reduce((n, p) => n + (p.minutes ?? 0), 0);
  expect(minutes).toBe(193);
});

test("every section has a quiz, except the capstone section", () => {
  for (const section of sections) {
    const hasQuiz = manifest.some((p) => p.kind === "quiz" && p.section === section.id);
    expect(hasQuiz, section.id).toBe(section.id !== "capstone-and-conclusion");
  }
});

test("cross-page links resolve against compiled headings and exercises", () => {
  const targets = new Map(
    compiled.map(([, p]) => [
      p.meta.id,
      new Set([...p.headings, ...p.widgets.filter((w) => w.ref).map((w) => exerciseDomId(w.ref))]),
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
  const used = compiled.flatMap(([, p]) => p.widgets.filter((w) => exercises[w.ref]).map((w) => w.ref));
  expect(used.sort()).toEqual(Object.keys(exercises).sort());
});

test("every registered quiz has its quiz page, and every quiz page names its quiz", () => {
  const quizPages = compiled.filter(([, p]) => p.meta.kind === "quiz");
  expect(quizPages.map(([, p]) => (p.meta as { section: string }).section).sort()).toEqual(
    Object.keys(quizzes).sort(),
  );
});

test("concept ids are well formed and map to pages in the manifest", () => {
  for (const [concept, pageId] of Object.entries(conceptIntroducers)) {
    expect(concept).toMatch(CONCEPT_ID);
    expect(order.has(pageId), `${concept} -> ${pageId}`).toBe(true);
  }
});

test("built lessons introduce what the map says, and require only concepts introduced earlier", () => {
  for (const [, page] of compiled) {
    if (page.meta.kind !== "lesson") continue;
    const here = order.get(page.meta.id) ?? -1;
    for (const concept of page.meta.introduces)
      expect(conceptIntroducers[concept], concept).toBe(page.meta.id);
    for (const concept of page.meta.requires) {
      const by = conceptIntroducers[concept];
      expect(by, `${page.meta.id} requires ${concept}, which no page introduces`).toBeDefined();
      expect(order.get(by ?? "") ?? Infinity, `${concept} is introduced after ${page.meta.id}`).toBeLessThan(
        here,
      );
    }
  }
  const introduced = compiled.flatMap(([, p]) => (p.meta.kind === "lesson" ? p.meta.introduces : []));
  const builtLessons = new Set(
    compiled.filter(([, p]) => p.meta.kind === "lesson").map(([, p]) => p.meta.id),
  );
  for (const [concept, pageId] of Object.entries(conceptIntroducers)) {
    if (builtLessons.has(pageId))
      expect(introduced, `${pageId} should introduce ${concept}`).toContain(concept);
  }
});

test("exercise concepts are introduced at or before their lesson", () => {
  for (const exercise of Object.values(exercises)) {
    const lessonId = exercise.id.split("/")[0] ?? "";
    for (const concept of exercise.concepts) {
      const by = conceptIntroducers[concept];
      expect(by, `${exercise.id}: unknown concept ${concept}`).toBeDefined();
      expect(order.get(by ?? "") ?? Infinity).toBeLessThanOrEqual(order.get(lessonId) ?? -1);
    }
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

// ---------------------------------------------------------------------------------------------
// Exercise keys (src/validators/keys.ts)

const lessonQuestions: Located[] = Object.values(exercises).flatMap((e) => questionsOf(e));

eachOrNone(
  "exercise key",
  lessonQuestions,
  (l) => l.where,
  (l) => expect(questionProblems(l)).toEqual([]),
);

eachOrNone(
  "exercise snippets",
  Object.values(exercises),
  (e) => e.id,
  (e) => expect(snippetsIn(e).flatMap((s) => snippetProblems(s, e.id))).toEqual([]),
);

eachOrNone(
  "registered snippet",
  Object.values(snippets),
  (s) => s.id,
  (s) => expect(snippetProblems(s, s.id)).toEqual([]),
);

test("exercise ids are <lesson-id>/<slug>, and embedded question ids are unique per card", () => {
  for (const e of Object.values(exercises)) {
    expect(e.id).toMatch(/^[a-z0-9-]+\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
    const ids = questionsOf(e)
      .slice(1)
      .map((l) => (l.q as { id: string }).id);
    expect(new Set(ids).size, e.id).toBe(ids.length);
  }
});

test("every rule a key names is implemented", () => {
  for (const e of Object.values(exercises)) expect(unknownRules(e), e.id).toEqual([]);
  for (const q of Object.values(quizzes))
    for (const s of q.slots) for (const v of s.variants) expect(unknownRules(v), v.id).toEqual([]);
});

test("the rule-usage report (docs/PLAN.md 8.2)", () => {
  const usage = new Map<string, Set<string>>();
  const add = (rule: string, id: string) => usage.set(rule, (usage.get(rule) ?? new Set()).add(id));
  const items: Located[] = [
    ...lessonQuestions,
    ...Object.values(quizzes).flatMap((quiz) =>
      quiz.slots.flatMap((s) => s.variants.flatMap((v) => questionsOf(v))),
    ),
  ];
  for (const { where, q } of items) {
    if (q.kind === "spot-the-error") for (const r of q.rounds) for (const a of r.answers) add(a.rule, where);
    if (q.kind === "fix-it") for (const rule of q.expectStarterRules) add(rule, where);
  }
  const lines = Object.keys(RULES)
    .sort()
    .map((rule) => `  ${rule.padEnd(8)} ${[...(usage.get(rule) ?? [])].sort().join(", ") || "-"}`);
  console.log(`Rule usage (rule -> exercises):\n${lines.join("\n")}`);
  expect(lines.length).toBe(Object.keys(RULES).length);
});

test("no content string contains a test-only validator canary (check-dist would fail)", () => {
  const canaries = JSON.parse(readFileSync("src/validators/test-only-messages.json", "utf8")) as string[];
  const texts = [
    ...compiled.map(([file, p]) => [file, p.html] as const),
    ...Object.values(exercises).map((e) => [e.id, stringsIn(e).join("\n")] as const),
    ...Object.values(quizzes).map((q) => [q.section, stringsIn(q).join("\n")] as const),
  ];
  for (const [where, text] of texts)
    for (const c of canaries) expect(text.includes(c), `${where} contains "${c}"; reword it`).toBe(false);
});

// ---------------------------------------------------------------------------------------------
// Quizzes (docs/PLAN.md 6.1, D-09)

const quizContext: QuizContext = {
  order,
  pages: pageById,
  introducers: conceptIntroducers,
  lessonExercises: Object.values(exercises),
};

eachOrNone(
  "quiz",
  Object.values(quizzes).filter((q) => q.slots.length > 0),
  (q) => q.section,
  (q) => expect(quizProblems(q, quizContext)).toEqual([]),
);
