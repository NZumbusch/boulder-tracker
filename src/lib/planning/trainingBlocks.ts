import type { TrainingBlock } from "../types";
import { incrementWeekId as nextWeekId, weekMondayIso, weekSundayIso, weekDayIsos } from "../dateUtils";

/**
 * All blocks whose [startWeekId, endWeekId] range covers `weekId`. Plain
 * string comparison is safe here: week ids are always "YYYY-Wnn" (zero-
 * padded), which sorts lexicographically in chronological order, including
 * across year boundaries (e.g. "2025-W52" < "2026-W01").
 */
export function getBlocksForWeek(blocks: TrainingBlock[], weekId: string): TrainingBlock[] {
  return blocks.filter((b) => b.startWeekId <= weekId && weekId <= b.endWeekId);
}

/**
 * The block that "wins" for a week covered by more than one (`priority`
 * decides which one's templates and colour a week shows). Higher `priority` wins (default 0); ties are broken
 * by whichever block appears later in the array (last-created wins) - an
 * arbitrary but deterministic tiebreak, since the plan doesn't specify one.
 */
export function getDominantBlockForWeek(blocks: TrainingBlock[], weekId: string): TrainingBlock | undefined {
  const covering = getBlocksForWeek(blocks, weekId);
  if (covering.length === 0) return undefined;
  return covering.reduce((best, b) => ((b.priority ?? 0) >= (best.priority ?? 0) ? b : best));
}

// --- Phases as ranges of days ---

/** First day of a block ("YYYY-MM-DD"): its stored date, or the Monday of its first week. */
export function blockStartDate(b: TrainingBlock): string {
  return b.startDate ?? weekMondayIso(b.startWeekId);
}

/** Last day of a block: its stored date, or the Sunday of its last week. */
export function blockEndDate(b: TrainingBlock): string {
  return b.endDate ?? weekSundayIso(b.endWeekId);
}

/**
 * The block with its days written from its weeks (Monday of the first,
 * Sunday of the last). For now the weeks still decide, so a block saved
 * after only its week ids changed can't keep stale dates. A block whose
 * weeks aren't usable is returned as it is.
 */
export function withBlockDates(b: TrainingBlock): TrainingBlock {
  const startDate = weekMondayIso(b.startWeekId);
  const endDate = weekSundayIso(b.endWeekId);
  if (!startDate || !endDate) return b;
  return b.startDate === startDate && b.endDate === endDate ? b : { ...b, startDate, endDate };
}

/**
 * The block a day belongs to. Where blocks overlap, higher `priority` wins,
 * then the one later in the list (last created) - the rule weeks always had.
 */
export function phaseOnDay(blocks: TrainingBlock[], isoDate: string): TrainingBlock | undefined {
  let best: TrainingBlock | undefined;
  for (const b of blocks) {
    if (blockStartDate(b) > isoDate || isoDate > blockEndDate(b)) continue;
    if (!best || (b.priority ?? 0) >= (best.priority ?? 0)) best = b;
  }
  return best;
}

export interface PhaseDays {
  block: TrainingBlock;
  /** The days of the week this block is the phase of, Monday first. */
  days: string[];
}

/** The phases a week holds with their days (two usually, three or more work the same), in the order they start. Empty when no block touches it. */
export function phasesInWeek(blocks: TrainingBlock[], weekId: string): PhaseDays[] {
  const byBlock = new Map<TrainingBlock, string[]>();
  for (const day of weekDayIsos(weekId)) {
    const block = phaseOnDay(blocks, day);
    if (!block) continue;
    byBlock.set(block, [...(byBlock.get(block) ?? []), day]);
  }
  return [...byBlock].map(([block, days]) => ({ block, days }));
}

/**
 * The phase a week counts as when it needs one (its colour, the templates
 * for sessions with no day): the highest priority, then the most days, a
 * tie going to the block created later.
 */
export function winningPhaseOfWeek(blocks: TrainingBlock[], weekId: string): TrainingBlock | undefined {
  let best: PhaseDays | undefined;
  for (const phase of phasesInWeek(blocks, weekId)) {
    if (!best) { best = phase; continue; }
    const [pp, bp] = [phase.block.priority ?? 0, best.block.priority ?? 0];
    const [pd, bd] = [phase.days.length, best.days.length];
    if (pp > bp || (pp === bp && (pd > bd || (pd === bd && blocks.indexOf(phase.block) > blocks.indexOf(best.block))))) best = phase;
  }
  return best?.block;
}

export interface CoalescedBlocks {
  blocks: TrainingBlock[];
  /** A merged-away block's id -> the id of the block that took its place, for everything that points at blocks. */
  remap: Record<string, string>;
}

/**
 * Joins blocks that are really one: the same phase, name, colour and
 * priority, touching or overlapping weeks. Several AI runs (or the athlete)
 * each adding "Capacity" for a week or two leave a string of one-week
 * blocks; they are one block of the whole stretch. The earliest block keeps
 * its id; differing notes are kept together, one after the other. The
 * surviving blocks stay in their original order.
 */
export function coalesceBlocks(blocks: TrainingBlock[]): CoalescedBlocks {
  const remap: Record<string, string> = {};
  const key = (b: TrainingBlock) => [b.phaseId, b.name.trim().toLowerCase(), b.color ?? "", b.priority ?? 0].join("|");
  const byStart = [...blocks].sort((a, b) => a.startWeekId.localeCompare(b.startWeekId) || a.endWeekId.localeCompare(b.endWeekId));
  const merged = new Map<string, TrainingBlock>();
  const open = new Map<string, TrainingBlock>(); // the run in progress for each kind of block
  for (const b of byStart) {
    const k = key(b);
    const run = open.get(k);
    if (run && b.startWeekId <= nextWeekId(run.endWeekId)) {
      const notes = [...new Set([run.notes, b.notes].flatMap((n) => (n ?? "").split("\n")).map((l) => l.trim()).filter(Boolean))];
      const next: TrainingBlock = withBlockDates({ ...run, endWeekId: b.endWeekId > run.endWeekId ? b.endWeekId : run.endWeekId, ...(notes.length ? { notes: notes.join("\n") } : {}) });
      open.set(k, next);
      merged.set(run.id, next);
      remap[b.id] = run.id;
    } else {
      open.set(k, b);
      merged.set(b.id, b);
    }
  }
  if (Object.keys(remap).length === 0) return { blocks, remap };
  return { blocks: blocks.filter((b) => !(b.id in remap)).map((b) => merged.get(b.id) ?? b), remap };
}
