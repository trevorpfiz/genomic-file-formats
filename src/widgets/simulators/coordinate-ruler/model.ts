// M0 placeholder model for the coordinate ruler: one highlighted base and its 1-based and BED
// coordinates. M3 replaces it with the full ruler (docs/PLAN.md 7.5).
import type { SimulatorModel } from "../types.ts";

export interface RulerState {
  /** 1-based position of the highlighted base. */
  position: number;
}
export type RulerAction = { type: "step"; by: number } | { type: "set"; position: number };

const format = (n: number) => n.toLocaleString("en-US");

export const rulerModel = {
  init(args) {
    const position = Number(args.position);
    if (!Number.isInteger(position) || position < 1)
      throw new Error("ruler: position must be a whole number >= 1");
    return { position };
  },
  reduce(state, action) {
    const position = action.type === "step" ? state.position + action.by : action.position;
    return Number.isInteger(position) && position >= 1 ? { position } : state;
  },
  goalChecks: {
    showsBedInterval: (state, args) => {
      const { start, end } = args as { start: number; end: number };
      return state.position - 1 === start && state.position === end;
    },
  },
  text: (state) => ({
    kind: "table",
    rows: [
      ["1-based position", format(state.position)],
      ["BED start (0-based)", format(state.position - 1)],
      ["BED end (exclusive)", format(state.position)],
    ],
  }),
} satisfies SimulatorModel<RulerState, RulerAction>;
