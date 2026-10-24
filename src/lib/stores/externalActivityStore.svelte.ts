import { storage } from '../storage';
import type { ExternalActivity } from '../types';

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

  async remove(ids: string[]) {
    await storage.deleteExternalActivities(ids);
  }
}
