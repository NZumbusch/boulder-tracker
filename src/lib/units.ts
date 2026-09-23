/**
 * Display units. Everything is stored in one canonical unit (°C, kg, km/h,
 * Font grades); these helpers convert only at the edges - what's shown,
 * and what's typed back in.
 */

export type TemperatureUnit = "C" | "F";
export type WeightUnit = "kg" | "lb";
export type WindUnit = "kmh" | "mph";
export type GradeScale = "font" | "v";

export interface Units {
  temperature: TemperatureUnit;
  weight: WeightUnit;
  wind: WindUnit;
  grades: GradeScale;
}

export const DEFAULT_UNITS: Units = { temperature: "C", weight: "kg", wind: "kmh", grades: "font" };

export function validateUnits(raw: unknown): Units {
  const c = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    temperature: c.temperature === "F" ? "F" : "C",
    weight: c.weight === "lb" ? "lb" : "kg",
    wind: c.wind === "mph" ? "mph" : "kmh",
    grades: c.grades === "v" ? "v" : "font",
  };
}

const KG_PER_LB = 0.45359237;
const KMH_PER_MPH = 1.609344;

export function displayTemp(celsius: number, unit: TemperatureUnit): number {
  return unit === "F" ? (celsius * 9) / 5 + 32 : celsius;
}
/** A temperature as typed in `unit`, back to °C. */
export function toCelsius(value: number, unit: TemperatureUnit): number {
  return unit === "F" ? ((value - 32) * 5) / 9 : value;
}
export function temperatureUnit(unit: TemperatureUnit): string {
  return unit === "F" ? "°F" : "°C";
}
/** "12°" - rounded, in `unit`. */
export function formatTemp(celsius: number, unit: TemperatureUnit): string {
  return `${Math.round(displayTemp(celsius, unit))}°`;
}
/** A temperature difference (e.g. air above dew point) - scaled, not offset. */
export function formatTempDelta(celsiusDelta: number, unit: TemperatureUnit): string {
  return `${Math.round(unit === "F" ? (celsiusDelta * 9) / 5 : celsiusDelta)}°`;
}

export function displayWind(kmh: number, unit: WindUnit): number {
  return unit === "mph" ? kmh / KMH_PER_MPH : kmh;
}
export function windUnit(unit: WindUnit): string {
  return unit === "mph" ? "mph" : "km/h";
}

export function displayWeight(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}
/** A weight as typed in `unit`, back to kg. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}
/** "71.4 kg" / "157.4 lb", one decimal. */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${Math.round(displayWeight(kg, unit) * 10) / 10} ${unit}`;
}
