import { storage } from '../storage';
import type { ExternalActivity, GarminRecord } from '../types';
import type { ArchiveInfo, ArchivePlan } from '../health/garminArchive';

/**
 * Activities imported from other services (`ExternalActivity`; the Strava
 * export today). Read-only history: they are not sessions and never count
 * toward load.
 */
export class ExternalActivityStore {
  externalActivities = $state<ExternalActivity[]>([]);

  async load() {
    this.externalActivities = await storage.getExternalActivities();
  }

  /** Adds the ones not stored yet; returns how many were new. */
  async add(items: ExternalActivity[]): Promise<number> {
    return storage.addExternalActivities(items);
  }

  /** Adds stats to stored activities that lack them; returns how many were filled in. */
  async addStats(items: ExternalActivity[]): Promise<number> {
    return storage.addExternalActivityStats(items);
  }

  /** What storing these Garmin rows would add and change (nothing is written). */
  async planArchive(records: GarminRecord[]): Promise<ArchivePlan> {
    return storage.planGarminArchive(records);
  }

  /** Keeps the Garmin rows: new ones added, changed ones replaced, nothing duplicated. */
  async mergeArchive(records: GarminRecord[]): Promise<ArchivePlan> {
    return storage.mergeGarminArchive(records);
  }

  async archiveInfo(): Promise<ArchiveInfo> {
    return storage.getGarminArchiveInfo();
  }

  async clearArchive() {
    await storage.clearGarminArchive();
  }

  async remove(ids: string[]) {
    await storage.deleteExternalActivities(ids);
  }
}
