/**
 * Importing daily metrics from Health Connect (Android): resting heart
 * rate, weight and sleep duration. Quietly on start and when the app comes
 * back (at most every RESUME_AFTER_MS), and on "Import now" in Settings.
 *
 * Only the device that has Health Connect imports; Drive sync carries the
 * values to the others. What gets stored is decided in `import.ts`.
 */
import { App } from "@capacitor/app";
import { trainingState } from "../state.svelte";
import { storage } from "../storage";
import { isDemoMode } from "../storage/persistence";
import { BODYWEIGHT_METRIC_ID, DEFAULT_METRIC_DEFS, SLEEP_DURATION_METRIC } from "../constants";
import { HealthConnect, healthConnectSupported, type HealthConnectAvailability, type HealthKind } from "../native/healthConnect";
import { dailyValues, planImport, RHR_METRIC_ID } from "./import";

const SETTINGS_KEY = "boulder_tracker_health_connect";
const RESUME_AFTER_MS = 30 * 60_000;
/** A later import re-reads this far back: a night's sleep or a watch sync can arrive a day or two late. */
const OVERLAP_MS = 3 * 86_400_000;
/** "Everything" for the first import. Health Connect itself decides how far back it really goes. */
const FIRST_IMPORT_FROM = "2000-01-01T00:00:00Z";

interface Settings {
  enabled: boolean;
  /** Epoch ms of the last successful import, or null before the first. */
  lastImportAt: number | null;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { enabled: false, lastImportAt: null, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { enabled: false, lastImportAt: null };
}

class HealthConnectImport {
  supported = healthConnectSupported();
  availability = $state<HealthConnectAvailability | null>(null);
  granted = $state<HealthKind[]>([]);
  history = $state(false);
  enabled = $state(false);
  lastImportAt = $state<number | null>(null);
  importing = $state(false);
  error = $state<string | null>(null);
  /** What the last import did, for Settings. */
  lastResult = $state<{ saved: number; keptManual: number } | null>(null);

  #started = false;

  async init(): Promise<void> {
    if (!this.supported || this.#started) return;
    this.#started = true;
    const s = loadSettings();
    this.enabled = s.enabled;
    this.lastImportAt = s.lastImportAt;
    await this.refreshStatus();
    if (this.enabled) void this.importNow({ quiet: true });
    void App.addListener("resume", () => {
      if (this.enabled && (this.lastImportAt === null || Date.now() - this.lastImportAt > RESUME_AFTER_MS)) {
        void this.importNow({ quiet: true });
      }
    });
  }

  async refreshStatus(): Promise<void> {
    try {
      this.availability = (await HealthConnect.availability()).status;
      if (this.availability === "available") {
        const p = await HealthConnect.getHealthPermissions();
        this.granted = p.granted;
        this.history = p.history;
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  /** Asks for the permissions and, if any are granted, switches import on and runs the first one. */
  async connect(): Promise<void> {
    this.error = null;
    try {
      const p = await HealthConnect.requestHealthPermissions();
      this.granted = p.granted;
      this.history = p.history;
      if (p.granted.length === 0) {
        this.error = "No access was granted. You can allow it in Health Connect's settings.";
        return;
      }
      this.#save({ enabled: true, lastImportAt: this.lastImportAt });
      await this.importNow();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  /** Stops importing. Access itself is withdrawn in Health Connect's settings. */
  disconnect(): void {
    this.#save({ enabled: false, lastImportAt: null });
    this.lastResult = null;
  }

  async importNow({ quiet = false }: { quiet?: boolean } = {}): Promise<void> {
    if (!this.enabled || this.importing || isDemoMode() || trainingState.demoActive) return;
    this.importing = true;
    if (!quiet) this.error = null;
    const startedAt = Date.now();
    try {
      const from = this.lastImportAt === null ? FIRST_IMPORT_FROM : new Date(this.lastImportAt - OVERLAP_MS).toISOString();
      const readings = await HealthConnect.read({ from, to: new Date(startedAt).toISOString() });
      const plan = planImport(await storage.getDailyMetrics(), dailyValues(readings));
      if (plan.upserts.length > 0) {
        const defs = [
          DEFAULT_METRIC_DEFS.find((d) => d.id === RHR_METRIC_ID)!,
          DEFAULT_METRIC_DEFS.find((d) => d.id === BODYWEIGHT_METRIC_ID)!,
          SLEEP_DURATION_METRIC,
        ].filter((d) => plan.upserts.some((u) => u.metricId === d.id));
        await trainingState.importDailyMetrics(plan.upserts, defs);
      }
      this.lastResult = { saved: plan.upserts.length, keptManual: plan.keptManual };
      this.#save({ enabled: true, lastImportAt: startedAt });
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.importing = false;
    }
  }

  #save(s: Settings): void {
    this.enabled = s.enabled;
    this.lastImportAt = s.lastImportAt;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }
}

export const healthConnect = new HealthConnectImport();
