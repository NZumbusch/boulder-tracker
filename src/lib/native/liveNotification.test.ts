import { describe, it, expect } from "vitest";
import { composeLive, sessionSegment, type SessionInfo } from "./liveNotification.svelte";
import type { LiveTimerConfig } from "../timer/liveTimer";

const NOW = 1_000_000;
const session: SessionInfo = { name: "Limit boulders", exercise: "Board Session", done: 1, total: 3, running: true, elapsedMs: 600_000 };
const timer: LiveTimerConfig = {
  segments: [{ endsAt: NOW + 90_000, title: "Countdown", body: "Board Session" }],
  cues: [{ at: NOW + 90_000, kind: "done" }],
  actions: ["pause", "add30"],
  finishedTitle: "Time's up",
};

describe("session notification", () => {
  it("counts the session up from when it (effectively) started, with Pause", () => {
    expect(sessionSegment(session, NOW)).toEqual({
      startedAt: NOW - 600_000,
      title: "Session · Limit boulders",
      body: "Board Session · 1/3 done",
      actions: ["sessionPause"],
    });
  });

  it("shows a paused session frozen, with Resume", () => {
    const seg = sessionSegment({ ...session, running: false }, NOW);
    expect(seg.startedAt).toBeUndefined();
    expect(seg.title).toBe("Session paused · Limit boulders");
    expect(seg.body).toBe("10:00 · Board Session · 1/3 done");
    expect(seg.actions).toEqual(["sessionResume"]);
  });

  it("puts a running timer first and the session after it, so it falls back by itself", () => {
    const composed = composeLive(timer, session, { sessionNotification: true }, NOW)!;
    expect(composed.segments.map((s) => s.title)).toEqual(["Countdown", "Session · Limit boulders"]);
    expect(composed.cues).toEqual(timer.cues);
    expect(composed.actions).toEqual(["pause", "add30"]);
  });

  it("carries the session alone when no timer runs, and nothing when it is switched off", () => {
    expect(composeLive(null, session, { sessionNotification: true }, NOW)!.segments).toHaveLength(1);
    expect(composeLive(null, session, { sessionNotification: false }, NOW)).toBeNull();
    expect(composeLive(timer, session, { sessionNotification: false }, NOW)).toBe(timer);
    expect(composeLive(null, null, { sessionNotification: true }, NOW)).toBeNull();
  });
});
