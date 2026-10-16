// Every compiled page, from the lessons plugin's virtual module. All pages are in the one
// bundle (nothing is fetched at runtime, so file:// works); the shell renders one at a time.
import { lessons as compiled } from "virtual:lessons";

export type Page = (typeof compiled)[number];

export const pages: readonly Page[] = compiled;

if (import.meta.hot) {
  // A content edit recompiles the virtual module; this module accepts the update and the
  // shell re-renders in place, without a full reload.
  import.meta.hot.accept((next) => {
    const updated = (next as { pages?: readonly Page[] } | undefined)?.pages;
    if (updated) window.dispatchEvent(new CustomEvent("gf:pages-updated", { detail: updated }));
  });
}
