// The app shell (docs/PLAN.md 10.1, 11.3-11.4; ux 2-4, 10, 12): routes, the aside, the mobile
// top bar and sheet, the footer, the storage notice, and the progress UI that follows the store.
//
// Route change (11.3): render, set document.title, scroll, move focus to the H1 or the target
// heading or exercise, rebuild the scroll-spy. A hash change to another heading of the page
// already shown scrolls instead of re-rendering, so no widget loses its state. Progress changes
// update only the progress-dependent regions, outline rows, TOC icons and progress bars.
import { setHeadingResolver } from "../widgets/quiz.ts";
import { enhanceCodeBlocks } from "../ui/code-block.ts";
import { drawPedigrees } from "../ui/pedigree.ts";
import { renderAside, updateProgressBars } from "./aside.ts";
import { buildModel, type CourseModel, type ShellPage } from "./course-model.ts";
import { focusElement, fromHtml, h, prefersReducedMotion } from "./dom.ts";
import { hydrateIcons } from "./icons.ts";
import { footerContent, storageNotice } from "./notice.ts";
import { refreshOutline } from "./outline.ts";
import { buildMain, resolveView, type BuildContext, type Region, type View } from "./pages.ts";
import { badgeEarned } from "./progress-derived.ts";
import type { CourseStore } from "./progress-store.ts";
import { PROGRESS_KEY, type ProgressState } from "./progress-types.ts";
import { parseRoute } from "./router.ts";
import { markActive, refreshTocStatus, renderToc, ScrollSpy, type TocItem } from "./toc.ts";
import { renderTopbar, type Topbar } from "./topbar.ts";

export interface ShellOptions {
  pages: readonly ShellPage[];
  store: CourseStore;
  pagesUrl: string;
  version: string;
}

export class Shell {
  #model: CourseModel;
  #pages: readonly ShellPage[];
  #store: CourseStore;
  #pagesUrl: string;
  #version: string;
  #main: HTMLElement;
  #aside: HTMLElement;
  #topbarHost: HTMLElement;
  #footer: HTMLElement;
  #skip: HTMLAnchorElement | null;
  #noticeSlot = h("div", { class: "notice-slot" });
  #pageRoot = h("div", { class: "page" });
  #view?: View;
  #regions: Region[] = [];
  #tocItems: TocItem[] = [];
  #spy?: ScrollSpy;
  #topbar?: Topbar;
  #frame = 0;
  #noticeDismissed = false;
  #pendingSection?: string;
  #headingCache = new Map<string, DocumentFragment>();

  constructor(options: ShellOptions) {
    this.#pages = options.pages;
    this.#model = buildModel(options.pages);
    this.#store = options.store;
    this.#pagesUrl = options.pagesUrl;
    this.#version = options.version;
    this.#main = document.getElementById("main")!;
    this.#aside = document.getElementById("aside")!;
    this.#topbarHost = document.getElementById("topbar")!;
    this.#footer = document.getElementById("footer")!;
    this.#skip = document.querySelector<HTMLAnchorElement>(".skip-link");
  }

  get model(): CourseModel {
    return this.#model;
  }

  start(): void {
    // The static no-JavaScript fallback (D-28) stays (hidden by the `js` class) until the first
    // page has rendered, so if boot throws, index.html's head script can show it again.
    const fallback = document.getElementById("fallback");
    this.#main.replaceChildren(...(fallback ? [fallback] : []), this.#noticeSlot, this.#pageRoot);
    this.#main.tabIndex = -1;
    this.#topbarHost.hidden = false;
    setHeadingResolver((lessonId, headingId) => this.#headingText(lessonId, headingId));

    window.addEventListener("hashchange", () => this.route());
    window.addEventListener("storage", (event) => {
      if (event.key === PROGRESS_KEY) this.#store.receive(event.newValue);
    });
    // Flush pending writes when the page is hidden or closed.
    window.addEventListener("pagehide", () => this.#store.flush());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.#store.flush();
    });
    this.#store.subscribe(() => this.#schedule());
    this.#store.onPersistence(() => {
      this.#renderNotice();
      this.#renderFooter();
    });
    window.addEventListener("beforeprint", () => this.#beforePrint());
    window.addEventListener("afterprint", () => this.#afterPrint());
    window.addEventListener("gf:pages-updated", (event) => {
      this.#pages = (event as CustomEvent<readonly ShellPage[]>).detail;
      this.#model = buildModel(this.#pages);
      this.#headingCache.clear();
      this.#view = undefined;
      this.route();
    });

    // The scripted skip link (11.3): focus <main> without touching the hash.
    this.#skip?.addEventListener("click", (event) => {
      event.preventDefault();
      this.#main.focus();
    });
    document.addEventListener("click", (event) => this.#onClick(event));
    // Quiz answers and submissions update the quiz TOC icons.
    for (const type of ["input", "change", "click", "keyup", "gf:quizsubmitted"]) {
      this.#main.addEventListener(type, (event) => {
        if (this.#view?.kind === "quiz" && (event.target as Element).closest?.("gf-quiz")) this.#schedule();
      });
    }

    this.#renderFooter();
    this.#renderNotice();
    this.route();

    // Booted: drop the fallback for good and tell the head script not to bring it back.
    fallback?.remove();
    document.documentElement.classList.add("js");
    document.documentElement.setAttribute("data-booted", "");
  }

  /** Render the route in the address bar (or scroll, when it is the page already shown). */
  route(): void {
    const view = resolveView(parseRoute(location.hash), this.#model);
    if (this.#view && view.key === this.#view.key) {
      this.#goTo(view.target, true);
      return;
    }
    this.#render(view);
  }

  // --- Rendering -----------------------------------------------------------------------------

  #context(): BuildContext {
    this.#regions = [];
    return { model: this.#model, store: this.#store, version: this.#version, regions: this.#regions };
  }

  #render(view: View): void {
    const initial = this.#view === undefined;
    this.#spy?.destroy();
    this.#spy = undefined;
    this.#view = view;
    const state = this.#store.state;
    const ctx = this.#context();
    // Custom elements upgrade as they are inserted: cards restore saved progress here.
    this.#pageRoot.replaceChildren(...(buildMain(view, ctx).filter(Boolean) as Node[]));
    this.#pageRoot.dataset.view = view.kind;
    this.#enhance(this.#pageRoot, view);

    this.#tocItems = this.#tocFor(view, state);
    this.#renderChrome(view, state);

    document.title = view.docTitle;
    if (this.#skip) this.#skip.textContent = view.skipLabel;
    if (view.kind === "lesson" && view.entry) this.#store.visit(view.entry.id);
    this.#renderNotice();

    if (this.#pendingSection && view.kind === "home") {
      const id = `home-outline-${this.#pendingSection}`;
      this.#pendingSection = undefined;
      this.#goTo(id, false);
    } else if (initial && !view.target) {
      // First load: focus stays at the start of the document, so Tab reaches the skip link.
      window.scrollTo(0, 0);
    } else {
      this.#goTo(view.target, false);
    }
    this.#startSpy();
  }

  /** The aside and the top bar with its sheet, both built around the current TOC. */
  #renderChrome(view: View, state: ProgressState): void {
    const toc = this.#tocItems.length ? renderToc(this.#tocItems, "aside-toc") : null;
    this.#aside.replaceChildren(
      renderAside({ model: this.#model, state, labels: view.switcher, currentId: view.currentId, toc }),
    );
    hydrateIcons(this.#aside);
    this.#renderTopbar(view, state);
  }

  #renderTopbar(view: View, state: ProgressState): void {
    document.getElementById("nav-sheet")?.remove();
    const toc = this.#tocItems.length ? renderToc(this.#tocItems, "sheet-toc") : null;
    this.#topbar = renderTopbar({
      model: this.#model,
      state,
      count: view.barCount,
      text: view.barText,
      sheetTitle: view.sheetTitle,
      currentId: view.currentId,
      toc,
      tocItems: this.#tocItems.length,
    });
    this.#topbarHost.replaceChildren(this.#topbar.bar);
    document.body.append(this.#topbar.sheet);
    hydrateIcons(this.#topbarHost);
    hydrateIcons(this.#topbar.sheet);
  }

  #enhance(root: HTMLElement, view: View): void {
    hydrateIcons(root);
    enhanceCodeBlocks(root);
    drawPedigrees(root);
    // Printed exercises point back to the interactive page (ux 15).
    if (view.kind === "lesson" && view.entry) {
      for (const card of root.querySelectorAll<HTMLElement>("[exercise][id]")) {
        card.dataset.printUrl = `${this.#pagesUrl}#/lesson/${view.entry.id}/${card.id}`;
      }
    }
  }

  #renderNotice(): void {
    if (this.#store.persistent || this.#noticeDismissed) {
      this.#noticeSlot.replaceChildren();
      return;
    }
    if (this.#noticeSlot.firstChild) return;
    const notice = storageNotice(this.#store, this.#pagesUrl, () => {
      this.#noticeDismissed = true;
      this.#noticeSlot.replaceChildren();
      document.getElementById("page-title")?.focus();
    });
    hydrateIcons(notice);
    this.#noticeSlot.replaceChildren(notice);
  }

  #renderFooter(): void {
    this.#footer.replaceChildren(...footerContent(this.#store.persistent, this.#version));
    hydrateIcons(this.#footer);
  }

  // --- TOC, scroll and focus -----------------------------------------------------------------

  #tocFor(view: View, state: ProgressState): TocItem[] {
    if (view.kind === "lesson" && view.page && view.entry) {
      const slug = view.entry.id;
      return view.page.toc.map((t) => ({
        id: t.id,
        text: t.text,
        href: `#/lesson/${slug}/${t.id}`,
        status: t.exercise ? exerciseStatus(state, t.exercise) : undefined,
      }));
    }
    if (view.kind === "quiz" && view.entry) return this.#quizToc(view);
    return [];
  }

  /** Questions 1-6 and Results, with icons that mirror the quiz's own answered and graded marks. */
  #quizToc(view: View): TocItem[] {
    const quiz = this.#pageRoot.querySelector<HTMLElement>("gf-quiz");
    if (!quiz) return [];
    type Card = { hasAnswer?: () => boolean; state?: string };
    const hosts = [...quiz.querySelectorAll<HTMLElement & { card?: Card }>("[data-slot][id]")];
    if (!hosts.length) return [];
    const route = view.entry!.route;
    const items: TocItem[] = hosts.map((host, i) => {
      const state = host.card?.state;
      const answered = host.card?.hasAnswer?.() ?? false;
      const status =
        state === "correct"
          ? { icon: "circle-check" as const, text: "correct", tone: "success" }
          : state === "incorrect"
            ? { icon: "circle-x" as const, text: "incorrect", tone: "error" }
            : answered
              ? { icon: "circle-dot-dashed" as const, text: "answered" }
              : { icon: "circle" as const, text: "not answered" };
      return { id: host.id, text: `Question ${i + 1}`, href: route, status };
    });
    const results = quiz.querySelector<HTMLElement>(".quiz-results:not([hidden]) h2[id]");
    // Before grading, "Results" points at the submit area (gf-quiz gives it an id).
    const submit = quiz.querySelector<HTMLElement>(".quiz-actions[id]");
    const target = results ?? submit;
    if (target) items.push({ id: target.id, text: "Results", href: route });
    return items;
  }

  #startSpy(): void {
    if (!this.#tocItems.length) return;
    const texts = new Map(this.#tocItems.map((t) => [t.id, t.text]));
    this.#spy = new ScrollSpy(
      this.#tocItems.map((t) => t.id),
      (id) => {
        markActive(document, id);
        if (this.#view?.kind === "lesson") this.#topbar?.setText(texts.get(id) ?? this.#view.barText);
      },
    );
  }

  /** Scroll to and focus a target id, or the top of the page and the H1. */
  #goTo(target: string | undefined, smooth: boolean): void {
    const el = target ? document.getElementById(target) : null;
    if (el) {
      this.#spy?.lock(el.id);
      el.scrollIntoView({ block: "start", behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
      focusElement(el);
      return;
    }
    window.scrollTo(0, 0);
    const title = document.getElementById("page-title");
    if (title) focusElement(title);
  }

  #onClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    const link = (event.target as Element).closest?.("a");
    if (!link) return;
    // TOC: scroll, replace the hash (no history entry, no re-render), focus the heading.
    if (link.matches("[data-toc] a[data-target]")) {
      const target = link.dataset.target ?? "";
      const el = document.getElementById(target);
      if (!el) return;
      event.preventDefault();
      this.#spy?.lock(target);
      markActive(document, target);
      if (this.#view?.kind === "lesson") history.replaceState(null, "", link.getAttribute("href"));
      const go = () => {
        el.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        focusElement(el);
      };
      // From the sheet: wait until the dialog has closed and restored focus to the bar button.
      if (link.closest("dialog")) setTimeout(go, 0);
      else go();
      return;
    }
    // The breadcrumb's section link opens the home page at that section (ux 4.1).
    const section = link.dataset.homeSection;
    if (section) this.#pendingSection = section;
  }

  #headingText(lessonId: string, headingId: string): string | undefined {
    const page = this.#pages.find((p) => p.meta.kind === "lesson" && p.meta.id === lessonId);
    if (!page) return undefined;
    let fragment = this.#headingCache.get(lessonId);
    if (!fragment) {
      fragment = fromHtml(page.html);
      this.#headingCache.set(lessonId, fragment);
    }
    return fragment.getElementById(headingId)?.textContent?.trim() || undefined;
  }

  // --- Progress-driven updates ---------------------------------------------------------------

  #schedule(): void {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#refresh();
    });
  }

  #refresh(): void {
    const state = this.#store.state;
    for (const r of this.#regions) {
      if (!r.el.isConnected) continue;
      const next = h("div", null, r.build());
      if (next.innerHTML === r.el.innerHTML) continue;
      const focusedHref = (document.activeElement as HTMLElement | null)
        ?.closest?.("a")
        ?.getAttribute("href");
      const hadFocus = r.el.contains(document.activeElement);
      r.el.replaceChildren(...next.childNodes);
      hydrateIcons(r.el);
      if (hadFocus) {
        const again = focusedHref
          ? r.el.querySelector<HTMLElement>(`a[href="${CSS.escape(focusedHref)}"]`)
          : null;
        (again ?? document.getElementById("page-title"))?.focus({ preventScroll: true });
      }
    }
    refreshOutline(document, this.#model, state);
    updateProgressBars(document, this.#model, state);
    if (this.#view) {
      const items = this.#tocFor(this.#view, state);
      if (
        this.#view.kind === "quiz" &&
        items.map((i) => i.id).join() !== this.#tocItems.map((i) => i.id).join()
      ) {
        // The quiz drew, redrew (a retake) or graded its questions: rebuild the aside and the
        // sheet around the new TOC, and the scroll-spy.
        this.#tocItems = items;
        this.#spy?.destroy();
        this.#renderChrome(this.#view, state);
        this.#startSpy();
      } else {
        this.#tocItems = items;
        refreshTocStatus(document, items);
      }
    }
    if (badgeEarned(this.#model, state) && !state.badge.earnedAt) this.#store.markBadgeEarned();
  }

  // --- Print (ux 15) -------------------------------------------------------------------------

  #openedForPrint: HTMLDetailsElement[] = [];

  #beforePrint(): void {
    this.#openedForPrint = [...document.querySelectorAll<HTMLDetailsElement>("main details:not([open])")];
    for (const d of this.#openedForPrint) d.open = true;
  }

  #afterPrint(): void {
    for (const d of this.#openedForPrint) d.open = false;
    this.#openedForPrint = [];
  }
}

function exerciseStatus(state: ProgressState, exerciseId: string): TocItem["status"] {
  const lessonId = exerciseId.split("/")[0] ?? "";
  const record = state.lessons[lessonId]?.exercises[exerciseId];
  if (record?.state === "correct" || record?.state === "revealed")
    return { icon: "circle-check", text: "complete", tone: "success" };
  if (record && record.state !== "idle") return { icon: "circle-dot-dashed", text: "in progress" };
  return { icon: "circle", text: "not started" };
}
