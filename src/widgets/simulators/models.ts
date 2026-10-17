// Simulator models by id, for content tests (witness replay) and views. Ids without a model have
// none yet (the content test reports them); `coordinate-ruler` arrives with its lesson in M3.
import type { SimulatorId } from "../../exercises/types.ts";
import { bgzfDemoModel } from "./bgzf-demo/model.ts";
import { faiCalculatorModel } from "./fai-calculator/model.ts";
import { phredConverterModel } from "./phred-converter/model.ts";
import type { SimulatorModel } from "./types.ts";

type AnyModel = SimulatorModel<unknown, unknown>;

export const models: Partial<Record<SimulatorId, AnyModel>> = {
  "fai-calculator": faiCalculatorModel as AnyModel,
  "bgzf-demo": bgzfDemoModel as AnyModel,
  "phred-converter": phredConverterModel as AnyModel,
};
