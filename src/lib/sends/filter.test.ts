import { describe, it, expect } from "vitest";
import type { OutdoorAscent } from "../types";
import { filterSends, applySendFilters, EMPTY_SEND_FILTERS, type SendFilters } from "./filter";

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

describe("filterSends in V-scale", () => {
  it("matches a V band against the Font grades in it", () => {
    const band = [s("x", "6B", "2026-09-01"), s("y", "6B+", "2026-09-02"), s("z", "6C", "2026-09-03")];
    expect(filterSends(band, "all", "V4", asOf, "v").map((x) => x.id)).toEqual(["x", "y"]);
  });
});

describe("applySendFilters", () => {
  const full: OutdoorAscent[] = [
    { id: "a", grade: "7A", date: "2026-09-01", name: "Rainbow Rocket", crag: "Fontainebleau", style: "Flash", notes: "sloper top" },
    { id: "b", grade: "6B+", date: "2026-06-10", name: "La Marie-Rose", crag: "Fontainebleau", style: "Redpoint" },
    { id: "c", grade: "7B", date: "2026-07-20", name: "Dreamtime", crag: "Cresciano", style: "Redpoint" },
    { id: "d", grade: "?", date: "2026-07-21", name: "Unknown grade", crag: "Cresciano" },
  ];
  const ids = (f: Partial<SendFilters>) => applySendFilters(full, { ...EMPTY_SEND_FILTERS, ...f }).map((x) => x.id);

  it("keeps everything with empty filters", () => {
    expect(ids({})).toEqual(["a", "b", "c", "d"]);
  });

  it("searches name, crag and notes, ignoring case", () => {
    expect(ids({ search: "rocket" })).toEqual(["a"]);
    expect(ids({ search: "cresciano" })).toEqual(["c", "d"]);
    expect(ids({ search: "SLOPER" })).toEqual(["a"]);
  });

  it("includes both ends of the date range", () => {
    expect(ids({ from: "2026-07-20", to: "2026-09-01" })).toEqual(["a", "c", "d"]);
  });

  it("filters by grade range, leaving out grades it can't place", () => {
    expect(ids({ minGrade: "7A" })).toEqual(["a", "c"]);
    expect(ids({ maxGrade: "7A" })).toEqual(["a", "b"]);
    expect(ids({ minGrade: "6C", maxGrade: "7A+" })).toEqual(["a"]);
  });

  it("filters by style and crag", () => {
    expect(ids({ style: "Redpoint" })).toEqual(["b", "c"]);
    expect(ids({ crag: "Fontainebleau", style: "Redpoint" })).toEqual(["b"]);
  });
});
