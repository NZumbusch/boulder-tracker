import { describe, expect, it } from "vitest";
import { DEFAULT_TIMER_CUES, validateTimerCues } from "./timerCues";

describe("validateTimerCues", () => {
  it("gives the defaults for nothing or nonsense", () => {
    expect(validateTimerCues(undefined)).toEqual(DEFAULT_TIMER_CUES);
    expect(validateTimerCues("loud")).toEqual(DEFAULT_TIMER_CUES);
    expect(validateTimerCues({ volume: "x", announce: 3 })).toEqual(DEFAULT_TIMER_CUES);
  });

  it("clamps volume and the offsets, keeps the valid parts of a partly valid value", () => {
    const v = validateTimerCues({ volume: 7, volumeSetsMedia: true, announce: { enabled: true, workLead: -4, restStartDelay: 99, restEnd: 12.4, work: "yes" } });
    expect(v.volume).toBe(1);
    expect(v.volumeSetsMedia).toBe(true);
    expect(v.announce).toEqual({ enabled: true, work: true, workLead: 0, restStart: true, restStartDelay: 30, restEnd: 12 });
    expect(validateTimerCues({ volume: 0 }).volume).toBe(0.1);
  });
});
