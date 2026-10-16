// The simulator contract (docs/PLAN.md 7.5): a pure model that node tests drive, separate from
// its Preact view.
import type { GoalCheckId } from "../../exercises/types.ts";

/** What the text view renders, and what screen readers and print use. */
export type TextView = { kind: "table"; rows: [string, string][] } | { kind: "list"; items: string[] };

export interface SimulatorModel<S, A> {
  init(args: Record<string, unknown>): S;
  reduce(state: S, action: A): S;
  goalChecks: Record<GoalCheckId, (state: S, args?: unknown) => boolean>;
  text(state: S): TextView;
}
