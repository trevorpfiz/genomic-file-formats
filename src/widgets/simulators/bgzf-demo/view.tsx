// The BGZF random-access island (docs/PLAN.md 5 L05 §3, 7.5; found Q4). Controls: the container
// (BGZF or plain gzip), the base to fetch, Play, Step and Start over (never autoplay; Play is
// hidden under reduced motion), and the EOF block. Visualization: the compressed file and the
// text it inflates to, block by block (decorative; the step log is the text view).
import { useEffect, useRef, useState } from "preact/hooks";
import {
  Goals,
  Marked,
  Notice,
  NumberField,
  Presets,
  Readout,
  TextViewBlock,
  useReducedMotion,
  useSimulator,
} from "../shared.tsx";
import type { SimulatorViewProps } from "../types.ts";
import {
  bgzfDemoModel,
  blockOf,
  blocks,
  eofText,
  progress,
  virtualOffset,
  virtualOffsetHex,
  type BgzfDemoAction,
  type BgzfDemoState,
} from "./model.ts";

/** Play speed (ux 11: 300-600 ms per step). */
export const STEP_MS = 600;
const fmt = (n: number) => n.toLocaleString("en-US");

export function BgzfDemoView(props: SimulatorViewProps) {
  const { exercise, card } = props;
  const { state, dispatch, countTry, goals, showMe, focusGoal } = useSimulator(bgzfDemoModel, props);
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [lastEvent, setLastEvent] = useState<"fetch" | "eof">("fetch");
  const id = (part: string) => `${card.domId}-${part}`;
  const prog = progress(state);
  const bgzf = state.mode === "bgzf";

  useEffect(() => {
    if (!playing) return;
    if (prog.done || reduced) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => dispatch({ type: "step" }, false), STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, prog.done, reduced, state.step, dispatch]);

  // A try toward "Show me" is a finished fetch or a changed setting, not a single step.
  const done = prog.done;
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) countTry();
    wasDone.current = done;
  }, [done, countTry]);

  const act = (action: BgzfDemoAction, countAsTry = true) => {
    setLastEvent(action.type === "checkEof" ? "eof" : "fetch");
    dispatch(action, countAsTry);
  };
  const stop = () => setPlaying(false);
  const step = () => {
    if (prog.done) {
      card.announce("This fetch is done. Select Start over to run it again.");
      return;
    }
    act({ type: "step" }, false);
  };

  const last = prog.steps[state.step - 1];
  const readout =
    lastEvent === "eof" && state.eofCheck
      ? eofText(state.eofCheck)
      : (last?.text ?? `Ready to fetch from ${state.file}. Select ${reduced ? "Step" : "Play or Step"}.`);

  return (
    <div class="simulator sim-bgzf">
      <Presets
        presets={exercise.presets}
        isCurrent={(s) => JSON.stringify(s.gzi) === JSON.stringify(state.gzi)}
        onPick={(s) => {
          stop();
          act({ type: "preset", state: s });
        }}
      />
      <fieldset class="sim-group sim-radios">
        <legend>The file is compressed with</legend>
        <label>
          <input
            type="radio"
            name={id("mode")}
            checked={bgzf}
            onChange={() => {
              stop();
              act({ type: "mode", mode: "bgzf" });
            }}
          />{" "}
          bgzip: BGZF blocks, with a .gzi index
        </label>
        <label>
          <input
            type="radio"
            name={id("mode")}
            checked={!bgzf}
            onChange={() => {
              stop();
              act({ type: "mode", mode: "gzip" });
            }}
          />{" "}
          gzip: one stream
        </label>
      </fieldset>

      <div class="sim-row">
        {state.fai ? (
          <NumberField
            live
            id={id("position")}
            label={`Base of ${state.fai.name} to fetch (1-based)`}
            value={state.position}
            min={1}
            max={state.fai.length}
            describedBy={id("notice")}
            onValue={(n, committed) => {
              stop();
              act({ type: "position", position: n }, committed);
            }}
          />
        ) : (
          <NumberField
            live
            id={id("target")}
            label="Uncompressed byte to fetch"
            value={state.target}
            min={0}
            max={state.usize - 1}
            describedBy={id("notice")}
            onValue={(n, committed) => {
              stop();
              act({ type: "target", target: n }, committed);
            }}
          />
        )}
      </div>
      <div class="sim-buttons" role="group" aria-label="Fetch">
        {!reduced && (
          <button
            type="button"
            class="button-primary"
            aria-disabled={prog.done && !playing ? "true" : undefined}
            onClick={() => {
              if (playing) return stop();
              if (prog.done) return step();
              act({ type: "step" }, false);
              setPlaying(true);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
        )}
        <button
          type="button"
          class={reduced ? "button-primary" : undefined}
          aria-disabled={prog.done ? "true" : undefined}
          onClick={() => {
            stop();
            step();
          }}
        >
          Step
        </button>
        <button
          type="button"
          aria-disabled={state.step === 0 ? "true" : undefined}
          onClick={() => {
            stop();
            if (state.step > 0) act({ type: "restart" }, false);
          }}
        >
          Start over
        </button>
      </div>
      <Notice id={id("notice")} text={state.notice} />

      <Diagram state={state} />
      <Readout
        text={readout}
        label={lastEvent === "eof" ? "End of file" : `Step ${state.step} of ${prog.steps.length}`}
      />
      <TextViewBlock view={bgzfDemoModel.text(state)} caption="Step log" id={id("log")} />

      {bgzf && (
        <fieldset class="sim-group sim-bgzf-eof">
          <legend>The end of the file</legend>
          <label>
            <input
              type="checkbox"
              checked={!state.eof}
              onChange={(e) => act({ type: "eof", present: !e.currentTarget.checked })}
            />{" "}
            Remove the last 28 bytes (the EOF block), as a cut-short download would
          </label>
          <div class="sim-buttons">
            <button type="button" onClick={() => act({ type: "checkEof" })}>
              Check the end of the file
            </button>
          </div>
        </fieldset>
      )}
      <Goals idPrefix={card.domId} goals={goals} onShow={showMe} focusGoal={focusGoal} />
    </div>
  );
}

/** Compressed bytes above, inflated text below, block by block. Decorative (aria-hidden). */
function Diagram({ state }: { state: BgzfDemoState }) {
  const prog = progress(state);
  const all = blocks(state);
  const bgzf = state.mode === "bgzf";
  const found = prog.block === undefined ? undefined : all[prog.block - 1];
  const blockState = (n: number): string | undefined => {
    if (!bgzf || prog.block === undefined) return undefined;
    if (n < prog.block) return prog.inflated ? "skipped" : undefined;
    if (n > prog.block) return undefined;
    return prog.inflated ? "inflated" : "found";
  };
  // The target sits inside its block (or the one gzip stream), at its share of that block.
  const holder = bgzf ? blockOf(state, state.target) : { number: 1, ustart: 0, usize: state.usize };
  const marker = (
    <span
      class="sim-bgzf-marker"
      data-reached={prog.done ? "" : undefined}
      style={{ left: `${(100 * (state.target - holder.ustart)) / holder.usize}%` }}
    />
  );
  const tail = bgzf ? (
    <span class="sim-bgzf-eof-block" data-missing={state.eof ? undefined : ""}>
      {state.eof ? "EOF" : "no EOF"}
    </span>
  ) : null;
  return (
    <figure class="sim-figure sim-bgzf-diagram" aria-hidden="true">
      <figcaption>
        <Marked
          text={`\`${state.file}\`: compressed bytes above, the text they inflate to below. Numbers are where each block starts; the dashed line is the target.`}
        />
      </figcaption>
      <div class="sim-bgzf-track">
        <span class="sim-bgzf-track-label">Compressed</span>
        <div class="sim-bgzf-bar">
          <div class="sim-bgzf-blocks">
            {bgzf ? (
              all.map((b) => (
                <span
                  key={b.number}
                  class="sim-bgzf-block"
                  data-state={blockState(b.number)}
                  style={{ flexGrow: b.usize }}
                >
                  <span class="sim-bgzf-block-name">{b.number}</span>
                  <span class="sim-bgzf-block-at">{fmt(b.coffset)}</span>
                </span>
              ))
            ) : (
              <span class="sim-bgzf-block" style={{ flexGrow: 1 }}>
                <span class="sim-bgzf-block-name">one DEFLATE stream</span>
              </span>
            )}
          </div>
          {tail}
        </div>
      </div>
      <div class="sim-bgzf-track">
        <span class="sim-bgzf-track-label">Text</span>
        <div class="sim-bgzf-bar">
          <div class="sim-bgzf-blocks">
            {bgzf ? (
              all.map((b) => (
                <span
                  key={b.number}
                  class="sim-bgzf-block"
                  data-state={blockState(b.number)}
                  style={{ flexGrow: b.usize }}
                >
                  <span class="sim-bgzf-block-at">{fmt(b.ustart)}</span>
                  {b.number === holder.number && marker}
                </span>
              ))
            ) : (
              <span class="sim-bgzf-block" style={{ flexGrow: 1 }}>
                <span
                  class="sim-bgzf-fill"
                  style={{ width: `${(100 * prog.inflatedBytes) / state.usize}%` }}
                />
                {marker}
              </span>
            )}
          </div>
          {tail && <span class="sim-bgzf-eof-block" data-spacer="" />}
        </div>
      </div>
      <p class="sim-bgzf-facts">
        Inflated so far: {fmt(prog.inflatedBytes)} of {fmt(state.usize)} bytes.
        {found && (
          <>
            {" "}
            Block {found.number}: compressed bytes from {fmt(found.coffset)}, text bytes {fmt(found.ustart)}{" "}
            to {fmt(found.ustart + found.usize - 1)}. Virtual offset{" "}
            {fmt(virtualOffset(found.coffset, state.target - found.ustart))} (hex{" "}
            <code>{virtualOffsetHex(found.coffset, state.target - found.ustart)}</code>).
          </>
        )}
      </p>
    </figure>
  );
}
