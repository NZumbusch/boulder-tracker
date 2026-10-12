/**
 * Carrying the old "one row per way it was done" over to views.
 *
 * Before views, a test done at several edge depths or loads was split into a
 * series per combination - Home showed "Max Hang · 20 mm" and "· 15 mm" as
 * rows of their own. Nothing is split any more (see `views.ts`), so a test
 * that had a few ways gets one Home view for each, once, and Home reads as
 * it did. Deterministic ids: the same test gives the same views on every
 * device, so a synced copy adopts nothing twice.
 */
import type { Benchmark, BenchmarkTypeDef, BenchmarkView, ValueDef } from "../types";
import type { WeightUnit } from "../units";
import { conditionFields, conditionsText, resolveFields } from "./model";
import { isWeighInType } from "./bodyweight";
import { likeLatestView } from "./views";

/** A test with fewer ways than this was never split; with more, the ways are not a handful to look at (loads that change every time). */
export const MIN_WAYS = 2;
export const MAX_WAYS = 6;
/** Home showed this many rows at most; the newest ways keep one. */
const KEEP_WAYS = 4;

export interface AdoptedWays {
  types: BenchmarkTypeDef[];
  added: { typeId: string; name: string; views: string[] }[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");

export function adoptWayViews(types: readonly BenchmarkTypeDef[], benchmarks: readonly Benchmark[], defs: readonly ValueDef[], weight: WeightUnit = "kg"): AdoptedWays {
  const added: AdoptedWays["added"] = [];
  const next = types.map((type) => {
    if (type.archived || type.views?.length || isWeighInType(type, defs)) return type;
    const fields = resolveFields(type, defs);
    if (conditionFields(fields).every((f) => f.fixed !== undefined)) return type;
    const ways = new Map<string, Benchmark[]>();
    for (const b of benchmarks) {
      if (b.typeId !== type.id) continue;
      // The way is what the filter would match, so a blank and a zero weight are one way.
      const key = Object.entries(likeLatestView(fields, b).filters ?? {}).map(([id, f]) => `${id}=${f.op === "eq" ? f.value : "none"}`).join("|");
      ways.set(key, [...(ways.get(key) ?? []), b]);
    }
    if (ways.size < MIN_WAYS || ways.size > MAX_WAYS) return type;
    const recent = [...ways.entries()]
      .map(([key, list]) => ({ key, latest: [...list].sort((a, b) => b.date.localeCompare(a.date))[0] }))
      .sort((a, b) => b.latest.date.localeCompare(a.latest.date))
      .slice(0, KEEP_WAYS);
    const views: BenchmarkView[] = recent.map(({ key, latest }) => {
      const filters = likeLatestView(fields, latest).filters;
      return {
        id: `way-${slug(type.id)}-${slug(key) || "none"}`,
        name: conditionsText(latest, fields, weight) || "Not noted",
        ...(filters ? { filters } : {}),
        onHome: true,
      };
    });
    added.push({ typeId: type.id, name: type.name, views: views.map((v) => v.name) });
    return { ...type, views };
  });
  return { types: next, added };
}
