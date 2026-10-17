// Progress transfer on the home and About pages and in the storage notice (ux 12.2-12.3;
// docs/PLAN.md 10.4, 11.4, D-23, D-36): "Copy progress code" (also shown in a read-only field,
// since copying can fail on file://), "Paste progress code" with a merge-by-default import
// ("Replace my progress" is an explicit choice), and "Download progress (.json)".
import { COPY_FAILED, copyText, downloadText } from "../ui/copy.ts";
import { h, iconSpan } from "./dom.ts";
import { decodeProgress, encodeProgress, ProgressCodeError, summarize } from "./progress-code.ts";
import type { CourseStore } from "./progress-store.ts";
import type { ProgressState } from "./progress-types.ts";

/** Encode the current progress and try to copy it. */
export async function copyProgressCode(store: CourseStore): Promise<{ code: string; copied: boolean }> {
  store.flush();
  const code = await encodeProgress(store.state);
  return { code, copied: await copyText(code) };
}

/** A read-only field holding a code, selected so Ctrl+C works when copying failed. */
export function codeField(idPrefix: string): { wrap: HTMLElement; show(code: string): void } {
  const area = h("textarea", {
    id: `${idPrefix}-code`,
    class: "code-field",
    readonly: true,
    rows: 3,
    spellcheck: "false",
  });
  const wrap = h(
    "div",
    { class: "code-output", hidden: true },
    h("label", { for: area.id, class: "field-label" }, "Your progress code"),
    area,
  );
  return {
    wrap,
    show(code: string) {
      area.value = code;
      wrap.hidden = false;
      area.select();
    },
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function describe(state: ProgressState): string {
  const s = summarize(state);
  const parts = [
    plural(s.exercises, "completed exercise", "completed exercises"),
    plural(s.quizzes, "passed quiz", "passed quizzes"),
  ];
  if (s.files) parts.push(plural(s.files, "triaged capstone file", "triaged capstone files"));
  return `${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " and " : ""}${parts.at(-1)}`;
}

const today = () => new Date().toISOString().slice(0, 10);

export function progressTools(store: CourseStore, idPrefix: string): HTMLElement {
  const status = h("p", { class: "tool-status", role: "status" });
  const field = codeField(idPrefix);
  const copy = h(
    "button",
    {
      type: "button",
      class: "button-secondary",
      onclick: async () => {
        status.textContent = "";
        const { code, copied } = await copyProgressCode(store);
        field.show(code);
        status.textContent = copied
          ? "Copied to clipboard. Paste it into the other copy of the course."
          : COPY_FAILED;
      },
    },
    iconSpan("copy"),
    "Copy progress code",
  );
  const download = h(
    "button",
    {
      type: "button",
      class: "button-secondary",
      onclick: () => {
        store.flush();
        downloadText(`genomic-file-formats-progress-${today()}.json`, store.toJson());
        status.textContent = "Download started.";
      },
    },
    iconSpan("download"),
    "Download progress (.json)",
  );

  // Import.
  const input = h("textarea", {
    id: `${idPrefix}-paste`,
    class: "code-field",
    rows: 3,
    spellcheck: "false",
    autocomplete: "off",
    autocapitalize: "off",
    "aria-describedby": `${idPrefix}-paste-message`,
  });
  const message = h("p", { class: "field-message", id: `${idPrefix}-paste-message`, role: "status" });
  const confirm = h("div", { class: "import-confirm", hidden: true });
  let pending: ProgressState | null = null;
  const finish = (text: string) => {
    pending = null;
    confirm.hidden = true;
    confirm.replaceChildren();
    input.value = "";
    message.textContent = text;
    input.focus();
  };
  const form = h(
    "form",
    {
      class: "code-import",
      novalidate: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        message.textContent = "";
        input.removeAttribute("aria-invalid");
        if (!input.value.trim()) {
          input.setAttribute("aria-invalid", "true");
          message.textContent = "Paste a progress code first.";
          return;
        }
        try {
          pending = await decodeProgress(input.value);
        } catch (error) {
          input.setAttribute("aria-invalid", "true");
          message.textContent =
            error instanceof ProgressCodeError ? error.message : "This progress code could not be read.";
          return;
        }
        const imported = pending;
        const text = h(
          "p",
          { class: "import-confirm-text", tabindex: "-1" },
          `This code holds ${describe(imported)}. Add it to the progress saved here? Nothing you have done here is lost.`,
        );
        confirm.replaceChildren(
          text,
          h(
            "div",
            { class: "tool-row" },
            h(
              "button",
              {
                type: "button",
                class: "button-primary",
                onclick: () => {
                  store.importState(imported, "merge");
                  finish("Progress imported and merged.");
                },
              },
              "Merge",
            ),
            h(
              "button",
              {
                type: "button",
                class: "button-secondary",
                onclick: () => {
                  store.importState(imported, "replace");
                  finish("Progress replaced with the imported code.");
                },
              },
              "Replace my progress",
            ),
            h(
              "button",
              { type: "button", class: "button-text", onclick: () => finish("Import cancelled.") },
              "Cancel",
            ),
          ),
        );
        confirm.hidden = false;
        text.focus();
      },
    },
    h("label", { for: input.id, class: "field-label" }, "Paste a progress code"),
    input,
    h(
      "div",
      { class: "tool-row" },
      h("button", { type: "submit", class: "button-secondary" }, iconSpan("clipboard-paste"), "Import"),
    ),
    message,
  );

  return h(
    "div",
    { class: "progress-tools" },
    h(
      "p",
      null,
      "The hosted course and a saved copy keep separate progress. A progress code moves yours from one to the other. It holds your results, not your answers.",
    ),
    h("div", { class: "tool-row" }, copy, download),
    status,
    field.wrap,
    form,
    confirm,
  );
}
