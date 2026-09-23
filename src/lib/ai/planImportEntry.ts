import { isChangeSetShape, validateChangeSet, type AIChangeSet } from "./changeSet";
import { validateAIPlanOutput, type ValidationResult } from "./schema";
import { legacyPlanToChangeSet } from "./legacyPlan";
import type { ExerciseTypeDef, PhaseDef } from "../types";

export interface ParsedPlanImport {
  result: ValidationResult<AIChangeSet>;
  /** Set when the paste used an older format and was converted. */
  legacyFormat?: "weekly" | "phase";
}

/**
 * Pasted AI reply -> a validated change set. Change sets are validated
 * directly; the older weekly/phase formats are validated as before and
 * converted, so every import goes through the same planner and preview.
 */
export function parsePlanImport(text: string, current: { exerciseTypes: ExerciseTypeDef[]; phaseDefs: PhaseDef[] }): ParsedPlanImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch (err: any) {
    return { result: { valid: false, data: null, issues: [{ path: "", message: `Could not parse as JSON: ${err.message}` }], repairs: [] } };
  }
  if (isChangeSetShape(raw)) return { result: validateChangeSet(raw) };
  const legacy = validateAIPlanOutput(raw);
  if (!legacy.valid || !legacy.data) {
    // Neither shape: report as a change set, whose errors say what's expected now.
    return { result: validateChangeSet(raw) };
  }
  return {
    result: { valid: true, data: legacyPlanToChangeSet(legacy.data, current), issues: [], repairs: legacy.repairs },
    legacyFormat: legacy.data.format ?? "weekly",
  };
}
