import { describe, it, expect } from "vitest";
import { groupChips } from "./exerciseChips";

const ex = (...names: string[]) => names.map((name, i) => ({ name, id: i }));

describe("groupChips", () => {
  it("folds identical names into one chip with a count", () => {
    const chips = groupChips(ex("Core Training", "Core Training", "Core Training"), "Board Session");
    expect(chips.map((c) => c.label)).toEqual(["Core Training ×3"]);
  });
  it("drops a chip that only repeats the session's title", () => {
    const chips = groupChips(ex("Board Session", "Core Training", "Core Training"), "Board Session");
    expect(chips.map((c) => c.label)).toEqual(["Core Training ×2"]);
  });
  it("matches names without regard to case and spaces, and keeps the order of first appearance", () => {
    const chips = groupChips(ex("Hangboard", "core training", " Core Training", "Hangboard"), "dynamic moves");
    expect(chips.map((c) => [c.name, c.count])).toEqual([["Hangboard", 2], ["core training", 2]]);
  });
  it("keeps the first exercise of a group, for its colour", () => {
    const chips = groupChips(ex("A", "B", "A"), "T");
    expect(chips[0].first).toEqual({ name: "A", id: 0 });
  });
  it("is empty when every exercise repeats the title", () => {
    expect(groupChips(ex("Free Bouldering"), "Free Bouldering")).toEqual([]);
  });
});
