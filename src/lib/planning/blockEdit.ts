import type { TrainingBlock } from "../types";
import { addDaysIso, weekIdOfIso, weekSundayIso } from "../dateUtils";
import { phaseOnDay } from "./trainingBlocks";

/*
 * Editing phases as ranges of days. A block placed over days another block
 * of the same priority has takes them (the other is shortened, split or
 * removed), so a phase never lies on top of another by accident; a block of
 * a different priority is a concurrent emphasis on purpose and is left alone.
 * Pure: the caller saves the result.
 */

/** Removes the days [start, end] ("YYYY-MM-DD") from the blocks `only` accepts (all by default), splitting a block that straddles them. */
export function carveBlocks(blocks: TrainingBlock[], start: string, end: string, newId: () => string, only: (b: TrainingBlock) => boolean = () => true): TrainingBlock[] {
  const result: TrainingBlock[] = [];
  for (const b of blocks) {
    if (!only(b) || b.endDate < start || b.startDate > end) {
      result.push(b);
      continue;
    }
    if (b.startDate < start) result.push({ ...b, endDate: addDaysIso(start, -1) });
    if (b.endDate > end) result.push({ ...b, id: b.startDate < start ? newId() : b.id, startDate: addDaysIso(end, 1) });
  }
  return result;
}

/**
 * The blocks with `block` added (or, when its id is already there,
 * replaced where it stood), the same-priority blocks it overlaps carved away.
 */
export function placeBlock(blocks: TrainingBlock[], block: TrainingBlock, newId: () => string): TrainingBlock[] {
  const priority = block.priority ?? 0;
  const at = blocks.findIndex((b) => b.id === block.id);
  const others = blocks.filter((b) => b.id !== block.id);
  const carved = carveBlocks(others, block.startDate, block.endDate, newId, (b) => (b.priority ?? 0) === priority);
  if (at === -1) return [...carved, block];
  // Back where it stood: after the blocks that came before it (a split piece sits with the block it came from).
  const before = new Set(blocks.slice(0, at).map((b) => b.id));
  const index = carved.findIndex((b) => !before.has(b.id) && blocks.findIndex((x) => x.id === b.id) >= at);
  return index === -1 ? [...carved, block] : [...carved.slice(0, index), block, ...carved.slice(index)];
}

/**
 * Starts `phase` on `isoDate`: it runs to where the block there ended (so
 * the rest of that stretch isn't lost), or to the end of the week when no
 * block is there. The block before is cut short; a block starting that very
 * day is replaced.
 */
export function startPhaseOn(blocks: TrainingBlock[], isoDate: string, phase: { id: string; name: string }, newId: () => string): TrainingBlock[] {
  const here = phaseOnDay(blocks, isoDate);
  const endDate = here ? here.endDate : weekSundayIso(weekIdOfIso(isoDate));
  const block: TrainingBlock = { id: newId(), name: phase.name, phaseId: phase.id, startDate: isoDate, endDate, ...(here?.priority ? { priority: here.priority } : {}) };
  return placeBlock(blocks, block, newId);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "7 Oct". */
export const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** What placing a block did to the others, in words for the Block manager ("Capacity now ends 13 Oct"). */
export function describeBlockChanges(before: TrainingBlock[], after: TrainingBlock[], placedId: string): string[] {
  const lines: string[] = [];
  for (const old of before) {
    if (old.id === placedId) continue;
    const now = after.find((b) => b.id === old.id);
    const pieces = after.filter((b) => b.id !== old.id && b.id !== placedId && !before.some((x) => x.id === b.id) && b.phaseId === old.phaseId && b.name === old.name);
    if (!now && pieces.length === 0) lines.push(`${old.name} is replaced`);
    else if (now && pieces.length > 0) lines.push(`${old.name} is split: ${shortDate(now.startDate)} – ${shortDate(now.endDate)} and ${pieces.map((p) => `${shortDate(p.startDate)} – ${shortDate(p.endDate)}`).join(", ")}`);
    else if (!now) lines.push(`${old.name} now runs ${pieces.map((p) => `${shortDate(p.startDate)} – ${shortDate(p.endDate)}`).join(", ")}`);
    else if (now.startDate !== old.startDate && now.endDate !== old.endDate) lines.push(`${old.name} now runs ${shortDate(now.startDate)} – ${shortDate(now.endDate)}`);
    else if (now.endDate !== old.endDate) lines.push(`${old.name} now ends ${shortDate(now.endDate)}`);
    else if (now.startDate !== old.startDate) lines.push(`${old.name} now starts ${shortDate(now.startDate)}`);
  }
  return lines;
}

/** Days that had a phase before and have none after, as ranges - what an edit leaves uncovered. */
export function daysWithoutPhase(before: TrainingBlock[], after: TrainingBlock[]): { from: string; to: string }[] {
  const starts = before.map((b) => b.startDate).sort();
  const ends = before.map((b) => b.endDate).sort();
  if (starts.length === 0) return [];
  const out: { from: string; to: string }[] = [];
  let run: { from: string; to: string } | undefined;
  for (let day = starts[0]; day <= ends[ends.length - 1]; day = addDaysIso(day, 1)) {
    const lost = !!phaseOnDay(before, day) && !phaseOnDay(after, day);
    if (lost) {
      if (run) run.to = day;
      else out.push((run = { from: day, to: day }));
    } else run = undefined;
  }
  return out;
}
