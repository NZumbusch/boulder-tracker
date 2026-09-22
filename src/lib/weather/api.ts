/**
 * Open-Meteo fetch wrappers (UI_PLAN.md §5.5) - the only network dependency
 * in an otherwise fully local-first app. No API key needed for
 * non-commercial use. Deliberately isolated in their own module, calling
 * the global `fetch` directly with no other side effects, so
 * `weatherStore.svelte.ts` (the caller, which owns caching/staleness/error
 * handling) can mock this module in tests rather than mocking `fetch`
 * itself.
 */

export interface GeocodeResult {
  name: string;
  /** e.g. "DE" - used to build a short display label like "Munich, DE". */
  countryCode?: string;
  latitude: number;
  longitude: number;
}

export interface DailyForecastDay {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  /** Peak chance of rain that day, 0-100. Optional - see `WeatherSnapshot`. */
  precipitationChance?: number;
}

/**
 * Everything the app knows about one location's weather.
 *
 * The fields beyond temperature and code are all optional, and must stay
 * that way: snapshots are cached in `localStorage` (`weatherStore`), so a
 * cache written by an older build is read back by a newer one. Optional
 * means such a snapshot still renders, just with less detail, instead of
 * failing validation and throwing away the last known conditions.
 */
export interface WeatherSnapshot {
  currentTempC: number;
  currentWeatherCode: number;
  /** "Feels like" - wind chill and humidity applied. */
  feelsLikeC?: number;
  /** Relative humidity, 0-100. The number that decides whether rock has any friction. */
  humidityPercent?: number;
  windSpeedKmh?: number;
  /** Rain in the last hour, mm. */
  precipitationMm?: number;
  /** Daylight flag, for showing whether "now" is day or night. */
  isDay?: boolean;
  /** Today first, six days after - Open-Meteo's own default forecast window. */
  daily: DailyForecastDay[];
}

/**
 * City name -> candidate locations, via Open-Meteo's geocoding endpoint.
 * Called once, at the moment the user sets a location (UI_PLAN.md §5.5) -
 * normal day-to-day operation never calls this, only `fetchWeatherSnapshot`.
 * Returns an empty array (never throws) on a network failure or an
 * unrecognised city name - the caller decides how to present "no matches".
 */
export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.results)) return [];

    return data.results
      .filter((r: any) => typeof r?.latitude === 'number' && typeof r?.longitude === 'number' && typeof r?.name === 'string')
      .map((r: any) => ({
        name: r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
        countryCode: typeof r.country_code === 'string' ? r.country_code : undefined,
        latitude: r.latitude,
        longitude: r.longitude,
      }));
  } catch {
    return [];
  }
}

/** Reads a number only if it really is one - an absent or malformed extra must not become `NaN` downstream. */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Current conditions + a 7-day daily forecast for one lat/lon, via Open-
 * Meteo's forecast endpoint.
 *
 * Uses the unified `current=` parameter rather than the older
 * `current_weather=true` flag. That choice was previously the other way
 * round, on the grounds that the newer parameter's field names were
 * "less certain without a live call to verify against" - so the call was
 * made (2026-09-22) and every field below was read off a real response.
 * `current_weather=true` only ever returned temperature, wind and a code;
 * humidity and apparent temperature, which are the two things that
 * actually decide whether rock has friction, are only available this way.
 *
 * Only temperature, weather code and the daily arrays are required. Every
 * other field is optional, so a partial response still produces a usable
 * snapshot rather than none at all. Returns `null` (never throws) on any
 * network failure or unusable response shape - the caller falls back to a
 * cached snapshot or an "absent" state, per §5.5's "must degrade to
 * absent, never broken."
 */
export async function fetchWeatherSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot | null> {
  try {
    const current = [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
      'precipitation', 'weather_code', 'wind_speed_10m', 'is_day',
    ].join(',');
    const daily = [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_probability_max',
    ].join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=${current}&daily=${daily}&temperature_unit=celsius&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const now = data?.current;
    const days = data?.daily;
    if (
      typeof now?.temperature_2m !== 'number' ||
      typeof now?.weather_code !== 'number' ||
      !Array.isArray(days?.time) ||
      !Array.isArray(days?.weather_code) ||
      !Array.isArray(days?.temperature_2m_max) ||
      !Array.isArray(days?.temperature_2m_min)
    ) {
      return null;
    }

    const forecast: DailyForecastDay[] = days.time.map((date: string, i: number) => ({
      date,
      weatherCode: days.weather_code[i],
      tempMaxC: days.temperature_2m_max[i],
      tempMinC: days.temperature_2m_min[i],
      precipitationChance: optionalNumber(days.precipitation_probability_max?.[i]),
    }));

    return {
      currentTempC: now.temperature_2m,
      currentWeatherCode: now.weather_code,
      feelsLikeC: optionalNumber(now.apparent_temperature),
      humidityPercent: optionalNumber(now.relative_humidity_2m),
      windSpeedKmh: optionalNumber(now.wind_speed_10m),
      precipitationMm: optionalNumber(now.precipitation),
      isDay: now.is_day === undefined ? undefined : now.is_day === 1,
      daily: forecast,
    };
  } catch {
    return null;
  }
}
