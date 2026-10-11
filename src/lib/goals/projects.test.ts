import { describe, it, expect } from "vitest";
import type { GoalEvent, OutdoorAscent } from "../types";
import { projectStatus, resolveCandidate, sendsDuring, tripSummary } from "./projects";

const trip: GoalEvent = {
  id: "t",
  kind: "trip",
  name: "Font",
  date: "2026-10-05",
  endDate: "2026-10-12",
  projects: [
    { id: "bb", name: "Big Boss", grade: "7C" },
    { id: "mr", name: "Marie-Rose" },
    { id: "g7b", grade: "7B", flash: true },
  ],
};
const send = (id: string, name: string | undefined, grade: string, date: string, style?: string): OutdoorAscent => ({ id, date, grade, ...(name ? { name } : {}), ...(style ? { style } : {}) });

describe("sendsDuring", () => {
  it("keeps sends on the trip's days only, a one-day trip included", () => {
    const sends = [send("a", "x", "6A", "2026-10-04"), send("b", "y", "6A", "2026-10-05T12:00:00Z"), send("c", "z", "6A", "2026-10-12")];
    expect(sendsDuring(trip, sends).map((s) => s.id)).toEqual(["c", "b"]);
    expect(sendsDuring({ ...trip, endDate: "2026-10-05" }, sends).map((s) => s.id)).toEqual(["b"]);
  });
});

describe("projectStatus", () => {
  it("ticks a named project on a same-name send, whatever the grade", () => {
    const s = projectStatus(trip.projects![1], [send("1", "marie rose", "6A+", "2026-10-06")]);
    expect(s.state).toBe("done");
  });

  it("asks about a similar name, and respects the answer", () => {
    const sit = send("2", "Big Boss sit", "7C+", "2026-10-07");
    const asked = projectStatus(trip.projects![0], [sit]);
    expect(asked.state).toBe("maybe");
    expect(asked.candidates.map((c) => c.id)).toEqual(["2"]);
    expect(projectStatus(resolveCandidate(trip.projects![0], "2", true), [sit]).state).toBe("done");
    expect(projectStatus(resolveCandidate(trip.projects![0], "2", false), [sit]).state).toBe("open");
  });

  it("ticks a grade target with a hard-enough send, flashed when required", () => {
    const target = trip.projects![2];
    expect(projectStatus(target, [send("3", "a", "7B+", "2026-10-06", "Redpoint")]).state).toBe("open");
    expect(projectStatus(target, [send("4", "b", "7B", "2026-10-06", "Flash")]).state).toBe("done");
    expect(projectStatus({ ...target, flash: undefined }, [send("5", "c", "7C", "2026-10-06")]).state).toBe("done");
  });
});

describe("tripSummary", () => {
  it("counts sends, the hardest, and projects done", () => {
    const summary = tripSummary(trip, [
      send("1", "Marie-Rose", "6A", "2026-10-06"),
      send("2", "Big Boss", "7C", "2026-10-08"),
      send("3", "Outside", "8A", "2026-11-01"),
    ]);
    expect(summary.sends).toHaveLength(2);
    expect(summary.hardest?.id).toBe("2");
    expect(summary.projectsDone).toBe(2);
  });
});
