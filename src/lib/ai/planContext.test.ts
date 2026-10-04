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
    expect(text).toContain('"week":"2026-W40","dates":"28 Sep – 4 Oct 2026","phase":"Capacity","state":"custom (edited by hand)","sessions":[{"name":"Extra","dayOfWeek":"Tuesday"}],"completed":["Monday Board"]');
    expect(lines).toContain('{"week":"2026-W41","dates":"5 – 11 Oct 2026","phase":"Capacity","state":"follows its phase - no changes","note":"Travel"}');
  });

  it("lists the blocks around the target weeks with their notes", () => {
    expect(lines).toContain('{"block":"Base","phase":"Capacity","from":"2026-W38","to":"2026-W41","dates":"14 Sep – 11 Oct 2026","notes":"Build volume"}');
  });

  it("lists Plan Bs touching the target weeks, and asks for Plan Bs on uncertain days", () => {
    const withPlanB = buildPlanContext({
      ...input,
      planAlternatives: [
        { id: "a", label: "Outdoor if dry", startWeekId: "2026-W41", startDay: "Saturday", days: 3, outdoor: "B", changes: [{ id: "c", offset: 0, session: { id: "t", name: "Outdoor", exercises: [] } }], occurrences: { "2026-W41": { chosen: "B" } } },
        { id: "far", startWeekId: "2026-W50", startDay: "Saturday", days: 1, changes: [] },
      ],
      uncertainDays: ["Saturday", "Sunday"],
    });
    expect(withPlanB).toContain('{"label":"Outdoor if dry","start":{"week":"2026-W41","day":"Saturday"},"end":{"week":"2026-W42","day":"Monday"},"outdoor":"B","planB":["Sat: + Outdoor"],"decided":["2026-W41: Plan B"]}');
    expect(withPlanB).not.toContain("2026-W50");
    expect(withPlanB).toContain("UNCERTAIN DAYS: Saturday, Sunday in every target week");
    expect(text).not.toContain("PLAN B");
  });
});

describe("buildPlanContext - circuits", () => {
  const types = [{ id: "c", name: "Core", category: "Core", parameters: ["timeOn"] as any }, { id: "p", name: "Pull-ups", category: "Strength", parameters: ["reps"] as any }];
  const base = { exerciseTypes: types, trainingBlocks: [], workouts: [], weekOverrides: [], weekNotes: [], targetWeekIds: [] };

  it("lists the saved circuits, and shows a session's circuit the way an edit would give it", () => {
    const text = buildPlanContext({
      ...base,
      phaseDefs: [{ id: "ph", name: "Base", order: 1 }],
      templates: { ph: [{ id: "t", name: "Pull", exercises: [
        { id: "a", typeId: "p", prescribed: { reps: 6 }, groupId: "g" },
        { id: "b", typeId: "c", prescribed: { timeOn: 45 }, groupId: "g" },
      ], groups: [{ id: "g", name: "Pull superset", rounds: 4, roundRest: 60 }] }] },
      circuits: [{ id: "x", name: "Core A", rounds: 3, transition: 15, exercises: [{ id: "s", typeId: "c", prescribed: { timeOn: 60 } }] }],
    });
    expect(text).toContain('SAVED CIRCUITS');
    expect(text).toContain('{"name":"Core A","rounds":3,"transition":15,"exercises":[{"exerciseTypeName":"Core","values":{"timeOn":60}}]}');
    expect(text).toContain('{"circuit":{"name":"Pull superset","rounds":4,"roundRest":60},"exercises":[{"exerciseTypeName":"Pull-ups","values":{"reps":6}},{"exerciseTypeName":"Core","values":{"timeOn":45}}]}');
  });
});
