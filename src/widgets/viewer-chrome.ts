// Pieces every viewer shares (ux 7.1): the options type, the header bar (file icon, filename,
// format badge, meta, the "Illustrative" tag), toggle buttons and the Copy and Download actions.
import type { FieldAt, Snippet } from "../exercises/types.ts";
import { FORMAT_NAMES } from "../formats/names.ts";
import { button, copyText, downloadBlob, el, iconEl, uid } from "./dom.ts";

/** A field-explorer field: where it is and what it is called. */
export type ViewerField = FieldAt & { name: string };

export interface SnippetViewerOptions {
  /**
   * "read" (default). "pick-line" and "pick-field" make lines or TAB-separated fields
   * selectable grid cells (spot-the-error); "explore" makes `fields` focusable (field-explorer).
   */
  mode?: "read" | "pick-line" | "pick-field" | "explore";
  /** Overrides the snippet's own view defaults. */
  view?: Snippet["view"];
  /** Accessible name of the scroll region; defaults to "<filename>, scrollable". */
  label?: string;
  /** Explore mode: the fields to make focusable, in legend order. */
  fields?: readonly ViewerField[];
  /** A small viewer without a toolbar, for sort items and options. */
  compact?: boolean;
  /** Pick modes: more than one cell may be selected (aria-multiselectable). */
  multi?: boolean;
}

/**
 * The filename shown and used for downloads. Recognition items hide the identity, so a
 * filename that would give the format away becomes "file.txt" (or "file.bin").
 */
export function displayFilename(snippet: Snippet): string {
  if (!snippet.hideIdentity || /^file[\w.-]*$/i.test(snippet.filename)) return snippet.filename;
  return snippet.kind === "text" ? "file.txt" : "file.bin";
}

/** The header bar. Returns the element and the id of its filename (the viewer's name). */
export function viewerHeader(
  doc: Document,
  snippet: Snippet,
  meta: string,
  options: { compact?: boolean } = {},
): { header: HTMLDivElement; titleId: string } {
  const header = el(doc, "div", "snippet-header");
  const titleId = uid("snippet-name");
  const name = el(doc, "span", "snippet-filename", displayFilename(snippet));
  name.id = titleId;
  header.append(iconEl(doc, "file-text"), name);
  if (!snippet.hideIdentity) header.append(el(doc, "span", "snippet-badge", FORMAT_NAMES[snippet.format]));
  if (meta && !options.compact) header.append(el(doc, "span", "snippet-meta", meta));
  if (snippet.provenance === "toy" || snippet.provenance === "case") {
    const tag = el(doc, "span", "snippet-tag", "Illustrative");
    tag.title =
      snippet.provenance === "case"
        ? "Built for the course case; not a real patient."
        : "A small teaching example.";
    header.append(tag);
  }
  return { header, titleId };
}

/** A toggle button (aria-pressed). */
export function toggleButton(
  doc: Document,
  label: string,
  pressed: boolean,
  onChange: (pressed: boolean) => void,
): HTMLButtonElement {
  const toggle = button(doc, label, "button-toggle", () => {
    const next = toggle.getAttribute("aria-pressed") !== "true";
    toggle.setAttribute("aria-pressed", String(next));
    onChange(next);
  });
  toggle.setAttribute("aria-pressed", String(pressed));
  return toggle;
}

/** The default download policy (D-27). */
export function downloadKind(snippet: Snippet): "text" | "decompressed" | "bytes" | "none" {
  if (snippet.download) return snippet.download;
  return snippet.kind === "text" ? "text" : "none";
}

/** Copy (exact text) with a visible and an announced confirmation. */
export function copyButton(doc: Document, text: () => string, say: (message: string) => void) {
  const copy = button(
    doc,
    "Copy",
    "button-toggle",
    () => {
      void copyText(doc, text()).then((ok) => {
        if (ok) {
          copy.dataset.copied = "";
          copy.lastChild!.textContent = "Copied";
          say("Copied to clipboard.");
          doc.defaultView?.setTimeout(() => {
            delete copy.dataset.copied;
            copy.lastChild!.textContent = "Copy";
          }, 2000);
        } else {
          say("Could not copy automatically. Select the text and press Ctrl+C, or Command+C on a Mac.");
        }
      });
    },
    "copy",
  );
  copy.lastChild!.replaceWith(el(doc, "span", "", "Copy"));
  return copy;
}

/** Download through a Blob URL. */
export function downloadButton(
  doc: Document,
  label: string,
  filename: string,
  data: () => BlobPart,
  type: string,
): HTMLButtonElement {
  return button(doc, label, "button-toggle", () => downloadBlob(doc, filename, data(), type), "download");
}

/** Bytes from space-separated hex ("1f 8b 08"). */
export function hexBytes(hex: string): number[] {
  return hex
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((b) => Number.parseInt(b, 16));
}
