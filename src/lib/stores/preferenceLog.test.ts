import { describe, it, expect } from "vitest";
import { changedPreferenceKeys } from "./preferencesStore.svelte";

describe("changedPreferenceKeys", () => {
  it("names changed settings, one level into objects", () => {
    expect(changedPreferenceKeys(
      { theme: "light", tunables: { a: 1, b: 2 }, list: [1] },
      { theme: "dark", tunables: { a: 1, b: 3, c: 4 }, list: [1] },
    )).toEqual(["theme", "tunables.b", "tunables.c"]);
  });

  it("is empty when nothing changed", () => {
    expect(changedPreferenceKeys({ a: { b: 1 } }, { a: { b: 1 } })).toEqual([]);
  });
});
