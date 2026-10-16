import { describe, it, expect } from "vitest";
import { buildPastSession, pastSessionProblem, defaultPastDay } from "./pastSession";

const now = new Date(2026, 9, 16, 20, 0); // Friday 16 Oct 2026, 20:00 (2026-W42)

describe("buildPastSession", () => {
  it("builds a done session on that day, in the right week and weekday", () => {
    const w = buildPastSession({ id: "x", day: "2026-10-12", time: "18:30" }, now)!;
    expect(w.status).toBe("completed");
    expect(w.weekId).toBe("2026-W42");
    expect(w.dayOfWeek).toBe("Monday");
    expect(w.startTime).toBe("18:30");
    const d = new Date(w.date!);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 12, 18, 30]);
    expect(w.exercises).toEqual([]);
    expect(w.loadFactor).toBe(0);
  });

  it("uses midday without a time, and leaves startTime unset", () => {
    const w = buildPastSession({ id: "x", day: "2026-10-11" }, now)!;
    expect(new Date(w.date!).getHours()).toBe(12);
    expect(w.startTime).toBeUndefined();
    expect(w.dayOfWeek).toBe("Sunday");
    expect(w.weekId).toBe("2026-W41"); // a Sunday belongs to the week before
  });

  it("is today allowed while the time has passed, not when it is still to come", () => {
    expect(buildPastSession({ id: "x", day: "2026-10-16", time: "08:00" }, now)).not.toBeNull();
    expect(buildPastSession({ id: "x", day: "2026-10-16", time: "21:00" }, now)).toBeNull();
  });

  it("refuses the future and nonsense", () => {
    expect(buildPastSession({ id: "x", day: "2026-10-20" }, now)).toBeNull();
    expect(buildPastSession({ id: "x", day: "" }, now)).toBeNull();
    expect(pastSessionProblem("2026-10-20", undefined, now)).toMatch(/future/);
    expect(pastSessionProblem("nope", undefined, now)).toMatch(/Pick/);
    expect(pastSessionProblem("2026-10-12", "18:30", now)).toBeNull();
  });

  it("carries the block and a name", () => {
    const w = buildPastSession({ id: "x", day: "2026-10-12", blockId: "b1", notes: "Board" }, now)!;
    expect(w.blockId).toBe("b1");
    expect(w.notes).toBe("Board");
  });
});

describe("defaultPastDay", () => {
  it("is yesterday", () => {
    expect(defaultPastDay(now)).toBe("2026-10-15");
    expect(defaultPastDay(new Date(2026, 0, 1, 0, 30))).toBe("2025-12-31");
  });
});
