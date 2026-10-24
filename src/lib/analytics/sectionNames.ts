/**
 * The names of the Analytics cards, as each card's heading prints them. Settings -> History & Analytics lists the
 * cards by these names (a test pins them to the headings in `components/analytics`), and says which tab a card is on.
 */
import type { AnalyticsSectionId } from '../preferences/migrate';

export const ANALYTICS_SECTION_NAMES: Record<AnalyticsSectionId, string> = {
  load: 'Rolling Load',
  heatmap: 'Training Days',
  mix: 'Training Mix',
  strain: 'Monotony & Strain',
  fingerLoad: 'Finger Load',
  recoveryTrend: 'Recovery Trends',
  wellness: 'Wellness',
  bestSessions: 'Best Sessions',
  fatigue: 'Fatigue',
  pain: 'Pain',
  outdoor: 'Outdoor Ascents',
  benchmarks: 'Test progress',
  benchmarkOverview: 'All tests',
};

/** The tab each card sits on (Analytics.svelte shows them by this) - for the hint in Settings. */
export const ANALYTICS_SECTION_TABS: Record<AnalyticsSectionId, 'Overview' | 'Training' | 'Recovery' | 'Progress'> = {
  load: 'Overview',
  heatmap: 'Overview',
  mix: 'Training',
  strain: 'Training',
  fingerLoad: 'Training',
  recoveryTrend: 'Recovery',
  wellness: 'Recovery',
  bestSessions: 'Recovery',
  fatigue: 'Recovery',
  pain: 'Recovery',
  outdoor: 'Progress',
  benchmarks: 'Progress',
  benchmarkOverview: 'Progress',
};

/** "Rolling Load · Overview": the card and its tab, as Settings lists it. */
export function analyticsSectionLabel(id: AnalyticsSectionId): string {
  return `${ANALYTICS_SECTION_NAMES[id]} · ${ANALYTICS_SECTION_TABS[id]}`;
}
