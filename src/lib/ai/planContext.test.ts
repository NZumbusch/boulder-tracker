import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import { buildPlanContext } from "./planContext";

describe("buildPlanContext", () => {
  const input = {
    exerciseTypes: [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: ["sets"] as any }],
    phaseDefs: [{ id: "p", name: "Capacity", order: 1 }, { id: "old", name: "Old", archived: true }],
    templates: { p: [{ id: "t", name: "Board", dayOfWeek: "Monday" as const, description: "Warm up", exercises: [{ id: "s", typeId: "hb", prescribed: { sets: 5, notes: "" } }] }] },
    trainingBlocks: [{ id: "b", name: "Base", phaseId: "p", startWeekId: "2026-W38", endWeekId: "2026-W41", notes: "Build volume" }],
    workouts: [
      { id: "w", status: "planned", date: null, weekId: "2026-W40", dayOfWeek: "Tuesday", notes: "Extra", loadFactor: 0, exercises: [] },
      { id: "d", status: "completed", date: "2026-09-29", weekId: "2026-W40", dayOfWeek: "Monday", notes: "Board", loadFactor: 1, exercises: [] },
    ] as Workout[],
    weekOverrides: [{ weekId: "2026-W40", customized: true }],
    weekNotes: [{ weekId: "2026-W41", text: "Travel" }],
    targetWeekIds: ["2026-W40", "2026-W41"],
  };
  const text = buildPlanContext(input);
  const lines = text.split("\n");

  it("gives each active phase's typical week in the contract's own shape, skipping empty fields", () => {
    expect(lines).toContain('{"phase":"Capacity","typicalWeek":[{"name":"Board","dayOfWeek":"Monday","notes":"Warm up","exercises":[{"exerciseTypeName":"Hangboard","values":{"sets":5}}]}]}');
    expect(text).not.toContain("Old");
  });

  it("spells out only weeks with their own sessions; the rest are one line", () => {
    expect(text).toContain('"week":"2026-W40","phase":"Capacity","state":"custom (edited by hand)","sessions":[{"name":"Extra","dayOfWeek":"Tuesday"}],"completed":["Monday Board"]');
    expect(lines).toContain('{"week":"2026-W41","phase":"Capacity","state":"follows its phase - no changes","note":"Travel"}');
  });

  it("lists the blocks around the target weeks with their notes", () => {
    expect(lines).toContain('{"block":"Base","phase":"Capacity","from":"2026-W38","to":"2026-W41","notes":"Build volume"}');
  });
});
