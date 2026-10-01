import { storage } from '../storage';
import { DEFAULT_ANALYTICS_CATEGORIES } from '../constants';
import { restoreDefaultCategories } from '../exercise/categories';
import type { ExerciseTypeDef, AnalyticsCategory, BenchmarkTypeDef, PhaseDef } from '../types';

/**
 * The archivable definition/catalog registries ("what can be tracked" is
 * data): exercise types, analytics categories, benchmark types, and
 * macrocycle phases. Distinct from
 * `benchmarkStore`, which holds the actual logged `Benchmark` records
 * ("what was tracked").
 */
export class CatalogStore {
  exerciseTypes = $state<ExerciseTypeDef[]>([]);
  analyticsCategories = $state<AnalyticsCategory[]>([]);
  benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  phaseDefs = $state<PhaseDef[]>([]);

  async load() {
    const [exerciseTypes, analyticsCategories, benchmarkTypes, phaseDefs] = await Promise.all([
      storage.getExerciseTypes(),
      storage.getAnalyticsCategories(),
      storage.getBenchmarkTypes(),
      storage.getPhaseDefs(),
    ]);
    this.exerciseTypes = exerciseTypes;
    this.analyticsCategories = analyticsCategories;
    this.benchmarkTypes = benchmarkTypes;
    this.phaseDefs = phaseDefs;
  }

  async updateExerciseTypes(types: ExerciseTypeDef[]) {
    await storage.saveExerciseTypes(types);
  }

  /** Puts the built-in analytics categories back as shipped; your own stay (see `restoreDefaultCategories`). */
  async restoreDefaultCategories() {
    const restored = restoreDefaultCategories($state.snapshot(this.analyticsCategories), DEFAULT_ANALYTICS_CATEGORIES);
    await storage.saveAnalyticsCategories(restored);
    this.analyticsCategories = restored;
  }
}
