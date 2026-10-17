// The hex viewer (docs/PLAN.md 7.8; ux 7.5): offsets, 16 bytes per row (8 below 600 px), an
// ASCII column, head and tail with an omitted-bytes row, labelled byte-range annotations on
// tints, a decoded chip, and "View as table" listing each annotated range for screen readers.
// Annotation offsets count the shown bytes: head first, then the tail as if it followed directly.
import type { HexAnnotation, Snippet } from "../exercises/types.ts";
import { el, liveRegion, uid } from "./dom.ts";
import {
  displayFilename,
  downloadButton,
  downloadKind,
  hexBytes,
  toggleButton,
  viewerHeader,
  type SnippetViewerOptions,
} from "./viewer-chrome.ts";

const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const ascii = (n: number) => (n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : ".");

interface ShownByte {
  /** Index among the shown bytes (annotation space). */
  i: number;
  /** Offset in the file. */
  offset: number;
  value: number;
}

/** The shown bytes, split into head and tail, with file offsets. */
export function hexLayout(snippet: Snippet): { head: ShownByte[]; tail: ShownByte[]; omitted: number } {
  const hex = snippet.hex;
  const headBytes = hexBytes(hex?.head ?? "");
  const tailBytes = hexBytes(hex?.tail ?? "");
  const omitted = hex?.omittedBytes ?? 0;
  return {
    omitted,
    head: headBytes.map((value, i) => ({ i, offset: i, value })),
    tail: tailBytes.map((value, j) => ({
      i: headBytes.length + j,
      offset: headBytes.length + omitted + j,
      value,
    })),
  };
}

const annotationOf = (annotations: readonly HexAnnotation[], i: number) =>
  annotations.findIndex((a) => i >= a.from && i < a.to);

export function renderHexView(snippet: Snippet, options: SnippetViewerOptions = {}): HTMLElement {
  const doc = document;
  const hex = snippet.hex;
  const annotations = hex?.annotations ?? [];
  const layout = hexLayout(snippet);
  const shown = layout.head.length + layout.tail.length;
  const total = shown + layout.omitted;
  const root = el(doc, "div", "hex-viewer");
  root.setAttribute("role", "group");
  if (options.compact) root.dataset.compact = "";
  const meta = `binary · ${total.toLocaleString("en-US")} bytes${layout.omitted ? `, ${shown} shown` : ""}`;
  const { header, titleId } = viewerHeader(doc, snippet, meta, { compact: options.compact });
  root.setAttribute("aria-labelledby", titleId);
  root.append(header);
  const live = liveRegion(doc);

  const body = el(doc, "div", "hex-body");
  body.tabIndex = 0;
  body.setAttribute("role", "region");
  body.setAttribute("aria-label", options.label ?? `${displayFilename(snippet)}, bytes, scrollable`);
  const summary = el(doc, "p", "visually-hidden");
  summary.id = uid("hex-summary");
  summary.textContent = [
    `${shown} of ${total} bytes shown.`,
    ...annotations.map((a) => `Bytes ${a.from} to ${a.to - 1}: ${a.label}.`),
    hex?.decoded ? `Decoded: ${hex.decoded}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  body.setAttribute("aria-describedby", summary.id);

  const draw = (perRow: number) => {
    const rows: Node[] = [];
    const block = (bytes: ShownByte[]) => {
      for (let r = 0; r < bytes.length; r += perRow) {
        const chunk = bytes.slice(r, r + perRow);
        const row = el(doc, "div", "hex-row");
        row.setAttribute("aria-hidden", "true");
        row.append(el(doc, "span", "hex-offset", chunk[0]!.offset.toString(16).padStart(8, "0")));
        const bytesEl = el(doc, "span", "hex-bytes");
        const asciiEl = el(doc, "span", "hex-ascii");
        chunk.forEach((b, k) => {
          const ann = annotationOf(annotations, b.i);
          const byte = el(doc, "span", "hex-byte", hex2(b.value));
          const char = el(doc, "span", "hex-char", ascii(b.value));
          for (const node of [byte, char]) {
            node.dataset.i = String(b.i);
            if (ann >= 0) {
              node.dataset.ann = String((ann % 8) + 1);
              if (annotations[ann]!.from === b.i) node.dataset.mark = String(ann + 1);
            }
          }
          if (k === 8) bytesEl.append(el(doc, "span", "hex-gap"));
          bytesEl.append(byte);
          asciiEl.append(char);
        });
        row.append(bytesEl, asciiEl);
        rows.push(row);
      }
    };
    block(layout.head);
    if (layout.omitted) {
      const gap = el(
        doc,
        "div",
        "hex-omitted",
        `… ${layout.omitted.toLocaleString("en-US")} bytes not shown …`,
      );
      gap.setAttribute("aria-hidden", "true");
      rows.push(gap);
    }
    block(layout.tail);
    body.replaceChildren(...rows);
  };
  const narrow = doc.defaultView?.matchMedia?.("(max-width: 599px)");
  draw(narrow?.matches ? 8 : 16);
  narrow?.addEventListener?.("change", (e) => draw(e.matches ? 8 : 16));

  // Hovering a byte highlights its ASCII counterpart and vice versa.
  body.addEventListener("mouseover", (event) => {
    const i = (event.target as HTMLElement).dataset?.i;
    for (const node of body.querySelectorAll<HTMLElement>(".is-hover")) node.classList.remove("is-hover");
    if (i === undefined) return;
    for (const node of body.querySelectorAll<HTMLElement>(`[data-i="${i}"]`)) node.classList.add("is-hover");
  });

  // The legend names each annotated range: the non-colour cue for the tints.
  const legend = el(doc, "ol", "hex-legend");
  legend.setAttribute("aria-label", "Annotated byte ranges");
  const all = [...layout.head, ...layout.tail];
  annotations.forEach((a, n) => {
    const item = el(doc, "li", "hex-legend-item");
    item.dataset.ann = String((n % 8) + 1);
    const bytes = all.filter((b) => b.i >= a.from && b.i < a.to);
    item.append(
      el(doc, "span", "hex-legend-swatch", String(n + 1)),
      el(doc, "span", "hex-legend-label", a.label),
      " ",
      el(doc, "code", "", bytes.map((b) => hex2(b.value)).join(" ")),
    );
    legend.append(item);
  });

  const toolbar = el(doc, "div", "snippet-toolbar");
  toolbar.setAttribute("role", "group");
  toolbar.setAttribute("aria-label", `View options for ${displayFilename(snippet)}`);
  let table: HTMLElement | undefined;
  if (annotations.length) {
    toolbar.append(
      toggleButton(doc, "View as table", false, (on) => {
        table ??= hexTable(doc, snippet, annotations, all);
        if (!table.isConnected) body.after(table);
        table.hidden = !on;
        body.hidden = on;
        live.say(on ? "Table view." : "Byte view.");
      }),
    );
  }
  if (downloadKind(snippet) === "bytes" && !layout.omitted) {
    toolbar.append(
      downloadButton(
        doc,
        "Download bytes",
        displayFilename(snippet),
        () => new Uint8Array(all.map((b) => b.value)),
        "application/octet-stream",
      ),
    );
  }
  if (!options.compact && toolbar.childElementCount) root.append(toolbar);
  root.append(body, summary);
  if (hex?.decoded) {
    const chip = el(doc, "p", "hex-decoded");
    chip.append(el(doc, "span", "hex-decoded-label", "Decoded: "), el(doc, "code", "", hex.decoded));
    root.append(chip);
  }
  if (annotations.length) root.append(legend);
  root.append(live);
  return root;
}

function hexTable(
  doc: Document,
  snippet: Snippet,
  annotations: readonly HexAnnotation[],
  bytes: ShownByte[],
): HTMLElement {
  const wrap = el(doc, "div", "snippet-table-wrap");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", `${displayFilename(snippet)}, annotated bytes, table view`);
  const table = el(doc, "table", "snippet-table");
  table.append(el(doc, "caption", "", `Annotated bytes in ${displayFilename(snippet)}`));
  const head = el(doc, "tr");
  for (const name of ["Offset", "Bytes", "Meaning"]) {
    const th = el(doc, "th", "", name);
    th.scope = "col";
    head.append(th);
  }
  const thead = el(doc, "thead");
  thead.append(head);
  const tbody = el(doc, "tbody");
  for (const a of annotations) {
    const range = bytes.filter((b) => b.i >= a.from && b.i < a.to);
    const tr = el(doc, "tr");
    const offset = range.length
      ? `${range[0]!.offset}${range.length > 1 ? `-${range.at(-1)!.offset}` : ""}`
      : String(a.from);
    const th = el(doc, "th", "", offset);
    th.scope = "row";
    tr.append(th, el(doc, "td", "", range.map((b) => hex2(b.value)).join(" ")), el(doc, "td", "", a.label));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  wrap.append(table);
  wrap.hidden = true;
  return wrap;
}
