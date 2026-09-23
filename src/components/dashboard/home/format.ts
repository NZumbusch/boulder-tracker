import { trainingState } from '../../../lib/state.svelte';
import { formatTemp } from '../../../lib/units';
import { displayGrade } from '../../../lib/sends/gradeScale';
import { rateFriction, rateForecastDay, type Friction, type FrictionLabel } from '../../../lib/weather/friction';
import type { DailyForecastDay, WeatherSnapshot } from '../../../lib/weather/api';

/** Display helpers shared by the Home cards. They read `trainingState` when called, so templates stay reactive. */

/**
 * Joins the parts of a one-line summary with " · ", skipping empty ones.
 * Built in code on purpose: written in markup, a " · " at the edge of an
 * {#if} block loses its surrounding spaces ("min·6 exercises").
 */
export function joinParts(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

export function formatRelativeAge(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** A °C value in the chosen temperature unit, as "12°". */
export const T = (celsius: number) => formatTemp(celsius, trainingState.units.temperature);

/** A stored (Font) grade in the chosen display scale. */
export const G = (grade: string | undefined) => (grade ? displayGrade(grade, trainingState.units.grades) : '');

// --- Friction / conditions (see lib/weather/friction.ts for the model) ---
export const FRICTION_STYLE: Record<FrictionLabel, { badge: string; dot: string; text: string }> = {
  Prime: { badge: 'bg-status-good/15 text-status-good border-status-good/30', dot: 'bg-status-good', text: 'text-status-good' },
  Good: { badge: 'bg-status-good/10 text-status-good border-status-good/20', dot: 'bg-status-good/60', text: 'text-status-good' },
  OK: { badge: 'bg-status-caution/15 text-status-caution border-status-caution/30', dot: 'bg-status-caution', text: 'text-status-caution' },
  Greasy: { badge: 'bg-status-risk/15 text-status-risk border-status-risk/30', dot: 'bg-status-risk', text: 'text-status-risk' },
  Wet: { badge: 'bg-primary/15 text-primary border-primary/30', dot: 'bg-primary', text: 'text-primary' },
};

export function currentFriction(w: WeatherSnapshot): Friction {
  return rateFriction({
    tempC: w.currentTempC,
    humidityPercent: w.humidityPercent,
    dewPointC: w.dewPointC,
    windKmh: w.windSpeedKmh,
    precipitationMm: w.precipitationMm,
    recentRainMm: w.recentRain?.last24hMm,
  }, trainingState.frictionConfig);
}

export const dayFriction = (day: DailyForecastDay): Friction => rateForecastDay(day, trainingState.frictionConfig);

/** A conditions badge's text - the word, the score, or both, as the two weather options say. */
export function frictionText(f: Friction): string {
  return joinParts(
    trainingState.homeDetails['weather.frictionWord'] && f.label,
    trainingState.homeDetails['weather.frictionNumber'] && f.score.toFixed(1),
  );
}
