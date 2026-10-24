/**
 * The switches on Settings > What the AI sees, with their descriptions. The
 * default ("Off by default.") is not written into a description: `sharingHint`
 * adds it from `AI_SHARING_ON_BY_DEFAULT`, the same table the stored defaults
 * are tested against, so text, badge and stored value cannot drift apart.
 */
import { AI_SHARING_ON_BY_DEFAULT, type AISharingPreferences } from '../preferences/migrate';

export const AI_SHARING_CATEGORIES: { id: keyof AISharingPreferences; label: string; description: string }[] = [
  { id: 'trainingBlocks', label: 'Training blocks', description: 'Active/upcoming phase blocks covering or near the prompt\'s target weeks.' },
  { id: 'competitions', label: 'Goals', description: 'Upcoming competitions and outdoor trips (dates, place, projects), what you\'re peaking for.' },
  { id: 'places', label: 'Places', description: 'Where you train - names, kind, price, opening hours and notes (never the coordinates), so the coach can place sessions.' },
  { id: 'phoneCalendar', label: 'Phone calendar', description: 'The titles and times of your phone calendar\'s events in the weeks the coach plans (never where, notes or guests), so it plans around them. Android app with the phone calendar switched on. Titles can be private.' },
  { id: 'readinessMetrics', label: 'Readiness and daily metrics', description: 'Current readiness score plus sleep/HRV/RHR/bodyweight trends. Health data.' },
  { id: 'painLogs', label: 'Pain issues', description: 'Open pain issues and those resolved in the last 90 days, with their course; also lets open pain count in the readiness snapshot. Health data.' },
  { id: 'outdoorAscents', label: 'Outdoor ascents', description: 'Recent outdoor grade history.' },
  { id: 'notes', label: 'Block and week notes', description: 'Your notes on training blocks, and week notes within four weeks of the prompt\'s weeks.' },
  { id: 'sessionNotes', label: 'Session notes (how it went)', description: 'The note you write when you finish a session, sent with your recent sessions.' },
  { id: 'planNotesInHistory', label: 'Plan notes on past sessions', description: 'The session note written beforehand (goals, cues) for sessions you have already done. It is usually stale once you have logged what happened.' },
  { id: 'otherTraining', label: 'Other training', description: 'Runs, rides, walks and workouts from Strava or Garmin: a line per week, or each recent activity - you pick how much under Detail below.' },
  { id: 'patterns', label: 'Patterns and weekly reviews', description: 'What your data says about your best sessions and how each recent week went (derived lines only, no raw data).' },
  { id: 'coachNotes', label: 'Coach notes and about me', description: 'Your About me, standing goal and the coach notes (Settings → Coach notes) - so you don\'t have to repeat them.' },
];

/** The description plus, for a switch that starts off, "Off by default.". */
export function sharingHint(id: keyof AISharingPreferences): string {
  const category = AI_SHARING_CATEGORIES.find((c) => c.id === id);
  if (!category) return '';
  return AI_SHARING_ON_BY_DEFAULT[id] ? category.description : `${category.description} Off by default.`;
}
