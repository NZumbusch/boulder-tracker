import { describe, expect, it } from "vitest";
import { cleanPresetValues, describePreset, validateTimerPresets, variantOf } from "./presets";

describe("timer presets", () => {
  it("repairs junk without throwing", () => {
    expect(validateTimerPresets(undefined)).toEqual([]);
    expect(validateTimerPresets("x")).toEqual([]);
    expect(validateTimerPresets([null, 3, {}, { id: "a" }, { id: "a", name: "  " }, { id: "a", name: "ok", values: {} }])).toEqual([]);
  });

  it("keeps good presets, limits numbers, drops other fields, de-duplicates ids", () => {
    const list = validateTimerPresets([
      { id: "a", name: "  Repeaters  ", variant: "timed", values: { sets: 500, reps: 6, timeOn: 7, timeOff: 3, weight: 20, notes: "x" }, leadIn: 500 },
      { id: "a", name: "dup", values: { sets: 3 } },
      { id: "b", name: "Pace", values: { cadence: 4 }, leadIn: -3 },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ id: "a", name: "Repeaters", variant: "timed", values: { sets: 99, reps: 6, timeOn: 7, timeOff: 3 }, leadIn: 120 });
    expect(list[1]).toMatchObject({ id: "b", variant: "pacer", leadIn: 0 });
  });

  it("works out the variant and describes it", () => {
    expect(variantOf({ timeOn: 7 })).toBe("timed");
    expect(variantOf({ cadence: 6 })).toBe("pacer");
    expect(variantOf({ sets: 3, reps: 5 })).toBe("counted");
    expect(describePreset({ variant: "timed", values: { sets: 4, reps: 6, timeOn: 7, timeOff: 3, timeBetweenSets: 180 } })).toBe("4 × 6 · 7 s on, 3 s off · 3 min between");
    expect(describePreset({ variant: "pacer", values: { cadence: 6, sets: 10 } })).toBe("Every 6 min · 10 problems");
    expect(describePreset({ variant: "timed", values: { reps: 2, timeOn: 30, timeOff: 5, repLabel: "Side" } })).toBe("2 reps · 30 s per side on, 5 s off");
  });

  it("cleanPresetValues rounds and clamps", () => {
    expect(cleanPresetValues({ cadence: 0.1, timeOn: 7.123, timeOff: -4 })).toEqual({ cadence: 0.5, timeOn: 7.12, timeOff: 0 });
  });
});
