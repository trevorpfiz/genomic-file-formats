// Field names per column for the snippet viewer's aligned view, "View as table" and
// field-granularity picks (docs/PLAN.md 7.1, 7.8; ux 7.2). The names come from the format
// schemas in src/formats/schemas.ts, the same names that keys and validator diagnostics use
// ("chromStart", "QUAL"); a snippet's own `columns` override them. Pure helpers.
import type { FormatId, Snippet } from "../exercises/types.ts";
import { FORMAT_COLUMNS } from "../formats/schemas.ts";

export { FORMAT_COLUMNS };

/** Formats whose records are TAB-separated columns. */
const TABULAR: ReadonlySet<FormatId> = new Set<FormatId>([
  ...(Object.keys(FORMAT_COLUMNS) as FormatId[]),
  "gfa",
]);

/** Whether a snippet is tabular: a TAB-separated format, explicit columns, or TABs in "other". */
export function isTabular(snippet: Pick<Snippet, "format" | "columns" | "text">): boolean {
  if (snippet.columns?.length) return true;
  if (TABULAR.has(snippet.format)) return true;
  return snippet.format === "other" && (snippet.text ?? "").includes("\t");
}

/** A header, comment or track line: shown muted, never split into columns. */
export function isMetaLine(format: FormatId, text: string): boolean {
  if (text.startsWith("#")) return TABULAR.has(format) || format === "other";
  if (text.startsWith("@")) return format === "sam" || format === "interval_list";
  if (/^(track|browser)(\s|$)/.test(text)) return format === "bed" || format === "bedgraph";
  return false;
}

/** The name of 1-based column `col`; "col 13" beyond the schema. */
export function columnName(snippet: Pick<Snippet, "format" | "columns">, col: number): string {
  const names = snippet.columns ?? FORMAT_COLUMNS[snippet.format];
  if (names?.[col - 1]) return names[col - 1]!;
  if ((snippet.format === "vcf" || snippet.format === "gvcf") && col > 9) return `sample ${col - 9}`;
  if (snippet.format === "sam" && col > 11) return `tag ${col - 11}`;
  return `col ${col}`;
}
