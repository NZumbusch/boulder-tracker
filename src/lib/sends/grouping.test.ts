import { describe, it, expect } from "vitest";
import type { GoalEvent, OutdoorAscent } from "../types";
import { groupSends } from "./grouping";

describe("groupSends", () => {
  it("groups sends under the trip that covers them, the rest by month, newest group first", () => {
    const trip: GoalEvent = { id: "t", kind: "trip", name: "Font", date: "2026-10-05", endDate: "2026-10-12" };
    const s = (id: string, date: string): OutdoorAscent => ({ id, date, grade: "6A" });
    const groups = groupSends([s("a", "2026-09-10"), s("b", "2026-10-06"), s("c", "2026-10-20"), s("d", "2026-10-07")], [trip]);
    expect(groups.map((g) => g.key)).toEqual(["month-2026-10", "trip-t", "month-2026-09"]);
    expect(groups[1].sends.map((x) => x.id)).toEqual(["d", "b"]);
  });
});
