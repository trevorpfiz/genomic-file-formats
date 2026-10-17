// @vitest-environment happy-dom
// Shared UI pieces: the pedigree glyph's label matches the compiler's (D-17), code blocks copy
// commands without prompts (ux 4.6), and the radio menu follows the APG keyboard pattern.
import { describe, expect, test } from "vite-plus/test";
import { PEDIGREE_LABEL as COMPILER_LABEL } from "../../plugins/lesson-compiler.ts";
import { copyableText, enhanceCodeBlocks } from "./code-block.ts";
import { radioMenu } from "./menu-button.ts";
import { drawPedigrees, PEDIGREE_LABEL } from "./pedigree.ts";

describe("pedigree glyph", () => {
  test("its label is the compiler's label", () => {
    expect(PEDIGREE_LABEL).toBe(COMPILER_LABEL);
  });

  test("fills each placeholder once, as a labelled image", () => {
    document.body.innerHTML = `<p><span class="case-pedigree" data-pedigree="trio"></span></p>`;
    drawPedigrees(document);
    drawPedigrees(document);
    const span = document.querySelector(".case-pedigree")!;
    expect(span.getAttribute("role")).toBe("img");
    expect(span.getAttribute("aria-label")).toBe(PEDIGREE_LABEL);
    expect(span.querySelectorAll("svg")).toHaveLength(1);
  });
});

describe("code blocks", () => {
  test("shell sessions copy their commands without the prompt", () => {
    const text = "$ samtools faidx ref.fa\nchr1\t248956422\n$ head ref.fa.fai\n";
    expect(copyableText(text, "sh")).toBe("samtools faidx ref.fa\nhead ref.fa.fai");
    expect(copyableText("samtools faidx ref.fa\n", "sh")).toBe("samtools faidx ref.fa");
    expect(copyableText("$ not a prompt in text\n", "text")).toBe("$ not a prompt in text");
  });

  test("get one Copy button, and single-line blocks are marked", () => {
    document.body.innerHTML = `<div class="code-block" data-lang="sh"><pre><code>$ ls\n</code></pre></div>`;
    enhanceCodeBlocks(document);
    enhanceCodeBlocks(document);
    const block = document.querySelector<HTMLElement>(".code-block")!;
    expect(block.querySelectorAll("button.code-copy")).toHaveLength(1);
    expect(block.querySelector("button")!.getAttribute("aria-label")).toBe("Copy code");
    expect(block.hasAttribute("data-single-line")).toBe(true);
    expect(block.querySelector("[role=status]")).not.toBeNull();
    const pre = block.querySelector("pre")!;
    expect([pre.tabIndex, pre.getAttribute("role"), pre.getAttribute("aria-label")]).toEqual([
      0,
      "region",
      "Code, scrollable",
    ]);
  });
});

describe("radio menu", () => {
  test("opens on the checked item, moves with arrows, chooses with Enter and returns focus", () => {
    const chosen: string[] = [];
    const menu = radioMenu({
      idPrefix: "t",
      items: [
        { value: "system", label: "System" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
      ],
      value: "light",
      menuLabel: "Theme",
      renderButton: (button, item) => (button.textContent = `Theme: ${item.label}`),
      onChange: (v) => chosen.push(v),
    });
    document.body.replaceChildren(menu.element);
    const button = menu.button;
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect((document.activeElement as HTMLElement).dataset.value).toBe("light");
    const list = document.querySelector("[role=menu]")!;
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect((document.activeElement as HTMLElement).dataset.value).toBe("dark");
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect((document.activeElement as HTMLElement).dataset.value).toBe("system");
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(chosen).toEqual(["system"]);
    expect(button.textContent).toBe("Theme: System");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    const checked = [...document.querySelectorAll("[role=menuitemradio]")].map((li) =>
      li.getAttribute("aria-checked"),
    );
    expect(checked).toEqual(["true", "false", "false"]);
    // Escape closes without choosing.
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    expect((document.activeElement as HTMLElement).dataset.value).toBe("dark");
    list.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(chosen).toEqual(["system"]);
  });
});
