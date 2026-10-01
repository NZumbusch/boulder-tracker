import { describe, it, expect } from "vitest";
import { restoreDefaultCategories } from "./categories";

const defaults = [{ id: "cat-1", name: "Fingers", color: "bg-indigo-500" }, { id: "cat-2", name: "Core", color: "bg-sky-500" }];

describe("restoreDefaultCategories", () => {
  it("puts back renamed, recoloured and archived built-ins and re-adds missing ones", () => {
    const out = restoreDefaultCategories([{ id: "cat-1", name: "Digits", color: "red", archived: true }], defaults);
    expect(out).toEqual(defaults);
  });
  it("keeps categories of your own, in place", () => {
    const mine = { id: "mine", name: "Slab", color: "blue" };
    const out = restoreDefaultCategories([mine, { id: "cat-2", name: "X", color: "y" }], defaults);
    expect(out.map((c) => c.id)).toEqual(["mine", "cat-2", "cat-1"]);
    expect(out[0]).toEqual(mine);
  });
});
