import type { OutdoorAscent } from "../types";
import { parseFontGrade } from "../analytics/grades";

/**
 * A handful of numbers about a set of sends: how many, how many on the first
 * go (flash or onsight), the hardest, and the hardest first-go send. Pure -
 * `SendStats` shows them above the grade chart, for whatever period it shows.
 */

export interface SendStats {
  count: number;
  /** Sends with a style that were flashed or onsighted, as a share of those with a style; undefined with none. */
  firstGoRate?: number;
  hardest?: OutdoorAscent;
  hardestFirstGo?: OutdoorAscent;
  /** Sends in the last 28 days of the set, for "how active". */
  recent: number;
}

const FIRST_GO = /^(flash|onsight)$/i;

function hardestOf(list: readonly OutdoorAscent[]): OutdoorAscent | undefined {
  let best: OutdoorAscent | undefined;
  let rank = -Infinity;
  for (const a of list) {
    const r = parseFontGrade(a.grade);
    if (r !== undefined && r > rank) {
      best = a;
      rank = r;
    }
  }
  return best;
}

export function sendStats(ascents: readonly OutdoorAscent[], asOf: Date = new Date()): SendStats {
  const styled = ascents.filter((a) => (a.style ?? "").trim() !== "");
  const firstGo = ascents.filter((a) => FIRST_GO.test(a.style ?? ""));
  const cutoff = asOf.getTime() - 28 * 86_400_000;
  return {
    count: ascents.length,
    ...(styled.length ? { firstGoRate: firstGo.length / styled.length } : {}),
    hardest: hardestOf(ascents),
    hardestFirstGo: hardestOf(firstGo),
    recent: ascents.filter((a) => a.date && new Date(a.date).getTime() >= cutoff && new Date(a.date).getTime() <= asOf.getTime()).length,
  };
}
