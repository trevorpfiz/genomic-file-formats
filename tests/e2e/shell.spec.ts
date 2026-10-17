// E2E for the app shell on the built file over file:// (docs/PLAN.md 11.6, 13 M1): every route
// renders with its title, switcher and theme control; lesson TOCs end in Recap and follow
// scrolling; the switcher, outline, top bar and sheet work from the keyboard; the theme
// applies before first paint; progress survives a reload and merges across pages and copies
// (D-36); without storage the notice shows and the progress code round-trips (D-29, D-23);
// axe finds nothing serious on any route, in light and dark.
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { outlineItems, pages as manifest } from "../../content/course.ts";

const COURSE = pathToFileURL(resolve("dist/index.html")).href;
const PROGRESS_KEY = "genomic-file-formats:v1:progress";
const THEME_KEY = "genomic-file-formats:theme";
const SITE = "Genomic File Formats";

const builtLessons = manifest.filter((p) => p.kind === "lesson" && p.status === "built");
const plannedLesson = manifest.find((p) => p.kind === "lesson" && p.status === "planned");

interface RouteCase {
  hash: string;
  h1: string;
  title: string;
}

const ROUTES: RouteCase[] = [
  { hash: "#/", h1: SITE, title: SITE },
  ...builtLessons.map((l) => ({
    hash: l.route,
    h1: l.title,
    title: `${l.title} · Lesson ${l.lesson} · ${SITE}`,
  })),
  { hash: "#/quiz/sequences", h1: "Section quiz: Sequences", title: `Section quiz: Sequences · ${SITE}` },
  {
    hash: "#/capstone",
    h1: "Capstone: triage the case folder",
    title: `Capstone: triage the case folder · ${SITE}`,
  },
  { hash: "#/badge", h1: "Completion badge", title: `Completion badge · ${SITE}` },
  { hash: "#/about", h1: "About this course", title: `About this course · ${SITE}` },
  ...(plannedLesson
    ? [
        {
          hash: plannedLesson.route,
          h1: plannedLesson.title,
          title: `${plannedLesson.title} · Lesson ${plannedLesson.lesson} · ${SITE}`,
        },
      ]
    : []),
  { hash: "#/no/such/page", h1: "Not found", title: `Not found · ${SITE}` },
];

/** Page errors, console errors and any request that is not the file itself or data:. */
function watch(page: Page, file = COURSE): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith("data:") && !url.startsWith("blob:") && url.split("#")[0] !== file)
      problems.push(`request: ${url}`);
  });
  return problems;
}

async function open(page: Page, route: RouteCase | string, file = COURSE): Promise<void> {
  const hash = typeof route === "string" ? route : route.hash;
  await page.goto(`${file}${hash}`);
  if (typeof route !== "string") await expect(page.locator("h1")).toHaveText(route.h1);
}

/** Add a predict exercise to the current lesson and lock in the right answer. */
async function solvePredict(page: Page, id: string): Promise<void> {
  await page.evaluate((exerciseId) => {
    const host = document.createElement("gf-predict") as HTMLElement & { data?: unknown };
    host.dataset.mode = "quick-check";
    host.data = {
      id: exerciseId,
      kind: "predict",
      source: "e2e",
      tags: ["concept"],
      formats: ["fasta"],
      concepts: ["fasta.record"],
      title: `Predict ${exerciseId}`,
      prompt: "Type 42.",
      items: [{ label: "The answer", input: { type: "number", answer: 42, tolerance: 0 } }],
      reveal: "It is 42.",
    };
    document.querySelector("main article")!.append(host);
  }, id);
  const card = page.locator(`[id="${id.replaceAll("/", "--")}"]`);
  await card.getByLabel("The answer").fill("42");
  await card.getByRole("button", { name: "Lock in my prediction" }).click();
  await expect(card.locator(".card-status")).toHaveText("Correct");
}

type Stored = {
  lessons: Record<string, { exercises: Record<string, { state: string }> }>;
  quizzes: Record<string, { passedAt: string | null; best: number }>;
};

async function stored(page: Page): Promise<Stored | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Stored) : null;
  }, PROGRESS_KEY);
}

const stateOf = (s: Stored | null, id: string) => s?.lessons[id.split("/")[0]!]?.exercises[id]?.state;

async function axeSerious(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations: { id: string; impact?: string | null; nodes: { target: unknown[] }[] }[] =
    results.violations;
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

// ---------------------------------------------------------------------------------------------
// Routes and navigation

test("every route renders with its title, the switcher and the theme control", async ({ page }) => {
  const problems = watch(page);
  for (const [i, route] of ROUTES.entries()) {
    await open(page, route);
    await expect(page, route.hash).toHaveTitle(route.title);
    await expect(page.locator("#fallback")).toHaveCount(0);
    await expect(page.locator(".aside .switcher-toggle"), route.hash).toBeVisible();
    await expect(page.locator(".aside .aside-theme .menu-button-trigger"), route.hash).toBeVisible();
    // A route change moves focus to the H1; the first load leaves it at the skip link.
    if (i > 0) await expect(page.locator("h1"), route.hash).toBeFocused();
  }
  expect(problems).toEqual([]);
});

test("lesson TOCs end in Recap, and the active item follows scrolling and clicks", async ({ page }) => {
  for (const lesson of builtLessons) {
    await open(page, lesson.route);
    const items = page.locator(".aside [data-toc] .toc-link");
    expect(await items.count()).toBeGreaterThanOrEqual(2);
    await expect(items.last()).toHaveText("Recap");
  }
  const lesson = builtLessons[0]!;
  await open(page, lesson.route);
  const links = page.locator(".aside [data-toc] .toc-link");
  await expect(links.first()).toHaveAttribute("aria-current", "location");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(links.last()).toHaveAttribute("aria-current", "location");
  await page.evaluate(() => window.scrollTo(0, 0));
  await links.last().click();
  await expect(page.locator("#recap")).toBeFocused();
  await expect(page).toHaveURL(`${COURSE}${lesson.route}/recap`);
  await expect(links.last()).toHaveAttribute("aria-current", "location");
});

test("the switcher shows the lesson and expands into the course outline", async ({ page }) => {
  const lesson = builtLessons[1] ?? builtLessons[0]!;
  await open(page, lesson.route);
  const toggle = page.locator(".aside .switcher-toggle");
  await expect(toggle).toContainText(`Lesson ${lesson.lesson} of 22 · Sequences`);
  await expect(toggle).toContainText(lesson.title);
  await expect(page.locator(".aside .switcher-progress")).toHaveAttribute("aria-valuemax", "30");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const outline = page.locator(".aside nav[aria-label='Course outline']");
  await expect(outline).toBeVisible();
  await expect(outline.locator(".outline-item")).toHaveCount(outlineItems.length + 1);
  await expect(outline.locator("[aria-current='page']")).toContainText(lesson.title);
  await expect(page.locator(".aside [data-toc]")).toBeHidden();
  await expect(outline.locator(".outline-badge")).toContainText("Completion badge");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await expect(page.locator(".aside [data-toc]")).toBeVisible();
  // Choosing a row navigates and collapses the outline.
  await toggle.click();
  await outline
    .getByRole("link", { name: /Section quiz/ })
    .first()
    .click();
  await expect(page.locator("h1")).toHaveText("Section quiz: Sequences");
  await expect(page.locator(".aside .switcher-toggle")).toHaveAttribute("aria-expanded", "false");
});

test("prev/next cards, the breadcrumb and the scripted skip link", async ({ page }) => {
  const problems = watch(page);
  const [first, second, third] = builtLessons;
  await open(page, second!.route);
  const pager = page.getByRole("navigation", { name: "Lesson navigation" });
  await expect(pager.locator("a[rel=prev]")).toHaveAttribute("href", first!.route);
  await expect(pager.locator("a[rel=next]")).toHaveAttribute("href", third!.route);
  await pager.locator("a[rel=next]").click();
  await expect(page.locator("h1")).toHaveText(third!.title);
  await expect(page.locator("h1")).toBeFocused();

  // On a fresh load the skip link is the first Tab stop; it moves focus to <main> and leaves
  // the hash alone.
  await page.reload();
  await expect(page.locator("h1")).toHaveText(third!.title);
  const url = page.url();
  const firstStop = await page.evaluate(
    () =>
      document.querySelector<HTMLElement>(
        "a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])",
      )?.className,
  );
  expect(firstStop).toBe("skip-link");
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  const skip = page.locator(".skip-link");
  await skip.focus();
  await expect(skip).toBeVisible();
  await expect(skip).toHaveText("Skip to lesson content");
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  expect(page.url()).toBe(url);

  // The breadcrumb's section link opens home at that section.
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: /Sequences/ })
    .click();
  await expect(page.locator("h1")).toHaveText(SITE);
  await expect(page.locator("#home-outline-sequences")).toBeFocused();
  expect(problems).toEqual([]);
});

test("a status-line link jumps to its exercise over file://", async ({ page }) => {
  for (const lesson of builtLessons) {
    await open(page, lesson.route);
    const links = page.locator(".lesson-status-list a");
    await expect(links.first()).toBeVisible();
    // Each status-line link points at an exercise on this page.
    for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))
      await expect(page.locator(`[id="${href.split("/").at(-1)!}"]`)).toHaveCount(1);
    const link = links.last();
    const href = (await link.getAttribute("href"))!;
    const target = href.split("/").at(-1)!;
    await link.click();
    await expect(page).toHaveURL(`${COURSE}${href}`);
    await expect(page.locator(`[id="${target}"]`)).toBeFocused();
    await expect(page.locator("h1")).toHaveText(lesson.title);
  }
});

test("the mobile top bar opens the navigation sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const lesson = builtLessons[0]!;
  await open(page, lesson.route);
  await expect(page.locator(".aside")).toBeHidden();
  const bar = page.locator(".topbar-menu");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(`${lesson.lesson}/22`);
  await expect(page.locator(".topbar .menu-button-trigger")).toHaveAttribute("aria-label", /^Theme: /);
  await bar.click();
  const sheet = page.locator("dialog#nav-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("tab", { name: "On this page" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(sheet.getByRole("tab", { name: "Course outline" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.locator("nav[aria-label='Course outline']")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(bar).toBeFocused();
  // Choosing a TOC item closes the sheet and moves to the heading.
  await bar.click();
  await sheet.getByRole("tab", { name: "On this page" }).click();
  await sheet.locator(".toc-link", { hasText: "Recap" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("#recap")).toBeFocused();
});

test("the quiz page's TOC lists the questions and Results, with icons that follow the answers", async ({
  page,
}) => {
  const problems = watch(page);
  await open(page, "#/quiz/sequences");
  await expect(page.locator("h1")).toHaveText("Section quiz: Sequences");
  // Swap in a six-question quiz (the real Quiz 2 data may not be built yet).
  await page.evaluate(() => {
    const variant = (n: number, letter: string) => ({
      id: `quiz-sequences/${n}/${letter}`,
      kind: "mcq",
      title: `Question ${n}${letter}`,
      prompt: "",
      multi: false,
      stem: "Which token does samtools use as the sequence name?",
      options: [
        { id: "a", text: "`chrM_demo`", correct: true, explanation: "The name is the first word after `>`." },
        { id: "b", text: "`first`", correct: false, explanation: "That word is part of the description." },
      ],
    });
    const quiz = document.createElement("gf-quiz") as HTMLElement & { data?: unknown };
    quiz.setAttribute("section", "sequences");
    quiz.data = {
      section: "sequences",
      title: "Section quiz: Sequences",
      passMark: 5,
      referenceCard: { title: "Reference card", items: [] },
      slots: [1, 2, 3, 4, 5, 6].map((n) => ({
        id: `2.${n}`,
        tests: "fasta-reference#recap",
        tags: ["application"],
        concepts: ["fasta.record"],
        variants: [variant(n, "a"), variant(n, "b")],
      })),
    };
    document.querySelector("main gf-quiz")!.replaceWith(quiz);
  });
  const quiz = page.locator("main gf-quiz");
  await quiz.locator("#quiz-sequences--q1 input[value='a']").check();
  const toc = page.locator(".aside [data-toc]");
  await expect(toc.locator(".toc-link")).toHaveText([
    "Question 1, answered",
    "Question 2, not answered",
    "Question 3, not answered",
    "Question 4, not answered",
    "Question 5, not answered",
    "Question 6, not answered",
    "Results",
  ]);
  for (const n of [2, 3, 4, 5, 6]) await quiz.locator(`#quiz-sequences--q${n} input[value='a']`).check();
  await quiz.getByRole("button", { name: "Submit quiz" }).click();
  await expect(quiz.locator(".quiz-results h2")).toBeFocused();
  await expect(toc.locator(".toc-link").first()).toHaveText("Question 1, correct");
  await expect(toc.locator(".toc-link").last()).toHaveAttribute("data-target", "quiz-sequences-results");
  // Passed shows on the page's pills and in the outline.
  await expect(page.locator(".meta-pills")).toContainText("Passed · 6/6");
  await page.locator(".aside .switcher-toggle").click();
  await expect(page.locator(".aside .outline-item[data-item='quiz-sequences'] .pill-passed")).toBeVisible();
  expect(problems).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// Theme

test("the theme control switches, persists, and applies before first paint", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await open(page, ROUTES[0]!);
  const trigger = page.locator(".aside .aside-theme .menu-button-trigger");
  await expect(trigger).toHaveText("Theme: System");
  // Keyboard path: Enter opens the menu on the checked item; Down, Down, Enter picks Dark.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(trigger).toHaveText("Theme: Dark");
  await expect(trigger).toBeFocused();
  // The home page's radio group follows.
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe("dark");

  // No flash: when <body> first appears, the dark theme and its tokens already apply.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, string>;
    new MutationObserver((_records, observer) => {
      if (!document.body) return;
      w.__themeAtBody = document.documentElement.dataset.theme ?? "none";
      w.__bgAtBody = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  await expect(page.locator("h1")).toHaveText(SITE);
  const first = await page.evaluate(() => {
    const w = window as unknown as Record<string, string>;
    return [w.__themeAtBody, w.__bgAtBody];
  });
  expect(first).toEqual(["dark", "#1a1917"]);
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(26, 25, 23)");

  // System removes the choice and follows the operating system again.
  await page.locator("label[for='home-theme-system']").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBeNull();
  await expect(trigger).toHaveText("Theme: System");
});

// ---------------------------------------------------------------------------------------------
// Progress

test("progress survives a reload and updates the lesson UI", async ({ page }) => {
  const problems = watch(page);
  const lesson = builtLessons[0]!;
  await open(page, lesson.route);
  const id = `${lesson.id}/e2e-reload`;
  await solvePredict(page, id);
  await expect.poll(async () => stateOf(await stored(page), id)).toBe("correct");
  await page.reload();
  await expect(page.locator("h1")).toHaveText(lesson.title);
  expect(stateOf(await stored(page), id)).toBe("correct");
  // A card for the same exercise restores as correct.
  await page.evaluate((exerciseId) => {
    const host = document.createElement("gf-predict") as HTMLElement & { data?: unknown };
    host.data = {
      id: exerciseId,
      kind: "predict",
      source: "e2e",
      tags: ["concept"],
      formats: ["fasta"],
      concepts: ["fasta.record"],
      title: "Restored",
      prompt: "Type 42.",
      items: [{ label: "The answer", input: { type: "number", answer: 42, tolerance: 0 } }],
      reveal: "It is 42.",
    };
    document.querySelector("main article")!.append(host);
  }, id);
  await expect(page.locator(`[id="${id.replaceAll("/", "--")}"] .card-status`)).toHaveText("Correct");
  await expect(page.locator(".footer-status")).toHaveText("Progress saved in this browser");

  // Completing the lesson's own graded exercises completes the lesson: the status line says so
  // and the switcher's course progress counts it.
  await expect(page.locator(".aside .switcher-progress")).toHaveAttribute("aria-valuenow", "0");
  const graded = await page.evaluate(() =>
    [...document.querySelectorAll("main [exercise]:not([data-optional])")].map((el) =>
      el.getAttribute("exercise")!,
    ),
  );
  expect(graded.length).toBeGreaterThan(0);
  await page.evaluate(
    ({ key, lessonId, ids }) => {
      const value = JSON.parse(localStorage.getItem(key)!);
      value.lessons[lessonId] ??= { exercises: {} };
      value.lessons[lessonId].exercises ??= {};
      for (const exerciseId of ids)
        value.lessons[lessonId].exercises[exerciseId] = {
          state: "correct",
          attempts: 1,
          firstTry: true,
          revealed: false,
          updatedAt: new Date().toISOString(),
        };
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: PROGRESS_KEY, lessonId: lesson.id, ids: graded },
  );
  await page.reload();
  await expect(page.locator("h1")).toHaveText(lesson.title);
  await expect(page.locator(".lesson-status-text")).toHaveText("Lesson complete");
  await expect(page.locator(".aside .switcher-progress")).toHaveAttribute("aria-valuenow", "1");
  expect(problems).toEqual([]);
});

test("two pages and two copies never lose each other's progress (D-36)", async ({ browser, browserName }) => {
  const context = await browser.newContext();
  const lesson = builtLessons[0]!;
  const a = await context.newPage();
  const b = await context.newPage();
  await open(a, lesson.route);
  await open(b, lesson.route);

  await solvePredict(a, `${lesson.id}/e2e-page-a`);
  await expect.poll(async () => stateOf(await stored(a), `${lesson.id}/e2e-page-a`)).toBe("correct");
  // Another copy records a passed quiz directly in storage, as an older file would.
  await a.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key)!);
    value.quizzes.sequences = {
      best: 6,
      of: 6,
      passedAt: "2026-10-16T12:00:00.000Z",
      attempts: 1,
      mystery: 1,
    };
    value.fromAnotherCopy = { kept: true };
    localStorage.setItem(key, JSON.stringify(value));
  }, PROGRESS_KEY);

  // Page B never reloaded: its memory is stale, and its flush must merge, not overwrite.
  await solvePredict(b, `${lesson.id}/e2e-page-b`);
  await expect.poll(async () => stateOf(await stored(b), `${lesson.id}/e2e-page-b`)).toBe("correct");
  const after = await stored(b);
  expect(stateOf(after, `${lesson.id}/e2e-page-a`)).toBe("correct");
  expect(after?.quizzes.sequences?.passedAt).toBe("2026-10-16T12:00:00.000Z");
  expect((after as unknown as { fromAnotherCopy?: unknown }).fromAnotherCopy).toEqual({ kept: true });
  // Page B learned about the quiz through the storage event: its outline shows "Passed".
  await b.locator(".aside .switcher-toggle").click();
  await expect(b.locator(".aside .outline-item[data-item='quiz-sequences'] .pill-passed")).toHaveText(
    "Passed",
  );

  // Chromium shares one file:// store between differently named copies.
  if (browserName === "chromium") {
    const dir = mkdtempSync(join(tmpdir(), "gf-copy-"));
    const copyPath = join(dir, "genomic-file-formats-copy.html");
    copyFileSync(resolve("dist/index.html"), copyPath);
    const copyUrl = pathToFileURL(copyPath).href;
    const c = await context.newPage();
    await open(c, lesson.route, copyUrl);
    // Chromium syncs localStorage between renderers asynchronously; under load a new page can
    // read it a moment before the other pages' writes arrive.
    await expect.poll(async () => stateOf(await stored(c), `${lesson.id}/e2e-page-a`)).toBe("correct");
    await solvePredict(c, `${lesson.id}/e2e-copy`);
    await expect.poll(async () => stateOf(await stored(a), `${lesson.id}/e2e-copy`)).toBe("correct");
    const all = await stored(a);
    expect(stateOf(all, `${lesson.id}/e2e-page-b`)).toBe("correct");
    expect(all?.quizzes.sequences?.passedAt).toBe("2026-10-16T12:00:00.000Z");
  }
  await context.close();
});

async function throwingStoragePage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  });
  return context.newPage();
}

test("without storage: the notice, 'Progress not saved', and a progress code that round-trips", async ({
  browser,
}) => {
  const page = await throwingStoragePage(browser);
  const problems = watch(page);
  const lesson = builtLessons[0]!;
  await open(page, lesson.route);
  const notice = page.locator(".notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Progress not saved");
  await expect(notice.getByRole("link", { name: "Open the online copy" })).toHaveAttribute(
    "href",
    /^https:\/\//,
  );
  await expect(page.locator(".footer-status")).toHaveText("Progress not saved");

  const id = `${lesson.id}/e2e-no-storage`;
  await solvePredict(page, id);
  await notice.getByRole("button", { name: "Copy progress code" }).click();
  const field = notice.locator("textarea.code-field");
  await expect(field).toHaveValue(/^GF1[ZU]\./);
  const code = await field.inputValue();
  // The notice stays across routes until dismissed.
  await open(page, "#/about");
  await expect(page.locator(".notice")).toBeVisible();
  await page.locator(".notice").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".notice")).toHaveCount(0);
  expect(problems).toEqual([]);
  await page.context().close();

  // A normal browser imports the code: merge by default.
  const fresh = await browser.newContext();
  const other = await fresh.newPage();
  await open(other, "#/about");
  await other.getByLabel("Paste a progress code").fill(`  ${code.slice(0, 20)}\n${code.slice(20)}  `);
  await other.getByRole("button", { name: "Import" }).click();
  await expect(other.locator(".import-confirm")).toContainText("1 completed exercise");
  await other.getByRole("button", { name: "Merge" }).click();
  await expect(other.locator(".code-import .field-message")).toHaveText("Progress imported and merged.");
  await expect.poll(async () => stateOf(await stored(other), id)).toBe("correct");
  // A damaged code is refused with a reason.
  await other.getByLabel("Paste a progress code").fill(code.replace(/.$/, (c) => (c === "0" ? "1" : "0")));
  await other.getByRole("button", { name: "Import" }).click();
  await expect(other.getByLabel("Paste a progress code")).toHaveAttribute("aria-invalid", "true");
  await expect(other.locator(".code-import .field-message")).toContainText("damaged");
  await fresh.close();
});

// ---------------------------------------------------------------------------------------------
// Accessibility

const THEMES = [
  { name: "light", colorScheme: "light", forced: undefined },
  { name: "dark", colorScheme: "dark", forced: undefined },
  { name: "data-theme dark over a light system", colorScheme: "light", forced: "dark" },
  { name: "data-theme light over a dark system", colorScheme: "dark", forced: "light" },
] as const;

for (const theme of THEMES) {
  test(`axe: no serious or critical findings on any route (${theme.name})`, async ({ page }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: theme.colorScheme });
    if (theme.forced) {
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
        THEME_KEY,
        theme.forced,
      ] as const);
    }
    const findings: string[] = [];
    for (const route of ROUTES) {
      await open(page, route);
      if (theme.forced) await expect(page.locator("html")).toHaveAttribute("data-theme", theme.forced);
      findings.push(...(await axeSerious(page)).map((f) => `${route.hash} ${f}`));
    }
    expect(findings).toEqual([]);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe: the expanded outline, the mobile sheet and the storage notice (${colorScheme})`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme });
    const page = await context.newPage();
    await open(page, builtLessons[0]!.route);
    await page.locator(".aside .switcher-toggle").click();
    expect(await axeSerious(page)).toEqual([]);
    await page.setViewportSize({ width: 390, height: 800 });
    await page.locator(".topbar-menu").click();
    await page.getByRole("tab", { name: "Course outline" }).click();
    expect(await axeSerious(page)).toEqual([]);
    await context.close();

    const noStorage = await throwingStoragePage(browser);
    await noStorage.emulateMedia({ colorScheme });
    await open(noStorage, "#/");
    await expect(noStorage.locator(".notice")).toBeVisible();
    expect(await axeSerious(noStorage)).toEqual([]);
    await noStorage.context().close();
  });
}
