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
  checklist: [],
  readiness: [
    { id: 'readiness.confidence', label: 'Inputs used', hint: 'Which of fatigue, load, sleep and HRV fed the score', defaultOn: true },
    { id: 'readiness.breakdown', label: 'Score breakdown', hint: 'Tap the ring to see what each input took off', defaultOn: true },
  ],
  alerts: [
    { id: 'alerts.recovery', label: 'Recovery', hint: 'Days in a row without rest; a load spike while sleep/HRV dropped', defaultOn: true },
    { id: 'alerts.pain', label: 'Pain', hint: 'Pain logged in the last week, and whether load spiked around it', defaultOn: true },
    { id: 'alerts.missingData', label: 'Missing data', hint: 'Metrics you usually log going quiet; sessions without fatigue ratings', defaultOn: true },
    { id: 'alerts.tripConflict', label: 'Sessions during a trip', hint: 'Sessions still planned on the days of an upcoming trip', defaultOn: true },
    { id: 'alerts.backup', label: 'Backup age', defaultOn: true },
  ],
  today: [
    { id: 'today.time', label: 'Start time & length', defaultOn: true },
    { id: 'today.exercises', label: 'Exercise names', hint: 'The first three, then "+N more"', defaultOn: true },
    { id: 'today.load', label: 'Planned load', defaultOn: true },
    { id: 'today.missed', label: 'Missed this week', hint: 'Earlier sessions this week you haven\'t logged or skipped', defaultOn: true },
  ],
  metrics: [
    { id: 'metrics.sparklines', label: '7-day sparklines', defaultOn: true },
    { id: 'metrics.hrvBaseline', label: 'HRV vs 14-day baseline', defaultOn: true },
    { id: 'metrics.bodyweight', label: 'Bodyweight', hint: 'With its 7-day average and trend', defaultOn: true },
  ],
  fatigue: [],
  thisWeek: [
    { id: 'thisWeek.note', label: 'Week note button', hint: 'Opens this week\'s note; filled when there is one', defaultOn: true },
    { id: 'thisWeek.strip', label: 'Day strip', hint: 'Monday to Sunday: done, missed, today, rest', defaultOn: true },
    { id: 'thisWeek.acwr', label: 'ACWR', hint: 'Acute:chronic load ratio and its zone', defaultOn: true },
    { id: 'thisWeek.mix', label: 'Training mix', hint: 'Minutes per category so far', defaultOn: true },
    { id: 'thisWeek.tripDays', label: 'Trip days', hint: 'Mark days of an outdoor trip in the day strip', defaultOn: true },
  ],
  trainingBlock: [
    { id: 'trainingBlock.note', label: 'Block note button', hint: 'Opens the current block\'s note', defaultOn: true },
    { id: 'trainingBlock.next', label: 'What\'s next', hint: 'The next block and when it starts', defaultOn: true },
    { id: 'trainingBlock.loadTrend', label: 'Weekly load', hint: 'Planned vs logged load for each week of the block', defaultOn: true },
  ],
  weekRecap: [
    { id: 'weekRecap.compare', label: 'Compared with the week before', hint: 'Load up or down against the previous week', defaultOn: true },
    { id: 'weekRecap.mix', label: 'Training mix', hint: 'Minutes per category', defaultOn: true },
    { id: 'weekRecap.sends', label: 'Sends & pain', hint: 'Outdoor sends that week, and pain entries', defaultOn: true },
  ],
  competition: [
    { id: 'competition.note', label: 'Note button', hint: 'Opens the goal\'s note', defaultOn: true },
    { id: 'competition.conditions', label: 'Trip conditions', hint: 'Forecast for the trip days and rain beforehand, once it\'s within a week', defaultOn: true },
    { id: 'competition.projects', label: 'Trip projects', hint: 'What\'s ticked, and sends to confirm', defaultOn: true },
    { id: 'competition.taper', label: 'Taper hint', hint: 'Within 14 days of a competition or trip, when the phase isn\'t a taper', defaultOn: true },
  ],
  progress: [
    { id: 'progress.benchmarks', label: 'Latest benchmarks', hint: 'With the change since the previous test', defaultOn: true },
    { id: 'progress.retest', label: 'Retest nudge', hint: 'Benchmarks not tested in 6 weeks', defaultOn: true },
    { id: 'progress.sends', label: 'Outdoor sends', hint: 'Last send and hardest grade this season', defaultOn: true },
    { id: 'progress.consistency', label: 'Consistency', hint: 'Recent planned sessions done, and your weekly streak', defaultOn: true },
    { id: 'progress.lastTrip', label: 'Last trip', hint: 'Sends, hardest grade and projects from your most recent trip', defaultOn: true },
  ],
  recentActivity: [
    { id: 'recentActivity.details', label: 'Duration & load', defaultOn: true },
    { id: 'recentActivity.fatigue', label: 'Fatigue ratings', defaultOn: true },
    { id: 'recentActivity.ascents', label: 'Outdoor sends', defaultOn: true },
  ],
  weather: [
    { id: 'weather.frictionWord', label: 'Conditions as a word', hint: 'Prime / Good / OK / Greasy / Wet - tap it for the reason', defaultOn: true },
    { id: 'weather.frictionNumber', label: 'Conditions as a score', hint: '0-10; on together with the word, both show', defaultOn: false },
    { id: 'weather.details', label: 'Feels like, humidity, dew point, wind, UV', defaultOn: true },
    { id: 'weather.rain', label: 'Rain in the last 3 days', hint: 'Whether the rock is likely still drying', defaultOn: true },
    { id: 'weather.window', label: 'Best window & sunset', hint: 'The best dry 3 hours left today', defaultOn: true },
    { id: 'weather.forecast', label: 'Week ahead', defaultOn: true },
    { id: 'weather.dayFriction', label: 'Conditions per forecast day', defaultOn: true },
    { id: 'weather.rainChance', label: 'Rain chance per forecast day', hint: 'Shown for every day; highlighted from 20 %', defaultOn: true },
  ],
  crags: [
    { id: 'crags.suggestion', label: 'Plan suggestion', hint: 'When a crag looks prime on a day you have a session planned', defaultOn: true },
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
