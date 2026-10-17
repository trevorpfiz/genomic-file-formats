// Guarded localStorage access (docs/PLAN.md 11.4, D-29). Storage can be missing or throw on
// every access: Safari on file://, private windows, blocked site data, quota errors. Nothing
// here ever throws; callers get null or false and fall back to memory.

/** The subset of Storage the shell uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PROBE_KEY = "genomic-file-formats:probe";

/**
 * Write and read back a test key. Returns the storage when it works, else null. Reading
 * `window.localStorage` itself can throw (a SecurityError), so the getter is inside the try.
 */
export function probeStorage(win: { localStorage?: StorageLike } | undefined): StorageLike | null {
  try {
    const storage = win?.localStorage;
    if (!storage) return null;
    const token = String(Date.now());
    storage.setItem(PROBE_KEY, token);
    const ok = storage.getItem(PROBE_KEY) === token;
    storage.removeItem(PROBE_KEY);
    return ok ? storage : null;
  } catch {
    return null;
  }
}

export function readItem(storage: StorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** True when the value was written. */
export function writeItem(storage: StorageLike | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeItem(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to do: the value stays, and the next write replaces it.
  }
}
