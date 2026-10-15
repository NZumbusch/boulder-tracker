import { describe, it, expect } from "vitest";
import { adjacentRuns } from "./joinRuns";

describe("adjacentRuns", () => {
  it("splits at every gap, so a line is never drawn across empty columns", () => {
    expect(adjacentRuns([2, 3, 4, 8, 9, 15])).toEqual([[2, 3, 4], [8, 9], [15]]);
  });
  it("keeps two sends with weeks between them apart", () => {
    expect(adjacentRuns([1, 9])).toEqual([[1], [9]]);
  });
  it("handles none and one", () => {
    expect(adjacentRuns([])).toEqual([]);
    expect(adjacentRuns([4])).toEqual([[4]]);
  });
});
