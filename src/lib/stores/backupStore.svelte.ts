import { storage } from '../storage';
import { Capacitor } from '@capacitor/core';
import { autoBackupDue, writeAutoBackup } from '../storage/autoBackup';
import { isDemoMode } from '../storage/persistence';
import type { Workout, TrainingBlock, ExerciseTypeDef, PhaseDef } from '../types';
import { showAlert } from '../utils';
import { saveFile } from '../share/saveFile';
import { slotValues, slotTypeName } from '../exerciseSlot';
import { getDominantBlockForWeek } from '../planning/trainingBlocks';

const LAST_BACKUP_KEY = 'boulder_tracker_last_backup_at';
const LAST_AUTO_BACKUP_KEY = 'boulder_tracker_last_auto_backup';

function readLastAutoBackup(): { at: string; where: string } | undefined {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_AUTO_BACKUP_KEY) : null;
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Import/export/CSV, and Android's automatic weekly backup.
 */
export class BackupStore {
  /**
   * When a full JSON backup was last exported from this device - device-local,
   * like the export itself, and read by Home's backup-age alert. Undefined
   * if never (or before this was recorded).
   */
  lastBackupAt = $state<string | undefined>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_BACKUP_KEY) ?? undefined : undefined,
  );

  /** The last automatic backup (Android): when, and where it was written. */
  lastAutoBackup = $state<{ at: string; where: string } | undefined>(readLastAutoBackup());

  private markBackedUp(at: string) {
    this.lastBackupAt = at;
    if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_BACKUP_KEY, at);
  }

  /**
   * Writes the weekly automatic backup if one is due - Android only, and
   * only when the setting is on. Never throws: a failed backup is logged
   * and tried again next start, and the app carries on.
   */
  async runAutoBackupIfDue(enabled: boolean, now = new Date()) {
    if (!enabled || isDemoMode() || !Capacitor.isNativePlatform() || !autoBackupDue(this.lastAutoBackup?.at, now)) return;
    try {
      await this.writeBackupNow(now);
    } catch (err) {
      console.error('Automatic backup failed:', err);
    }
  }

  /**
   * The automatic backup, right now, whether or not one is due - before an
   * app update (lib/update/). Throws if it couldn't be written. Returns
   * where it went.
   */
  async writeBackupNow(now = new Date()): Promise<string> {
    const where = await writeAutoBackup(now);
    const at = now.toISOString();
    this.lastAutoBackup = { at, where };
    if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_AUTO_BACKUP_KEY, JSON.stringify(this.lastAutoBackup));
    // It's a real backup, so the backup-age alert should count it.
    this.markBackedUp(at);
    return where;
  }

  /**
   * Exports all training data to a JSON file.
   */
  async exportData() {
    try {
      const outcome = await storage.exportData();
      if (outcome === 'failed') throw new Error('The backup file could not be saved.');
      // Closing the share sheet saved nothing, so it isn't a backup.
      if (outcome !== 'dismissed') this.markBackedUp(new Date().toISOString());
    } catch (err) {
      await showAlert('Export Error', err instanceof Error ? err.message : 'Export failed');
    }
  }

  /**
   * Imports training data from a file. Throws on failure - the caller
   * (the `trainingState` facade) is responsible for refreshing state and
   * surfacing success/error feedback, since a successful import needs
   * every other store reloaded, not just this one.
   */
  async importFile(file: File, onProgress?: (label: string, fraction: number) => void): Promise<void> {
    await storage.importData(file, onProgress);
  }

  /**
   * Exports all training data to a CSV file for analysis in Excel or Python.
   */
  exportToCSV(workouts: Workout[], trainingBlocks: TrainingBlock[], exerciseTypes: ExerciseTypeDef[], phaseDefs: PhaseDef[]) {
    if (workouts.length === 0) {
      showAlert('Export Error', 'No data to export');
      return;
    }

    const rows = [];
    const headers = [
      'Date', 'WeekId', 'Phase', 'Day', 'Workout Notes', 'Workout Description', 'Workout Actual Load', 'Workout Planned Load',
      'Fingers Fatigue', 'Core Fatigue', 'Systemic Fatigue',
      'Exercise Type', 'Exercise Notes', 'Exercise Duration', 'Exercise Planned Load', 'Reps', 'Sets', 'Weight', 'Distance',
      'Hold Type', 'Hold Size', 'Time On', 'Time Off', 'Rest Time', 'Climbing Style', 'Board Type', 'Board Angle'
    ];
    rows.push(headers.join(','));

    workouts.forEach(w => {
      const phaseId = getDominantBlockForWeek(trainingBlocks, w.weekId)?.phaseId;
      const phase = (phaseId && phaseDefs.find(p => p.id === phaseId)?.name) || '';
      const baseInfo = [
        w.date || '',
        w.weekId,
        `"${phase}"`,
        w.dayOfWeek || '',
        `"${(w.notes || '').replace(/"/g, '""')}"`,
        `"${(w.description || '').replace(/"/g, '""')}"`,
        w.loadFactor || 0,
        w.plannedLoad || 0,
        w.fingers || 0,
        w.core || 0,
        w.systemic || 0
      ];

      if (!w.exercises || w.exercises.length === 0) {
        rows.push([...baseInfo, ...Array(16).fill('')].join(','));
      } else {
        w.exercises.forEach(slot => {
          const e = slotValues(slot);
          const exInfo = [
            `"${slotTypeName(slot, exerciseTypes)}"`,
            `"${(e.notes || '').replace(/"/g, '""')}"`,
            e.duration || 0,
            e.plannedLoad || 0,
            e.reps || 0,
            e.sets || 0,
            e.weight || 0,
            e.distance || 0,
            e.holdType || '',
            e.holdSize || 0,
            e.timeOn || 0,
            e.timeOff || 0,
            e.timeBetweenSets || 0,
            (Array.isArray(e.climbingStyle) ? e.climbingStyle.join(' + ') : e.climbingStyle) || '',
            e.boardType || '',
            e.boardAngle || ''
          ];
          rows.push([...baseInfo, ...exInfo].join(','));
        });
      }
    });

    const csvContent = rows.join('\n');
    void saveFile({
      content: csvContent,
      fileName: `boulder-tracker-data-${new Date().toISOString().split('T')[0]}.csv`,
      mimeType: 'text/csv',
      title: 'Boulder Tracker sessions (CSV)',
    });
  }
}
