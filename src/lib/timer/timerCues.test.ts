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
    expect(v.announce).toEqual({ enabled: true, mode: "custom", work: true, workLead: 0, restStart: true, restStartDelay: 30, restEnd: 12 });
    expect(validateTimerCues({ volume: 0 }).volume).toBe(0.1);
  });

  it("is on in Auto by default, and keeps a hand-tuned value in Custom", () => {
    expect(validateTimerCues(undefined).announce).toMatchObject({ enabled: true, mode: "auto" });
    expect(validateTimerCues({ announce: { enabled: false, workLead: 5 } }).announce).toMatchObject({ enabled: false, mode: "custom" });
    expect(validateTimerCues({ announce: { mode: "auto" } }).announce.mode).toBe("auto");
    expect(validateTimerCues({ announce: { mode: "weird" } }).announce.mode).toBe("auto");
  });

  it("keeps a known beep style and a sane voice, and falls back for the rest", () => {
    const v = validateTimerCues({ sound: "chime", speech: { engine: "com.google.android.tts", voice: "en-gb-x-gba-local", rate: 5, pitch: 0.1 } });
    expect(v.sound).toBe("chime");
    expect(v.speech).toEqual({ engine: "com.google.android.tts", voice: "en-gb-x-gba-local", rate: 2, pitch: 0.5 });
    const bad = validateTimerCues({ sound: "dubstep", speech: { engine: 4, voice: "", rate: "fast" } });
    expect(bad.sound).toBe("classic");
    expect(bad.speech).toEqual({ engine: null, voice: null, rate: 1, pitch: 1 });
  });
});
