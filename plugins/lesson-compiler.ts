// Build-time Markdown compiler for lessons, quizzes, the capstone and pages (docs/PLAN.md 11.1).
// Node only: the Vite plugin and the content tests import it, so build and tests cannot drift.
// Nothing here ships in the browser bundle (it may import pure data modules from src/).
//
// Chain: remark-parse -> remark-frontmatter -> remark-gfm -> remark-directive -> frontmatter
// reader -> source-comment stripper -> raw-HTML check -> text-directive restorer -> directive
// mapper -> link rewriter -> remark-rehype -> heading ids/TOC -> tables -> image collector ->
// page checks -> rehype-stringify.
//
// The HTML each directive compiles to is a stable contract, documented in docs/ARCHITECTURE.md
// ("Directives") and pinned by plugins/lesson-compiler.test.ts. Change both together.
import type { Element, ElementContent, Root as HastRoot } from "hast";
import type {
  BlockContent,
  Code,
  ListItem,
  Nodes as MdastNodes,
  Parent as MdastParent,
  PhrasingContent,
  Root as MdastRoot,
  RootContent,
  Text,
} from "mdast";
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
import { FORMAT_NAMES, isFormatId } from "../src/formats/names.ts";
import { exerciseDomId, slugify } from "../src/shell/ids.ts";
import { PIPELINE_NODE_IDS } from "../src/shell/pipeline-nodes.ts";

export { exerciseDomId };

/** The documented raw-HTML error (D-21). Tests match it exactly. */
export const RAW_HTML_MESSAGE =
  "Raw HTML is not allowed. If this is a genomic token such as `<DEL>`, wrap it in backticks.";

// remark-directive's node types, as augmented into mdast by mdast-util-directive.
type ContainerDirective = Extract<RootContent, { type: "containerDirective" }>;
type LeafDirective = Extract<RootContent, { type: "leafDirective" }>;

// ---------------------------------------------------------------------------------------------
// Frontmatter (a schema per kind, docs/PLAN.md 11.1)

export type PageKind = "lesson" | "quiz" | "capstone" | "page";

export interface LessonMeta {
  kind: "lesson";
  /** Stable slug: routes (#/lesson/<id>) and progress keys. */
  id: string;
  title: string;
  /** A section id from content/course.ts. */
  section: string;
  /** 8-12 (D-05). */
  minutes: number;
  objectives: string[];
  /** Concept ids this lesson introduces (content/course.ts maps each back to this lesson). */
  introduces: string[];
  /** Concept ids this lesson needs, introduced by an earlier page. */
  requires: string[];
  /** "1 · Trio exome · the reference". */
  caseBeat: string;
  /** Spec citations: "faidx(5) htslib 1.24". */
  specs: string[];
  /** One sentence for the outline and the home page. */
  summary?: string;
}
export interface QuizMeta {
  kind: "quiz";
  /** Always "quiz-<section>". */
  id: string;
  title: string;
  section: string;
  minutes?: number;
}
export interface CapstoneMeta {
  kind: "capstone";
  id: string;
  title: string;
  section?: string;
  minutes?: number;
}
export interface PageMeta {
  kind: "page";
  /** "home" routes to #/, any other id to #/<id> (for example "about"). */
  id: string;
  title: string;
}
export type CompiledMeta = LessonMeta | QuizMeta | CapstoneMeta | PageMeta;

type FieldType = "string" | "number" | "string[]";
type Schema = Record<string, { type: FieldType; required: boolean }>;
const req = (type: FieldType) => ({ type, required: true });
const opt = (type: FieldType) => ({ type, required: false });
export const FRONTMATTER_SCHEMAS: Readonly<Record<PageKind, Schema>> = {
  lesson: {
    kind: req("string"),
    id: req("string"),
    title: req("string"),
    section: req("string"),
    minutes: req("number"),
    objectives: req("string[]"),
    introduces: req("string[]"),
    requires: req("string[]"),
    caseBeat: req("string"),
    specs: req("string[]"),
    summary: opt("string"),
  },
  quiz: {
    kind: req("string"),
    id: req("string"),
    title: req("string"),
    section: req("string"),
    minutes: opt("number"),
  },
  capstone: {
    kind: req("string"),
    id: req("string"),
    title: req("string"),
    section: opt("string"),
    minutes: opt("number"),
  },
  page: { kind: req("string"), id: req("string"), title: req("string") },
};
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OBJECTIVE = /^LO[1-8]$/;
/** "<area>.<name>", lowercase kebab parts: "fasta.line-width". */
export const CONCEPT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;

// ---------------------------------------------------------------------------------------------
// Directives

/** What a directive id resolves to. The registry maps exercise, quiz and snippet ids to these. */
export interface RegistryEntry {
  kind: string;
  title?: string;
}

interface LeafSpec {
  tag: string;
  /** The directive attribute holding the id that must resolve against the registry. */
  attr?: "exercise" | "section" | "id";
  /** The HTML attribute the id is written to. */
  outAttr?: string;
  /** The registry kind the id must have. */
  kind?: string;
  /** Exercise cards: "Try it" or "Quick check" treatment, lessons only. */
  card: boolean;
  /** Further attributes the directive accepts, copied to the element. */
  extra?: string[];
  /** Page kinds where the directive may appear. */
  pages: PageKind[];
}
const exerciseLeaf = (kind: string): LeafSpec => ({
  tag: `gf-${kind}`,
  attr: "exercise",
  outAttr: "exercise",
  kind,
  card: true,
  pages: ["lesson"],
});
export const LEAF_DIRECTIVES: Readonly<Record<string, LeafSpec>> = {
  "spot-the-error": exerciseLeaf("spot-the-error"),
  "fix-it": exerciseLeaf("fix-it"),
  sort: exerciseLeaf("sort"),
  "field-explorer": exerciseLeaf("field-explorer"),
  predict: exerciseLeaf("predict"),
  mcq: exerciseLeaf("mcq"),
  simulator: exerciseLeaf("simulator"),
  quiz: { tag: "gf-quiz", attr: "section", outAttr: "section", kind: "quiz", card: false, pages: ["quiz"] },
  "pipeline-map": {
    tag: "gf-pipeline-map",
    card: false,
    extra: ["highlight"],
    pages: ["lesson", "quiz", "capstone", "page"],
  },
  snippet: {
    tag: "gf-snippet",
    attr: "id",
    outAttr: "snippet",
    kind: "snippet",
    card: false,
    pages: ["lesson", "quiz", "capstone", "page"],
  },
};

type ContainerVariant = "disclosure" | "callout" | "recap" | "at-a-glance" | "unverified";
interface ContainerSpec {
  label: string;
  icon?: string;
  variant: ContainerVariant;
  /** Attributes the author must give. */
  required: string[];
  /** Attributes the author may give. */
  optional?: string[];
  /** Whether a `[label]` is allowed (rendered as the callout's title). */
  label_?: boolean;
}
export const CONTAINER_DIRECTIVES: Readonly<Record<string, ContainerSpec>> = {
  "read-more": { label: "Read more", icon: "book-open", variant: "disclosure", required: ["title"] },
  "spec-detail": { label: "Spec detail", icon: "scroll-text", variant: "disclosure", required: ["title"] },
  "why-it-matters": { label: "Why it matters", icon: "target", variant: "disclosure", required: ["title"] },
  "case-file": {
    label: "Case file",
    icon: "folder-open",
    variant: "callout",
    required: ["step"],
    label_: true,
  },
  note: { label: "Note", icon: "info", variant: "callout", required: [], label_: true },
  tip: { label: "Tip", icon: "lightbulb", variant: "callout", required: [], label_: true },
  "watch-out": { label: "Watch out", icon: "triangle-alert", variant: "callout", required: [], label_: true },
  "from-the-spec": {
    label: "From the spec",
    icon: "scroll-text",
    variant: "callout",
    required: ["cite"],
    label_: true,
  },
  recap: { label: "Recap", variant: "recap", required: [] },
  "at-a-glance": {
    label: "At a glance",
    icon: "file-text",
    variant: "at-a-glance",
    required: ["format"],
    optional: ["title"],
  },
  unverified: { label: "To be verified", variant: "unverified", required: ["ref"] },
};

/** Case steps in presentation order (docs/PLAN.md 5 "Case file callouts"). */
export const CASE_STEPS: readonly string[] = [
  "Trio exome",
  "Exome reanalysis",
  "Interpretation",
  "Short-read WGS",
  "HiFi and graph",
];

/** At-a-glance rows: the authored bold lead-in -> the row key (docs/PLAN.md 5 "Recap"). */
export const AT_A_GLANCE_ROWS: Readonly<Record<string, string>> = {
  Extensions: "extensions",
  "Text or binary": "text-or-binary",
  Delimiter: "delimiter",
  Coordinates: "coordinates",
  "Header lines": "header-lines",
  "Index file": "index-file",
  Spec: "spec",
  Answers: "answers",
  Keeps: "keeps",
  Drops: "drops",
  "Next file": "next-file",
};
/** The four pipeline rows every At-a-glance card must have (1.3). */
export const AT_A_GLANCE_REQUIRED = ["Answers", "Keeps", "Drops", "Next file"] as const;

/** The pedigree glyph's accessible label (D-17; docs/PLAN.md 10.5). */
export const PEDIGREE_LABEL = "Trio: father and mother unaffected; daughter, the proband, affected";

// ---------------------------------------------------------------------------------------------
// Output

export interface TocEntry {
  /** The H2's id. */
  id: string;
  text: string;
  /** For a "Try it:" H2: the id of its exercise, so the TOC can show its status icon. */
  exercise?: string;
}
export interface WidgetRef {
  directive: string;
  tag: string;
  /** The exercise, quiz section or snippet id; empty for directives without one. */
  ref: string;
  /**
   * "try-it": directly under a "Try it:" H2 (labelled by it); "quick-check": anywhere else in
   * the main text, titled by an H3; "optional": inside :::read-more, ungraded; "inline": not an
   * exercise (quiz, snippet, pipeline map).
   */
  mode: "try-it" | "quick-check" | "optional" | "inline";
  /** Inside :::read-more: excluded from completion, the exercise pill and coverage counts. */
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
  /** The page's own route: #/lesson/<id>, #/quiz/<section>, #/capstone, #/ or #/<page-id>. */
  route: string;
  html: string;
  /** H2s in order, for the aside TOC. */
  toc: TocEntry[];
  /** Every heading id (H2-H4), for link checks. */
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
  /** When given, a page's `section` must be one of these ids. */
  sections?: ReadonlySet<string>;
  /** Release builds (COURSE_RELEASE=1) fail on any remaining :::unverified block. */
  release?: boolean;
}

/** Course routes (D-22). Group 1: lesson slug; group 2: heading or exercise DOM id. */
export const ROUTE =
  /^#\/(?:lesson\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?|quiz\/[a-z0-9-]+|capstone|badge|about)?$/;

/** The route a compiled page is served at. */
export function routeOf(meta: CompiledMeta): string {
  switch (meta.kind) {
    case "lesson":
      return `#/lesson/${meta.id}`;
    case "quiz":
      return `#/quiz/${meta.section}`;
    case "capstone":
      return "#/capstone";
    case "page":
      return meta.id === "home" ? "#/" : `#/${meta.id}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers

type Positioned = Pick<MdastNodes, "position">;

/** vfile's fail() throws, but TypeScript cannot narrow through it. */
function fail(file: VFile, message: string, node?: Positioned): never {
  if (node?.position) file.fail(message, { place: node.position });
  file.fail(message);
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
): Element => ({ type: "element", tagName, properties, children });
const hText = (value: string): ElementContent => ({ type: "text", value });
const iconSpan = (name: string, className = "gf-icon"): Element =>
  element("span", { className: className.split(" "), dataIcon: name, ariaHidden: "true" }, []);

/**
 * A block node that remark-rehype turns into `hName` with `hProperties` (mdast-util-to-hast's
 * handler for unknown nodes with children). Used for the wrappers containers compile to.
 */
function block(
  hName: string,
  hProperties: Element["properties"],
  children: (RootContent | PhrasingContent)[],
  hChildren?: ElementContent[],
): BlockContent {
  return {
    type: "gfBlock",
    data: { hName, hProperties, ...(hChildren ? { hChildren } : {}) },
    children,
  } as unknown as BlockContent;
}

const isTryIt = (node: RootContent | undefined): boolean =>
  node?.type === "heading" && node.depth === 2 && mdastText(node).startsWith("Try it:");

function readFrontmatter(tree: MdastRoot, file: VFile, sections?: ReadonlySet<string>): CompiledMeta {
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
  if (typeof kind !== "string" || !(kind in FRONTMATTER_SCHEMAS)) {
    fail(file, `Frontmatter "kind" must be one of: ${Object.keys(FRONTMATTER_SCHEMAS).join(", ")}.`, first);
  }
  const schema = FRONTMATTER_SCHEMAS[kind as PageKind];
  for (const key of Object.keys(record)) {
    if (!schema[key]) {
      fail(
        file,
        `Unknown frontmatter key "${key}" for kind "${kind}". Allowed: ${Object.keys(schema).join(", ")}.`,
        first,
      );
    }
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
    if (spec.type === "string" && !(value as string).trim())
      fail(file, `Frontmatter "${key}" is empty.`, first);
  }
  const id = record.id as string;
  if (!SLUG.test(id)) fail(file, `Frontmatter "id" must be a lowercase slug, like "fasta-reference".`, first);
  const section = record.section as string | undefined;
  if (section !== undefined) {
    if (!SLUG.test(section)) fail(file, `Frontmatter "section" must be a lowercase slug.`, first);
    if (sections && !sections.has(section)) {
      fail(file, `Unknown section "${section}". Sections are listed in content/course.ts.`, first);
    }
  }
  if (kind === "lesson") {
    const minutes = record.minutes as number;
    if (!Number.isInteger(minutes) || minutes < 8 || minutes > 12) {
      fail(file, `A lesson's "minutes" must be a whole number from 8 to 12.`, first);
    }
    const objectives = record.objectives as string[];
    for (const lo of objectives) {
      if (!OBJECTIVE.test(lo)) fail(file, `Unknown objective "${lo}" (expected LO1 to LO8).`, first);
    }
    if (new Set(objectives).size !== objectives.length)
      fail(file, `"objectives" lists an objective twice.`, first);
    for (const key of ["introduces", "requires"] as const) {
      for (const concept of record[key] as string[]) {
        if (!CONCEPT_ID.test(concept)) {
          fail(
            file,
            `Concept "${concept}" in "${key}" must look like "area.name" (lowercase, dot-separated).`,
            first,
          );
        }
      }
    }
    const both = (record.introduces as string[]).filter((c) => (record.requires as string[]).includes(c));
    if (both.length) fail(file, `A lesson cannot both introduce and require "${both[0]}".`, first);
  }
  if (kind === "quiz" && id !== `quiz-${section}`) {
    fail(file, `A quiz page's id must be "quiz-${section}" (its section's quiz).`, first);
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
  const { registry, release = false, sections } = options;
  let meta: CompiledMeta | undefined;
  const widgets: WidgetRef[] = [];
  const links: (LinkRef & { local?: string; node: Positioned })[] = [];
  const sources: SourceComment[] = [];
  const images: string[] = [];
  const toc: TocEntry[] = [];
  const headings: string[] = [];
  let recapCount = 0;

  const readMeta = () => (tree: MdastRoot, file: VFile) => {
    meta = readFrontmatter(tree, file, sections);
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
    if (!meta) return;
    const page = meta;
    let tryIts = 0;
    let quizzes = 0;
    let lastH2 = "";
    const glanceIds = new Set<string>();

    const leaf = (
      node: LeafDirective,
      ancestors: ContainerDirective[],
      previous: RootContent | undefined,
      inside: string | undefined,
    ) => {
      const spec = LEAF_DIRECTIVES[node.name];
      if (!spec) {
        fail(
          file,
          `Unknown directive "::${node.name}". Known: ${Object.keys(LEAF_DIRECTIVES).join(", ")}.`,
          node,
        );
      }
      if (!spec.pages.includes(page.kind)) {
        fail(
          file,
          `"::${node.name}" is not allowed in a ${page.kind} page (only in: ${spec.pages.join(", ")}).`,
          node,
        );
      }
      if (node.children.length) fail(file, `"::${node.name}" does not take a [label].`, node);
      const attributes = node.attributes ?? {};
      for (const key of Object.keys(attributes)) {
        if (key !== spec.attr && !spec.extra?.includes(key)) {
          fail(file, `"::${node.name}" does not take a "${key}" attribute.`, node);
        }
      }
      const ref = spec.attr ? (attributes[spec.attr] ?? "") : "";
      if (spec.attr && !ref) fail(file, `"::${node.name}" needs ${spec.attr}="...".`, node);
      const entry = spec.attr ? registry?.get(ref) : undefined;
      if (spec.attr && registry) {
        if (!entry) {
          const hint =
            spec.attr === "section"
              ? "Quizzes are registered in src/exercises/registry.ts by section id."
              : `Ids look like "<lesson-id>/<slug>" and are registered in src/exercises/registry.ts.`;
          fail(file, `Unknown ${spec.kind} id "${ref}" in ::${node.name}. ${hint}`, node);
        }
        if (entry.kind !== spec.kind) {
          fail(file, `"${ref}" is a ${entry.kind}, but ::${node.name} needs a ${spec.kind}.`, node);
        }
      }
      const properties: Element["properties"] = {};
      if (spec.outAttr && ref) properties[spec.outAttr] = ref;
      const children: ElementContent[] = [];
      let mode: WidgetRef["mode"] = "inline";
      const optional = ancestors.some((a) => a.name === "read-more");

      if (spec.card) {
        if (inside)
          fail(file, `Exercises cannot sit inside a ${inside}; put the directive on its own line.`, node);
        if (ancestors.some((a) => a.name !== "read-more")) {
          fail(
            file,
            `Exercises sit in the main text or directly inside :::read-more, not inside :::${ancestors.at(-1)?.name}.`,
            node,
          );
        }
        if (page.kind === "lesson" && !ref.startsWith(`${page.id}/`)) {
          fail(
            file,
            `Exercise "${ref}" belongs to another lesson; ids on this page start with "${page.id}/".`,
            node,
          );
        }
        if (widgets.some((w) => w.ref === ref))
          fail(file, `Exercise "${ref}" appears twice on this page.`, node);
        const domId = exerciseDomId(ref);
        properties.id = domId;
        const title = entry?.title ?? ref;
        if (optional) {
          mode = "optional";
          properties.dataMode = "optional";
          properties.dataOptional = "";
          children.push(
            element("p", { className: ["exercise-title"], id: `${domId}-title` }, [hText(title)]),
          );
        } else if (isTryIt(previous)) {
          mode = "try-it";
          properties.dataMode = "try-it";
        } else {
          mode = "quick-check";
          properties.dataMode = "quick-check";
          children.push(element("h3", { className: ["quick-check-title"] }, [hText(title)]));
        }
      }
      if (node.name === "quiz") {
        quizzes += 1;
        if (page.kind === "quiz" && ref !== page.section) {
          fail(file, `This quiz page is for section "${page.section}", but ::quiz names "${ref}".`, node);
        }
        properties.id = `quiz-${ref}`;
      }
      if (node.name === "pipeline-map" && typeof attributes.highlight === "string") {
        const ids = attributes.highlight.split(",").map((s) => s.trim());
        for (const id of ids) {
          if (!PIPELINE_NODE_IDS.has(id)) {
            fail(file, `Unknown pipeline node "${id}". Known: ${[...PIPELINE_NODE_IDS].join(", ")}.`, node);
          }
        }
        properties.highlight = ids.join(",");
      }
      widgets.push({
        directive: node.name,
        tag: spec.tag,
        ref,
        mode,
        optional,
        line: node.position?.start.line ?? 0,
        column: node.position?.start.column ?? 0,
      });
      node.children = [];
      node.data = { hName: spec.tag, hProperties: properties, hChildren: children };
    };

    const container = (node: ContainerDirective): BlockContent => {
      const spec = CONTAINER_DIRECTIVES[node.name];
      if (!spec) {
        fail(
          file,
          `Unknown container ":::${node.name}". Known: ${Object.keys(CONTAINER_DIRECTIVES).join(", ")}.`,
          node,
        );
      }
      const attributes = node.attributes ?? {};
      for (const key of Object.keys(attributes)) {
        if (!spec.required.includes(key) && !spec.optional?.includes(key)) {
          fail(file, `":::${node.name}" does not take a "${key}" attribute.`, node);
        }
      }
      for (const key of spec.required) {
        if (!attributes[key]?.trim()) fail(file, `":::${node.name}" needs a ${key}="..." attribute.`, node);
      }
      // `:::note[Title]` arrives as a first paragraph marked directiveLabel.
      let title: PhrasingContent[] | undefined;
      const first = node.children[0];
      if (first?.type === "paragraph" && first.data?.directiveLabel) {
        if (!spec.label_) fail(file, `":::${node.name}" does not take a [label].`, node);
        title = first.children;
        node.children.shift();
      }
      const body = node.children as RootContent[];
      const iconOf = spec.icon ? [iconSpan(spec.icon)] : [];

      switch (spec.variant) {
        case "disclosure": {
          const summary = block(
            "summary",
            { className: ["disclosure-summary"] },
            [],
            [
              iconSpan(spec.icon ?? "book-open", "gf-icon disclosure-icon"),
              element("span", { className: ["disclosure-text"] }, [
                element("span", { className: ["disclosure-overline"] }, [
                  hText(spec.label),
                  element("span", { className: ["visually-hidden"] }, [hText(":")]),
                ]),
                hText(" "),
                element("span", { className: ["disclosure-title"] }, [hText(attributes.title ?? "")]),
              ]),
              iconSpan("chevron-down", "gf-icon disclosure-chevron"),
            ],
          );
          return block(
            "details",
            { className: ["disclosure", `disclosure-${node.name}`], dataContainer: node.name },
            [summary, block("div", { className: ["disclosure-body"] }, body)],
          );
        }
        case "callout": {
          const lead: ElementContent[] = [
            ...iconOf,
            element("span", { className: ["callout-overline"] }, [hText(spec.label)]),
          ];
          const extra: BlockContent[] = [];
          const properties: Element["properties"] = {
            className: ["callout", `callout-${node.name}`],
            role: "note",
            dataContainer: node.name,
          };
          if (node.name === "case-file") {
            const step = Number(attributes.step);
            const name = CASE_STEPS[step - 1];
            if (!Number.isInteger(step) || !name) {
              fail(
                file,
                `":::case-file" needs step="1" to step="${CASE_STEPS.length}" (the case step in presentation order).`,
                node,
              );
            }
            properties.dataStep = String(step);
            lead.push(element("span", { className: ["case-pedigree"], dataPedigree: "trio" }, []));
            extra.push(
              block(
                "p",
                { className: ["case-step"] },
                [],
                [hText(`Case step ${step} of ${CASE_STEPS.length} · ${name}`)],
              ),
            );
          }
          // `:::note[Title]`: the title follows the overline inside the label line.
          const label = title
            ? block("p", { className: ["callout-label"] }, [
                block("span", { className: ["callout-label-lead"] }, [], lead),
                text(" "),
                block("span", { className: ["callout-title"] }, title),
              ])
            : block("p", { className: ["callout-label"] }, [], lead);
          const children: BlockContent[] = [
            label,
            ...extra,
            block("div", { className: ["callout-body"] }, body),
          ];
          if (node.name === "from-the-spec") {
            children.push(block("p", { className: ["callout-cite"] }, [], [hText(attributes.cite ?? "")]));
          }
          return block("div", properties, children);
        }
        case "recap": {
          recapCount += 1;
          if (page.kind !== "lesson") fail(file, `":::recap" belongs to lessons only.`, node);
          if (lastH2 !== "Recap") fail(file, `":::recap" goes under the "## Recap" heading.`, node);
          return block("div", { className: ["recap"], dataContainer: "recap" }, body);
        }
        case "at-a-glance": {
          const formats = (attributes.format ?? "").split(",").map((s) => s.trim());
          for (const f of formats) {
            if (!isFormatId(f))
              fail(
                file,
                `Unknown format "${f}" in :::at-a-glance. Use format ids such as "fasta", "fai".`,
                node,
              );
          }
          const id = `at-a-glance-${formats.join("-")}`;
          if (glanceIds.has(id))
            fail(file, `Two At-a-glance cards for "${formats.join(",")}" on one page.`, node);
          glanceIds.add(id);
          const list = body.length === 1 && body[0]?.type === "list" ? body[0] : undefined;
          if (!list) {
            fail(file, `":::at-a-glance" holds exactly one list of "- **Row:** value" items.`, node);
          }
          const seen = new Set<string>();
          const rows = list.children.map((item: ListItem) => {
            const paragraph = item.children[0];
            const lead = paragraph?.type === "paragraph" ? paragraph.children[0] : undefined;
            const leadText = lead?.type === "strong" ? mdastText(lead).trim() : "";
            const name = leadText.endsWith(":") ? leadText.slice(0, -1).trim() : "";
            const key = AT_A_GLANCE_ROWS[name];
            if (!paragraph || paragraph.type !== "paragraph" || item.children.length !== 1 || !key) {
              fail(
                file,
                `Each At-a-glance row is "- **Row:** value", with Row one of: ${Object.keys(AT_A_GLANCE_ROWS).join(", ")}.`,
                item,
              );
            }
            if (seen.has(name)) fail(file, `At-a-glance row "${name}" appears twice.`, item);
            seen.add(name);
            const value = paragraph.children.slice(1);
            const firstValue = value[0];
            if (firstValue?.type === "text") firstValue.value = firstValue.value.replace(/^\s+/, "");
            return block("div", { className: ["at-a-glance-row"], dataRow: key }, [
              block("dt", {}, [], [hText(name)]),
              block("dd", {}, value),
            ]);
          });
          for (const name of AT_A_GLANCE_REQUIRED) {
            if (!seen.has(name))
              fail(file, `":::at-a-glance" needs a "${name}:" row (Answers, Keeps, Drops, Next file).`, node);
          }
          const heading =
            attributes.title ?? `At a glance: ${formats.map((f) => FORMAT_NAMES[f as never]).join(", ")}`;
          return block(
            "div",
            {
              className: ["at-a-glance"],
              dataContainer: "at-a-glance",
              dataFormat: formats.join(","),
              role: "group",
              ariaLabelledby: id,
            },
            [
              block("p", { className: ["at-a-glance-title"], id }, [], [...iconOf, hText(heading)]),
              block("dl", { className: ["at-a-glance-rows"] }, rows),
            ],
          );
        }
        case "unverified": {
          const ref = attributes.ref ?? "";
          if (!/^V-\d{2}$/.test(ref))
            fail(file, `":::unverified" needs ref="V-xx" (a verification register id).`, node);
          if (release) fail(file, `A release build cannot contain :::unverified (ref "${ref}").`, node);
          return block("div", { className: ["unverified"], dataContainer: "unverified", dataRef: ref }, [
            block("p", { className: ["unverified-label"] }, [], [hText(`To be verified (${ref})`)]),
            ...(body as BlockContent[]),
          ]);
        }
      }
    };

    const code = (node: Code): BlockContent => {
      const titleMatch = /(?:^|\s)title="([^"]*)"/.exec(node.meta ?? "");
      const children: BlockContent[] = [];
      if (titleMatch)
        children.push(block("p", { className: ["code-block-title"] }, [], [hText(titleMatch[1] ?? "")]));
      children.push(node);
      return block("div", { className: ["code-block"], dataLang: node.lang ?? undefined }, children);
    };

    /** `inside`: the nearest non-directive block parent (a list or a blockquote), if any. */
    const walk = (parent: MdastParent, ancestors: ContainerDirective[], inside?: string) => {
      const children = parent.children as RootContent[];
      for (let i = 0; i < children.length; i++) {
        const node = children[i] as RootContent;
        if (node.type === "heading") {
          if (node.depth === 2 && ancestors.length) {
            fail(
              file,
              `H2s structure the page and its TOC; move this heading out of :::${ancestors.at(-1)?.name}.`,
              node,
            );
          }
          if (node.depth === 2) {
            lastH2 = mdastText(node).trim();
            if (isTryIt(node)) {
              tryIts += 1;
              const next = children[i + 1];
              if (next?.type !== "leafDirective" || !LEAF_DIRECTIVES[next.name]?.card) {
                fail(file, `A "Try it:" heading must be followed directly by its exercise directive.`, node);
              }
            }
          }
        } else if (node.type === "leafDirective") {
          leaf(node, ancestors, children[i - 1], inside);
        } else if (node.type === "containerDirective") {
          walk(node, [...ancestors, node], inside);
          children[i] = container(node) as RootContent;
        } else if (node.type === "code") {
          children[i] = code(node) as RootContent;
        } else if (node.type === "textDirective") {
          fail(file, "Internal: text directive survived restoration.", node);
        } else if ("children" in node && node.type !== "paragraph" && node.type !== "table") {
          walk(node as MdastParent, ancestors, inside ?? node.type);
        }
      }
    };
    walk(tree, []);

    if (page.kind === "lesson" && tryIts > 2) {
      fail(file, `A lesson has at most two "Try it:" H2s (D-06); this one has ${tryIts}.`);
    }
    if (page.kind === "quiz" && quizzes !== 1) {
      fail(file, `A quiz page holds exactly one ::quiz{section="${page.section}"} directive.`);
    }
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
    let lastH2: TocEntry | undefined;
    visit(tree, "element", (el: Element) => {
      if (el.tagName === "h1") fail(file, "Do not use a # heading; the shell renders the page title.", el);
      if (/^h[2-6]$/.test(el.tagName)) {
        const label = hastText(el).trim();
        const id = slugify(label);
        if (!id) fail(file, `Heading "${label}" needs letters or digits for its id.`, el);
        if (seen.has(id))
          fail(file, `Duplicate heading "${label}". Headings must be unique within a page.`, el);
        seen.add(id);
        el.properties = { ...el.properties, id };
        headings.push(id);
        if (el.tagName === "h2") {
          lastH2 = { id, text: label };
          toc.push(lastH2);
        }
      }
      if (el.properties?.dataMode === "try-it" && lastH2) {
        el.properties.dataLabelledby = lastH2.id;
        lastH2.exercise = String(el.properties.exercise ?? "");
      }
    });
  };

  /** Tables scroll inside a focusable, labelled region (ux 4.4; WCAG 1.4.10, 2.1.1). */
  const wrapTables = () => (tree: HastRoot) => {
    visit(tree, "element", (el: Element, index, parent) => {
      if (el.tagName !== "table" || !parent || index === undefined) return;
      const head = el.children.find((c): c is Element => c.type === "element" && c.tagName === "thead");
      const columns = head ? hastText(head).replace(/\s+/g, " ").trim() : "";
      const cells = head ? [...collect(head, "th")].map((th) => hastText(th).trim()).filter(Boolean) : [];
      const label = cells.length ? `Table: ${cells.join(", ")}` : columns || "Table";
      parent.children[index] = element(
        "div",
        { className: ["table-scroll"], role: "region", tabIndex: 0, ariaLabel: label },
        [el],
      );
      return [SKIP, index + 1];
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
    const local = new Set([
      ...headings,
      ...widgets.filter((w) => w.ref && w.directive !== "quiz").map((w) => exerciseDomId(w.ref)),
    ]);
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
    if (meta.kind === "lesson") {
      if (toc.at(-1)?.text !== "Recap") fail(file, `A lesson's last H2 must be "Recap".`);
      if (recapCount !== 1) fail(file, `A lesson has exactly one :::recap block, under "## Recap".`);
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
    .use(wrapTables)
    .use(collectImages)
    .use(checkPage)
    .use(rehypeStringify);
  const html = String(await processor.process(file));
  if (!meta) throw new Error(`Internal: ${path} compiled without frontmatter.`);
  return {
    meta,
    route: routeOf(meta),
    html,
    toc,
    headings,
    widgets,
    links: links.map(({ href, line, column }) => ({ href, line, column })),
    sources,
    images,
  };
}

function* collect(node: Element, tagName: string): Generator<Element> {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === tagName) yield child;
    yield* collect(child, tagName);
  }
}
