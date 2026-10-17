// Stable ids shared by the lesson compiler (Node) and the browser. Pure; no DOM.

/**
 * Exercise ids contain "/"; DOM ids and route segments use "--" instead (docs/PLAN.md 11.3):
 * "fasta-reference/why-wont-this-index" -> "fasta-reference--why-wont-this-index".
 * Heading ids never contain "--" (slugs collapse runs of "-"), so the two cannot collide.
 */
export const exerciseDomId = (id: string): string => id.replaceAll("/", "--");

/** The inverse of exerciseDomId, for `#/lesson/<slug>/<exercise-dom-id>` routes. */
export const exerciseIdFromDom = (domId: string): string => domId.replaceAll("--", "/");

/** Heading ids: lowercase letters, digits and single hyphens (docs/PLAN.md 11.1). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}
