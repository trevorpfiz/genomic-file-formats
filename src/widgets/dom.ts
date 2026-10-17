// Small DOM helpers shared by the widgets and viewers. No framework: widgets are light-DOM
// custom elements (docs/PLAN.md 11.1).
import { icon, type IconName } from "../shell/icons.ts";

/** Create an element with an optional class name and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A `type="button"` button with an optional leading icon (decorative; the label names it). */
export function button(
  doc: Document,
  label: string,
  className: string,
  onClick?: (event: MouseEvent) => void,
  iconName?: IconName,
): HTMLButtonElement {
  const node = el(doc, "button", className);
  node.type = "button";
  if (iconName) node.innerHTML = icon(iconName);
  node.append(label);
  if (onClick) node.addEventListener("click", onClick);
  return node;
}

/** A decorative icon as an element. */
export function iconEl(doc: Document, name: IconName, className = "gf-icon"): HTMLSpanElement {
  const span = el(doc, "span", className);
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = icon(name);
  return span;
}

let counter = 0;
/** A document-unique id for ARIA references. */
export const uid = (prefix: string): string => `${prefix}-${(counter += 1).toString(36)}`;

/** True below the 600 px breakpoint (phones), where layouts switch to their narrow form. */
export function isNarrow(doc: Document): boolean {
  try {
    return doc.defaultView?.matchMedia?.("(max-width: 599px)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Copy exact text (ux 4.6): the Clipboard API, then a hidden textarea with execCommand. Resolves
 * to false when neither works (file:// pages are not a secure context in every browser).
 */
export async function copyText(doc: Document, text: string): Promise<boolean> {
  try {
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea path.
  }
  try {
    const area = el(doc, "textarea", "visually-hidden");
    area.value = text;
    area.setAttribute("readonly", "");
    doc.body.append(area);
    area.select();
    const ok = doc.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Save data under a filename through a Blob URL (D-27). */
export function downloadBlob(doc: Document, filename: string, data: BlobPart, type: string): void {
  const win = doc.defaultView;
  if (!win?.URL?.createObjectURL) return;
  const url = win.URL.createObjectURL(new Blob([data], { type }));
  const link = el(doc, "a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  win.setTimeout(() => win.URL.revokeObjectURL(url), 10_000);
}

/** A polite status region for messages while focus stays put. */
export function liveRegion(doc: Document): HTMLParagraphElement & { say(text: string): void } {
  const region = el(doc, "p", "visually-hidden") as HTMLParagraphElement & { say(text: string): void };
  region.setAttribute("role", "status");
  region.say = (text: string) => {
    region.textContent = "";
    region.textContent = text;
  };
  return region;
}

/** Elements a click handler on a container should leave alone. */
export const INTERACTIVE = "button, a, input, select, textarea, summary, label, [role=gridcell], [tabindex]";
