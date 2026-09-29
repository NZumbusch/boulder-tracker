import { describe, it, expect } from "vitest";
import { painReminderText } from "./painReminder";

describe("painReminderText", () => {
  const issues = [
    { id: "a", bodyPart: "Left elbow", startDate: "2026-09-01" },
    { id: "b", bodyPart: "Right knee", startDate: "2026-09-01" },
    { id: "c", bodyPart: "Old", startDate: "2026-08-01", endDate: "2026-08-10" },
  ];
  const logs = [{ id: "1", date: "2026-09-28", weekId: "w", bodyPart: "Left elbow", severity: 3, issueId: "a" }];
  it("names the open issues not checked in for the set number of days", () => {
    expect(painReminderText(issues, logs, "2026-09-29", 3)).toBe("How's your right knee? A tap in the app keeps its history straight.");
    expect(painReminderText(issues, [], "2026-09-29", 3)).toContain("Left elbow and Right knee");
  });
  it("is null when everything is recent", () => {
    expect(painReminderText(issues.slice(0, 1), logs, "2026-09-29", 3)).toBeNull();
  });
});
