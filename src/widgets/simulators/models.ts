// Simulator models by id, for content tests (witness replay) and views.
import type { SimulatorId } from "../../exercises/types.ts";
import { rulerModel } from "./coordinate-ruler/model.ts";
import type { SimulatorModel } from "./types.ts";

export const models: Partial<Record<SimulatorId, SimulatorModel<unknown, unknown>>> = {
  "coordinate-ruler": rulerModel as SimulatorModel<unknown, unknown>,
};
