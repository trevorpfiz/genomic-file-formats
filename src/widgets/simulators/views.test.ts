// @vitest-environment happy-dom
// Simulator islands in the DOM (docs/PLAN.md 7.5, 11.6): every goal is reached with the
// keyboard only (native controls, typed values, PageUp/PageDown, buttons), every control has a
// name and nothing interactive hides inside the decorative figures. Also: "Show me" after two
// tries, the debounced readout, Play/Step/Start over and reduced motion, and a restored card.
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { SimulatorExercise } from "../../exercises/types.ts";
import { MemoryProgressStore, setProgressStore } from "../card.ts";
import { choose, mount, press, type, type Host } from "../test-utils.ts";
import { READOUT_DELAY_MS } from "./shared.tsx";
import { BGZF_DEMO, FIND_THE_BYTE, QUALITY_AS_PROBABILITY } from "./test-fixtures.ts";

let store: MemoryProgressStore;
beforeEach(async () => {
  await import("../simulator.tsx");
  store = new MemoryProgressStore();
  setProgressStore(store);
});
afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

/** The control a visible label names. */
function control<E extends HTMLElement = HTMLInputElement>(host: HTMLElement, label: string): E {
  const match = [...host.querySelectorAll("label")].find((l) => l.textContent?.trim() === label);
  if (!match) throw new Error(`no label "${label}"`);
  const target = match.htmlFor
    ? host.ownerDocument.getElementById(match.htmlFor)
    : match.querySelector("input");
  if (!target) throw new Error(`label "${label}" names nothing`);
  return target as E;
}
const button = (host: HTMLElement, name: string) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>(".island button")].find(
    (b) => b.textContent?.trim() === name,
  );
  if (!found) throw new Error(`no button "${name}"`);
  return found;
};
const textRows = (host: HTMLElement) =>
  Object.fromEntries(
    [...host.querySelectorAll(".sim-text-view tbody tr")].map((tr) => [
      tr.querySelector("th")?.textContent ?? "",
      tr.querySelector("td")?.textContent ?? "",
    ]),
  );
const goalStatus = (host: HTMLElement) =>
  Object.fromEntries(
    [...host.querySelectorAll<HTMLElement>(".sim-goal")].map((li) => [li.dataset.goal, li.dataset.status]),
  );

function accessibleName(el: HTMLElement): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy)
    return labelledBy
      .split(" ")
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
  if (el.getAttribute("aria-label")) return el.getAttribute("aria-label")!.trim();
  if (el.id) {
    const label = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim() ?? "";
  }
  const wrapping = el.closest("label");
  if (wrapping) return wrapping.textContent?.trim() ?? "";
  return el.tagName === "BUTTON" ? (el.textContent?.trim() ?? "") : "";
}

/** Every focusable thing is a native control (or a labelled scroll region) with a name. */
function expectKeyboardOperable(host: HTMLElement) {
  const island = host.querySelector<HTMLElement>(".island")!;
  const focusable = [
    ...island.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]"),
  ].filter((el) => el.getAttribute("tabindex") !== "-1");
  expect(focusable.length).toBeGreaterThan(3);
  for (const el of focusable) {
    const native = ["BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName);
    expect(native || el.getAttribute("role") === "region", el.outerHTML.slice(0, 80)).toBe(true);
    expect(accessibleName(el), el.outerHTML.slice(0, 80)).not.toBe("");
  }
  for (const hidden of island.querySelectorAll('[aria-hidden="true"]'))
    expect(hidden.querySelector("button, input, select, textarea, [tabindex]")).toBeNull();
}

describe("fai-calculator", () => {
  test("both L05.1 goals by keyboard: base 45, then chr1:10,001 in three copies", async () => {
    const { host, solved, live } = mount<SimulatorExercise>("gf-simulator", FIND_THE_BYTE, {
      "data-mode": "try-it",
    });
    expectKeyboardOperable(host);
    expect(textRows(host)["Byte"]).toBe("38 + 0 × 21 + 0 = 38");
    expect(host.querySelector(".sim-goals-count")?.textContent).toBe("(0 of 2 reached)");

    type(control(host, "Position (1-based)"), "45");
    await vi.waitFor(() => expect(textRows(host)["Byte"]).toBe("38 + 2 × 21 + 4 = 84"));
    expect(textRows(host)["Byte 84 holds"]).toBe("base 45 of chrM_demo (p = 44), A");
    expect(control(host, "Byte offset in the file").value).toBe("84");
    await vi.waitFor(() => expect(goalStatus(host)["base-45"]).toBe("reached"));
    expect(live()).toMatch(/^Goal reached: Find the byte that holds base 45 of chrM_demo\./);
    expect(host.dataset.state).toBe("attempted");
    expect(host.querySelector(".sim-fai-segment[data-target] mark")?.textContent).toBe("A");

    button(host, "UCSC chr1").click();
    await vi.waitFor(() =>
      expect(host.querySelector(".sim-fai-row legend")?.textContent).toContain("iGenomes UCSC hg38"),
    );
    type(control(host, "Position (1-based)"), "10001");
    await vi.waitFor(() => expect(textRows(host)["Byte"]).toBe("6 + 200 × 51 + 0 = 10,206"));
    button(host, "NCBI chr1").click();
    await vi.waitFor(() => expect(textRows(host)["Byte"]).toBe("112 + 142 × 71 + 60 = 10,254"));
    expect(solved).not.toHaveBeenCalled();
    button(host, "Broad chr1").click();
    await vi.waitFor(() => expect(textRows(host)["Byte"]).toBe("112 + 100 × 101 + 0 = 10,212"));
    await vi.waitFor(() => expect(host.dataset.state).toBe("correct"));
    expect(goalStatus(host)).toEqual({ "base-45": "reached", "three-copies": "reached" });
    expect(solved).toHaveBeenCalledTimes(1);
    expect(textRows(host)["Byte 10,212 holds"]).toBe("base 10,001 of chr1 (p = 10,000), T");

    // Free exploration stays open after completion.
    button(host, "Next base").click();
    await vi.waitFor(() => expect(textRows(host)["Byte"]).toBe("112 + 100 × 101 + 1 = 10,213"));
    expect(solved).toHaveBeenCalledTimes(1);
  });

  test("PageUp and PageDown move a line; 0-based p; the byte field binds back", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", FIND_THE_BYTE);
    const position = control(host, "Position (1-based)");
    const page = press(position, "PageUp");
    expect(page.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(control(host, "Position (1-based)").value).toBe("21"));
    expect(textRows(host)["Byte"]).toBe("38 + 1 × 21 + 0 = 59");
    press(control(host, "Position (1-based)"), "PageDown");
    await vi.waitFor(() => expect(control(host, "Position (1-based)").value).toBe("1"));

    choose(control(host, "0-based p, as in the formula"));
    await vi.waitFor(() => expect(control(host, "Position p (0-based)").value).toBe("0"));
    type(control(host, "Position p (0-based)"), "44");
    await vi.waitFor(() => expect(textRows(host)["Byte"]).toBe("38 + 2 × 21 + 4 = 84"));

    type(control(host, "Byte offset in the file"), "58");
    await vi.waitFor(() =>
      expect(textRows(host)["Byte 58 holds"]).toBe("the newline (LF) ending sequence line 1"),
    );
    expect(control(host, "Position p (0-based)").value).toBe("");
    expect(host.querySelector(".sim-eol[data-target]")?.textContent).toBe("LF");
    button(host, "Next base").click();
    await vi.waitFor(() => expect(control(host, "Position p (0-based)").value).toBe("20"));
  });

  test("an invalid column is refused with a notice and the field returns to its value", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", FIND_THE_BYTE);
    const width = control(host, "LINEWIDTH");
    type(width, "20");
    await vi.waitFor(() =>
      expect(host.querySelector(".sim-notice")?.textContent).toBe(
        "LINEWIDTH counts the line terminator too, so it must be larger than LINEBASES.",
      ),
    );
    expect(control(host, "LINEWIDTH").value).toBe("21");
    type(control(host, "LINEWIDTH"), "22");
    await vi.waitFor(() =>
      expect(host.querySelector(".sim-fai-row legend")?.textContent).toContain("(edited)"),
    );
    expect(host.querySelector(".sim-notice")?.hasAttribute("data-empty")).toBe(true);
  });

  test("Show me appears after two tries, sets the state and marks the goal shown", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", FIND_THE_BYTE);
    expect(host.querySelector(".sim-show-me")).toBeNull();
    button(host, "Next base").click();
    await vi.waitFor(() => expect(textRows(host)["Byte"]).toBe("38 + 0 × 21 + 1 = 39"));
    expect(host.querySelector(".sim-show-me")).toBeNull();
    button(host, "Next base").click();
    await vi.waitFor(() => expect(host.querySelectorAll(".sim-show-me")).toHaveLength(2));
    const show = host.querySelector<HTMLButtonElement>('[data-goal="base-45"] .sim-show-me')!;
    expect(accessibleName(show)).toBe("Show me");
    expect(host.ownerDocument.getElementById(show.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Find the byte that holds base 45 of chrM_demo.",
    );
    show.click();
    await vi.waitFor(() => expect(goalStatus(host)["base-45"]).toBe("shown"));
    expect(textRows(host)["Byte"]).toBe("38 + 2 × 21 + 4 = 84");
    await vi.waitFor(() => expect(document.activeElement?.getAttribute("data-goal")).toBe("base-45"));
    expect(host.querySelector('[data-goal="base-45"] .sim-goal-explanation')?.textContent).toMatch(/^p = 44/);
  });
});

describe("phred-converter", () => {
  test("decoding I, 5, ? and # by keyboard completes the card", async () => {
    const { host, solved } = mount<SimulatorExercise>("gf-simulator", QUALITY_AS_PROBABILITY);
    expectKeyboardOperable(host);
    const readout = () =>
      host.querySelector(".sim-phred-converter ~ * .sim-readout-text, .sim-readout-text")?.textContent;
    expect(readout()).toBe(
      "Converter: `+` is Q10: error probability 0.1 (1 in 10), accuracy 90%.".replace(/`/g, ""),
    );
    for (const [char, q] of [
      ["I", "Q40"],
      ["5", "Q20"],
      ["?", "Q30"],
    ] as const) {
      type(control(host, "Character"), char);
      await vi.waitFor(() => expect(host.querySelector(".sim-output")?.textContent).toBe(q));
    }
    expect(solved).not.toHaveBeenCalled();
    type(control(host, "Character"), "#");
    await vi.waitFor(() => expect(host.dataset.state).toBe("correct"));
    expect(solved).toHaveBeenCalledTimes(1);
    expect(readout()).toBe("Converter: # is Q2: error probability 0.631 (1 in 1.6), accuracy 37%.");
  });

  test("the Q slider steps by 10 with PageUp; P and the bins bind back", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", QUALITY_AS_PROBABILITY);
    const slider = control(host, "Q");
    expect(slider.getAttribute("aria-valuetext")).toBe("Q10, character +, error probability 0.1");
    expect(press(slider, "PageUp").defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(control(host, "Q").value).toBe("20"));
    expect(control(host, "Character").value).toBe("5");
    expect(control(host, "Error probability").value).toBe("0.01");
    press(control(host, "Q"), "PageDown");
    await vi.waitFor(() => expect(control(host, "Q").value).toBe("10"));

    type(control(host, "Error probability"), "0.001");
    await vi.waitFor(() => expect(control(host, "Character").value).toBe("?"));
    type(control(host, "Error probability"), "2");
    await vi.waitFor(() =>
      expect(host.querySelector(".sim-notice")?.textContent).toBe(
        "An error probability is a number above 0 and at most 1, such as 0.001.",
      ),
    );
    expect(control(host, "Error probability").value).toBe("0.001");

    button(host, "F Q37").click();
    await vi.waitFor(() => expect(host.querySelector(".sim-output")?.textContent).toBe("Q37"));
    expect(host.querySelector(".sim-grid-cell[data-current]")?.textContent).toBe("F");

    type(control(host, "Character"), " ");
    await vi.waitFor(() =>
      expect(host.querySelector(".sim-notice")?.textContent).toMatch(/^Quality characters run from/),
    );
    expect(control(host, "Character").value).toBe("F");
  });

  test("a quality string adds up in the text view (seq EX-07)", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", QUALITY_AS_PROBABILITY);
    type(control(host, "Quality string"), "IIII #");
    await vi.waitFor(() => expect(textRows(host)["All"]).toBe(""));
    const cells = [...host.querySelectorAll(".sim-text-view tbody tr")].map((tr) =>
      [...tr.children].map((c) => c.textContent),
    );
    expect(cells).toEqual([
      ["I", "Q40", "0.0001", "4", "0.0004"],
      ["#", "Q2", "0.631", "1", "0.631"],
      ["All", "", "", "5", "0.6314"],
    ]);
    expect(control(host, "Quality string").value).toBe("IIII#");
    expect(host.querySelector(".sim-notice")?.textContent).toBe(
      "A quality string holds only the characters ! to ~: no spaces.",
    );
    expect(host.querySelector(".sim-note")?.textContent).toBe(
      "Averaging the Q values gives Q32.4, which hides the worst bases. Average the error probabilities instead: 0.126 per base, which is Q9.0.",
    );
    button(host, "The proband's first read").click();
    await vi.waitFor(() => expect(control(host, "Quality string").value).toHaveLength(150));
  });
});

test("phred-converter with sum: false has no quality string field", async () => {
  const { host } = mount<SimulatorExercise>("gf-simulator", {
    ...QUALITY_AS_PROBABILITY,
    init: { q: 10, sum: false },
    presets: [],
  });
  expect(host.querySelector(".sim-phred-quality")).toBeNull();
  expect(host.querySelectorAll(".sim-text-view tbody tr")).toHaveLength(1);
  expectKeyboardOperable(host);
});

describe("bgzf-demo", () => {
  test("all three goals by keyboard: BGZF fetch, gzip fetch, EOF check", async () => {
    const { host, solved } = mount<SimulatorExercise>("gf-simulator", BGZF_DEMO, { "data-mode": "optional" });
    expectKeyboardOperable(host);
    const log = () => [...host.querySelectorAll(".sim-log li")].map((li) => li.textContent);
    expect(log()).toEqual(["Ready to fetch base 140,001 of chrZ from chrZ.fa.gz (BGZF). Select Step."]);
    for (let i = 1; i <= 4; i += 1) {
      button(host, "Step").click();
      await vi.waitFor(() => expect(log()).toHaveLength(i));
    }
    expect(log()[1]).toMatch(/virtual offset is 41,248 << 16 \| 11,854 = 2,703,240,782\.$/);
    expect(
      host.querySelector('.sim-bgzf-block[data-state="inflated"] .sim-bgzf-block-name')?.textContent,
    ).toBe("3");
    expect(host.querySelectorAll('.sim-bgzf-block[data-state="skipped"]')).toHaveLength(4);
    await vi.waitFor(() => expect(goalStatus(host)["bgzf"]).toBe("reached"));
    expect(host.querySelector(".sim-bgzf-facts code")?.textContent).toBe("A120 2E4E");

    const step = button(host, "Step");
    expect(step.getAttribute("aria-disabled")).toBe("true");
    step.click();
    await vi.waitFor(() =>
      expect(host.querySelector(".card-live")?.textContent).toBe(
        "This fetch is done. Select Start over to run it again.",
      ),
    );

    choose(control(host, "gzip: one stream"));
    await vi.waitFor(() =>
      expect(log()).toEqual([
        "Ready to fetch base 140,001 of chrZ from chrZ.fa.gz (plain gzip). Select Step.",
      ]),
    );
    for (let i = 1; i <= 5; i += 1) {
      button(host, "Step").click();
      await vi.waitFor(() => expect(log()).toHaveLength(i));
    }
    expect(host.querySelector(".sim-bgzf-facts")?.textContent).toMatch(
      /^Inflated so far: 142,350 of 203,350 bytes\./,
    );
    await vi.waitFor(() => expect(goalStatus(host)["gzip"]).toBe("reached"));
    expect(host.querySelector(".sim-bgzf-eof")).toBeNull();

    choose(control(host, "bgzip: BGZF blocks, with a .gzi index"));
    const remove = await vi.waitFor(() =>
      control(host, "Remove the last 28 bytes (the EOF block), as a cut-short download would"),
    );
    choose(remove);
    button(host, "Check the end of the file").click();
    await vi.waitFor(() => expect(host.dataset.state).toBe("correct"));
    expect(solved).toHaveBeenCalledTimes(1);
    expect(log().at(-1)).toMatch(
      /^The last 28 bytes are not the EOF block, so the file is presumed truncated \(CASE-14\)/,
    );
    expect(host.querySelector(".sim-readout-text")?.textContent).toMatch(
      /^End of file: The last 28 bytes are not/,
    );
    expect(host.querySelector(".sim-bgzf-eof-block[data-missing]")?.textContent).toBe("no EOF");
  });

  test("Play steps on its own until the fetch is done; Pause stops it; Start over rewinds", async () => {
    const short = { ...BGZF_DEMO, init: { target: 1_000, gzi: [[20642, 65225]], usize: 130_000 } };
    const { host } = mount<SimulatorExercise>("gf-simulator", short);
    const log = () => host.querySelectorAll(".sim-log li").length;
    button(host, "Play").click();
    await vi.waitFor(() => expect(button(host, "Pause")).toBeDefined());
    expect(host.querySelector(".sim-log li")?.textContent).toMatch(/^The \.gzi says block 1/);
    await vi.waitFor(() => expect(host.querySelector(".sim-bgzf-marker[data-reached]")).not.toBeNull(), {
      timeout: 4_000,
    });
    expect(log()).toBe(3);
    await vi.waitFor(() => expect(button(host, "Play").getAttribute("aria-disabled")).toBe("true"));

    button(host, "Start over").click();
    await vi.waitFor(() => expect(host.querySelector(".sim-log li")?.textContent).toMatch(/^Ready to fetch/));
    button(host, "Play").click();
    await vi.waitFor(() => expect(button(host, "Pause")).toBeDefined());
    button(host, "Pause").click();
    await vi.waitFor(() => expect(button(host, "Play")).toBeDefined());
    const paused = log();
    await new Promise((r) => setTimeout(r, 900));
    expect(log()).toBe(paused);
  });

  test("single steps are not tries: Show me waits for a finished fetch and one more change", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", BGZF_DEMO);
    const log = () => host.querySelectorAll(".sim-log li").length;
    button(host, "Step").click();
    await vi.waitFor(() => expect(host.dataset.state).toBe("attempted"));
    for (let i = 2; i <= 4; i += 1) {
      button(host, "Step").click();
      await vi.waitFor(() => expect(log()).toBe(i));
    }
    await vi.waitFor(() => expect(goalStatus(host)["bgzf"]).toBe("reached"));
    expect(host.querySelector(".sim-show-me")).toBeNull();
    choose(control(host, "gzip: one stream"));
    await vi.waitFor(() =>
      expect(
        [...host.querySelectorAll<HTMLElement>(".sim-goal:has(.sim-show-me)")].map((li) => li.dataset.goal),
      ).toEqual(["gzip", "eof"]),
    );
    host.querySelector<HTMLButtonElement>('[data-goal="eof"] .sim-show-me')!.click();
    await vi.waitFor(() => expect(goalStatus(host)["eof"]).toBe("shown"));
    expect(host.querySelector(".sim-bgzf-eof-block[data-missing]")).not.toBeNull();
  });

  test("reduced motion: no Play button, Step is the primary control", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { host } = mount<SimulatorExercise>("gf-simulator", BGZF_DEMO);
    expect([...host.querySelectorAll(".island button")].some((b) => b.textContent === "Play")).toBe(false);
    expect(button(host, "Step").classList.contains("button-primary")).toBe(true);
    expect(host.querySelector(".sim-log li")?.textContent).toBe(
      "Ready to fetch base 140,001 of chrZ from chrZ.fa.gz (BGZF). Select Step.",
    );
  });

  test("an out-of-range base is refused with a notice", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", BGZF_DEMO);
    type(control(host, "Base of chrZ to fetch (1-based)"), "200001");
    await vi.waitFor(() =>
      expect(host.querySelector(".sim-notice")?.textContent).toBe(
        "chrZ has 200,000 bases: choose a position from 1 to 200,000.",
      ),
    );
  });
});

describe("shared behaviour", () => {
  test("the readout's live region is silent on mount and speaks after a pause", async () => {
    const { host } = mount<SimulatorExercise>("gf-simulator", FIND_THE_BYTE);
    const live = host.querySelector<HTMLElement>(".sim-readout .sim-live")!;
    expect(live.getAttribute("role")).toBe("status");
    await new Promise((r) => setTimeout(r, READOUT_DELAY_MS + 100));
    expect(live.textContent).toBe("");
    button(host, "Next base").click();
    await vi.waitFor(() =>
      expect(host.querySelector(".sim-readout-text")?.textContent).toMatch(/Base 2 of chrM_demo/),
    );
    expect(live.textContent).toBe("");
    await vi.waitFor(() => expect(live.textContent).toMatch(/^Base 2 of chrM_demo \(p = 1\)/), {
      timeout: 2_000,
    });
  });

  test("a card restored as complete shows every goal reached", async () => {
    store.putExercise(FIND_THE_BYTE.id, { state: "correct", attempts: 1, firstTry: true, revealed: false });
    const { host } = mount<SimulatorExercise>("gf-simulator", FIND_THE_BYTE);
    await vi.waitFor(() =>
      expect(goalStatus(host)).toEqual({ "base-45": "reached", "three-copies": "reached" }),
    );
    expect(host.querySelector(".sim-show-me")).toBeNull();
  });

  test("Reset remounts the island at its initial state", async () => {
    const { host, buttonNamed } = mount<SimulatorExercise>("gf-simulator", FIND_THE_BYTE);
    type(control(host, "Position (1-based)"), "45");
    await vi.waitFor(() => expect(goalStatus(host)["base-45"]).toBe("reached"));
    buttonNamed("Reset")!.click();
    await vi.waitFor(() => expect(goalStatus(host)["base-45"]).toBe("pending"));
    expect(textRows(host)["Byte"]).toBe("38 + 0 × 21 + 0 = 38");
    expect((host as Host).querySelectorAll(".island")).toHaveLength(1);
  });
});
