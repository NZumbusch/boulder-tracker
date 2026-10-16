import type { DeviceEvent } from "./deviceEvents";

/*
 * The colour a phone-calendar event gets on the Plan calendar. Sessions are
 * one colour (emerald), so an event that arrives in a similar green or teal is
 * turned away from it - hue only, so it stays recognisably its own calendar's.
 * A colour you picked yourself in Settings is used exactly as chosen.
 */

/** The colour of a done session (Tailwind emerald-500; `bg-emerald-500`). */
export const SESSION_HEX = "#10b981";
/** The status colours of sessions (`planning/sessionColors.ts`: green done, blue to do, red missed). */
export const SESSION_HEXES: readonly string[] = [SESSION_HEX, "#3b82f6", "#ef4444"];
/** The colour of an event with none. */
export const NEUTRAL_HEX = "#71717a";
/** How many degrees of hue an automatic event colour keeps from each session colour at least. */
export const MIN_HUE_GAP = 30;

/** [r, g, b] of "#RRGGBB" (also "#RGB"), or undefined for anything else. */
export function parseHex(hex: string | undefined): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((hex ?? "").trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Hue (0-360), saturation and lightness (0-1). */
export function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function fromHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}

/** Degrees between two hues, 0-180. */
export const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/**
 * `hex` with its hue moved to the nearest hue outside every band of `gap` degrees around the session colours' hues,
 * when it is inside one. Greys (barely any saturation) have no hue to clash and are left alone.
 */
export function awayFromSessions(hex: string | undefined, sessionHexes: readonly string[] = SESSION_HEXES, gap = MIN_HUE_GAP): string {
  const rgb = parseHex(hex);
  if (!rgb) return NEUTRAL_HEX;
  const [h, s, l] = toHsl(rgb);
  const hues = sessionHexes.map((x) => toHsl(parseHex(x)!)[0]);
  const clashes = (x: number) => hues.some((sh) => hueGap(x, sh) < gap);
  if (s < 0.15 || !clashes(h)) return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  // Walk outwards a degree at a time, both ways; the nearer free hue wins (the warmer-to-bluer side on a tie).
  for (let d = 1; d <= 180; d++) {
    for (const x of [(h + d) % 360, (h - d + 360) % 360]) if (!clashes(x)) return fromHsl(x, s, l);
  }
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** An event's fill: its colour mixed far towards white - a light pastel, so every phone event sits back from the sessions (the edge keeps the full colour). */
export const paleEvent = (color: string): string => `color-mix(in srgb, ${color} 32%, white)`;

/** What the picker offers: a spread of hues that are none of the session colours (green, blue, red). */
export const EVENT_PALETTE = ["#eab308", "#a16207", "#84cc16", "#65a30d", "#8b5cf6", "#a855f7", "#d946ef", "#c026d3", "#78716c", "#57534e"];

/**
 * The colour of an event: the one you picked for its calendar, else its own, else its calendar's - the last two
 * kept clear of the session colour.
 */
export function eventColor(event: Pick<DeviceEvent, "color" | "calendarId">, calendarColors: Record<string, string>, calendarColor?: string): string {
  const picked = calendarColors[event.calendarId];
  if (parseHex(picked)) return picked;
  return awayFromSessions(event.color ?? calendarColor);
}
