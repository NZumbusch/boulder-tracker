import { storage } from '../storage';
import type { MetricDef, DailyMetricEntry, PainLog } from '../types';

/**
 * `metricDefs`/`dailyMetrics`/`painLogs` - the daily readings (sleep, HRV,
 * resting HR, bodyweight) and pain/discomfort logs.
 */
export class MetricsStore {
  metricDefs = $state<MetricDef[]>([]);
  dailyMetrics = $state<DailyMetricEntry[]>([]);
  painLogs = $state<PainLog[]>([]);

  async load() {
    const [metricDefs, dailyMetrics, painLogs] = await Promise.all([
      storage.getMetricDefs(),
      storage.getDailyMetrics(),
      storage.getPainLogs(),
    ]);
    this.metricDefs = metricDefs;
    this.dailyMetrics = dailyMetrics;
    this.painLogs = painLogs;
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
