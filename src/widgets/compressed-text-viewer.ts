// The compressed-text viewer (docs/PLAN.md 7.8, D-20, D-27): two tabs, "Container (hex)" with
// the gzip or BGZF bytes and "Decompressed text" with the precomputed text, which is what
// Download saves (labelled as decompressed). APG tabs: arrow keys move between the tabs.
import type { Snippet } from "../exercises/types.ts";
import { el, uid } from "./dom.ts";
import { renderHexView } from "./hex-viewer.ts";
import { SnippetViewer } from "./text-viewer.ts";
import { displayFilename, downloadKind, type SnippetViewerOptions } from "./viewer-chrome.ts";

/** "reads.fastq.gz" -> "reads.fastq". */
const decompressedName = (name: string) => name.replace(/\.(gz|bgz|bgzf)$/i, "") || name;

export function renderCompressedText(snippet: Snippet, options: SnippetViewerOptions = {}): HTMLElement {
  const doc = document;
  const root = el(doc, "div", "compressed-text-viewer");
  const tabs = el(doc, "div", "viewer-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", `${displayFilename(snippet)} views`);
  const base = uid("ctv");
  const download = downloadKind(snippet) === "decompressed";
  const textSnippet: Snippet = {
    ...snippet,
    kind: "text",
    text: snippet.decodedText ?? "",
    filename: download ? decompressedName(snippet.filename) : snippet.filename,
    download: download ? "text" : "none",
  };
  const panels = [
    { label: "Container (hex)", make: () => renderHexView(snippet, options) },
    {
      label: "Decompressed text",
      make: () =>
        new SnippetViewer(textSnippet, {
          ...options,
          mode: "read",
          label: `${displayFilename(snippet)}, decompressed text, scrollable`,
        }).element,
    },
  ].map((p, i) => {
    const tab = el(doc, "button", "viewer-tab", p.label);
    tab.type = "button";
    tab.id = `${base}-tab-${i}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `${base}-panel-${i}`);
    const panel = el(doc, "div", "viewer-panel");
    panel.id = `${base}-panel-${i}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.append(p.make());
    if (i === 1 && download) {
      panel.prepend(el(doc, "p", "viewer-note", "Download saves the decompressed copy of this file."));
    }
    tabs.append(tab);
    return { tab, panel };
  });
  const select = (index: number, focus: boolean) => {
    panels.forEach(({ tab, panel }, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
    if (focus) panels[index]!.tab.focus();
  };
  panels.forEach(({ tab }, i) => {
    tab.addEventListener("click", () => select(i, false));
    tab.addEventListener("keydown", (event) => {
      const keys: Record<string, number> = {
        ArrowRight: (i + 1) % panels.length,
        ArrowLeft: (i + panels.length - 1) % panels.length,
        Home: 0,
        End: panels.length - 1,
      };
      const next = keys[event.key];
      if (next === undefined) return;
      event.preventDefault();
      select(next, true);
    });
  });
  select(0, false);
  root.append(tabs, ...panels.map((p) => p.panel));
  return root;
}
