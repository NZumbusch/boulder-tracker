import { describe, it, expect, vi, afterEach } from "vitest";
import { CueSound, CUE_TONES } from "./cueSound";

/** A Web Audio stand-in that records each tone's frequency and start. */
function fakeAudio() {
  const tones: { frequency: number; start: number }[] = [];
  class FakeContext {
    state = "running";
    currentTime = 10;
    destination = {};
    resume = vi.fn();
    createOscillator() {
      const osc = {
        frequency: { value: 0 },
        connect: (x: unknown) => x,
        start: (at: number) => tones.push({ frequency: osc.frequency.value, start: at }),
        stop: () => {},
      };
      return osc;
    }
    createGain() {
      return { gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: (x: unknown) => x };
    }
  }
  return { tones, FakeContext };
}

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g.AudioContext;
  vi.unstubAllGlobals();
});

describe("CueSound", () => {
  it("plays each cue's tones at their offsets, and its vibration", () => {
    const { tones, FakeContext } = fakeAudio();
    g.AudioContext = FakeContext;
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const sound = new CueSound({ sound: () => true, vibrate: () => true });

    sound.play("done");
    expect(tones.map((t) => t.frequency)).toEqual(CUE_TONES.done.map(([f]) => f));
    expect(tones.map((t) => Math.round((t.start - 10) * 1000))).toEqual([0, 190, 380]);
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200, 100, 400]);
  });

  it("stays silent and still with both switched off", () => {
    const { tones, FakeContext } = fakeAudio();
    g.AudioContext = FakeContext;
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const sound = new CueSound({ sound: () => false, vibrate: () => false });
    sound.unlock();
    sound.play("work");
    expect(tones).toEqual([]);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("degrades silently without Web Audio", () => {
    vi.stubGlobal("navigator", {});
    const sound = new CueSound({ sound: () => true, vibrate: () => true });
    expect(() => { sound.unlock(); sound.play("tick"); }).not.toThrow();
  });
});
