import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ANALYTICS_SECTION_NAMES, ANALYTICS_SECTION_TABS, analyticsSectionLabel } from './sectionNames';
import { ANALYTICS_SECTION_IDS } from '../preferences/migrate';

/** The panel file whose <h3> prints each card's name. */
const PANEL_FILE: Record<string, string> = {
  load: 'LoadPanel', heatmap: 'HeatmapPanel', mix: 'MixPanel', strain: 'StrainPanel', fingerLoad: 'FingerLoadPanel',
  recoveryTrend: 'RecoveryTrendPanel', fatigue: 'FatiguePanel', pain: 'PainTimelinePanel', outdoor: 'OutdoorAscentsPanel',
  benchmarks: 'BenchmarkPanel', benchmarkOverview: 'BenchmarkOverviewPanel',
};

describe('Analytics card names', () => {
  it('every card has a name and a tab', () => {
    for (const id of ANALYTICS_SECTION_IDS) {
      expect(ANALYTICS_SECTION_NAMES[id]).toBeTruthy();
      expect(ANALYTICS_SECTION_TABS[id]).toBeTruthy();
    }
  });
  it("each name is the heading its card prints, so Settings and Analytics agree", () => {
    for (const id of ANALYTICS_SECTION_IDS) {
      const source = readFileSync(new URL(`../../components/analytics/${PANEL_FILE[id]}.svelte`, import.meta.url), 'utf8');
      const heading = /<h3[^>]*>\s*([^<{]+?)\s*(?:<|\{)/.exec(source)?.[1]?.replace(/&amp;/g, '&');
      expect(heading, id).toBe(ANALYTICS_SECTION_NAMES[id]);
    }
  });
  it('the label carries the tab', () => {
    expect(analyticsSectionLabel('fingerLoad')).toBe('Finger Load · Training');
  });
});

describe('Analytics tab of each card matches Analytics.svelte', () => {
  it('the TAB_OF map is the same', () => {
    const source = readFileSync(new URL('../../components/analytics/Analytics.svelte', import.meta.url), 'utf8');
    const block = /const TAB_OF[^{]*\{([^}]*)\}/.exec(source)?.[1] ?? '';
    for (const id of ANALYTICS_SECTION_IDS) {
      const tab = new RegExp(`${id}:\\s*'(\\w+)'`).exec(block)?.[1];
      expect(tab, id).toBe(ANALYTICS_SECTION_TABS[id].toLowerCase());
    }
  });
});
