import type {
  Workout,
  WorkoutTemplate,
  TrainingBlock,
  DismissedSession,
  WeekNote,
  PlanAlternative,
  AthleteProfile,
  CoachNote,
  Circuit,
  GoalEvent,
  ExerciseTypeDef,
  PhaseDef,
  Benchmark,
  BenchmarkTypeDef,
  AnalyticsCategory,
  MetricDef,
  DailyMetricEntry,
  PainLog,
  PainIssue,
  OutdoorAscent,
  ValueDef,
} from "../types";
import { DEFAULT_TEMPLATES, DATA_EXPORT_VERSION } from "../constants";
import { localIsoDate, weekMondayIso, weekSundayIso } from "../dateUtils";
import { generateId, showAlert } from "../utils";
import { generateWorkoutsFromTemplate } from "../planning/generateWorkoutsFromTemplate";
import { coalesceBlocks, getDominantBlockForWeek, blockTouchesWeek, normalizeBlocks } from "../planning/trainingBlocks";
import { upsertWeekNote } from "../planning/notes";
import { renamedPlace, samePlaceName, type Place } from "../places/places";
import { toStoredWorkout, provisionalIdWeek, weekDismissalId } from "../planning/weekProjection";
import type { PlanWrites } from "../ai/changePlanner";
import type { SettingsRecord } from "../preferences/portable";
import { scrubValueDef } from "../exercise/valueDefs";
import { saveFile } from "../share/saveFile";
import type { ShareOutcome } from "../share/imageShare";
import { initDB, flushDB, setDbState, writeMigrationBackup, toPlain, _dbState, writePlanUndo, readPlanUndo, writeRestoreSnapshot, readRestoreSnapshot } from "./persistence";

/** The tables a bulk plan change (AI change set, copied week) can touch - what its undo snapshot holds. */
const PLAN_TABLE_NAMES = ["exerciseTypes", "phaseDefs", "templates", "trainingBlocks", "workouts", "dismissedSessions", "weekNotes", "planAlternatives", "coachNotes", "circuits", "analyticsCategories", "valueDefs", "benchmarkTypes", "goals", "painIssues", "places"] as const;
type PlanTables = Record<(typeof PLAN_TABLE_NAMES)[number], unknown>;
interface PlanUndoRecord {
  /** What made the change: an AI change set, or copying a week in the planner. */
  source: "ai" | "copy";
  appliedAt: string;
  before: PlanTables;
  /** The plan right after applying, to tell whether it was edited since - kept for the latest change only. */
  after?: PlanTables;
  /** What was asked and what changed, in words, for the history. */
  label?: { goal?: string; lines: string[] };
  /** Places this change renamed: the sessions that named them were renamed too, which an undo reverses for the logged ones. */
  placeRenames?: { from: string; to: string }[];
}

/** The sessions (and phase-template sessions) that name the place `from` name `to` instead. */
function renameLocations<T extends { location?: string }>(list: T[], from: string, to: string): T[] {
  return list.map((x) => (x.location && samePlaceName(x.location, from) ? { ...x, location: to } : x));
}
function renamePlaceRefs(db: { workouts: Workout[]; templates: Record<string, WorkoutTemplate[]> }, from: string, to: string): void {
  db.workouts = toPlain(renameLocations(db.workouts, from, to));
  db.templates = toPlain(Object.fromEntries(Object.entries(db.templates).map(([phase, list]) => [phase, renameLocations(list ?? [], from, to)])));
}

/** The plan changes that can be rolled back, newest last. */
const PLAN_HISTORY_MAX = 6;

/** What is stored may be one record (before the history existed) or the list. */
function asHistory(stored: PlanUndoRecord | PlanUndoRecord[] | null): PlanUndoRecord[] {
  return stored === null ? [] : Array.isArray(stored) ? stored : [stored];
}

/** A snapshot kept for an older change needs only the planned sessions: logged ones are always today's on a rollback. */
function slimmed(record: PlanUndoRecord): PlanUndoRecord {
  const { after: _after, ...rest } = record;
  return { ...rest, before: { ...rest.before, workouts: (rest.before.workouts as Workout[]).filter((w) => w.status === "planned") } };
}

export interface PlanHistoryEntry { index: number; source: PlanUndoRecord["source"]; appliedAt: string; goal?: string; lines: string[] }

function planTables(db: any): PlanTables {
  return toPlain(Object.fromEntries(PLAN_TABLE_NAMES.map((t) => [t, db[t]]))) as PlanTables;
}
import { runDataMigrations, assertMigrationInvariants } from "./migrations";

export { runDataMigrations, assertMigrationInvariants };

/**
 * Storage singleton providing a clean interface for data persistence.
 */
/** Thrown by `importData` when the person declined to go on after seeing what the file holds. */
export class ImportCancelled extends Error {
  constructor() {
    super("Import cancelled");
    this.name = "ImportCancelled";
  }
}

/** Whether `version` ("3.34") is later than the format this app writes. */
export function isNewerExportVersion(version: string, current: string = DATA_EXPORT_VERSION): boolean {
  const parts = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const [a, b] = [parts(version), parts(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/**
 * Joins consecutive blocks of the same phase into one (see `coalesceBlocks`)
 * in `db`, pointing the sessions of a merged-away block at the one that
 * took its place. Returns whether anything changed; the caller flushes.
 */
function coalesceBlocksInDb(db: { trainingBlocks: TrainingBlock[]; workouts: Workout[] }): boolean {
  const r = coalesceBlocks(db.trainingBlocks);
  if (Object.keys(r.remap).length === 0) return false;
  db.trainingBlocks = toPlain(r.blocks);
  db.workouts = toPlain(db.workouts.map((w) => (w.blockId && r.remap[w.blockId] ? { ...w, blockId: r.remap[w.blockId] } : w)));
  return true;
}

/** Puts a backup's tables in place of what is stored (already migrated), and saves. */
async function replaceDatabase(data: any): Promise<void> {
  if (data.workouts) _dbState.workouts = data.workouts;
  if (data.trainingBlocks) _dbState.trainingBlocks = data.trainingBlocks;
  // Always set (a backup can have none): the replaced data's dismissals must not outlive it.
  _dbState.dismissedSessions = data.dismissedSessions ?? [];
  delete _dbState.weekOverrides;
  if (data.weekNotes) _dbState.weekNotes = data.weekNotes;
  if (data.planAlternatives) _dbState.planAlternatives = data.planAlternatives;
  if (data.athleteProfile) _dbState.athleteProfile = data.athleteProfile;
  if (data.coachNotes) _dbState.coachNotes = data.coachNotes;
  if (data.circuits) _dbState.circuits = data.circuits;
  if (data.goals) _dbState.goals = data.goals;
  _dbState.places = data.places ?? [];
  if (data.templates) _dbState.templates = data.templates;
  if (data.phaseDefs) _dbState.phaseDefs = data.phaseDefs;
  if (data.exerciseTypes) _dbState.exerciseTypes = data.exerciseTypes;
  if (data.benchmarks) _dbState.benchmarks = data.benchmarks;
  if (data.benchmarkTypes) _dbState.benchmarkTypes = data.benchmarkTypes;
  if (data.analyticsCategories) _dbState.analyticsCategories = data.analyticsCategories;
  if (data.metricDefs) _dbState.metricDefs = data.metricDefs;
  if (data.dailyMetrics) _dbState.dailyMetrics = data.dailyMetrics;
  if (data.painLogs) _dbState.painLogs = data.painLogs;
  if (data.painIssues) _dbState.painIssues = data.painIssues;
  if (data.outdoorAscents) _dbState.outdoorAscents = data.outdoorAscents;
  if (data.settings) _dbState.settings = data.settings;
  if (data.valueDefs) _dbState.valueDefs = data.valueDefs;
  _dbState.exportVersion = data.exportVersion || "1.0";

  await flushDB();
  // A plan-undo snapshot belongs to the data this replaced.
  await writePlanUndo(null);
}

export const storage = {
  // --- Private Helpers ---

  async _getWorkouts(): Promise<Workout[]> { await initDB(); return _dbState.workouts; },
  async _getTrainingBlocks(): Promise<TrainingBlock[]> { await initDB(); return _dbState.trainingBlocks; },
  async _getDismissedSessions(): Promise<DismissedSession[]> { await initDB(); return _dbState.dismissedSessions; },
  async _getWeekNotes(): Promise<WeekNote[]> { await initDB(); return _dbState.weekNotes; },
  async _getAthleteProfile(): Promise<AthleteProfile[]> { await initDB(); return _dbState.athleteProfile; },
  async _getCoachNotes(): Promise<CoachNote[]> { await initDB(); return _dbState.coachNotes; },
  async _getCircuits(): Promise<Circuit[]> { await initDB(); return _dbState.circuits; },
  async _getPlanAlternatives(): Promise<PlanAlternative[]> { await initDB(); return _dbState.planAlternatives; },
  async _getGoals(): Promise<GoalEvent[]> { await initDB(); return _dbState.goals; },
  async _getPlaces(): Promise<Place[]> { await initDB(); return _dbState.places ?? []; },
  async _getBenchmarks(): Promise<Benchmark[]> { await initDB(); return _dbState.benchmarks; },
  async _getBenchmarkTypes(): Promise<BenchmarkTypeDef[]> { await initDB(); return _dbState.benchmarkTypes; },
  async _getAnalyticsCategories(): Promise<AnalyticsCategory[]> { await initDB(); return _dbState.analyticsCategories; },
  async _getTemplates(): Promise<Record<string, WorkoutTemplate[]>> { await initDB(); return _dbState.templates; },
  async _getPhaseDefs(): Promise<PhaseDef[]> { await initDB(); return _dbState.phaseDefs; },
  async _getExerciseTypes(): Promise<ExerciseTypeDef[]> { await initDB(); return _dbState.exerciseTypes; },
  async _getMetricDefs(): Promise<MetricDef[]> { await initDB(); return _dbState.metricDefs; },
  async _getDailyMetrics(): Promise<DailyMetricEntry[]> { await initDB(); return _dbState.dailyMetrics; },
  async _getPainLogs(): Promise<PainLog[]> { await initDB(); return _dbState.painLogs; },
  async _getPainIssues(): Promise<PainIssue[]> { await initDB(); return _dbState.painIssues; },
  async _getOutdoorAscents(): Promise<OutdoorAscent[]> { await initDB(); return _dbState.outdoorAscents; },
  async _getValueDefs(): Promise<ValueDef[]> { await initDB(); return _dbState.valueDefs ?? []; },
  async _getSettings(): Promise<SettingsRecord[]> { await initDB(); return _dbState.settings ?? []; },

  async _saveWorkouts(workouts: Workout[]): Promise<void> { await initDB(); _dbState.workouts = toPlain(workouts); await flushDB(["workouts"]); },
  async _saveTrainingBlocks(blocks: TrainingBlock[]): Promise<void> { await initDB(); _dbState.trainingBlocks = toPlain(blocks); await flushDB(["trainingBlocks"]); },
  async _saveDismissedSessions(dismissed: DismissedSession[]): Promise<void> { await initDB(); _dbState.dismissedSessions = toPlain(dismissed); await flushDB(["dismissedSessions"]); },
  async _saveWeekNotes(notes: WeekNote[]): Promise<void> { await initDB(); _dbState.weekNotes = toPlain(notes); await flushDB(["weekNotes"]); },
  async _saveAthleteProfile(p: AthleteProfile[]): Promise<void> { await initDB(); _dbState.athleteProfile = toPlain(p); await flushDB(["athleteProfile"]); },
  async _saveCoachNotes(notes: CoachNote[]): Promise<void> { await initDB(); _dbState.coachNotes = toPlain(notes); await flushDB(["coachNotes"]); },
  async _saveCircuits(circuits: Circuit[]): Promise<void> { await initDB(); _dbState.circuits = toPlain(circuits); await flushDB(["circuits"]); },
  async _savePlanAlternatives(alts: PlanAlternative[]): Promise<void> { await initDB(); _dbState.planAlternatives = toPlain(alts); await flushDB(["planAlternatives"]); },
  async _saveGoals(goals: GoalEvent[]): Promise<void> { await initDB(); _dbState.goals = toPlain(goals); await flushDB(["goals"]); },
  async _savePlaces(places: Place[]): Promise<void> { await initDB(); _dbState.places = toPlain(places); await flushDB(["places"]); },
  async _saveBenchmarks(benchmarks: Benchmark[]): Promise<void> { await initDB(); _dbState.benchmarks = toPlain(benchmarks); await flushDB(["benchmarks"]); },
  async _saveBenchmarkTypes(types: BenchmarkTypeDef[]): Promise<void> { await initDB(); _dbState.benchmarkTypes = toPlain(types); await flushDB(["benchmarkTypes"]); },
  async _saveAnalyticsCategories(categories: AnalyticsCategory[]): Promise<void> { await initDB(); _dbState.analyticsCategories = toPlain(categories); await flushDB(["analyticsCategories"]); },
  async _saveTemplates(templates: Record<string, WorkoutTemplate[]>): Promise<void> { await initDB(); _dbState.templates = toPlain(templates); await flushDB(["templates"]); },
  async _savePhaseDefs(defs: PhaseDef[]): Promise<void> { await initDB(); _dbState.phaseDefs = toPlain(defs); await flushDB(["phaseDefs"]); },
  async _saveExerciseTypes(types: ExerciseTypeDef[]): Promise<void> { await initDB(); _dbState.exerciseTypes = toPlain(types); await flushDB(["exerciseTypes"]); },
  async _saveMetricDefs(defs: MetricDef[]): Promise<void> { await initDB(); _dbState.metricDefs = toPlain(defs); await flushDB(["metricDefs"]); },
  async _saveDailyMetrics(entries: DailyMetricEntry[]): Promise<void> { await initDB(); _dbState.dailyMetrics = toPlain(entries); await flushDB(["dailyMetrics"]); },
  async _savePainLogs(logs: PainLog[]): Promise<void> { await initDB(); _dbState.painLogs = toPlain(logs); await flushDB(["painLogs"]); },
  async _savePainIssues(issues: PainIssue[]): Promise<void> { await initDB(); _dbState.painIssues = toPlain(issues); await flushDB(["painIssues"]); },
  /** An issue and its check-ins in one write, so neither can land without the other. */
  async _savePain(logs: PainLog[], issues: PainIssue[]): Promise<void> { await initDB(); _dbState.painLogs = toPlain(logs); _dbState.painIssues = toPlain(issues); await flushDB(["painLogs", "painIssues"]); },
  async _saveValueDefs(defs: ValueDef[]): Promise<void> { await initDB(); _dbState.valueDefs = toPlain(defs); await flushDB(["valueDefs"]); },
  async _saveSettings(records: SettingsRecord[]): Promise<void> { await initDB(); _dbState.settings = toPlain(records); await flushDB(["settings"]); },
  async _saveOutdoorAscents(ascents: OutdoorAscent[]): Promise<void> { await initDB(); _dbState.outdoorAscents = toPlain(ascents); await flushDB(["outdoorAscents"]); },

  // --- Public Interface ---

  /**
   * Runs migrations on the local database to ensure it matches the current schema.
   */
  async runStartupMigrations(): Promise<void> {
    await initDB();

    const currentVersion = _dbState.exportVersion;
    if (currentVersion === DATA_EXPORT_VERSION) return;

    // Snapshot before mutating, and persist it as a recoverable backup, in
    // case the migration below produces corrupted data (see the invariant
    // check just after it).
    const before = JSON.parse(JSON.stringify(_dbState));
    await writeMigrationBackup(currentVersion, before);

    // runDataMigrations modifies the object in place
    runDataMigrations(_dbState);
    _dbState.exportVersion = DATA_EXPORT_VERSION;

    try {
      assertMigrationInvariants(before, _dbState);
    } catch (err) {
      console.error(
        "Migration invariant check failed - restoring pre-migration data instead of persisting it",
        err,
        { before, after: _dbState },
      );
      setDbState(before);
      await showAlert(
        "Data Migration Failed",
        "Your data could not be safely upgraded, so it has been left unchanged to avoid data loss. Please check the console log or contact support.",
      );
      throw err;
    }

    await flushDB();
  },

  async getWorkouts(): Promise<Workout[]> {
    return this._getWorkouts();
  },

  /**
   * Stores one session. A session that came from a template keeps the
   * template's id (`prov:{week}:{template}`), which is what stops the
   * template projecting it again; saving it also takes back any dismissal
   * of it (undoing a delete). Nothing else in the week is written.
   */
  async saveWorkout(workout: Workout): Promise<void> {
    const workouts = await this._getWorkouts();
    const index = workouts.findIndex((w) => w.id === workout.id);
    if (index !== -1) {
      workouts[index] = workout;
    } else {
      workouts.push(workout);
    }
    await this._saveWorkouts(workouts);
    const dismissed = await this._getDismissedSessions();
    if (dismissed.some((d) => d.id === workout.id)) await this._saveDismissedSessions(dismissed.filter((d) => d.id !== workout.id));
  },

  /** Deletes one session; one that came from a template is also remembered as deleted so the template doesn't bring it back. */
  async deleteWorkout(id: string): Promise<void> {
    const workouts = await this._getWorkouts();
    const workout = workouts.find((w) => w.id === id);
    await this._saveWorkouts(workouts.filter((w) => w.id !== id));
    // Remembered under the week its template belongs to, even when the session was moved to another.
    const origin = provisionalIdWeek(id);
    if (workout && origin) await this.dismissSession(id, origin);
  },

  /** Remembers that a session a phase would give `weekId` was deleted (it may never have been stored). */
  async dismissSession(id: string, weekId: string): Promise<void> {
    const dismissed = await this._getDismissedSessions();
    if (dismissed.some((d) => d.id === id)) return;
    await this._saveDismissedSessions([...dismissed, { id, weekId }]);
  },

  async getDismissedSessions(): Promise<DismissedSession[]> {
    return this._getDismissedSessions();
  },

  /**
   * Stores projected sessions as real rows (past days: history must record
   * what was planned at the time, not what a later template says). Skips
   * any already stored, so a repeat can never duplicate. Returns how many
   * were stored.
   */
  async saveProjectedSessions(sessions: Workout[]): Promise<number> {
    const workouts = await this._getWorkouts();
    const have = new Set(workouts.map((w) => w.id));
    const fresh = sessions.filter((w) => !have.has(w.id)).map(toStoredWorkout);
    if (fresh.length === 0) return 0;
    await this._saveWorkouts([...workouts, ...fresh]);
    return fresh.length;
  },

  async getBenchmarks(): Promise<Benchmark[]> {
    return this._getBenchmarks();
  },

  async saveBenchmark(benchmark: Benchmark): Promise<void> {
    const benchmarks = await this._getBenchmarks();
    const index = benchmarks.findIndex((b) => b.id === benchmark.id);
    if (index !== -1) {
      benchmarks[index] = benchmark;
    } else {
      benchmarks.push(benchmark);
    }
    await this._saveBenchmarks(benchmarks);
  },

  async deleteBenchmark(id: string): Promise<void> {
    const benchmarks = await this._getBenchmarks();
    const filtered = benchmarks.filter((b) => b.id !== id);
    await this._saveBenchmarks(filtered);
  },

  async getBenchmarkTypes(): Promise<BenchmarkTypeDef[]> {
    return this._getBenchmarkTypes();
  },

  async saveBenchmarkTypes(types: BenchmarkTypeDef[]): Promise<void> {
    await this._saveBenchmarkTypes(types);
  },

  async getAnalyticsCategories(): Promise<AnalyticsCategory[]> {
    return this._getAnalyticsCategories();
  },

  async saveAnalyticsCategories(categories: AnalyticsCategory[]): Promise<void> {
    await this._saveAnalyticsCategories(categories);
  },

  async getTrainingBlocks(): Promise<TrainingBlock[]> {
    return this._getTrainingBlocks();
  },

  async saveTrainingBlock(block: TrainingBlock): Promise<void> {
    const blocks = await this._getTrainingBlocks();
    const index = blocks.findIndex((b) => b.id === block.id);
    if (index !== -1) {
      blocks[index] = block;
    } else {
      blocks.push(block);
    }
    await this._saveTrainingBlocks(blocks);
    // A new block next to one of the same phase is one block with it.
    if (coalesceBlocksInDb(_dbState)) await flushDB(["trainingBlocks", "workouts"]);
  },

  /** Replaces every block in one write (the Block manager's edits carve neighbours, so several change at once); blocks of one phase that touch become one. */
  async saveTrainingBlocks(blocks: TrainingBlock[]): Promise<void> {
    await this._saveTrainingBlocks(blocks);
    if (coalesceBlocksInDb(_dbState)) await flushDB(["trainingBlocks", "workouts"]);
  },

  /** Merges blocks that are really one - run when the app loads, so blocks split up earlier read as one. */
  async coalesceTrainingBlocks(): Promise<boolean> {
    await initDB();
    if (!coalesceBlocksInDb(_dbState)) return false;
    await flushDB(["trainingBlocks", "workouts"]);
    return true;
  },

  async deleteTrainingBlock(id: string): Promise<void> {
    const blocks = await this._getTrainingBlocks();
    await this._saveTrainingBlocks(blocks.filter((b) => b.id !== id));
  },

  /**
   * Writes an AI change set's result (`changePlanner.ts` -> `PlanWrites`) in
   * one go: catalog lists replaced where they changed, and each touched
   * week's planned sessions swapped for its new plan (or dropped, when it
   * now follows its phase). Completed sessions are never removed. One
   * flush, so a half-applied plan can't be left behind by a failed write.
   */
  async applyPlanWrites(writes: PlanWrites, source: PlanUndoRecord["source"] = "ai", label?: PlanUndoRecord["label"]): Promise<void> {
    await initDB();
    const db = _dbState;
    const before = planTables(db);
    if (writes.exerciseTypes) db.exerciseTypes = toPlain(writes.exerciseTypes);
    if (writes.phaseDefs) db.phaseDefs = toPlain(writes.phaseDefs);
    if (writes.templates) db.templates = toPlain(writes.templates);
    if (writes.trainingBlocks) db.trainingBlocks = toPlain(writes.trainingBlocks);
    if (writes.planAlternatives) db.planAlternatives = toPlain(writes.planAlternatives);
    if (writes.coachNotes) db.coachNotes = toPlain(writes.coachNotes);
    if (writes.circuits) db.circuits = toPlain(writes.circuits);
    if (writes.analyticsCategories) db.analyticsCategories = toPlain(writes.analyticsCategories);
    if (writes.valueDefs) db.valueDefs = toPlain(writes.valueDefs);
    if (writes.benchmarkTypes) db.benchmarkTypes = toPlain(writes.benchmarkTypes);
    if (writes.goals) db.goals = toPlain(writes.goals);
    if (writes.painIssues) db.painIssues = toPlain(writes.painIssues);
    if (writes.places) db.places = toPlain(writes.places);
    if (writes.weeks.length) {
      const touched = new Set(writes.weeks.map((w) => w.weekId));
      const kept = (db.workouts as Workout[]).filter((w) => !(touched.has(w.weekId) && w.status === "planned"));
      const added = writes.weeks.flatMap((w) => (w.planned ?? []).map(toStoredWorkout));
      db.workouts = toPlain([...kept, ...added]);
      // A week given sessions is planned by hand (or AI): nothing is projected into it. One that follows its phase again forgets its dismissals.
      const dismissed = (db.dismissedSessions as DismissedSession[]).filter((d) => !touched.has(d.weekId));
      for (const w of writes.weeks) if (w.planned !== null) dismissed.push({ id: weekDismissalId(w.weekId), weekId: w.weekId });
      db.dismissedSessions = toPlain(dismissed);
    }
    let notes = db.weekNotes as WeekNote[];
    for (const n of writes.weekNotes) notes = upsertWeekNote(notes, n.weekId, n.text);
    db.weekNotes = toPlain(notes);
    // Sessions that named a place this change renamed (the new weeks above included) follow it.
    for (const r of writes.placeRenames ?? []) renamePlaceRefs(db, r.from, r.to);
    // Blocks the change added next to one of the same phase are one block with it.
    coalesceBlocksInDb(db);
    await flushDB();
    const previous = asHistory(await readPlanUndo<PlanUndoRecord | PlanUndoRecord[]>()).map(slimmed);
    await writePlanUndo([...previous, { source, appliedAt: new Date().toISOString(), before, after: planTables(db), ...(label ? { label } : {}), ...(writes.placeRenames?.length ? { placeRenames: writes.placeRenames } : {}) }].slice(-PLAN_HISTORY_MAX));
  },

  /**
   * Whether the last bulk plan change (an AI change set, or a copied week)
   * can be undone, what it was, when it was applied, and whether the plan
   * has been edited since (undoing reverts those edits too). Sessions
   * logged since don't count as edits - undo keeps them.
   */
  async getPlanUndo(): Promise<{ source: PlanUndoRecord["source"]; appliedAt: string; changedSince: boolean } | null> {
    const record = asHistory(await readPlanUndo<PlanUndoRecord | PlanUndoRecord[]>()).at(-1);
    if (!record) return null;
    await initDB();
    const now = planTables(_dbState);
    const completedNow = new Set((now.workouts as Workout[]).filter((w) => w.status === "completed").map((w) => w.id));
    // A record written before blocks were days holds whole weeks - read it in today's shape.
    const comparable = (t: PlanTables) => JSON.stringify({
      ...t,
      trainingBlocks: normalizeBlocks((t.trainingBlocks ?? []) as any[]),
      workouts: (t.workouts as Workout[])
        .filter((w) => w.status === "planned" && !completedNow.has(w.id))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
    return { source: record.source ?? "ai", appliedAt: record.appliedAt, changedSince: record.after ? comparable(now) !== comparable(record.after) : false };
  },

  /**
   * Puts the plan back as it was before the last bulk change: exercises,
   * phases, templates, blocks, week overrides and notes, and planned
   * sessions. Completed sessions are always today's - a session logged
   * since the change stays logged.
   */
  async undoPlanChange(): Promise<void> {
    await this.undoPlanChangesTo((asHistory(await readPlanUndo<PlanUndoRecord | PlanUndoRecord[]>()).length || 1) - 1);
  },

  /** The plan changes that can still be rolled back, newest first. */
  async getPlanHistory(): Promise<PlanHistoryEntry[]> {
    const history = asHistory(await readPlanUndo<PlanUndoRecord | PlanUndoRecord[]>());
    return history.map((r, index) => ({ index, source: r.source ?? "ai", appliedAt: r.appliedAt, goal: r.label?.goal, lines: r.label?.lines ?? [] })).reverse();
  },

  /**
   * Rolls the plan back to how it was before change `index` of the history -
   * which also takes back every change made after it. Sessions logged since
   * stay logged.
   */
  async undoPlanChangesTo(index: number): Promise<void> {
    const history = asHistory(await readPlanUndo<PlanUndoRecord | PlanUndoRecord[]>());
    const record = history[index];
    if (!record) return;
    await initDB();
    const db = _dbState;
    const completed = (db.workouts as Workout[]).filter((w) => w.status === "completed");
    const completedIds = new Set(completed.map((w) => w.id));
    for (const table of PLAN_TABLE_NAMES) {
      // A record written before a table existed doesn't have it - leave that table alone rather than wiping it.
      if (table !== "workouts" && record.before[table] !== undefined) db[table] = table === "trainingBlocks" ? normalizeBlocks(record.before[table] as any[]) : record.before[table];
    }
    // Logged sessions kept the new name of a place this change renamed: back to the old one, newest rename first.
    let loggedNow = completed;
    for (const r of history.slice(index).reverse()) {
      for (const rename of [...(r.placeRenames ?? [])].reverse()) loggedNow = renameLocations(loggedNow, rename.to, rename.from);
    }
    db.workouts = toPlain([
      ...(record.before.workouts as Workout[]).filter((w) => w.status === "planned" && !completedIds.has(w.id)),
      ...loggedNow,
    ]);
    await flushDB();
    const rest = history.slice(0, index);
    await writePlanUndo(rest.length ? rest : null);
  },

  async clearPlanUndo(): Promise<void> {
    await writePlanUndo(null);
  },

  async getWeekNotes(): Promise<WeekNote[]> {
    return this._getWeekNotes();
  },

  /** Sets `weekId`'s note; blank text deletes it (see `upsertWeekNote`). */
  async saveWeekNote(weekId: string, text: string): Promise<void> {
    const notes = await this._getWeekNotes();
    await this._saveWeekNotes(upsertWeekNote(notes, weekId, text));
  },

  async getGoals(): Promise<GoalEvent[]> {
    return this._getGoals();
  },

  async getPlaces(): Promise<Place[]> {
    return this._getPlaces();
  },

  async savePlaces(places: Place[]): Promise<void> {
    await this._savePlaces(places);
  },

  /** Renames a place and, in the same write, every session and phase-template session that names it. `false` when the new name is empty or taken. */
  async renamePlace(from: string, to: string): Promise<boolean> {
    await initDB();
    const next = renamedPlace(_dbState.places ?? [], from, to);
    if (!next) return false;
    _dbState.places = toPlain(next);
    renamePlaceRefs(_dbState, from, to.trim());
    await flushDB(["places", "workouts", "templates"]);
    return true;
  },

  async getAthleteProfile(): Promise<AthleteProfile | undefined> {
    return (await this._getAthleteProfile())[0];
  },

  async saveAthleteProfile(profile: AthleteProfile): Promise<void> {
    await this._saveAthleteProfile([profile]);
  },

  async getCoachNotes(): Promise<CoachNote[]> {
    return this._getCoachNotes();
  },

  async saveCoachNotes(notes: CoachNote[]): Promise<void> {
    await this._saveCoachNotes(notes);
  },

  async getCircuits(): Promise<Circuit[]> {
    return this._getCircuits();
  },

  async saveCircuits(circuits: Circuit[]): Promise<void> {
    await this._saveCircuits(circuits);
  },

  async getPlanAlternatives(): Promise<PlanAlternative[]> {
    return this._getPlanAlternatives();
  },

  /** Creates or replaces one Plan B (see `PlanAlternative`). */
  async savePlanAlternative(alt: PlanAlternative): Promise<void> {
    const alts = [...(await this._getPlanAlternatives())];
    const index = alts.findIndex((a) => a.id === alt.id);
    if (index !== -1) alts[index] = alt;
    else alts.push(alt);
    await this._savePlanAlternatives(alts);
  },

  async deletePlanAlternative(id: string): Promise<void> {
    const alts = await this._getPlanAlternatives();
    await this._savePlanAlternatives(alts.filter((a) => a.id !== id));
  },

  async saveGoal(event: GoalEvent): Promise<void> {
    const events = await this._getGoals();
    const index = events.findIndex((e) => e.id === event.id);
    if (index !== -1) {
      events[index] = event;
    } else {
      events.push(event);
    }
    await this._saveGoals(events);
  },

  async deleteGoal(id: string): Promise<void> {
    const events = await this._getGoals();
    await this._saveGoals(events.filter((e) => e.id !== id));
  },

  async getTemplates(): Promise<Record<string, WorkoutTemplate[]>> {
    return this._getTemplates();
  },

  async saveTemplates(
    templates: Record<string, WorkoutTemplate[]>,
  ): Promise<void> {
    await this._saveTemplates(templates);
  },

  async resetTemplates(): Promise<void> {
    await this._saveTemplates(DEFAULT_TEMPLATES);
  },

  async getPhaseDefs(): Promise<PhaseDef[]> {
    return this._getPhaseDefs();
  },

  async savePhaseDefs(defs: PhaseDef[]): Promise<void> {
    await this._savePhaseDefs(defs);
  },

  async getExerciseTypes(): Promise<ExerciseTypeDef[]> {
    return this._getExerciseTypes();
  },

  async saveExerciseTypes(types: ExerciseTypeDef[]): Promise<void> {
    // Prevent duplicate names
    const names = types.map((t) => t.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new Error("Duplicate modality names are not allowed.");
    }

    // No rename-propagation needed: exercises reference types by typeId,
    // which doesn't change when a type's display name does.
    await this._saveExerciseTypes(types);
  },

  async getMetricDefs(): Promise<MetricDef[]> {
    return this._getMetricDefs();
  },

  async saveMetricDefs(defs: MetricDef[]): Promise<void> {
    await this._saveMetricDefs(defs);
  },

  async getDailyMetrics(): Promise<DailyMetricEntry[]> {
    return this._getDailyMetrics();
  },

  async saveDailyMetrics(entries: DailyMetricEntry[]): Promise<void> {
    await this._saveDailyMetrics(entries);
  },

  /** Upsert-by-id for many entries in one write (a Health Connect import can bring years of days). */
  async upsertDailyMetrics(incoming: DailyMetricEntry[]): Promise<void> {
    const entries = await this._getDailyMetrics();
    const index = new Map(entries.map((e, i) => [e.id, i]));
    for (const entry of incoming) {
      const at = index.get(entry.id);
      if (at === undefined) {
        index.set(entry.id, entries.length);
        entries.push(entry);
      } else {
        entries[at] = entry;
      }
    }
    await this._saveDailyMetrics(entries);
  },

  /** Upsert-by-id, mirroring the existing savePainLog pattern. */
  async saveDailyMetric(entry: DailyMetricEntry): Promise<void> {
    const entries = await this._getDailyMetrics();
    const index = entries.findIndex((e) => e.id === entry.id);
    if (index !== -1) {
      entries[index] = entry;
    } else {
      entries.push(entry);
    }
    await this._saveDailyMetrics(entries);
  },

  async deleteDailyMetric(id: string): Promise<void> {
    const entries = await this._getDailyMetrics();
    await this._saveDailyMetrics(entries.filter((e) => e.id !== id));
  },

  /**
   * Finds an existing MetricDef by id, or creates it from the given
   * defaults. Defensive belt-and-suspenders alongside the fresh-install
   * default (constants.ts's DEFAULT_METRIC_DEFS) and the 3.24->3.25
   * migration step.
   */
  async ensureMetricDef(def: MetricDef): Promise<void> {
    const defs = await this._getMetricDefs();
    if (!defs.some((d) => d.id === def.id)) {
      defs.push(def);
      await this._saveMetricDefs(defs);
    }
  },

  async getPainLogs(): Promise<PainLog[]> {
    return this._getPainLogs();
  },

  async savePainLogs(logs: PainLog[]): Promise<void> {
    await this._savePainLogs(logs);
  },

  async savePainLog(log: PainLog): Promise<void> {
    const logs = await this._getPainLogs();
    const index = logs.findIndex((l) => l.id === log.id);
    if (index !== -1) {
      logs[index] = log;
    } else {
      logs.push(log);
    }
    await this._savePainLogs(logs);
  },

  async deletePainLog(id: string): Promise<void> {
    const logs = await this._getPainLogs();
    await this._savePainLogs(logs.filter((l) => l.id !== id));
  },

  async getPainIssues(): Promise<PainIssue[]> {
    return (await this._getPainIssues()) ?? [];
  },

  /** Replaces the whole pain picture - issues and check-ins together (see `_savePain`). */
  async savePain(logs: PainLog[], issues: PainIssue[]): Promise<void> {
    await this._savePain(logs, issues);
  },

  async getValueDefs(): Promise<ValueDef[]> {
    return this._getValueDefs();
  },

  async saveValueDefs(defs: ValueDef[]): Promise<void> {
    await this._saveValueDefs(defs);
  },

  /**
   * Deletes a value type for good: the def, its values on every session,
   * template, week plan and circuit, and its place in every exercise's
   * tracked fields. Returns how many values went.
   */
  async deleteValueDef(id: string): Promise<number> {
    await initDB();
    const tables = ["workouts", "exerciseTypes", "templates", "circuits", "planAlternatives", "trainingBlocks"] as const;
    let removed = 0;
    for (const t of tables) removed += scrubValueDef(_dbState[t], id);
    _dbState.valueDefs = toPlain((_dbState.valueDefs ?? []).filter((d: ValueDef) => d.id !== id));
    await flushDB([...tables, "valueDefs"]);
    return removed;
  },

  async getSettings(): Promise<SettingsRecord[]> {
    return this._getSettings();
  },

  async saveSettings(records: SettingsRecord[]): Promise<void> {
    await this._saveSettings(records);
  },

  async getOutdoorAscents(): Promise<OutdoorAscent[]> {
    return this._getOutdoorAscents();
  },

  async saveOutdoorAscents(ascents: OutdoorAscent[]): Promise<void> {
    await this._saveOutdoorAscents(ascents);
  },

  async saveOutdoorAscent(ascent: OutdoorAscent): Promise<void> {
    const ascents = await this._getOutdoorAscents();
    const index = ascents.findIndex((a) => a.id === ascent.id);
    if (index !== -1) {
      ascents[index] = ascent;
    } else {
      ascents.push(ascent);
    }
    await this._saveOutdoorAscents(ascents);
  },

  /** Appends a batch of ascents (e.g. from a CSV import) in one write. */
  async addOutdoorAscents(newAscents: OutdoorAscent[]): Promise<void> {
    const ascents = await this._getOutdoorAscents();
    await this._saveOutdoorAscents([...ascents, ...newAscents]);
  },

  async deleteOutdoorAscent(id: string): Promise<void> {
    const ascents = await this._getOutdoorAscents();
    await this._saveOutdoorAscents(ascents.filter((a) => a.id !== id));
  },

  /**
   * Puts a week back under its phases' control: drops its saved planned
   * sessions and everything remembered as deleted in it, so it shows what
   * the phases give it again. Completed sessions are always kept (and, with
   * a template's id, still stand in for that template).
   */
  async resetWeekToPhaseDefaults(weekId: string): Promise<void> {
    const workouts = await this._getWorkouts();
    await this._saveWorkouts(workouts.filter((w) => !(w.weekId === weekId && w.status === "planned")));
    const dismissed = await this._getDismissedSessions();
    if (dismissed.some((d) => d.weekId === weekId)) await this._saveDismissedSessions(dismissed.filter((d) => d.weekId !== weekId));
  },

  async clearWeekData(weekId: string): Promise<void> {
    // 1. Remove this week's own single-week block (a multi-week block that
    // merely spans this week among others is left alone - clearing one
    // week can't silently delete data for the other weeks it covers).
    const blocks = await this._getTrainingBlocks();
    const [monday, sunday] = [weekMondayIso(weekId), weekSundayIso(weekId)];
    const filteredBlocks = blocks.filter((b) => !(b.startDate === monday && b.endDate === sunday));
    await this._saveTrainingBlocks(filteredBlocks);

    // 2. Forget what was dismissed in the week. If a *longer* block still covers it, the week would
    // immediately project its sessions again and "Clear Week" would appear to do nothing - so it is
    // dismissed whole instead, which is exactly "deliberately empty, don't fill it". Assigning a
    // phase to the week later takes that back (see `assignPhaseToWeek`).
    const dismissed = await this._getDismissedSessions();
    const withoutThisWeek = dismissed.filter((d) => d.weekId !== weekId);
    const stillCovered = filteredBlocks.some((b) => blockTouchesWeek(b, weekId));
    await this._saveDismissedSessions(stillCovered ? [...withoutThisWeek, { id: weekDismissalId(weekId), weekId }] : withoutThisWeek);

    // 3. Remove all workouts for this week
    const workouts = await this._getWorkouts();
    const filteredWorkouts = workouts.filter((w) => w.weekId !== weekId);
    await this._saveWorkouts(filteredWorkouts);

    // 4. Remove all benchmarks for this week
    const benchmarks = await this._getBenchmarks();
    const filteredBenchmarks = benchmarks.filter((b) => b.weekId !== weekId);
    await this._saveBenchmarks(filteredBenchmarks);
  },

  /** Hands a JSON backup to `saveFile` (share sheet or download) and says how that went. */
  async exportData(): Promise<ShareOutcome> {
    await initDB();
    const data = {
      ..._dbState,
      exportVersion: DATA_EXPORT_VERSION,
    };
    return saveFile({
      content: JSON.stringify(data, null, 2),
      fileName: `boulder-tracker-backup-${localIsoDate()}.json`,
      mimeType: "application/json",
      title: "Boulder Tracker backup",
    });
  },

  /** What the last backup restore replaced, if it was kept: when, and how many sessions. */
  async getRestoreSnapshot(): Promise<{ at: string; workouts: number } | null> {
    const snap = await readRestoreSnapshot();
    return snap ? { at: snap.at, workouts: snap.workouts } : null;
  },

  /**
   * Puts back what the last restore replaced. The data being replaced now is
   * kept in the same slot, so a second tap undoes this one. Returns false
   * when there is nothing to go back to.
   */
  async restorePrevious(): Promise<boolean> {
    const snap = await readRestoreSnapshot();
    if (!snap) return false;
    await initDB();
    const current = { at: new Date().toISOString(), workouts: (_dbState.workouts ?? []).length, data: toPlain(_dbState) };
    // The slot is only given up once the copy of the present data is safe.
    if (!(await writeRestoreSnapshot(current))) throw new Error("The current data could not be kept, so nothing was restored.");
    runDataMigrations(snap.data);
    await replaceDatabase(snap.data);
    return true;
  },

  /**
   * Replaces everything with a backup file. `confirmImport` sees what the
   * file holds before anything is touched; answering false stops the import
   * (it rejects with `ImportCancelled`).
   */
  async importData(
    file: File,
    onProgress: (label: string, fraction: number) => void = () => {},
    confirmImport: (incoming: { workouts: number; exportVersion: string }) => Promise<boolean> = async () => true,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          if (!data.workouts || !Array.isArray(data.workouts)) {
            throw new Error("Invalid backup format: workouts missing.");
          }

          if (!(await confirmImport({ workouts: data.workouts.length, exportVersion: String(data.exportVersion ?? "1.0") }))) {
            throw new ImportCancelled();
          }

          onProgress("Updating to the current format", 0.35);
          runDataMigrations(data);
          onProgress("Saving", 0.6);

          // Keep what is here now, so the restore can be taken back.
          await initDB();
          await writeRestoreSnapshot({ at: new Date().toISOString(), workouts: (_dbState.workouts ?? []).length, data: toPlain(_dbState) });
          await replaceDatabase(data);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  },
};
