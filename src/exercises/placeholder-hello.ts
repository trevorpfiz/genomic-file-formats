// M0 placeholder exercises for content/lessons/00-placeholder/01-hello.md. Removed in M1.
// One exported const per exercise, typed with `satisfies`; the registry picks up every export.
import type { PredictExercise, SimulatorExercise } from "./types.ts";

export const bedToOneBased = {
  id: "placeholder-hello/bed-to-one-based",
  kind: "predict",
  title: "Which base does this BED line cover?",
  prompt:
    "A BED line reads chr2, 166014901, 166014902. Predict the 1-based position of the one base it covers.",
  source: "M0 placeholder",
  tags: ["concept"],
  formats: ["bed"],
  concepts: ["placeholder.bed-to-one-based"],
  items: [
    {
      label: "1-based position on chr2",
      input: { type: "number", answer: 166_014_902, tolerance: 0 },
    },
  ],
  reveal:
    "BED starts are 0-based and ends are exclusive, so the interval [166,014,901, 166,014,902) holds one base: position 166,014,902 in 1-based terms.",
  computeWith: "bedToOneBased",
} satisfies PredictExercise;

export const rulerStep = {
  id: "placeholder-hello/ruler-step",
  kind: "simulator",
  simulator: "coordinate-ruler",
  title: "Step the ruler to the BED interval",
  prompt: "Move the highlighted base until the ruler shows the BED interval 166,014,901 to 166,014,902.",
  source: "M0 placeholder",
  tags: ["concept"],
  formats: ["bed"],
  concepts: ["placeholder.bed-to-one-based"],
  init: { position: 166_014_900 },
  goals: [
    {
      id: "reach-interval",
      text: "Show the base whose BED interval is 166,014,901 to 166,014,902.",
      when: "showsBedInterval",
      args: { start: 166_014_901, end: 166_014_902 },
      explanation: "The 1-based position 166,014,902 is the BED interval [166,014,901, 166,014,902).",
      witness: [
        { type: "step", by: 1 },
        { type: "step", by: 1 },
      ],
    },
  ],
  textView: "table",
} satisfies SimulatorExercise;
