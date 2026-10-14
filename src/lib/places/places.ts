import type { WeatherLocation } from "../preferences/migrate";

/**
 * The places training happens at: your home, crags, gyms, anywhere else you go. One list, kept on the device
 * (where you are is not something that travels): the weather reads the ones with coordinates, a session points at
 * one by name, and the AI coach knows them. A place is known by its name (unique, ignoring case and spaces at the
 * ends), which is also what a session stores - so a session survives a place being deleted, and a second device
 * that has no such place still shows where it was.
 */

export const PLACE_KINDS = ["home", "crag", "gym", "other"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = { home: "Home", crag: "Crag", gym: "Gym", other: "Other" };

export interface Place {
  name: string;
  kind: PlaceKind;
  /** Both or neither: without them the place has no weather, but can still be picked. */
  latitude?: number;
  longitude?: number;
  /** Free text: "CHF 22 day pass", "free". */
  price?: string;
  /** Free text: "Mon-Fri 9-22, Sat-Sun 10-20". */
  hours?: string;
  /** Anything worth knowing: the code to the door, which wall dries first. */
  notes?: string;
}

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t.slice(0, max);
};

const coordinate = (v: unknown, limit: number): number | undefined => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit ? v : undefined);

/** The same place twice: names agree ignoring case and the spaces at the ends. */
export const samePlaceName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** One place from anything: nothing without a name; a kind outside the list becomes "other"; lone coordinates are dropped. */
export function validatePlace(raw: unknown): Place | null {
  if (raw === null || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const name = text(c.name, 80);
  if (!name) return null;
  const latitude = coordinate(c.latitude, 90);
  const longitude = coordinate(c.longitude, 180);
  const kind = PLACE_KINDS.includes(c.kind as PlaceKind) ? (c.kind as PlaceKind) : "other";
  const price = text(c.price, 80);
  const hours = text(c.hours, 200);
  const notes = text(c.notes, 1000);
  return {
    name,
    kind,
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    ...(price ? { price } : {}),
    ...(hours ? { hours } : {}),
    ...(notes ? { notes } : {}),
  };
}

/**
 * The list from what is stored: valid places, one per name, at most one home. Before places existed there were
 * `homeLocation` and `crags` (and, before those, `tripLocation`): they become the home and the crags.
 */
export function validatePlaces(raw: unknown, legacy?: { homeLocation?: unknown; crags?: unknown; tripLocation?: unknown }): Place[] {
  // What the old keys held always had coordinates; an entry without is not worth a place.
  const located = (v: unknown) => {
    const p = validatePlace(v);
    return p && hasCoordinates(p) ? p : null;
  };
  const oldCrags = Array.isArray(legacy?.crags) ? legacy.crags : legacy?.crags === undefined && legacy?.tripLocation ? [legacy.tripLocation] : [];
  const source: unknown[] = Array.isArray(raw)
    ? raw
    : [
        ...[located(legacy?.homeLocation)].filter(Boolean).map((p) => ({ ...p, kind: "home" })),
        ...oldCrags.map(located).filter(Boolean).map((p) => ({ ...p, kind: "crag" })),
      ];
  const result: Place[] = [];
  for (const entry of source) {
    const place = validatePlace(entry);
    if (!place || result.some((p) => samePlaceName(p.name, place.name))) continue;
    if (place.kind === "home" && result.some((p) => p.kind === "home")) place.kind = "other";
    result.push(place);
  }
  return result;
}

export const hasCoordinates = (p: Place): p is Place & { latitude: number; longitude: number } => p.latitude !== undefined && p.longitude !== undefined;

const asLocation = (p: Place & { latitude: number; longitude: number }): WeatherLocation => ({ name: p.name, latitude: p.latitude, longitude: p.longitude });

/** The home place as the weather wants it (`null` without one, or without coordinates). */
export function homeLocationOf(places: readonly Place[]): WeatherLocation | null {
  const home = places.find((p) => p.kind === "home" && hasCoordinates(p));
  return home && hasCoordinates(home) ? asLocation(home) : null;
}

/** The crags with coordinates, in the order of the list: what the Crags card and the outdoor Plan B forecast. */
export function cragLocationsOf(places: readonly Place[]): WeatherLocation[] {
  return places.filter((p) => p.kind === "crag").filter(hasCoordinates).map(asLocation);
}

/** The place a name points at, if it is one of them. */
export function placeByName(places: readonly Place[], name: string | undefined): Place | undefined {
  return name === undefined || name.trim() === "" ? undefined : places.find((p) => samePlaceName(p.name, name));
}

/** The list with the home set - or cleared: the home place then loses its coordinates, and goes altogether if nothing else was written about it. */
export function withHome(places: readonly Place[], location: WeatherLocation | null): Place[] {
  const old = places.find((p) => p.kind === "home");
  const others = places.filter((p) => p.kind !== "home" && !(location && samePlaceName(p.name, location.name)));
  if (!location) {
    if (!old) return others;
    const { latitude: _la, longitude: _lo, ...rest } = old;
    return old.price || old.hours || old.notes ? [rest, ...others] : others;
  }
  return [{ ...(old ?? {}), name: location.name, kind: "home", latitude: location.latitude, longitude: location.longitude }, ...others];
}

/** The list with its crags replaced by these (keeping what was written about a crag that stays); other places stay where they are. */
export function withCrags(places: readonly Place[], crags: readonly WeatherLocation[]): Place[] {
  const old = places.filter((p) => p.kind === "crag");
  const next: Place[] = [];
  for (const c of crags) {
    if (next.some((p) => samePlaceName(p.name, c.name))) continue;
    const before = old.find((p) => samePlaceName(p.name, c.name));
    next.push({ ...(before ?? { kind: "crag" as const }), name: c.name, kind: "crag", latitude: c.latitude, longitude: c.longitude });
  }
  // Crags keep their slots among the other places: the first crag takes the first crag slot, and so on.
  const result: Place[] = [];
  let i = 0;
  for (const p of places) {
    if (p.kind !== "crag") result.push(p);
    else if (i < next.length) result.push(next[i++]);
  }
  while (i < next.length) result.push(next[i++]);
  return result.filter((p, at) => !result.slice(0, at).some((q) => samePlaceName(q.name, p.name)));
}

/** A place renamed, or `null` when the new name is empty or taken by another place. */
export function renamedPlace(places: readonly Place[], from: string, to: string): Place[] | null {
  const name = to.trim();
  if (!name) return null;
  if (places.some((p) => !samePlaceName(p.name, from) && samePlaceName(p.name, name))) return null;
  return places.map((p) => (samePlaceName(p.name, from) ? { ...p, name } : p));
}

/** A place in one line, for lists and prompts: "Crag · CHF 12 · Mon-Fri 9-22". */
export function placeLine(p: Place): string {
  return [PLACE_KIND_LABELS[p.kind], p.price, p.hours].filter(Boolean).join(" · ");
}

/**
 * Coordinates from text as a map app copies them: "47.0502, 8.3093", "47.0502 8.3093", "47.0502,8.3093",
 * "N 47.0502 E 8.3093" or "47.0502\u00b0 N, 8.3093\u00b0 E". `null` when it is not a pair inside the valid ranges.
 */
export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  const text = input.trim().replace(/\u00b0/g, " ");
  const numbers = text.match(/-?\d+(?:[.,]\d+)?/g);
  if (!numbers || numbers.length !== 2) return null;
  let [latitude, longitude] = numbers.map((n) => Number(n.replace(",", ".")));
  // Letters give the hemisphere: S and W are negative.
  const south = /\bS\b/i.test(text) || /\d\s*S\b/i.test(text);
  const west = /\bW\b/i.test(text) || /\d\s*W\b/i.test(text);
  if (south) latitude = -Math.abs(latitude);
  if (west) longitude = -Math.abs(longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
