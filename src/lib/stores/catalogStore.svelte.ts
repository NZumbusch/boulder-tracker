import { storage } from '../storage';
import { DEFAULT_ANALYTICS_CATEGORIES } from '../constants';
import { restoreDefaultCategories } from '../exercise/categories';
import type { ExerciseTypeDef, AnalyticsCategory, BenchmarkTypeDef, PhaseDef, ValueDef } from '../types';

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
  valueDefs = $state<ValueDef[]>([]);

  async load() {
    const [exerciseTypes, analyticsCategories, benchmarkTypes, phaseDefs, valueDefs] = await Promise.all([
      storage.getExerciseTypes(),
      storage.getAnalyticsCategories(),
      storage.getBenchmarkTypes(),
      storage.getPhaseDefs(),
      storage.getValueDefs(),
    ]);
    this.exerciseTypes = exerciseTypes;
    this.analyticsCategories = analyticsCategories;
    this.benchmarkTypes = benchmarkTypes;
    this.phaseDefs = phaseDefs;
    this.valueDefs = valueDefs;
  }

  async saveValueDefs(defs: ValueDef[]) {
    await storage.saveValueDefs(defs);
    this.valueDefs = defs;
  }

  /** Removes a value type and every trace of it; the caller refreshes the rest of the app. */
  async deleteValueDef(id: string): Promise<number> {
    return storage.deleteValueDef(id);
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
