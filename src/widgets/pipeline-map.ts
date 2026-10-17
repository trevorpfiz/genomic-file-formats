// gf-pipeline-map (docs/PLAN.md 7.8; ux 4.10): the case pipeline as an inline SVG, with an
// ordered list as its text equivalent. `highlight="fasta,fastq"` marks the current nodes (the
// section openers): an accent outline and fill, a bold label and "(this section)" in the list,
// so the state never rests on colour alone. The main line runs left to right; BED, WIG and
// GTF/GFF3 hang below it as side branches. Below 600 px the map turns vertical, top to bottom,
// with the branches to the right. Visited and mastered states (progress) arrive with the M3 map.
import { PIPELINE_NODES, type PipelineNode } from "../shell/pipeline-nodes.ts";
import { el } from "./dom.ts";

const SVG = "http://www.w3.org/2000/svg";
const W = 96;
const H = 44;
const GAP = 22;

/** Split a label into lines of at most about 11 characters. */
function lines(label: string): string[] {
  const out: string[] = [];
  for (const word of label.split(" ")) {
    const last = out.at(-1);
    if (last !== undefined && `${last} ${word}`.length <= 11) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attrs: Record<string, string | number>,
) {
  const node = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

interface Placed {
  node: PipelineNode;
  x: number;
  y: number;
}

/** Positions: the main line in order; each branch beside the main node before it. */
function layout(vertical: boolean): {
  placed: Placed[];
  width: number;
  height: number;
  links: [Placed, Placed, boolean][];
} {
  const placed: Placed[] = [];
  const links: [Placed, Placed, boolean][] = [];
  let main = 0;
  let previous: Placed | undefined;
  for (const node of PIPELINE_NODES) {
    if (node.branch && previous) {
      const p = vertical
        ? { node, x: previous.x + W + GAP * 1.5, y: previous.y }
        : { node, x: previous.x, y: previous.y + H + GAP * 1.5 };
      placed.push(p);
      links.push([previous, p, true]);
      continue;
    }
    const p = vertical ? { node, x: 8, y: 8 + main * (H + GAP) } : { node, x: 8 + main * (W + GAP), y: 8 };
    if (previous) links.push([previous, p, false]);
    placed.push(p);
    previous = p;
    main += 1;
  }
  const width = Math.max(...placed.map((p) => p.x + W)) + 8;
  const height = Math.max(...placed.map((p) => p.y + H)) + 8;
  return { placed, width, height, links };
}

function draw(doc: Document, highlight: ReadonlySet<string>, vertical: boolean): SVGSVGElement {
  const { placed, width, height, links } = layout(vertical);
  const svg = svgEl(doc, "svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "pipeline-map-svg",
    focusable: "false",
  });
  svg.setAttribute("aria-hidden", "true");
  for (const [from, to, branch] of links) {
    let d: string;
    if (branch) {
      d = vertical
        ? `M${from.x + W} ${from.y + H / 2} H${to.x - 4}`
        : `M${from.x + W / 2} ${from.y + H} V${to.y - 4}`;
    } else {
      d = vertical
        ? `M${from.x + W / 2} ${from.y + H} V${to.y - 5}`
        : `M${from.x + W} ${from.y + H / 2} H${to.x - 5}`;
    }
    svg.append(svgEl(doc, "path", { d, class: branch ? "pm-link pm-branch" : "pm-link" }));
    const [tx, ty] = branch
      ? vertical
        ? [to.x - 4, to.y + H / 2]
        : [to.x + W / 2, to.y - 4]
      : vertical
        ? [from.x + W / 2, to.y - 5]
        : [to.x - 5, from.y + H / 2];
    const head = branch
      ? vertical
        ? `${tx} ${ty} ${tx - 6} ${ty - 4} ${tx - 6} ${ty + 4}`
        : `${tx} ${ty} ${tx - 4} ${ty - 6} ${tx + 4} ${ty - 6}`
      : vertical
        ? `${tx} ${ty} ${tx - 4} ${ty - 6} ${tx + 4} ${ty - 6}`
        : `${tx} ${ty} ${tx - 6} ${ty - 4} ${tx - 6} ${ty + 4}`;
    svg.append(svgEl(doc, "polygon", { points: head, class: "pm-head" }));
  }
  for (const { node, x, y } of placed) {
    const current = highlight.has(node.id);
    const group = svgEl(doc, "g", {
      class: `pm-node${current ? " pm-current" : ""}${node.branch ? " pm-side" : ""}`,
    });
    group.append(svgEl(doc, "rect", { x, y, width: W, height: H, rx: 8 }));
    const parts = lines(node.label);
    const text = svgEl(doc, "text", { x: x + W / 2, y: y + H / 2 - ((parts.length - 1) * 14) / 2 + 4.5 });
    parts.forEach((part, i) => {
      const tspan = svgEl(doc, "tspan", { x: x + W / 2, dy: i === 0 ? 0 : 14 });
      tspan.textContent = part;
      text.append(tspan);
    });
    group.append(text);
    svg.append(group);
  }
  return svg;
}

export class PipelineMapElement extends HTMLElement {
  connectedCallback(): void {
    if (this.firstElementChild) return;
    const doc = this.ownerDocument;
    const highlight = new Set((this.getAttribute("highlight") ?? "").split(",").filter(Boolean));
    const figure = el(doc, "figure", "pipeline-map");
    const drawing = el(doc, "div", "pipeline-map-drawing");
    const narrow = doc.defaultView?.matchMedia?.("(max-width: 599px)");
    const render = () => drawing.replaceChildren(draw(doc, highlight, narrow?.matches ?? false));
    render();
    narrow?.addEventListener?.("change", render);
    const list = el(doc, "ol", "pipeline-map-list");
    list.setAttribute("aria-label", "Pipeline map");
    for (const node of PIPELINE_NODES) {
      const item = el(doc, "li");
      item.textContent = `${node.label}: ${node.question}`;
      if (highlight.has(node.id)) {
        item.dataset.current = "";
        item.append(" (this section)");
      }
      list.append(item);
    }
    const caption = el(
      doc,
      "figcaption",
      "pipeline-map-caption",
      highlight.size
        ? "The case pipeline. Highlighted: the files this section covers. Each file answers one question."
        : "The case pipeline. Each file answers one question.",
    );
    figure.append(drawing, list, caption);
    this.replaceChildren(figure);
  }
}

if (!customElements.get("gf-pipeline-map")) customElements.define("gf-pipeline-map", PipelineMapElement);
