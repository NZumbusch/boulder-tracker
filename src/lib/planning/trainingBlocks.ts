import type { TrainingBlock } from "../types";
import { addDaysIso, getWeekIdRange, weekDayIsos, weekIdOfIso, weekMondayIso, weekSundayIso } from "../dateUtils";

/*
 * A phase (TrainingBlock) is a range of days, startDate..endDate inclusive,
 * so it can start or end mid-week and a week can hold two or three. Weeks
 * are what the rest of the Plan groups by, so each question about "the
 * week" has one function here: which phases it holds (`phasesInWeek`), which
 * one counts as the week's (`winningPhaseOfWeek`), and the weeks a block
 * touches (`blockWeekIds`). Plain string comparison of "YYYY-MM-DD" and
 * "YYYY-Wnn" ids is chronological, including across years.
 */

/** A block as versions before 3.35 stored it: whole weeks, no dates. */
interface BlockWithWeeks extends Omit<TrainingBlock, "startDate" | "endDate"> {
  startWeekId?: string;
  endWeekId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * A block in the current shape: dates as they are, or (for a block written
 * as whole weeks - an old backup, an undo record, an AI plan) the Monday of
 * its first week and the Sunday of its last. Week fields are dropped.
 * Returns undefined for a block with neither usable dates nor weeks, which
 * never covered anything.
 */
export function normalizeBlock(raw: BlockWithWeeks): TrainingBlock | undefined {
  const { startWeekId, endWeekId, ...rest } = raw;
  const startDate = raw.startDate || (startWeekId ? weekMondayIso(startWeekId) : "");
  const endDate = raw.endDate || (endWeekId ? weekSundayIso(endWeekId) : "");
  if (!startDate || !endDate) return undefined;
  return { ...rest, startDate, endDate };
}

/** `normalizeBlock` over a list, leaving out the unusable ones. */
export function normalizeBlocks(raw: BlockWithWeeks[]): TrainingBlock[] {
  return raw.flatMap((b) => normalizeBlock(b) ?? []);
}

/** What the week helpers need of a block: its days. */
type BlockDays = Pick<TrainingBlock, "startDate" | "endDate">;

/** The first week a block touches. */
export const blockFirstWeekId = (b: BlockDays): string => weekIdOfIso(b.startDate);

/** The last week a block touches. */
export const blockLastWeekId = (b: BlockDays): string => weekIdOfIso(b.endDate);

/** Every week a block touches (a partial week at either end counts). */
export function blockWeekIds(b: BlockDays): string[] {
  return getWeekIdRange(blockFirstWeekId(b), blockLastWeekId(b));
}

/** Whether a block has at least one day in the week. */
export function blockTouchesWeek(b: BlockDays, weekId: string): boolean {
  return b.startDate <= weekSundayIso(weekId) && weekMondayIso(weekId) <= b.endDate;
}

/** All blocks with at least one day in `weekId`. */
export function getBlocksForWeek(blocks: TrainingBlock[], weekId: string): TrainingBlock[] {
  return blocks.filter((b) => blockTouchesWeek(b, weekId));
}

/**
 * The block a day belongs to. Where blocks overlap, higher `priority` wins,
 * then the one later in the list (last created) - the rule weeks always had.
 */
export function phaseOnDay(blocks: TrainingBlock[], isoDate: string): TrainingBlock | undefined {
  let best: TrainingBlock | undefined;
  for (const b of blocks) {
    if (b.startDate > isoDate || isoDate > b.endDate) continue;
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

export interface WeekRun {
  /** The phase of these days; undefined for days no block has. */
  block?: TrainingBlock;
  /** First and last day of the run, 0 = Monday ... 6 = Sunday. */
  from: number;
  to: number;
}

/**
 * The week cut into runs of consecutive days with the same phase, in day
 * order - what a week cell draws as side-by-side segments. Days no block
 * has are runs of their own, so the segments always add up to seven days.
 */
export function weekRuns(blocks: TrainingBlock[], weekId: string): WeekRun[] {
  const runs: WeekRun[] = [];
  weekDayIsos(weekId).forEach((day, i) => {
    const block = phaseOnDay(blocks, day);
    const last = runs[runs.length - 1];
    if (last && last.block === block) last.to = i;
    else runs.push({ block, from: i, to: i });
  });
  return runs;
}

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon–Wed", or "Thu" for a single day (0 = Monday ... 6 = Sunday). */
export const dayRangeText = (from: number, to: number): string => (from === to ? DAY_ABBR[from] : `${DAY_ABBR[from]}–${DAY_ABBR[to]}`);

/** The runs of a week in words: "Power Mon–Wed, Deload Thu–Sun". Days with no phase are left out; a week with only one run is just the name. */
export function describeRuns(runs: { name?: string; from: number; to: number }[]): string {
  const named = runs.filter((r) => r.name);
  if (named.length === 0) return "";
  if (runs.length === 1) return named[0].name!;
  return named.map((r) => `${r.name} ${dayRangeText(r.from, r.to)}`).join(", ");
}

/**
 * The phase a week counts as when it needs one (its colour, the templates
 * for sessions with no day): the highest priority, then the most days, a
 * tie going to the block created later. A week no block touches has none.
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

/** Same as `winningPhaseOfWeek` - the name the callers have always used for "the block that counts for this week". */
export const getDominantBlockForWeek = winningPhaseOfWeek;

export interface CoalescedBlocks {
  blocks: TrainingBlock[];
  /** A merged-away block's id -> the id of the block that took its place, for everything that points at blocks. */
  remap: Record<string, string>;
}

/**
 * Joins blocks that are really one: the same phase, name, colour and
 * priority, touching or overlapping days. Several AI runs (or the athlete)
 * each adding "Capacity" for a week or two leave a string of one-week
 * blocks; they are one block of the whole stretch. The earliest block keeps
 * its id; differing notes are kept together, one after the other. The
 * surviving blocks stay in their original order.
 */
export function coalesceBlocks(blocks: TrainingBlock[]): CoalescedBlocks {
  const remap: Record<string, string> = {};
  const key = (b: TrainingBlock) => [b.phaseId, b.name.trim().toLowerCase(), b.color ?? "", b.priority ?? 0].join("|");
  const byStart = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
  const merged = new Map<string, TrainingBlock>();
  const open = new Map<string, TrainingBlock>(); // the run in progress for each kind of block
  for (const b of byStart) {
    const k = key(b);
    const run = open.get(k);
    if (run && b.startDate <= addDaysIso(run.endDate, 1)) {
      const notes = [...new Set([run.notes, b.notes].flatMap((n) => (n ?? "").split("\n")).map((l) => l.trim()).filter(Boolean))];
      const next: TrainingBlock = { ...run, endDate: b.endDate > run.endDate ? b.endDate : run.endDate, ...(notes.length ? { notes: notes.join("\n") } : {}) };
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
