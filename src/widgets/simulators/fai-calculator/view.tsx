// The .fai calculator island (docs/PLAN.md 5 L05.1, 7.5; seq EX-02). Controls: file presets,
// the five .fai columns, the position (1-based or 0-based p, with base and line steps and a
// slider) and the byte offset, bound both ways. Visualization: the record's bytes, header and
// lines, with the target byte marked (decorative; the arithmetic table carries the same facts).
import type { ComponentChildren } from "preact";
import type { SimulatorViewProps } from "../types.ts";
import {
  Goals,
  Marked,
  Notice,
  NumberField,
  Presets,
  Readout,
  TextViewBlock,
  useSimulator,
} from "../shared.tsx";
import {
  currentByte,
  currentP,
  faiCalculatorModel,
  fileMap,
  locate,
  readout,
  terminatorWidth,
  type ByteInfo,
  type FaiCalculatorState,
  type FaiField,
  type MapSegment,
} from "./model.ts";

const fmt = (n: number) => n.toLocaleString("en-US");
const range = (from: number, to: number) => (from === to ? fmt(from) : `${fmt(from)}–${fmt(to)}`);

const FIELDS: { field: FaiField; label: string; min: number }[] = [
  { field: "length", label: "LENGTH", min: 1 },
  { field: "offset", label: "OFFSET", min: 0 },
  { field: "lineBases", label: "LINEBASES", min: 1 },
  { field: "lineWidth", label: "LINEWIDTH", min: 2 },
];

export function FaiCalculatorView(props: SimulatorViewProps) {
  const { exercise, card } = props;
  const { state, dispatch, goals, showMe, focusGoal } = useSimulator(faiCalculatorModel, props);
  const id = (part: string) => `${card.domId}-${part}`;
  const { row } = state.file;
  const p = currentP(state);
  const byte = currentByte(state);
  const zero = state.convention === "0-based";
  const shown = p === undefined ? undefined : zero ? p : p + 1;

  const onPageKeys = (event: KeyboardEvent) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    event.preventDefault();
    dispatch({ type: "line", by: event.key === "PageUp" ? 1 : -1 });
  };

  return (
    <div class="simulator sim-fai">
      <Presets
        presets={exercise.presets}
        label="Files"
        isCurrent={(s) => !state.file.edited && s.label === state.file.label}
        onPick={(s) => dispatch({ type: "preset", state: s })}
      />

      <fieldset class="sim-group sim-fai-row">
        <legend>
          The .fai row
          {state.file.label ? (
            <>
              {" "}
              of <Marked text={state.file.label} />
            </>
          ) : null}
          {state.file.edited ? " (edited)" : ""}
        </legend>
        <div class="sim-field">
          <span class="sim-field-label">NAME</span>
          <code class="sim-fai-name">{row.name}</code>
        </div>
        {FIELDS.map(({ field, label, min }) => (
          <NumberField
            key={field}
            id={id(field)}
            label={label}
            value={row[field]}
            min={min}
            class="sim-field-narrow"
            describedBy={id("notice")}
            onValue={(value) => dispatch({ type: "field", field, value })}
          />
        ))}
      </fieldset>

      <fieldset class="sim-group sim-fai-position">
        <legend>The base</legend>
        <fieldset class="sim-radios">
          <legend>Count positions</legend>
          <label>
            <input
              type="radio"
              name={id("convention")}
              checked={!zero}
              onChange={() => dispatch({ type: "convention", convention: "1-based" })}
            />{" "}
            1-based, as in <code>{row.name}:45</code>
          </label>
          <label>
            <input
              type="radio"
              name={id("convention")}
              checked={zero}
              onChange={() => dispatch({ type: "convention", convention: "0-based" })}
            />{" "}
            0-based p, as in the formula
          </label>
        </fieldset>
        <div class="sim-row">
          <NumberField
            live
            id={id("position")}
            label={zero ? "Position p (0-based)" : "Position (1-based)"}
            value={shown}
            min={zero ? 0 : 1}
            max={zero ? row.length - 1 : row.length}
            describedBy={id("keys")}
            onKeyDown={onPageKeys}
            onValue={(n, committed) =>
              dispatch(zero ? { type: "p", p: n } : { type: "position", position: n }, committed)
            }
          />
          <NumberField
            live
            id={id("byte")}
            label="Byte offset in the file"
            value={byte}
            min={0}
            onValue={(n, committed) => dispatch({ type: "byte", byte: n }, committed)}
          />
        </div>
        <p class="sim-hint" id={id("keys")}>
          PageUp and PageDown move one line.
        </p>
        <div class="sim-buttons" role="group" aria-label="Move the base">
          <button type="button" onClick={() => dispatch({ type: "line", by: -1 })}>
            Previous line
          </button>
          <button type="button" onClick={() => dispatch({ type: "step", by: -1 })}>
            Previous base
          </button>
          <button type="button" onClick={() => dispatch({ type: "step", by: 1 })}>
            Next base
          </button>
          <button type="button" onClick={() => dispatch({ type: "line", by: 1 })}>
            Next line
          </button>
        </div>
        <div class="sim-slider">
          <label for={id("slider")}>Position slider</label>
          <input
            id={id("slider")}
            type="range"
            min={1}
            max={row.length}
            step={1}
            value={p === undefined ? 1 : p + 1}
            aria-valuetext={p === undefined ? "no base selected" : `base ${fmt(p + 1)}, byte ${fmt(byte)}`}
            onInput={(e) => dispatch({ type: "position", position: Number(e.currentTarget.value) }, false)}
            onChange={(e) => dispatch({ type: "position", position: Number(e.currentTarget.value) })}
          />
        </div>
      </fieldset>
      <Notice id={id("notice")} text={state.notice} />

      <FileMap state={state} />
      <Readout text={readout(state)} />
      <TextViewBlock view={faiCalculatorModel.text(state)} caption="The arithmetic" id={id("text")} />
      <Goals idPrefix={card.domId} goals={goals} onShow={showMe} focusGoal={focusGoal} />
    </div>
  );
}

/** The record's bytes, decorative: the arithmetic table and the readout say the same. */
function FileMap({ state }: { state: FaiCalculatorState }) {
  const byte = currentByte(state);
  const info = locate(state.file, byte);
  const segments = fileMap(state);
  return (
    <figure class="sim-figure sim-fai-map" aria-hidden="true">
      <figcaption>
        {state.file.label ? <Marked text={state.file.label} /> : "The FASTA file"}: bytes, with byte{" "}
        {fmt(byte)} marked
      </figcaption>
      <div class="sim-fai-rows">
        {segments.map((segment) => (
          <MapRow
            key={`${segment.kind}-${segment.from}`}
            segment={segment}
            state={state}
            info={info}
            byte={byte}
          />
        ))}
      </div>
    </figure>
  );
}

function Eol({ width, mark }: { width: number; mark?: number | undefined }) {
  const names =
    width === 2 ? ["CR", "LF"] : width === 1 ? ["LF"] : Array.from({ length: width }, () => "EOL");
  return (
    <>
      {names.map((name, i) => (
        <span key={i} class="sim-eol" data-target={mark === i ? "" : undefined}>
          {name}
        </span>
      ))}
    </>
  );
}

function MapRow({
  segment,
  state,
  info,
  byte,
}: {
  segment: MapSegment;
  state: FaiCalculatorState;
  info: ByteInfo;
  byte: number;
}) {
  const width = terminatorWidth(state.file.row);
  const cells = (label: string, content: ComponentChildren, target = false, bytes = "") => (
    <div class="sim-fai-segment" data-kind={segment.kind} data-target={target ? "" : undefined}>
      <span class="sim-fai-bytes">{bytes}</span>
      <span class="sim-fai-label">{label}</span>
      <span class="sim-fai-content">{content}</span>
    </div>
  );
  switch (segment.kind) {
    case "before":
      return cells("Earlier records", null, info.kind === "before", range(segment.from, segment.to));
    case "header": {
      const target = info.kind === "header" || info.kind === "before-sequence";
      const text = segment.text;
      let content: ComponentChildren = <span class="sim-muted">header line</span>;
      if (text !== undefined) {
        const at = info.kind === "header" ? info.index : -1;
        content = (
          <code class="sim-bases">
            {at >= 0 && at < text.length ? (
              <>
                {text.slice(0, at)}
                <mark>{text[at]}</mark>
                {text.slice(at + 1)}
              </>
            ) : (
              text
            )}
            <Eol width={width} mark={at >= text.length ? at - text.length : undefined} />
          </code>
        );
      }
      return cells("Header", content, target, range(segment.from, segment.to));
    }
    case "lines":
      return cells(
        `Lines ${fmt(segment.firstLine + 1)}–${fmt(segment.lastLine + 1)}`,
        <span class="sim-muted">
          bases {fmt(segment.firstBase)} to {fmt(segment.lastBase)},{" "}
          {fmt(segment.lastLine - segment.firstLine + 1)} full lines
        </span>,
        false,
        range(segment.from, segment.to),
      );
    case "line": {
      const here = (info.kind === "base" || info.kind === "terminator") && info.line === segment.line;
      const column = here && info.kind === "base" ? info.column : undefined;
      const eolMark = here && info.kind === "terminator" ? info.index : undefined;
      return cells(
        `Line ${fmt(segment.line + 1)}`,
        <>
          <code class="sim-bases">
            {segment.cells ? (
              <Cells cells={segment.cells} column={column} />
            ) : (
              <span class="sim-muted">bases not shown</span>
            )}
            <Eol width={width} mark={eolMark} />
          </code>
          <span class="sim-fai-span">
            bases {fmt(segment.firstBase)}–{fmt(segment.lastBase)}
            {column !== undefined && !segment.cells?.[column]
              ? `; byte ${fmt(byte)} is column ${fmt(column)}`
              : ""}
          </span>
        </>,
        here,
        range(segment.from, segment.to),
      );
    }
    case "after":
      return cells(
        "After the sequence",
        <span class="sim-muted">the next record, or the end of the file</span>,
        info.kind === "after",
        `${fmt(segment.from)}–`,
      );
  }
}

/** Known bases with runs of unknown ones collapsed; the target column is marked. */
function Cells({ cells, column }: { cells: (string | null)[]; column: number | undefined }) {
  const parts: ComponentChildren[] = [];
  let i = 0;
  while (i < cells.length) {
    const cell = cells[i];
    if (cell === null || cell === undefined) {
      let j = i;
      while (j < cells.length && cells[j] === null) j += 1;
      parts.push(
        <span
          key={`gap-${i}`}
          class="sim-gap"
          data-target={column !== undefined && column >= i && column < j ? "" : undefined}
        >
          …{fmt(j - i)} more
        </span>,
      );
      i = j;
    } else {
      parts.push(i === column ? <mark key={i}>{cell}</mark> : cell);
      i += 1;
    }
  }
  return <>{parts}</>;
}
