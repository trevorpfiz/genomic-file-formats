// The M0 shell: hash routing, compiled lesson HTML, one vanilla widget and one Preact island.
// M1 replaces it with the full shell (aside, outline, progress, theme and prev/next).
import "./styles/base.css";
import "./widgets/predict.ts";
import "./widgets/simulator.tsx";
import { sections } from "../content/course.ts";
import { escapeHtml } from "./shell/html.ts";
import { pages as initialPages, type Page } from "./shell/lessons.ts";
import { lessonHref, parseRoute, type Route } from "./shell/router.ts";
import { initThemeToggle } from "./shell/theme.ts";

const SITE = "Genomic File Formats";
let pages = initialPages;
const main = document.querySelector<HTMLElement>("#main")!;
const aside = document.querySelector<HTMLElement>("#aside")!;

const lessonPages = () => pages.filter((p) => p.meta.kind === "lesson");

function renderHome(): string {
  document.title = SITE;
  const items = lessonPages()
    .map(
      (p, i) =>
        `<li><a href="${lessonHref(p.meta.id)}">Lesson ${i + 1}: ${escapeHtml(p.meta.title)}</a></li>`,
    )
    .join("");
  aside.replaceChildren();
  return `<h1 tabindex="-1">${SITE}</h1>
    <p>An interactive course on the file formats of genomics. Version ${escapeHtml(__COURSE_VERSION__)}.</p>
    <h2>Lessons</h2><ol class="outline">${items}</ol>`;
}

function renderLesson(page: Page, number: number): string {
  const meta = page.meta;
  const section = "section" in meta ? sections.find((s) => s.id === meta.section)?.title : undefined;
  document.title = `${meta.title} · Lesson ${number} · ${SITE}`;
  const minutes = "minutes" in meta && meta.minutes ? `<span class="pill">${meta.minutes} min</span>` : "";
  const toc = page.toc
    .map(
      (t) =>
        `<li><a href="${lessonHref(meta.id, t.id)}" data-target="${t.id}">${escapeHtml(t.text)}</a></li>`,
    )
    .join("");
  aside.innerHTML = `<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ol>${toc}</ol></nav>`;
  for (const link of aside.querySelectorAll<HTMLAnchorElement>(".toc a")) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById(link.dataset.target ?? "")?.scrollIntoView();
      history.replaceState(null, "", link.getAttribute("href"));
    });
  }
  return `<nav class="crumbs" aria-label="Breadcrumb"><a href="#/">${SITE}</a>${section ? ` / ${escapeHtml(section)}` : ""}</nav>
    <h1 tabindex="-1">${escapeHtml(meta.title)}</h1>
    <p class="pills"><span class="pill">Lesson ${number}</span>${minutes}</p>
    <article class="prose">${page.html}</article>`;
}

function renderNotFound(route: Route): string {
  document.title = `Not found · ${SITE}`;
  aside.replaceChildren();
  const what = route.name === "not-found" ? "This page does not exist." : "This page is not built yet.";
  return `<h1 tabindex="-1">Not found</h1><p>${what} <a href="#/">Go to the course home</a>.</p>`;
}

function render(): void {
  const route = parseRoute(location.hash);
  let target: string | undefined;
  if (route.name === "home") {
    main.innerHTML = renderHome();
  } else if (route.name === "lesson") {
    const index = lessonPages().findIndex((p) => p.meta.id === route.slug);
    const page = lessonPages()[index];
    main.innerHTML = page
      ? renderLesson(page, index + 1)
      : renderNotFound({ name: "not-found", hash: location.hash });
    target = page ? route.target : undefined;
  } else {
    main.innerHTML = renderNotFound(route);
  }
  const focus = (target && document.getElementById(target)) || main.querySelector<HTMLElement>("h1");
  if (target && focus) {
    focus.scrollIntoView();
  } else {
    window.scrollTo(0, 0);
  }
  if (focus && !focus.hasAttribute("tabindex")) focus.tabIndex = -1;
  focus?.focus({ preventScroll: true });
}

window.addEventListener("hashchange", render);
window.addEventListener("gf:pages-updated", (event) => {
  pages = (event as CustomEvent<readonly Page[]>).detail;
  render();
});
initThemeToggle(document.querySelector<HTMLButtonElement>("#theme-toggle"));
render();
