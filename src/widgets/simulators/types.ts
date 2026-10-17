// The simulator contract (docs/PLAN.md 7.5): a pure model that node tests drive, separate from
// its Preact view. Content tests replay each goal's witness actions through `reduce` from
// `init` and assert that the goal fires, and that `init` alone does not satisfy it.
import type { GoalCheckId, SimulatorExercise } from "../../exercises/types.ts";
import type { ExerciseCard } from "../card.ts";

/** What the text view renders; screen readers, print and keyboard users get this view. */
export type TextView =
  | { kind: "table"; columns?: string[]; rows: string[][] }
  | { kind: "list"; items: string[] }
  | { kind: "log"; entries: string[] };

export interface SimulatorModel<S, A> {
  init(args: Record<string, unknown>): S;
  /** Pure. Unknown or malformed actions return the state unchanged (witnesses are authored data). */
  reduce(state: S, action: A): S;
  goalChecks: Record<GoalCheckId, (state: S, args?: unknown) => boolean>;
  text(state: S): TextView;
}

/**
 * How a goal was met: "reached" by the learner, or "shown" by the goal's "Show me" button
 * (ux 8.10: it sets the state and marks the goal revealed).
 */
export type GoalOutcome = "reached" | "shown";

/** Props every simulator view receives from the gf-simulator host (src/widgets/simulator.tsx). */
export interface SimulatorViewProps {
  exercise: SimulatorExercise;
  /** The card around the island: announce(), complete(), state. */
  card: ExerciseCard<SimulatorExercise>;
  /**
   * Report a goal once, when it is first met. The host completes the card when every goal has
   * been reported; a goal reported as "shown" should make the result "Answer shown". Views
   * built before "Show me" pass only the id, which means "reached".
   */
  onGoal: (goalId: string, outcome?: GoalOutcome) => void;
}
