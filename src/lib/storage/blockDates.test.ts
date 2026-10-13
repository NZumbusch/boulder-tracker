import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem: vi.fn(async () => {}), getItem: vi.fn(async () => null) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState } from "./persistence";
import { coalesceBlocks } from "../planning/trainingBlocks";
import { weekMondayIso, weekSundayIso } from "../dateUtils";
import type { TrainingBlock } from "../types";

const blk = (id: string, from: string, to: string, over: Partial<TrainingBlock> = {}): TrainingBlock => ({ id, name: "Capacity", phaseId: "phase-capacity", startDate: weekMondayIso(from), endDate: weekSundayIso(to), ...over });

beforeEach(() => setDbState({ workouts: [], benchmarks: [], trainingBlocks: [], dismissedSessions: [], weekNotes: [], exerciseTypes: [], phaseDefs: [{ id: "phase-capacity", name: "Capacity", color: "bg-amber-500", order: 1 }], templates: {} }));

describe("blocks are stored as days", () => {
  it("saveTrainingBlock keeps a mid-week range exactly", async () => {
    await storage.saveTrainingBlock(blk("a", "2026-W41", "2026-W42", { startDate: "2026-10-07", endDate: "2026-10-15" }));
    expect((await storage.getTrainingBlocks())[0]).toMatchObject({ startDate: "2026-10-07", endDate: "2026-10-15" });
  });

  it("blocks merged into one take the later end date", async () => {
    await storage.saveTrainingBlock(blk("a", "2026-W41", "2026-W41"));
    await storage.saveTrainingBlock(blk("b", "2026-W42", "2026-W43"));
    const all = await storage.getTrainingBlocks();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: "a", startDate: "2026-10-05", endDate: "2026-10-25" });
  });

  it("saveTrainingBlocks replaces the whole list in one write, merging blocks of one phase that touch", async () => {
    await storage.saveTrainingBlock(blk("old", "2026-W30", "2026-W30"));
    await storage.saveTrainingBlocks([blk("a", "2026-W41", "2026-W41", { endDate: "2026-10-07" }), blk("b", "2026-W41", "2026-W42", { startDate: "2026-10-08" }), blk("z", "2026-W50", "2026-W50", { phaseId: "phase-other", name: "Other" })]);
    expect((await storage.getTrainingBlocks()).map((x) => `${x.id}:${x.startDate}..${x.endDate}`)).toEqual(["a:2026-10-05..2026-10-18", "z:2026-12-07..2026-12-13"]);
  });

  it("blocks that touch day to day merge, even when they start mid-week", () => {
    const { blocks, remap } = coalesceBlocks([blk("a", "2026-W41", "2026-W41", { endDate: "2026-10-07" }), blk("b", "2026-W41", "2026-W42", { startDate: "2026-10-08" })]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ id: "a", startDate: "2026-10-05", endDate: "2026-10-18" });
    expect(remap).toEqual({ b: "a" });
  });

  it("a gap of a day keeps them apart", () => {
    const { blocks } = coalesceBlocks([blk("a", "2026-W41", "2026-W41", { endDate: "2026-10-07" }), blk("b", "2026-W41", "2026-W42", { startDate: "2026-10-09" })]);
    expect(blocks).toHaveLength(2);
  });
});
