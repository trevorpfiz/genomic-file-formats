// Section 2 on the BUILT file over file:// (docs/PLAN.md 13 M1 acceptance):
// - a keyboard-only walkthrough from a fresh profile: from home into L04, every graded exercise
//   of L04-L07 and Quiz 2, moving only with Tab, Shift+Tab, arrows, Space, Enter, Esc and typing.
//   Answers come from the real exercise and quiz data (the drawn quiz variants are read from the
//   page), so the walkthrough follows content edits; the keys themselves are checked by
//   tests/content.test.ts;
// - axe on every Section 2 route and the quiz, in light and dark, fresh (Read-mores open), after
//   Check with nothing chosen, seeded as "Answer shown" from storage, and completed by the
//   walkthrough. No serious or critical findings are allowed.
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AxeBuilder } from "@axe-core/playwright";
import { settleAnimations } from "./settle.ts";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { pages as manifest } from "../../content/course.ts";
import { exercises } from "../../src/exercises/registry.ts";
import type {
  Exercise,
  FieldExplorerExercise,
  FollowUp,
  McqExercise,
  PredictExercise,
  SimulatorExercise,
  SortExercise,
  SpotRound,
  SpotTheErrorExercise,
} from "../../src/exercises/types.ts";

const COURSE = pathToFileURL(resolve("dist/index.html")).href;
const PROGRESS_KEY = "genomic-file-formats:v1:progress";
const SECTION = manifest.filter((p) => p.section === "sequences" && p.status === "built");
const LESSONS = SECTION.filter((p) => p.kind === "lesson");
const QUIZ = SECTION.find((p) => p.kind === "quiz")!;
const domId = (id: string) => id.replaceAll("/", "--");

/** Page errors, console errors and any request that is not the file itself, data: or blob:. */
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

async function axeSerious(page: Page, label: string): Promise<string[]> {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const violations: { id: string; impact?: string | null; nodes: { target: unknown[] }[] }[] =
    results.violations;
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${label}: ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

// ---------------------------------------------------------------------------------------------
// Keyboard helpers. Focus moves only by Tab and Shift+Tab; the direction comes from the
// document order of the focused element and the target.

/** Tab (or Shift+Tab) until one of the elements `target` matches has focus. */
async function tabTo(page: Page, target: Locator, max = 800): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const step = await target.evaluateAll((els) => {
      const active = document.activeElement;
      if (!els.length) return "missing";
      if (active && (els as Element[]).includes(active)) return "here";
      const first = els[0]!;
      const forward =
        !active ||
        active === document.body ||
        Boolean(active.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING);
      // The fix-it editor keeps Tab for a TAB character; Esc first lets Tab move on (7.2).
      if (forward && active instanceof HTMLTextAreaElement && !active.readOnly) return "escape";
      return forward ? "next" : "prev";
    });
    if (step === "here") return;
    if (step === "missing") throw new Error(`tabTo: nothing matches ${target.toString()}`);
    if (step === "escape") await page.keyboard.press("Escape");
    await page.keyboard.press(step === "prev" ? "Shift+Tab" : "Tab");
  }
  throw new Error(`tabTo: ${target.toString()} not reached in ${max} key presses`);
}

/** Choose options in a radio group (arrows) or check boxes (Tab and Space). */
async function choose(page: Page, inputs: Locator, values: string[]): Promise<void> {
  const type = await inputs.first().getAttribute("type");
  if (type === "checkbox") {
    for (const value of values) {
      const box = inputs.and(page.locator(`[value="${value}"]`));
      await tabTo(page, box);
      if (!(await box.isChecked())) await page.keyboard.press("Space");
      await expect(box).toBeChecked();
    }
    return;
  }
  const target = inputs.and(page.locator(`[value="${values[0]}"]`));
  await tabTo(page, inputs);
  const count = await inputs.count();
  for (let i = 0; i <= count && !(await target.isChecked()); i += 1) {
    const onTarget = await target.evaluate((el) => el === document.activeElement);
    await page.keyboard.press(onTarget ? "Space" : "ArrowDown");
  }
  await expect(target).toBeChecked();
}

/** Select every keyed cell of a spot-the-error round: Tab into its grid, arrows, Space. */
async function pickCells(page: Page, round: Locator, spot: SpotRound): Promise<void> {
  for (const answer of spot.answers) {
    // Line cells are keyed "L3"; field cells "L3:2", named "Line 3, field 2 of 6, strand, ...".
    const cell = answer.field
      ? round.locator(`[role="gridcell"][data-key^="L${answer.line}:"][aria-label*=", ${answer.field}, "]`)
      : round.locator(`[role="gridcell"][data-key="L${answer.line}"]`);
    await tabTo(page, round.locator('[role="gridcell"]'));
    for (let i = 0; i < 400; i += 1) {
      const where = await cell.evaluate((el) => {
        const active = document.activeElement as HTMLElement | null;
        if (active === el) return "here";
        const line = (k: string | undefined) => Number(/^L(\d+)/.exec(k ?? "")?.[1] ?? 0);
        const a = line(active?.dataset.key);
        const t = line((el as HTMLElement).dataset.key);
        if (a !== t) return a < t ? "down" : "up";
        return active!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING ? "right" : "left";
      });
      if (where === "here") break;
      await page.keyboard.press(
        { down: "ArrowDown", up: "ArrowUp", right: "ArrowRight", left: "ArrowLeft" }[where],
      );
    }
    await page.keyboard.press("Space");
    await expect(cell).toHaveAttribute("aria-selected", "true");
  }
}

type Answerable = Pick<McqExercise, "kind" | "options"> | Pick<PredictExercise, "kind" | "items">;

/** Answer an mcq or predict question inside `scope` (a card, a follow-up or a check). */
async function answer(page: Page, scope: Locator, q: Answerable): Promise<void> {
  if (q.kind === "mcq") {
    const correct = q.options.filter((o) => o.correct).map((o) => o.id);
    await choose(page, scope.locator(".mcq-options input"), correct);
    return;
  }
  const items = scope.locator(".predict-item");
  for (const [i, item] of q.items.entries()) {
    const row = items.nth(i);
    const input = item.input;
    if (input.type === "choice") {
      const keys = Array.isArray(input.answer) ? input.answer : [input.answer];
      await choose(page, row.locator("input"), keys.map(String));
    } else if (input.type === "region") {
      const [start, end] = [row.locator("input").nth(0), row.locator("input").nth(1)];
      await tabTo(page, start);
      await page.keyboard.type(String(input.answer[0]));
      await tabTo(page, end);
      await page.keyboard.type(String(input.answer[1]));
    } else {
      await tabTo(page, row.locator("input"));
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(String(input.answer));
    }
  }
}

/** Check (or lock in) the card that holds the focus. */
async function check(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+Enter");
}

async function followUps(page: Page, card: Locator, list: FollowUp[] | undefined): Promise<void> {
  for (const followUp of list ?? []) {
    const host = card.locator(`[id$="--${followUp.id}"]`);
    await expect(host).toBeVisible();
    if (followUp.kind === "spot-the-error") {
      for (const [r, round] of followUp.rounds.entries())
        await pickCells(page, host.locator(".spot-round").nth(r), round);
    } else await answer(page, host, followUp);
    await check(page);
    await expect(host).toHaveAttribute("data-state", "correct");
  }
}

/** The simulators of Section 2, driven through their controls by each goal's witness actions. */
async function runSimulator(page: Page, card: Locator, exercise: SimulatorExercise): Promise<void> {
  if (exercise.predictGate) {
    // The prediction comes first: the island opens once it is locked in (7.5).
    const gate = card.locator(".sim-gate");
    await answer(page, gate.locator(".card-body"), exercise.predictGate);
    await check(page);
    await expect(gate).toHaveAttribute("data-state", "correct");
    await expect(card.locator(".island")).toBeVisible();
  }
  for (const goal of exercise.goals) {
    for (const action of goal.witness as Record<string, unknown>[]) {
      if (action.type === "preset") {
        const state = action.state as Record<string, unknown>;
        const preset = exercise.presets!.find((p) =>
          Object.entries(state).every(([k, v]) => p.state[k] === v),
        )!;
        const name = preset.label.replaceAll("`", "");
        await tabTo(page, card.locator(".sim-presets button").filter({ hasText: name }));
        await page.keyboard.press("Enter");
      } else if (action.type === "position") {
        await tabTo(page, card.getByLabel("Position (1-based)"));
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.type(String(action.position));
        await page.keyboard.press("Enter");
      } else if (action.type === "char") {
        await tabTo(page, card.getByLabel("Character", { exact: true }));
        await page.keyboard.type(String(action.char));
      } else throw new Error(`no keyboard script for ${exercise.simulator} action ${String(action.type)}`);
    }
  }
}

/** Complete one graded exercise by keyboard, as a learner would. */
async function solve(page: Page, card: Locator, exercise: Exercise): Promise<void> {
  switch (exercise.kind) {
    case "mcq":
    case "predict":
      await answer(page, card.locator(".card-body"), exercise);
      await check(page);
      break;
    case "spot-the-error":
      for (const [r, round] of (exercise as SpotTheErrorExercise).rounds.entries())
        await pickCells(page, card.locator(".spot-round").nth(r), round);
      await check(page);
      break;
    case "fix-it":
      await tabTo(page, card.locator("textarea"));
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type(exercise.solution);
      await expect(card.locator(".fixit-pill")).toHaveText(/^\s*Valid /);
      await check(page);
      break;
    case "sort": {
      const sort = exercise as SortExercise;
      for (const item of sort.items) {
        const bin = sort.bins.findIndex((b) => b.id === item.bin);
        await tabTo(page, card.locator(`[data-item="${item.id}"] .sort-handle`));
        await page.keyboard.press("Space");
        for (let i = 0; i <= bin; i += 1) await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
      }
      await check(page);
      break;
    }
    case "field-explorer": {
      const explorer = exercise as FieldExplorerExercise;
      // Explore the first field from the keyboard: focus shows its popover; Esc hides it.
      await tabTo(page, card.locator('[role="gridcell"]'));
      await expect(card.locator(".fe-popover")).toBeVisible();
      await page.keyboard.press("Escape");
      if (explorer.check) {
        await answer(page, card.locator(".fe-check"), explorer.check);
        await check(page);
      }
      await followUps(page, card, explorer.followUps);
      return;
    }
    case "simulator":
      await runSimulator(page, card, exercise);
      await followUps(page, card, exercise.followUps);
      return;
  }
  await followUps(page, card, exercise.followUps);
}

/** The graded exercises on the current lesson page, in document order. */
async function gradedOnPage(page: Page): Promise<string[]> {
  return page
    .locator("main [exercise]:not([data-optional])")
    .evaluateAll((els) => els.map((el) => el.getAttribute("exercise")!));
}

// ---------------------------------------------------------------------------------------------
// The walkthrough

/** An "emailed copy": the built file saved under another name in another folder. */
function emailedCopy(): string {
  const path = join(mkdtempSync(join(tmpdir(), "gf-mail-")), "Genomic File Formats (1).html");
  copyFileSync(resolve("dist/index.html"), path);
  return pathToFileURL(path).href;
}

for (const [label, source] of [
  ["the built file", () => COURSE],
  ["an emailed copy", emailedCopy],
] as const)
  test(`keyboard only, fresh profile: Section 2 and Quiz 2 from ${label}`, async ({
    browser,
    browserName,
  }) => {
    // WebKit's Tab reaches only form fields unless the system's full keyboard access is on, so
    // a Tab-driven walk cannot reach links and buttons there; Chromium and Firefox run it.
    test.skip(browserName === "webkit", "WebKit tabs to form fields only by default");
    test.setTimeout(240_000);
    await walkthrough(browser, source());
  });

async function walkthrough(browser: Browser, file: string): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems = watch(page, file);
  const axe: string[] = [];
  await page.goto(file);
  await expect(page.locator("h1")).toHaveText("Genomic File Formats");

  // Home -> L04 through the course outline.
  await tabTo(page, page.locator(".outline-home a.outline-row").filter({ hasText: LESSONS[0]!.title }));
  await page.keyboard.press("Enter");

  for (const [i, lesson] of LESSONS.entries()) {
    await expect(page.locator("h1")).toHaveText(lesson.title);
    const ids = await gradedOnPage(page);
    expect(ids.length, lesson.id).toBeGreaterThanOrEqual(3);
    for (const id of ids) {
      const exercise = exercises[id];
      expect(exercise, id).toBeDefined();
      const card = page.locator(`[id="${domId(id)}"]`);
      await solve(page, card, exercise!);
      await expect(card, id).toHaveAttribute("data-state", "correct");
    }
    await expect(page.locator(".lesson-status-text")).toHaveText("Lesson complete");
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      axe.push(...(await axeSerious(page, `${lesson.id} completed (${colorScheme})`)));
    }
    await page.emulateMedia({ colorScheme: "light" });
    // On to the next page through the pager.
    const next = i + 1 < LESSONS.length ? LESSONS[i + 1]! : QUIZ;
    await tabTo(page, page.locator("a.pager-next").filter({ hasText: next.title }));
    await page.keyboard.press("Enter");
  }

  // Quiz 2: read the drawn variants (shuffled) from the page, answer them by keyboard, submit.
  await expect(page.locator("h1")).toHaveText(QUIZ.title);
  const drawn = await page.locator("gf-quiz").evaluate((el) =>
    (el as HTMLElement & { questions: { variant: unknown; host: HTMLElement }[] }).questions.map((q) => ({
      id: q.host.id,
      variant: JSON.parse(JSON.stringify(q.variant)) as Exercise,
    })),
  );
  expect(drawn).toHaveLength(6);
  for (const { id, variant } of drawn) {
    const host = page.locator(`[id="${id}"]`);
    if (variant.kind === "spot-the-error") {
      for (const [r, round] of variant.rounds.entries())
        await pickCells(page, host.locator(".spot-round").nth(r), round);
    } else if (variant.kind === "sort") {
      for (const item of variant.items) {
        const bin = variant.bins.findIndex((b) => b.id === item.bin);
        await tabTo(page, host.locator(`[data-item="${item.id}"] .sort-handle`));
        await page.keyboard.press("Space");
        for (let i = 0; i <= bin; i += 1) await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Enter");
      }
    } else await answer(page, host, variant as Answerable);
  }
  const quiz = page.locator("gf-quiz");
  await expect(quiz.locator(".quiz-status")).toHaveText("Answered 6 of 6");
  await tabTo(page, quiz.getByRole("button", { name: "Submit quiz" }));
  await page.keyboard.press("Enter");
  await expect(quiz.locator(".quiz-results h2")).toBeFocused();
  await expect(quiz.locator(".quiz-score-number")).toHaveText("6 / 6");
  await expect(quiz.locator(".quiz-results .passed-badge")).toHaveText("Passed");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    axe.push(...(await axeSerious(page, `quiz passed (${colorScheme})`)));
  }

  // The progress is stored: four lessons and the quiz count on the course progress bar.
  await expect(page.locator(".aside .switcher-progress")).toHaveAttribute(
    "aria-valuenow",
    String(LESSONS.length + 1),
  );
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), PROGRESS_KEY);
  expect(stored?.quizzes?.sequences?.passedAt).toEqual(expect.any(String));
  expect(axe).toEqual([]);
  expect(problems).toEqual([]);
  await context.close();
}

// ---------------------------------------------------------------------------------------------
// The axe matrix

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`axe on Section 2 (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const lesson of LESSONS) {
      test(`${lesson.id}: fresh with Read-mores open, then checked with nothing chosen`, async ({ page }) => {
        const problems = watch(page);
        await page.goto(`${COURSE}${lesson.route}`);
        await expect(page.locator("h1")).toHaveText(lesson.title);
        await page
          .locator("main details:not([open]) > summary")
          .evaluateAll((els) =>
            els.forEach((s) => (s.parentElement as HTMLDetailsElement).setAttribute("open", "")),
          );
        const found = await axeSerious(page, "fresh");
        // Check every card with nothing chosen: incomplete and error feedback show.
        for (const button of await page
          .locator("main .card-actions button")
          .filter({ hasText: /^(Check|Lock in my prediction)$/ })
          .all())
          if (await button.isVisible()) await button.click();
        found.push(...(await axeSerious(page, "checked")));
        expect(found).toEqual([]);
        expect(problems).toEqual([]);
      });

      test(`${lesson.id}: every exercise seeded as Answer shown`, async ({ page }) => {
        const problems = watch(page);
        await page.goto(`${COURSE}${lesson.route}`);
        await expect(page.locator("h1")).toHaveText(lesson.title);
        const ids = await page
          .locator("main [exercise]")
          .evaluateAll((els) => els.map((el) => el.getAttribute("exercise")!));
        await page.evaluate(
          ({ key, lessonId, ids: all }) => {
            const now = new Date().toISOString();
            const record = {
              state: "revealed",
              attempts: 2,
              firstTry: false,
              revealed: true,
              updatedAt: now,
            };
            localStorage.setItem(
              key,
              JSON.stringify({
                schema: 1,
                updatedAt: now,
                lessons: { [lessonId]: { exercises: Object.fromEntries(all.map((id) => [id, record])) } },
              }),
            );
          },
          { key: PROGRESS_KEY, lessonId: lesson.id, ids },
        );
        await page.reload();
        await expect(page.locator("h1")).toHaveText(lesson.title);
        await page
          .locator("main details:not([open]) > summary")
          .evaluateAll((els) =>
            els.forEach((s) => (s.parentElement as HTMLDetailsElement).setAttribute("open", "")),
          );
        for (const id of ids)
          await expect(page.locator(`[id="${domId(id)}"]`), id).toHaveAttribute("data-state", "revealed");
        await expect(page.locator(".lesson-status-text")).toHaveText("Lesson complete");
        expect(await axeSerious(page, "revealed")).toEqual([]);
        expect(problems).toEqual([]);
      });
    }

    // Phone width (and 400% zoom at 1280 px is 320 CSS px): wide code and snippets scroll inside
    // their own regions, which must then be focusable (axe scrollable-region-focusable).
    for (const width of [390, 320])
      test(`every Section 2 page and the quiz at ${width} px, Read-mores open`, async ({ page }) => {
        const problems = watch(page);
        await page.setViewportSize({ width, height: 800 });
        const found: string[] = [];
        for (const entry of [...LESSONS, QUIZ]) {
          await page.goto(`${COURSE}${entry.route}`);
          await expect(page.locator("h1")).toHaveText(entry.title);
          await page
            .locator("main details:not([open]) > summary")
            .evaluateAll((els) =>
              els.forEach((s) => (s.parentElement as HTMLDetailsElement).setAttribute("open", "")),
            );
          found.push(...(await axeSerious(page, `${entry.id} at ${width} px`)));
        }
        expect(found).toEqual([]);
        expect(problems).toEqual([]);
      });

    test("quiz: fresh, then submitted unanswered with its review links", async ({ page }) => {
      const problems = watch(page);
      await page.goto(`${COURSE}${QUIZ.route}`);
      await expect(page.locator("h1")).toHaveText(QUIZ.title);
      const quiz = page.locator("gf-quiz");
      await expect(quiz.locator(".quiz-question")).toHaveCount(6);
      const found = await axeSerious(page, "fresh");
      await quiz.getByRole("button", { name: "Submit quiz" }).click();
      await quiz.getByRole("button", { name: "Submit anyway" }).click();
      await expect(quiz.locator(".quiz-results h2")).toBeFocused();
      await expect(quiz.locator(".quiz-score-number")).toHaveText("0 / 6");
      found.push(...(await axeSerious(page, "submitted")));
      expect(found).toEqual([]);
      expect(problems).toEqual([]);
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Reflow (WCAG 1.4.10): at phone width no Section 2 page scrolls sideways, before and after
// placing a sort item with its "Place in" select (a long bin name once overflowed the card).

test("at 360 px no Section 2 page scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const overflow = async (label: string) => {
    const { scroll, view, culprits } = await page.evaluate(() => {
      const view = document.documentElement.clientWidth;
      // Name the elements that stick out past the viewport outside any scroll region, so a
      // failure in CI (where engines and fonts differ from local runs) says what to fix.
      const scrolls = (el: Element | null): boolean => {
        for (let s = el; s && s !== document.body; s = s.parentElement) {
          if (/auto|scroll|hidden|clip/.test(getComputedStyle(s).overflowX)) return true;
        }
        return false;
      };
      const culprits = [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > view + 0.5 && !scrolls(el.parentElement))
        .slice(0, 5)
        .map((el) => {
          const tag = el.tagName.toLowerCase() + [...el.classList].map((c) => `.${c}`).join("");
          const text = (el.textContent ?? "").trim().slice(0, 40);
          return `${tag} (right ${Math.round(el.getBoundingClientRect().right)}) "${text}"`;
        });
      return { scroll: document.documentElement.scrollWidth, view, culprits };
    });
    return scroll > view
      ? [`${label}: page is ${scroll} px wide in a ${view} px viewport; ${culprits.join("; ")}`]
      : [];
  };
  const found: string[] = [];
  for (const entry of [...LESSONS, QUIZ]) {
    await page.goto(`${COURSE}${entry.route}`);
    await expect(page.locator("h1")).toHaveText(entry.title);
    await page
      .locator("main details:not([open]) > summary")
      .evaluateAll((els) =>
        els.forEach((s) => (s.parentElement as HTMLDetailsElement).setAttribute("open", "")),
      );
    found.push(...(await overflow(entry.id)));
    const select = page.locator("main .sort-place select").first();
    if (await select.count()) {
      await select.selectOption({ index: 5 });
      found.push(...(await overflow(`${entry.id} after Place in`)));
    }
  }
  expect(found).toEqual([]);
});
