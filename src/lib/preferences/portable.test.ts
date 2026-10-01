import { describe, it, expect } from 'vitest';
import { defaultPreferences } from './migrate';
import {
  applyGroups, applySettingsRecords, buildSettingsFile, parseSettingsFile, pickGroups, resetGroups, toSettingsRecords,
  SETTINGS_GROUPS, SETTINGS_GROUP_IDS,
} from './portable';

const changed = () => {
  const p = defaultPreferences();
  p.navLabels = true;
  p.textScale = 'lg';
  p.aiSharing = { ...p.aiSharing, notes: false };
  p.homeSections = [...p.homeSections].reverse();
  p.timerBeepEnabled = false;
  p.homeLocation = { name: 'Home', latitude: 1, longitude: 2 } as never;
  return p;
};

describe('settings groups', () => {
  it('never lists a key twice, nor a key the Preferences do not have', () => {
    const keys = SETTINGS_GROUP_IDS.flatMap((id) => SETTINGS_GROUPS[id].keys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k in defaultPreferences()).toBe(true);
  });

  it('resets only the chosen groups and leaves everything else alone', () => {
    const p = changed();
    const out = resetGroups(p, ['ai']);
    expect(out.aiSharing).toEqual(defaultPreferences().aiSharing);
    expect(out.navLabels).toBe(true);
    expect(out.homeSections).toEqual(p.homeSections);
    expect(out.homeLocation).toEqual(p.homeLocation);
  });

  it('a full reset keeps location, theme and welcome state', () => {
    const p = changed();
    p.welcomeDone = true;
    const out = resetGroups(p, SETTINGS_GROUP_IDS);
    expect(out.navLabels).toBe(false);
    expect(out.textScale).toBe('md');
    expect(out.homeLocation).toEqual(p.homeLocation);
    expect(out.welcomeDone).toBe(true);
  });
});

describe('settings file', () => {
  it('round-trips, without the device-bound or per-device values', () => {
    const file = buildSettingsFile(changed());
    expect(file.settings).not.toHaveProperty('textScale');
    expect(file.settings).not.toHaveProperty('homeLocation');
    const parsed = parseSettingsFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const out = applyGroups(defaultPreferences(), parsed.settings, SETTINGS_GROUP_IDS);
    expect(out.navLabels).toBe(true);
    expect(out.aiSharing.notes).toBe(false);
    expect(out.textScale).toBe('md');
  });

  it('rejects other JSON and newer versions', () => {
    expect(parseSettingsFile('nope').ok).toBe(false);
    expect(parseSettingsFile('{"app":"other","settings":{}}').ok).toBe(false);
    expect(parseSettingsFile(JSON.stringify({ app: 'boulder-tracker-settings', version: 99, settings: {} })).ok).toBe(false);
  });

  it('repairs invalid values instead of trusting them', () => {
    const out = applyGroups(defaultPreferences(), { navLabels: 'yes', fatigueChartStyle: 'pie', analyticsRange: 'forever' } as never, ['appearance']);
    expect(out.navLabels).toBe(defaultPreferences().navLabels);
    expect(out.fatigueChartStyle).toBe(defaultPreferences().fatigueChartStyle);
    expect(out.analyticsRange).toBe(defaultPreferences().analyticsRange);
  });

  it('only applies the chosen groups', () => {
    const out = applyGroups(defaultPreferences(), { navLabels: true, aiSharing: { ...defaultPreferences().aiSharing, notes: false } }, ['ai']);
    expect(out.navLabels).toBe(false);
    expect(out.aiSharing.notes).toBe(false);
  });
});

describe('sync records', () => {
  it('one per group, and applying them reproduces the portable settings', () => {
    const records = toSettingsRecords(changed());
    expect(records.map((r) => r.id)).toEqual([...SETTINGS_GROUP_IDS]);
    const out = applySettingsRecords(defaultPreferences(), records);
    expect(out.timerBeepEnabled).toBe(false);
    expect(out.homeSections).toEqual(changed().homeSections);
    expect(out.textScale).toBe('md');
  });

  it('ignores unknown groups and junk', () => {
    const out = applySettingsRecords(defaultPreferences(), [{ id: 'bogus', value: { navLabels: true } }, { id: 'ai', value: null }] as never);
    expect(out).toEqual(defaultPreferences());
  });

  it('pickGroups clones, so later edits do not leak', () => {
    const p = defaultPreferences();
    const picked = pickGroups(p, ['ai']);
    (picked.aiSharing as { notes: boolean }).notes = !p.aiSharing.notes;
    expect(p.aiSharing.notes).toBe(defaultPreferences().aiSharing.notes);
  });
});

describe('reactive values', () => {
  it('copies values that are proxies (as the preferences store holds them), which structuredClone cannot', () => {
    const p = defaultPreferences();
    p.homeSections = new Proxy(p.homeSections, {}) as typeof p.homeSections;
    p.aiSharing = new Proxy(p.aiSharing, {}) as typeof p.aiSharing;
    expect(() => structuredClone(p.aiSharing)).toThrow();
    const records = toSettingsRecords(p);
    expect(() => structuredClone(records)).not.toThrow();
    expect(records.find((r) => r.id === 'ai')!.value.aiSharing).toEqual(defaultPreferences().aiSharing);
  });
});

