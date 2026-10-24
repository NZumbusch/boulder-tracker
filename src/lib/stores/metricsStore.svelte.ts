import { storage } from '../storage';
import type { MetricDef, DailyMetricEntry, PainLog, PainIssue } from '../types';
import { attachOrphanLogs } from '../pain/issues';

/**
 * `metricDefs`/`dailyMetrics`/`painLogs` - the daily readings (sleep, HRV,
 * resting HR, bodyweight) and pain/discomfort logs.
 */
export class MetricsStore {
  metricDefs = $state<MetricDef[]>([]);
  /**
   * Raw, not a deep reactive proxy: a watch's daily values run to thousands of entries, the charts read them all many times
   * over, and every read through a proxy costs a trap. Nothing edits this array in place - it is replaced by `load()` after
   * every change - so reassigning it is all the reactivity it needs.
   */
  dailyMetrics = $state.raw<DailyMetricEntry[]>([]);
  painLogs = $state<PainLog[]>([]);
  /** Pain issues - what the entries above are check-ins on. */
  painIssues = $state<PainIssue[]>([]);

  async load() {
    const [metricDefs, dailyMetrics, painLogs, painIssues] = await Promise.all([
      storage.getMetricDefs(),
      storage.getDailyMetrics(),
      storage.getPainLogs(),
      storage.getPainIssues(),
    ]);
    this.metricDefs = metricDefs;
    // A copy, so it is a new array (and so a change) on every load, whatever the storage hands back.
    this.dailyMetrics = dailyMetrics.slice();
    // An entry saved without an issue (an older app version on another
    // device, via sync) is attached here, and the repair written back.
    const repaired = attachOrphanLogs(painLogs, painIssues);
    if (repaired.changed) await storage.savePain(repaired.logs, repaired.issues);
    this.painLogs = repaired.logs;
    this.painIssues = repaired.issues;
  }

  async savePain(logs: PainLog[], issues: PainIssue[]) {
    await storage.savePain(logs, issues);
  }

  async saveDailyMetric(entry: DailyMetricEntry) {
    await storage.saveDailyMetric(entry);
  }

  async deleteDailyMetric(id: string) {
    await storage.deleteDailyMetric(id);
  }

  async ensureMetricDef(def: MetricDef) {
    await storage.ensureMetricDef(def);
  }

  async savePainLog(log: PainLog) {
    await storage.savePainLog(log);
  }

  async deletePainLog(id: string) {
    await storage.deletePainLog(id);
  }
}
