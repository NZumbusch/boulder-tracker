import { describe, it, expect } from "vitest";
import type { AnalyticsCategory, ExerciseTypeDef, OutdoorAscent, PainLog, Workout } from "../types";
import { recapWeekId, buildWeekRecap } from "./weekRecap";

const types: ExerciseTypeDef[] = [
  { id: "hb", name: "Hangboard", category: "cat-f", parameters: [] },
  { id: "bo", name: "Bouldering", category: "cat-b", parameters: [] },
];
const cats: AnalyticsCategory[] = [{ id: "cat-f", name: "Fingers", color: "" }, { id: "cat-b", name: "Bouldering", color: "" }];
const done = (id: string, weekId: string, day: Workout["dayOfWeek"], load: number, mins: [string, number][]): Workout => ({
  id, status: "completed", date: "2026-09-15T10:00:00.000Z", weekId, dayOfWeek: day, loadFactor: load,
  exercises: mins.map(([typeId, duration], i) => ({ id: `${id}-${i}`, typeId, logged: { duration } })),
});
const planned = (id: string, weekId: string, day: Workout["dayOfWeek"], skipped = false): Workout => ({
  id, status: "planned", date: null, weekId, dayOfWeek: day, loadFactor: 0,
  exercises: [{ id: `${id}-0`, typeId: "hb", prescribed: { duration: 30 }, ...(skipped ? { skipped: true } : {}) }],
});

describe("recapWeekId", () => {
  it("recaps this week at the weekend, last week on weekdays", () => {
    expect(recapWeekId(new Date(2026, 8, 19, 12))).toBe("2026-W38"); // Saturday
    expect(recapWeekId(new Date(2026, 8, 20, 12))).toBe("2026-W38"); // Sunday
    expect(recapWeekId(new Date(2026, 8, 21, 12))).toBe("2026-W38"); // Monday -> last week
    expect(recapWeekId(new Date(2026, 8, 25, 12))).toBe("2026-W38"); // Friday -> last week
  });
});

describe("buildWeekRecap", () => {
  const week = [
    done("a", "2026-W38", "Monday", 400, [["hb", 30], ["bo", 60]]),
    done("b", "2026-W38", "Wednesday", 600, [["bo", 90]]),
    planned("c", "2026-W38", "Thursday"),
    planned("d", "2026-W38", "Friday", true),
  ];
  const prev = [done("p", "2026-W37", "Tuesday", 800, [["bo", 60]])];
  const ascents: OutdoorAscent[] = [
    { id: "s1", date: "2026-09-19", grade: "7A" },
    { id: "s2", date: "2026-09-20", grade: "6C" },
    { id: "s3", date: "2026-09-10", grade: "8A" }, // a week earlier
  ];
  const pain: PainLog[] = [{ id: "x", date: "2026-09-16", weekId: "2026-W38", bodyPart: "A2", severity: 3 }];

  it("counts sessions, load against the week before, time and mix", () => {
    const r = buildWeekRecap({ weekId: "2026-W38", workouts: week, prevWorkouts: prev, ascents, painLogs: pain, exerciseTypes: types, analyticsCategories: cats, asOf: new Date(2026, 8, 21, 12) });
    expect(r).toMatchObject({ weekId: "2026-W38", done: 2, planned: 4, missed: 1, skipped: 1, load: 1000, prevLoad: 800, painEntries: 1 });
    expect(r.mix).toEqual([{ name: "Bouldering", minutes: 150 }, { name: "Fingers", minutes: 30 }]);
    expect(r.sends.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(r.hardest?.grade).toBe("7A");
  });

  it("on the weekend, only counts this week's past days as missed", () => {
    const r = buildWeekRecap({ weekId: "2026-W38", workouts: [planned("sun", "2026-W38", "Sunday"), planned("mon", "2026-W38", "Monday")], prevWorkouts: [], ascents: [], painLogs: [], exerciseTypes: types, analyticsCategories: cats, asOf: new Date(2026, 8, 19, 12) });
    expect(r.missed).toBe(1);
    expect(r.isCurrentWeek).toBe(true);
  });
});
