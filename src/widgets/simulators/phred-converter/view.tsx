// The Phred converter island (docs/PLAN.md 5 L06.2, 7.5; found EX-05; seq EX-07). Controls: a
// quality character, a Q slider and an error probability, bound both ways at offset 33, with
// chips for the four-level quality bins (the NovaSeq 6000 alphabet, D-18; labelled without the
// instrument name while V-06 is open); then a quality string whose expected errors add up in
// the text view (character, Q, P, bases, sum). The decade grid is decorative: every fact in it
// is in the readout and the table.
import { useState } from "preact/hooks";
import { pToQ, qToChar, qToP } from "../../../formats/phred.ts";
import { Goals, Marked, Notice, Presets, Readout, TextViewBlock, useSimulator } from "../shared.tsx";
import type { SimulatorViewProps } from "../types.ts";
import {
  cleanQuality,
  converterReadout,
  formatP,
  isQualityChar,
  MAX_Q,
  MAX_QUALITY_LENGTH,
  NOVASEQ_6000_BINS,
  phred64Char,
  phredConverterModel,
  qualityReadout,
  summarize,
  type PhredConverterAction,
} from "./model.ts";

/** P as the field shows it: plain decimals, or exponent notation below 0.000001. */
const pFieldText = (p: number): string => (p < 1e-6 ? p.toExponential(2) : formatP(p));
const BIN_CHARS = new Set(NOVASEQ_6000_BINS.map((b) => b.char));

export function PhredConverterView(props: SimulatorViewProps) {
  const { exercise, card } = props;
  const { state, dispatch, goals, showMe, focusGoal } = useSimulator(phredConverterModel, props);
  const [notice, setNotice] = useState<string | undefined>();
  const id = (part: string) => `${card.domId}-${part}`;
  const char = qToChar(state.q);
  const p = qToP(state.q);
  const act = (action: PhredConverterAction, countTry = true) => {
    setNotice(undefined);
    dispatch(action, countTry);
  };

  return (
    <div class="simulator sim-phred">
      <Presets presets={exercise.presets} onPick={(s) => act({ type: "preset", state: s })} />

      <fieldset class="sim-group sim-phred-converter">
        <legend>Convert one quality character (Phred+33)</legend>
        <div class="sim-row">
          <CharField
            id={id("char")}
            char={char}
            onChar={(c) => act({ type: "char", char: c })}
            onRefuse={setNotice}
          />
          <div class="sim-field sim-field-wide">
            <label for={id("q")}>Q</label>
            <div class="sim-slider-row">
              <input
                id={id("q")}
                type="range"
                min={0}
                max={MAX_Q}
                step={1}
                value={state.q}
                aria-valuetext={`Q${state.q}, character ${char}, error probability ${formatP(p)}`}
                aria-describedby={id("q-keys")}
                onInput={(e) => act({ type: "q", q: Number(e.currentTarget.value) }, false)}
                onChange={(e) => act({ type: "q", q: Number(e.currentTarget.value) })}
                onKeyDown={(e) => {
                  if (e.key !== "PageUp" && e.key !== "PageDown") return;
                  e.preventDefault();
                  act({ type: "step", by: e.key === "PageUp" ? 10 : -10 });
                }}
              />
              <output for={id("q")} class="sim-output">
                Q{state.q}
              </output>
            </div>
          </div>
          <PField id={id("p")} p={p} onP={(value) => act({ type: "p", p: value })} onRefuse={setNotice} />
        </div>
        <p class="sim-hint" id={id("q-keys")}>
          Arrow keys change Q by 1; PageUp and PageDown by 10, which is a factor of 10 in error probability.
        </p>
        <div class="sim-presets sim-bins" role="group" aria-label="Four-level quality bins">
          <span class="sim-presets-label" aria-hidden="true">
            Four-level bins
          </span>
          {NOVASEQ_6000_BINS.map((bin) => (
            <button
              key={bin.char}
              type="button"
              class="sim-chip"
              onClick={() => act({ type: "char", char: bin.char })}
            >
              <code>{bin.char}</code> Q{bin.q}
            </button>
          ))}
        </div>
      </fieldset>
      <Notice id={id("notice")} text={notice} />

      <DecadeGrid q={state.q} onPick={(q) => act({ type: "q", q })} />
      <Readout text={converterReadout(state)} label="Converter" />
      <p class="sim-hint">
        Legacy Phred+64 character for Q{state.q}:{" "}
        {phred64Char(state.q) ? (
          <code>{phred64Char(state.q)}</code>
        ) : (
          <>
            none, it would be past <code>~</code>
          </>
        )}
        . Illumina software writes Phred+33 since CASAVA 1.8.
      </p>

      {state.sum && (
        <>
          <div class="sim-group sim-phred-quality">
            <div class="sim-field sim-field-wide">
              <label for={id("quality")}>Quality string</label>
              <input
                id={id("quality")}
                class="sim-mono"
                type="text"
                value={state.quality}
                maxLength={MAX_QUALITY_LENGTH}
                spellcheck={false}
                autoComplete="off"
                autoCapitalize="off"
                aria-describedby={id("quality-hint")}
                onInput={(e) => {
                  const typed = e.currentTarget.value;
                  const quality = cleanQuality(typed);
                  if (quality !== typed) {
                    e.currentTarget.value = quality;
                    setNotice("A quality string holds only the characters `!` to `~`: no spaces.");
                  } else setNotice(undefined);
                  dispatch({ type: "quality", quality }, false);
                }}
                onChange={(e) => dispatch({ type: "quality", quality: cleanQuality(e.currentTarget.value) })}
              />
            </div>
            <p class="sim-hint" id={id("quality-hint")}>
              One character per base. The table adds up the error probabilities.
            </p>
          </div>
          <Readout text={qualityReadout(state)} label="Quality string" />
        </>
      )}
      <TextViewBlock
        view={phredConverterModel.text(state)}
        caption="Character, Q and error probability"
        id={id("text")}
      />
      <AverageNote quality={state.quality} />
      <Goals idPrefix={card.domId} goals={goals} onShow={showMe} focusGoal={focusGoal} />
    </div>
  );
}

/** One quality character; focus selects it so typing replaces it. */
function CharField({
  id,
  char,
  onChar,
  onRefuse,
}: {
  id: string;
  char: string;
  onChar: (char: string) => void;
  onRefuse: (notice: string) => void;
}) {
  return (
    <div class="sim-field sim-field-narrow">
      <label for={id}>Character</label>
      <input
        id={id}
        class="sim-mono"
        type="text"
        value={char}
        size={2}
        spellcheck={false}
        autoComplete="off"
        autoCapitalize="off"
        onFocus={(e) => e.currentTarget.select()}
        onInput={(e) => {
          const input = e.currentTarget;
          const typed = Array.from(input.value).find((c) => c !== char) ?? input.value.slice(-1);
          if (typed && isQualityChar(typed)) {
            input.value = typed;
            onChar(typed);
          } else {
            input.value = char;
            if (typed)
              onRefuse(
                "Quality characters run from `!` (Q0) to `~` (Q93). Spaces and non-ASCII characters are not quality characters.",
              );
          }
          input.select();
        }}
      />
    </div>
  );
}

/** The error probability; committing rounds it to the nearest whole Q. */
function PField({
  id,
  p,
  onP,
  onRefuse,
}: {
  id: string;
  p: number;
  onP: (p: number) => void;
  onRefuse: (notice: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    setDraft(null);
    const value = Number(text.trim());
    if (text.trim() === "" || !Number.isFinite(value) || value <= 0 || value > 1) {
      onRefuse("An error probability is a number above 0 and at most 1, such as 0.001.");
      return;
    }
    onP(value);
  };
  return (
    <div class="sim-field">
      <label for={id}>Error probability</label>
      <input
        id={id}
        class="sim-mono"
        type="text"
        inputMode="decimal"
        size={10}
        value={draft ?? pFieldText(p)}
        spellcheck={false}
        autoComplete="off"
        onInput={(e) => setDraft(e.currentTarget.value)}
        onChange={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
      />
    </div>
  );
}

/** Q in rows of ten: each row down is ten times fewer errors. Decorative (aria-hidden). */
function DecadeGrid({ q, onPick }: { q: number; onPick: (q: number) => void }) {
  const rows: number[] = [];
  for (let start = 0; start <= MAX_Q; start += 10) rows.push(start);
  return (
    <figure class="sim-figure sim-phred-grid" aria-hidden="true">
      <figcaption>
        Phred+33 characters by Q, with the error probability P where each row starts. Each row down is ten
        times fewer errors; outlined characters are the four-level bins.
      </figcaption>
      <div class="sim-grid">
        {rows.map((start) => (
          <div key={start} class="sim-grid-row">
            <span class="sim-grid-head">
              <span class="sim-grid-q">Q{start}+</span>
              <span class="sim-grid-p">
                P{" "}
                {start <= 40 ? (
                  formatP(qToP(start))
                ) : (
                  <>
                    10<sup>−{start / 10}</sup>
                  </>
                )}
              </span>
            </span>
            {Array.from({ length: Math.min(10, MAX_Q - start + 1) }, (_, i) => start + i).map((value) => (
              <span
                key={value}
                class="sim-grid-cell"
                data-current={value === q ? "" : undefined}
                data-bin={BIN_CHARS.has(qToChar(value)) ? "" : undefined}
                onClick={() => onPick(value)}
              >
                {qToChar(value)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Why the average of Q values misleads (found EX-06): average the probabilities instead. */
function AverageNote({ quality }: { quality: string }) {
  const s = summarize(quality);
  if (s.groups.length < 2) return null;
  const meanQ = s.meanQ.toFixed(1);
  const pooled = pToQ(s.meanP).toFixed(1);
  return (
    <p class="sim-note">
      <Marked
        text={`Averaging the Q values gives Q${meanQ}, which hides the worst bases. Average the error probabilities instead: ${formatP(s.meanP)} per base, which is Q${pooled}.`}
      />
    </p>
  );
}
