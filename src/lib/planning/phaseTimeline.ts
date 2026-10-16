import type { TrainingBlock } from "../types";
import { addDaysIso, toUtcDayIndex } from "../dateUtils";
import { placeBlock } from "./blockEdit";
import { phaseOnDay } from "./trainingBlocks";

/*
 * The phase page's operations on blocks, all pure (the caller saves the
 * result): resize and move through `placeBlock` (so a neighbour of the same
 * priority is trimmed, split or removed, as everywhere else), split, shift
 * a block and everything after it, repeat a cycle, and the checks that feed
 * the page - days with no phase, concurrent blocks, which lane a bar sits in.
 */

export const daysBetween = (from: string, to: string): number => toUtcDayIndex(to) - toUtcDayIndex(from);
/** Days a block covers, both ends counted. */
export const blockLength = (b: { startDate: string; endDate: string }): number => daysBetween(b.startDate, b.endDate) + 1;

/** The block with other first and last days (swapped when they are the wrong way round) placed over the rest. */
export function setBlockDays(blocks: TrainingBlock[], id: string, start: string, end: string, newId: () => string): TrainingBlock[] {
  const block = blocks.find((b) => b.id === id);
  if (!block) return blocks;
  const [startDate, endDate] = end < start ? [end, start] : [start, end];
  return placeBlock(blocks, { ...block, startDate, endDate }, newId);
}

/** The block moved by `days` (negative = earlier); with `following`, every block that starts on or after it moves too, keeping the gaps between them. */
export function shiftBlock(blocks: TrainingBlock[], id: string, days: number, following: boolean, newId: () => string): TrainingBlock[] {
  const block = blocks.find((b) => b.id === id);
  if (!block || days === 0) return blocks;
  if (!following) return setBlockDays(blocks, id, addDaysIso(block.startDate, days), addDaysIso(block.endDate, days), newId);
  return blocks.map((b) => (b.startDate >= block.startDate ? { ...b, startDate: addDaysIso(b.startDate, days), endDate: addDaysIso(b.endDate, days) } : b));
}

/** True when `at` is a day a block can be split on: after its first day, up to its last. */
export const canSplitAt = (b: TrainingBlock, at: string): boolean => at > b.startDate && at <= b.endDate;

/** The block cut in two: it ends the day before `at`, and a copy (new id, same phase, notes and priority) runs from `at`. */
export function splitBlock(blocks: TrainingBlock[], id: string, at: string, newId: () => string): TrainingBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  const block = blocks[i];
  if (!block || !canSplitAt(block, at)) return blocks;
  const second: TrainingBlock = { ...block, id: newId(), startDate: at };
  const next = [...blocks];
  next[i] = { ...block, endDate: addDaysIso(at, -1) };
  next.splice(i + 1, 0, second);
  return next;
}

/** The days a cycle of blocks spans, from the first day of the earliest to the last day of the latest. */
export function cycleSpan(blocks: TrainingBlock[]): { start: string; end: string; days: number } | undefined {
  if (blocks.length === 0) return undefined;
  const start = blocks.map((b) => b.startDate).sort()[0];
  const end = blocks.map((b) => b.endDate).sort().reverse()[0];
  return { start, end, days: daysBetween(start, end) + 1 };
}

/**
 * The chosen blocks (a cycle, e.g. three weeks of load and a deload week) copied `times` times, each copy right
 * after the one before. Copies take the days they land on from blocks of the same priority, like any placed block.
 */
export function repeatCycle(blocks: TrainingBlock[], ids: string[], times: number, newId: () => string): TrainingBlock[] {
  const cycle = blocks.filter((b) => ids.includes(b.id));
  const span = cycleSpan(cycle);
  if (!span || times < 1) return blocks;
  let next = blocks;
  for (let k = 1; k <= times; k++) {
    for (const b of cycle) {
      const shift = span.days * k;
      next = placeBlock(next, { ...b, id: newId(), startDate: addDaysIso(b.startDate, shift), endDate: addDaysIso(b.endDate, shift) }, newId);
    }
  }
  return next;
}

/** Where a repeat would end, for the preview line. */
export const repeatEnd = (blocks: TrainingBlock[], ids: string[], times: number): string | undefined => {
  const span = cycleSpan(blocks.filter((b) => ids.includes(b.id)));
  return span ? addDaysIso(span.end, span.days * times) : undefined;
};

/** Runs of days between `from` and `to` (both included) that no block covers. */
export function gapsBetween(blocks: TrainingBlock[], from: string, to: string): { from: string; to: string; days: number }[] {
  const gaps: { from: string; to: string; days: number }[] = [];
  let run: { from: string; to: string; days: number } | undefined;
  for (let day = from; day <= to; day = addDaysIso(day, 1)) {
    if (phaseOnDay(blocks, day)) run = undefined;
    else if (run) { run.to = day; run.days++; }
    else gaps.push((run = { from: day, to: day, days: 1 }));
  }
  return gaps;
}

/** The gaps *inside* the planned stretch - between the first block's first day and the last block's last day. */
export function gapsInPlan(blocks: TrainingBlock[]): { from: string; to: string; days: number }[] {
  const span = cycleSpan(blocks);
  return span ? gapsBetween(blocks, span.start, span.end) : [];
}

export interface Overlap { a: TrainingBlock; b: TrainingBlock; from: string; to: string }

/** Pairs of blocks that cover some of the same days (concurrent emphases, or old data), with the days they share. */
export function overlaps(blocks: TrainingBlock[]): Overlap[] {
  const sorted = [...blocks].sort((x, y) => x.startDate.localeCompare(y.startDate));
  const out: Overlap[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].startDate <= sorted[i].endDate; j++) {
      const from = sorted[j].startDate;
      const to = sorted[i].endDate < sorted[j].endDate ? sorted[i].endDate : sorted[j].endDate;
      out.push({ a: sorted[i], b: sorted[j], from, to });
    }
  }
  return out;
}

/** A lane per block so bars that share days sit on top of each other instead of over each other (the first free lane, in order of start). */
export function assignLanes(blocks: TrainingBlock[]): Map<string, number> {
  const lanes = new Map<string, number>();
  const laneEnds: string[] = [];
  for (const b of [...blocks].sort((x, y) => x.startDate.localeCompare(y.startDate) || x.endDate.localeCompare(y.endDate))) {
    let lane = laneEnds.findIndex((end) => end < b.startDate);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = b.endDate;
    lanes.set(b.id, lane);
  }
  return lanes;
}

/** Whole days a drag of `dx` pixels is worth at `pxPerDay`. */
export const dragDays = (dx: number, pxPerDay: number): number => Math.round(dx / pxPerDay);
