import { describe, it, expect } from 'vitest';
import { AI_SHARING_CATEGORIES, sharingHint } from './sharingCategories';
import { AI_SHARING_ON_BY_DEFAULT, aiSharingOn, defaultPreferences, migratePreferences, CURRENT_PREFERENCES_VERSION } from '../preferences/migrate';

describe('AI sharing defaults agree everywhere', () => {
  it('Readiness and Pain issues are off by default, in the stored defaults and in the table', () => {
    const stored = defaultPreferences().aiSharing;
    expect(stored.readinessMetrics).toBe(false);
    expect(stored.painLogs).toBe(false);
    expect(AI_SHARING_ON_BY_DEFAULT.readinessMetrics).toBe(false);
    expect(AI_SHARING_ON_BY_DEFAULT.painLogs).toBe(false);
  });

  it('every stored default matches the table, so a switch reads as it will behave', () => {
    const stored = defaultPreferences().aiSharing;
    for (const [id, on] of Object.entries(AI_SHARING_ON_BY_DEFAULT)) {
      expect(aiSharingOn(stored, id as keyof typeof stored), id).toBe(on);
    }
  });

  it('every switch on the page has a table entry, and no description claims a default itself', () => {
    for (const c of AI_SHARING_CATEGORIES) {
      expect(c.id in AI_SHARING_ON_BY_DEFAULT, c.id).toBe(true);
      expect(c.description.toLowerCase(), c.id).not.toMatch(/(on|off) by default/);
    }
  });

  it('the hint says "Off by default." exactly for the switches that start off', () => {
    for (const c of AI_SHARING_CATEGORIES) {
      expect(sharingHint(c.id).endsWith('Off by default.'), c.id).toBe(!AI_SHARING_ON_BY_DEFAULT[c.id]);
    }
    expect(sharingHint('readinessMetrics')).toContain('Off by default.');
    expect(sharingHint('painLogs')).toContain('Off by default.');
  });

  it('an explicit choice is never flipped by loading', () => {
    const chosen = { trainingBlocks: true, competitions: true, readinessMetrics: true, painLogs: true, outdoorAscents: true, notes: true };
    const out = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, aiSharing: chosen }).aiSharing;
    expect(out.readinessMetrics).toBe(true);
    expect(out.painLogs).toBe(true);
    expect(aiSharingOn(out, 'painLogs')).toBe(true);
  });

  it('a value that is absent reads as its default', () => {
    const base = defaultPreferences().aiSharing;
    expect(aiSharingOn(base, 'planNotesInHistory')).toBe(false);
    expect(aiSharingOn(base, 'phoneCalendar')).toBe(false);
    expect(aiSharingOn(base, 'sessionNotes')).toBe(true);
    expect(aiSharingOn(base, 'coachNotes')).toBe(true);
  });
});
