import { describe, it, expect } from "vitest";
import { describeDecisions } from "./syncLog";
import { mergeDoc, buildDoc, initLedger, type MergeDecision } from "./merge";

const t = (iso: string) => Date.parse(iso);

describe("describeDecisions", () => {
  it("names sessions one by one with the device and the times that decided", () => {
    const lines = describeDecisions([
      { table: "workouts", key: "mon", label: "Session · Heavy", how: "newer", deviceName: "Tablet", remote: { t: t("2026-11-24T10:00:00Z"), o: "tab" }, local: { t: t("2026-11-23T20:00:00Z"), o: "ph" } },
      { table: "workouts", key: "tue", label: "Session · Rehab", how: "kept", deviceName: "Tablet", remote: { t: 0, o: "tab" }, local: { t: t("2026-11-23T20:00:00Z"), o: "ph" } },
    ]);
    expect(lines).toEqual([
      "workouts/mon (Session · Heavy): took Tablet's version - theirs 2026-11-24 10:00 is newer than ours 2026-11-23 20:00",
      "workouts/tue (Session · Rehab): kept ours - ours 2026-11-23 20:00 is newer than Tablet's before sync was on",
    ]);
  });

  it("counts the big tables", () => {
    const d = { table: "dailyMetrics", label: "x", how: "new" as const, deviceName: "Tablet", remote: { t: 1, o: "tab" } };
    expect(describeDecisions([{ ...d, key: "a" }, { ...d, key: "b" }])).toEqual(["dailyMetrics: new from Tablet ×2"]);
  });
});

describe("mergeDoc reports its decisions", () => {
  it("one per record the sides differ on: new, newer, kept, deleted", () => {
    const local = { workouts: [{ id: "a", v: 1 }, { id: "b", v: 1 }, { id: "c", v: 1 }] };
    const ledger = initLedger(local, ["workouts"], "ph");
    ledger.workouts.b = { ...ledger.workouts.b, t: 500 };
    const remoteTables = { workouts: [{ id: "a", v: 2 }, { id: "b", v: 2 }, { id: "d", v: 1 }] };
    const remoteLedger = initLedger(remoteTables, ["workouts"], "tab");
    for (const e of Object.values(remoteLedger.workouts)) e.t = 100;
    remoteLedger.workouts.c = { h: "", t: 100, o: "tab", del: true };
    const doc = buildDoc(remoteTables, remoteLedger, ["workouts"], { deviceId: "tab", deviceName: "Tablet", writtenAt: 100, exportVersion: "3.39" });
    const decisions: MergeDecision[] = [];
    mergeDoc(structuredClone(local), ledger, doc, ["workouts"], { lastSyncAt: 50, firstSync: false, now: 1000, deviceId: "ph", onDecision: (d) => decisions.push(d) });
    expect(Object.fromEntries(decisions.map((d) => [d.key, d.how]))).toEqual({ a: "newer", b: "kept", c: "deleted", d: "new" });
  });
});
