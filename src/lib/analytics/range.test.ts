import { describe, it, expect } from "vitest";
import { buildBuckets, dayToX, bucketOfDay, weekStartDay } from "./range";
import { toUtcDayIndex } from "../dateUtils";

const NOW = new Date(2026, 8, 25, 10); // Fri 25 Sep 2026, local
const TODAY = toUtcDayIndex("2026-09-25");

describe("buildBuckets - weekly ranges", () => {
  it("draws 4, 13 and 26 week columns", () => {
    expect(buildBuckets("4w", 0, NOW)).toHaveLength(4);
    expect(buildBuckets("3m", 0, NOW)).toHaveLength(13);
    expect(buildBuckets("6m", 0, NOW)).toHaveLength(26);
  });

  it("keeps two weeks of plan ahead of today on 3M", () => {
    const b = buildBuckets("3m", 0, NOW);
    const current = b.findIndex((x) => x.isCurrent);
    expect(b[current].id).toBe("2026-W39");
    expect(b.length - 1 - current).toBe(2);
  });

  it("has contiguous Monday-Sunday spans", () => {
    const b = buildBuckets("3m", 0, NOW);
    for (let i = 1; i < b.length; i++) expect(b[i].startDay).toBe(b[i - 1].endDay + 1);
    expect(new Date(b[0].startDay * 86400000).getUTCDay()).toBe(1);
    expect(b[0].label).toMatch(/^W\d\d$/);
  });

  it("pages a whole window at a time", () => {
    const now = buildBuckets("4w", 0, NOW);
    const prev = buildBuckets("4w", -1, NOW);
    expect(prev[prev.length - 1].endDay + 1).toBe(now[0].startDay);
  });
});

describe("buildBuckets - year by month", () => {
  const year = buildBuckets("1y", 0, NOW);

  it("is twelve months ending with the current one", () => {
    expect(year).toHaveLength(12);
    expect(year[11].id).toBe("2026-09");
    expect(year[0].id).toBe("2025-10");
    expect(year[11].isCurrent).toBe(true);
  });

  it("gives every week to exactly one month, by its Thursday", () => {
    const all = year.flatMap((m) => m.weekIds);
    expect(new Set(all).size).toBe(all.length);
    for (let i = 1; i < year.length; i++) expect(year[i].startDay).toBe(year[i - 1].endDay + 1);
    // 2026-W40 starts Mon 28 Sep, Thursday is 1 Oct -> not September.
    expect(year[11].weekIds).not.toContain("2026-W40");
    expect(year[11].weekIds).toContain("2026-W39");
  });

  it("labels months by name alone", () => {
    expect(year.find((m) => m.id === "2026-01")!.label).not.toMatch(/\d/);
  });

  it("pages a year at a time", () => {
    expect(buildBuckets("1y", -1, NOW)[11].id).toBe("2025-09");
  });
});

describe("dayToX / bucketOfDay", () => {
  const b = buildBuckets("4w", 0, NOW);
  it("maps a column's first day to its left edge and clamps outside days", () => {
    expect(dayToX(b, b[1].startDay)).toBeCloseTo(25);
    expect(dayToX(b, b[0].startDay - 10)).toBe(0);
    expect(dayToX(b, b[3].endDay + 10)).toBe(100);
  });
  it("finds today's column", () => {
    expect(bucketOfDay(b, TODAY)?.isCurrent).toBe(true);
  });
  it("reads week starts as Mondays", () => {
    expect(weekStartDay("2026-W39")).toBe(toUtcDayIndex("2026-09-21"));
  });
});
