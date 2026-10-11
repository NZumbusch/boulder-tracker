import { describe, it, expect } from "vitest";
import type { AnalyticsCategory, Workout } from "../types";
import { describeTargets, hasTargets, mixGaps, weekProgress, weekProgressText } from "./targets";

const cats: AnalyticsCategory[] = [
  { id: "f", name: "Fingers", color: "x" },
  { id: "t", name: "Technique Bouldering", color: "y" },
];
const w = (date: string, load: number, over: Partial<Workout> = {}): Workout => ({ id: date + load, status: "completed", date, weekId: "2026-W41", loadFactor: load, exercises: [], ...over }) as Workout;

describe("targets", () => {
  it("knows when there are none", () => {
    expect(hasTargets(undefined)).toBe(false);
    expect(hasTargets({})).toBe(false);
    expect(hasTargets({ categoryShares: {} })).toBe(false);
    expect(hasTargets({ fingerDays: 2 })).toBe(true);
  });

  it("tells the AI the targets in words", () => {
    expect(describeTargets({ sessionsPerWeek: 4, loadMin: 1500, loadMax: 2800, fingerDays: 2, categoryShares: { f: 0.15, t: 0.4 } }, cats)).toBe(
      "4 sessions a week; weekly load 1,500-2,800; finger work on 2 days a week; time split Fingers 15%, Technique Bouldering 40%",
    );
    expect(describeTargets({ loadMax: 3000 }, cats)).toBe("weekly load up to 3,000");
    expect(describeTargets({}, cats)).toBe("");
  });

  it("measures a week against sessions, load range and finger days (a day counts once)", () => {
    const week = [w("2026-10-05T10:00:00Z", 900), w("2026-10-07T10:00:00Z", 855), w("2026-10-07T18:00:00Z", 100), w("2026-10-09T10:00:00Z", 1970)];
    const finger = (x: Workout) => x.loadFactor !== 855;
    const p = weekProgress({ sessionsPerWeek: 4, loadMin: 1500, loadMax: 2800, fingerDays: 2 }, week, finger);
    expect(p.sessions).toEqual({ done: 4, target: 4 });
    expect(p.load).toMatchObject({ value: 3825, state: "above", max: 2800 });
    expect(p.fingerDays).toEqual({ done: 3, target: 2 });
    expect(weekProgressText(p)).toBe("4 of 4 sessions · load 3,825 over 2,800 · fingers 3 of 2 days");
  });

  it("calls a load under the minimum 'below' and between the ends 'in'", () => {
    expect(weekProgress({ loadMin: 1500 }, [w("2026-10-05", 800)], () => false).load?.state).toBe("below");
    expect(weekProgress({ loadMin: 500, loadMax: 1500 }, [w("2026-10-05", 800)], () => false).load?.state).toBe("in");
    expect(weekProgress(undefined, [w("2026-10-05", 800)], () => false)).toEqual({});
  });

  it("finds how far the time split is from the targets, biggest gap first", () => {
    const gaps = mixGaps({ categoryShares: { f: 0.15, t: 0.4 } }, { Fingers: 40, "Technique Bouldering": 360, Core: 100 }, cats);
    expect(gaps.map((g) => g.name)).toEqual(["Technique Bouldering", "Fingers"]);
    expect(gaps[0].actual).toBeCloseTo(0.72, 2);
    expect(gaps[0].gap).toBeCloseTo(0.32, 2);
    expect(gaps[1].actual).toBeCloseTo(0.08, 2);
    expect(gaps[1].gap).toBeCloseTo(-0.07, 2);
    expect(mixGaps({ categoryShares: { f: 0.15 } }, {}, cats)).toEqual([]);
  });
});

import { isFingerSession } from "./targets";
describe("isFingerSession", () => {
  const types = [{ id: "hang", name: "Hang", category: "f", parameters: [] }, { id: "boulder", name: "Boulder", category: "Technique Bouldering", parameters: [] }] as never[];
  const slot = (typeId: string, logged = true) => ({ id: typeId, typeId, ...(logged ? { logged: {} } : {}) }) as never;
  it("is true for a logged exercise in a finger category, by id or by name", () => {
    expect(isFingerSession({ exercises: [slot("hang")] } as never, types, cats, ["f"])).toBe(true);
    expect(isFingerSession({ exercises: [slot("boulder")] } as never, types, cats, ["f"])).toBe(false);
    expect(isFingerSession({ exercises: [slot("boulder")] } as never, types, cats, ["t"])).toBe(true);
  });
  it("ignores exercises not done", () => {
    expect(isFingerSession({ exercises: [slot("hang", false)] } as never, types, cats, ["f"])).toBe(false);
    expect(isFingerSession({ exercises: [{ id: "x", typeId: "hang", logged: {}, skipped: true }] } as never, types, cats, ["f"])).toBe(false);
  });
});
