import { describe, it, expect } from "vitest";
import type { OutdoorAscent } from "../types";
import { sendStats } from "./stats";

const a = (grade: string, style: string | undefined, date: string): OutdoorAscent => ({ id: grade + date, grade, style, date, name: grade }) as OutdoorAscent;

describe("sendStats", () => {
  const list = [a("7A", "Flash", "2026-10-01"), a("6C", "Redpoint", "2026-09-20"), a("7B", "Redpoint", "2026-08-01"), a("6B", "Onsight", "2026-10-05"), a("6A", undefined, "2026-05-01")];
  const s = sendStats(list, new Date("2026-10-11T12:00:00Z"));

  it("counts, finds the hardest and the hardest on the first go", () => {
    expect(s.count).toBe(5);
    expect(s.hardest?.grade).toBe("7B");
    expect(s.hardestFirstGo?.grade).toBe("7A");
  });
  it("rates first-go among the sends that have a style, and counts the last 28 days", () => {
    expect(s.firstGoRate).toBeCloseTo(2 / 4, 5);
    expect(s.recent).toBe(3);
  });
  it("copes with none", () => {
    expect(sendStats([])).toEqual({ count: 0, hardest: undefined, hardestFirstGo: undefined, recent: 0 });
  });
});
