// gf-quiz, the section quiz page body (docs/PLAN.md 6.1, D-09, D-30, D-36; ux 9.1):
//   - the Reference card (lookup tables only), collapsible, at the top;
//   - six question cards on one page, in quiz mode (no actions, no feedback until submission),
//     answerable in any order, with an "Answered 3 of 6" status line;
//   - one "Submit quiz": unanswered questions count as incorrect after a confirmation; every
//     card is graded once, locks and shows its explanations; focus moves only to the results
//     heading;
//   - results: the score, "Passed" (5 of 6) or the missed questions with "Review:" links built
//     from each slot's `tests` anchor; "Retake quiz" draws the next authored variant of every
//     slot (or fresh generator values) and reshuffles the options;
//   - the record: best score kept, "Passed" permanent, the attempt in progress saved with its
//     answers so a reload redraws it (QuizProgress, merged per D-36).
import { outlineItems, pageById } from "../../content/course.ts";
import { getQuiz } from "../exercises/registry.ts";
import type {
  McqExercise,
  PredictExercise,
  Quiz,
  QuizSlot,
  QuizVariant,
  ReferenceItem,
  Rng,
  SortExercise,
} from "../exercises/types.ts";
import { icon } from "../shell/icons.ts";
import type { QuizAttempt, QuizProgress } from "../shell/progress-types.ts";
import { getProgressStore, type ExerciseCard } from "./card.ts";
import { button, el } from "./dom.ts";
import { inlineNodes } from "./inline.ts";
import { mergeQuizProgress, type QuizProgressStore } from "./quiz-progress.ts";
import "./mcq.ts";
import "./predict.ts";
import "./sort.ts";
import "./spot-the-error.ts";

// ---------------------------------------------------------------------------------------------
// Seeds, variants and shuffles (pure, exported for tests)

/** A seeded random source (mulberry32). Same seed, same sequence. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]!,
  };
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const slotSeed = (seed: number, index: number) => (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;

/**
 * The variant a slot shows on attempt `attempt` (1-based): authored variants cycle; a slot with
 * a generator uses its authored variants first, then fresh generated ones. `ref` is what the
 * attempt records ("quiz-sequences/2.1/a" or "<generator-id>:<seed>").
 */
export function chooseVariant(
  slot: QuizSlot,
  attempt: number,
  seed: number,
  index: number,
): { variant: QuizVariant; ref: string } {
  const authored = slot.variants;
  if (slot.generator && (attempt > authored.length || authored.length === 0)) {
    const s = slotSeed(seed, index);
    return { variant: slot.generator.generate(createRng(s)), ref: `${slot.generator.id}:${s}` };
  }
  const variant = authored[(Math.max(1, attempt) - 1) % authored.length]!;
  return { variant, ref: variant.id };
}

/** Redraw a recorded variant; undefined when the content changed under it. */
export function variantFromRef(slot: QuizSlot, ref: string): QuizVariant | undefined {
  const authored = slot.variants.find((v) => v.id === ref);
  if (authored) return authored;
  const generator = slot.generator;
  if (generator && ref.startsWith(`${generator.id}:`)) {
    const seed = Number(ref.slice(generator.id.length + 1));
    if (Number.isFinite(seed)) return generator.generate(createRng(seed));
  }
  return undefined;
}

/** Shuffle a variant's options (mcq), items (sort) or choice options (predict, keys remapped). */
export function shuffleVariant(variant: QuizVariant, rng: Rng): QuizVariant {
  if (variant.kind === "mcq")
    return { ...variant, options: shuffled(variant.options, rng) } satisfies McqExercise;
  if (variant.kind === "sort" && !variant.ordered)
    return { ...variant, items: shuffled(variant.items, rng) } satisfies SortExercise;
  if (variant.kind === "predict") {
    const items = variant.items.map((item) => {
      if (item.input.type !== "choice") return item;
      const input = item.input;
      const order = shuffled(
        input.options.map((_, i) => i),
        rng,
      );
      const remap = (k: number) => order.indexOf(k);
      return {
        ...item,
        input: {
          ...input,
          options: order.map((i) => input.options[i]!),
          answer: Array.isArray(input.answer) ? input.answer.map(remap) : remap(input.answer),
        },
      };
    });
    return { ...variant, items } satisfies PredictExercise;
  }
  return variant;
}

// ---------------------------------------------------------------------------------------------
// Records

const fallback = new Map<string, QuizProgress>();

function readRecord(section: string): QuizProgress | undefined {
  const store = getProgressStore() as QuizProgressStore;
  return store.getQuiz ? store.getQuiz(section) : fallback.get(section);
}

function writeRecord(section: string, record: QuizProgress): void {
  const store = getProgressStore() as QuizProgressStore;
  if (store.putQuiz) store.putQuiz(section, record);
  else fallback.set(section, mergeQuizProgress(fallback.get(section), record));
}

// ---------------------------------------------------------------------------------------------
// Heading text for "Review:" links

/** Resolves a lesson heading's text; the shell may install one built from the compiled TOCs. */
export type HeadingResolver = (lessonId: string, headingId: string) => string | undefined;
let headingResolver: HeadingResolver | undefined;

/** The shell installs this at boot so "Review:" links read like the lesson's own headings. */
export function setHeadingResolver(resolver: HeadingResolver): void {
  headingResolver = resolver;
}

const humanize = (id: string) => {
  const text = id.replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function reviewLink(doc: Document, tests: string): HTMLAnchorElement {
  const [lessonId = "", headingId = ""] = tests.split("#");
  const heading = headingResolver?.(lessonId, headingId) ?? humanize(headingId);
  const lesson = pageById(lessonId)?.title;
  const link = el(doc, "a", "quiz-review");
  link.href = `#/lesson/${lessonId}${headingId ? `/${headingId}` : ""}`;
  link.textContent = `Review: ${heading}${lesson ? ` (${lesson})` : ""}`;
  return link;
}

// ---------------------------------------------------------------------------------------------
// The element

type QuestionHost = HTMLElement & { data?: QuizVariant; card?: ExerciseCard };

interface Question {
  slot: QuizSlot;
  variant: QuizVariant;
  host: QuestionHost;
}

const now = () => new Date().toISOString();
const newSeed = () => Math.floor(Math.random() * 2 ** 31);

export class QuizElement extends HTMLElement {
  /** Set by tests and the e2e fixture; otherwise the `section` attribute is looked up. */
  data?: Quiz;
  #quiz!: Quiz;
  #questions: Question[] = [];
  #attempt!: QuizAttempt;
  #list!: HTMLOListElement;
  #status!: HTMLParagraphElement;
  #best!: HTMLParagraphElement;
  #submit!: HTMLButtonElement;
  #confirm!: HTMLDivElement;
  #results!: HTMLElement;
  #submitted = false;
  #saveQueued = false;

  connectedCallback(): void {
    if (this.firstElementChild) return;
    const doc = this.ownerDocument;
    const section = this.getAttribute("section") ?? "";
    const quiz = this.data ?? getQuiz(section);
    if (!quiz) {
      const error = el(doc, "p", "widget-error", `Missing quiz for section "${section}".`);
      error.setAttribute("role", "alert");
      this.replaceChildren(error);
      return;
    }
    if (quiz.slots.length === 0) {
      const note = el(doc, "p", "widget-stub", `${quiz.title} is not built yet.`);
      note.setAttribute("role", "note");
      this.replaceChildren(note);
      return;
    }
    this.#quiz = quiz;
    this.#build();
    const record = readRecord(quiz.section);
    const current = record?.current;
    if (current && current.number > 0) this.#start(current);
    else this.#start(this.#newAttempt(record));
  }

  get questions(): readonly Question[] {
    return this.#questions;
  }

  #build(): void {
    const doc = this.ownerDocument;
    const quiz = this.#quiz;
    const root = el(doc, "div", "quiz");
    this.#best = el(doc, "p", "quiz-best");
    this.#best.hidden = true;
    root.append(this.#best);
    if (quiz.referenceCard.items.length) root.append(this.#referenceCard());
    this.#status = el(doc, "p", "quiz-status");
    this.#status.setAttribute("role", "status");
    this.#list = el(doc, "ol", "quiz-questions");
    this.#list.setAttribute("aria-label", "Questions");
    for (const type of ["input", "change", "click", "keyup"]) {
      this.#list.addEventListener(type, () => this.#queueSave());
    }
    const actions = el(doc, "div", "quiz-actions");
    actions.id = `quiz-${quiz.section}-submit`; // the TOC's "Results" entry points here before grading
    this.#submit = button(doc, "Submit quiz", "button-primary quiz-submit", () => this.#onSubmit(false));
    this.#confirm = el(doc, "div", "quiz-confirm");
    this.#confirm.hidden = true;
    actions.append(this.#submit, this.#confirm);
    this.#results = el(doc, "section", "quiz-results");
    this.#results.hidden = true;
    root.append(this.#status, this.#list, actions, this.#results);
    this.replaceChildren(root);
  }

  #referenceCard(): HTMLDetailsElement {
    const doc = this.ownerDocument;
    const card = this.#quiz.referenceCard;
    const details = el(doc, "details", "quiz-reference");
    details.open = true;
    const summary = el(doc, "summary", "quiz-reference-summary");
    summary.innerHTML = icon("book-open");
    summary.append(" ", el(doc, "span", "", card.title));
    details.append(summary);
    const body = el(doc, "div", "quiz-reference-body");
    for (const item of card.items) body.append(this.#referenceItem(item));
    details.append(body);
    return details;
  }

  #referenceItem(item: ReferenceItem): HTMLElement {
    const doc = this.ownerDocument;
    if (item.kind === "text") {
      const p = el(doc, "p", "quiz-reference-text");
      p.append(inlineNodes(item.text, doc));
      return p;
    }
    if (item.kind === "formula") {
      const box = el(doc, "div", "quiz-formula");
      const label = el(doc, "p", "quiz-formula-label");
      label.append(inlineNodes(item.label, doc));
      const formula = el(doc, "p", "quiz-formula-body");
      formula.append(inlineNodes(item.formula, doc));
      box.append(label, formula);
      if (item.note) {
        const note = el(doc, "p", "quiz-formula-note");
        note.append(inlineNodes(item.note, doc));
        box.append(note);
      }
      return box;
    }
    const wrap = el(doc, "div", "table-scroll");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", `Table: ${item.caption}`);
    const table = el(doc, "table", "quiz-reference-table");
    const caption = el(doc, "caption");
    caption.append(inlineNodes(item.caption, doc));
    const headRow = el(doc, "tr");
    for (const column of item.columns) {
      const th = el(doc, "th");
      th.scope = "col";
      th.append(inlineNodes(column, doc));
      headRow.append(th);
    }
    const thead = el(doc, "thead");
    thead.append(headRow);
    const tbody = el(doc, "tbody");
    for (const row of item.rows) {
      const tr = el(doc, "tr");
      for (const cell of row) {
        const td = el(doc, "td");
        td.append(inlineNodes(cell, doc));
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(caption, thead, tbody);
    wrap.append(table);
    return wrap;
  }

  #newAttempt(record: QuizProgress | undefined): QuizAttempt {
    const number = (record?.attempts ?? 0) + 1;
    const seed = newSeed();
    const variants: Record<string, string> = {};
    this.#quiz.slots.forEach((slot, i) => {
      variants[slot.id] = chooseVariant(slot, number, seed, i).ref;
    });
    return { startedAt: now(), number, seed, variants, answers: {} };
  }

  /** Draw an attempt: its variants, shuffled by its seed, and any saved answers. */
  #start(attempt: QuizAttempt): void {
    const doc = this.ownerDocument;
    const quiz = this.#quiz;
    this.#attempt = attempt;
    this.#submitted = false;
    this.#results.hidden = true;
    this.#confirm.hidden = true;
    this.#submit.hidden = false;
    const total = quiz.slots.length;
    this.#questions = quiz.slots.map((slot, i) => {
      const ref = attempt.variants[slot.id];
      let variant = ref ? variantFromRef(slot, ref) : undefined;
      if (!variant) {
        const chosen = chooseVariant(slot, attempt.number, attempt.seed, i);
        variant = chosen.variant;
        attempt.variants[slot.id] = chosen.ref;
      }
      variant = shuffleVariant(variant, createRng(slotSeed(attempt.seed ^ 0x5bd1e995, i)));
      const host = doc.createElement(`gf-${variant.kind}`) as QuestionHost;
      host.id = `quiz-${quiz.section}--q${i + 1}`;
      host.dataset.mode = "quiz";
      host.dataset.overline = `Question ${i + 1} of ${total}`;
      host.dataset.slot = slot.id;
      const title = el(doc, "h2", "exercise-title", variant.title);
      title.tabIndex = -1;
      host.append(title);
      host.data = variant;
      return { slot, variant, host };
    });
    this.#list.replaceChildren(
      ...this.#questions.map(({ host }) => {
        const li = el(doc, "li", "quiz-question");
        li.append(host);
        return li;
      }),
    );
    for (const { slot, host } of this.#questions) {
      const answer = attempt.answers[slot.id];
      if (answer !== undefined && host.card) {
        host.card.restore({ state: "idle", attempts: 0, firstTry: false, revealed: false, answer });
      }
    }
    this.#renderBest();
    this.#updateStatus();
    if (attempt.submittedAt) this.#grade(false);
  }

  #queueSave(): void {
    if (this.#saveQueued || this.#submitted) return;
    this.#saveQueued = true;
    queueMicrotask(() => {
      this.#saveQueued = false;
      if (this.#submitted) return;
      this.#updateStatus();
      for (const { slot, host } of this.#questions) {
        const answer = host.card?.answer();
        if (answer !== undefined) this.#attempt.answers[slot.id] = answer;
      }
      const record = readRecord(this.#quiz.section);
      writeRecord(this.#quiz.section, {
        best: record?.best ?? 0,
        of: this.#quiz.slots.length,
        passedAt: record?.passedAt ?? null,
        attempts: record?.attempts ?? 0,
        current: this.#attempt,
      });
    });
  }

  #answeredCount(): number {
    return this.#questions.filter((q) => q.host.card?.hasAnswer()).length;
  }

  #updateStatus(): void {
    const n = this.#questions.length;
    this.#status.textContent = `Answered ${this.#answeredCount()} of ${n}`;
  }

  #renderBest(): void {
    const doc = this.ownerDocument;
    const record = readRecord(this.#quiz.section);
    this.#best.replaceChildren();
    if (!record || record.attempts === 0) {
      this.#best.hidden = true;
      return;
    }
    this.#best.hidden = false;
    this.#best.append(`Best score: ${record.best} of ${record.of}`);
    if (record.passedAt) {
      this.#best.append(" ");
      this.#best.append(this.#passedBadge(doc));
    }
  }

  #passedBadge(doc: Document): HTMLSpanElement {
    const badge = el(doc, "span", "passed-badge");
    badge.innerHTML = icon("badge-check");
    badge.append(" Passed");
    return badge;
  }

  #onSubmit(confirmed: boolean): void {
    if (this.#submitted) return;
    const doc = this.ownerDocument;
    const unanswered = this.#questions.length - this.#answeredCount();
    if (unanswered > 0 && !confirmed) {
      const text = el(
        doc,
        "p",
        "quiz-confirm-text",
        `${unanswered} ${unanswered === 1 ? "question is" : "questions are"} not answered and will count as incorrect. Submit anyway?`,
      );
      const yes = button(doc, "Submit anyway", "button-primary", () => this.#onSubmit(true));
      const no = button(doc, "Keep answering", "button-secondary", () => {
        this.#confirm.hidden = true;
        this.#submit.focus();
      });
      this.#confirm.replaceChildren(text, yes, no);
      this.#confirm.hidden = false;
      yes.focus();
      return;
    }
    this.#grade(true);
  }

  /** Grade every card once. `record`: false when redrawing an attempt submitted earlier. */
  #grade(record: boolean): void {
    const quiz = this.#quiz;
    this.#submitted = true;
    this.#confirm.hidden = true;
    this.#submit.hidden = true;
    const missed: Question[] = [];
    let score = 0;
    for (const q of this.#questions) {
      if (q.host.card?.submit()) score += 1;
      else missed.push(q);
    }
    const passed = score >= quiz.passMark;
    if (record) {
      const at = now();
      for (const { slot, host } of this.#questions) {
        const answer = host.card?.answer();
        if (answer !== undefined) this.#attempt.answers[slot.id] = answer;
      }
      this.#attempt.submittedAt = at;
      this.#attempt.score = score;
      const previous = readRecord(quiz.section);
      writeRecord(quiz.section, {
        best: Math.max(previous?.best ?? 0, score),
        of: quiz.slots.length,
        passedAt: previous?.passedAt ?? (passed ? at : null),
        attempts: (previous?.attempts ?? 0) + 1,
        current: this.#attempt,
      });
      this.dispatchEvent(
        new CustomEvent("gf:quizsubmitted", {
          bubbles: true,
          detail: { section: quiz.section, score, of: quiz.slots.length, passed },
        }),
      );
    }
    this.#renderResults(score, passed, missed);
    this.#renderBest();
    if (record) this.#results.querySelector<HTMLElement>("h2")?.focus();
  }

  #renderResults(score: number, passed: boolean, missed: Question[]): void {
    const doc = this.ownerDocument;
    const quiz = this.#quiz;
    const n = quiz.slots.length;
    const heading = el(doc, "h2", "quiz-results-title", "Results");
    heading.id = `quiz-${quiz.section}-results`;
    heading.tabIndex = -1;
    this.#results.setAttribute("aria-labelledby", heading.id);
    const score_ = el(doc, "p", "quiz-score");
    score_.append(
      el(doc, "span", "visually-hidden", "Score: "),
      el(doc, "span", "quiz-score-number", `${score} / ${n}`),
    );
    const panel = el(doc, "div", "quiz-results-panel");
    panel.dataset.tone = passed ? "success" : "neutral";
    const record = readRecord(quiz.section);
    const name = quiz.title.replace(/^Section quiz:\s*/, "");
    if (passed) {
      panel.append(this.#passedBadge(doc), el(doc, "p", "", `You passed the ${name} quiz.`));
      const next = this.#nextItem();
      if (next) {
        const link = el(doc, "a", "button-link button-primary", `Next: ${next.title}`);
        link.href = next.route;
        panel.append(link);
      }
    } else {
      panel.append(el(doc, "p", "", `${score} / ${n}. You need ${quiz.passMark} to pass.`));
    }
    if (missed.length) {
      panel.append(
        el(
          doc,
          "p",
          "quiz-missed-title",
          missed.length === 1 ? "Question to review:" : "Questions to review:",
        ),
      );
      const list = el(doc, "ul", "quiz-missed");
      for (const q of missed) {
        const li = el(doc, "li");
        const index = this.#questions.indexOf(q) + 1;
        const jump = el(doc, "a", "", `Question ${index}`);
        jump.href = "#";
        jump.addEventListener("click", (event) => {
          event.preventDefault();
          q.host.scrollIntoView?.({ block: "start" });
          q.host.querySelector<HTMLElement>(".exercise-title")?.focus();
        });
        li.append(jump, ": ", reviewLink(doc, q.slot.tests));
        list.append(li);
      }
      panel.append(list);
    }
    if (record && record.attempts > 0) {
      panel.append(el(doc, "p", "quiz-best-line", `Best score: ${record.best} of ${record.of}.`));
    }
    const retake = button(
      doc,
      "Retake quiz",
      "button-secondary quiz-retake",
      () => this.#retake(),
      "rotate-ccw",
    );
    this.#results.replaceChildren(heading, score_, panel, retake);
    this.#results.hidden = false;
  }

  #nextItem(): { title: string; route: string } | undefined {
    const index = outlineItems.findIndex((p) => p.kind === "quiz" && p.section === this.#quiz.section);
    const next = index >= 0 ? outlineItems.slice(index + 1).find((p) => p.status === "built") : undefined;
    return next ? { title: next.title, route: next.route } : undefined;
  }

  #retake(): void {
    const record = readRecord(this.#quiz.section);
    const attempt = this.#newAttempt(record);
    writeRecord(this.#quiz.section, {
      best: record?.best ?? 0,
      of: this.#quiz.slots.length,
      passedAt: record?.passedAt ?? null,
      attempts: record?.attempts ?? 0,
      current: attempt,
    });
    this.#start(attempt);
    this.#questions[0]?.host.querySelector<HTMLElement>(".exercise-title")?.focus();
  }
}

if (!customElements.get("gf-quiz")) customElements.define("gf-quiz", QuizElement);
