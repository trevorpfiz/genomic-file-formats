// Simulator models by id, for content tests (witness replay) and views. Each simulator's owner
// replaces its stub model; ids without a model have none yet (the content test reports them).
import type { SimulatorId } from "../../exercises/types.ts";
import { bgzfDemoModel } from "./bgzf-demo/model.ts";
import { rulerModel } from "./coordinate-ruler/model.ts";
import { faiCalculatorModel } from "./fai-calculator/model.ts";
import { phredConverterModel } from "./phred-converter/model.ts";
import type { SimulatorModel } from "./types.ts";

type AnyModel = SimulatorModel<unknown, unknown>;

export const models: Partial<Record<SimulatorId, AnyModel>> = {
  "coordinate-ruler": rulerModel as AnyModel,
  "fai-calculator": faiCalculatorModel as AnyModel,
  "bgzf-demo": bgzfDemoModel as AnyModel,
  "phred-converter": phredConverterModel as AnyModel,
};
