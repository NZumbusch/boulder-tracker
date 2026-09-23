/**
 * A rough "will the rock have friction" rating from the weather - a rule
 * of thumb, not physics. What decides friction on rock is mostly how dry
 * the air is relative to the rock (the gap between temperature and dew
 * point: near zero, moisture condenses on the rock), relative humidity,
 * and temperature (skin and rubber both grip best cool). Wind helps by
 * drying things out. Recent rain overrides everything: wet rock is wet.
 *
 * Every threshold is a named constant here so tuning is a one-line change.
 */

/** Temperatures (°C) inside this band score full marks for temperature. */
export const IDEAL_TEMP_MIN_C = 0;
export const IDEAL_TEMP_MAX_C = 12;
/** Points lost per degree above / below the ideal band (out of 10). */
const HEAT_PENALTY_PER_C = 0.6;
const COLD_PENALTY_PER_C = 0.8;

/** Relative humidity (%) at or below which humidity scores full marks, and at or above which it scores nothing. */
export const HUMIDITY_GOOD_PCT = 40;
export const HUMIDITY_BAD_PCT = 90;

/** Temperature minus dew point (°C): at or above GOOD the air is dry; at or below BAD moisture is condensing. */
export const DEW_SPREAD_GOOD_C = 8;
export const DEW_SPREAD_BAD_C = 1;

/** Wind in this range (km/h) dries the rock without being miserable - a small bonus. */
const DRYING_WIND_MIN_KMH = 5;
const DRYING_WIND_MAX_KMH = 30;
const WIND_BONUS = 0.5;

/** Rain in the last 24 h (mm) at or above which rock counts as wet regardless of the air. */
export const WET_RAIN_MM = 5;
/** A wet rating never scores above this. */
const WET_SCORE_CAP = 2;

const WEIGHTS = { temp: 0.45, humidity: 0.3, dewSpread: 0.25 };

/** The personal part of the model (Settings -> Outdoor); defaults are the constants above. */
export interface FrictionConfig {
  idealMinC: number;
  idealMaxC: number;
  wetRainMm: number;
}

export const DEFAULT_FRICTION_CONFIG: FrictionConfig = {
  idealMinC: IDEAL_TEMP_MIN_C,
  idealMaxC: IDEAL_TEMP_MAX_C,
  wetRainMm: WET_RAIN_MM,
};

export type FrictionLabel = "Prime" | "Good" | "OK" | "Greasy" | "Wet";

export interface FrictionInputs {
  tempC: number;
  humidityPercent?: number;
  dewPointC?: number;
  windKmh?: number;
  /** Rain falling now, or in the hour being rated (mm). */
  precipitationMm?: number;
  /** Rain in the 24 h before (mm). */
  recentRainMm?: number;
}

export interface Friction {
  /** 0-10, one decimal. */
  score: number;
  label: FrictionLabel;
  /** The main thing holding the score down, when there is one - for the "why" on tap. */
  reason?: string;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Linear 10 -> 0 between `good` and `bad` (either direction). */
function ramp(value: number, good: number, bad: number): number {
  return clamp(((value - bad) / (good - bad)) * 10, 0, 10);
}

export function labelFor(score: number): Exclude<FrictionLabel, "Wet"> {
  if (score >= 8) return "Prime";
  if (score >= 6) return "Good";
  if (score >= 4) return "OK";
  return "Greasy";
}

export function rateFriction(inputs: FrictionInputs, config: FrictionConfig = DEFAULT_FRICTION_CONFIG): Friction {
  const { tempC, humidityPercent, dewPointC, windKmh, precipitationMm, recentRainMm } = inputs;
  const { idealMinC, idealMaxC, wetRainMm } = config;

  const tempScore = clamp(
    tempC > idealMaxC
      ? 10 - (tempC - idealMaxC) * HEAT_PENALTY_PER_C
      : tempC < idealMinC
        ? 10 - (idealMinC - tempC) * COLD_PENALTY_PER_C
        : 10,
    0,
    10,
  );

  // Missing inputs drop out of the weighting rather than counting as perfect or awful.
  const parts: { score: number; weight: number; name: string }[] = [{ score: tempScore, weight: WEIGHTS.temp, name: "temp" }];
  if (humidityPercent !== undefined) {
    parts.push({ score: ramp(humidityPercent, HUMIDITY_GOOD_PCT, HUMIDITY_BAD_PCT), weight: WEIGHTS.humidity, name: "humidity" });
  }
  if (dewPointC !== undefined) {
    parts.push({ score: ramp(tempC - dewPointC, DEW_SPREAD_GOOD_C, DEW_SPREAD_BAD_C), weight: WEIGHTS.dewSpread, name: "dew" });
  }
  const weightTotal = parts.reduce((s, p) => s + p.weight, 0);
  let score = parts.reduce((s, p) => s + p.score * p.weight, 0) / weightTotal;
  if (windKmh !== undefined && windKmh >= DRYING_WIND_MIN_KMH && windKmh <= DRYING_WIND_MAX_KMH) score += WIND_BONUS;
  score = Math.round(clamp(score, 0, 10) * 10) / 10;

  const raining = (precipitationMm ?? 0) > 0;
  const soaked = (recentRainMm ?? 0) >= wetRainMm;
  if (raining || soaked) {
    return {
      score: Math.min(score, WET_SCORE_CAP),
      label: "Wet",
      reason: raining ? "It's raining" : `${Math.round(recentRainMm!)} mm of rain in the last 24 h`,
    };
  }

  const worst = parts.reduce((a, b) => (b.score < a.score ? b : a));
  let reason: string | undefined;
  if (worst.score < 6) {
    if (worst.name === "temp") reason = tempC > idealMaxC ? "Warm" : "Very cold";
    else if (worst.name === "humidity") reason = "Humid";
    else reason = "Close to the dew point - moisture may condense on the rock";
  }
  return { score, label: labelFor(score), reason };
}

/**
 * A forecast day, rated from its daytime high, mean humidity and dew point,
 * strongest wind, and that day's own rain total (as the "recent rain").
 */
export function rateForecastDay(day: {
  tempMaxC: number;
  humidityMeanPercent?: number;
  dewPointMeanC?: number;
  windMaxKmh?: number;
  precipitationSumMm?: number;
}, config: FrictionConfig = DEFAULT_FRICTION_CONFIG): Friction {
  return rateFriction({
    tempC: day.tempMaxC,
    humidityPercent: day.humidityMeanPercent,
    dewPointC: day.dewPointMeanC,
    windKmh: day.windMaxKmh,
    recentRainMm: day.precipitationSumMm,
  }, config);
}
