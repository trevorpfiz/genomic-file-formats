// gzip and BGZF container summaries (RFC 1952; SAMv1 v1.6 §4.1; seq 3.4, 6; found 4.5).
// Binary files are checked on precomputed HexView summaries, never decompressed in the browser
// (docs/PLAN.md 8.2, D-20). Pure and DOM-free.
import type { HexView } from "../exercises/types.ts";

/** gzip magic, ID1 ID2. */
export const GZIP_MAGIC = [0x1f, 0x8b] as const;
/** FLG bit 2: the header has an extra field (FEXTRA). */
export const FEXTRA = 0x04;
/** The 28-byte BGZF end-of-file block (SAMv1 §4.1.2). */
export const BGZF_EOF: readonly number[] = [
  0x1f, 0x8b, 0x08, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0x06, 0x00, 0x42, 0x43, 0x02, 0x00, 0x1b, 0x00,
  0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
];

/** Parse space-separated hex bytes ("1f 8b 08"). Throws on a malformed token: views are authored data. */
export function hexBytes(hex: string): number[] {
  const tokens = hex.trim() === "" ? [] : hex.trim().split(/\s+/);
  return tokens.map((t) => {
    if (!/^[0-9a-fA-F]{2}$/.test(t)) throw new Error(`hexBytes: "${t}" is not a two-digit hex byte`);
    return Number.parseInt(t, 16);
  });
}

/** Lowercase space-separated hex for bytes. */
export const toHex = (bytes: Iterable<number>): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");

export interface GzipSummary {
  head: number[];
  tail: number[];
  /**
   * Whether the view shows the true end of the file: it has a tail, or it is a head with
   * `omittedBytes: 0` (the whole file). A head-only excerpt says nothing about the end.
   */
  endKnown: boolean;
  /** Total file size, when the view gives `omittedBytes` and shows the end. */
  size?: number;
  /** Starts with 1f 8b. */
  magic: boolean;
  /** Compression method (8 = DEFLATE), when shown. */
  method?: number;
  /** The FLG byte, when shown. */
  flg?: number;
  fextra: boolean;
  /**
   * The BGZF `BC` subfield of the first member: its byte offset, and BSIZE (block size minus 1)
   * when the view shows it (seq 6's 16-byte head stops just before BSIZE).
   */
  bc?: { offset: number; bsize?: number };
  /** "bgzf": a gzip member with `BC`; "gzip": a gzip member without it; "other": not gzip; "unknown": too few bytes shown. */
  kind: "bgzf" | "gzip" | "other" | "unknown";
  /** The last 28 bytes are the BGZF EOF block; undefined unless the view shows the last 28 bytes. */
  eofBlock?: boolean;
  /** The gzip trailer of the last member, CRC-32 and ISIZE, little-endian (only when the end is known). */
  trailer?: { crc32: number; isize: number };
}

const u16 = (b: readonly number[], at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u32 = (b: readonly number[], at: number): number =>
  ((b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16) | ((b[at + 3] ?? 0) << 24)) >>> 0;

/** Summarise the container bytes a HexView shows. */
export function summarizeGzip(view: HexView): GzipSummary {
  const head = hexBytes(view.head);
  const tail = view.tail === undefined ? [] : hexBytes(view.tail);
  const endKnown = view.tail !== undefined || view.omittedBytes === 0;
  const end = view.tail !== undefined ? tail : head;
  const summary: GzipSummary = {
    head,
    tail,
    endKnown,
    magic: head[0] === GZIP_MAGIC[0] && head[1] === GZIP_MAGIC[1],
    fextra: false,
    kind: "unknown",
  };
  if (endKnown && view.omittedBytes !== undefined)
    summary.size = head.length + view.omittedBytes + tail.length;
  if (head.length >= 2 && !summary.magic) summary.kind = "other";
  if (head.length >= 3) summary.method = head[2];
  if (head.length >= 4) {
    summary.flg = head[3]!;
    summary.fextra = (summary.flg & FEXTRA) !== 0;
  }
  if (summary.magic && summary.flg !== undefined) {
    if (!summary.fextra) summary.kind = "gzip";
    else if (head.length >= 12) {
      // The extra field: XLEN at 10-11, then subfields SI1 SI2 SLEN DATA (RFC 1952 §2.3.1.1).
      const xlen = u16(head, 10);
      let at = 12;
      while (at + 4 <= 12 + xlen && at + 4 <= head.length) {
        const slen = u16(head, at + 2);
        if (head[at] === 0x42 && head[at + 1] === 0x43 && slen === 2) {
          summary.bc = at + 6 <= head.length ? { offset: at, bsize: u16(head, at + 4) } : { offset: at };
          break;
        }
        at += 4 + slen;
      }
      if (summary.bc) summary.kind = "bgzf";
      else if (12 + xlen <= head.length) summary.kind = "gzip";
    }
  }
  if (endKnown && end.length >= 8) {
    summary.trailer = { crc32: u32(end, end.length - 8), isize: u32(end, end.length - 4) };
  }
  if (endKnown && end.length >= BGZF_EOF.length) {
    const last = end.slice(end.length - BGZF_EOF.length);
    summary.eofBlock = last.every((b, i) => b === BGZF_EOF[i]);
  } else if (summary.size !== undefined && summary.size < BGZF_EOF.length) {
    summary.eofBlock = false; // the whole file is shorter than the EOF block
  } // else: a tail shorter than 28 bytes cannot show the EOF block, so it stays unknown
  return summary;
}

let crcTable: Uint32Array | undefined;

/** CRC-32 (IEEE 802.3, as in gzip trailers). */
export function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Whether a plain gzip file's trailer matches its decompressed text: the last 8 bytes must be the
 * CRC-32 and the length (mod 2^32) of the decompressed data (RFC 1952 §2.3.1). This is what
 * `gzip -t` checks at the end of the stream. It assumes one gzip member (a concatenation of
 * members carries the trailer of its last member only). Undefined when the end is not shown.
 */
export function gzipTrailerMatches(summary: GzipSummary, decoded: string): boolean | undefined {
  if (!summary.trailer) return undefined;
  const bytes = new TextEncoder().encode(decoded);
  return summary.trailer.isize === bytes.length % 2 ** 32 && summary.trailer.crc32 === crc32(bytes);
}
