// Theme control. The inline script in index.html applies the saved choice before first paint;
// this module wires the toggle. Storage can throw (Safari on file://), so every access is guarded.
export const THEME_KEY = "genomic-file-formats:theme";

type Theme = "light" | "dark";

function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function label(button: HTMLButtonElement) {
  const next = currentTheme() === "dark" ? "light" : "dark";
  button.textContent = `Use ${next} theme`;
}

export function initThemeToggle(button: HTMLButtonElement | null): void {
  if (!button) return;
  button.hidden = false;
  label(button);
  button.addEventListener("click", () => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not persisted; the choice still applies to this page.
    }
    label(button);
  });
}
