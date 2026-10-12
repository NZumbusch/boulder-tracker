import { describe, it, expect } from "vitest";
import { RELEASE_NOTES, unseenNotes, type ReleaseNote } from "./releaseNotes";

const notes: ReleaseNote[] = [
  { id: "c", title: "C", points: [] },
  { id: "b", title: "B", points: [] },
  { id: "a", title: "A", points: [] },
];

describe("unseenNotes", () => {
  it("everything for a device that has seen nothing, only the newer ones otherwise", () => {
    expect(unseenNotes(null, notes).map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(unseenNotes("a", notes).map((n) => n.id)).toEqual(["c", "b"]);
    expect(unseenNotes("c", notes)).toEqual([]);
  });
  it("shows everything again when the remembered note is unknown (rolled back or edited)", () => {
    expect(unseenNotes("zzz", notes)).toHaveLength(3);
  });
});

describe("the shipped notes", () => {
  it("have unique ids, newest first by date, and each says something", () => {
    const ids = RELEASE_NOTES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort().reverse()).toEqual(ids.slice().sort().reverse());
    for (const n of RELEASE_NOTES) {
      expect(n.title.length).toBeGreaterThan(3);
      expect(n.points.length).toBeGreaterThan(0);
    }
  });
});
