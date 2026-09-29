import { describe, it, expect } from "vitest";
import type { PainIssue, PainLog } from "../types";
import {
  groupLogsIntoIssues, attachOrphanLogs, issueState, dueToday, unCheckedFor, checkIn,
  bodyPartLabel, defaultWatchCategories, issuesTouchedBy, issueIdFor, painLevelOn,
} from "./issues";

const log = (id: string, date: string, bodyPart: string, severity: number, extra: Partial<PainLog> = {}): PainLog =>
  ({ id, date, weekId: "2026-W01", bodyPart, severity, ...extra });

describe("groupLogsIntoIssues (the 3.33 migration)", () => {
  it("groups one body part's entries into one issue, case/space-insensitively, with ids from the first entry", () => {
    const r = groupLogsIntoIssues([
      log("b", "2026-09-10", "left A2 ", 4),
      log("a", "2026-09-05", "Left A2", 5),
      log("c", "2026-09-20", "Left  a2", 2),
    ]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ id: issueIdFor("a"), bodyPart: "Left A2", startDate: "2026-09-05" });
    expect(r.logs.every((l) => l.issueId === issueIdFor("a"))).toBe(true);
  });

  it("starts a new issue after a gap of more than 21 days", () => {
    const r = groupLogsIntoIssues([log("a", "2026-06-01", "Elbow", 5), log("b", "2026-06-10", "Elbow", 4), log("c", "2026-07-15", "Elbow", 3)]);
    expect(r.issues.map((i) => i.id)).toEqual([issueIdFor("a"), issueIdFor("c")]);
  });

  it("closes issues whose last entry is long before the newest entry, and leaves recent ones open - without reading the clock", () => {
    const r = groupLogsIntoIssues([log("a", "2026-05-01", "Knee", 6), log("b", "2026-05-03", "Knee", 3), log("c", "2026-09-20", "Finger", 4)]);
    const knee = r.issues.find((i) => i.bodyPart === "Knee")!;
    const finger = r.issues.find((i) => i.bodyPart === "Finger")!;
    expect(knee).toMatchObject({ endDate: "2026-05-03", endEstimated: true });
    expect(finger.endDate).toBeUndefined();
  });

  it("is deterministic (two devices get the same issues) and leaves already-attached entries alone", () => {
    const logs = [log("a", "2026-09-01", "Wrist", 3), log("x", "2026-09-02", "Wrist", 3, { issueId: "mine" })];
    expect(groupLogsIntoIssues(logs)).toEqual(groupLogsIntoIssues([...logs].reverse()));
    expect(groupLogsIntoIssues(logs).logs.find((l) => l.id === "x")!.issueId).toBe("mine");
  });

  it("does nothing with no entries", () => {
    expect(groupLogsIntoIssues([])).toEqual({ issues: [], logs: [] });
  });
});

describe("attachOrphanLogs", () => {
  const issue: PainIssue = { id: "i1", bodyPart: "Left A2", startDate: "2026-09-01" };
  it("joins an open issue for the same body part", () => {
    const r = attachOrphanLogs([log("n", "2026-09-10", "left a2", 3)], [issue]);
    expect(r.changed).toBe(true);
    expect(r.logs[0].issueId).toBe("i1");
    expect(r.issues).toHaveLength(1);
  });
  it("starts an issue otherwise (and not after a resolved one's end)", () => {
    const r = attachOrphanLogs([log("n", "2026-09-10", "Left A2", 3)], [{ ...issue, endDate: "2026-09-05" }]);
    expect(r.logs[0].issueId).toBe(issueIdFor("n"));
    expect(r.issues).toHaveLength(2);
  });
  it("reports no change when nothing is orphaned", () => {
    const logs = [log("n", "2026-09-10", "x", 3, { issueId: "i1" })];
    expect(attachOrphanLogs(logs, [issue])).toEqual({ logs, issues: [issue], changed: false });
  });
});

describe("issueState", () => {
  const issue: PainIssue = { id: "i", bodyPart: "Elbow", startDate: "2026-09-01" };
  it("reads improving / worse / steady / new from the check-ins", () => {
    expect(issueState(issue, [], "2026-09-05").status).toBe("new");
    expect(issueState(issue, [log("a", "2026-09-01", "Elbow", 5, { issueId: "i" }), log("b", "2026-09-03", "Elbow", 3, { issueId: "i" })], "2026-09-05")).toMatchObject({ status: "improving", severity: 3, peak: 5, daysSinceCheckIn: 2, durationDays: 4, checkIns: 2 });
    expect(issueState(issue, [log("a", "2026-09-01", "Elbow", 3, { issueId: "i" }), log("b", "2026-09-03", "Elbow", 5, { issueId: "i" })], "2026-09-05").status).toBe("worse");
    expect(issueState(issue, [log("a", "2026-09-01", "Elbow", 3, { issueId: "i" }), log("b", "2026-09-03", "Elbow", 3, { issueId: "i", trend: "same" })], "2026-09-05").status).toBe("steady");
  });
  it("is resolved once it has an end, and counts duration to the end", () => {
    expect(issueState({ ...issue, endDate: "2026-09-11" }, [], "2026-09-30")).toMatchObject({ status: "resolved", durationDays: 10 });
  });
});

describe("dueToday / unCheckedFor", () => {
  const a: PainIssue = { id: "a", bodyPart: "A", startDate: "2026-09-01" };
  const b: PainIssue = { id: "b", bodyPart: "B", startDate: "2026-09-01" };
  const done: PainIssue = { id: "c", bodyPart: "C", startDate: "2026-09-01", endDate: "2026-09-10" };
  const logs = [log("1", "2026-09-29", "A", 3, { issueId: "a" }), log("2", "2026-09-20", "B", 3, { issueId: "b" })];
  it("asks today about active issues not checked in today", () => {
    expect(dueToday([a, b, done], logs, "2026-09-29").map((i) => i.id)).toEqual(["b"]);
  });
  it("finds issues left unchecked for N days", () => {
    expect(unCheckedFor([a, b, done], logs, "2026-09-29", 7).map((i) => i.id)).toEqual(["b"]);
  });
});

describe("checkIn", () => {
  const issue: PainIssue = { id: "i", bodyPart: "Elbow", startDate: "2026-09-01" };
  const prev = [log("p", "2026-09-20", "Elbow", 5, { issueId: "i" })];
  let n = 0;
  const id = () => `n${++n}`;
  it("moves severity a step from the last one", () => {
    expect(checkIn(issue, prev, "better", "2026-09-29", id).log).toMatchObject({ severity: 4, trend: "better", issueId: "i", date: "2026-09-29" });
    expect(checkIn(issue, prev, "worse", "2026-09-29", id).log.severity).toBe(6);
    expect(checkIn(issue, prev, "same", "2026-09-29", id).log.severity).toBe(5);
    expect(checkIn(issue, prev, "same", "2026-09-29", id, { severity: 2 }).log.severity).toBe(2);
  });
  it("'gone' logs 0 and closes the issue today", () => {
    const r = checkIn({ ...issue, endEstimated: true }, prev, "gone", "2026-09-29", id);
    expect(r.log.severity).toBe(0);
    expect(r.issue.endDate).toBe("2026-09-29");
    expect(r.issue.endEstimated).toBeUndefined();
  });
});

describe("labels and watch categories", () => {
  it("builds a readable body part", () => {
    expect(bodyPartLabel("finger", "left", "ring A2")).toBe("Left finger - ring A2");
    expect(bodyPartLabel("shoulder", "both", "")).toBe("Both shoulders");
    expect(bodyPartLabel("back", undefined, undefined)).toBe("Back");
    expect(bodyPartLabel("other", undefined, "Neck-ish")).toBe("Neck-ish");
  });
  it("watches the finger-load categories for hand and forearm regions only", () => {
    expect(defaultWatchCategories("wrist", ["Fingers", "Power"])).toEqual(["Fingers", "Power"]);
    expect(defaultWatchCategories("knee", ["Fingers"])).toEqual([]);
  });
});

describe("issuesTouchedBy", () => {
  const types = [{ id: "hb", name: "Hangboard", category: "Fingers", parameters: [] }, { id: "run", name: "Run", category: "Cardio", parameters: [] }];
  const finger: PainIssue = { id: "f", bodyPart: "Finger", startDate: "2026-09-01", watchCategories: ["Fingers"] };
  const healed: PainIssue = { ...finger, id: "h", endDate: "2026-09-10" };
  it("finds active issues watching a category the session uses (slot override or type)", () => {
    expect(issuesTouchedBy({ exercises: [{ id: "s", typeId: "hb" }] }, [finger, healed], types).map((i) => i.id)).toEqual(["f"]);
    expect(issuesTouchedBy({ exercises: [{ id: "s", typeId: "run" }] }, [finger], types)).toEqual([]);
    expect(issuesTouchedBy({ exercises: [{ id: "s", typeId: "run", categoryId: "c1" }] }, [finger], types, [{ id: "c1", name: "Fingers", color: "" }]).map((i) => i.id)).toEqual(["f"]);
  });
});

describe("painLevelOn", () => {
  const issues: PainIssue[] = [
    { id: "a", bodyPart: "Elbow", startDate: "2026-09-01", endDate: "2026-09-20" },
    { id: "b", bodyPart: "Knee", startDate: "2026-09-10" },
  ];
  const logs = [
    log("1", "2026-09-01", "Elbow", 6, { issueId: "a" }),
    log("2", "2026-09-10", "Knee", 2, { issueId: "b" }),
    log("3", "2026-09-15", "Elbow", 3, { issueId: "a" }),
  ];
  it("is the worst open issue at its latest check-in on or before the day", () => {
    expect(painLevelOn(issues, logs, "2026-09-12")).toEqual({ level: 6, label: "Elbow" });
    expect(painLevelOn(issues, logs, "2026-09-16")).toEqual({ level: 3, label: "Elbow" });
  });
  it("drops an issue from its end day on, and is undefined with nothing open", () => {
    expect(painLevelOn(issues, logs, "2026-09-20")).toEqual({ level: 2, label: "Knee" });
    expect(painLevelOn(issues, logs, "2026-08-20")).toBeUndefined();
  });
});
