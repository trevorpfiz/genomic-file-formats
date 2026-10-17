// gf-fix-it (docs/PLAN.md 7.2, D-26; ux 8.7): edit a snippet until the live validator finds no
// errors and every goal passes. A native textarea sits over a highlight overlay that draws
// whitespace markers, wavy underlines and an error gutter without changing any character's
// width, so the two stay aligned:
//
//   <div class="fixit">
//     <div class="fixit-head"> filename, badge, problem pill, Insert tab, Whitespace </div>
//     <div class="fixit-editor" data-whitespace="on">
//       <div class="fixit-gutter" aria-hidden="true"> line numbers and problem icons </div>
//       <div class="fixit-surface">
//         <pre class="fixit-overlay" aria-hidden="true"> marked copy of the text </pre>
//         <textarea class="fixit-input"> (transparent text, visible caret) </textarea>
//       </div>
//     </div>
//     goals checklist, Problems list (Go to line), the solution diff after "Show solution"
//
// Tab inserts a TAB; Esc then Tab leaves the editor (stated in the how-to line, WCAG 2.1.2);
// "Insert tab" serves touch keyboards. Validation is debounced at 250 ms and uses runtime rules
// only (src/validators/runtime); input is capped at the validators' snippet scope. Live
// validation never moves focus. It is announced when the text becomes valid and whenever the
// valid text's summary changes (a warning or an unmet goal), never "No problems found." while a
// warning remains. The pill and the Problems heading count errors as problems and warnings as
// warnings, in the same words.
import type { Diagnostic } from "../validators/types.ts";
import type { FixItExercise } from "../exercises/types.ts";
import { FORMAT_NAMES } from "../formats/names.ts";
import { icon, type IconName } from "../shell/icons.ts";
import {
  checkGoals,
  formatDiagnostic,
  RUNTIME_VALIDATORS,
  SNIPPET_LIMITS,
  validateRuntime,
  withinSnippetLimits,
  type GoalResult,
} from "../validators/runtime/index.ts";
import { ExerciseCard, resolveExercise, type ExerciseHost } from "./card.ts";
import { button, el, uid } from "./dom.ts";
import { composeHooks, followUpsFor, type FollowUpSet } from "./follow-ups.ts";
import { inlineNodes } from "./inline.ts";
import { codePoint, markText, SUSPECT_CHARS, trailingStart } from "./text-marks.ts";
import { displayFilename, toggleButton } from "./viewer-chrome.ts";

const DEBOUNCE_MS = 250;
const ANNOUNCE_MS = 1000;
const CAP_MESSAGE = "This exercise checks small snippets; use real tools for whole files.";

/** Characters that copy-paste and smart punctuation slip in; flagged as warnings (7.2). */
export function typingProblems(text: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  text.split("\n").forEach((line, i) => {
    let col = 0;
    for (const ch of line) {
      col += 1;
      const name = SUSPECT_CHARS[ch];
      if (!name) continue;
      out.push({
        rule: "",
        severity: "warning",
        verdict: "none",
        line: i + 1,
        col,
        message: `Line ${i + 1}, column ${col}: a ${name} (${codePoint(ch)}). Type a plain character instead; tools treat this one as different text.`,
        spec: "",
      });
    }
  });
  return out;
}

/** A line-level diff (longest common subsequence), for "Show solution". */
export function diffLines(from: string, to: string): { op: " " | "-" | "+"; text: string }[] {
  const a = from.replace(/\n$/, "").split("\n");
  const b = to.replace(/\n$/, "").split("\n");
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0));
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: { op: " " | "-" | "+"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: " ", text: a[i]! });
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: "-", text: a[i]! });
      i += 1;
    } else {
      out.push({ op: "+", text: b[j]! });
      j += 1;
    }
  }
  while (i < n) out.push({ op: "-", text: a[i++]! });
  while (j < m) out.push({ op: "+", text: b[j++]! });
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface Result {
  capped: boolean;
  diagnostics: Diagnostic[];
  goals: GoalResult[];
}

export class FixItElement extends HTMLElement {
  data?: FixItExercise;
  card?: ExerciseCard<FixItExercise>;
  /** The editor, for tests and the e2e geometry check. */
  textarea?: HTMLTextAreaElement;

  #exercise!: FixItExercise;
  #area!: HTMLTextAreaElement;
  #overlay!: HTMLPreElement;
  #gutter!: HTMLDivElement;
  #pill!: HTMLSpanElement;
  #insertTab!: HTMLButtonElement;
  #problems!: HTMLUListElement;
  #problemsTitle!: HTMLParagraphElement;
  #notice!: HTMLParagraphElement;
  #goals!: HTMLUListElement;
  #diff!: HTMLDivElement;
  #result: Result = { capped: false, diagnostics: [], goals: [] };
  #timer: ReturnType<typeof setTimeout> | undefined;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  /** The last validity summary announced; "" while the text is invalid. */
  #announced = "";
  #escArmed = false;
  #hasValidator = false;

  connectedCallback(): void {
    if (this.card) return;
    const exercise = resolveExercise(this as ExerciseHost, "fix-it");
    if (!exercise) return;
    this.#exercise = exercise;
    this.#hasValidator = Boolean(RUNTIME_VALIDATORS[exercise.validation.format]);
    const ui = this.#build();
    let followUps: FollowUpSet | undefined;
    const card = new ExerciseCard(
      this,
      exercise,
      composeHooks(
        {
          check: () => this.#check(),
          reveal: () => this.#reveal(),
          reset: () => {
            this.#setText(exercise.starter.text ?? "");
            this.#diff.hidden = true;
            this.#announced = "";
          },
          restore: (record) => {
            if (typeof record.answer === "string") this.#setText(record.answer);
            if (record.state === "revealed") this.#showDiff();
          },
          answer: () => this.#area.value,
          lock: (locked) => {
            this.#area.readOnly = locked;
            this.#insertTab.disabled = locked;
            ui.dataset.locked = String(locked);
          },
          hasAnswer: () => this.#area.value !== (exercise.starter.text ?? ""),
          focusFirst: () => this.#area.focus(),
        },
        () => followUps,
      ),
    );
    this.card = card;
    card.body.append(ui);
    followUps = followUpsFor(card, exercise.followUps);
    this.#setText(exercise.starter.text ?? "");
    card.ready();
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
    clearTimeout(this.#announceTimer);
  }

  // --- UI -------------------------------------------------------------------------------------

  #build(): HTMLDivElement {
    const doc = this.ownerDocument;
    const ex = this.#exercise;
    const root = el(doc, "div", "fixit");
    const head = el(doc, "div", "fixit-head");
    const name = el(doc, "span", "snippet-filename", displayFilename(ex.starter));
    name.id = uid("fixit-name");
    const badge = el(doc, "span", "snippet-badge", FORMAT_NAMES[ex.starter.format]);
    this.#pill = el(doc, "span", "fixit-pill");
    this.#pill.id = uid("fixit-pill");
    this.#insertTab = button(doc, "Insert tab", "button-toggle", () => this.#insert("\t"));
    const tools = el(doc, "span", "fixit-tools");
    const editor = el(doc, "div", "fixit-editor");
    editor.dataset.whitespace = "on";
    tools.append(
      this.#insertTab,
      toggleButton(doc, "Whitespace", true, (on) => {
        editor.dataset.whitespace = on ? "on" : "off";
      }),
    );
    head.append(name, badge, this.#pill, tools);

    this.#gutter = el(doc, "div", "fixit-gutter");
    this.#gutter.setAttribute("aria-hidden", "true");
    const surface = el(doc, "div", "fixit-surface");
    this.#overlay = el(doc, "pre", "fixit-overlay");
    this.#overlay.setAttribute("aria-hidden", "true");
    const area = el(doc, "textarea", "fixit-input");
    area.id = uid("fixit-input");
    area.wrap = "off";
    area.spellcheck = false;
    area.autocomplete = "off";
    area.setAttribute("autocapitalize", "off");
    area.setAttribute("autocorrect", "off");
    area.setAttribute("aria-label", `Editor: ${displayFilename(ex.starter)}`);
    area.setAttribute("aria-describedby", this.#pill.id);
    area.maxLength = SNIPPET_LIMITS.bytes;
    this.#area = area;
    this.textarea = area;
    surface.append(this.#overlay, area);
    editor.append(this.#gutter, surface);

    area.addEventListener("input", () => {
      this.card?.markAttempted();
      this.#draw();
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.#validate(true), DEBOUNCE_MS);
    });
    area.addEventListener("scroll", () => this.#syncScroll());
    area.addEventListener("keydown", (event) => this.#onKey(event));

    const goalsBox = el(doc, "div", "fixit-goals");
    goalsBox.append(el(doc, "p", "fixit-subhead", "Goals"));
    this.#goals = el(doc, "ul", "fixit-goal-list");
    goalsBox.append(this.#goals);
    goalsBox.hidden = ex.goals.length === 0;

    const problemsBox = el(doc, "div", "fixit-problems");
    this.#problemsTitle = el(doc, "p", "fixit-subhead", "Problems");
    this.#notice = el(doc, "p", "fixit-notice");
    this.#notice.hidden = true;
    this.#problems = el(doc, "ul", "fixit-problem-list");
    problemsBox.append(this.#problemsTitle, this.#notice, this.#problems);

    this.#diff = el(doc, "div", "fixit-diff");
    this.#diff.hidden = true;
    root.append(head, editor, goalsBox, problemsBox, this.#diff);
    return root;
  }

  #setText(text: string): void {
    this.#area.value = text;
    this.#draw();
    this.#validate(false);
  }

  #syncScroll(): void {
    this.#overlay.scrollTop = this.#area.scrollTop;
    this.#overlay.scrollLeft = this.#area.scrollLeft;
    this.#gutter.scrollTop = this.#area.scrollTop;
  }

  #onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      this.#escArmed = true;
      return;
    }
    if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (this.#escArmed || this.#area.readOnly) {
        this.#escArmed = false;
        return; // the browser moves focus on
      }
      event.preventDefault();
      this.#insert("\t");
      return;
    }
    if (event.key !== "Shift") this.#escArmed = false;
  }

  /** Insert text at the caret, keeping the browser's undo history where it can. */
  #insert(text: string): void {
    const area = this.#area;
    if (area.readOnly) return;
    area.focus();
    let ok = false;
    try {
      ok = this.ownerDocument.execCommand?.("insertText", false, text) ?? false;
    } catch {
      ok = false;
    }
    if (!ok) {
      area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  // --- Validation and drawing -----------------------------------------------------------------

  #validate(live: boolean): Result {
    clearTimeout(this.#timer);
    const ex = this.#exercise;
    const text = this.#area.value;
    const capped = !withinSnippetLimits(text);
    const diagnostics = capped ? [] : this.#hasValidator ? validateRuntime(ex.validation, text) : [];
    if (!capped) {
      const taken = new Set(diagnostics.map((d) => `${d.line}:${d.col ?? 0}`));
      for (const t of typingProblems(text)) if (!taken.has(`${t.line}:${t.col}`)) diagnostics.push(t);
      diagnostics.sort((a, b) => a.line - b.line || (a.col ?? 0) - (b.col ?? 0));
    }
    const goals = capped ? [] : checkGoals(ex.goals, text, ex.validation.context);
    this.#result = { capped, diagnostics, goals };
    this.#draw();
    this.#renderPanels();
    const valid = !capped && !diagnostics.some((d) => d.severity === "error");
    const summary = valid ? this.#validSummary() : "";
    if (live && valid && summary !== this.#announced) {
      clearTimeout(this.#announceTimer);
      this.#announceTimer = setTimeout(() => this.card?.announce(summary), ANNOUNCE_MS);
    }
    if (!valid) clearTimeout(this.#announceTimer);
    this.#announced = summary;
    return this.#result;
  }

  /** What live validation announces for valid text: warnings and unmet goals included. */
  #validSummary(): string {
    const { diagnostics, goals } = this.#result;
    const format = FORMAT_NAMES[this.#exercise.validation.format];
    const head = diagnostics.length
      ? `Valid ${format}, ${plural(diagnostics.length, "warning")}.`
      : "No problems found.";
    const unmet = goals.filter((g) => !g.passed).length;
    return unmet ? `${head} ${plural(unmet, "goal")} not met.` : head;
  }

  /** Redraw the overlay and gutter for the current text with the last validation's marks. */
  #draw(): void {
    const doc = this.ownerDocument;
    const lines = this.#area.value.split("\n");
    const byLine = new Map<number, Diagnostic[]>();
    for (const d of this.#result.diagnostics) {
      const n = Math.min(Math.max(d.line, 1), lines.length);
      byLine.set(n, [...(byLine.get(n) ?? []), d]);
    }
    const overlay: (Node | string)[] = [];
    const gutter: Node[] = [];
    lines.forEach((text, i) => {
      const n = i + 1;
      const diags = byLine.get(n) ?? [];
      const ranges = diags
        .filter((d) => d.col !== undefined && d.col - 1 < text.length)
        .map((d) => {
          const start = d.col! - 1;
          let end = start + 1;
          if (d.found && text.startsWith(d.found, start)) end = start + Math.max(1, d.found.length);
          else while (end < text.length && text[end] !== "\t" && text[end] !== " ") end += 1;
          return { start, end, severity: d.severity };
        })
        .sort((a, b) => a.start - b.start);
      const line = el(doc, "span", "fixit-line");
      const trailing = trailingStart(text);
      let at = 0;
      for (const r of ranges) {
        if (r.start < at) continue;
        if (r.start > at)
          line.append(
            markText(doc, text.slice(at, r.start), {
              offset: at,
              trailingFrom: trailing,
              suspects: "inline",
            }),
          );
        const mark = el(doc, "mark", `fixit-mark fixit-mark-${r.severity === "error" ? "error" : "warning"}`);
        mark.append(
          markText(doc, text.slice(r.start, r.end), {
            offset: r.start,
            trailingFrom: trailing,
            suspects: "inline",
          }),
        );
        line.append(mark);
        at = r.end;
      }
      if (at < text.length)
        line.append(
          markText(doc, text.slice(at), { offset: at, trailingFrom: trailing, suspects: "inline" }),
        );
      const worst = diags.some((d) => d.severity === "error") ? "error" : diags.length ? "warning" : "";
      if (worst && ranges.length === 0) line.classList.add(`fixit-line-${worst}`);
      if (i > 0) overlay.push("\n");
      overlay.push(line);
      const g = el(doc, "div", "fixit-gutter-line");
      if (worst) {
        g.dataset.severity = worst;
        g.innerHTML = icon(worst === "error" ? "circle-x" : "triangle-alert");
      }
      g.append(el(doc, "span", "fixit-ln", String(n)));
      gutter.push(g);
    });
    overlay.push(" "); // keeps a final empty line as tall as the textarea's
    this.#overlay.replaceChildren(...overlay);
    this.#gutter.replaceChildren(...gutter);
    this.#area.rows = Math.min(Math.max(lines.length + 1, 4), 18);
    this.#syncScroll();
  }

  #renderPanels(): void {
    const doc = this.ownerDocument;
    const { capped, diagnostics, goals } = this.#result;
    const errors = diagnostics.filter((d) => d.severity === "error");
    const warnings = diagnostics.filter((d) => d.severity !== "error");
    const format = FORMAT_NAMES[this.#exercise.validation.format];
    let pill: { text: string; icon: IconName; tone: string };
    if (capped) pill = { text: "Too long to check", icon: "info", tone: "neutral" };
    else if (!this.#hasValidator) pill = { text: "No live checks", icon: "info", tone: "neutral" };
    else if (errors.length)
      pill = {
        text: `${plural(errors.length, "problem")}${warnings.length ? `, ${plural(warnings.length, "warning")}` : ""}`,
        icon: "circle-x",
        tone: "error",
      };
    else if (warnings.length)
      pill = {
        text: `Valid ${format}, ${plural(warnings.length, "warning")}`,
        icon: "triangle-alert",
        tone: "warning",
      };
    else pill = { text: `Valid ${format}`, icon: "circle-check", tone: "success" };
    this.#pill.innerHTML = icon(pill.icon);
    this.#pill.append(" ", pill.text);
    this.#pill.dataset.tone = pill.tone;

    this.#notice.hidden = !(capped || !this.#hasValidator);
    this.#notice.textContent = capped
      ? CAP_MESSAGE
      : "Live checks are not available for this format; Check compares your text with a model answer.";
    // The same words as the pill: errors are problems, warnings are warnings.
    const counts = [
      ...(errors.length || !warnings.length ? [`Problems${errors.length ? ` (${errors.length})` : ""}`] : []),
      ...(warnings.length ? [`Warnings (${warnings.length})`] : []),
    ];
    this.#problemsTitle.textContent = counts.join(" · ");
    const items = diagnostics.map((d) => {
      const li = el(doc, "li", "fixit-problem");
      li.dataset.severity = d.severity === "error" ? "error" : "warning";
      const mark = el(doc, "span", "fixit-problem-icon");
      mark.innerHTML = icon(d.severity === "error" ? "circle-x" : "triangle-alert");
      const text = el(doc, "span", "fixit-problem-text");
      text.append(el(doc, "span", "visually-hidden", d.severity === "error" ? "Error: " : "Warning: "));
      text.append(inlineNodes(d.rule ? formatDiagnostic(d) : d.message, doc));
      const go = button(doc, `Go to line ${d.line}`, "button-text fixit-goto", () => this.#goTo(d));
      li.append(mark, text, go);
      return li;
    });
    if (!items.length && !capped && this.#hasValidator)
      items.push(el(doc, "li", "fixit-problem-none", "No problems found."));
    this.#problems.replaceChildren(...items);

    this.#goals.replaceChildren(
      ...goals.map((g) => {
        const li = el(doc, "li", "fixit-goal");
        li.dataset.passed = String(g.passed);
        li.innerHTML = icon(g.passed ? "circle-check" : "circle");
        li.append(" ");
        li.append(inlineNodes(g.text, doc));
        li.append(el(doc, "span", "visually-hidden", g.passed ? ": met" : ": not met yet"));
        return li;
      }),
    );
  }

  /** Move the caret to a problem (Enter or click on its Go to button). */
  #goTo(d: Diagnostic): void {
    const lines = this.#area.value.split("\n");
    let pos = 0;
    for (let i = 0; i < Math.min(d.line - 1, lines.length - 1); i += 1) pos += lines[i]!.length + 1;
    pos += Math.max(0, (d.col ?? 1) - 1);
    this.#area.focus();
    this.#area.setSelectionRange(pos, pos);
  }

  // --- Check and Show solution ---------------------------------------------------------------

  #check() {
    const ex = this.#exercise;
    const { capped, diagnostics, goals } = this.#validate(false);
    if (capped) return { result: "incomplete" as const, message: CAP_MESSAGE };
    if (!this.#hasValidator) {
      const same = this.#area.value.replace(/\n+$/, "") === ex.solution.replace(/\n+$/, "");
      return same
        ? { result: "correct" as const, message: "Your text matches a valid answer." }
        : { result: "incorrect" as const, message: "Your text does not match a valid answer yet." };
    }
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length) {
      return {
        result: "incorrect" as const,
        message: `${plural(errors.length, "problem")} ${errors.length === 1 ? "remains" : "remain"}. First: ${errors[0]!.message}`,
      };
    }
    const failed = goals.filter((g) => !g.passed);
    if (failed.length) {
      return {
        result: "incorrect" as const,
        message: `The text is valid, but ${failed.length === 1 ? "a goal is" : `${failed.length} goals are`} not met: ${failed[0]!.text.replace(/\.?$/, ".")}`,
      };
    }
    const format = FORMAT_NAMES[ex.validation.format];
    const warning = diagnostics.find((d) => d.severity === "warning" && d.rule);
    return {
      result: "correct" as const,
      message: `Valid ${format}.${goals.length ? ` ${goals.length === 1 ? "The goal is" : `All ${goals.length} goals are`} met.` : ""}`,
      explanation: warning
        ? `A warning remains, which does not block: ${formatDiagnostic(warning)}`
        : undefined,
    };
  }

  #reveal() {
    this.#showDiff();
    return { message: "Here is a minimal valid answer, compared with your text." };
  }

  #showDiff(): void {
    const doc = this.ownerDocument;
    const ex = this.#exercise;
    const rows = diffLines(this.#area.value, ex.solution).map(({ op, text }) => {
      const row = el(doc, op === "-" ? "del" : op === "+" ? "ins" : "div", "fixit-diff-line");
      row.dataset.op = op === "-" ? "removed" : op === "+" ? "added" : "same";
      const sign = el(doc, "span", "fixit-diff-op", op);
      sign.setAttribute("aria-hidden", "true");
      row.append(sign);
      if (op !== " ") row.append(el(doc, "span", "visually-hidden", op === "-" ? "Removed: " : "Added: "));
      const body = el(doc, "span", "fixit-diff-text");
      body.append(
        text === ""
          ? el(doc, "span", "fixit-diff-empty", "(empty line)")
          : markText(doc, text, { trailingFrom: trailingStart(text) }),
      );
      row.append(body);
      return row;
    });
    const list = el(doc, "div", "fixit-diff-body");
    list.dataset.whitespace = "on";
    list.append(...rows);
    const use = button(doc, "Use this solution", "button-secondary", () => {
      this.#setText(ex.solution);
      this.card?.announce("The solution is now in the editor.");
    });
    const title = el(doc, "p", "fixit-subhead", "Solution compared with your text");
    const legend = el(
      doc,
      "p",
      "fixit-diff-legend",
      "Lines marked - were removed; lines marked + were added.",
    );
    this.#diff.replaceChildren(title, legend, list, use);
    this.#diff.hidden = false;
  }
}

if (!customElements.get("gf-fix-it")) customElements.define("gf-fix-it", FixItElement);
