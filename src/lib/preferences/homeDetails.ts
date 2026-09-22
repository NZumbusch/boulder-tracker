/**
 * The optional parts of each Home card - what Appearance -> Home sections
 * lists as a card's sub-toggles when its row is expanded.
 *
 * Data, not UI: Home asks `homeDetails[id]` whether to render a part, the
 * settings screen renders this list, and `migratePreferences` repairs the
 * stored map against it. A new optional part is one entry here plus the
 * `{#if}` that reads it - no preferences version bump, because a stored
 * map that predates the entry just gets its default filled in.
 *
 * Ids are `<section>.<part>` so they stay unique across cards and read
 * clearly in the stored JSON.
 */

import type { HomeSectionId } from './migrate';

export interface HomeDetailDef {
  id: string;
  label: string;
  /** Shown under the label in settings, when the label alone isn't obvious. */
  hint?: string;
  /** Whether the part shows before the user has touched its toggle. */
  defaultOn: boolean;
}

export const HOME_SECTION_DETAILS: Record<HomeSectionId, HomeDetailDef[]> = {
  readiness: [
    { id: 'readiness.confidence', label: 'Inputs used', hint: 'Which of fatigue, load, sleep and HRV fed the score', defaultOn: true },
    { id: 'readiness.breakdown', label: 'Score breakdown', hint: 'Tap the ring to see what each input took off', defaultOn: true },
  ],
  today: [],
  metrics: [
    { id: 'metrics.sparklines', label: '7-day sparklines', defaultOn: true },
  ],
  fatigue: [],
  thisWeek: [
    { id: 'thisWeek.note', label: 'Week note button', hint: 'Opens this week\'s note; filled when there is one', defaultOn: true },
  ],
  trainingBlock: [
    { id: 'trainingBlock.note', label: 'Block note button', hint: 'Opens the current block\'s note', defaultOn: true },
  ],
  competition: [],
  recentActivity: [],
  weather: [
    { id: 'weather.details', label: 'Feels like, humidity, wind, rain', defaultOn: true },
    { id: 'weather.forecast', label: 'Week ahead', defaultOn: true },
    { id: 'weather.trip', label: 'Trip forecast', hint: 'Only when a trip location is set', defaultOn: true },
  ],
};

export type HomeDetails = Record<string, boolean>;

/** Every registered detail id, each at its default. */
export function defaultHomeDetails(): HomeDetails {
  const result: HomeDetails = {};
  for (const defs of Object.values(HOME_SECTION_DETAILS)) {
    for (const def of defs) result[def.id] = def.defaultOn;
  }
  return result;
}

/**
 * Repairs an unknown value into a full `HomeDetails` map: a known id with a
 * boolean keeps the user's choice, an unknown id is dropped (a part that no
 * longer exists), and every registered id missing from the input gets its
 * default. Never throws.
 */
export function validateHomeDetails(raw: unknown): HomeDetails {
  const result = defaultHomeDetails();
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result;
  const candidate = raw as Record<string, unknown>;
  for (const id of Object.keys(result)) {
    if (typeof candidate[id] === 'boolean') result[id] = candidate[id] as boolean;
  }
  return result;
}
