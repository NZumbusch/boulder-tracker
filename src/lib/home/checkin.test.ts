import { describe, it, expect } from "vitest";
import { checkinDue, loadCheckinDone, markCheckinDone } from "./checkin";

const sunday = new Date(2026, 9, 11, 12);   // W41
const wednesday = new Date(2026, 9, 7, 12); // W41

describe("checkinDue", () => {
  it("shows from the chosen day to the end of the week", () => {
    expect(checkinDue(sunday, 7, undefined, true)).toBe(true);
    expect(checkinDue(wednesday, 7, undefined, true)).toBe(false);
    expect(checkinDue(wednesday, 3, undefined, true)).toBe(true);
    expect(checkinDue(wednesday, 5, undefined, true)).toBe(false);
  });
  it("is off at 0, hidden once done this week, and needs some sessions", () => {
    expect(checkinDue(sunday, 0, undefined, true)).toBe(false);
    expect(checkinDue(sunday, 7, "2026-W41", true)).toBe(false);
    expect(checkinDue(sunday, 7, "2026-W40", true)).toBe(true);
    expect(checkinDue(sunday, 7, undefined, false)).toBe(false);
  });
  it("remembers the week it was done", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadCheckinDone(store)).toBeUndefined();
    markCheckinDone("2026-W41", store);
    expect(loadCheckinDone(store)).toBe("2026-W41");
  });
});
