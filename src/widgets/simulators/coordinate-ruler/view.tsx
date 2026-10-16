// M0 placeholder view for the coordinate ruler, a Preact island (D-21): controls, then the
// readout, then the text view. JSX goes through Vite 8's Oxc transform (jsxImportSource: preact).
import { useEffect, useMemo, useState } from "preact/hooks";
import type { SimulatorExercise } from "../../../exercises/types.ts";
import { rulerModel, type RulerAction, type RulerState } from "./model.ts";

const checks: Record<string, (state: RulerState, args?: unknown) => boolean> = rulerModel.goalChecks;

export interface RulerViewProps {
  exercise: SimulatorExercise;
  onGoal: (goalId: string) => void;
}

export function RulerView({ exercise, onGoal }: RulerViewProps) {
  const [state, setState] = useState(() => rulerModel.init(exercise.init));
  const reached = useMemo(
    () => exercise.goals.filter((g) => checks[g.when]?.(state, g.args)),
    [exercise, state],
  );
  useEffect(() => {
    for (const goal of reached) onGoal(goal.id);
  }, [reached, onGoal]);
  const dispatch = (action: RulerAction) => setState((s) => rulerModel.reduce(s, action));
  const view = rulerModel.text(state);

  return (
    <div class="simulator ruler">
      <p class="prompt">{exercise.prompt}</p>
      <div class="controls">
        <button type="button" onClick={() => dispatch({ type: "step", by: -1 })}>
          Previous base
        </button>
        <button type="button" onClick={() => dispatch({ type: "step", by: 1 })}>
          Next base
        </button>
      </div>
      {view.kind === "table" && (
        <table class="text-view">
          <tbody>
            {view.rows.map(([name, value]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="readout" role="status">
        {reached.length
          ? `Goal reached. ${reached.map((g) => g.explanation).join(" ")}`
          : `Goal: ${exercise.goals.map((g) => g.text).join(" ")}`}
      </p>
    </div>
  );
}
