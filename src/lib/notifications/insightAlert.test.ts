import { describe, it, expect } from "vitest";
import type { Insight } from "../analytics/insights";
import { alertInsights, insightAlertText, nextAlertTime } from "./insightAlert";
import { reminderTypeOf } from "./shared";
import { insightAlertId } from "./insightAlert";

const f = (id: string, tone: Insight["tone"], title = id, detail?: string): Insight => ({ id, group: "push", tone, title, detail });

describe("insight alerts", () => {
  it("only the serious findings, a run of training days and an HRV dip are worth a notification", () => {
    const list = [f("acwr", "risk"), f("fatigue", "caution"), f("streak", "caution"), f("hrv", "caution"), f("sends", "info"), f("record", "good")];
    expect(alertInsights(list).map((i) => i.id)).toEqual(["acwr", "streak", "hrv"]);
  });

  it("words one notification from the first, saying how many more there are", () => {
    expect(insightAlertText([f("acwr", "risk", "Load is 1.80× your usual week", "5,000 against 2,800.")])).toEqual({ title: "Load is 1.80× your usual week", body: "5,000 against 2,800." });
    expect(insightAlertText([f("acwr", "risk", "A", "x"), f("streak", "caution", "B")])?.body).toBe("x (+1 more in Insights)");
    expect(insightAlertText([f("record", "good")])).toBeNull();
  });

  it("is due at the hour today if it hasn't come, else tomorrow", () => {
    expect(nextAlertTime(new Date(2026, 9, 11, 6, 30), 8)).toEqual(new Date(2026, 9, 11, 8, 0));
    expect(nextAlertTime(new Date(2026, 9, 11, 9, 30), 8)).toEqual(new Date(2026, 9, 12, 8, 0));
  });

  it("has its own slice of notification ids", () => {
    expect(reminderTypeOf(insightAlertId())).toBe("insight");
  });
});
