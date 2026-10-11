/**
 * Open-Meteo fetch wrappers - the only network dependency
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

import { summarizeRecentRain, type HourlyPoint, type RecentRain } from './conditions';

export interface DailyForecastDay {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  /** Peak chance of rain that day, 0-100. Optional - see `WeatherSnapshot`. */
  precipitationChance?: number;
  /** Total rain that day, mm. */
  precipitationSumMm?: number;
  humidityMeanPercent?: number;
  dewPointMeanC?: number;
  windMaxKmh?: number;
  /** Local "YYYY-MM-DDTHH:MM". */
  sunset?: string;
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
  /** Dew point, °C - the gap between it and the temperature is what decides friction (see `weather/friction.ts`). */
  dewPointC?: number;
  windGustsKmh?: number;
  uvIndex?: number;
  /** The location's local time of this reading, "YYYY-MM-DDTHH:MM" - what "today" and "upcoming hours" are measured from. */
  localTime?: string;
  /** Rain over the 72 hours before now. */
  recentRain?: RecentRain;
  /** The next 24 hours, oldest first, local time. */
  hours?: HourlyPoint[];
  /** Today first, six days after - Open-Meteo's own default forecast window. */
  daily: DailyForecastDay[];
}

/**
 * City name -> candidate locations, via Open-Meteo's geocoding endpoint.
 * Called once, at the moment the user sets a location -
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
 * `current_weather=true` flag: that one only returns temperature, wind and a
 * code, while humidity and apparent temperature - the two things that
 * actually decide whether rock has friction - are only available through
 * `current=`. The field names below were checked against a real response.
 *
 * Only temperature, weather code and the daily arrays are required. Every
 * other field is optional, so a partial response still produces a usable
 * snapshot rather than none at all. Returns `null` (never throws) on any
 * network failure or unusable response shape - the caller falls back to a
 * cached snapshot or an "absent" state - weather degrades to absent,
 * never broken.
 */
export async function fetchWeatherSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot | null> {
  try {
    const current = [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
      'precipitation', 'weather_code', 'wind_speed_10m', 'is_day',
      'dew_point_2m', 'wind_gusts_10m', 'uv_index',
    ].join(',');
    const daily = [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_probability_max', 'precipitation_sum',
      'relative_humidity_2m_mean', 'dew_point_2m_mean', 'wind_speed_10m_max', 'sunset',
    ].join(',');
    // Hourly: the 72 h before now (rain history - whether rock is still
    // drying) and the 24 h ahead (today's best window). past_hours and
    // forecast_hours bound the hourly series without touching the daily one.
    const hourly = [
      'temperature_2m', 'dew_point_2m', 'relative_humidity_2m',
      'precipitation', 'precipitation_probability', 'wind_speed_10m',
    ].join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=${current}&daily=${daily}&hourly=${hourly}&past_hours=72&forecast_hours=24&temperature_unit=celsius&timezone=auto&forecast_days=7`;
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
      precipitationSumMm: optionalNumber(days.precipitation_sum?.[i]),
      humidityMeanPercent: optionalNumber(days.relative_humidity_2m_mean?.[i]),
      dewPointMeanC: optionalNumber(days.dew_point_2m_mean?.[i]),
      windMaxKmh: optionalNumber(days.wind_speed_10m_max?.[i]),
      sunset: typeof days.sunset?.[i] === 'string' ? days.sunset[i] : undefined,
    }));

    const localTime = typeof now.time === 'string' ? now.time : undefined;
    const { recentRain, hours } = splitHourly(data?.hourly, localTime);

    return {
      currentTempC: now.temperature_2m,
      currentWeatherCode: now.weather_code,
      feelsLikeC: optionalNumber(now.apparent_temperature),
      humidityPercent: optionalNumber(now.relative_humidity_2m),
      windSpeedKmh: optionalNumber(now.wind_speed_10m),
      precipitationMm: optionalNumber(now.precipitation),
      isDay: now.is_day === undefined ? undefined : now.is_day === 1,
      dewPointC: optionalNumber(now.dew_point_2m),
      windGustsKmh: optionalNumber(now.wind_gusts_10m),
      uvIndex: optionalNumber(now.uv_index),
      localTime,
      recentRain,
      hours,
      daily: forecast,
    };
  } catch {
    return null;
  }
}

/**
 * Splits Open-Meteo's hourly series at the current hour: the hours before
 * become the recent-rain summary, the hours from now on the upcoming
 * forecast. Both absent when the series (or the current time) is missing
 * or malformed - a partial response still yields a snapshot.
 */
function splitHourly(raw: any, localTime: string | undefined): { recentRain?: RecentRain; hours?: HourlyPoint[] } {
  if (!localTime || !Array.isArray(raw?.time) || !Array.isArray(raw?.temperature_2m)) return {};
  const currentHour = `${localTime.slice(0, 13)}:00`;
  const points: HourlyPoint[] = [];
  raw.time.forEach((time: unknown, i: number) => {
    const tempC = optionalNumber(raw.temperature_2m[i]);
    if (typeof time !== 'string' || tempC === undefined) return;
    points.push({
      time,
      tempC,
      dewPointC: optionalNumber(raw.dew_point_2m?.[i]),
      humidityPercent: optionalNumber(raw.relative_humidity_2m?.[i]),
      precipitationMm: optionalNumber(raw.precipitation?.[i]),
      precipitationChance: optionalNumber(raw.precipitation_probability?.[i]),
      windKmh: optionalNumber(raw.wind_speed_10m?.[i]),
    });
  });
  const past = points.filter((p) => p.time < currentHour);
  const upcoming = points.filter((p) => p.time >= currentHour);
  return {
    recentRain: past.length > 0 ? summarizeRecentRain(past) : undefined,
    hours: upcoming.length > 0 ? upcoming : undefined,
  };
}
