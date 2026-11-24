import type { SyncDecision } from "./syncEngine";

/**
 * A Drive sync merge for the data log: for sessions and the other small
 * tables one line per record (which device's version, and why), for the
 * big ones (daily values, activities, Garmin data) a count per device.
 */

/** Tables named record by record. */
const ONE_BY_ONE = new Set(["workouts", "dismissedSessions", "trainingBlocks", "planAlternatives", "painLogs", "benchmarks", "outdoorAscents", "goals", "weekNotes", "coachNotes", "templates", "phaseDefs"]);
const PER_RECORD_MAX = 60;

const when = (t: number) => (t === 0 ? "before sync was on" : new Date(t).toISOString().slice(0, 16).replace("T", " "));

function line(d: SyncDecision): string {
  const what = `${d.table}/${d.key} (${d.label})`;
  switch (d.how) {
    case "new":
      return `${what}: new here, from ${d.deviceName} (changed ${when(d.remote.t)})`;
    case "newer":
      return `${what}: took ${d.deviceName}'s version - theirs ${when(d.remote.t)} is newer than ours ${when(d.local!.t)}`;
    case "deleted":
      return `${what}: DELETED, as on ${d.deviceName} - deleted there ${when(d.remote.t)}, ours ${when(d.local!.t)}`;
    case "joined":
      return `${what}: edited on both, joined - theirs ${when(d.remote.t)}, ours ${when(d.local!.t)}`;
    case "kept":
      return `${what}: kept ours - ours ${when(d.local!.t)} is newer than ${d.deviceName}'s ${when(d.remote.t)}`;
  }
}

export function describeDecisions(decisions: readonly SyncDecision[]): string[] {
  const lines: string[] = [];
  const counts = new Map<string, number>();
  let named = 0;
  for (const d of decisions) {
    if (ONE_BY_ONE.has(d.table) && named < PER_RECORD_MAX) {
      lines.push(line(d));
      named++;
      continue;
    }
    const k = `${d.table}: ${d.how} from ${d.deviceName}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [k, n] of counts) lines.push(`${k} ×${n}`);
  return lines;
}
