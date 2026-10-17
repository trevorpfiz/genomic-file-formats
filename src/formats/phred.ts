// Phred arithmetic (found 3.4; seq 2, EX-07): Q = -10 log10 P, P = 10^(-Q/10), one ASCII
// character per base at Q + 33. Pure; used by the phred-converter model, validators and the
// content-test helpers. Never average Q values: convert to P first, then sum.

/** The Sanger / Illumina 1.8+ offset. */
export const PHRED33 = 33;
/** The legacy Illumina 1.3-1.7 offset. */
export const PHRED64 = 64;

/** Q for one quality character at the given offset. */
export function charToQ(char: string, offset = PHRED33): number {
  if (char.length !== 1) throw new RangeError(`charToQ: expected one character, got ${JSON.stringify(char)}`);
  return char.charCodeAt(0) - offset;
}

/** The quality character for Q at the given offset. */
export const qToChar = (q: number, offset = PHRED33): string => String.fromCharCode(q + offset);

/** Error probability for a Phred score. */
export const qToP = (q: number): number => 10 ** (-q / 10);

/** Phred score for an error probability (not rounded). */
export const pToQ = (p: number): number => -10 * Math.log10(p);

/** Expected number of errors in a read: the sum of its per-base error probabilities. */
export function expectedErrors(quality: string, offset = PHRED33): number {
  let sum = 0;
  for (const c of quality) sum += qToP(charToQ(c, offset));
  return sum;
}

export type QualityEncoding = "phred33" | "possibly-phred64" | "unknown";

/**
 * What the characters prove (seq pitfall 10; docs/PLAN.md 8.3 FQ-M01): any character below `;`
 * (59) proves Phred+33; if every character is `@` (64) or above, the file may be Phred+64;
 * otherwise nothing is proved.
 */
export function inferEncoding(qualities: Iterable<string>): QualityEncoding {
  let min = Infinity;
  for (const q of qualities) for (const c of q) min = Math.min(min, c.charCodeAt(0));
  if (min === Infinity) return "unknown";
  if (min < 59) return "phred33";
  if (min >= 64) return "possibly-phred64";
  return "unknown";
}

/** Distinct quality characters, sorted by code; 4 or fewer suggests binned qualities (D-18). */
export function qualityAlphabet(qualities: Iterable<string>): string[] {
  const set = new Set<string>();
  for (const q of qualities) for (const c of q) set.add(c);
  return [...set].sort((a, b) => a.charCodeAt(0) - b.charCodeAt(0));
}
