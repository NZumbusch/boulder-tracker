import { describe, it, expect } from 'vitest';
import { HOME_SECTION_DETAILS, defaultHomeDetails, validateHomeDetails } from './homeDetails';
import { HOME_SECTION_IDS, migratePreferences, defaultPreferences, CURRENT_PREFERENCES_VERSION } from './migrate';

const allDefs = Object.values(HOME_SECTION_DETAILS).flat();

describe('HOME_SECTION_DETAILS', () => {
  it('has an entry for every Home section, and no others', () => {
    expect(Object.keys(HOME_SECTION_DETAILS).sort()).toEqual([...HOME_SECTION_IDS].sort());
  });

  it('uses unique ids prefixed with their own section', () => {
    const ids = allDefs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [section, defs] of Object.entries(HOME_SECTION_DETAILS)) {
      for (const def of defs) expect(def.id.startsWith(`${section}.`)).toBe(true);
    }
  });
});

describe('validateHomeDetails', () => {
  it('fills every registered id with its default for missing or garbage input', () => {
    for (const bad of [undefined, null, 'x', 42, [true, false]]) {
      expect(validateHomeDetails(bad)).toEqual(defaultHomeDetails());
    }
  });

  it('keeps a stored choice, drops unknown ids, and defaults ids the map predates', () => {
    const [first, second] = allDefs;
    const result = validateHomeDetails({ [first.id]: !first.defaultOn, 'gone.part': true, [second.id]: 'yes' });
    expect(result[first.id]).toBe(!first.defaultOn);
    expect(result[second.id]).toBe(second.defaultOn);
    expect('gone.part' in result).toBe(false);
    expect(Object.keys(result).sort()).toEqual(allDefs.map((d) => d.id).sort());
  });
});

describe('migratePreferences homeDetails', () => {
  it('defaults the map for a blob written before it existed', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, textScale: 'lg' });
    expect(result.homeDetails).toEqual(defaultHomeDetails());
    expect(result.textScale).toBe('lg');
  });

  it('round-trips a user choice', () => {
    const prefs = defaultPreferences();
    prefs.homeDetails['weather.forecast'] = false;
    expect(migratePreferences(JSON.parse(JSON.stringify(prefs))).homeDetails['weather.forecast']).toBe(false);
  });
});
