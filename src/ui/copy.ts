// Copy and download helpers (ux 4.6; D-27). Copy tries the Clipboard API, then a hidden
// textarea with execCommand; file:// pages are not a secure context in every browser, so
// callers must handle `false` (show the text selected and ask for Ctrl+C).

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea path.
  }
  const area = document.createElement("textarea");
  try {
    area.value = text;
    area.setAttribute("readonly", "");
    area.className = "visually-hidden";
    document.body.append(area);
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Save text under a filename through a Blob URL. */
export function downloadText(filename: string, text: string, type = "application/json"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The copy message for screen readers and the visible label (ux 4.6). */
export const COPY_FAILED =
  "Could not copy automatically. The text is selected: press Ctrl+C, or Command+C on a Mac.";
