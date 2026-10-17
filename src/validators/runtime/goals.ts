// RUNTIME fix-it goal checks (docs/PLAN.md 7.2): they stop a learner passing by deleting
// content. A FixItGoal names one of these by `check` and passes `args`. Pure; they ship in the
// browser. Content tests require every fix-it solution to pass all its goals.
import { parseFasta, sequenceOf } from "../../formats/fasta.ts";
import type { GoalCheckId } from "../../exercises/types.ts";
import type { GoalCheck } from "../types.ts";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

export const GOAL_CHECKS: Readonly<Record<GoalCheckId, GoalCheck>> = {
  /** args `{ names: string[] }`: every name is still a record name. */
  fastaKeepsRecords(text, args) {
    if (!isRecord(args) || !strings(args.names)) return false;
    const names = new Set(parseFasta(text).records.map((r) => r.name));
    return args.names.every((n) => names.has(n));
  },
  /**
   * args `{ name: string; bases: string }`: the first record with that name still holds exactly
   * these bases, ignoring line breaks and case (soft-masking does not change a base).
   */
  fastaKeepsBases(text, args) {
    if (!isRecord(args) || typeof args.name !== "string" || typeof args.bases !== "string") return false;
    const record = parseFasta(text).records.find((r) => r.name === args.name);
    return record !== undefined && sequenceOf(record).toUpperCase() === args.bases.toUpperCase();
  },
  /** No args: every record name is used once (FA-M01 as a goal rather than an error). */
  fastaUniqueNames(text) {
    const names = parseFasta(text).records.map((r) => r.name);
    return new Set(names).size === names.length;
  },
};
