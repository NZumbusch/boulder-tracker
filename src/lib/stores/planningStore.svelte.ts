import { storage } from '../storage';
import type { TrainingBlock, WeekOverride, WeekNote, GoalEvent, WorkoutTemplate } from '../types';
import { getDominantBlockForWeek } from '../planning/trainingBlocks';

/**
 * Training blocks (concurrent phase assignments), week overrides, the
 * goals calendar (competitions and outdoor trips), and workout templates.
 * Blocks replaced the old one-phase-per-week `periodization`.
 */
export class PlanningStore {
  trainingBlocks = $state<TrainingBlock[]>([]);
  weekOverrides = $state<WeekOverride[]>([]);
  weekNotes = $state<WeekNote[]>([]);
  goals = $state<GoalEvent[]>([]);
  templates = $state<Record<string, WorkoutTemplate[]>>({});

  async load() {
    const [trainingBlocks, weekOverrides, weekNotes, goals, templates] = await Promise.all([
      storage.getTrainingBlocks(),
      storage.getWeekOverrides(),
      storage.getWeekNotes(),
      storage.getGoals(),
      storage.getTemplates(),
    ]);
    this.trainingBlocks = trainingBlocks;
    this.weekOverrides = weekOverrides;
    this.weekNotes = weekNotes;
    this.goals = goals;
    this.templates = templates;
  }

  getDominantBlockForWeek(weekId: string) {
    return getDominantBlockForWeek(this.trainingBlocks, weekId);
  }

  /**
   * "Quick assign" a phase to a single week (see `storage.assignPhaseToWeek`).
   */
  async assignPhase(weekId: string, phaseId: string) {
    await storage.assignPhaseToWeek(weekId, phaseId);
  }

  /**
   * Creates or updates a (possibly multi-week) training block directly -
   * the concurrent-block / overlapping-emphasis editing path, distinct from
   * the single-week `assignPhase` quick-assign.
   */
  async saveTrainingBlock(block: TrainingBlock) {
    await storage.saveTrainingBlock(block);
  }

  async deleteTrainingBlock(id: string) {
    await storage.deleteTrainingBlock(id);
  }

  async saveWeekNote(weekId: string, text: string) {
    await storage.saveWeekNote(weekId, text);
  }

  async saveGoal(goal: GoalEvent) {
    await storage.saveGoal(goal);
  }

  async deleteGoal(id: string) {
    await storage.deleteGoal(id);
  }

  async updateTemplates(templates: Record<string, WorkoutTemplate[]>) {
    await storage.saveTemplates(templates);
  }

  async resetTemplates() {
    await storage.resetTemplates();
  }

  /** Puts a week back under its phase's control (see `storage.resetWeekToPhaseDefaults`). */
  async resetWeekToPhaseDefaults(weekId: string) {
    await storage.resetWeekToPhaseDefaults(weekId);
  }

  /**
   * Clears all data (this week's own block, workouts, benchmarks) for a week.
   */
  async clearWeek(weekId: string) {
    await storage.clearWeekData(weekId);
  }
}
