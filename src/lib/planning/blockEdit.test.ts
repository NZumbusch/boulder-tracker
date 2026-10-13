import { describe, it, expect } from "vitest";
import { carveBlocks, placeBlock, startPhaseOn, describeBlockChanges, daysWithoutPhase } from "./blockEdit";
import type { TrainingBlock } from "../types";

const b = (id: string, startDate: string, endDate: string, over: Partial<TrainingBlock> = {}): TrainingBlock => ({ id, name: id, phaseId: `ph-${id}`, startDate, endDate, ...over });
let n = 0;
const newId = () => `new${++n}`;
const show = (blocks: TrainingBlock[]) => blocks.map((x) => `${x.id}:${x.startDate}..${x.endDate}`);

describe("carveBlocks", () => {
  const blocks = [b("a", "2026-09-14", "2026-10-25"), b("b", "2026-09-28", "2026-10-11"), b("c", "2026-12-07", "2026-12-20")];
  it("trims, splits and drops blocks around a range", () => {
    expect(show(carveBlocks(blocks, "2026-09-28", "2026-10-11", () => "new"))).toEqual(["a:2026-09-14..2026-09-27", "new:2026-10-12..2026-10-25", "c:2026-12-07..2026-12-20"]);
  });
  it("only touches the blocks it is asked to", () => {
    expect(show(carveBlocks(blocks, "2026-09-28", "2026-10-11", () => "new", (x) => x.id === "b"))).toEqual(["a:2026-09-14..2026-10-25", "c:2026-12-07..2026-12-20"]);
  });
});

describe("placeBlock", () => {
  const cap = b("cap", "2026-10-05", "2026-10-25");
  it("adds a block and shortens a neighbour of the same priority that it overlaps", () => {
    const out = placeBlock([cap], b("pow", "2026-10-14", "2026-10-31"), newId);
    expect(show(out)).toEqual(["cap:2026-10-05..2026-10-13", "pow:2026-10-14..2026-10-31"]);
  });
  it("splits a block it lands inside, keeping the later part", () => {
    const out = placeBlock([cap], b("peak", "2026-10-12", "2026-10-14"), newId);
    expect(show(out).slice(0, 3)).toEqual(["cap:2026-10-05..2026-10-11", expect.stringMatching(/^new\d+:2026-10-15\.\.2026-10-25$/), "peak:2026-10-12..2026-10-14"]);
    expect(out.find((x) => x.startDate === "2026-10-15")).toMatchObject({ name: "cap", phaseId: "ph-cap" });
  });
  it("removes a block it covers completely", () => {
    expect(show(placeBlock([b("old", "2026-10-07", "2026-10-09")], b("new", "2026-10-05", "2026-10-11"), newId))).toEqual(["new:2026-10-05..2026-10-11"]);
  });
  it("leaves a block of another priority alone - concurrent emphases are on purpose", () => {
    const out = placeBlock([cap], b("comp", "2026-10-12", "2026-10-14", { priority: 2 }), newId);
    expect(show(out)).toEqual(["cap:2026-10-05..2026-10-25", "comp:2026-10-12..2026-10-14"]);
  });
  it("editing a block replaces it where it stood and does not carve itself", () => {
    const out = placeBlock([cap, b("next", "2026-10-26", "2026-11-08")], { ...cap, endDate: "2026-10-28" }, newId);
    expect(show(out)).toEqual(["cap:2026-10-05..2026-10-28", "next:2026-10-29..2026-11-08"]);
  });
  it("keeps the order of the others", () => {
    const out = placeBlock([b("x", "2026-01-01", "2026-01-07"), cap, b("y", "2026-12-01", "2026-12-07")], b("pow", "2026-10-20", "2026-10-30"), newId);
    expect(out.map((x) => x.id)).toEqual(["x", "cap", "y", "pow"]);
  });
});

describe("startPhaseOn", () => {
  const blocks = [b("cap", "2026-10-05", "2026-10-25")];
  it("starts a phase on a day and runs it to where the block there ended; the block before is cut short", () => {
    const out = startPhaseOn(blocks, "2026-10-14", { id: "ph-pow", name: "Power" }, newId);
    expect(show(out)).toEqual(["cap:2026-10-05..2026-10-13", expect.stringMatching(/^new\d+:2026-10-14\.\.2026-10-25$/)]);
    expect(out[1]).toMatchObject({ name: "Power", phaseId: "ph-pow" });
  });
  it("on the day a block starts, takes the block's place", () => {
    const out = startPhaseOn(blocks, "2026-10-05", { id: "ph-pow", name: "Power" }, newId);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Power", startDate: "2026-10-05", endDate: "2026-10-25" });
  });
  it("on a day no block covers, runs to the end of that week", () => {
    const out = startPhaseOn(blocks, "2026-11-03", { id: "ph-pow", name: "Power" }, newId); // a Tuesday
    expect(out[1]).toMatchObject({ startDate: "2026-11-03", endDate: "2026-11-08" });
  });
  it("replaces what shows on that day - the block that wins there, with its priority - and leaves a lower-priority one underneath alone", () => {
    const withComp = [...blocks, b("comp", "2026-10-10", "2026-10-30", { priority: 2 })];
    const out = startPhaseOn(withComp, "2026-10-14", { id: "ph-pow", name: "Power" }, newId);
    expect(out.find((x) => x.id === "cap")).toMatchObject({ startDate: "2026-10-05", endDate: "2026-10-25" });
    expect(out.find((x) => x.id === "comp")).toMatchObject({ startDate: "2026-10-10", endDate: "2026-10-13" });
    expect(out.find((x) => x.phaseId === "ph-pow")).toMatchObject({ startDate: "2026-10-14", endDate: "2026-10-30", priority: 2 });
  });
});

describe("describeBlockChanges", () => {
  it("says what happened to the other blocks, in words", () => {
    const before = [b("cap", "2026-10-05", "2026-10-25", { name: "Capacity" }), b("del", "2026-10-26", "2026-11-01", { name: "Deload" })];
    const after = placeBlock(before, b("pow", "2026-10-14", "2026-11-01", { name: "Power" }), newId);
    expect(describeBlockChanges(before, after, "pow")).toEqual(["Capacity now ends 13 Oct", "Deload is replaced"]);
  });
  it("mentions a split", () => {
    const before = [b("cap", "2026-10-05", "2026-10-25", { name: "Capacity" })];
    const after = placeBlock(before, b("peak", "2026-10-12", "2026-10-14", { name: "Peak" }), newId);
    expect(describeBlockChanges(before, after, "peak")).toEqual(["Capacity is split: 5 Oct – 11 Oct and 15 Oct – 25 Oct"]);
  });
  it("is empty when nothing else changed", () => {
    const before = [b("cap", "2026-10-05", "2026-10-25")];
    expect(describeBlockChanges(before, placeBlock(before, b("x", "2026-11-01", "2026-11-07"), newId), "x")).toEqual([]);
  });
});

describe("daysWithoutPhase", () => {
  it("lists the days that had a phase and no longer do, as ranges", () => {
    const before = [b("a", "2026-10-05", "2026-10-25")];
    const after = [b("a", "2026-10-05", "2026-10-11"), b("a2", "2026-10-20", "2026-10-25")];
    expect(daysWithoutPhase(before, after)).toEqual([{ from: "2026-10-12", to: "2026-10-19" }]);
  });
  it("is empty when every covered day is still covered", () => {
    const before = [b("a", "2026-10-05", "2026-10-25")];
    expect(daysWithoutPhase(before, [b("a", "2026-10-05", "2026-10-30")])).toEqual([]);
  });
});
