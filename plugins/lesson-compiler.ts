// Build-time Markdown compiler for lessons, quizzes, the capstone and pages (docs/PLAN.md 11.1).
// Node only: the Vite plugin and the content tests import it, so build and tests cannot drift.
// Nothing here ships in the browser bundle.
//
// Chain: remark-parse -> remark-frontmatter -> remark-gfm -> remark-directive -> frontmatter
// reader -> source-comment stripper -> raw-HTML check -> text-directive restorer -> directive
// mapper -> link rewriter -> remark-rehype -> heading ids/TOC -> image collector -> rehype-stringify.
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type { Nodes as MdastNodes, PhrasingContent, Root as MdastRoot, RootContent, Text } from "mdast";
import rehypeStringify from "rehype-stringify";
import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";
import { VFile } from "vfile";
import { parse as parseYaml } from "yaml";

/** The documented raw-HTML error (D-21). Tests match it exactly. */
export const RAW_HTML_MESSAGE =
  "Raw HTML is not allowed. If this is a genomic token such as `<DEL>`, wrap it in backticks.";

// ---------------------------------------------------------------------------------------------
// Frontmatter

export type PageKind = "lesson" | "quiz" | "capstone" | "page";

export interface LessonMeta {
  kind: "lesson";
  id: string;
  title: string;
  section: string;
  minutes: number;
  objectives: string[];
  introduces: string[];
  requires: string[];
  caseBeat: string;
  specs: string[];
  summary?: string;
}
export interface QuizMeta {
  kind: "quiz";
  id: string;
  title: string;
  section: string;
  minutes?: number;
}
export interface CapstoneMeta {
  kind: "capstone";
  id: string;
  title: string;
  minutes?: number;
}
export interface PageMeta {
  kind: "page";
  id: string;
  title: string;
}
export type CompiledMeta = LessonMeta | QuizMeta | CapstoneMeta | PageMeta;

type FieldType = "string" | "number" | "string[]";
const SCHEMAS: Record<PageKind, Record<string, { type: FieldType; required: boolean }>> = {
  lesson: {
    kind: { type: "string", required: true },
    id: { type: "string", required: true },
    title: { type: "string", required: true },
    section: { type: "string", required: true },
    minutes: { type: "number", required: true },
    objectives: { type: "string[]", required: true },
    introduces: { type: "string[]", required: true },
    requires: { type: "string[]", required: true },
    caseBeat: { type: "string", required: true },
    specs: { type: "string[]", required: true },
    summary: { type: "string", required: false },
  },
  quiz: {
    kind: { type: "string", required: true },
    id: { type: "string", required: true },
    title: { type: "string", required: true },
    section: { type: "string", required: true },
    minutes: { type: "number", required: false },
  },
  capstone: {
    kind: { type: "string", required: true },
    id: { type: "string", required: true },
    title: { type: "string", required: true },
    minutes: { type: "number", required: false },
  },
  page: {
    kind: { type: "string", required: true },
    id: { type: "string", required: true },
    title: { type: "string", required: true },
  },
};
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OBJECTIVE = /^LO[1-8]$/;

// ---------------------------------------------------------------------------------------------
// Directives

/** What a directive id resolves to. The registry maps exercise, quiz and snippet ids to these. */
export interface RegistryEntry {
  kind: string;
  title?: string;
}

interface LeafSpec {
  tag: string;
  /** The attribute holding the id that must resolve against the registry. */
  attr?: "exercise" | "section" | "id";
  /** The registry kind the id must have. */
  kind?: string;
  /** Exercise cards get a "Try it" or "Quick check" heading treatment. */
  card: boolean;
}
export const LEAF_DIRECTIVES: Readonly<Record<string, LeafSpec>> = {
  "spot-the-error": { tag: "gf-spot-the-error", attr: "exercise", kind: "spot-the-error", card: true },
  "fix-it": { tag: "gf-fix-it", attr: "exercise", kind: "fix-it", card: true },
  sort: { tag: "gf-sort", attr: "exercise", kind: "sort", card: true },
  "field-explorer": { tag: "gf-field-explorer", attr: "exercise", kind: "field-explorer", card: true },
  predict: { tag: "gf-predict", attr: "exercise", kind: "predict", card: true },
  mcq: { tag: "gf-mcq", attr: "exercise", kind: "mcq", card: true },
  simulator: { tag: "gf-simulator", attr: "exercise", kind: "simulator", card: true },
  quiz: { tag: "gf-quiz", attr: "section", kind: "quiz", card: false },
  "pipeline-map": { tag: "gf-pipeline-map", card: false },
  snippet: { tag: "gf-snippet", attr: "id", kind: "snippet", card: false },
};

interface ContainerSpec {
  label: string;
  /** Disclosures render as <details>; callouts as a labelled block. */
  disclosure: boolean;
  /** Attributes the author must give. */
  required: string[];
}
export const CONTAINER_DIRECTIVES: Readonly<Record<string, ContainerSpec>> = {
  "read-more": { label: "Read more", disclosure: true, required: ["title"] },
  "spec-detail": { label: "Spec detail", disclosure: true, required: ["title"] },
  "why-it-matters": { label: "Why it matters", disclosure: true, required: ["title"] },
  "case-file": { label: "Case file", disclosure: false, required: ["step"] },
  note: { label: "Note", disclosure: false, required: [] },
  tip: { label: "Tip", disclosure: false, required: [] },
  "watch-out": { label: "Watch out", disclosure: false, required: [] },
  "from-the-spec": { label: "From the spec", disclosure: false, required: ["cite"] },
  recap: { label: "Recap", disclosure: false, required: [] },
  "at-a-glance": { label: "At a glance", disclosure: false, required: ["format"] },
  unverified: { label: "Unverified", disclosure: false, required: ["ref"] },
};

/** Exercise ids contain "/"; DOM ids and route segments use "--" instead (docs/PLAN.md 11.3). */
export const exerciseDomId = (id: string): string => id.replaceAll("/", "--");

// ---------------------------------------------------------------------------------------------
// Output

export interface TocEntry {
  id: string;
  text: string;
}
export interface WidgetRef {
  directive: string;
  tag: string;
  /** The exercise, quiz section or snippet id; empty for directives without one. */
  ref: string;
  mode: "try-it" | "quick-check" | "inline";
  /** Inside :::read-more: excluded from completion and counts. */
  optional: boolean;
  line: number;
  column: number;
}
export interface LinkRef {
  href: string;
  line: number;
  column: number;
}
export interface SourceComment {
  text: string;
  line: number;
}
export interface CompiledPage {
  meta: CompiledMeta;
  html: string;
  /** H2s in order, for the aside TOC. */
  toc: TocEntry[];
  /** Every H2 and H3 id, for link checks. */
  headings: string[];
  widgets: WidgetRef[];
  /** Every internal `#/...` link after rewriting, for course-level link checks. */
  links: LinkRef[];
  /** `<!-- src: ... -->` comments, stripped from the output and kept for the fact-check report. */
  sources: SourceComment[];
  /** Relative image paths, in placeholder order (`__GF_IMG_<n>__` in html). */
  images: string[];
}

export interface CompileOptions {
  /** When given, every directive id must resolve here, with the right kind. */
  registry?: ReadonlyMap<string, RegistryEntry>;
  /** Release builds (COURSE_RELEASE=1) fail on any remaining :::unverified block. */
  release?: boolean;
}

// ---------------------------------------------------------------------------------------------
// Helpers

type Positioned = Pick<MdastNodes, "position">;

/** vfile's fail() throws, but TypeScript cannot narrow through it. */
function fail(file: VFile, message: string, node?: Positioned): never {
  if (node?.position) file.fail(message, { place: node.position });
  file.fail(message);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-");
}

function hastText(node: Element | HastRoot): string {
  return node.children
    .map((c) => (c.type === "text" ? c.value : c.type === "element" ? hastText(c) : ""))
    .join("");
}

function mdastText(node: MdastNodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as MdastNodes[]).map(mdastText).join("");
  return "";
}

const text = (value: string): Text => ({ type: "text", value });
const element = (
  tagName: string,
  properties: Element["properties"],
  children: ElementContent[],
): Element => ({
  type: "element",
  tagName,
  properties,
  children,
});

function readFrontmatter(tree: MdastRoot, file: VFile): CompiledMeta {
  const first = tree.children[0];
  if (first?.type !== "yaml") fail(file, "The file must start with YAML frontmatter (--- ... ---).");
  let data: unknown;
  try {
    data = parseYaml(first.value);
  } catch (err) {
    fail(file, `Frontmatter is not valid YAML: ${(err as Error).message}`, first);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail(file, "Frontmatter must be a mapping.", first);
  const record = data as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== "string" || !(kind in SCHEMAS)) {
    fail(file, `Frontmatter "kind" must be one of: ${Object.keys(SCHEMAS).join(", ")}.`, first);
  }
  const schema = SCHEMAS[kind as PageKind];
  for (const key of Object.keys(record)) {
    if (!schema[key]) fail(file, `Unknown frontmatter key "${key}" for kind "${kind}".`, first);
  }
  for (const [key, spec] of Object.entries(schema)) {
    const value = record[key];
    if (value === undefined) {
      if (spec.required) fail(file, `Frontmatter is missing "${key}" (kind "${kind}").`, first);
      continue;
    }
    const ok =
      spec.type === "string[]"
        ? Array.isArray(value) && value.every((v) => typeof v === "string")
        : typeof value === spec.type;
    if (!ok) fail(file, `Frontmatter "${key}" must be a ${spec.type}.`, first);
  }
  if (!SLUG.test(record.id as string)) fail(file, `Frontmatter "id" must be a lowercase slug.`, first);
  if (kind === "lesson") {
    const minutes = record.minutes as number;
    if (!Number.isInteger(minutes) || minutes < 8 || minutes > 12) {
      fail(file, `A lesson's "minutes" must be a whole number from 8 to 12.`, first);
    }
    for (const lo of record.objectives as string[]) {
      if (!OBJECTIVE.test(lo)) fail(file, `Unknown objective "${lo}" (expected LO1 to LO8).`, first);
    }
  }
  return record as unknown as CompiledMeta;
}

// ---------------------------------------------------------------------------------------------
// Compiler

/**
 * Compile one content file. Throws a VFileMessage (with `line` and `column`) on the first
 * authoring error, so `vp build` fails and the dev overlay shows the place.
 */
export async function compileLesson(
  source: string,
  path: string,
  options: CompileOptions = {},
): Promise<CompiledPage> {
  const { registry, release = false } = options;
  let meta: CompiledMeta | undefined;
  const widgets: WidgetRef[] = [];
  const links: (LinkRef & { local?: string; node: Positioned })[] = [];
  const sources: SourceComment[] = [];
  const images: string[] = [];
  const toc: TocEntry[] = [];
  const headings: string[] = [];

  const readMeta = () => (tree: MdastRoot, file: VFile) => {
    meta = readFrontmatter(tree, file);
  };

  /** Strip `<!-- src: ... -->` comments (collected), then fail on any other raw HTML. */
  const checkHtml = () => (tree: MdastRoot, file: VFile) => {
    visit(tree, "html", (node, index, parent) => {
      const value = node.value.trim();
      const comments = [...value.matchAll(/<!--\s*src:\s*([\s\S]*?)\s*-->/g)];
      const rest = value.replace(/<!--\s*src:\s*[\s\S]*?-->/g, "").trim();
      if (comments.length && !rest && parent && index !== undefined) {
        for (const m of comments) sources.push({ text: m[1] ?? "", line: node.position?.start.line ?? 0 });
        parent.children.splice(index, 1);
        return [SKIP, index];
      }
      if (comments.length) {
        fail(
          file,
          "A source comment that starts a line must be alone on that line. Put it on its own line, or after the sentence it supports.",
          node,
        );
      }
      fail(file, `${RAW_HTML_MESSAGE} Found: ${value.slice(0, 60)}`, node);
    });
  };

  /**
   * The course defines no text directives. remark-directive still reads `:c` in
   * `NM_000546.6:c.215C>G`, `:166` in `chr2:166,014,902` and `:Z`, `:chr2` in `SA:Z:chr2,...`
   * as text directives, so each one is put back as the exact source text it came from.
   */
  const restoreTextDirectives = () => (tree: MdastRoot, file: VFile) => {
    const src = String(file.value);
    visit(tree, "textDirective", (node, index, parent) => {
      if (!parent || index === undefined) return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined)
        fail(file, "Internal: text directive without a position.", node);
      const children = node.children as PhrasingContent[];
      const first = children[0];
      const last = children.at(-1);
      const firstStart = first?.position?.start.offset;
      const lastEnd = last?.position?.end.offset;
      const replacement: PhrasingContent[] =
        first && last && firstStart !== undefined && lastEnd !== undefined
          ? [text(src.slice(start, firstStart)), ...children, text(src.slice(lastEnd, end))]
          : [text(src.slice(start, end))];
      parent.children.splice(index, 1, ...replacement);
      return index; // revisit: a label may hold further directives
    });
  };

  const mapDirectives = () => (tree: MdastRoot, file: VFile) => {
    // Exercises inside :::read-more are optional.
    const optional = new WeakSet<object>();
    visit(tree, "containerDirective", (node) => {
      if (node.name !== "read-more") return;
      visit(node, "leafDirective", (leaf) => {
        optional.add(leaf);
      });
    });

    visit(tree, (node, index, parent) => {
      if (node.type === "heading" && node.depth === 2 && mdastText(node).startsWith("Try it:")) {
        const next = parent && index !== undefined ? parent.children[index + 1] : undefined;
        if (next?.type !== "leafDirective" || !LEAF_DIRECTIVES[next.name]?.card) {
          fail(file, `A "Try it:" heading must be followed directly by its exercise directive.`, node);
        }
      }
      if (node.type === "leafDirective") {
        const spec = LEAF_DIRECTIVES[node.name];
        if (!spec) {
          fail(
            file,
            `Unknown directive "::${node.name}". Known: ${Object.keys(LEAF_DIRECTIVES).join(", ")}.`,
            node,
          );
        }
        const attributes = node.attributes ?? {};
        for (const key of Object.keys(attributes)) {
          if (key !== spec.attr) fail(file, `"::${node.name}" does not take a "${key}" attribute.`, node);
        }
        const ref = spec.attr ? (attributes[spec.attr] ?? "") : "";
        if (spec.attr && !ref) fail(file, `"::${node.name}" needs a ${spec.attr}="..." attribute.`, node);
        const entry = spec.attr ? registry?.get(ref) : undefined;
        if (spec.attr && registry) {
          if (!entry) fail(file, `Unknown ${spec.kind} id "${ref}" in ::${node.name}.`, node);
          if (entry.kind !== spec.kind) {
            fail(file, `"${ref}" is a ${entry.kind}, but ::${node.name} needs a ${spec.kind}.`, node);
          }
        }
        if (spec.card && widgets.some((w) => w.ref === ref)) {
          fail(file, `Exercise "${ref}" appears twice on this page.`, node);
        }
        const previous = parent && index !== undefined ? parent.children[index - 1] : undefined;
        const underTryIt =
          previous?.type === "heading" && previous.depth === 2 && mdastText(previous).startsWith("Try it:");
        const mode: WidgetRef["mode"] = !spec.card ? "inline" : underTryIt ? "try-it" : "quick-check";
        const isOptional = optional.has(node);
        const properties: Element["properties"] = { [spec.attr ?? "data-ref"]: ref || undefined };
        const children: ElementContent[] = [];
        if (spec.card) {
          properties.id = exerciseDomId(ref);
          properties.dataMode = mode;
          if (isOptional) properties.dataOptional = "";
          if (mode === "quick-check") {
            const title = entry?.title ?? ref;
            children.push(
              element("h3", { className: ["quick-check-title"] }, [{ type: "text", value: title }]),
            );
          }
        }
        widgets.push({
          directive: node.name,
          tag: spec.tag,
          ref,
          mode,
          optional: isOptional,
          line: node.position?.start.line ?? 0,
          column: node.position?.start.column ?? 0,
        });
        node.children = [];
        node.data = { hName: spec.tag, hProperties: properties, hChildren: children };
        return;
      }

      if (node.type === "containerDirective") {
        const spec = CONTAINER_DIRECTIVES[node.name];
        if (!spec) {
          fail(
            file,
            `Unknown container ":::${node.name}". Known: ${Object.keys(CONTAINER_DIRECTIVES).join(", ")}.`,
            node,
          );
        }
        if (node.name === "unverified" && release) {
          fail(
            file,
            `A release build cannot contain :::unverified (ref "${node.attributes?.ref ?? ""}").`,
            node,
          );
        }
        const attributes = node.attributes ?? {};
        for (const key of spec.required) {
          if (!attributes[key]) fail(file, `":::${node.name}" needs a ${key}="..." attribute.`, node);
        }
        // `:::note[Custom label]` arrives as a first paragraph marked directiveLabel.
        const first = node.children[0];
        let label = spec.label;
        if (first?.type === "paragraph" && first.data?.directiveLabel) {
          label = mdastText(first);
          node.children.shift();
        }
        const title = attributes.title ?? attributes.cite ?? attributes.format ?? attributes.step ?? "";
        const heading: RootContent = {
          type: "paragraph",
          data: {
            hName: spec.disclosure ? "summary" : "p",
            hProperties: { className: [spec.disclosure ? "disclosure-summary" : "callout-label"] },
          },
          children: [
            text(title && spec.disclosure ? `${label}: ${title}` : title ? `${label} · ${title}` : label),
          ],
        };
        node.children.unshift(heading as (typeof node.children)[number]);
        node.data = {
          hName: spec.disclosure ? "details" : "div",
          hProperties: {
            className: [
              spec.disclosure ? "disclosure" : "callout",
              `${spec.disclosure ? "disclosure" : "callout"}-${node.name}`,
            ],
            dataRef: attributes.ref,
          },
        };
      }
      return undefined;
    });
  };

  const rewriteLinks = () => (tree: MdastRoot, file: VFile) => {
    const src = String(file.value);
    visit(tree, "link", (node) => {
      const url = node.url;
      const start = node.position?.start.offset;
      if (start !== undefined && src[start] === "<") {
        const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
        if (scheme !== "https" && scheme !== "http" && scheme !== "mailto") {
          fail(
            file,
            `"<${url}>" was read as a link. If this is a genomic token such as \`<DUP:TANDEM>\`, wrap it in backticks.`,
            node,
          );
        }
      }
      const where = { line: node.position?.start.line ?? 0, column: node.position?.start.column ?? 0, node };
      if (url.startsWith("#/")) {
        links.push({ href: url, ...where });
      } else if (url.startsWith("#")) {
        if (meta?.kind !== "lesson")
          fail(file, `Bare "#anchor" links only work in lessons. Use a #/ route.`, node);
        const target = url.slice(1);
        node.url = `#/lesson/${meta.id}/${target}`;
        links.push({ href: node.url, local: target, ...where });
      } else if (!/^(https?:\/\/|mailto:)/.test(url)) {
        fail(
          file,
          `Link "${url}" would break in the single-file build. Use an https:// URL or a #/ route.`,
          node,
        );
      }
    });
  };

  const headingIds = () => (tree: HastRoot, file: VFile) => {
    const seen = new Set<string>();
    let lastH2: string | undefined;
    visit(tree, "element", (el: Element) => {
      if (el.tagName === "h1") fail(file, "Do not use a # heading; the shell renders the page title.", el);
      if (el.tagName === "h2" || el.tagName === "h3") {
        const label = hastText(el).trim();
        const id = slugify(label);
        if (!id) fail(file, `Heading "${label}" needs letters or digits for its id.`, el);
        if (seen.has(id))
          fail(file, `Duplicate heading "${label}". Headings must be unique within a page.`, el);
        seen.add(id);
        el.properties = { ...el.properties, id };
        headings.push(id);
        if (el.tagName === "h2") {
          lastH2 = id;
          toc.push({ id, text: label });
        }
      }
      if (el.properties?.dataMode === "try-it") el.properties.dataLabelledby = lastH2;
    });
  };

  const collectImages = () => (tree: HastRoot, file: VFile) => {
    visit(tree, "element", (el: Element) => {
      const src = el.tagName === "img" ? el.properties?.src : undefined;
      if (typeof src !== "string" || src.startsWith("data:")) return;
      if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) {
        fail(file, `Image "${src}" would be fetched over the network. Put the file next to the lesson.`, el);
      }
      el.properties = { ...el.properties, src: `__GF_IMG_${images.length}__` };
      images.push(src);
    });
  };

  const checkPage = () => (_tree: HastRoot, file: VFile) => {
    if (!meta) return;
    const local = new Set([...headings, ...widgets.filter((w) => w.ref).map((w) => exerciseDomId(w.ref))]);
    for (const link of links) {
      if (link.local !== undefined && !local.has(link.local)) {
        fail(file, `Link "#${link.local}" does not match a heading or exercise on this page.`, link.node);
      }
      const route = ROUTE.exec(link.href);
      if (!route) fail(file, `Link "${link.href}" is not a course route.`, link.node);
      if (route[1] === meta.id && route[2] && !local.has(route[2])) {
        fail(file, `Link "${link.href}" does not match a heading or exercise on this page.`, link.node);
      }
    }
    if (meta.kind === "lesson" && toc.at(-1)?.text !== "Recap") {
      fail(file, `A lesson's last H2 must be "Recap".`);
    }
  };

  const file = new VFile({ value: source, path });
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml"])
    .use(remarkGfm)
    .use(remarkDirective)
    .use(readMeta)
    .use(checkHtml)
    .use(restoreTextDirectives)
    .use(mapDirectives)
    .use(rewriteLinks)
    .use(remarkRehype)
    .use(headingIds)
    .use(collectImages)
    .use(checkPage)
    .use(rehypeStringify);
  const html = String(await processor.process(file));
  if (!meta) throw new Error(`Internal: ${path} compiled without frontmatter.`);
  return {
    meta,
    html,
    toc,
    headings,
    widgets,
    links: links.map(({ href, line, column }) => ({ href, line, column })),
    sources,
    images,
  };
}

/** Course routes (D-22). Group 1: lesson slug; group 2: heading or exercise DOM id. */
export const ROUTE =
  /^#\/(?:lesson\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?|quiz\/[a-z0-9-]+|capstone|badge|about)?$/;
