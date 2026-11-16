import { describe, it, expect } from "vitest";
import { repairSlots, settleDrop, DND_PLACEHOLDER_ID, DND_SHADOW_MARKER } from "./slotList";
import type { ExerciseSlot } from "../types";

function slot(id: string, typeId = `type-${id}`, extra: Partial<ExerciseSlot> = {}): ExerciseSlot {
  return { id, typeId, prescribed: { sets: 3 }, ...extra };
}

function ids(): () => string {
  let n = 0;
  return () => `new-${++n}`;
}

describe("repairSlots", () => {
  it("returns a sound list as the same array", () => {
    const list = [slot("a"), slot("b")];
    expect(repairSlots(list, ids())).toBe(list);
  });

  it("drops a copy that repeats an id", () => {
    const list = [slot("a"), slot("b"), slot("a")];
    expect(repairSlots(list, ids()).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("keeps a different slot that reuses an id, under a new id", () => {
    const list = [slot("a"), slot("a", "other-type")];
    const out = repairSlots(list, ids());
    expect(out.map((s) => [s.id, s.typeId])).toEqual([["a", "type-a"], ["new-1", "other-type"]]);
  });

  it("turns a stored drag stand-in back into an exercise when its original is gone", () => {
    // What a cut-short drag left behind: c's card replaced by the stand-in.
    const standIn = { ...slot("c"), id: DND_PLACEHOLDER_ID, [DND_SHADOW_MARKER]: true } as ExerciseSlot;
    const out = repairSlots([slot("a"), standIn, slot("d")], ids());
    expect(out.map((s) => s.id)).toEqual(["a", "new-1", "d"]);
    expect(out[1].typeId).toBe("type-c");
    expect(DND_SHADOW_MARKER in out[1]).toBe(false);
  });

  it("drops a stand-in whose original is still there, and gives two stand-ins distinct ids", () => {
    const copyOfA = { ...slot("a"), id: DND_PLACEHOLDER_ID, [DND_SHADOW_MARKER]: true } as ExerciseSlot;
    const standInB = { ...slot("b"), id: DND_PLACEHOLDER_ID, [DND_SHADOW_MARKER]: true } as ExerciseSlot;
    const standInC = { ...slot("c"), id: DND_PLACEHOLDER_ID, [DND_SHADOW_MARKER]: true } as ExerciseSlot;
    const out = repairSlots([slot("a"), copyOfA, standInB, standInC], ids());
    expect(out.map((s) => s.id)).toEqual(["a", "new-1", "new-2"]);
    expect(out.map((s) => s.typeId)).toEqual(["type-a", "type-b", "type-c"]);
  });

  it("strips the drag marker from a slot that kept its own id", () => {
    const marked = { ...slot("a"), [DND_SHADOW_MARKER]: true } as ExerciseSlot;
    const out = repairSlots([marked], ids());
    expect(out).toEqual([slot("a")]);
  });
});

describe("settleDrop", () => {
  const a = slot("a"), b = slot("b"), c = slot("c");

  it("takes the dropped order", () => {
    expect(settleDrop([a, b, c], [c, a, b])).toEqual([c, a, b]);
  });

  it("uses the session's own slots, not the dragged copies", () => {
    const stale = { ...b, prescribed: { sets: 1 } };
    expect(settleDrop([a, b], [stale, a])[0]).toBe(b);
  });

  it("ignores stand-ins, unknown ids and repeats", () => {
    const standIn = { ...a, id: DND_PLACEHOLDER_ID, [DND_SHADOW_MARKER]: true };
    expect(settleDrop([a, b, c], [b, standIn, { id: "ghost" }, b, a, c])).toEqual([b, a, c]);
  });

  it("puts a slot the drop lost back at its old place", () => {
    expect(settleDrop([a, b, c], [a, c])).toEqual([a, b, c]);
    expect(settleDrop([a, b, c], [])).toEqual([a, b, c]);
  });
});
