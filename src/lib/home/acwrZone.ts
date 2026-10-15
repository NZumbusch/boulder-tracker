/**
 * One classification of the acute:chronic load ratio (ACWR), for every screen that names a zone: Home's This week pill,
 * the load-ratio sheet and, when it picks this up, the Analytics chart. The edges are the athlete's own
 * (Settings -> Training model) and belong to the lower zone - "above 1.3 is caution", not "1.3 and up" - which is
 * how the sheets and the glossary word them.
 *
 * `status` is the colour family (the status tokens): a low ratio is `good`, like the readiness score treats it (it takes
 * nothing off for it) and like the chart's green band: the word "Low" and the meaning say it is less than you are used
 * to, which is fine for a rest week, and the colour never says "worry".
 */
export type AcwrZoneId = 'low' | 'sweet' | 'caution' | 'risk';
export type AcwrStatus = 'good' | 'caution' | 'risk';

export interface AcwrZoneEdges {
  sweetMin: number;
  caution: number;
  highRisk: number;
}

export interface AcwrZoneInfo {
  zone: AcwrZoneId;
  status: AcwrStatus;
  /** Short name: "Low", "Sweet spot", "Caution", "High risk". */
  label: string;
  /** One plain phrase: what the zone means. */
  meaning: string;
}

const INFO: Record<AcwrZoneId, Omit<AcwrZoneInfo, 'zone'>> = {
  low: { status: 'good', label: 'Low', meaning: 'Less than you are used to' },
  sweet: { status: 'good', label: 'Sweet spot', meaning: 'In line with what you are used to' },
  caution: { status: 'caution', label: 'Caution', meaning: 'More than you are used to' },
  risk: { status: 'risk', label: 'High risk', meaning: 'A sharp jump on what you are used to' },
};

/** Where a ratio falls, by the athlete's own edges. */
export function acwrZoneId(ratio: number, edges: AcwrZoneEdges): AcwrZoneId {
  if (ratio > edges.highRisk) return 'risk';
  if (ratio > edges.caution) return 'caution';
  if (ratio >= edges.sweetMin) return 'sweet';
  return 'low';
}

/** The zone of a ratio with its label, colour family and meaning; undefined while there is no counted ratio. */
export function acwrZone(ratio: number | undefined, edges: AcwrZoneEdges): AcwrZoneInfo | undefined {
  if (ratio === undefined || Number.isNaN(ratio)) return undefined;
  const zone = acwrZoneId(ratio, edges);
  return { zone, ...INFO[zone] };
}

/** Classes per colour family for a pill (whole literal strings, so the compiler finds them). */
export const ACWR_PILL: Record<AcwrStatus, string> = {
  good: 'bg-status-good/15 text-status-good',
  caution: 'bg-status-caution/15 text-status-caution',
  risk: 'bg-status-risk/15 text-status-risk',
};
