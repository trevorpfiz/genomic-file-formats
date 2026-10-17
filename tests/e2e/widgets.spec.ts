// E2E smoke paths for every exercise type, the viewers and the quiz page, on the BUILT file
// over file:// (docs/PLAN.md 11.6). The exercises below are test-only fixtures: they are
// injected into a built lesson page through each element's `data` property (as the quiz page
// does), so nothing here ships in dist/index.html. Covered: one keyboard path per type, the
// fix-it overlay geometry (7.2), the 24 x 24 px gridcell minimum (7.1), a text download over
// file:// (D-27), the quiz submit flow with focus on the results heading, and axe in light and
// dark with the widgets in seeded states (incorrect, correct, revealed, a picked sort item, an
// open popover, hex annotations on tints).
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const COURSE = pathToFileURL(resolve("dist/index.html")).href;
const base = { source: "e2e", tags: ["concept"], formats: ["fasta"], concepts: ["fasta.record"], prompt: "" };

const FASTA_TEXT =
  ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGG\nagctctccatgcatttggta\nTTTT\n";
const BGZF_HEX = {
  head: "1f 8b 08 04 00 00 00 00 00 ff 06 00 42 43 02 00",
  annotations: [
    { from: 0, to: 2, label: "gzip magic" },
    { from: 12, to: 14, label: "BC subfield" },
  ],
  decoded: ">chr1",
};
const BASES = "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT";
const FIX_STARTER =
  "# reference for case 042\n>chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGGAGCT\n\nCTCCATGCATTTGGTATTTT\n>chrM_demo duplicate copy\nGATCACAGGT\n";
const HEADER = ">chr1  AC:CM000663.2  LN:248956422";
const span = (token: string) => [HEADER.indexOf(token), HEADER.indexOf(token) + token.length];

const FIXTURES: Record<string, Record<string, unknown>> = {
  mcq: {
    ...base,
    id: "e2e/mcq",
    kind: "mcq",
    title: "Which token is the name?",
    multi: false,
    stem: "Which token does samtools use as the sequence name?",
    snippet: { filename: "chrM_demo.fa", format: "fasta", kind: "text", provenance: "toy", text: FASTA_TEXT },
    options: [
      { id: "a", text: "`chrM_demo`", correct: true, explanation: "The name is the first word after `>`." },
      { id: "b", text: "`first`", correct: false, explanation: "That word is part of the description." },
    ],
  },
  container: {
    ...base,
    id: "e2e/container",
    kind: "mcq",
    title: "Which container is this?",
    multi: false,
    stem: "Which container holds this reference?",
    snippet: {
      filename: "ref.fa.gz",
      format: "bgzf",
      kind: "compressed-text",
      provenance: "toy",
      download: "decompressed",
      hex: BGZF_HEX,
      decodedText: ">chr1\nACGT\n",
    },
    options: [
      { id: "a", text: "BGZF", correct: true, explanation: "The `BC` subfield marks BGZF." },
      { id: "b", text: "Plain gzip", correct: false, explanation: "Plain gzip has no `BC` subfield." },
    ],
  },
  predict: {
    ...base,
    id: "e2e/predict",
    kind: "predict",
    title: "How many index rows?",
    items: [{ label: "Rows in the .fai", input: { type: "number", answer: 2, tolerance: 0 } }],
    reveal: "The empty record is dropped, so 2 rows remain.",
  },
  spotLine: {
    ...base,
    id: "e2e/spot-line",
    kind: "spot-the-error",
    title: "Why won't this index?",
    rounds: [
      {
        id: "a",
        snippet: {
          filename: "chrM_demo.fa",
          format: "fasta",
          kind: "text",
          provenance: "toy",
          text: FASTA_TEXT,
        },
        granularity: "line",
        validation: { format: "fasta", profile: {} },
        answers: [
          { line: 3, rule: "FA-S02", explanation: "Line 3 has 16 bases in a record whose lines have 20." },
        ],
        fineHere: { "4": "Lowercase is a masked repeat." },
      },
    ],
  },
  spotField: {
    ...base,
    id: "e2e/spot-field",
    kind: "spot-the-error",
    title: "Which field breaks BED?",
    formats: ["bed"],
    rounds: [
      {
        id: "a",
        snippet: {
          filename: "targets.bed",
          format: "bed",
          kind: "text",
          provenance: "toy",
          text: "chr2\t100\t200\tt1\t0\t+\nchr2\t300\t400\tt2\t0\t*\n",
        },
        granularity: "field",
        validation: { format: "bed", profile: {} },
        answers: [{ line: 2, field: "strand", rule: "BED-S09", explanation: "Strand is `+`, `-` or `.`." }],
      },
    ],
  },
  fixIt: {
    ...base,
    id: "e2e/fix-it",
    kind: "fix-it",
    title: "Make this reference indexable",
    starter: { filename: "ref.fa", format: "fasta", kind: "text", provenance: "toy", text: FIX_STARTER },
    validation: { format: "fasta", profile: { include: ["FA-S01", "FA-S03", "FA-M01"] } },
    goals: [
      {
        id: "bases",
        text: "Keeps all 60 bases",
        check: "fastaKeepsBases",
        args: { name: "chrM_demo", bases: BASES },
      },
    ],
    solution:
      ">chrM_demo first 60 bp of GRCh38 chrM\nGATCACAGGTCTATCACCCT\nATTAACCACTCACGGGAGCT\nCTCCATGCATTTGGTATTTT\n",
    expectStarterRules: ["FA-S01", "FA-S03", "FA-M01"],
    hints: ["Look at lines 1 and 5.", "FA-S01 and FA-S03.", "Delete them."],
  },
  sort: {
    ...base,
    id: "e2e/sort",
    kind: "sort",
    title: "Which file is this?",
    bins: [
      { id: "fasta", label: "FASTA" },
      { id: "fastq", label: "FASTQ" },
      { id: "unknown", label: "Can't tell" },
    ],
    items: [
      { id: "i1", content: "`>chr1`", bin: "fasta", why: "A header line." },
      { id: "i2", content: "`@r1`", bin: "fastq", why: "A read title." },
      {
        id: "i3",
        content: {
          filename: "file.bin",
          format: "bgzf",
          kind: "hex",
          provenance: "toy",
          hideIdentity: true,
          hex: BGZF_HEX,
        },
        label: "A BGZF head",
        bin: "unknown",
        why: "BGZF hides its content until decompressed.",
      },
    ],
  },
  explorer: {
    ...base,
    id: "e2e/explorer",
    kind: "field-explorer",
    title: "Read the header",
    snippet: {
      filename: "ref.fasta",
      format: "fasta",
      kind: "text",
      provenance: "real-file",
      text: `${HEADER}\n`,
    },
    fields: [
      { line: 1, span: span("chr1"), name: "name", meaning: "The sequence name.", cite: "faidx(5)" },
      { line: 1, span: span("AC:CM000663.2"), name: "AC", meaning: "The accession.", cite: "Broad bundle" },
      { line: 1, span: span("LN:248956422"), name: "LN", meaning: "The length.", cite: "Broad bundle" },
    ],
    check: {
      id: "check",
      kind: "mcq",
      prompt: "",
      multi: false,
      stem: "Which token is the name?",
      options: [
        { id: "a", text: "`chr1`", correct: true, explanation: "The first word." },
        { id: "b", text: "`LN:248956422`", correct: false, explanation: "The length." },
      ],
    },
  },
  simulator: {
    ...base,
    id: "e2e/find-the-byte",
    kind: "simulator",
    simulator: "fai-calculator",
    title: "Find the byte",
    init: {
      row: "chrM_demo\t60\t38\t20\t21",
      label: "`toy.fa`",
      header: ">chrM_demo first 60 bp of GRCh38 chrM",
      sequence: "GATCACAGGTCTATCACCCTATTAACCACTCACGGGAGCTCTCCATGCATTTGGTATTTT",
      position: 43,
    },
    goals: [
      {
        id: "base-45",
        text: "Find the byte that holds base 45.",
        when: "showsBase",
        args: { position: 45, row: "chrM_demo\t60\t38\t20\t21" },
        explanation: "Byte 84.",
        witness: [],
      },
    ],
    textView: "table",
  },
};

/** Open a built lesson and append the fixture widgets to its article. */
async function fixtures(page: Page): Promise<void> {
  await page.goto(`${COURSE}#/lesson/fasta-reference`);
  await expect(page.locator("h1")).toBeVisible();
  await page.evaluate((all) => {
    const article = document.querySelector("main article") ?? document.querySelector("main") ?? document.body;
    const section = document.createElement("section");
    section.id = "e2e-fixtures";
    for (const [key, data] of Object.entries(all)) {
      const kind = String(data.kind);
      const el = document.createElement(`gf-${kind}`) as HTMLElement & { data?: unknown };
      el.id = `e2e-${key}`;
      el.dataset.mode = "quick-check";
      const title = document.createElement("h3");
      title.className = "quick-check-title";
      title.id = `e2e-${key}-title`;
      title.textContent = String(data.title);
      el.append(title);
      el.data = data;
      section.append(el);
    }
    article.append(section);
  }, FIXTURES);
}

function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("request", (r) => {
    const url = r.url();
    if (!url.startsWith("data:") && !url.startsWith("blob:") && url.split("#")[0] !== COURSE)
      problems.push(`request: ${url}`);
  });
  return problems;
}

const verdict = (page: Page, key: string) => page.locator(`#e2e-${key} > .card-feedback .card-verdict`);

test("every exercise type works by keyboard alone in the built file", async ({ page }) => {
  const problems = watch(page);
  await fixtures(page);

  // mcq: arrows move within the radio group; Ctrl+Enter checks; focus lands on the verdict.
  const mcq = page.locator("#e2e-mcq");
  await mcq.locator('input[value="b"]').focus();
  await page.keyboard.press("ArrowUp");
  await expect(mcq.locator('input[value="a"]')).toBeChecked();
  await page.keyboard.press("Control+Enter");
  await expect(verdict(page, "mcq")).toBeFocused();
  await expect(verdict(page, "mcq")).toHaveText("Correct.");

  // predict: Enter in the field locks the prediction.
  await page.locator("#e2e-predict").getByLabel("Rows in the .fai").fill("2");
  await page.keyboard.press("Enter");
  await expect(verdict(page, "predict")).toHaveText("Correct. Your prediction matches.");
  await expect(verdict(page, "predict")).toBeFocused();

  // spot-the-error (line): arrows, Space, Ctrl+Enter.
  const spot = page.locator("#e2e-spotLine");
  await spot.locator('[data-key="L1"]').focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");
  await expect(spot.locator('[data-key="L3"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+Enter");
  await expect(verdict(page, "spotLine")).toHaveText("Correct. You found the error.");

  // spot-the-error (field): Right and Down between fields.
  const field = page.locator("#e2e-spotField");
  await field.locator('[data-key="L1:1"]').focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(field.locator('[data-key="L2:6"]')).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Control+Enter");
  await expect(verdict(page, "spotField")).toHaveText("Correct. You found the error.");

  // fix-it: type the fix; Check.
  const fix = page.locator("#e2e-fixIt");
  const editor = fix.locator("textarea");
  await editor.fill(String(FIXTURES.fixIt!.solution));
  await expect(fix.locator(".fixit-pill")).toHaveText("Valid FASTA");
  await editor.press("Control+Enter");
  await expect(verdict(page, "fixIt")).toHaveText("Correct. Valid FASTA. The goal is met.");

  // sort: Space picks up, arrows choose the bin, Enter drops (with announcements).
  const sort = page.locator("#e2e-sort");
  for (const [id, steps] of [
    ["i1", 1],
    ["i2", 2],
    ["i3", 3],
  ] as const) {
    await sort.locator(`[data-item="${id}"] .sort-handle`).focus();
    await page.keyboard.press("Space");
    for (let i = 0; i < steps; i += 1) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
  }
  await expect(sort.locator(".card-live")).toHaveText("Placed in Can't tell. 0 items left unsorted.");
  await page.keyboard.press("Control+Enter");
  await expect(verdict(page, "sort")).toHaveText("Correct. All 3 items are in the right bin.");

  // field-explorer: focus shows the popover; arrows move; Esc hides; the check completes it.
  const explorer = page.locator("#e2e-explorer");
  await explorer.locator('[data-key="F0"]').focus();
  await expect(explorer.locator(".fe-popover")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(explorer.locator(".fe-popover-title")).toHaveText("AC");
  await page.keyboard.press("Escape");
  await expect(explorer.locator(".fe-popover")).toBeHidden();
  await expect(explorer.locator(".fe-counter")).toHaveText("Explored 2 of 3 fields");
  await explorer.locator('.fe-check input[value="a"]').check();
  await page.keyboard.press("Control+Enter");
  await expect(verdict(page, "explorer")).toHaveText("Correct.");

  // simulator: buttons by keyboard.
  const next = page.locator("#e2e-simulator").getByRole("button", { name: "Next base" });
  await next.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator("#e2e-simulator")).toHaveAttribute("data-state", "correct");

  for (const key of Object.keys(FIXTURES).filter((k) => k !== "container")) {
    await expect(page.locator(`#e2e-${key}`), key).toHaveAttribute("data-state", "correct");
  }
  expect(problems).toEqual([]);
});

test("every gridcell is at least 24 x 24 px", async ({ page }) => {
  await fixtures(page);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#e2e-fixtures [role="gridcell"]')]
      .map((cell) => ({ cell, box: cell.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && box.height > 0)
      .filter(({ box }) => box.width < 24 || box.height < 24)
      .map(({ cell, box }) => `${cell.getAttribute("aria-label")}: ${box.width}x${box.height}`),
  );
  expect(small).toEqual([]);
  expect(await page.locator('#e2e-fixtures [role="gridcell"]').count()).toBeGreaterThan(15);
});

test("at 320 px the page never scrolls sideways; wide snippets scroll in their own region", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await fixtures(page);
  await page.locator("#e2e-fixIt").getByRole("button", { name: "Check" }).click();
  await page.locator("#e2e-fixIt").getByRole("button", { name: "Show solution" }).click();
  const widths = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    view: document.documentElement.clientWidth,
    cards: [...document.querySelectorAll<HTMLElement>("#e2e-fixtures .exercise-card")].map(
      (c) => c.getBoundingClientRect().right,
    ),
  }));
  expect(widths.page).toBeLessThanOrEqual(widths.view);
  for (const right of widths.cards) expect(right).toBeLessThanOrEqual(widths.view);
});

test("the fix-it overlay lines up with the textarea, through a TAB and a horizontal scroll", async ({
  page,
}) => {
  await fixtures(page);
  const fix = page.locator("#e2e-fixIt");
  const editor = fix.locator("textarea");
  await editor.focus();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Tab");
  await expect(editor).toHaveValue(`\t${FIX_STARTER}`);
  await page.keyboard.press("End");
  await page.keyboard.type(" " + "x".repeat(200));
  // After the debounced validation, FA-S01 underlines the TAB that now starts line 1.
  await expect(fix.locator(".fixit-overlay mark.fixit-mark-error").first()).toHaveText("\t");
  const geometry = await page.evaluate(() => {
    const host = document.querySelector("#e2e-fixIt")!;
    const area = host.querySelector("textarea")!;
    const overlay = host.querySelector<HTMLElement>(".fixit-overlay")!;
    area.scrollLeft = 0;
    area.dispatchEvent(new Event("scroll"));
    const a = area.getBoundingClientRect();
    const o = overlay.getBoundingClientRect();
    const sa = getComputedStyle(area);
    const so = getComputedStyle(overlay);
    const same = [
      "fontFamily",
      "fontSize",
      "lineHeight",
      "paddingLeft",
      "paddingTop",
      "tabSize",
      "whiteSpace",
    ].filter((p) => sa[p as keyof CSSStyleDeclaration] !== so[p as keyof CSSStyleDeclaration]);
    const probe = document.createElement("span");
    probe.textContent = "0".repeat(20);
    overlay.append(probe);
    const ch = probe.getBoundingClientRect().width / 20;
    probe.remove();
    const left = a.left + Number.parseFloat(sa.borderLeftWidth) + Number.parseFloat(sa.paddingLeft);
    const top = a.top + Number.parseFloat(sa.borderTopWidth) + Number.parseFloat(sa.paddingTop);
    const mark = overlay.querySelector("mark.fixit-mark-error")!.getBoundingClientRect();
    // The "#" after the TAB sits at the first tab stop: 4 characters in.
    const line = overlay.querySelector(".fixit-line")!;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let hash: DOMRect | undefined;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const i = node.textContent!.indexOf("#");
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        hash = range.getBoundingClientRect();
        break;
      }
    }
    area.scrollLeft = 300;
    area.dispatchEvent(new Event("scroll"));
    return {
      boxes: [a.x - o.x, a.y - o.y, a.width - o.width, a.height - o.height].map((d) => Math.abs(d) < 1),
      same,
      markLeft: mark.left - left,
      markTop: mark.top - top,
      hashLeft: (hash?.left ?? 0) - left,
      ch,
      text: overlay.textContent!.replace(/ $/, "") === area.value,
      scroll: [area.scrollLeft, overlay.scrollLeft],
    };
  });
  expect(geometry.boxes).toEqual([true, true, true, true]);
  expect(geometry.same).toEqual([]);
  expect(geometry.text).toBe(true);
  expect(Math.abs(geometry.markLeft)).toBeLessThan(1);
  expect(Math.abs(geometry.markTop)).toBeLessThan(6);
  expect(Math.abs(geometry.hashLeft - 4 * geometry.ch)).toBeLessThan(1);
  expect(geometry.scroll[0]).toBeGreaterThan(0);
  expect(geometry.scroll[1]).toBe(geometry.scroll[0]);
});

test("Download saves a text snippet's exact bytes over file://", async ({ page }) => {
  await fixtures(page);
  const download = page.waitForEvent("download");
  await page.locator("#e2e-mcq .snippet-toolbar").getByRole("button", { name: "Download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("chrM_demo.fa");
  expect(await readFile((await file.path())!, "utf8")).toBe(FASTA_TEXT);
});

test("the quiz page: answer, submit, focus on the results, Passed, then a retake", async ({ page }) => {
  const problems = watch(page);
  await page.goto(`${COURSE}#/lesson/fasta-reference`);
  await expect(page.locator("h1")).toBeVisible();
  const mcq = (n: number, letter: string) => ({
    ...FIXTURES.mcq,
    id: `quiz-e2e/${n}/${letter}`,
    title: `Question ${n}${letter}`,
    snippet: undefined,
  });
  const slots = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: String(n),
    tests: "fasta-reference#recap",
    tags: n === 6 ? ["LO7"] : ["application"],
    concepts: ["fasta.record"],
    variants: [mcq(n, "a"), mcq(n, "b")],
  }));
  slots[1]!.variants = [
    { ...FIXTURES.predict, id: "quiz-e2e/2/a" },
    { ...FIXTURES.predict, id: "quiz-e2e/2/b" },
  ] as never;
  await page.evaluate((quizSlots) => {
    const quiz = document.createElement("gf-quiz") as HTMLElement & { data?: unknown };
    quiz.setAttribute("section", "e2e");
    quiz.data = {
      section: "e2e",
      title: "Section quiz: E2E",
      passMark: 5,
      referenceCard: { title: "Reference card", items: [{ kind: "text", text: "Q = -10 log10 P." }] },
      slots: quizSlots,
    };
    (document.querySelector("main article") ?? document.body).append(quiz);
  }, slots);
  const quiz = page.locator("gf-quiz");
  await expect(quiz.locator(".quiz-question")).toHaveCount(6);
  await expect(quiz.locator(".card-actions")).toHaveCount(0);
  for (const n of [1, 3, 4, 5, 6]) await quiz.locator(`#quiz-e2e--q${n} input[value="a"]`).check();
  await quiz.locator("#quiz-e2e--q2 input").fill("2");
  await expect(quiz.locator(".quiz-status")).toHaveText("Answered 6 of 6");
  await quiz.getByRole("button", { name: "Submit quiz" }).click();
  await expect(quiz.locator(".quiz-results h2")).toBeFocused();
  await expect(quiz.locator(".quiz-score-number")).toHaveText("6 / 6");
  await expect(quiz.locator(".quiz-results .passed-badge")).toHaveText("Passed");
  await quiz.getByRole("button", { name: "Retake quiz" }).click();
  await expect(quiz.locator("#quiz-e2e--q1 .exercise-title")).toHaveText("Question 1b");
  await expect(quiz.locator(".quiz-best")).toContainText("Best score: 6 of 6");
  expect(problems).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`axe: no serious or critical findings on the widgets in seeded states (${colorScheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await fixtures(page);
    // Incorrect mcq, correct spot, revealed fix-it with its diff, a picked sort item, an open
    // popover, a selected cell and the compressed-text viewer on its hex tab (annotation tints).
    const mcq = page.locator("#e2e-mcq");
    await mcq.locator('input[value="b"]').check();
    await mcq.getByRole("button", { name: "Check" }).click();
    const spot = page.locator("#e2e-spotLine");
    await spot.locator('[data-key="L4"]').click();
    await spot.getByRole("button", { name: "Check" }).click();
    await spot.locator('[data-key="L3"]').click();
    await spot.getByRole("button", { name: "Check" }).click();
    await page.locator("#e2e-spotField [data-key='L2:5']").click();
    const fix = page.locator("#e2e-fixIt");
    await fix.getByRole("button", { name: "Check" }).click();
    await fix.getByRole("button", { name: "Show solution" }).click();
    await expect(fix.locator(".fixit-diff")).toBeVisible();
    await page.locator('#e2e-sort [data-item="i2"] .sort-handle').click();
    await page.locator('#e2e-explorer [data-key="F1"]').focus();
    await expect(page.locator("#e2e-explorer .fe-popover")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include("#e2e-fixtures")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const violations: { id: string; impact?: string | null; nodes: { target: unknown[] }[] }[] =
      results.violations;
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
