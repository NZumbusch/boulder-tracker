/**
 * Which zone an acute:chronic ratio falls in, named the way Home names it
 * ("high risk", "caution", "sweet spot", "low"). One function so the Load
 * chart's dots, the week sheet and the labels agree with each other:
 * the chart used to call everything under the caution edge "good", so a
 * week Home called "low" showed a green dot.
 *
 * Edges follow Home's rule: above `highRisk` is high risk, above `caution`
 * is caution, from `sweetMin` up is the sweet spot, below it is low.
 */
export interface AcwrZones {
  sweetMin: number;
  caution: number;
  highRisk: number;
}

export type AcwrZoneId = "low" | "sweet" | "caution" | "risk";

export const ACWR_ZONE_LABEL: Record<AcwrZoneId, string> = {
  low: "low",
  sweet: "sweet spot",
  caution: "caution",
  risk: "high risk",
};

export function acwrZone(ratio: number, zones: AcwrZones): AcwrZoneId {
  if (ratio > zones.highRisk) return "risk";
  if (ratio > zones.caution) return "caution";
  if (ratio >= zones.sweetMin) return "sweet";
  return "low";
}
