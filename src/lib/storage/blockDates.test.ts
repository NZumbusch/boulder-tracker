import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("localforage", () => ({
  default: { config: vi.fn(), setItem: vi.fn(async () => {}), getItem: vi.fn(async () => null) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { storage } from "./index";
import { setDbState } from "./persistence";
import { coalesceBlocks } from "../planning/trainingBlocks";
import type { TrainingBlock } from "../types";

const blk = (id: string, from: string, to: string, over: Partial<TrainingBlock> = {}): TrainingBlock => ({ id, name: "Capacity", phaseId: "phase-capacity", startWeekId: from, endWeekId: to, ...over });

beforeEach(() => setDbState({ workouts: [], trainingBlocks: [], weekOverrides: [], weekNotes: [], exerciseTypes: [], phaseDefs: [{ id: "phase-capacity", name: "Capacity", color: "bg-amber-500", order: 1 }], templates: {} }));

describe("blocks are stored with their days", () => {
  it("saveTrainingBlock writes the days of the weeks, and again when the weeks change", async () => {
    await storage.saveTrainingBlock(blk("a", "2026-W41", "2026-W42"));
    expect((await storage.getTrainingBlocks())[0]).toMatchObject({ startDate: "2026-10-05", endDate: "2026-10-18" });
    const stored = (await storage.getTrainingBlocks())[0];
    await storage.saveTrainingBlock({ ...stored, endWeekId: "2026-W44" });
    expect((await storage.getTrainingBlocks())[0]).toMatchObject({ startDate: "2026-10-05", endDate: "2026-11-01" });
  });

  it("assignPhaseToWeek's new one-week block has them", async () => {
    await storage.assignPhaseToWeek("2026-W41", "phase-capacity");
    expect((await storage.getTrainingBlocks())[0]).toMatchObject({ startDate: "2026-10-05", endDate: "2026-10-11" });
  });

  it("applyPlanWrites (the AI's blocks) writes them", async () => {
    await storage.applyPlanWrites({ trainingBlocks: [blk("n", "2026-W52", "2027-W01")], weeks: [], weekNotes: [] });
    expect((await storage.getTrainingBlocks())[0]).toMatchObject({ startDate: "2026-12-21", endDate: "2027-01-10" });
  });

  it("blocks merged into one take the later end date too", async () => {
    await storage.saveTrainingBlock(blk("a", "2026-W41", "2026-W41"));
    await storage.saveTrainingBlock(blk("b", "2026-W42", "2026-W43"));
    const all = await storage.getTrainingBlocks();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: "a", endWeekId: "2026-W43", startDate: "2026-10-05", endDate: "2026-10-25" });
  });

  it("coalesceBlocks alone returns merged blocks with matching dates", () => {
    const { blocks } = coalesceBlocks([blk("a", "2026-W41", "2026-W41"), blk("b", "2026-W42", "2026-W42")]);
    expect(blocks[0]).toMatchObject({ startDate: "2026-10-05", endDate: "2026-10-18" });
  });
});
