// The exercise registry: every exercise, keyed by the id lesson directives use
// (`::predict{exercise="placeholder-hello/bed-to-one-based"}`).
//
// Pure TypeScript, no Vite-only imports: the lesson plugin loads this module through Vite's
// module runner (dev and build), the browser bundle imports it, and node tests import it.
// Never import it from vite.config.ts (that restarts the dev server on every exercise edit).
import * as placeholderHello from "./placeholder-hello.ts";
import type { Exercise } from "./types.ts";

/**
 * One entry per `src/exercises/<lesson-id>.ts` module, keyed by lesson id. Every export of a
 * module is an exercise; adding an exported const to a module registers it.
 */
const modules: Record<string, Record<string, Exercise>> = {
  "placeholder-hello": placeholderHello,
};

function register(byLesson: Record<string, Record<string, Exercise>>): Readonly<Record<string, Exercise>> {
  const all: Record<string, Exercise> = {};
  for (const [lessonId, mod] of Object.entries(byLesson)) {
    for (const [exportName, exercise] of Object.entries(mod)) {
      if (!exercise.id.startsWith(`${lessonId}/`)) {
        throw new Error(
          `Exercise ${exportName} has id "${exercise.id}"; ids in this module start with "${lessonId}/"`,
        );
      }
      if (all[exercise.id]) throw new Error(`Duplicate exercise id "${exercise.id}" (export ${exportName})`);
      all[exercise.id] = exercise;
    }
  }
  return Object.freeze(all);
}

export const exercises = register(modules);

export const getExercise = (id: string): Exercise | undefined => exercises[id];
