import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { buildMissedSessions } from "./context";

const w = (over: Partial<Workout>): Workout =>
  ({ id: Math.random().toString(36), notes: "Board", weekId: "2026-W46", dayOfWeek: "Tuesday", exercises: [], status: "planned", date: null, loadFactor: 0, ...over }) as Workout;

describe("buildMissedSessions", () => {
  const asOf = new Date(2026, 10, 12, 12); // Thursday of 2026-W46

  it("lists planned sessions whose day is over, oldest first, leaving out done, skipped and upcoming ones", () => {
    const list = [
      w({ notes: "Hangboard", dayOfWeek: "Wednesday" }),
      w({ notes: "Board", dayOfWeek: "Monday" }),
      w({ notes: "Run", dayOfWeek: "Friday" }),
      w({ notes: "Done", status: "completed", date: "2026-11-10T18:00:00.000Z" }),
      w({ notes: "Skipped", exercises: [{ skipped: true } as never] }),
      w({ notes: "Other week", weekId: "2026-W40" }),
    ];
    expect(buildMissedSessions(list, ["2026-W46"], asOf)).toEqual(["2026-W46 Mon: Board", "2026-W46 Wed: Hangboard"]);
  });
});
