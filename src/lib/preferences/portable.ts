/**
 * Settings in groups - what "Reset settings", the settings file and Drive
 * sync all speak.
 *
 * `Preferences` lives in localStorage and is device-local, but most of it is
 * taste (layout, units, tunables, AI sharing) that you'd want on every device
 * and want to reset or share as a unit. A group is a named set of
 * `Preferences` keys; a *portable* group is one that travels (file and sync).
 *
 * Deliberately outside every group, so they never reset, export or sync:
 * where you are (`homeLocation`, `crags`), reminders (notification
 * permission and scheduling are per device), `autoBackup`, `welcomeDone`,
 * `theme`, and transient UI state (`timerPillHidden`). `textScale` and `motion`
 * are in the appearance group for resetting but never travel - they answer to
 * the screen in your hand.
 */
import { defaultPreferences, migratePreferences, CURRENT_PREFERENCES_VERSION, type Preferences } from './migrate';

export const SETTINGS_GROUP_IDS = ['appearance', 'layout', 'tunables', 'sessions', 'ai'] as const;
export type SettingsGroupId = (typeof SETTINGS_GROUP_IDS)[number];

export const SETTINGS_GROUPS: Record<SettingsGroupId, { label: string; description: string; keys: (keyof Preferences)[] }> = {
  appearance: {
    label: 'Appearance & units',
    description: 'Text size, motion, units, labels, help buttons, chart styles',
    keys: ['textScale', 'motion', 'units', 'navLabels', 'helpButtons', 'widgetShowReadiness', 'widgetReadinessDetail', 'fatigueChartStyle', 'recoveryChartMode', 'sendsChartCounts', 'analyticsRange'],
  },
  layout: {
    label: 'Home, Analytics & quick-log layout',
    description: 'Which cards show and in what order, per-card options, finger and benchmark selections',
    keys: ['homeSections', 'homeDetails', 'analyticsSections', 'quickLogActions', 'fingerCategoryIds', 'benchmarkTotalTypeIds'],
  },
  tunables: {
    label: 'Load, readiness & other tunables',
    description: 'Every adjustable threshold and window',
    keys: ['tunables'],
  },
  sessions: {
    label: 'Session, timer & pain check-in behaviour',
    description: 'Timer sounds, keep-awake, haptics, added-exercise handling, pain prompts',
    keys: ['timerVibrateEnabled', 'timerBeepEnabled', 'timerKeepAwakeEnabled', 'timerBackgroundAlerts', 'timerCountdownTicks', 'timerWarnBeforeEnd', 'sessionKeepAwake', 'hapticsEnabled', 'sessionNotification', 'addedExerciseTarget', 'painCheckIns'],
  },
  ai: {
    label: 'AI sharing & history',
    description: 'What AI prompts include and how far back they look',
    keys: ['aiSharing', 'aiHistory'],
  },
};

/** In a group but answering to the device, not you: left out of the file and of sync. */
const DEVICE_BOUND: (keyof Preferences)[] = ['textScale', 'motion'];

const travelKeys = (id: SettingsGroupId) => SETTINGS_GROUPS[id].keys.filter((k) => !DEVICE_BOUND.includes(k));

/**
 * A deep copy that works on Svelte `$state` proxies, which `structuredClone`
 * refuses ("could not be cloned"). Preferences are JSON by construction.
 */
function plainCopy<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** The groups' values as they are now. */
export function pickGroups(prefs: Preferences, ids: readonly SettingsGroupId[], opts: { forTravel?: boolean } = {}): Partial<Preferences> {
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    for (const key of opts.forTravel ? travelKeys(id) : SETTINGS_GROUPS[id].keys) out[key] = plainCopy(prefs[key]);
  }
  return out as Partial<Preferences>;
}

/** `prefs` with the chosen groups back at their defaults. */
export function resetGroups(prefs: Preferences, ids: readonly SettingsGroupId[]): Preferences {
  return { ...prefs, ...pickGroups(defaultPreferences(), ids) };
}

/**
 * `incoming` laid over `prefs`, for the chosen groups only, with every value
 * repaired by the same validation stored preferences get - a hand-edited or
 * newer file can't put an invalid value in.
 */
export function applyGroups(prefs: Preferences, incoming: Partial<Preferences>, ids: readonly SettingsGroupId[]): Preferences {
  const allowed = new Set<keyof Preferences>(ids.flatMap(travelKeys));
  const merged: Record<string, unknown> = { ...prefs, version: CURRENT_PREFERENCES_VERSION };
  for (const key of allowed) if (incoming[key] !== undefined) merged[key] = incoming[key];
  const valid = migratePreferences(merged);
  const out: Record<string, unknown> = { ...prefs };
  for (const key of allowed) if (incoming[key] !== undefined) out[key] = valid[key];
  return out as unknown as Preferences;
}

// --- The settings file ------------------------------------------------------

export const SETTINGS_FILE_APP = 'boulder-tracker-settings';
export const SETTINGS_FILE_VERSION = 1;

export interface SettingsFile {
  app: typeof SETTINGS_FILE_APP;
  version: number;
  exportedAt: string;
  settings: Partial<Preferences>;
}

export function buildSettingsFile(prefs: Preferences, now: Date = new Date()): SettingsFile {
  return { app: SETTINGS_FILE_APP, version: SETTINGS_FILE_VERSION, exportedAt: now.toISOString(), settings: pickGroups(prefs, SETTINGS_GROUP_IDS, { forTravel: true }) };
}

/** The settings in a file's text, or why it isn't one. */
export function parseSettingsFile(text: string): { ok: true; settings: Partial<Preferences> } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That isn't a settings file (not valid JSON)." };
  }
  const file = raw as Partial<SettingsFile> | null;
  if (!file || typeof file !== 'object' || file.app !== SETTINGS_FILE_APP || typeof file.settings !== 'object' || file.settings === null) {
    return { ok: false, error: "That isn't a Boulder Tracker settings file." };
  }
  if (typeof file.version === 'number' && file.version > SETTINGS_FILE_VERSION) {
    return { ok: false, error: 'That settings file is from a newer version of the app. Update first.' };
  }
  return { ok: true, settings: file.settings };
}

// --- Sync records -----------------------------------------------------------

/** One synced record per group, so two devices editing different groups never conflict. */
export interface SettingsRecord {
  id: SettingsGroupId;
  value: Partial<Preferences>;
}

export function toSettingsRecords(prefs: Preferences): SettingsRecord[] {
  return SETTINGS_GROUP_IDS.map((id) => ({ id, value: pickGroups(prefs, [id], { forTravel: true }) }));
}

/** `prefs` with whatever the records carry laid over it. Unknown ids are ignored. */
export function applySettingsRecords(prefs: Preferences, records: readonly SettingsRecord[]): Preferences {
  let next = prefs;
  for (const record of records) {
    if (!SETTINGS_GROUP_IDS.includes(record?.id) || typeof record.value !== 'object' || record.value === null) continue;
    next = applyGroups(next, record.value, [record.id]);
  }
  return next;
}
