import { describe, it, expect } from "vitest";
import type { OutdoorAscent } from "../types";
import { filterSends } from "./filter";

const asOf = new Date("2026-09-23T12:00:00Z");
const s = (id: string, grade: string, date: string): OutdoorAscent => ({ id, grade, date });
const sends = [s("a", "7A", "2026-09-01"), s("b", "7a", "2025-06-01"), s("c", "6B", "2026-08-01")];

describe("filterSends", () => {
  it("keeps everything with no filter", () => {
    expect(filterSends(sends, "all", null, asOf).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("filters by grade regardless of case", () => {
    expect(filterSends(sends, "all", "7A", asOf).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("combines the 12-month window with the grade", () => {
    expect(filterSends(sends, "year", "7A", asOf).map((x) => x.id)).toEqual(["a"]);
    expect(filterSends(sends, "year", null, asOf).map((x) => x.id)).toEqual(["a", "c"]);
  });
});
