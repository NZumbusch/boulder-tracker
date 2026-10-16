import { describe, it, expect } from "vitest";
import { awayFromSessions, eventColor, hueGap, parseHex, toHsl, fromHsl, SESSION_HEXES, MIN_HUE_GAP, NEUTRAL_HEX, EVENT_PALETTE } from "./eventColor";

const hueOf = (hex: string) => toHsl(parseHex(hex)!)[0];
const sessionHues = SESSION_HEXES.map(hueOf);
/** The smallest hue gap to any session colour. */
const nearest = (hex: string) => Math.min(...sessionHues.map((h) => hueGap(hueOf(hex), h)));

describe("colour maths", () => {
  it("reads hex, short or long, and nothing else", () => {
    expect(parseHex("#ff0000")).toEqual([255, 0, 0]);
    expect(parseHex("0f0")).toEqual([0, 255, 0]);
    expect(parseHex("red")).toBeUndefined();
    expect(parseHex(undefined)).toBeUndefined();
  });
  it("round-trips through hue, saturation and lightness", () => {
    for (const hex of ["#3b82f6", "#ef4444", "#10b981", "#eab308"]) expect(fromHsl(...toHsl(parseHex(hex)!))).toBe(hex);
  });
  it("measures hue gaps round the circle", () => {
    expect(hueGap(350, 10)).toBe(20);
    expect(hueGap(0, 180)).toBe(180);
  });
});

describe("awayFromSessions", () => {
  it("turns greens, teals, blues and reds away from the session colours", () => {
    for (const hex of ["#10b981", "#009688", "#22c55e", "#14b8a6", "#4caf50", "#0f9d58", "#3b82f6", "#039be5", "#ef4444", "#d50000", "#f4511e", "#e91e63", "#6366f1"]) {
      expect(nearest(awayFromSessions(hex))).toBeGreaterThanOrEqual(MIN_HUE_GAP - 1);
    }
  });
  it("leaves other colours and greys as they are", () => {
    for (const hex of ["#eab308", "#7e57c2", "#a855f7", "#84cc16", "#808080", "#e5e5e5"]) expect(awayFromSessions(hex)).toBe(hex);
  });
  it("moves a colour only as far as it has to, to the nearer free side", () => {
    const [h0] = toHsl(parseHex("#14b8a6")!);
    const [h1] = toHsl(parseHex(awayFromSessions("#14b8a6"))!);
    expect(hueGap(h0, h1)).toBeLessThan(110);
  });
  it("keeps the colour's own saturation and lightness, so it still looks like its calendar", () => {
    const [, s, l] = toHsl(parseHex("#009688")!);
    const [, s2, l2] = toHsl(parseHex(awayFromSessions("#009688"))!);
    expect(s2).toBeCloseTo(s, 1);
    expect(l2).toBeCloseTo(l, 1);
  });
  it("falls back to a neutral when there is no usable colour", () => {
    expect(awayFromSessions(undefined)).toBe(NEUTRAL_HEX);
    expect(awayFromSessions("nonsense")).toBe(NEUTRAL_HEX);
  });
  it("the picker's palette needs no turning away", () => {
    for (const hex of EVENT_PALETTE) expect(nearest(hex) >= MIN_HUE_GAP || toHsl(parseHex(hex)!)[1] < 0.15).toBe(true);
  });
});

describe("eventColor", () => {
  it("uses the colour picked for the calendar exactly, even a green", () => {
    expect(eventColor({ calendarId: "1", color: "#3b82f6" }, { "1": "#10b981" })).toBe("#10b981");
  });
  it("ignores a picked value that is not a colour", () => {
    expect(eventColor({ calendarId: "1", color: "#eab308" }, { "1": "nope" })).toBe("#eab308");
  });
  it("prefers the event's own colour over its calendar's, and turns a clashing one away", () => {
    expect(eventColor({ calendarId: "1", color: "#eab308" }, {}, "#3b82f6")).toBe("#eab308");
    expect(eventColor({ calendarId: "1" }, {}, "#eab308")).toBe("#eab308");
    expect(nearest(eventColor({ calendarId: "1", color: "#14b8a6" }, {}))).toBeGreaterThanOrEqual(MIN_HUE_GAP - 1);
    expect(nearest(eventColor({ calendarId: "1", color: "#ef4444" }, {}, "#3b82f6"))).toBeGreaterThanOrEqual(MIN_HUE_GAP - 1);
  });
});
