import type { GoalEvent, OutdoorAscent } from "../types";
import { coversDate } from "../goals/goals";

export type SendGroup =
  | { kind: "trip"; key: string; trip: GoalEvent; sends: OutdoorAscent[] }
  | { kind: "month"; key: string; month: string; sends: OutdoorAscent[] };

/**
 * Sends newest first, grouped under the trip whose days cover them, and
 * otherwise by month. Groups are ordered by their newest send.
 */
export function groupSends(ascents: OutdoorAscent[], goals: GoalEvent[]): SendGroup[] {
  const trips = goals.filter((g) => g.kind === "trip");
  const groups = new Map<string, SendGroup>();
  const sorted = [...ascents].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const send of sorted) {
    const trip = send.date ? trips.find((t) => coversDate(t, send.date)) : undefined;
    const key = trip ? `trip-${trip.id}` : `month-${(send.date || "").slice(0, 7)}`;
    let group = groups.get(key);
    if (!group) {
      group = trip
        ? { kind: "trip", key, trip, sends: [] }
        : { kind: "month", key, month: (send.date || "").slice(0, 7), sends: [] };
      groups.set(key, group);
    }
    group.sends.push(send);
  }
  return [...groups.values()];
}
