// @vitest-environment happy-dom
// Widget DOM tests (docs/PLAN.md 11.6) on happy-dom 20.14.5: the predict widget (vanilla custom
// element) and the simulator host (Preact island).
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { SolvedDetail } from "../exercises/types.ts";
import "./predict.ts";
import "./simulator.tsx";

afterEach(() => {
  document.body.replaceChildren();
});

function mount(html: string) {
  document.body.innerHTML = html;
  const solved = vi.fn<(detail: SolvedDetail) => void>();
  document.body.addEventListener("gf:solved", (e) => solved((e as CustomEvent<SolvedDetail>).detail));
  return solved;
}

const PREDICT = `<gf-predict exercise="placeholder-hello/bed-to-one-based" id="placeholder-hello--bed-to-one-based" data-mode="quick-check"><h3 class="quick-check-title">Which base does this BED line cover?</h3></gf-predict>`;

describe("gf-predict", () => {
  test("a matching prediction records correct, once", () => {
    const solved = mount(PREDICT);
    const host = document.querySelector("gf-predict")!;
    expect(host.querySelector(".overline")?.textContent).toBe("Quick check · Predict");
    expect(host.querySelector("h3")?.textContent).toBe("Which base does this BED line cover?");
    const input = host.querySelector<HTMLInputElement>("input")!;
    expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toBe("1-based position on chr2");
    input.value = "166,014,902";
    host.querySelector("form")!.requestSubmit();
    expect(host.querySelector(".verdict")?.textContent).toBe("Your prediction matches.");
    expect(host.querySelector<HTMLElement>(".reveal")!.hidden).toBe(false);
    expect(input.disabled).toBe(true);
    host.querySelector("form")!.requestSubmit();
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved).toHaveBeenCalledWith({
      id: "placeholder-hello/bed-to-one-based",
      state: "correct",
      attempts: 1,
      firstTry: true,
      revealed: false,
    });
  });

  test("an off-by-one prediction records revealed and shows the answer", () => {
    const solved = mount(PREDICT);
    const host = document.querySelector("gf-predict")!;
    host.querySelector<HTMLInputElement>("input")!.value = "166014901";
    host.querySelector("form")!.requestSubmit();
    expect(host.querySelector(".verdict")?.textContent).toBe("Here is the answer.");
    expect(host.querySelector(".reveal")?.textContent).toContain("position 166,014,902");
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ state: "revealed", revealed: true, firstTry: false });
  });

  test("an unknown exercise id renders a visible error instead of throwing", () => {
    mount(`<gf-predict exercise="placeholder-hello/nope"></gf-predict>`);
    expect(document.querySelector(".widget-error")?.textContent).toBe(
      'Missing predict exercise "placeholder-hello/nope".',
    );
  });

  test("an exercise of another kind renders a visible error", () => {
    mount(`<gf-predict exercise="placeholder-hello/ruler-step"></gf-predict>`);
    expect(document.querySelector(".widget-error")?.textContent).toContain("is a simulator, not a predict");
  });
});

describe("gf-simulator (Preact island)", () => {
  test("stepping the ruler reaches the goal and fires gf:solved once", async () => {
    const solved = mount(
      `<gf-simulator exercise="placeholder-hello/ruler-step" id="placeholder-hello--ruler-step" data-mode="try-it"></gf-simulator>`,
    );
    const host = document.querySelector("gf-simulator")!;
    const cell = () => host.querySelector("tbody tr td")?.textContent;
    expect(cell()).toBe("166,014,900");
    const next = [...host.querySelectorAll("button")].find((b) => b.textContent === "Next base")!;
    next.click();
    await vi.waitFor(() => expect(cell()).toBe("166,014,901"));
    expect(solved).not.toHaveBeenCalled();
    next.click();
    await vi.waitFor(() => expect(host.querySelector("[role=status]")?.textContent).toMatch(/^Goal reached/));
    next.click();
    await vi.waitFor(() => expect(cell()).toBe("166,014,903"));
    expect(solved).toHaveBeenCalledTimes(1);
    expect(solved.mock.calls[0]?.[0]).toMatchObject({ id: "placeholder-hello/ruler-step", state: "correct" });
  });

  test("disconnecting unmounts the island", () => {
    mount(`<gf-simulator exercise="placeholder-hello/ruler-step"></gf-simulator>`);
    const host = document.querySelector("gf-simulator")!;
    expect(host.querySelector(".island")).not.toBeNull();
    host.remove();
    expect(host.querySelector(".island")).toBeNull();
  });
});
