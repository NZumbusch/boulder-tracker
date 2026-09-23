import type { WeatherLocation } from '../preferences/migrate';
import { fetchWeatherSnapshot, type WeatherSnapshot } from '../weather/api';

const CACHE_KEY = 'boulder_tracker_weather_cache';

interface CachedEntry {
  snapshot: WeatherSnapshot;
  fetchedAt: string;
  locationName: string;
}

interface CacheShape {
  home?: CachedEntry;
  /** Keyed by crag name. (An older build also wrote `trip`; it is simply ignored now.) */
  crags?: Record<string, CachedEntry>;
  /** The next trip's location, when it's close enough to have a forecast. */
  goal?: CachedEntry;
}

export interface WeatherState {
  snapshot: WeatherSnapshot | null;
  /** ISO timestamp of the snapshot's fetch, for "last updated Xh ago" labelling. */
  fetchedAt: string | null;
  locationName: string | null;
  /** True once any fetch has succeeded, cleared only by a newer successful fetch - never re-fetched implicitly. */
  stale: boolean;
  loading: boolean;
  /** True once a fetch has failed with nothing cached to fall back on - the one genuinely "absent" state - weather degrades to absent, never broken. */
  unavailable: boolean;
}

function emptyState(): WeatherState {
  return { snapshot: null, fetchedAt: null, locationName: null, stale: false, loading: false, unavailable: false };
}

/**
 * Weather - the app's one network dependency, isolated
 * behind `src/lib/weather/api.ts`'s pure fetch wrappers so this store only
 * ever deals with already-shaped data or `null`. Caches the last
 * successful snapshot per location (home and each crag) in `localStorage` with its
 * fetch timestamp, so a cold app start while offline shows the last known
 * conditions labelled as stale rather than a blank card or an indefinite
 * spinner - the stash's `Dashboard.svelte` did the latter, explicitly
 * flagged in the stash audit as a pattern not to repeat.
 */
export class WeatherStore {
  home = $state<WeatherState>(emptyState());
  /** One entry per crag, in the same order as `Preferences.crags`. */
  crags = $state<WeatherState[]>([]);
  private cachedCrags: Record<string, CachedEntry> = {};
  /** Conditions at the next trip's location - see `loadGoal`. */
  goal = $state<WeatherState>(emptyState());

  constructor() {
    this.loadCache();
  }

  private loadCache() {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    try {
      const cache: CacheShape = JSON.parse(raw);
      if (cache.home) this.home = cachedEntryToState(cache.home);
      if (cache.goal) this.goal = cachedEntryToState(cache.goal);
      if (cache.crags && typeof cache.crags === 'object') this.cachedCrags = cache.crags;
      // The old single trip location became the first crag (see migratePreferences);
      // its cached forecast carries over so that crag isn't blank offline.
      const trip = (cache as { trip?: CachedEntry }).trip;
      if (trip?.locationName && !this.cachedCrags[trip.locationName]) this.cachedCrags[trip.locationName] = trip;
    } catch {
      // Corrupt cache - ignore and start from an empty (not "unavailable") state; the next successful fetch repopulates it.
    }
  }

  private persistCache(update: (cache: CacheShape) => void) {
    if (typeof localStorage === 'undefined') return;
    let cache: CacheShape = {};
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      cache = raw ? JSON.parse(raw) : {};
    } catch {
      cache = {};
    }
    update(cache);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }

  async loadHome(location: WeatherLocation | null) {
    await this.load('home', location);
  }

  /**
   * Fetches every crag in parallel. Each starts from its own cached
   * snapshot (stale until this fetch lands), so the card fills in offline.
   * Crags no longer in the list are dropped from the cache.
   */
  async loadCrags(locations: WeatherLocation[]) {
    this.crags = locations.map((loc) => {
      const cached = this.cachedCrags[loc.name];
      return cached ? cachedEntryToState(cached) : emptyState();
    });
    const results = await Promise.all(locations.map((loc, i) => fetchState(loc, this.crags[i])));
    this.crags = results.map((r) => r.state);
    const kept: Record<string, CachedEntry> = {};
    results.forEach((r, i) => {
      const entry = r.entry ?? this.cachedCrags[locations[i].name];
      if (entry) kept[locations[i].name] = entry;
    });
    this.cachedCrags = kept;
    this.persistCache((cache) => { cache.crags = kept; delete (cache as any).trip; });
  }

  /**
   * Fetches the next trip's location (or clears it with `null`). A cached
   * snapshot for a different place is dropped rather than shown under the
   * wrong name.
   */
  async loadGoal(location: WeatherLocation | null) {
    if (this.goal.locationName && this.goal.locationName !== location?.name) this.goal = emptyState();
    await this.load('goal', location);
  }

  private async load(key: 'home' | 'goal', location: WeatherLocation | null) {
    if (!location) {
      this[key] = emptyState();
      return;
    }
    this[key] = { ...this[key], loading: true };
    const { state, entry } = await fetchState(location, this[key]);
    this[key] = state;
    if (entry) this.persistCache((cache) => { cache[key] = entry; });
  }
}

/** One fetch for one location: the new state, plus the cache entry to write when the fetch succeeded. */
async function fetchState(location: WeatherLocation, current: WeatherState): Promise<{ state: WeatherState; entry?: CachedEntry }> {
  const snapshot = await fetchWeatherSnapshot(location.latitude, location.longitude);
  if (snapshot) {
    const fetchedAt = new Date().toISOString();
    return {
      state: { snapshot, fetchedAt, locationName: location.name, stale: false, loading: false, unavailable: false },
      entry: { snapshot, fetchedAt, locationName: location.name },
    };
  }
  // Fetch failed: keep anything we had, marked stale; otherwise the one genuinely absent state.
  if (current.snapshot) return { state: { ...current, loading: false, stale: true } };
  return { state: { ...emptyState(), unavailable: true } };
}

function cachedEntryToState(entry: CachedEntry): WeatherState {
  return {
    snapshot: entry.snapshot,
    fetchedAt: entry.fetchedAt,
    locationName: entry.locationName,
    // Anything read from a previous session's cache is unconfirmed until this session's own fetch succeeds.
    stale: true,
    loading: false,
    unavailable: false,
  };
}
