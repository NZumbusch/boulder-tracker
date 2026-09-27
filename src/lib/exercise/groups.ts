import type { ExerciseGroup, ExerciseSlot, ExerciseValues } from "../types";
import { slotValues } from "../exerciseSlot";
import { toRepsArray } from "./reps";
import { restSeconds } from "./rest";

/**
 * Circuits and supersets: exercises done together in rounds.
 *
 * The data is deliberately flat - a workout's `exercises` stay one list,
 * members carry `groupId`, and the group's timing lives in the workout's
 * `groups`. Everything that doesn't care about grouping (analytics,
 * categories, exports) keeps seeing ordinary exercises. Only timing, load
 * and display read this module.
 *
 * The one rule: a member says *what* (one set of it), the group says
 * *when*. A round is one set of each member in list order, `transition`
 * seconds apart, with `roundRest` after the round and nothing after the
 * last one. A member's own rest between sets is ignored - the rest it gets
 * is everything else in the round - and `restComparison` shows the two
 * side by side so a superset can be tuned.
 *
 * Every reader here is total: a `groupId` that points at nothing, a group
 * whose members aren't next to each other, a group with no members - all
 * degrade to plain exercises (`normaliseGroups`) rather than throwing. So a
 * code path that copies `exercises` but forgets `groups` loses the circuit,
 * never the workout.
 */

/** A counted exercise has no clock of its own; this is what one rep is assumed to take. */
export const COUNTED_SECONDS_PER_REP = 3;
/** What one set of a member with nothing to go on (no time, reps or duration) is assumed to take. */
export const DEFAULT_MEMBER_SECONDS = 60;

type Grouped = { exercises: ExerciseSlot[]; groups?: ExerciseGroup[] };

/**
 * Makes grouping consistent: drops `groupId`s that point at no group or
 * reappear after the group's run has ended (members must be contiguous -
 * the first run keeps the group), drops groups without members, and
 * repairs `rounds` (a whole number >= 1).
 *
 * Returns the input objects untouched when nothing needed fixing, so it is
 * cheap to call on every read and safe to use in reactive code.
 */
export function normaliseGroups<T extends Grouped>(workout: T): T {
  const groups = Array.isArray(workout.groups) ? workout.groups : [];
  const exercises = workout.exercises ?? [];
  if (groups.length === 0 && !exercises.some((s) => s.groupId !== undefined)) {
    return workout;
  }

  const byId = new Map<string, ExerciseGroup>();
  for (const g of groups) {
    if (g && typeof g.id === "string" && !byId.has(g.id)) byId.set(g.id, g);
  }

  const closed = new Set<string>();
  const used = new Set<string>();
  let current: string | undefined;
  let changedSlots = false;
  const nextExercises = exercises.map((slot) => {
    const id = slot.groupId;
    if (id !== current && current !== undefined) closed.add(current);
    const keep = id !== undefined && byId.has(id) && !closed.has(id);
    current = keep ? id : undefined;
    if (keep) {
      used.add(id!);
      return slot;
    }
    if (id === undefined) return slot;
    changedSlots = true;
    const { groupId: _dropped, ...rest } = slot;
    return rest as ExerciseSlot;
  });

  let changedGroups = byId.size !== groups.length;
  const nextGroups: ExerciseGroup[] = [];
  for (const g of byId.values()) {
    if (!used.has(g.id)) {
      changedGroups = true;
      continue;
    }
    const rounds = validRounds(g.rounds);
    if (rounds !== g.rounds) {
      changedGroups = true;
      nextGroups.push({ ...g, rounds });
    } else {
      nextGroups.push(g);
    }
  }

  if (!changedSlots && !changedGroups) return workout;
  return {
    ...workout,
    exercises: changedSlots ? nextExercises : exercises,
    groups: nextGroups.length > 0 ? nextGroups : undefined,
  };
}

/** One entry in a workout's display order: a lone exercise, or a group and its members. */
export type WorkoutItem =
  | { kind: "slot"; slot: ExerciseSlot; index: number }
  | { kind: "group"; group: ExerciseGroup; members: { slot: ExerciseSlot; index: number }[] };

/** The exercises in order with each group's members gathered under it. `index` is the slot's position in `exercises`. */
export function workoutItems(workout: Grouped): WorkoutItem[] {
  const { exercises, groups } = normaliseGroups(workout);
  const byId = new Map((groups ?? []).map((g) => [g.id, g]));
  const items: WorkoutItem[] = [];
  (exercises ?? []).forEach((slot, index) => {
    const group = slot.groupId !== undefined ? byId.get(slot.groupId) : undefined;
    if (!group) {
      items.push({ kind: "slot", slot, index });
      return;
    }
    const last = items[items.length - 1];
    if (last?.kind === "group" && last.group.id === group.id) last.members.push({ slot, index });
    else items.push({ kind: "group", group, members: [{ slot, index }] });
  });
  return items;
}

/** The group a slot belongs to, if any (after normalising). */
export function groupOf(workout: Grouped, slotId: string): ExerciseGroup | undefined {
  const { exercises, groups } = normaliseGroups(workout);
  const slot = exercises.find((s) => s.id === slotId);
  return slot?.groupId !== undefined ? groups?.find((g) => g.id === slot.groupId) : undefined;
}

// --- Timing -----------------------------------------------------------

/**
 * How many rounds a member takes part in. A per-set reps array is what
 * happened and says so itself; otherwise `sets` means "the first N
 * rounds", and no `sets` means every round. Never more than the group has.
 */
export function memberRounds(values: ExerciseValues, group: ExerciseGroup): number {
  const rounds = validRounds(group.rounds);
  const perSet = toRepsArray(values.reps);
  if (perSet) return Math.min(perSet.length, rounds);
  const sets = Number(values.sets);
  if (values.sets !== undefined && Number.isFinite(sets) && sets >= 1) return Math.min(Math.floor(sets), rounds);
  return rounds;
}

/**
 * How long one member's set in a given round takes, in seconds - its work
 * only, never its rest between sets (the group owns that).
 *
 * - `timeOn` set: a timed set, `reps × timeOn` with the rest between reps
 *   inside it (a hangboard repeater set is one "set" too).
 * - reps only: a counted set, `COUNTED_SECONDS_PER_REP` each.
 * - `duration` only: the member's total minutes, spread over its rounds.
 * - nothing: `DEFAULT_MEMBER_SECONDS`.
 */
export function memberSetSeconds(values: ExerciseValues, group: ExerciseGroup, round: number): number {
  const reps = repsInRound(values, round);
  const timeOn = positive(values.timeOn);
  if (timeOn !== undefined) {
    const n = reps ?? 1;
    return n * timeOn + Math.max(0, n - 1) * restSeconds(values).betweenReps;
  }
  if (reps !== undefined) return reps * COUNTED_SECONDS_PER_REP;
  const duration = positive(values.duration);
  if (duration !== undefined) return (duration * 60) / Math.max(1, memberRounds(values, group));
  return DEFAULT_MEMBER_SECONDS;
}

/** Seconds between rounds: `roundRest`, else `transition`, else none. */
export function restBetweenRounds(group: ExerciseGroup): number {
  return nonNegative(group.roundRest) ?? nonNegative(group.transition) ?? 0;
}

export interface GroupMember {
  slot: ExerciseSlot;
  values: ExerciseValues;
}

export interface GroupTiming {
  /** Rounds that actually happen - the most any member takes part in. */
  rounds: number;
  /** The whole group, first set to last, in seconds. */
  totalSeconds: number;
  /** Each member's work across its rounds, in seconds, by slot id. */
  workSeconds: Map<string, number>;
  /** Members taking part in each round, in order (by index into the members given). */
  roundMembers: number[][];
}

/**
 * Lays a group out in rounds and adds it up: every active member's set,
 * `transition` between them, `restBetweenRounds` between rounds, nothing
 * trailing.
 */
export function groupTiming(group: ExerciseGroup, members: GroupMember[]): GroupTiming {
  const counts = members.map((m) => memberRounds(m.values, group));
  const rounds = Math.max(0, ...counts);
  const transition = nonNegative(group.transition) ?? 0;
  const workSeconds = new Map<string, number>(members.map((m) => [m.slot.id, 0]));
  const roundMembers: number[][] = [];
  let total = 0;

  for (let r = 0; r < rounds; r++) {
    const active = members.map((_, i) => i).filter((i) => counts[i] > r);
    roundMembers.push(active);
    for (const i of active) {
      const seconds = memberSetSeconds(members[i].values, group, r);
      workSeconds.set(members[i].slot.id, (workSeconds.get(members[i].slot.id) ?? 0) + seconds);
      total += seconds;
    }
    total += transition * Math.max(0, active.length - 1);
    if (r < rounds - 1) total += restBetweenRounds(group);
  }
  return { rounds, totalSeconds: total, workSeconds, roundMembers };
}

/** Which values a calculation reads, and which slots it counts. */
export type GroupMode = "planned" | "estimate" | "actual";

function membersFor(slots: ExerciseSlot[], mode: GroupMode): GroupMember[] {
  const out: GroupMember[] = [];
  for (const slot of slots) {
    if (mode === "planned") {
      if (slot.prescribed) out.push({ slot, values: slot.prescribed });
    } else if (mode === "actual") {
      if (!slot.skipped) out.push({ slot, values: slotValues(slot) });
    } else {
      out.push({ slot, values: slotValues(slot) });
    }
  }
  return out;
}

/**
 * Each grouped slot's share of its group's time, in minutes, by slot id -
 * the group's total split by how much of the work each member does, so
 * the rests are shared out and the members add back up to the group.
 * Ungrouped slots are absent; callers use their own duration for those.
 *
 * - `planned`: prescribed values of planned members (the plan's load).
 * - `actual`: logged-else-planned values, skipped members left out.
 * - `estimate`: logged-else-planned values of every member.
 */
export function groupMemberMinutes(workout: Grouped, mode: GroupMode): Map<string, number> {
  const minutes = new Map<string, number>();
  for (const item of workoutItems(workout)) {
    if (item.kind !== "group") continue;
    const members = membersFor(item.members.map((m) => m.slot), mode);
    if (members.length === 0) continue;
    const timing = groupTiming(item.group, members);
    const work = [...timing.workSeconds.values()].reduce((a, b) => a + b, 0);
    for (const m of members) {
      const share = work > 0 ? (timing.workSeconds.get(m.slot.id) ?? 0) / work : 1 / members.length;
      minutes.set(m.slot.id, (timing.totalSeconds * share) / 60);
    }
  }
  return minutes;
}

/** Each group's total length in minutes, by group id, for the same three modes. */
export function groupMinutes(workout: Grouped, mode: GroupMode): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of workoutItems(workout)) {
    if (item.kind !== "group") continue;
    const members = membersFor(item.members.map((m) => m.slot), mode);
    if (members.length === 0) continue;
    out.set(item.group.id, groupTiming(item.group, members).totalSeconds / 60);
  }
  return out;
}

export interface RestComparison {
  slotId: string;
  /** The member's own rest between sets, as planned outside a group. */
  wanted: number;
  /** What it gets inside the group: from the end of its set to the start of its next one. */
  gets: number;
}

/**
 * For each member with a rest between sets of its own, the rest the group
 * actually gives it (measured between its first and second round). The
 * group ignores the member's rest; this is what lets the editor show
 * "pull-ups want 3:00, get 2:10" so the superset can be tuned.
 */
export function restComparison(group: ExerciseGroup, members: GroupMember[]): RestComparison[] {
  const timing = groupTiming(group, members);
  if (timing.rounds < 2) return [];
  const transition = nonNegative(group.transition) ?? 0;
  const [first, second] = timing.roundMembers;
  const out: RestComparison[] = [];

  members.forEach((m, i) => {
    const wanted = restSeconds(m.values).betweenSets;
    if (!(wanted > 0) || !second?.includes(i)) return;
    const after = first.slice(first.indexOf(i) + 1);
    const before = second.slice(0, second.indexOf(i));
    const work = (idx: number[], round: number) =>
      idx.reduce((sum, j) => sum + memberSetSeconds(members[j].values, group, round), 0);
    const gets =
      work(after, 0) + transition * after.length +
      restBetweenRounds(group) +
      work(before, 1) + transition * before.length;
    out.push({ slotId: m.slot.id, wanted, gets: Math.round(gets) });
  });
  return out;
}

// --- Editing ----------------------------------------------------------

/**
 * Groups the given slots: pulls them together at the first one's position
 * (in list order) under a new group. Slots already in another group leave
 * it. Returns the new exercises and groups, normalised.
 */
export function groupSlots<T extends Grouped>(workout: T, slotIds: string[], group: ExerciseGroup): T {
  const ids = new Set(slotIds);
  const exercises = workout.exercises ?? [];
  const picked = exercises.filter((s) => ids.has(s.id));
  if (picked.length === 0) return workout;
  const firstIndex = exercises.findIndex((s) => ids.has(s.id));
  const rest = exercises.filter((s) => !ids.has(s.id));
  const insertAt = exercises.slice(0, firstIndex).filter((s) => !ids.has(s.id)).length;
  const members = picked.map((s) => ({ ...s, groupId: group.id }));
  const next = [...rest.slice(0, insertAt), ...members, ...rest.slice(insertAt)];
  return normaliseGroups({ ...workout, exercises: next, groups: [...(workout.groups ?? []), group] });
}

/** Dissolves a group: its members stay where they are, as plain exercises. */
export function ungroup<T extends Grouped>(workout: T, groupId: string): T {
  const exercises = (workout.exercises ?? []).map((s) => {
    if (s.groupId !== groupId) return s;
    const { groupId: _dropped, ...rest } = s;
    return rest as ExerciseSlot;
  });
  const groups = (workout.groups ?? []).filter((g) => g.id !== groupId);
  return normaliseGroups({ ...workout, exercises, groups: groups.length > 0 ? groups : undefined });
}

/** Replaces one group's settings (not its members). */
export function updateGroup<T extends Grouped>(workout: T, group: ExerciseGroup): T {
  return { ...workout, groups: (workout.groups ?? []).map((g) => (g.id === group.id ? group : g)) };
}

/**
 * Takes one member out of its group: it becomes a plain exercise right
 * after the group's last member, so the rest of the circuit stays intact.
 */
export function takeOutOfGroup<T extends Grouped>(workout: T, slotId: string): T {
  const exercises = [...(workout.exercises ?? [])];
  const i = exercises.findIndex((s) => s.id === slotId);
  const groupId = exercises[i]?.groupId;
  if (i < 0 || groupId === undefined) return workout;
  const { groupId: _dropped, ...slot } = exercises[i];
  exercises.splice(i, 1);
  let end = i;
  while (end < exercises.length && exercises[end].groupId === groupId) end++;
  exercises.splice(end, 0, slot as ExerciseSlot);
  return normaliseGroups({ ...workout, exercises });
}

/** Adds a slot as the group's last member. */
export function addToGroup<T extends Grouped>(workout: T, groupId: string, slot: ExerciseSlot): T {
  const exercises = [...(workout.exercises ?? [])];
  let last = -1;
  exercises.forEach((s, i) => { if (s.groupId === groupId) last = i; });
  if (last < 0) return workout;
  exercises.splice(last + 1, 0, { ...slot, groupId });
  return normaliseGroups({ ...workout, exercises });
}

/**
 * After a drag: a plain exercise dropped between two members of the same
 * group joins it, rather than splitting the circuit in two (which would
 * drop the second half out of the group). A member dragged away from its
 * group leaves it - `normaliseGroups` sees to that.
 */
export function settleAfterMove(exercises: ExerciseSlot[]): ExerciseSlot[] {
  return exercises.map((slot, i) => {
    if (slot.groupId !== undefined) return slot;
    const before = exercises[i - 1]?.groupId;
    return before !== undefined && exercises[i + 1]?.groupId === before ? { ...slot, groupId: before } : slot;
  });
}

// --- Display ----------------------------------------------------------

/** A rest or work time: `15 s` under a minute, `1:30` from there. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "3 rounds · 15 s between · 1:00 after each round" */
export function groupSummary(group: ExerciseGroup): string {
  const rounds = validRounds(group.rounds);
  const parts = [`${rounds} round${rounds === 1 ? "" : "s"}`];
  const transition = nonNegative(group.transition);
  if (transition) parts.push(`${formatSeconds(transition)} between`);
  const roundRest = nonNegative(group.roundRest);
  if (roundRest && rounds > 1) parts.push(`${formatSeconds(roundRest)} after each round`);
  return parts.join(" · ");
}

// --- Helpers ----------------------------------------------------------

function repsInRound(values: ExerciseValues, round: number): number | undefined {
  const perSet = toRepsArray(values.reps);
  if (perSet) return perSet[Math.min(round, perSet.length - 1)];
  return typeof values.reps === "number" ? positive(values.reps) : undefined;
}

function validRounds(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function positive(value: number | undefined): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n > 0 ? n : undefined;
}

function nonNegative(value: number | undefined): number | undefined {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) && n >= 0 ? n : undefined;
}
