// Registers every custom element the compiled lessons use (docs/ARCHITECTURE.md, "Directives"),
// and the widget styles (widgets.css: viewers, exercise bodies, quiz page). The shell imports
// this module once. Each module defines its element on import.
import "./widgets.css";
import "./spot-the-error.ts"; // gf-spot-the-error
import "./fix-it.ts"; // gf-fix-it
import "./sort.ts"; // gf-sort
import "./field-explorer.ts"; // gf-field-explorer
import "./predict.ts"; // gf-predict
import "./mcq.ts"; // gf-mcq
import "./simulator.tsx"; // gf-simulator (Preact islands: src/widgets/simulators/<id>/)
import "./quiz.ts"; // gf-quiz
import "./pipeline-map.ts"; // gf-pipeline-map
import "./snippet-viewer.ts"; // gf-snippet (also renderSnippet, used by the widgets)

/** Tags defined by this module, matching LEAF_DIRECTIVES in plugins/lesson-compiler.ts. */
export const WIDGET_TAGS = [
  "gf-spot-the-error",
  "gf-fix-it",
  "gf-sort",
  "gf-field-explorer",
  "gf-predict",
  "gf-mcq",
  "gf-simulator",
  "gf-quiz",
  "gf-pipeline-map",
  "gf-snippet",
] as const;
