import { describe, it, expect } from "vitest";
import { acwrZoneOf, buildWidgetSnapshot, localIsoDate } from "./widgetSnapshot";
import type { Workout } from "../types";

const workout = (notes: string, extra: Partial<Workout> = {}): Workout =>
  ({ id: notes, status: "planned", date: null, notes, exercises: [], ...extra }) as Workout;

describe("widget snapshot", () => {
  it("dates by the phone's calendar, not UTC", () => {
    expect(localIsoDate(new Date(2026, 8, 25, 23, 59))).toBe("2026-09-25");
    expect(localIsoDate(new Date(2026, 0, 3, 0, 1))).toBe("2026-01-03");
  });

  it("carries readiness, each day's sessions and the running session", () => {
    const now = new Date(2026, 8, 25, 8, 0);
    const snap = buildWidgetSnapshot({
      now,
      readiness: { score: 71.6, status: "good" } as never,
      days: [
        { date: "2026-09-25", planned: [workout("Board", { startTime: "18:00", plannedDuration: 90 })], done: 1 },
        { date: "2026-09-26", planned: [], done: 0 },
      ],
      exerciseTypes: [],
      active: { name: "Board", settled: 1, total: 4, paused: false, elapsedMs: 60_000 },
    });
    expect(snap.readiness).toEqual({ date: "2026-09-25", score: 72, status: "good" });
    expect(snap.days[0]).toEqual({ date: "2026-09-25", done: 1, planned: [{ name: "Board", time: "18:00", minutes: 90, exercises: 0 }] });
    expect(snap.active?.settled).toBe(1);
    expect(snap.updatedAt).toBe(now.getTime());
  });

  it("names an unnamed session, and has no score before anything is logged", () => {
    const snap = buildWidgetSnapshot({
      now: new Date(2026, 8, 25),
      readiness: { score: undefined, status: "neutral" } as never,
      days: [{ date: "2026-09-25", planned: [workout("  ")], done: 0 }],
      exerciseTypes: [],
      active: null,
    });
    expect(snap.days[0].planned[0].name).toBe("Session");
    expect(snap.readiness.score).toBeNull();
  });

  it("hides the readiness score when asked, and carries the week and quick-log through", () => {
    const week = { strip: [{ status: "done" as const }, { status: "planned" as const, today: true as const }], load: 120, done: 1, planned: 3, progress: 0.4, acwr: { ratio: 1.1, zone: "sweet" as const } };
    const snap = buildWidgetSnapshot({
      now: new Date(2026, 8, 25),
      readiness: { score: 80, status: "good" } as never,
      days: [],
      exerciseTypes: [],
      active: null,
      week,
      quickLog: ["pain", "send"],
      hideReadiness: true,
    });
    expect(snap.readiness).toEqual({ date: "2026-09-25", score: null, status: "neutral" });
    expect(snap.week).toEqual(week);
    expect(snap.quickLog).toEqual(["pain", "send"]);
  });

  it("puts an ACWR ratio in its zone by the given thresholds", () => {
    const zones = { sweetMin: 0.8, caution: 1.3, highRisk: 1.5 };
    expect(["0.5", "0.8", "1.3", "1.31", "1.5", "1.51"].map((r) => acwrZoneOf(Number(r), zones))).toEqual(["low", "sweet", "sweet", "caution", "caution", "risk"]);
  });
});
