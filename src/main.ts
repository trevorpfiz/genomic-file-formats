// Boot (docs/PLAN.md 11): styles, widgets, the progress store, the theme, then the shell.
// The store is installed before the first render so every exercise card restores its saved
// progress as it mounts (src/widgets/card.ts setProgressStore).
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/prose.css";
import "./styles/layout.css";
import "./widgets/index.ts";
import "./styles/print.css";
import { Shell } from "./shell/app.ts";
import { pages } from "./shell/lessons.ts";
import { CourseStore } from "./shell/progress-store.ts";
import { probeStorage } from "./shell/storage.ts";
import { initTheme } from "./shell/theme.ts";
import { setProgressStore } from "./widgets/card.ts";

const storage = probeStorage(window);
initTheme(window, storage);
const store = new CourseStore({ storage });
setProgressStore(store);
new Shell({ pages, store, pagesUrl: __PAGES_URL__, version: __COURSE_VERSION__ }).start();
