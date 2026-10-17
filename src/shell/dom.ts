// A small element builder for the shell (no framework; docs/PLAN.md 11.1).
import { icon, type IconName } from "./icons.ts";

export type Child = Node | string | number | null | undefined | false | readonly Child[];
type AttrValue = string | number | boolean | null | undefined | ((event: Event) => void);
export type Attrs = Record<string, AttrValue>;

/**
 * `h("a", { class: "x", href: "#/", "aria-current": "page", onclick: fn }, "text", child)`.
 * Boolean true sets an empty attribute, false/null/undefined skip it; `on<event>` keys add
 * listeners.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    if (typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else
      parent.appendChild(
        typeof child === "object" ? (child as Node) : document.createTextNode(String(child)),
      );
  }
}

/** A decorative Lucide icon (aria-hidden) wrapped in a span. */
export function iconSpan(name: IconName, className = "gf-icon"): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = icon(name);
  return span;
}

/** Text only screen readers hear. */
export const srOnly = (text: string): HTMLSpanElement => h("span", { class: "visually-hidden" }, text);

/** Elements parsed from trusted compiled HTML (the lessons plugin's output). */
export function fromHtml(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}

let counter = 0;
export const uniqueId = (prefix: string): string => `${prefix}-${(counter += 1).toString(36)}`;

export const prefersReducedMotion = (): boolean => {
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/** Focus an element, making it programmatically focusable first if it is not. */
export function focusElement(el: HTMLElement, options: FocusOptions = { preventScroll: true }): void {
  if (!el.matches("a[href], button, input, select, textarea, summary, [tabindex]")) el.tabIndex = -1;
  el.focus(options);
}
