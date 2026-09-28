import { describe, expect, it } from "vitest";
import type { ExerciseTypeDef, Workout } from "../types";
import { exerciseGroup, groupTypes, groupNames, searchTypes, typeUsage, isTypeReferenced, recentTypes, renameGroup } from "./library";

const type = (id: string, name: string, extra: Partial<ExerciseTypeDef> = {}): ExerciseTypeDef => ({ id, name, category: "Mobility", parameters: ["duration"], ...extra });
const workout = (date: string | null, typeIds: string[]): Workout => ({
  id: `w-${date}-${typeIds.join()}`,
  weekId: "2026-W40",
  status: "completed",
  date,
  loadFactor: 0,
  exercises: typeIds.map((typeId, i) => ({ id: `s${i}`, typeId })),
});

const types = [
  type("hip", "Hip flexor stretch", { group: "Stretching", description: "Half kneeling, squeeze the glute" }),
  type("pigeon", "Pigeon pose", { group: "Stretching" }),
  type("hang", "Max Hangs", { category: "Fingers" }),
  type("old", "Old drill", { group: "Stretching", archived: true }),
];

describe("exerciseGroup", () => {
  it("is the type's own group, else its category, else Other", () => {
    expect(exerciseGroup(types[0])).toBe("Stretching");
    expect(exerciseGroup(types[2])).toBe("Fingers");
    expect(exerciseGroup({ group: "  ", category: "" })).toBe("Other");
  });
});

describe("groupTypes / groupNames", () => {
  it("groups A-Z with types A-Z, leaving archived ones out", () => {
    expect(groupTypes(types).map((g) => [g.name, g.types.map((t) => t.id)])).toEqual([
      ["Fingers", ["hang"]],
      ["Stretching", ["hip", "pigeon"]],
    ]);
    expect(groupNames(types)).toEqual(["Fingers", "Stretching"]);
  });

  it("includes archived ones on request", () => {
    expect(groupTypes(types, { includeArchived: true }).find((g) => g.name === "Stretching")!.types.map((t) => t.id)).toEqual(["hip", "old", "pigeon"]);
  });
});

describe("searchTypes", () => {
  it("returns everything for an empty query", () => {
    expect(searchTypes(types, "  ")).toHaveLength(4);
  });

  it("needs every word somewhere, ranking name matches first", () => {
    expect(searchTypes(types, "stretch").map((t) => t.id)).toEqual(["hip", "old", "pigeon"]);
    expect(searchTypes(types, "glute").map((t) => t.id)).toEqual(["hip"]);
    expect(searchTypes(types, "hip glute").map((t) => t.id)).toEqual(["hip"]);
    expect(searchTypes(types, "hip nothing")).toEqual([]);
  });

  it("puts names starting with the query ahead of other name matches", () => {
    const list = [type("a", "Weighted pull-ups"), type("b", "Pull-up negatives")];
    expect(searchTypes(list, "pull").map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("ignores case and accents", () => {
    expect(searchTypes([type("a", "Épaule")], "epau").map((t) => t.id)).toEqual(["a"]);
  });
});

describe("typeUsage / recentTypes", () => {
  const workouts = [workout("2026-09-01", ["hip", "hip"]), workout("2026-09-20", ["pigeon"]), workout(null, ["hang"]), workout("2026-09-10", ["old"])];

  it("counts exercises in dated sessions and keeps the latest date", () => {
    const u = typeUsage(workouts);
    expect(u.get("hip")).toEqual({ count: 2, lastUsed: "2026-09-01" });
    expect(u.get("pigeon")).toEqual({ count: 1, lastUsed: "2026-09-20" });
    expect(u.has("hang")).toBe(false);
  });

  it("doesn't count sessions after today as used", () => {
    const u = typeUsage([workout("2026-09-30", ["hip"]), workout("2026-09-01", ["hip"])], "2026-09-28");
    expect(u.get("hip")).toEqual({ count: 2, lastUsed: "2026-09-01" });
  });

  it("lists recently used, non-archived types newest first", () => {
    expect(recentTypes(types, typeUsage(workouts)).map((t) => t.id)).toEqual(["pigeon", "hip"]);
  });
});

describe("isTypeReferenced", () => {
  const none = { workouts: [], templates: {}, circuits: [] };
  it("finds sessions (dated or not), phase weeks and saved circuits", () => {
    expect(isTypeReferenced("hang", none)).toBe(false);
    expect(isTypeReferenced("hang", { ...none, workouts: [workout(null, ["hang"])] })).toBe(true);
    expect(isTypeReferenced("hang", { ...none, templates: { p: [{ id: "t", name: "x", exercises: [{ id: "s", typeId: "hang" }] } as never] } })).toBe(true);
    expect(isTypeReferenced("hang", { ...none, circuits: [{ id: "c", name: "c", rounds: 1, exercises: [{ id: "s", typeId: "hang" }] }] })).toBe(true);
  });
});

describe("renameGroup", () => {
  it("moves every type in the group, archived ones too, and leaves others alone", () => {
    const next = renameGroup(types, "Stretching", "Mobility work");
    expect(next.filter((t) => t.group === "Mobility work").map((t) => t.id)).toEqual(["hip", "pigeon", "old"]);
    expect(next.find((t) => t.id === "hang")).toBe(types[2]);
  });

  it("renames a derived group (from the category) too", () => {
    expect(renameGroup(types, "Fingers", "Fingerboard").find((t) => t.id === "hang")!.group).toBe("Fingerboard");
  });

  it("ignores a blank or unchanged name", () => {
    expect(renameGroup(types, "Stretching", " ")).toBe(types);
  });
});
