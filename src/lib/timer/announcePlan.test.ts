import { describe, expect, it } from "vitest";
import { SPEECH_PAUSE, estimateSpeechSeconds, planRestSpeech, targetSpeech } from "./announcePlan";

const base = { kind: "transition" as const, name: "Push-ups", target: "12 reps", rate: 1, ticks: false, warningSeconds: 0 };

describe("estimateSpeechSeconds", () => {
  it("grows with the words, shrinks with a faster voice, and counts the pause", () => {
    expect(estimateSpeechSeconds("Front lever progressions")).toBeGreaterThan(estimateSpeechSeconds("Pull"));
    expect(estimateSpeechSeconds("Front lever progressions", 2)).toBeLessThan(estimateSpeechSeconds("Front lever progressions", 1));
    expect(estimateSpeechSeconds(`Next${SPEECH_PAUSE}Pull`)).toBeCloseTo(estimateSpeechSeconds("Next Pull") + 0.4, 5);
  });
});

describe("measured speech lengths", () => {
  it("uses the engine's timing when it knows every part, the estimate otherwise", () => {
    const known: Record<string, number> = { Next: 0.5, "Push-ups, 12 reps": 1.5 };
    const text = `Next${SPEECH_PAUSE}Push-ups, 12 reps`;
    expect(estimateSpeechSeconds(text, 1, (p) => known[p])).toBeCloseTo(0.5 + 1.5 + 0.4 + 0.2, 5);
    expect(estimateSpeechSeconds(text, 1, (p) => (p === "Next" ? 0.5 : undefined))).toBe(estimateSpeechSeconds(text, 1));
  });

  it("fits the rest by the measured length, not the guess", () => {
    const slow = () => 4; // every part takes 4 s
    const fast = () => 0.2;
    const at = (measure: () => number) => planRestSpeech({ ...base, seconds: 8, ticks: true, measure }).cues[0]?.text;
    expect(at(fast)).toBe(`Next${SPEECH_PAUSE}Push-ups, 12 reps`);
    expect(at(slow)).toBeUndefined();
  });
});

describe("saying less in later rounds", () => {
  it("drops the 'Rest.' prefix when trimmed", () => {
    expect(planRestSpeech({ ...base, kind: "roundRest", seconds: 20, trimmed: true }).cues[0].text).toBe(`Next${SPEECH_PAUSE}Push-ups, 12 reps`);
  });
});

describe("targetSpeech", () => {
  it("says reps or time plainly", () => {
    expect(targetSpeech({ reps: 12 })).toBe("12 reps");
    expect(targetSpeech({ reps: 1 })).toBe("1 rep");
    expect(targetSpeech({ seconds: 40 })).toBe("40 seconds");
    expect(targetSpeech({ seconds: 90 })).toBe("1 minute 30");
    expect(targetSpeech({ seconds: 120 })).toBe("2 minutes");
    expect(targetSpeech({})).toBe("");
  });
});

describe("planRestSpeech", () => {
  it("says the full thing at the start of a roomy rest", () => {
    const p = planRestSpeech({ ...base, kind: "roundRest", seconds: 20 });
    expect(p.covered).toBe(true);
    expect(p.cues[0].text).toBe(`Rest. Next${SPEECH_PAUSE}Push-ups, 12 reps`);
  });

  it("shortens on a tight rest, down to just the name", () => {
    const text = (seconds: number) => planRestSpeech({ ...base, seconds, ticks: true }).cues[0]?.text;
    expect(text(10)).toBe(`Next${SPEECH_PAUSE}Push-ups, 12 reps`);
    expect(text(6.5)).toBe("Push-ups, 12 reps");
    expect(text(5.5)).toBe("Push-ups");
  });

  it("leaves a rest too short for any of it to the set's own start", () => {
    const p = planRestSpeech({ ...base, seconds: 5, ticks: true });
    expect(p).toEqual({ cues: [], covered: false });
  });

  it("repeats itself near the end of a long rest, finishing before the end guard", () => {
    const p = planRestSpeech({ ...base, kind: "roundRest", seconds: 90, ticks: true });
    expect(p.cues).toHaveLength(2);
    const [, again] = p.cues;
    expect(again.text).toBe(`Next${SPEECH_PAUSE}Push-ups, 12 reps`);
    expect(again.offset + estimateSpeechSeconds(again.text)).toBeLessThanOrEqual(90 - 3.5);
  });

  it("ends the reminder before the warning beep", () => {
    const p = planRestSpeech({ ...base, kind: "roundRest", seconds: 90, warningSeconds: 15 });
    const again = p.cues[1];
    expect(again.offset + estimateSpeechSeconds(again.text)).toBeLessThanOrEqual(90 - 15);
  });

  it("does not repeat on a medium rest, nor in the lead-in", () => {
    expect(planRestSpeech({ ...base, seconds: 15 }).cues).toHaveLength(1);
    expect(planRestSpeech({ ...base, kind: "leadIn", seconds: 60 }).cues).toHaveLength(1);
  });
});
