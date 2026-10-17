// The snippet viewers' entry point (docs/PLAN.md 7.8; ux 7) and the gf-snippet element for
// `::snippet{id="..."}`. renderSnippet dispatches on the snippet's kind: text (text-viewer.ts),
// hex (hex-viewer.ts) or compressed text (compressed-text-viewer.ts). Widgets that need the
// interactive modes (spot-the-error, field-explorer) use the SnippetViewer class directly.
import { getSnippet } from "../exercises/registry.ts";
import type { Snippet } from "../exercises/types.ts";
import { renderCompressedText } from "./compressed-text-viewer.ts";
import { el } from "./dom.ts";
import { renderHexView } from "./hex-viewer.ts";
import { inlineNodes } from "./inline.ts";
import { SnippetViewer } from "./text-viewer.ts";
import type { SnippetViewerOptions } from "./viewer-chrome.ts";

export type { SnippetViewerOptions, ViewerField } from "./viewer-chrome.ts";
export { SnippetViewer, type CellMark, type ViewerCell } from "./text-viewer.ts";

/** Render a snippet (text, hex or compressed text) as a viewer element. */
export function renderSnippet(snippet: Snippet, options: SnippetViewerOptions = {}): HTMLElement {
  if (snippet.kind === "hex") return renderHexView(snippet, options);
  if (snippet.kind === "compressed-text") return renderCompressedText(snippet, options);
  return new SnippetViewer(snippet, options).element;
}

/** A snippet in a figure, with its caption (inline marks such as `code` render) underneath. */
export function renderSnippetFigure(snippet: Snippet, doc: Document = document): HTMLElement {
  const figure = el(doc, "figure", "snippet-figure");
  figure.append(renderSnippet(snippet));
  if (snippet.caption) {
    const caption = el(doc, "figcaption", "snippet-caption");
    caption.append(inlineNodes(snippet.caption, doc));
    figure.append(caption);
  }
  return figure;
}

/** gf-snippet: a registered snippet placed in prose with `::snippet{id="..."}`. */
export class SnippetElement extends HTMLElement {
  connectedCallback(): void {
    if (this.firstElementChild) return;
    const id = this.getAttribute("snippet") ?? "";
    const snippet = getSnippet(id);
    if (!snippet) {
      const error = el(this.ownerDocument, "p", "widget-error", `Missing snippet "${id}".`);
      error.setAttribute("role", "alert");
      this.replaceChildren(error);
      return;
    }
    this.replaceChildren(renderSnippetFigure(snippet, this.ownerDocument));
  }
}

if (!customElements.get("gf-snippet")) customElements.define("gf-snippet", SnippetElement);
