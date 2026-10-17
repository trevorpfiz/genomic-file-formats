// The in-page TOC (ux 10.2; docs/PLAN.md 10.1, 11.3): the lesson's H2s, including "Try it: …"
// and "Recap", or a quiz's questions and Results. Exercise items show a status icon. A scroll-spy
// marks the active item (aria-current="location", a 2px bar); a click scrolls to the heading,
// replaces the hash (history.replaceState, so no re-render) and moves focus to the heading.
import { h, iconSpan, srOnly } from "./dom.ts";
import type { IconName } from "./icons.ts";

export interface TocItem {
  /** The target element's id. */
  id: string;
  text: string;
  /** The route written to the address bar on click. */
  href: string;
  /** A status icon and its text, for exercise items and quiz questions. */
  status?: { icon: IconName; text: string; tone?: string };
}

export function renderToc(items: readonly TocItem[], idPrefix: string): HTMLElement {
  const titleId = `${idPrefix}-title`;
  return h(
    "nav",
    { class: "toc", "aria-labelledby": titleId, "data-toc": "" },
    h("p", { class: "visually-hidden", id: titleId }, "On this page"),
    h(
      "ol",
      { class: "toc-list" },
      items.map((item) =>
        h(
          "li",
          { class: "toc-item" },
          h(
            "a",
            { class: "toc-link", href: item.href, "data-target": item.id },
            h("span", { class: "toc-text" }, item.text),
            statusNode(item),
          ),
        ),
      ),
    ),
  );
}

function statusNode(item: TocItem): Node | null {
  if (!item.status) return null;
  return h(
    "span",
    { class: "toc-status", "data-tone": item.status.tone ?? null },
    iconSpan(item.status.icon),
    srOnly(`, ${item.status.text}`),
  );
}

/** Update the status icons of TOC items in place. */
export function refreshTocStatus(root: ParentNode, items: readonly TocItem[]): void {
  for (const item of items) {
    for (const link of root.querySelectorAll<HTMLAnchorElement>(
      `[data-toc] a[data-target="${CSS.escape(item.id)}"]`,
    )) {
      const old = link.querySelector(".toc-status");
      const next = statusNode(item);
      if (old && next) old.replaceWith(next);
      else if (next) link.append(next);
      else old?.remove();
    }
  }
}

/**
 * Scroll-spy: the active item is the last target whose top has passed 35% of the viewport
 * (below the 72px sticky offset), falling back to the first; at the bottom of the page the last
 * item is active. An IntersectionObserver and a passive scroll listener both trigger a
 * recompute, throttled to one per frame. A click locks the clicked item until scrolling settles.
 */
export class ScrollSpy {
  #ids: string[];
  #onChange: (id: string) => void;
  #observer?: IntersectionObserver;
  #frame = 0;
  #active = "";
  #lockedUntil = 0;
  #lockId = "";
  #onScroll = () => this.schedule();

  /** `ids`: the targets' element ids, looked up on every recompute (a quiz retake redraws them). */
  constructor(ids: string[], onChange: (id: string) => void) {
    this.#ids = ids;
    this.#onChange = onChange;
    const targets = this.#targets();
    if (!targets.length) return;
    if (typeof IntersectionObserver === "function") {
      this.#observer = new IntersectionObserver(() => this.schedule(), {
        rootMargin: "-72px 0px -65% 0px",
      });
      for (const t of targets) this.#observer.observe(t);
    }
    window.addEventListener("scroll", this.#onScroll, { passive: true });
    window.addEventListener("resize", this.#onScroll, { passive: true });
    this.schedule();
  }

  /** Keep `id` active while a click scrolls to it. */
  lock(id: string, ms = 900): void {
    this.#lockId = id;
    this.#lockedUntil = performance.now() + ms;
    this.#set(id);
  }

  schedule(): void {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.recompute();
    });
  }

  #targets(): HTMLElement[] {
    return this.#ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
  }

  recompute(): void {
    const targets = this.#targets();
    if (!targets.length) return;
    if (this.#lockId && performance.now() < this.#lockedUntil) return this.#set(this.#lockId);
    this.#lockId = "";
    const doc = document.documentElement;
    const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
    let active = targets[0]!;
    if (atBottom && window.scrollY > 0) {
      active = targets.at(-1)!;
    } else {
      const line = Math.max(72, window.innerHeight * 0.35);
      for (const t of targets) {
        if (!t.getClientRects().length) continue; // hidden
        if (t.getBoundingClientRect().top <= line) active = t;
        else break;
      }
    }
    this.#set(active.id);
  }

  get active(): string {
    return this.#active;
  }

  #set(id: string): void {
    if (id === this.#active) return;
    this.#active = id;
    this.#onChange(id);
  }

  destroy(): void {
    this.#observer?.disconnect();
    window.removeEventListener("scroll", this.#onScroll);
    window.removeEventListener("resize", this.#onScroll);
    if (this.#frame) cancelAnimationFrame(this.#frame);
  }
}

/** Mark the active item in every TOC on the page (aside and sheet). */
export function markActive(root: ParentNode, id: string): void {
  for (const link of root.querySelectorAll<HTMLAnchorElement>("[data-toc] a[data-target]")) {
    if (link.dataset.target === id) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }
}
