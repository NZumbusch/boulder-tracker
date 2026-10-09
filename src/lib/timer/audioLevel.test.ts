import { describe, expect, it } from "vitest";
import { AUDIO_LEVELS, levelOf, settingsFor, type AudioState } from "./audioLevel";

const state = (over: Partial<AudioState> = {}): AudioState => ({ beep: true, ticks: true, warn: false, announce: true, ...over });

describe("audio level", () => {
  it("the shipped defaults read as everything", () => {
    expect(levelOf(state())).toBe("full");
  });

  it("everything keeps the 15 s warning as the user had it", () => {
    expect(levelOf(state({ warn: true }))).toBe("full");
    expect(settingsFor("full", state({ warn: true })).warn).toBe(true);
  });

  it("every step reads back as itself", () => {
    for (const level of AUDIO_LEVELS) expect(levelOf(settingsFor(level, state()))).toBe(level);
  });

  it("a mix that matches no step is custom", () => {
    expect(levelOf(state({ ticks: false }))).toBe("custom");
    expect(levelOf(state({ beep: false, announce: false, ticks: true }))).toBe("custom");
  });

  it("the lower steps drop the 15 s warning", () => {
    for (const level of ["silent", "beeps", "voice"] as const) expect(settingsFor(level, state({ warn: true })).warn).toBe(false);
  });

  it("voice-only is quiet apart from the announcements", () => {
    expect(settingsFor("voice", state())).toEqual({ beep: false, ticks: false, warn: false, announce: true });
  });
});
