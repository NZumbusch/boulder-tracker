import { describe, it, expect } from "vitest";
import type { OutdoorAscent, Workout } from "../types";
import { recentActivity } from "./recentActivity";

const w = (id: string, date: string) => ({ id, date, status: "completed", weekId: "x", loadFactor: 0, exercises: [] }) as unknown as Workout;
const a = (id: string, date: string): OutdoorAscent => ({ id, date, grade: "7A" });

describe("recentActivity", () => {
  it("merges sessions and sends newest first, capped", () => {
    const items = recentActivity([w("w1", "2026-09-20"), w("w2", "2026-09-10")], [a("a1", "2026-09-15"), a("a2", "2026-09-21")], 3, true);
    expect(items.map((i) => (i.kind === "workout" ? i.workout.id : i.ascent.id))).toEqual(["a2", "w1", "a1"]);
  });

  it("leaves ascents out when not included", () => {
    const items = recentActivity([w("w1", "2026-09-20")], [a("a1", "2026-09-21")], 3, false);
    expect(items.map((i) => i.kind)).toEqual(["workout"]);
  });
});
