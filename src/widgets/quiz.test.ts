// @vitest-environment happy-dom
// gf-quiz (docs/PLAN.md 6.1, D-09, D-30, D-36; ux 9.1): the Reference card, six cards in quiz
// mode with no feedback before submission, "Answered N of 6", the unanswered confirmation, one
// "Submit quiz" that grades every card once and moves focus only to the results heading, the
// Passed badge and the review links, retakes on fresh variants with the best score kept and
// "Passed" permanent, an attempt restored after a reload, and the pure helpers (seeded RNG,
// variant choice, option shuffles).
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type {
  McqExercise,
  PredictExercise,
  Quiz,
  QuizSlot,
  QuizVariant,
  SortExercise,
  SpotTheErrorExercise,
} from "../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "./card.ts";
import { chooseVariant, createRng, shuffleVariant, variantFromRef } from "./quiz.ts";
import { mergeQuizProgress } from "../shell/progress-merge.ts";
import { choose, type } from "./test-utils.ts";

const base = { prompt: "", source: "test", formats: ["fasta" as const], concepts: ["fasta.line-width"] };

const mcq = (id: string, stem: string): McqExercise => ({
  ...base,
  id,
  kind: "mcq",
  title: stem,
  tags: ["application"],
  multi: false,
  stem,
  options: [
    { id: "right", text: "The right one", correct: true, explanation: "Because it is." },
    { id: "wrong1", text: "A wrong one", correct: false, explanation: "Because it is not." },
    { id: "wrong2", text: "Another wrong one", correct: false, explanation: "Also not." },
  ],
});

const predict = (id: string, answer: number): PredictExercise => ({
  ...base,
  id,
  kind: "predict",
  title: `Expected errors ${answer}`,
  tags: ["application"],
  items: [{ label: "Expected errors", input: { type: "number", answer, tolerance: 0.01 } }],
  reveal: `The sum is ${answer}.`,
});

const spot = (id: string, bad: number): SpotTheErrorExercise => ({
  ...base,
  id,
  kind: "spot-the-error",
  title: "Which line stops indexing?",
  tags: ["validity"],
  singlePick: true,
  rounds: [
    {
      id: "a",
      snippet: {
        filename: "toy.fa",
        format: "fasta",
        kind: "text",
        provenance: "toy",
        text: bad === 3 ? ">t\nACGTACGT\nACGT\nACGTACGT\nAC\n" : ">t\nACGTACGT\nACGTACGT\nACG\nACGTACGT\nA\n",
      },
      granularity: "line",
      validation: { format: "fasta", profile: {} },
      answers: [
        { line: bad, rule: "FA-S02", explanation: `Line ${bad} is short in the middle of the record.` },
      ],
    },
  ],
});

const sort = (id: string): SortExercise => ({
  ...base,
  id,
  kind: "sort",
  title: "Sort by format",
  tags: ["recognition"],
  bins: [
    { id: "fasta", label: "FASTA" },
    { id: "fastq", label: "FASTQ" },
  ],
  items: [
    { id: "x", content: "`>chr1`", bin: "fasta", why: "A header." },
    { id: "y", content: "`@r1`", bin: "fastq", why: "A read title." },
  ],
});

const slot = (
  id: string,
  tests: string,
  variants: QuizVariant[],
  extra: Partial<QuizSlot> = {},
): QuizSlot => ({
  id,
  tests,
  tags: ["application"],
  concepts: ["fasta.line-width"],
  variants,
  ...extra,
});

const QUIZ: Quiz = {
  section: "test",
  title: "Section quiz: Testing",
  passMark: 5,
  referenceCard: {
    title: "Reference card",
    items: [
      {
        kind: "formula",
        label: "`.fai` byte",
        formula: "`OFFSET + floor(p / LINEBASES) * LINEWIDTH + p mod LINEBASES`",
        note: "p is 0-based.",
      },
      {
        kind: "table",
        caption: "Phred+33",
        columns: ["Char", "Q"],
        rows: [
          ["`#`", "2"],
          ["`I`", "40"],
        ],
      },
      { kind: "text", text: "Q = -10 log10 P." },
    ],
  },
  slots: [
    slot("1", "fasta-reference#try-it-why-wont-this-index", [
      spot("quiz-test/1/a", 3),
      spot("quiz-test/1/b", 4),
    ]),
    slot("2", "random-access#the-fai-five-numbers-per-sequence", [
      mcq("quiz-test/2/a", "Byte A?"),
      mcq("quiz-test/2/b", "Byte B?"),
    ]),
    slot("3", "random-access#gzip-versus-bgzf", [
      mcq("quiz-test/3/a", "Gzip A?"),
      mcq("quiz-test/3/b", "Gzip B?"),
    ]),
    slot(
      "4",
      "fastq-reads#try-it-quality-as-probability",
      [predict("quiz-test/4/a", 0.79), predict("quiz-test/4/b", 0.5)],
      {
        generator: { id: "phred-sum", generate: (rng) => predict("quiz-test/4/gen", rng.int(1, 9) / 10) },
      },
    ),
    slot("5", "fastq-in-the-wild#try-it-which-file-is-this", [sort("quiz-test/5/a"), sort("quiz-test/5/b")]),
    slot(
      "6",
      "fastq-reads#recap",
      [mcq("quiz-test/6/a", "Next file A?"), mcq("quiz-test/6/b", "Next file B?")],
      { tags: ["LO7"] },
    ),
  ],
};

let store: MemoryProgressStore;
beforeEach(() => {
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => document.body.replaceChildren());

type QuizHost = HTMLElement & { data?: Quiz };

async function show(quiz: Quiz = QUIZ): Promise<QuizHost> {
  await import("./quiz.ts");
  const host = document.createElement("gf-quiz") as QuizHost;
  host.setAttribute("section", quiz.section);
  host.data = quiz;
  document.body.append(host);
  return host;
}

const questions = (host: HTMLElement) => [
  ...host.querySelectorAll<HTMLElement & { data?: QuizVariant }>(".quiz-question > *"),
];

/** Answer one question; `right` false picks a wrong answer. */
function answer(q: HTMLElement & { data?: QuizVariant }, right = true): void {
  const v = q.data!;
  if (v.kind === "mcq") {
    const id = right ? "right" : "wrong1";
    choose(q.querySelector<HTMLInputElement>(`input[value="${id}"]`)!);
  } else if (v.kind === "predict") {
    const input = v.items[0]!.input;
    type(
      q.querySelector<HTMLInputElement>("input")!,
      right && input.type === "number" ? String(input.answer) : "99",
    );
  } else if (v.kind === "spot-the-error") {
    const line = right ? v.rounds[0]!.answers[0]!.line : 1;
    q.querySelector<HTMLElement>(`[data-key="L${line}"]`)!.click();
  } else if (v.kind === "sort") {
    for (const item of v.items) {
      const select = q.querySelector<HTMLSelectElement>(`[data-item="${item.id}"] select`)!;
      type(select, right ? item.bin : item.bin === "fasta" ? "fastq" : "fasta");
    }
  }
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const submit = (host: HTMLElement) => host.querySelector<HTMLButtonElement>(".quiz-submit")!.click();

describe("the quiz page", () => {
  test("Reference card, six quiz-mode cards with no actions or feedback, and the status line", async () => {
    const host = await show();
    const reference = host.querySelector<HTMLDetailsElement>(".quiz-reference")!;
    expect(reference.open).toBe(true);
    expect(reference.querySelector("summary")?.textContent?.trim()).toBe("Reference card");
    expect(reference.querySelector(".quiz-formula-note")?.textContent).toBe("p is 0-based.");
    expect([...reference.querySelectorAll("tbody tr")].map((r) => r.textContent)).toEqual(["#2", "I40"]);
    const qs = questions(host);
    expect(qs.map((q) => q.querySelector(".card-overline")?.textContent)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `Question ${n} of 6`),
    );
    expect(qs.map((q) => q.dataset.mode)).toEqual(Array(6).fill("quiz"));
    expect(host.querySelectorAll(".card-actions")).toHaveLength(0);
    // Quiz cards have no Check button (D-30), so no how-to line may point at one.
    const howTos = qs.map((q) => q.querySelector(".card-howto")?.textContent ?? "");
    expect(
      howTos.every((t) => t !== "" && !/\bCheck\b/.test(t)),
      howTos.join(" | "),
    ).toBe(true);
    expect(howTos[1]).toBe("Choose one answer.");
    expect(qs[0]!.querySelector("h2.exercise-title")?.textContent).toBe("Which line stops indexing?");
    expect(host.querySelector(".quiz-status")?.textContent).toBe("Answered 0 of 6");
    answer(qs[1]!);
    await flush();
    expect(host.querySelector(".quiz-status")?.textContent).toBe("Answered 1 of 6");
    expect(host.querySelector(".mcq-result:not([hidden])")).toBeNull();
  });

  test("unanswered questions need a confirmation; then they count as incorrect", async () => {
    const host = await show();
    const qs = questions(host);
    for (const q of qs.slice(0, 4)) answer(q);
    submit(host);
    const confirm = host.querySelector<HTMLElement>(".quiz-confirm")!;
    expect(confirm.hidden).toBe(false);
    expect(confirm.textContent).toContain("2 questions are not answered and will count as incorrect.");
    expect(document.activeElement?.textContent).toBe("Submit anyway");
    [...confirm.querySelectorAll("button")].find((b) => b.textContent === "Keep answering")!.click();
    expect(confirm.hidden).toBe(true);
    expect(document.activeElement).toBe(host.querySelector(".quiz-submit"));
    submit(host);
    [...confirm.querySelectorAll("button")].find((b) => b.textContent === "Submit anyway")!.click();
    expect(host.querySelector(".quiz-score-number")?.textContent).toBe("4 / 6");
    expect(qs[4]!.querySelector(".card-verdict")?.textContent?.trim()).toBe("Not quite. Not answered.");
    expect(host.querySelector(".quiz-results-panel")?.textContent).toContain("4 / 6. You need 5 to pass.");
    const links = [...host.querySelectorAll<HTMLAnchorElement>(".quiz-review")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual([
      "#/lesson/fastq-in-the-wild/try-it-which-file-is-this",
      "#/lesson/fastq-reads/recap",
    ]);
  });

  test("a variant's own `tests` overrides its slot's for the Review link", async () => {
    const slots = QUIZ.slots.map((s) =>
      s.id === "6"
        ? {
            ...s,
            variants: s.variants.map((v) => ({ ...v, tests: "random-access#recap" })),
          }
        : s,
    );
    const host = await show({ ...QUIZ, slots });
    const qs = questions(host);
    qs.forEach((q, i) => answer(q, i !== 5));
    submit(host);
    const links = [...host.querySelectorAll<HTMLAnchorElement>(".quiz-review")].map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toEqual(["#/lesson/random-access/recap"]);
  });

  test("a pass: every card graded once, focus on the results heading, Passed, the record kept", async () => {
    const host = await show();
    const submitted = vi.fn();
    host.addEventListener("gf:quizsubmitted", (e) => submitted((e as CustomEvent).detail));
    const qs = questions(host);
    qs.forEach((q, i) => answer(q, i !== 2));
    submit(host);
    expect(document.activeElement).toBe(host.querySelector(".quiz-results h2"));
    expect(host.querySelector(".quiz-score-number")?.textContent).toBe("5 / 6");
    expect(host.querySelector(".quiz-results .passed-badge")?.textContent?.trim()).toBe("Passed");
    expect(host.querySelector(".quiz-results-panel")?.textContent).toContain("You passed the Testing quiz.");
    expect(qs[2]!.querySelector(".card-verdict")?.textContent?.trim()).toBe(
      "Not quite. The correct answer is marked, with why each option is right or wrong.",
    );
    expect(qs[2]!.querySelectorAll(".mcq-result:not([hidden])")).toHaveLength(3);
    expect(qs.every((q) => q.dataset.state === "correct" || q.dataset.state === "incorrect")).toBe(true);
    expect(host.querySelector<HTMLElement>(".quiz-submit")!.hidden).toBe(true);
    expect(submitted).toHaveBeenCalledWith({ section: "test", score: 5, of: 6, passed: true });
    const record = store.getQuiz("test")!;
    expect(record).toMatchObject({ best: 5, of: 6, attempts: 1 });
    expect(record.passedAt).not.toBeNull();
    expect(record.current?.submittedAt).toBeDefined();
  });

  test("a retake draws the next variants; a lower score keeps the best and Passed", async () => {
    const host = await show();
    for (const q of questions(host)) answer(q);
    submit(host);
    const passedAt = store.getQuiz("test")!.passedAt;
    host.querySelector<HTMLButtonElement>(".quiz-retake")!.click();
    const qs = questions(host);
    expect(qs.map((q) => q.data!.id)).toEqual([
      "quiz-test/1/b",
      "quiz-test/2/b",
      "quiz-test/3/b",
      "quiz-test/4/b",
      "quiz-test/5/b",
      "quiz-test/6/b",
    ]);
    expect(document.activeElement).toBe(qs[0]!.querySelector(".exercise-title"));
    expect(host.querySelector<HTMLElement>(".quiz-results")!.hidden).toBe(true);
    qs.forEach((q, i) => answer(q, i < 2));
    submit(host);
    expect(host.querySelector(".quiz-score-number")?.textContent).toBe("2 / 6");
    expect(store.getQuiz("test")).toMatchObject({ best: 6, attempts: 2, passedAt });
    expect(host.querySelector(".quiz-best")?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      "Best score: 6 of 6 Passed",
    );
    // A third attempt goes back to the authored variant a, or a generated one for slot 4.
    host.querySelector<HTMLButtonElement>(".quiz-retake")!.click();
    expect(questions(host)[3]!.data!.id).toBe("quiz-test/4/gen");
    expect(questions(host)[0]!.data!.id).toBe("quiz-test/1/a");
  });

  test("an attempt in progress survives a reload with its variants and answers", async () => {
    const first = await show();
    const before = questions(first);
    answer(before[1]!);
    answer(before[4]!);
    await flush();
    const ids = before.map((q) => q.data!.id);
    document.body.replaceChildren();
    const host = await show();
    const qs = questions(host);
    expect(qs.map((q) => q.data!.id)).toEqual(ids);
    expect(qs[1]!.querySelector<HTMLInputElement>('input[value="right"]')!.checked).toBe(true);
    expect(qs[4]!.querySelector<HTMLSelectElement>('[data-item="x"] select')!.value).toBe("fasta");
    expect(host.querySelector(".quiz-status")?.textContent).toBe("Answered 2 of 6");
  });

  test("a quiz with no slots yet says so; a missing quiz is an error", async () => {
    const host = await show({ ...QUIZ, slots: [] });
    expect(host.textContent).toBe("Section quiz: Testing is not built yet.");
    document.body.innerHTML = `<gf-quiz section="nowhere"></gf-quiz>`;
    expect(document.querySelector(".widget-error")?.textContent).toBe('Missing quiz for section "nowhere".');
  });
});

describe("variants, seeds and records", () => {
  test("the seeded RNG repeats; int and pick stay in range", () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    const r = createRng(7);
    for (let i = 0; i < 100; i += 1) {
      const n = r.int(2, 4);
      expect(n >= 2 && n <= 4).toBe(true);
    }
    expect(["x"]).toContain(createRng(1).pick(["x"]));
  });

  test("chooseVariant cycles authored variants and uses the generator after them", () => {
    const s = QUIZ.slots[3]!;
    expect(chooseVariant(s, 1, 9, 3).ref).toBe("quiz-test/4/a");
    expect(chooseVariant(s, 2, 9, 3).ref).toBe("quiz-test/4/b");
    const generated = chooseVariant(s, 3, 9, 3);
    expect(generated.ref).toMatch(/^phred-sum:\d+$/);
    expect(variantFromRef(s, generated.ref)).toEqual(generated.variant);
    expect(chooseVariant(QUIZ.slots[0]!, 3, 9, 0).ref).toBe("quiz-test/1/a");
  });

  test("shuffles keep every option and remap predict choice keys", () => {
    const v: PredictExercise = {
      ...predict("p", 1),
      items: [{ label: "Which?", input: { type: "choice", options: ["a", "b", "c", "d"], answer: [1, 3] } }],
    };
    const shuffled = shuffleVariant(v, createRng(3)) as PredictExercise;
    const input = shuffled.items[0]!.input as { options: string[]; answer: number[] };
    expect([...input.options].sort((x, y) => x.localeCompare(y))).toEqual(["a", "b", "c", "d"]);
    expect(input.answer.map((k) => input.options[k]!).sort((x, y) => x.localeCompare(y))).toEqual(["b", "d"]);
    const m = shuffleVariant(mcq("m", "?"), createRng(3)) as McqExercise;
    expect(m.options.map((o) => o.id).sort((x, y) => x.localeCompare(y))).toEqual([
      "right",
      "wrong1",
      "wrong2",
    ]);
  });

  test("mergeQuizProgress is monotonic: best and attempts max, passedAt earliest", () => {
    const merged = mergeQuizProgress(
      { best: 6, of: 6, passedAt: "2026-10-01", attempts: 1 },
      { best: 2, of: 6, passedAt: null, attempts: 2 },
    );
    expect(merged).toEqual({ best: 6, of: 6, passedAt: "2026-10-01", attempts: 2 });
  });
});
