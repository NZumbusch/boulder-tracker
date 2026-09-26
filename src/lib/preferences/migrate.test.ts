import { describe, it, expect } from 'vitest';
import { migratePreferences, defaultPreferences, CURRENT_PREFERENCES_VERSION, HOME_SECTION_IDS, ANALYTICS_SECTION_IDS, QUICK_LOG_ACTION_IDS } from './migrate';
import { defaultHomeDetails } from './homeDetails';
import { defaultTunables } from './tunables';

const DEFAULT_HOME_SECTIONS = HOME_SECTION_IDS.map((id) => ({ id, visible: true }));
const DEFAULT_AI_SHARING = {
  trainingBlocks: true,
  competitions: true,
  readinessMetrics: false,
  painLogs: false,
  outdoorAscents: true,
  notes: true,
};

describe('defaultPreferences', () => {
  it('returns the current version and sane defaults', () => {
    expect(defaultPreferences()).toEqual({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'md',
      motion: 'system',
      theme: 'system',
      notificationsEnabled: false,
      addedExerciseTarget: 'none',
      navLabels: false,
      welcomeDone: false,
      dailyMetricsReminderEnabled: true,
      dailyMetricsReminderTime: '20:00',
      homeLocation: null,
      crags: [],
      fatigueChartStyle: 'bars',
      analyticsRange: '3m',
      timerVibrateEnabled: true,
      timerBeepEnabled: true,
      timerKeepAwakeEnabled: false,
      timerBackgroundAlerts: true,
      timerCountdownTicks: true,
      timerWarnBeforeEnd: false,
      timerPillHidden: false,
      sessionNotification: true,
      homeSections: DEFAULT_HOME_SECTIONS,
      homeDetails: defaultHomeDetails(),
      sendsChartCounts: true,
      recoveryChartMode: 'overlay',
      fingerCategoryIds: null,
      benchmarkTotalTypeIds: [],
      tunables: defaultTunables(),
      units: { temperature: 'C', weight: 'kg', wind: 'kmh', grades: 'font' },
      analyticsSections: ANALYTICS_SECTION_IDS.map((id) => ({ id, visible: true })),
      quickLogActions: QUICK_LOG_ACTION_IDS.map((id) => ({ id, visible: true })),
      aiSharing: DEFAULT_AI_SHARING,
      aiHistory: { fullWeeks: 2, summaryWeeks: 8 },
      autoBackup: true,
    });
  });
});

describe('migratePreferences', () => {
  it('never throws on garbage input', () => {
    expect(() => migratePreferences(undefined)).not.toThrow();
    expect(() => migratePreferences(null)).not.toThrow();
    expect(() => migratePreferences('not an object')).not.toThrow();
    expect(() => migratePreferences(42)).not.toThrow();
    expect(() => migratePreferences([1, 2, 3])).not.toThrow();
  });

  it('returns defaults for corrupt/missing input with no legacy values', () => {
    expect(migratePreferences(undefined)).toEqual(defaultPreferences());
    expect(migratePreferences(null)).toEqual(defaultPreferences());
    expect(migratePreferences('garbage')).toEqual(defaultPreferences());
  });

  it('folds legacy theme/notifications values into defaults when no blob exists', () => {
    const result = migratePreferences(undefined, { theme: 'light', notificationsEnabled: true });
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
    expect(result.textScale).toBe('md');
    expect(result.motion).toBe('system');
  });

  it('ignores an invalid legacy theme rather than folding it in', () => {
    const result = migratePreferences(undefined, { theme: 'neon' as any });
    expect(result.theme).toBe('system');
  });

  it('round-trips a valid current-version blob unchanged', () => {
    const valid = {
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'lg' as const,
      motion: 'reduced' as const,
      theme: 'contrast' as const,
      notificationsEnabled: true,
      dailyMetricsReminderEnabled: false,
      dailyMetricsReminderTime: '07:30',
      homeLocation: { name: 'Munich, DE', latitude: 48.1374, longitude: 11.5755 },
      crags: [],
      fatigueChartStyle: 'radar' as const,
      analyticsRange: '1y' as const,
      timerVibrateEnabled: false,
      timerBeepEnabled: false,
      timerKeepAwakeEnabled: true,
      timerBackgroundAlerts: false,
      timerCountdownTicks: false,
      timerWarnBeforeEnd: true,
      timerPillHidden: true,
      sessionNotification: false,
      homeSections: [...DEFAULT_HOME_SECTIONS.slice(1), DEFAULT_HOME_SECTIONS[0]],
      homeDetails: { ...defaultHomeDetails(), 'weather.forecast': false },
      sendsChartCounts: false,
      recoveryChartMode: 'lanes' as const,
      fingerCategoryIds: ['cat-3'],
      benchmarkTotalTypeIds: ['bm-1'],
      tunables: { ...defaultTunables(), 'fatigue.halfLifeDays': 4 },
      units: { temperature: 'F' as const, weight: 'lb' as const, wind: 'mph' as const, grades: 'v' as const },
      analyticsSections: [...ANALYTICS_SECTION_IDS].reverse().map((id, i) => ({ id, visible: i % 2 === 0 })),
      quickLogActions: [{ id: 'send' as const, visible: true }, { id: 'pain' as const, visible: true }, { id: 'bodyweight' as const, visible: false }, { id: 'benchmark' as const, visible: true }],
      aiSharing: { trainingBlocks: false, competitions: true, readinessMetrics: true, painLogs: true, outdoorAscents: false, notes: false },
      aiHistory: { fullWeeks: 4, summaryWeeks: 16 },
      autoBackup: false,
      addedExerciseTarget: 'mirror' as const,
      navLabels: true,
      welcomeDone: true,
    };
    expect(migratePreferences(valid)).toEqual(valid);
  });

  it('defaults analyticsRange for a blob written before the setting existed, keeping every other field', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'lg',
      motion: 'reduced',
      fatigueChartStyle: 'radar',
    });
    expect(result.analyticsRange).toBe('3m');
    expect(result.textScale).toBe('lg');
    expect(result.fatigueChartStyle).toBe('radar');
  });

  it('rejects an unknown analyticsRange rather than storing it', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, analyticsRange: 'decade' });
    expect(result.analyticsRange).toBe('3m');
  });

  it('drops unknown extra keys', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'sm',
      motion: 'full',
      theme: 'dark',
      notificationsEnabled: false,
      dailyMetricsReminderEnabled: true,
      dailyMetricsReminderTime: '20:00',
      someFutureField: 'nonsense',
    });
    expect(result).not.toHaveProperty('someFutureField');
  });

  it('defaults an individual invalid field without discarding the rest of the object', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'xl', // invalid
      motion: 'full',
      theme: 'light',
      notificationsEnabled: true,
      dailyMetricsReminderEnabled: true,
      dailyMetricsReminderTime: '20:00',
    });
    expect(result.textScale).toBe('md'); // fell back to default
    expect(result.motion).toBe('full'); // valid fields preserved
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
  });

  it('defaults missing individual fields on a partial current-version object', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, textScale: 'lg' });
    expect(result.textScale).toBe('lg');
    expect(result.motion).toBe('system');
    expect(result.theme).toBe('system');
    expect(result.notificationsEnabled).toBe(false);
    expect(result.dailyMetricsReminderEnabled).toBe(true);
    expect(result.dailyMetricsReminderTime).toBe('20:00');
    expect(result.fatigueChartStyle).toBe('bars');
    expect(result.analyticsRange).toBe('3m');
    expect(result.timerVibrateEnabled).toBe(true);
    expect(result.timerBeepEnabled).toBe(true);
    expect(result.timerKeepAwakeEnabled).toBe(false);
    expect(result.homeSections).toEqual(DEFAULT_HOME_SECTIONS);
    expect(result.aiSharing).toEqual(DEFAULT_AI_SHARING);
  });

  it('backward compat: an early blob with none of the newer fields at all gets them all defaulted, without resetting textScale/motion (no version bump was needed for this addition)', () => {
    const stage0Blob = {
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'lg',
      motion: 'reduced',
      theme: 'light',
      notificationsEnabled: true,
      // no dailyMetricsReminderEnabled / dailyMetricsReminderTime / weather / fatigueChartStyle / timer* / homeSections keys at all
    };
    const result = migratePreferences(stage0Blob);
    expect(result.textScale).toBe('lg');
    expect(result.motion).toBe('reduced');
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
    expect(result.dailyMetricsReminderEnabled).toBe(true);
    expect(result.dailyMetricsReminderTime).toBe('20:00');
    expect(result.fatigueChartStyle).toBe('bars');
    expect(result.analyticsRange).toBe('3m');
    expect(result.timerVibrateEnabled).toBe(true);
    expect(result.timerBeepEnabled).toBe(true);
    expect(result.timerKeepAwakeEnabled).toBe(false);
    expect(result.homeSections).toEqual(DEFAULT_HOME_SECTIONS);
    expect(result.aiSharing).toEqual(DEFAULT_AI_SHARING);
  });

  it('rejects a malformed dailyMetricsReminderTime and falls back to the default', () => {
    for (const bad of ['8pm', '25:00', '20:60', '2000', '', 42]) {
      const result = migratePreferences({
        version: CURRENT_PREFERENCES_VERSION,
        dailyMetricsReminderTime: bad,
      });
      expect(result.dailyMetricsReminderTime).toBe('20:00');
    }
  });

  it('accepts valid HH:mm times, including midnight and single-digit-looking edges', () => {
    for (const good of ['00:00', '09:05', '23:59']) {
      const result = migratePreferences({
        version: CURRENT_PREFERENCES_VERSION,
        dailyMetricsReminderTime: good,
      });
      expect(result.dailyMetricsReminderTime).toBe(good);
    }
  });

  it('treats an unrecognised version (including a future one) as corrupt and returns defaults', () => {
    const futureShape = { version: CURRENT_PREFERENCES_VERSION + 1, textScale: 'lg', someNewField: true };
    expect(migratePreferences(futureShape)).toEqual(defaultPreferences());

    const legacyUnversioned = { textScale: 'lg' };
    expect(migratePreferences(legacyUnversioned)).toEqual(defaultPreferences());
  });

  it('still folds legacy values even when the stored blob itself is an unrecognised version', () => {
    const result = migratePreferences(
      { version: 0, textScale: 'lg' },
      { theme: 'light', notificationsEnabled: true },
    );
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
    expect(result.textScale).toBe('md'); // the corrupt blob's data is not trusted
  });
});

describe('homeLocation / crags', () => {
  it('default to unset - the whole weather feature is off until a location is set', () => {
    expect(defaultPreferences().homeLocation).toBeNull();
    expect(defaultPreferences().crags).toEqual([]);
  });

  it('accepts a valid home location and crag list', () => {
    const home = { name: 'Munich, DE', latitude: 48.1374, longitude: 11.5755 };
    const font = { name: 'Fontainebleau, FR', latitude: 48.4042, longitude: 2.7017 };
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: home, crags: [font] });
    expect(result.homeLocation).toEqual(home);
    expect(result.crags).toEqual([font]);
  });

  it('turns an old single trip location into the first crag', () => {
    const trip = { name: 'Fontainebleau, FR', latitude: 48.4042, longitude: 2.7017 };
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, tripLocation: trip });
    expect(result.crags).toEqual([trip]);
    expect('tripLocation' in result).toBe(false);
  });

  it('keeps every valid crag, dropping invalid and duplicate ones', () => {
    const c = (name: string) => ({ name, latitude: 47, longitude: 8 });
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      crags: [c('A'), { name: 'Bad', latitude: 99, longitude: 0 }, c('A'), c('B'), c('C'), c('D')],
    });
    expect(result.crags.map((x) => x.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('an explicit null clears a location back to unset', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: null });
    expect(result.homeLocation).toBeNull();
  });

  it('rejects a location missing a name, or with out-of-range coordinates, falling back to null rather than throwing', () => {
    const badShapes = [
      { latitude: 48, longitude: 11 }, // no name
      { name: 'Nowhere', latitude: 95, longitude: 11 }, // latitude out of range
      { name: 'Nowhere', latitude: 48, longitude: 200 }, // longitude out of range
      { name: '', latitude: 48, longitude: 11 }, // blank name
      'not an object',
      42,
    ];
    for (const bad of badShapes) {
      const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: bad });
      expect(result.homeLocation).toBeNull();
    }
  });

  it('accepts boundary-valid coordinates (poles and the antimeridian)', () => {
    const location = { name: 'North Pole', latitude: 90, longitude: -180 };
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: location });
    expect(result.homeLocation).toEqual(location);
  });
});

describe('fatigueChartStyle', () => {
  it('accepts both valid styles', () => {
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION, fatigueChartStyle: 'bars' }).fatigueChartStyle).toBe('bars');
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION, fatigueChartStyle: 'radar' }).fatigueChartStyle).toBe('radar');
  });

  it('falls back to the default ("bars") for anything else', () => {
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION, fatigueChartStyle: 'pie' }).fatigueChartStyle).toBe('bars');
  });
});

describe('timer toggles', () => {
  it('each defaults independently and is preserved when explicitly set', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      timerVibrateEnabled: false,
      timerKeepAwakeEnabled: true,
      // timerBeepEnabled omitted - should default
    });
    expect(result.timerVibrateEnabled).toBe(false);
    expect(result.timerKeepAwakeEnabled).toBe(true);
    expect(result.timerBeepEnabled).toBe(true);
  });
});

describe('homeSections', () => {
  it('defaults to every known section, visible, in the fixed plan order', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION });
    expect(result.homeSections).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it('preserves a valid, fully-custom order and per-section visibility', () => {
    const custom = [
      { id: 'weather' as const, visible: false },
      ...DEFAULT_HOME_SECTIONS.filter((s) => s.id !== 'weather'),
    ];
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeSections: custom });
    expect(result.homeSections).toEqual(custom);
  });

  it('drops an unrecognised section id rather than keeping it', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      homeSections: [{ id: 'somethingThatNoLongerExists', visible: true }, ...DEFAULT_HOME_SECTIONS],
    });
    expect(result.homeSections).toEqual(DEFAULT_HOME_SECTIONS);
  });

  it('drops a duplicate id, keeping only the first occurrence', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      homeSections: [{ id: 'weather', visible: false }, { id: 'weather', visible: true }],
    });
    expect(result.homeSections.filter((s) => s.id === 'weather')).toEqual([{ id: 'weather', visible: false }]);
  });

  it('adds a section missing from a partial list, visible by default, rather than letting it disappear', () => {
    const partial = [{ id: 'fatigue' as const, visible: false }, { id: 'today' as const, visible: true }];
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeSections: partial });
    const ids = result.homeSections.map((s) => s.id);
    // The saved sections keep their own relative order and visibility...
    expect(ids.indexOf('fatigue')).toBeLessThan(ids.indexOf('today'));
    expect(result.homeSections.find((s) => s.id === 'fatigue')!.visible).toBe(false);
    // ...and every added one is visible.
    expect(result.homeSections.filter((s) => s.id !== 'fatigue').every((s) => s.visible)).toBe(true);
    expect(result.homeSections).toHaveLength(HOME_SECTION_IDS.length);
    for (const id of HOME_SECTION_IDS) {
      expect(result.homeSections.some((s) => s.id === id)).toBe(true);
    }
  });

  it('falls back to the full default list for garbage input, never throwing', () => {
    for (const bad of ['not an array', 42, null, [{ noId: true }], [1, 2, 3]]) {
      const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeSections: bad });
      expect(result.homeSections).toEqual(DEFAULT_HOME_SECTIONS);
    }
  });
});

describe('aiSharing', () => {
  it('defaults to Training Blocks/Competitions/Outdoor Ascents on, Readiness & Daily Metrics/Pain Logs off', () => {
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION }).aiSharing).toEqual(DEFAULT_AI_SHARING);
  });

  it('round-trips a fully-set current-version value', () => {
    const custom = { trainingBlocks: false, competitions: false, readinessMetrics: true, painLogs: true, outdoorAscents: false, notes: false };
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION, aiSharing: custom }).aiSharing).toEqual(custom);
  });

  it('defaults each field independently rather than discarding the whole object over one bad field', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      aiSharing: { trainingBlocks: false, competitions: 'yes', readinessMetrics: true },
    });
    expect(result.aiSharing).toEqual({
      trainingBlocks: false, // valid, preserved
      competitions: true, // invalid type, defaulted
      readinessMetrics: true, // valid, preserved
      painLogs: false, // missing, defaulted
      outdoorAscents: true, // missing, defaulted
      notes: true, // missing (a blob from before notes existed), defaulted
    });
  });

  it('falls back to the full default object for garbage input, never throwing', () => {
    for (const bad of ['not an object', 42, null, []]) {
      const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, aiSharing: bad });
      expect(result.aiSharing).toEqual(DEFAULT_AI_SHARING);
    }
  });
});

describe('addedExerciseTarget', () => {
  it("defaults to 'none' for a blob written before the setting existed, keeping every other field", () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'lg',
      planFormat: 'weekly',
    });
    expect(result.addedExerciseTarget).toBe('none');
    expect(result.textScale).toBe('lg');
    // planFormat was retired with the AI change-set contract - dropped, not kept.
    expect('planFormat' in result).toBe(false);
  });

  it("keeps an explicit 'mirror'", () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      addedExerciseTarget: 'mirror',
    });
    expect(result.addedExerciseTarget).toBe('mirror');
  });

  it('rejects an unknown value rather than storing it', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      addedExerciseTarget: 'zeroes',
    });
    expect(result.addedExerciseTarget).toBe('none');
  });
});

describe('new home sections land next to their neighbours', () => {
  it('inserts a section missing from a saved order after the section that precedes it by default', () => {
    // A saved order from before 'alerts' existed, with the user's own reordering.
    const saved = HOME_SECTION_IDS.filter((id) => id !== 'alerts').map((id) => ({ id, visible: true })).reverse();
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeSections: saved });
    const ids = result.homeSections.map((s) => s.id);
    expect(ids.indexOf('alerts')).toBe(ids.indexOf('readiness') + 1);
    expect(ids).toHaveLength(HOME_SECTION_IDS.length);
  });
});

describe('sendsChartCounts', () => {
  it('defaults to showing counts, including for a blob written before the setting existed', () => {
    expect(defaultPreferences().sendsChartCounts).toBe(true);
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION }).sendsChartCounts).toBe(true);
  });

  it('keeps a saved choice and ignores a malformed one', () => {
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION, sendsChartCounts: false }).sendsChartCounts).toBe(false);
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION, sendsChartCounts: 'no' }).sendsChartCounts).toBe(true);
  });
});

describe('analyticsSections / quickLogActions', () => {
  it('default to everything visible in the fixed order', () => {
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION }).analyticsSections.map((s) => s.id)).toEqual([...ANALYTICS_SECTION_IDS]);
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION }).quickLogActions.every((a) => a.visible)).toBe(true);
  });

  it('keep a saved order and visibility, repairing unknown and missing entries', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      quickLogActions: [{ id: 'send', visible: true }, { id: 'gone', visible: true }, { id: 'pain', visible: false }],
    });
    // Missing ids go right after the id that precedes them by default:
    // bodyweight after pain, benchmark after send.
    expect(result.quickLogActions).toEqual([
      { id: 'send', visible: true },
      { id: 'benchmark', visible: true },
      { id: 'pain', visible: false },
      { id: 'bodyweight', visible: true },
    ]);
  });
});

describe('aiHistory', () => {
  it('defaults to two weeks in full and eight summarised', () => {
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION }).aiHistory).toEqual({ fullWeeks: 2, summaryWeeks: 8 });
  });

  it('repairs each field on its own, and only to a listed option', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, aiHistory: { fullWeeks: 5, summaryWeeks: 12 } });
    expect(result.aiHistory).toEqual({ fullWeeks: 2, summaryWeeks: 12 });
    expect(migratePreferences({ version: CURRENT_PREFERENCES_VERSION, aiHistory: 'x' }).aiHistory).toEqual({ fullWeeks: 2, summaryWeeks: 8 });
  });
});

describe('navLabels and welcomeDone', () => {
  it('a fresh install gets no labels and the welcome screens', () => {
    const result = migratePreferences(undefined);
    expect(result.navLabels).toBe(false);
    expect(result.welcomeDone).toBe(false);
  });

  it('a blob saved before welcomeDone existed is a returning user, never welcomed again', () => {
    const { welcomeDone: _w, navLabels: _n, ...older } = defaultPreferences();
    const result = migratePreferences(older);
    expect(result.welcomeDone).toBe(true);
    expect(result.navLabels).toBe(false);
  });

  it('keeps an explicit choice', () => {
    const result = migratePreferences({ ...defaultPreferences(), navLabels: true, welcomeDone: false });
    expect(result.navLabels).toBe(true);
    expect(result.welcomeDone).toBe(false);
  });
});
