// Progress: the monotonic merges (D-36), the store's merge-on-write, storage events and memory
// fallback (docs/PLAN.md 11.4, D-29), and the progress code (D-23).
import { describe, expect, test, vi } from "vite-plus/test";
import {
  canCompress,
  crc32,
  decodeProgress,
  encodeProgress,
  fromBase64Url,
  ProgressCodeError,
  project,
  summarize,
  toBase64Url,
  unproject,
} from "./progress-code.ts";
import {
  emptyState,
  mergeCapstoneFile,
  mergeExerciseProgress,
  mergeProgressState,
  parseProgress,
} from "./progress-merge.ts";
import { CourseStore, UNREADABLE_KEY } from "./progress-store.ts";
import { PROGRESS_KEY, type ExerciseProgress, type ProgressState } from "./progress-types.ts";
import { probeStorage, type StorageLike } from "./storage.ts";

const T1 = "2026-10-16T10:00:00.000Z";
const T2 = "2026-10-16T11:00:00.000Z";
const T3 = "2026-10-16T12:00:00.000Z";

const ex = (state: ExerciseProgress["state"], extra: Partial<ExerciseProgress> = {}): ExerciseProgress => ({
  state,
  attempts: 1,
  firstTry: false,
  revealed: false,
  ...extra,
});

function state(build: (s: ProgressState) => void, updatedAt = T1): ProgressState {
  const s = emptyState(updatedAt);
  build(s);
  return s;
}

/** A Map-backed Storage, optionally throwing on writes. */
class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  failWrites = false;
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/** A store whose timers run only when the test says so. */
function makeStore(storage: StorageLike | null, now = () => T2) {
  const pending: (() => void)[] = [];
  const store = new CourseStore({
    storage,
    now,
    setTimer: (fn) => pending.push(fn),
    clearTimer: () => pending.splice(0),
  });
  const runTimers = () => pending.splice(0).forEach((fn) => fn());
  return { store, runTimers, pending };
}

describe("merge rules (D-36)", () => {
  test("a complete state never reverts; correct beats revealed", () => {
    expect(mergeExerciseProgress(ex("correct"), ex("attempted", { updatedAt: T3 })).state).toBe("correct");
    expect(mergeExerciseProgress(ex("idle", { updatedAt: T3 }), ex("revealed")).state).toBe("revealed");
    expect(mergeExerciseProgress(ex("revealed", { updatedAt: T3 }), ex("correct")).state).toBe("correct");
  });

  test("between incomplete states the newer wins; attempts take the maximum; flags stick", () => {
    const merged = mergeExerciseProgress(
      ex("incorrect", { attempts: 3, updatedAt: T1, firstTry: true }),
      ex("attempted", { attempts: 1, updatedAt: T2, revealed: true }),
    );
    expect(merged).toMatchObject({
      state: "attempted",
      attempts: 3,
      firstTry: true,
      revealed: true,
      updatedAt: T2,
    });
  });

  test("solvedAt takes the earliest date; the answer travels with the winner; unknown keys survive", () => {
    const a = { ...ex("correct", { solvedAt: T2, answer: [1] }), extra: "a" } as ExerciseProgress;
    const b = { ...ex("correct", { solvedAt: T1, updatedAt: T3 }), other: 2 } as ExerciseProgress;
    const merged = mergeExerciseProgress(a, b) as ExerciseProgress & { extra?: string; other?: number };
    expect(merged.solvedAt).toBe(T1);
    expect(merged.answer).toEqual([1]);
    expect(merged.extra).toBe("a");
    expect(merged.other).toBe(2);
  });

  test("merges are commutative on states", () => {
    const pairs: [ExerciseProgress, ExerciseProgress][] = [
      [ex("correct", { updatedAt: T1 }), ex("revealed", { updatedAt: T2 })],
      [ex("incorrect", { updatedAt: T1 }), ex("attempted", { updatedAt: T2 })],
      [ex("idle"), ex("attempted")],
    ];
    for (const [a, b] of pairs) expect(mergeExerciseProgress(a, b)).toEqual(mergeExerciseProgress(b, a));
  });

  test("capstone files follow the exercise rules", () => {
    const merged = mergeCapstoneFile(
      { state: "correct", attempts: 1, revealed: false },
      { state: "incorrect", attempts: 4, revealed: true },
    );
    expect(merged).toEqual({ state: "correct", attempts: 4, revealed: true });
  });

  test("whole states: quiz best and Passed are permanent, earliest pass and badge dates, unknown keys kept", () => {
    const a = state((s) => {
      s.quizzes.sequences = { best: 6, of: 6, passedAt: T2, attempts: 2 };
      s.badge.earnedAt = T3;
      s.lessons["fasta-reference"] = { exercises: { "fasta-reference/a": ex("correct") }, visitedAt: T1 };
      (s as unknown as Record<string, unknown>).future = { keep: true };
      s.prefs.whitespace = true;
      (s.prefs as unknown as Record<string, unknown>).zoom = 2;
    }, T1);
    const b = state((s) => {
      s.quizzes.sequences = { best: 3, of: 6, passedAt: null, attempts: 3 };
      s.quizzes.regions = { best: 5, of: 6, passedAt: T1, attempts: 1 };
      s.badge.earnedAt = T2;
      s.lessons["fasta-reference"] = { exercises: { "fasta-reference/b": ex("revealed") }, visitedAt: T3 };
      s.capstone.completedAt = T2;
    }, T2);
    const merged = mergeProgressState(a, b);
    expect(merged.quizzes.sequences).toMatchObject({ best: 6, passedAt: T2, attempts: 3 });
    expect(merged.quizzes.regions?.passedAt).toBe(T1);
    expect(merged.badge.earnedAt).toBe(T2);
    expect(Object.keys(merged.lessons["fasta-reference"]!.exercises).sort()).toEqual([
      "fasta-reference/a",
      "fasta-reference/b",
    ]);
    expect(merged.lessons["fasta-reference"]!.visitedAt).toBe(T3);
    expect(merged.capstone.completedAt).toBe(T2);
    expect((merged as unknown as Record<string, unknown>).future).toEqual({ keep: true });
    // Preferences follow the newer state, key by key over the older one.
    expect(merged.prefs.whitespace).toBe(false);
    expect((merged.prefs as unknown as Record<string, unknown>).zoom).toBe(2);
    expect(merged.updatedAt).toBe(T2);
    expect(mergeProgressState(b, a).quizzes).toEqual(merged.quizzes);
  });

  test("parsing repairs malformed fields, keeps unknown ones and refuses newer schemas", () => {
    const raw = JSON.stringify({
      schema: 1,
      updatedAt: T1,
      lessons: { x: { exercises: { "x/a": { state: "bogus", attempts: "3", firstTry: 1 } }, note: "n" } },
      quizzes: { s: { best: 5 } },
      extra: [1, 2],
    });
    const parsed = parseProgress(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.state.lessons.x?.exercises["x/a"]).toEqual({
      state: "idle",
      attempts: 0,
      firstTry: false,
      revealed: false,
    });
    expect((parsed.state.lessons.x as unknown as { note: string }).note).toBe("n");
    expect(parsed.state.quizzes.s).toEqual({ best: 5, of: 0, passedAt: null, attempts: 0 });
    expect((parsed.state as unknown as { extra: number[] }).extra).toEqual([1, 2]);
    expect(parseProgress(JSON.stringify({ schema: 2 }))).toEqual({ ok: false, reason: "newer-schema" });
    expect(parseProgress("{not json")).toEqual({ ok: false, reason: "invalid" });
    expect(parseProgress(null)).toEqual({ ok: false, reason: "empty" });
  });
});

describe("the store", () => {
  test("probeStorage returns null when storage throws or is missing", () => {
    expect(probeStorage(undefined)).toBeNull();
    const throwing = {
      get localStorage(): StorageLike {
        throw new DOMException("denied", "SecurityError");
      },
    };
    expect(probeStorage(throwing)).toBeNull();
    const ok = new MemoryStorage();
    expect(probeStorage({ localStorage: ok })).toBe(ok);
    expect(ok.map.size).toBe(0);
  });

  test("writes are debounced merges with what another page stored meanwhile", () => {
    const storage = new MemoryStorage();
    const { store, runTimers, pending } = makeStore(storage);
    store.putExercise("fasta-reference/a", ex("correct", { updatedAt: T2 }));
    expect(pending).toHaveLength(1);
    expect(storage.getItem(PROGRESS_KEY)).toBeNull();
    // Another page writes a passed quiz before this one flushes.
    storage.setItem(
      PROGRESS_KEY,
      JSON.stringify(state((s) => (s.quizzes.sequences = { best: 6, of: 6, passedAt: T1, attempts: 1 }))),
    );
    runTimers();
    const stored = parseProgress(storage.getItem(PROGRESS_KEY));
    expect(stored.ok && stored.state.quizzes.sequences?.passedAt).toBe(T1);
    expect(stored.ok && stored.state.lessons["fasta-reference"]?.exercises["fasta-reference/a"]?.state).toBe(
      "correct",
    );
    // Memory now has the other page's quiz too.
    expect(store.getQuiz("sequences")?.best).toBe(6);
  });

  test("a reset card never erases a stored correct state", () => {
    const storage = new MemoryStorage();
    const first = makeStore(storage);
    first.store.putExercise("fastq-reads/a", ex("correct", { updatedAt: T1 }));
    first.store.flush();
    const second = makeStore(storage, () => T3);
    second.store.putExercise("fastq-reads/a", ex("idle", { updatedAt: T3, attempts: 0 }));
    second.store.flush();
    expect(second.store.getExercise("fastq-reads/a")?.state).toBe("correct");
    const stored = parseProgress(storage.getItem(PROGRESS_KEY));
    expect(stored.ok && stored.state.lessons["fastq-reads"]?.exercises["fastq-reads/a"]?.state).toBe(
      "correct",
    );
  });

  test("storage events merge into memory and notify", () => {
    const { store } = makeStore(new MemoryStorage());
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.receive(JSON.stringify(state((s) => (s.lessons.x = { exercises: { "x/a": ex("revealed") } }))));
    expect(store.getExercise("x/a")?.state).toBe("revealed");
    expect(calls).toBe(1);
    store.receive(JSON.stringify(state((s) => (s.lessons.x = { exercises: { "x/a": ex("revealed") } }))));
    expect(calls).toBe(1);
    store.receive("garbage");
    expect(calls).toBe(1);
  });

  test("unknown keys in storage survive a write by this version", () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_KEY, JSON.stringify({ ...emptyState(T1), lessons: {}, newer: { x: 1 } }));
    const { store } = makeStore(storage);
    store.visit("fasta-reference");
    store.flush();
    expect(JSON.parse(storage.getItem(PROGRESS_KEY)!).newer).toEqual({ x: 1 });
  });

  test("without storage the store keeps state in memory", () => {
    const { store, pending } = makeStore(null);
    expect(store.persistent).toBe(false);
    expect(store.memoryReason).toBe("unavailable");
    store.putExercise("x/a", ex("correct"));
    expect(pending).toHaveLength(0);
    expect(store.getExercise("x/a")?.state).toBe("correct");
  });

  test("a failed write falls back to memory and says so once", () => {
    const storage = new MemoryStorage();
    const { store } = makeStore(storage);
    const reasons: (string | null)[] = [];
    store.onPersistence((_p, reason) => reasons.push(reason));
    storage.failWrites = true;
    store.putExercise("x/a", ex("correct"));
    store.flush();
    store.flush();
    expect(store.persistent).toBe(false);
    expect(reasons).toEqual(["write-failed"]);
    expect(store.getExercise("x/a")?.state).toBe("correct");
  });

  test("a newer schema is left alone; an unreadable value is backed up before it is replaced", () => {
    const newer = new MemoryStorage();
    newer.setItem(PROGRESS_KEY, JSON.stringify({ schema: 9 }));
    const a = makeStore(newer);
    expect(a.store.memoryReason).toBe("newer-schema");
    a.store.putExercise("x/a", ex("correct"));
    a.store.flush();
    expect(newer.getItem(PROGRESS_KEY)).toBe(JSON.stringify({ schema: 9 }));

    const broken = new MemoryStorage();
    broken.setItem(PROGRESS_KEY, "{oops");
    const b = makeStore(broken);
    b.store.putExercise("x/a", ex("correct"));
    b.store.flush();
    expect(broken.getItem(UNREADABLE_KEY)).toBe("{oops");
    expect(parseProgress(broken.getItem(PROGRESS_KEY)).ok).toBe(true);
  });

  test("import merges by default and replaces only when asked", () => {
    const storage = new MemoryStorage();
    const { store } = makeStore(storage);
    store.putExercise("x/a", ex("correct"));
    store.importState(state((s) => (s.lessons.x = { exercises: { "x/b": ex("revealed") } })));
    expect(store.getExercise("x/a")?.state).toBe("correct");
    expect(store.getExercise("x/b")?.state).toBe("revealed");
    store.importState(
      state((s) => (s.lessons.y = { exercises: { "y/c": ex("correct") } })),
      "replace",
    );
    expect(store.getExercise("x/a")).toBeUndefined();
    expect(store.getExercise("y/c")?.state).toBe("correct");
    const stored = parseProgress(storage.getItem(PROGRESS_KEY));
    expect(stored.ok && Object.keys(stored.state.lessons)).toEqual(["y"]);
  });
});

describe("importing a progress code", () => {
  test("keeps this browser's preferences and badge name, which a code does not carry", () => {
    const storage = new MemoryStorage();
    const local = state((s) => {
      s.badge.name = "Noa Learner";
      s.prefs.whitespace = true;
    }, T1);
    storage.setItem(PROGRESS_KEY, JSON.stringify(local));
    const { store } = makeStore(storage, () => T3);
    // The code is newer than the local state, as when progress moves between copies.
    const code = unproject(
      project(state((s) => (s.lessons.x = { exercises: { "x/a": ex("correct") } }), T2)),
    );
    for (const mode of ["merge", "replace"] as const) {
      store.importState(code, mode);
      expect(store.state.badge.name, mode).toBe("Noa Learner");
      expect(store.state.prefs.whitespace, mode).toBe(true);
      expect(store.getExercise("x/a")?.state, mode).toBe("correct");
    }
  });
});

describe("the progress code (D-23)", () => {
  test("CRC-32 matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  test("base64url round-trips every byte", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const text = toBase64Url(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  const sample = state((s) => {
    s.lessons["fasta-reference"] = {
      visitedAt: T1,
      exercises: {
        "fasta-reference/which-token": ex("correct", {
          attempts: 2,
          firstTry: false,
          answer: [2],
          solvedAt: T1,
        }),
        "fasta-reference/fix-header": ex("revealed", { attempts: 3, revealed: true }),
        "fasta-reference/try": ex("correct", { firstTry: true }),
        "fasta-reference/open": ex("attempted"),
      },
    };
    s.quizzes.sequences = { best: 5, of: 6, passedAt: "2026-10-16T10:30:00.000Z", attempts: 2 };
    s.quizzes.regions = { best: 3, of: 6, passedAt: null, attempts: 1 };
    s.capstone.files.F01 = { state: "correct", attempts: 1, revealed: false };
    s.badge.earnedAt = T3;
    s.prefs.whitespace = true;
  }, T2);

  test.each([true, false])("round-trips the projection (compressed: %s)", async (compress) => {
    const code = await encodeProgress(sample, { compress });
    expect(code).toMatch(compress ? /^GF1Z\./ : /^GF1U\./);
    const decoded = await decodeProgress(code);
    expect(project(decoded)).toEqual(project(sample));
    expect(decoded.lessons["fasta-reference"]?.exercises["fasta-reference/which-token"]).toEqual({
      state: "correct",
      attempts: 2,
      firstTry: false,
      revealed: false,
    });
    expect(decoded.quizzes.sequences?.passedAt).toBe("2026-10-16T10:30:00.000Z");
    expect(decoded.badge.earnedAt).toBe(T3);
    // No answers and no preferences travel.
    expect(JSON.stringify(decoded)).not.toContain('"answer"');
    expect(decoded.prefs.whitespace).toBe(false);
  });

  test("a code survives line breaks and spaces from an email client", async () => {
    const code = await encodeProgress(sample);
    const wrapped = code.replace(/(.{20})/g, "$1\n  ");
    expect(project(await decodeProgress(wrapped))).toEqual(project(sample));
  });

  test("damaged, foreign and unknown-version codes are refused with a reason", async () => {
    const code = await encodeProgress(sample, { compress: false });
    const [head, payload, crc] = code.split(".") as [string, string, string];
    const flipped = payload.slice(0, 10) + (payload[10] === "A" ? "B" : "A") + payload.slice(11);
    await expect(decodeProgress(`${head}.${flipped}.${crc}`)).rejects.toMatchObject({ reason: "checksum" });
    await expect(decodeProgress("hello")).rejects.toBeInstanceOf(ProgressCodeError);
    await expect(decodeProgress(`GF2U.${payload}.${crc}`)).rejects.toMatchObject({ reason: "version" });
    const compressed = await encodeProgress(sample, { compress: true });
    await expect(decodeProgress(compressed.slice(0, -1) + "0")).rejects.toMatchObject({ reason: "checksum" });
  });

  test("a browser whose streams lack deflate-raw writes GF1U codes and reads GF1Z as unsupported", async () => {
    const compressed = await encodeProgress(sample, { compress: true });
    class NoDeflateRaw {
      constructor(format: string) {
        if (format === "deflate-raw") throw new TypeError(`Unsupported compression format: ${format}`);
      }
    }
    vi.stubGlobal("CompressionStream", NoDeflateRaw);
    vi.stubGlobal("DecompressionStream", NoDeflateRaw);
    try {
      expect(canCompress()).toBe(false);
      const code = await encodeProgress(sample);
      expect(code).toMatch(/^GF1U\./);
      expect(project(await decodeProgress(code))).toEqual(project(sample));
      await expect(decodeProgress(compressed)).rejects.toMatchObject({ reason: "unsupported" });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(canCompress()).toBe(true);
  });

  test("imported records merge without overriding newer incomplete work on this device", () => {
    const local = state((s) => {
      s.lessons.x = {
        exercises: { "x/a": ex("attempted", { updatedAt: T3 }), "x/b": ex("attempted", { updatedAt: T3 }) },
      };
    }, T3);
    const imported = unproject(
      project(state((s) => (s.lessons.x = { exercises: { "x/a": ex("incorrect"), "x/b": ex("correct") } }))),
    );
    const merged = mergeProgressState(local, imported);
    expect(merged.lessons.x?.exercises["x/a"]?.state).toBe("attempted");
    expect(merged.lessons.x?.exercises["x/b"]?.state).toBe("correct");
  });

  test("a fully completed course encodes to a few kilobytes at most", async () => {
    const full = state((s) => {
      for (let l = 1; l <= 22; l += 1) {
        const lesson = `lesson-number-${l}-with-a-longish-id`;
        const exercises: Record<string, ExerciseProgress> = {};
        for (let e = 1; e <= 6; e += 1) {
          exercises[`${lesson}/exercise-slug-number-${e}`] = ex("correct", {
            attempts: 3,
            firstTry: e % 2 === 0,
          });
        }
        s.lessons[lesson] = { exercises, visitedAt: T1 };
      }
      for (const q of [
        "foundations",
        "sequences",
        "regions",
        "alignments",
        "coverage-and-variants",
        "annotation",
        "sv-and-graphs",
      ])
        s.quizzes[q] = { best: 6, of: 6, passedAt: T2, attempts: 4 };
      for (let f = 1; f <= 15; f += 1)
        s.capstone.files[`F${String(f).padStart(2, "0")}`] = {
          state: "correct",
          attempts: 2,
          revealed: false,
        };
      s.badge.earnedAt = T3;
    });
    const compressed = await encodeProgress(full, { compress: true });
    const plain = await encodeProgress(full, { compress: false });
    expect(compressed.length).toBeLessThan(2048);
    expect(plain.length).toBeLessThan(16_384);
    expect(summarize(await decodeProgress(compressed))).toEqual({ exercises: 132, quizzes: 7, files: 15 });
  });
});
