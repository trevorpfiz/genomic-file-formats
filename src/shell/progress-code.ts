// The compact progress code (docs/PLAN.md D-23, 11.4; ux 12.3): the one way to carry progress
// between the hosted copy and an emailed file:// copy, which have separate storage.
//
//   GF1Z.<payload>.<crc>
//   |  | |         `- CRC-32 of the JSON text (UTF-8), 8 lowercase hex digits
//   |  | `- base64url of the JSON, deflate-raw compressed when the prefix says Z
//   |  `- Z: compressed with CompressionStream("deflate-raw"); U: uncompressed (V-40 fallback)
//   `- format version 1
//
// The JSON is a projection without answers: exercise states, attempts and the first-try and
// revealed flags; quiz best scores, pass dates and attempts; capstone file states; the badge
// date. Dates are whole seconds since 1970. Importing validates the checksum, then merges
// (src/shell/progress-store.ts importState); "replace" is the learner's explicit choice.
import type { ExerciseState } from "../exercises/types.ts";
import { emptyState } from "./progress-merge.ts";
import type { IsoDate, ProgressState } from "./progress-types.ts";

export const CODE_VERSION = 1;
const PREFIX = `GF${CODE_VERSION}`;

const STATE_CODES: readonly ExerciseState[] = ["idle", "attempted", "incorrect", "correct", "revealed"];
const FIRST_TRY = 1;
const REVEALED = 2;

/** [state, attempts, flags] */
type ExerciseTuple = [number, number, number];
/** [best, of, passedAt seconds or 0, attempts] */
type QuizTuple = [number, number, number, number];
/** [state, attempts, revealed 0 or 1] */
type FileTuple = [number, number, number];

interface Projection {
  /** Seconds: the state's updatedAt. */
  t: number;
  /** Lesson id -> exercise id without the "<lesson-id>/" prefix -> tuple. */
  l?: Record<string, Record<string, ExerciseTuple>>;
  q?: Record<string, QuizTuple>;
  c?: Record<string, FileTuple>;
  /** Badge earnedAt in seconds. */
  b?: number;
}

export type ProgressCodeProblem = "format" | "checksum" | "version" | "unsupported";

export class ProgressCodeError extends Error {
  readonly reason: ProgressCodeProblem;
  constructor(reason: ProgressCodeProblem, message: string) {
    super(message);
    this.name = "ProgressCodeError";
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------------------------
// CRC-32 (IEEE 802.3, the zlib polynomial) and base64url

let table: Uint32Array | undefined;

export function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new ProgressCodeError("format", "This is not a progress code.");
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new ProgressCodeError("format", "This is not a progress code.");
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------------------------
// Compression (native streams only; no library ships, D-20)

/**
 * Whether this browser can deflate-raw both ways. The classes alone are not enough: some
 * engines (Chromium 80-102) have them without "deflate-raw", and constructing one then throws.
 */
export const canCompress = (): boolean => {
  try {
    new CompressionStream("deflate-raw");
    new DecompressionStream("deflate-raw");
    return true;
  } catch {
    return false;
  }
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream as ReadableWritablePair);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

// ---------------------------------------------------------------------------------------------
// Projection

const seconds = (iso: IsoDate | null | undefined): number => {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.round(ms / 1000) : 0;
};
const isoOf = (s: number): IsoDate => new Date(s * 1000).toISOString();
const stateCode = (state: ExerciseState) => Math.max(0, STATE_CODES.indexOf(state));
const stateOf = (code: unknown): ExerciseState => STATE_CODES[typeof code === "number" ? code : 0] ?? "idle";
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** The compact projection of a state (no answers, no preferences). */
export function project(state: ProgressState): Projection {
  const out: Projection = { t: seconds(state.updatedAt) };
  for (const [lessonId, lesson] of Object.entries(state.lessons)) {
    const entries = Object.entries(lesson.exercises ?? {});
    if (!entries.length) continue;
    const records: Record<string, ExerciseTuple> = {};
    for (const [id, r] of entries) {
      const key = id.startsWith(`${lessonId}/`) ? id.slice(lessonId.length + 1) : `/${id}`;
      records[key] = [
        stateCode(r.state),
        r.attempts,
        (r.firstTry ? FIRST_TRY : 0) | (r.revealed ? REVEALED : 0),
      ];
    }
    (out.l ??= {})[lessonId] = records;
  }
  for (const [section, q] of Object.entries(state.quizzes)) {
    (out.q ??= {})[section] = [q.best, q.of, seconds(q.passedAt), q.attempts];
  }
  for (const [file, f] of Object.entries(state.capstone.files)) {
    (out.c ??= {})[file] = [stateCode(f.state), f.attempts, f.revealed ? 1 : 0];
  }
  if (state.badge.earnedAt) out.b = seconds(state.badge.earnedAt);
  return out;
}

/** A state rebuilt from a projection, ready to merge. Exercise records carry no updatedAt, so
 * a newer incomplete record already on this device wins over an imported incomplete one. */
export function unproject(p: Projection): ProgressState {
  const state = emptyState(isoOf(n(p.t)));
  for (const [lessonId, records] of Object.entries(p.l ?? {})) {
    const exercises: ProgressState["lessons"][string]["exercises"] = {};
    for (const [key, tuple] of Object.entries(records ?? {})) {
      if (!Array.isArray(tuple)) continue;
      const id = key.startsWith("/") ? key.slice(1) : `${lessonId}/${key}`;
      const flags = n(tuple[2]);
      exercises[id] = {
        state: stateOf(tuple[0]),
        attempts: n(tuple[1]),
        firstTry: (flags & FIRST_TRY) !== 0,
        revealed: (flags & REVEALED) !== 0,
      };
    }
    state.lessons[lessonId] = { exercises };
  }
  for (const [section, tuple] of Object.entries(p.q ?? {})) {
    if (!Array.isArray(tuple)) continue;
    state.quizzes[section] = {
      best: n(tuple[0]),
      of: n(tuple[1]),
      passedAt: n(tuple[2]) ? isoOf(n(tuple[2])) : null,
      attempts: n(tuple[3]),
    };
  }
  for (const [file, tuple] of Object.entries(p.c ?? {})) {
    if (!Array.isArray(tuple)) continue;
    state.capstone.files[file] = {
      state: stateOf(tuple[0]),
      attempts: n(tuple[1]),
      revealed: tuple[2] === 1,
    };
  }
  if (n(p.b)) state.badge.earnedAt = isoOf(n(p.b));
  return state;
}

// ---------------------------------------------------------------------------------------------
// Encode and decode

export async function encodeProgress(
  state: ProgressState,
  options: { compress?: boolean } = {},
): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(project(state)));
  const crc = crc32(json).toString(16).padStart(8, "0");
  const compress = options.compress ?? canCompress();
  const payload = compress ? await pipe(json, new CompressionStream("deflate-raw")) : json;
  return `${PREFIX}${compress ? "Z" : "U"}.${toBase64Url(payload)}.${crc}`;
}

/** Decode a pasted code. Whitespace and line breaks from email clients are ignored. */
export async function decodeProgress(code: string): Promise<ProgressState> {
  const clean = code.replace(/\s+/g, "");
  const match = /^GF(\d+)([ZU])\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/i.exec(clean);
  if (!match) throw new ProgressCodeError("format", "This is not a progress code.");
  if (Number(match[1]) !== CODE_VERSION) {
    throw new ProgressCodeError(
      "version",
      "This progress code comes from a different version of the course.",
    );
  }
  let json: Uint8Array;
  const payload = fromBase64Url(match[3]!);
  if (match[2]!.toUpperCase() === "Z") {
    if (!canCompress()) {
      throw new ProgressCodeError("unsupported", "This browser cannot read compressed progress codes.");
    }
    try {
      json = await pipe(payload, new DecompressionStream("deflate-raw"));
    } catch {
      throw damaged();
    }
  } else {
    json = payload;
  }
  if (crc32(json).toString(16).padStart(8, "0") !== match[4]!.toLowerCase()) throw damaged();
  let projection: unknown;
  try {
    projection = JSON.parse(new TextDecoder().decode(json));
  } catch {
    throw damaged();
  }
  if (typeof projection !== "object" || projection === null || Array.isArray(projection)) throw damaged();
  return unproject(projection as Projection);
}

const damaged = () =>
  new ProgressCodeError("checksum", "This progress code is damaged. Copy the whole code again and paste it.");

/** Counts for the import confirmation: "12 exercises done, 2 quizzes passed". */
export function summarize(state: ProgressState): { exercises: number; quizzes: number; files: number } {
  let exercises = 0;
  for (const lesson of Object.values(state.lessons)) {
    for (const r of Object.values(lesson.exercises ?? {}))
      if (r.state === "correct" || r.state === "revealed") exercises += 1;
  }
  const quizzes = Object.values(state.quizzes).filter((q) => q.passedAt).length;
  const files = Object.values(state.capstone.files).filter(
    (f) => f.state === "correct" || f.state === "revealed",
  ).length;
  return { exercises, quizzes, files };
}
