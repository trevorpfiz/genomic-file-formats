// Code blocks with a Copy button (ux 4.6; docs/PLAN.md 7.8). The compiler emits
//   <div class="code-block" data-lang="sh"><p class="code-block-title">…</p><pre><code>…</code></pre></div>
// and the shell adds a 32px icon button named "Copy code". On success the icon becomes a check
// with a visible "Copied" label for 2 s and a polite status region says "Copied to clipboard."
// Shell blocks copy only their command lines, without the "$ " prompt. The <pre> becomes a
// focusable region named "<title or Code>, scrollable".
import { icon } from "../shell/icons.ts";
import { COPY_FAILED, copyText } from "./copy.ts";

/** The text a block copies: for shell sessions with "$ " prompts, the commands only. */
export function copyableText(text: string, lang: string | undefined): string {
  const body = text.replace(/\n$/, "");
  if (!lang || !/^(sh|bash|shell|console|zsh)$/.test(lang)) return body;
  const lines = body.split("\n");
  if (!lines.some((l) => l.startsWith("$ "))) return body;
  return lines
    .filter((l) => l.startsWith("$ "))
    .map((l) => l.slice(2))
    .join("\n");
}

export function enhanceCodeBlocks(root: ParentNode): void {
  for (const block of root.querySelectorAll<HTMLElement>(".code-block")) {
    if (block.querySelector(":scope > .code-copy")) continue;
    const code = block.querySelector("pre code");
    const pre = code?.parentElement;
    if (!code || !pre) continue;
    const text = code.textContent ?? "";
    // A long line scrolls inside the block at phone widths (and at 400% zoom), so the block is
    // a named, focusable region that keyboard users can scroll (WCAG 2.1.1; axe
    // scrollable-region-focusable), as snippet bodies are.
    const title = block.querySelector(":scope > .code-block-title")?.textContent?.trim();
    pre.tabIndex = 0;
    pre.setAttribute("role", "region");
    pre.setAttribute("aria-label", `${title || "Code"}, scrollable`);
    block.toggleAttribute("data-single-line", !text.replace(/\n$/, "").includes("\n"));
    const status = document.createElement("span");
    status.className = "visually-hidden";
    status.setAttribute("role", "status");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy";
    button.setAttribute("aria-label", "Copy code");
    const idle = () => {
      button.innerHTML = icon("copy");
      delete button.dataset.copied;
    };
    idle();
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener("click", () => {
      void copyText(copyableText(text, block.dataset.lang)).then((ok) => {
        status.textContent = "";
        if (ok) {
          button.innerHTML = `${icon("check")}<span class="code-copy-label">Copied</span>`;
          button.dataset.copied = "";
          status.textContent = "Copied to clipboard.";
          clearTimeout(timer);
          timer = setTimeout(idle, 2000);
        } else {
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          status.textContent = COPY_FAILED;
        }
      });
    });
    block.append(button, status);
  }
}
