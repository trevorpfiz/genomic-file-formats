// The storage notice and the footer (ux 4, 12.2; docs/PLAN.md 11.4, D-29). Without storage
// (Safari on file://, private windows, blocked site data) or after a failed write, progress
// lives in memory: a notice at the top of <main>, once per session, offers the progress code
// and the hosted copy; the footer reads "Progress not saved".
import { COPY_FAILED } from "../ui/copy.ts";
import { SITE } from "./course-model.ts";
import { h, iconSpan } from "./dom.ts";
import type { CourseStore, MemoryReason } from "./progress-store.ts";
import { codeField, copyProgressCode } from "./progress-tools.ts";

const TEXT: Record<MemoryReason, string> = {
  unavailable:
    "Your progress can't be saved in this browser window. You can keep going. To keep your progress, copy a progress code before you close the page, or use the online copy of the course.",
  "write-failed":
    "Your progress could not be saved in this browser, so it is kept for this session only. To keep it, copy a progress code before you close the page.",
  "newer-schema":
    "A newer version of this course saved progress in this browser. This version leaves it unchanged and keeps your progress for this session only.",
};

export function storageNotice(store: CourseStore, pagesUrl: string, onDismiss: () => void): HTMLElement {
  const reason = store.memoryReason ?? "unavailable";
  const status = h("p", { class: "notice-status", role: "status" });
  const field = codeField("notice");
  const notice = h(
    "section",
    { class: "notice", "data-tone": "warning", "aria-labelledby": "notice-title" },
    h("p", { class: "notice-title", id: "notice-title" }, iconSpan("triangle-alert"), "Progress not saved"),
    h(
      "p",
      { class: "notice-text" },
      TEXT[reason],
      reason === "unavailable" ? [" ", h("a", { href: pagesUrl }, "Open the online copy"), "."] : null,
    ),
    h(
      "div",
      { class: "tool-row" },
      h(
        "button",
        {
          type: "button",
          class: "button-secondary",
          onclick: async () => {
            const { code, copied } = await copyProgressCode(store);
            field.show(code);
            status.textContent = copied ? "Copied to clipboard." : COPY_FAILED;
          },
        },
        iconSpan("copy"),
        "Copy progress code",
      ),
      h("button", { type: "button", class: "button-text", onclick: onDismiss }, "Dismiss"),
    ),
    status,
    field.wrap,
  );
  return notice;
}

/** The footer: save status, About, license and version. */
export function footerContent(persistent: boolean, version: string): Node[] {
  return [
    h(
      "p",
      {
        class: "footer-status",
        "data-tone": persistent ? "success" : "warning",
        "data-persistent": String(persistent),
      },
      iconSpan(persistent ? "circle-check" : "triangle-alert"),
      persistent ? "Progress saved in this browser" : "Progress not saved",
    ),
    h(
      "p",
      { class: "footer-links" },
      h("a", { href: "#/about" }, "About this course"),
      h("span", { "aria-hidden": "true", class: "footer-sep" }, "·"),
      `${SITE} is MIT licensed`,
      h("span", { "aria-hidden": "true", class: "footer-sep" }, "·"),
      `Version ${version}`,
    ),
  ];
}
