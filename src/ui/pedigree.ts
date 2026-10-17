// The trio pedigree glyph in case-file callouts (ux 4.9; docs/PLAN.md 10.5, D-17): father
// (unaffected square), mother (unaffected circle), and their daughter, the proband: a filled
// circle with the proband arrow. Inline SVG, 40x24, drawn in currentColor so it follows the
// theme and forced colours. The compiler emits `<span class="case-pedigree" data-pedigree="trio">`.

/** Must equal PEDIGREE_LABEL in plugins/lesson-compiler.ts (a unit test checks). */
export const PEDIGREE_LABEL = "Trio: father and mother unaffected; daughter, the proband, affected";

export const PEDIGREE_SVG = [
  `<svg class="pedigree-svg" viewBox="0 0 40 24" width="40" height="24" focusable="false" aria-hidden="true">`,
  `<g fill="none" stroke="currentColor" stroke-width="1.25">`,
  // Father, mother and the mating line between them.
  `<rect x="3.5" y="1.5" width="7" height="7"/>`,
  `<circle cx="29" cy="5" r="3.5"/>`,
  `<path d="M10.5 5h15M18 5v10"/>`,
  `</g>`,
  // The proband, affected (filled), with the arrow pointing at her from the lower left.
  `<circle cx="18" cy="18.5" r="3.5" fill="currentColor" stroke="currentColor" stroke-width="1.25"/>`,
  `<path d="M8 23L12.2 20.5" stroke="currentColor" stroke-width="1.25" fill="none"/>`,
  `<path d="M14.4 19.2L12.84 21.65L11.5 19.43z" fill="currentColor"/>`,
  `</svg>`,
].join("");

export function drawPedigrees(root: ParentNode): void {
  for (const span of root.querySelectorAll<HTMLElement>('.case-pedigree[data-pedigree="trio"]')) {
    if (span.firstElementChild) continue;
    span.setAttribute("role", "img");
    span.setAttribute("aria-label", PEDIGREE_LABEL);
    span.innerHTML = PEDIGREE_SVG;
  }
}
