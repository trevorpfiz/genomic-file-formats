// Inline markup for strings in exercise data (prompts, options, explanations, "Why?" texts).
// Data strings are plain text with three marks, matching the lesson Markdown authors know:
//   `code`   -> <code>code</code>   (genomic tokens, file values: `<DEL>`, `1000`)
//   *gene*   -> <i>gene</i>         (gene symbols are italic in prose: *SCN1A*)
//   **lead** -> <strong>lead</strong>
//   ^{-1.2}  -> <sup>-1.2</sup>     (exponents: 10^{-1.2}; the fonts lack Unicode superscripts)
// Everything else is escaped. Inside backticks nothing is interpreted.

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);

/** Convert one data string to safe HTML. */
export function inlineHtml(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part) => {
      if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escape(part.slice(1, -1))}</code>`;
      }
      return escape(part)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*\s][^*]*)\*/g, "<i>$1</i>")
        .replace(/\^\{([^}]*)\}/g, "<sup>$1</sup>");
    })
    .join("");
}

/** The same as inlineHtml, as nodes to append. */
export function inlineNodes(text: string, doc: Document = document): DocumentFragment {
  const template = doc.createElement("template");
  template.innerHTML = inlineHtml(text);
  return template.content;
}
