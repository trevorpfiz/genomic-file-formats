// Building blocks the simulator views share (docs/PLAN.md 7.5; ux 8.10): the state hook that
// detects goals and offers "Show me", the goal list, the readout with its debounced live
// region, the text view, preset chips and a number field. Each island lays out controls, then
// the visualization, then the readout, the text view and the goals.
import type { ComponentChildren } from "preact";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { SimulatorGoal } from "../../exercises/types.ts";
import { icon, type IconName } from "../../shell/icons.ts";
import { REVEAL_POLICY } from "../card.ts";
import { inlineHtml } from "../inline.ts";
import type { GoalOutcome, SimulatorModel, SimulatorViewProps, TextView } from "./types.ts";
import "./simulators.css";

export type GoalStatus = "pending" | GoalOutcome;

export interface GoalItem {
  goal: SimulatorGoal;
  status: GoalStatus;
  /** "Show me" is offered: 2 tries without meeting the goal (REVEAL_POLICY.simulator). */
  canShow: boolean;
}

/** Readouts wait this long before the live region speaks (ux 8.10). */
export const READOUT_DELAY_MS = 500;

/** A data string without its inline marks, for live regions and aria text. */
export const plain = (text: string): string =>
  text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/\^\{([^}]*)\}/g, "^$1");

/** Inline marks (`code`, *italic*, **bold**) rendered into an element. */
export function Marked({ text, class: className, id }: { text: string; class?: string; id?: string }) {
  return <span class={className} id={id} dangerouslySetInnerHTML={{ __html: inlineHtml(text) }} />;
}

export function Icon({ name, class: className }: { name: IconName; class?: string }) {
  return (
    <span
      class={className ?? "sim-icon"}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon(name) }}
    />
  );
}

/**
 * The island's state: the model's state plus goal detection. A goal is reported once, the
 * first time its check holds. Any dispatch marks the card attempted; `dispatch(action, false)`
 * does not count a try (live typing, single steps of a demo), and `countTry()` counts one
 * without an action. "Show me" replays the goal's witness from `init` and reports every goal
 * that state meets as shown.
 */
export function useSimulator<S, A>(model: SimulatorModel<S, A>, props: SimulatorViewProps) {
  const { exercise, card, onGoal } = props;
  const [state, setState] = useState<S>(() => model.init(exercise.init));
  const [tries, setTries] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<string, GoalOutcome>>({});
  const [cardDone, setCardDone] = useState(card.done);
  const [focusGoal, setFocusGoal] = useState<string | undefined>();
  const reported = useRef(new Set<string>());

  useEffect(() => {
    const sync = () => setCardDone(card.done);
    sync();
    card.host.addEventListener("gf:statechange", sync);
    return () => card.host.removeEventListener("gf:statechange", sync);
  }, [card]);

  const meets = useCallback(
    (s: S, goal: SimulatorGoal) => model.goalChecks[goal.when]?.(s, goal.args) === true,
    [model],
  );

  useEffect(() => {
    const fresh = exercise.goals.filter((g) => !reported.current.has(g.id) && meets(state, g));
    if (fresh.length === 0) return;
    for (const g of fresh) reported.current.add(g.id);
    setOutcomes((o) => ({ ...o, ...Object.fromEntries(fresh.map((g) => [g.id, "reached" as const])) }));
    card.announce(fresh.map((g) => `Goal reached: ${plain(g.text)} ${plain(g.explanation)}`).join(" "));
    for (const g of fresh) onGoal(g.id, "reached");
  }, [state, exercise, card, onGoal, meets]);

  /** One try toward "Show me" (a committed change, or a finished run of a step-through demo). */
  const countTry = useCallback(() => setTries((t) => t + 1), []);

  const dispatch = useCallback(
    (action: A, countAsTry = true) => {
      setState((s) => model.reduce(s, action));
      card.markAttempted();
      if (countAsTry) countTry();
    },
    [model, card, countTry],
  );

  const showMe = useCallback(
    (goal: SimulatorGoal) => {
      let end = model.init(exercise.init);
      for (const action of goal.witness) end = model.reduce(end, action as A);
      const shown = exercise.goals.filter((g) => !reported.current.has(g.id) && meets(end, g));
      for (const g of shown) reported.current.add(g.id);
      setState(end);
      setOutcomes((o) => ({ ...o, ...Object.fromEntries(shown.map((g) => [g.id, "shown" as const])) }));
      setFocusGoal(goal.id);
      card.announce(`Shown: ${plain(goal.text)} ${plain(goal.explanation)}`);
      for (const g of shown) onGoal(g.id, "shown");
    },
    [model, exercise, card, onGoal, meets],
  );

  const revealAfter = REVEAL_POLICY.simulator.revealAfter;
  const goals: GoalItem[] = exercise.goals.map((goal) => {
    const status: GoalStatus = outcomes[goal.id] ?? (cardDone ? "reached" : "pending");
    return { goal, status, canShow: status === "pending" && card.mode === "lesson" && tries >= revealAfter };
  });

  return { state, dispatch, countTry, goals, showMe, focusGoal, tries };
}

/** The reduced-motion preference, followed live. */
export function useReducedMotion(): boolean {
  const [query] = useState(() =>
    typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined,
  );
  const [reduced, setReduced] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, [query]);
  return reduced;
}

const STATUS: Record<GoalStatus, { icon: IconName; label: string }> = {
  pending: { icon: "circle", label: "To do" },
  reached: { icon: "circle-check", label: "Reached" },
  shown: { icon: "eye", label: "Shown" },
};

export function Goals({
  idPrefix,
  goals,
  onShow,
  focusGoal,
}: {
  idPrefix: string;
  goals: GoalItem[];
  onShow: (goal: SimulatorGoal) => void;
  focusGoal?: string | undefined;
}) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!focusGoal || !list.current) return;
    const items = [...list.current.querySelectorAll<HTMLElement>("[data-goal]")];
    items.find((item) => item.dataset.goal === focusGoal)?.focus();
  }, [focusGoal]);
  const met = goals.filter((g) => g.status !== "pending").length;
  const titleId = `${idPrefix}-goals`;
  return (
    <section class="sim-goals" aria-labelledby={titleId}>
      <p class="sim-goals-title" id={titleId}>
        {goals.length === 1 ? "Goal" : "Goals"}{" "}
        <span class="sim-goals-count">
          ({met} of {goals.length} reached)
        </span>
      </p>
      <ul class="sim-goal-list" ref={list}>
        {goals.map(({ goal, status, canShow }) => {
          const textId = `${idPrefix}-goal-${goal.id}`;
          return (
            <li key={goal.id} class="sim-goal" data-status={status} data-goal={goal.id} tabIndex={-1}>
              <Icon name={STATUS[status].icon} class="sim-goal-icon" />
              <span class="sim-goal-body">
                <span class="sim-goal-status">{STATUS[status].label}</span>
                <span class="visually-hidden">: </span>
                <Marked text={goal.text} class="sim-goal-text" id={textId} />
                {status !== "pending" && <Marked text={goal.explanation} class="sim-goal-explanation" />}
              </span>
              {canShow && (
                <button
                  type="button"
                  class="button-text sim-show-me"
                  aria-describedby={textId}
                  onClick={() => onShow(goal)}
                >
                  Show me
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The plain-language readout: shown at once, and repeated into a polite live region after
 * READOUT_DELAY_MS of quiet (never on mount, so a page of simulators stays silent on load).
 */
export function Readout({ text, label = "Readout" }: { text: string; label?: string }) {
  const [live, setLive] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const timer = setTimeout(() => setLive(plain(text)), READOUT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);
  return (
    <div class="sim-readout">
      <p class="sim-readout-text">
        <span class="sim-readout-label">{label}: </span>
        <Marked text={text} />
      </p>
      <p class="visually-hidden sim-live" role="status">
        {live}
      </p>
    </div>
  );
}

/** The text view (docs/PLAN.md 7.5): what screen readers, print and keyboard users rely on. */
export function TextViewBlock({ view, caption, id }: { view: TextView; caption: string; id: string }) {
  if (view.kind === "table") {
    return (
      <div class="sim-text-view table-scroll" role="region" aria-label={caption} tabIndex={0}>
        <table class="text-view">
          <caption>{caption}</caption>
          {view.columns && (
            <thead>
              <tr>
                {view.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {view.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row">
                      <Marked text={cell} />
                    </th>
                  ) : (
                    <td key={i}>
                      <Marked text={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  const items = view.kind === "list" ? view.items : view.entries;
  const List = view.kind === "list" ? "ul" : "ol";
  return (
    <div class={`sim-text-view sim-${view.kind}`}>
      <p class="sim-text-caption" id={id}>
        {caption}
      </p>
      <List class="sim-text-items" aria-labelledby={id}>
        {items.map((item, i) => (
          <li key={i}>
            <Marked text={item} />
          </li>
        ))}
      </List>
    </div>
  );
}

/**
 * Preset chips (docs/PLAN.md 7.5: real case values). When the presets select a file (`isCurrent`
 * given), each chip is a toggle button whose `aria-pressed` marks the file in use, drawn with
 * the toolbar toggles' pressed style (accent border and fill), so the state is not colour alone.
 */
export function Presets({
  presets,
  onPick,
  label = "Presets",
  isCurrent,
}: {
  presets: readonly { label: string; state: Record<string, unknown> }[] | undefined;
  onPick: (state: Record<string, unknown>, label: string) => void;
  label?: string;
  isCurrent?: (state: Record<string, unknown>) => boolean;
}) {
  if (!presets?.length) return null;
  return (
    <div class="sim-presets" role="group" aria-label={label}>
      <span class="sim-presets-label" aria-hidden="true">
        {label}
      </span>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          class="sim-chip"
          aria-pressed={isCurrent ? isCurrent(p.state) : undefined}
          onClick={() => onPick(p.state, p.label)}
        >
          <Marked text={p.label} />
        </button>
      ))}
    </div>
  );
}

const WHOLE = /^\s*\d+\s*$/;

/**
 * A whole-number field bound to the model. Live fields report each valid keystroke (not a try)
 * and commit on change or Enter (a try); other fields only commit. An invalid draft returns to
 * the model's value on commit.
 */
export function NumberField({
  id,
  label,
  value,
  min,
  max,
  live = false,
  onValue,
  onKeyDown,
  describedBy,
  class: className,
}: {
  id: string;
  label: ComponentChildren;
  value: number | undefined;
  min?: number;
  max?: number;
  live?: boolean;
  onValue: (n: number, committed: boolean) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  describedBy?: string;
  class?: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const lastCommit = useRef<string | null>(null);
  useEffect(() => {
    if (draft.trim() === "" || Number(draft) !== value) setDraft(value === undefined ? "" : String(value));
    // Only the model's value drives a resync; the draft is the learner's.
  }, [value]);

  const commit = (text: string) => {
    if (lastCommit.current === text) return;
    lastCommit.current = text;
    if (WHOLE.test(text)) onValue(Number(text), true);
    // Back to the model's value: a refused number reverts, an accepted one arrives as `value`.
    setDraft(value === undefined ? "" : String(value));
  };

  return (
    <div class={`sim-field ${className ?? ""}`}>
      <label for={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={draft}
        aria-describedby={describedBy}
        onInput={(e) => {
          const text = e.currentTarget.value;
          setDraft(text);
          lastCommit.current = null;
          if (live && WHOLE.test(text)) onValue(Number(text), false);
        }}
        onChange={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
          onKeyDown?.(e);
        }}
      />
    </div>
  );
}

/** A notice for a refused action, next to the controls; it speaks through its own live region. */
export function Notice({ text, id }: { text: string | undefined; id?: string }) {
  return (
    <p class="sim-notice" id={id} role="status" data-empty={text ? undefined : ""}>
      {text ? (
        <>
          <Icon name="info" />
          <Marked text={text} />
        </>
      ) : null}
    </p>
  );
}
