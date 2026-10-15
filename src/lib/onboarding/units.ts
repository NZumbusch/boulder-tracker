/**
 * Which units the welcome's Units step starts on, worked out from the phone's language and region
 * (`navigator.language`, e.g. "en-US"). Only a few places still use imperial units for everyday things; V-scale is the
 * boulder grade of the United States. The person can change every one of them on the same step.
 */
export interface UnitGuess {
  metric: boolean;
  grades: "font" | "v";
}

const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

/** The region of a BCP-47 tag ("en-US" -> "US", "zh-Hant-TW" -> "TW", "en" -> null). */
export function regionOf(locale: string | undefined | null): string | null {
  if (!locale) return null;
  const parts = locale.replace(/_/g, "-").split("-").slice(1);
  const region = parts.find((p) => /^[A-Za-z]{2}$/.test(p) || /^\d{3}$/.test(p));
  return region ? region.toUpperCase() : null;
}

export function unitsFromLocale(locale: string | undefined | null): UnitGuess {
  const region = regionOf(locale);
  // A bare "en" is most often a US phone, but guessing imperial wrongly is worse than guessing metric: metric is the default.
  const imperial = region !== null && IMPERIAL_REGIONS.has(region);
  return { metric: !imperial, grades: region === "US" ? "v" : "font" };
}
