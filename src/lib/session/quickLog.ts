import type { ExerciseGroup, ExerciseSlot, ExerciseValues, ParameterBlock, PerSetKey } from "../types";
import type { WeightUnit } from "../units";
import { displayWeight, toKg } from "../units";
import { setRows, withSetRows, PER_SET_KEYS, type SetRow } from "../exercise/setRows";
import { paramsWithValues } from "../exercise/valueParams";

/**
 * Quick log: a whole session as text, one numbered line per exercise,
 * prefilled from the plan (or what is already logged), edited and read
 * back - for a session done without the live session screen.
 *
 *   1. Max hangs · 6 sets · 7 s on · +32.5 kg · RPE ?
 *   2. Pull-ups · 5 sets · 10/8/8/7/6 reps · +20 kg · RPE 8 · note: last set grindy
 *   3. Front lever · skip
 *
 * The number at the start says which exercise a line is (the name is only
 * there to read). Values are a number with a unit or keyword after it, any
 * order, separated by "·", "|" or ";". Numbers that differ per set are
 * written "10/8/8". A line shows the values the exercise tracks, plus its
 * RPE (1-10) and a note; what the text can't hold (hold type, board,
 * styles, the athlete's own value types) is kept as it was.
 *
 * Pure: names, tracked values and the weight unit come in through
 * `QuickLogContext`.
 */

export interface QuickLogContext {
  /** The exercise's name, as shown. */
  nameOf: (slot: ExerciseSlot) => string;
  /** What the exercise tracks (its own `activeParameters`, else its type's). */
  tracked: (slot: ExerciseSlot) => ParameterBlock[];
  weightUnit: WeightUnit;
  /** For lines that add an exercise: the exercise type of that name (any case), if there is one. */
  findType?: (name: string) => { id: string; parameters: ParameterBlock[] } | undefined;
  /** A new exercise's id. */
  newId?: () => string;
  /** An added exercise counts as planned too ("mirror") or as extra work only ("none", the default) - Settings → Sessions. */
  addedTarget?: "none" | "mirror";
}

export interface QuickLogError {
  /** 1-based line of the text, or null for an exercise with no line. */
  line: number | null;
  message: string;
}

/** The fields a line can hold. Everything else in an exercise's values is kept as it was. */
const TEXT_KEYS = ["sets", "reps", "duration", "timeOn", "timeOff", "timeBetweenSets", "weight", "bodyweightPercent", "maxWeightPercent", "holdSize", "boardAngle", "distance", "cadence", "difficulty", "minGrade", "maxGrade", "setDetails"] as const;

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const trim0 = (n: number) => String(round(n, 2));

// --- Writing ------------------------------------------------------------------

/** "10/8/8" for a per-set field that differs, else the one number; undefined when none. */
function perSet(v: ExerciseValues, key: PerSetKey, fmt: (n: number) => string = trim0): string | undefined {
  const list = setRows(v, [key]).map((r) => r[key]).filter((x): x is number => x !== undefined);
  if (list.length === 0) return undefined;
  return list.every((x) => x === list[0]) ? fmt(list[0]) : list.map(fmt).join("/");
}

const tracks = (params: ParameterBlock[], ...keys: ParameterBlock[]) => keys.some((k) => params.includes(k));

/** One exercise as its line's values (without number and name). */
export function slotTokens(slot: ExerciseSlot, ctx: QuickLogContext): string[] {
  if (slot.skipped) return ["skip"];
  const v: ExerciseValues = slot.logged ?? slot.prescribed ?? {};
  const params = paramsWithValues(ctx.tracked(slot), v);
  const out: string[] = [];
  const add = (cond: boolean, text: string | undefined) => {
    if (cond && text !== undefined) out.push(text);
  };
  const sets = v.sets ?? (setRows(v).length > 1 ? setRows(v).length : undefined);
  add(tracks(params, "sets") || sets !== undefined, sets !== undefined ? `${sets} sets` : undefined);
  { const r = perSet(v, "reps"); add(tracks(params, "reps") || r !== undefined, r !== undefined ? `${r} reps` : undefined); }
  add(tracks(params, "duration") || v.duration !== undefined, v.duration !== undefined ? `${trim0(v.duration)} min` : undefined);
  { const t = perSet(v, "timeOn"); add(t !== undefined, t !== undefined ? `${t} s on` : undefined); }
  add(v.timeOff !== undefined && tracks(params, "timeOff"), `${v.timeOff} s off`);
  add(v.timeBetweenSets !== undefined && tracks(params, "restTime"), `${v.timeBetweenSets} s rest`);
  {
    const w = perSet(v, "weight", (n) => trim0(round(displayWeight(n, ctx.weightUnit), 2)));
    add(w !== undefined, w !== undefined ? `${w.startsWith("-") ? "" : "+"}${w} ${ctx.weightUnit}` : undefined);
  }
  { const p = perSet(v, "bodyweightPercent"); add(p !== undefined, `${p}% bw`); }
  { const p = perSet(v, "maxWeightPercent"); add(p !== undefined, `${p}% max`); }
  { const h = perSet(v, "holdSize"); add(h !== undefined, `${h} mm`); }
  { const a = perSet(v, "boardAngle"); add(a !== undefined, `${a}°`); }
  { const d = perSet(v, "distance"); add(d !== undefined, `${d} km`); }
  add(v.cadence !== undefined, `cadence ${trim0(v.cadence ?? 0)}`);
  if (v.minGrade) out.push(v.maxGrade && v.maxGrade !== v.minGrade ? `${v.minGrade}-${v.maxGrade}` : v.minGrade);
  out.push(`RPE ${v.difficulty ?? "?"}`);
  // Always there, empty unless a note is already logged, so a comment is one tap away (the plan's own note is an
  // instruction, not a log, and isn't shown).
  out.push(`note: ${slot.logged?.notes?.trim().replace(/\n/g, " ") ?? ""}`.trimEnd());
  return out;
}

/** The empty value an added exercise's line offers for each value it tracks, to be filled in ("- sets"). */
const PLACEHOLDERS: [ParameterBlock, (unit: WeightUnit) => string][] = [
  ["sets", () => "- sets"],
  ["reps", () => "- reps"],
  ["duration", () => "- min"],
  ["timeOn", () => "- s on"],
  ["timeOff", () => "- s off"],
  ["restTime", () => "- s rest"],
  ["weight", (u) => `- ${u}`],
  ["bodyweightPercent", () => "- % bw"],
  ["maxWeightPercent", () => "- % max"],
  ["holdSize", () => "- mm"],
  ["boardAngle", () => "- °"],
  ["distance", () => "- km"],
  ["cadence", () => "cadence -"],
];

/** A line adding an exercise: its number, name and an empty value for each value it tracks. */
export function newExerciseLine(n: number, name: string, tracked: readonly ParameterBlock[], unit: WeightUnit): string {
  const values = PLACEHOLDERS.filter(([key]) => tracked.includes(key)).map(([, text]) => text(unit));
  if (tracked.some((k) => k === "grades" || k === "boulderingGrades" || k === "routeGrades")) values.push("grade -");
  return [`${n}. ${name.replace(/[·|;]/g, "-")}`, ...values, "RPE ?", "note:"].join(" · ");
}

/** A circuit's letter: A for the session's first circuit, B for the next... */
export const circuitLetter = (i: number) => String.fromCharCode(65 + i);

/** The session's circuits in the order their members come. */
function circuitOrder(slots: readonly ExerciseSlot[]): string[] {
  const ids: string[] = [];
  for (const s of slots) if (s.groupId && !ids.includes(s.groupId)) ids.push(s.groupId);
  return ids;
}

/** A circuit's own line: its letter, name, rounds and timing ("Circuit A: Pull + Core · 3 rounds · 15 s switch · 60 s round rest"). */
function circuitLine(letter: string, group: ExerciseGroup | undefined): string {
  const parts = [`Circuit ${letter}: ${(group?.name ?? "").replace(/[·|;\n]/g, "-").trim() || "Circuit"}`];
  if (group?.rounds) parts.push(`${group.rounds} round${group.rounds === 1 ? "" : "s"}`);
  if (group?.transition !== undefined) parts.push(`${group.transition} s switch`);
  if (group?.roundRest !== undefined) parts.push(`${group.roundRest} s round rest`);
  return parts.join(" · ");
}

/**
 * The whole session as text, one numbered line per exercise. A circuit (or
 * superset) has a line of its own with its rounds and timing, and its
 * exercises follow it, indented by a tab.
 */
export function sessionToText(slots: readonly ExerciseSlot[], ctx: QuickLogContext, groups: readonly ExerciseGroup[] = []): string {
  const order = circuitOrder(slots);
  const lines: string[] = [];
  slots.forEach((s, i) => {
    if (s.groupId && slots[i - 1]?.groupId !== s.groupId) lines.push(circuitLine(circuitLetter(order.indexOf(s.groupId)), groups.find((g) => g.id === s.groupId)));
    lines.push(`${s.groupId ? "\t" : ""}${[`${i + 1}. ${ctx.nameOf(s).replace(/[·|;]/g, "-")}`, ...slotTokens(s, ctx)].join(" · ")}`);
  });
  return lines.join("\n");
}

// --- Reading ------------------------------------------------------------------

const NUM = String.raw`\d+(?:[.,]\d+)?`;
/** One number, or several per set ("10/8/8"); "-" in a list is a set not done ("8/-/6"). */
const LIST = String.raw`(?:${NUM}|-)(?:\s*\/\s*(?:${NUM}|-))*`;
const GRADE = String.raw`(?:v\d+|\d[abc]\+?)`;
/** Numbers of a list, null for a set not done ("-"). */
const parseList = (s: string): (number | null)[] => s.split("/").map((x) => (x.trim() === "-" ? null : Number(x.trim().replace(",", "."))));

type Parsed = Partial<Record<PerSetKey, (number | null)[]>> & {
  sets?: number;
  duration?: number;
  timeOff?: number;
  timeBetweenSets?: number;
  cadence?: number;
  difficulty?: number | null;
  minGrade?: string;
  maxGrade?: string;
  skip?: boolean;
};

const PATTERNS: { re: RegExp; apply: (m: RegExpMatchArray, p: Parsed, unit: WeightUnit) => string | void }[] = [
  { re: /^skip(?:ped)?$/i, apply: (_m, p) => { p.skip = true; } },
  {
    re: new RegExp(`^rpe\\s*(\\?|-|${NUM})?$`, "i"),
    apply: (m, p) => {
      if (!m[1] || m[1] === "?" || m[1] === "-") { p.difficulty = null; return; }
      const n = Number(m[1].replace(",", "."));
      if (n < 1 || n > 10) return "RPE is 1 to 10";
      p.difficulty = n;
    },
  },
  {
    re: new RegExp(`^(${NUM})\\s*sets?$`, "i"),
    apply: (m, p) => {
      const n = Number(m[1].replace(",", "."));
      if (!Number.isInteger(n) || n < 1) return "sets must be a whole number";
      p.sets = n;
    },
  },
  { re: new RegExp(`^(${LIST})\\s*(?:reps?|x)$`, "i"), apply: (m, p) => { p.reps = parseList(m[1]); if (p.reps.some((n) => n !== null && !Number.isInteger(n))) return "reps must be whole numbers"; } },
  { re: new RegExp(`^(${NUM})\\s*(?:min|mins|minutes?)$`, "i"), apply: (m, p) => { p.duration = Number(m[1].replace(",", ".")); } },
  { re: new RegExp(`^(${LIST})\\s*(?:s|sec|secs|seconds?)\\s*on$`, "i"), apply: (m, p) => { p.timeOn = parseList(m[1]); } },
  { re: new RegExp(`^(${NUM})\\s*(?:s|sec|secs|seconds?)\\s*off$`, "i"), apply: (m, p) => { p.timeOff = Number(m[1].replace(",", ".")); } },
  { re: new RegExp(`^(${NUM})\\s*(?:s|sec|secs|seconds?)\\s*rest$`, "i"), apply: (m, p) => { p.timeBetweenSets = Number(m[1].replace(",", ".")); } },
  {
    re: new RegExp(`^([+-]?)\\s*(${LIST})\\s*(kg|lbs?)$`, "i"),
    apply: (m, p) => {
      const unit: WeightUnit = m[3].toLowerCase() === "kg" ? "kg" : "lb";
      p.weight = parseList(m[2]).map((n) => (n === null ? null : round(toKg(m[1] === "-" ? -n : n, unit), 2)));
    },
  },
  { re: new RegExp(`^(${LIST})\\s*%\\s*bw$`, "i"), apply: (m, p) => { p.bodyweightPercent = parseList(m[1]); } },
  { re: new RegExp(`^(${LIST})\\s*%\\s*max$`, "i"), apply: (m, p) => { p.maxWeightPercent = parseList(m[1]); } },
  { re: new RegExp(`^(${LIST})\\s*mm$`, "i"), apply: (m, p) => { p.holdSize = parseList(m[1]); } },
  { re: new RegExp(`^(${LIST})\\s*(?:°|deg|degrees?)$`, "i"), apply: (m, p) => { p.boardAngle = parseList(m[1]); } },
  { re: new RegExp(`^(${LIST})\\s*km$`, "i"), apply: (m, p) => { p.distance = parseList(m[1]); } },
  { re: new RegExp(`^cadence\\s*(${NUM})$`, "i"), apply: (m, p) => { p.cadence = Number(m[1].replace(",", ".")); } },
  {
    re: new RegExp(`^(?:grade\\s*)?(${GRADE})(?:\\s*[-–]\\s*(${GRADE}))?$`, "i"),
    apply: (m, p) => {
      p.minGrade = m[1].toUpperCase();
      if (m[2]) p.maxGrade = m[2].toUpperCase();
    },
  },
];

/** One value, or why it isn't one. An empty one ("- kg", "grade -") is no value and fine. */
function readToken(token: string, p: Parsed, unit: WeightUnit): string | null {
  if (/^(?:cadence|grade)\s*[-–?]$/i.test(token)) return null;
  // A lone "-" before the unit ("- kg"), not a list of sets ("-/8 reps").
  if (/^[-–?]\s*(?=[^\d\s/])/.test(token)) {
    const asNumber = token.replace(/^[-–?]\s*/, "1 ");
    if (PATTERNS.some(({ re }) => re.test(asNumber))) return null;
  }
  for (const { re, apply } of PATTERNS) {
    const m = token.match(re);
    if (m) return apply(m, p, unit) ?? null;
  }
  return `"${token}" isn't a value it knows`;
}

/** The logged values for one exercise from its parsed line. */
function toValues(slot: ExerciseSlot, p: Parsed): { values: ExerciseValues } | { error: string } {
  const base: ExerciseValues = { ...(slot.logged ?? slot.prescribed ?? {}) };
  for (const k of TEXT_KEYS) delete base[k];
  const lists = PER_SET_KEYS.filter((k) => p[k] !== undefined);
  const longest = Math.max(0, ...lists.map((k) => p[k]!.length));
  const count = p.sets ?? (longest > 1 ? longest : undefined);
  for (const k of lists) {
    const n = p[k]!.length;
    if (n > 1 && count !== undefined && n !== count) return { error: `${n} numbers for ${k === "timeOn" ? "time on" : k} but ${count} sets` };
    if (n === 1 && p[k]![0] === null) return { error: "\"-\" marks a set not done in a list of sets (8/-/6)" };
  }
  // A "-" in any list is a set (or circuit round) not done: it goes from every list, and the sets are the ones done -
  // the way a live circuit logs a round left out.
  const notDone = new Set<number>();
  for (const k of lists) p[k]!.forEach((v, i) => { if (v === null && p[k]!.length > 1) notDone.add(i); });
  let values: ExerciseValues = base;
  if (count !== undefined) {
    const rows: SetRow[] = [];
    for (let i = 0; i < count; i++) {
      if (notDone.has(i)) continue;
      const row: SetRow = {};
      for (const k of lists) row[k] = (p[k]!.length === 1 ? p[k]![0] : p[k]![i]) ?? undefined;
      rows.push(row);
    }
    if (rows.length === 0) return { error: "every set is marked not done - write skip instead" };
    values = withSetRows(base, rows, PER_SET_KEYS);
  } else {
    for (const k of lists) {
      if (k === "reps") values.reps = p.reps![0]!;
      else values[k] = p[k]![0]!;
    }
  }
  if (p.duration !== undefined) values.duration = p.duration;
  if (p.timeOff !== undefined) values.timeOff = p.timeOff;
  if (p.timeBetweenSets !== undefined) values.timeBetweenSets = p.timeBetweenSets;
  if (p.cadence !== undefined) values.cadence = p.cadence;
  if (typeof p.difficulty === "number") values.difficulty = p.difficulty;
  if (p.minGrade) values.minGrade = p.minGrade;
  if (p.maxGrade) values.maxGrade = p.maxGrade;
  return { values };
}

/**
 * Reads the text back into the exercises: each numbered line logs its
 * exercise (or skips it); every exercise needs a line. A line numbered past
 * the session's exercises adds one: its name must be an exercise in the
 * library (`ctx.findType`), and the added ones follow in their numbers'
 * order. Returns the new exercises, or the problems - one per line that
 * can't be read.
 */
export function textToSlots(
  text: string,
  slots: readonly ExerciseSlot[],
  ctx: QuickLogContext,
  groups: readonly ExerciseGroup[] = [],
): { slots: ExerciseSlot[]; groups: ExerciseGroup[] } | { errors: QuickLogError[] } {
  const errors: QuickLogError[] = [];
  const order = circuitOrder(slots);
  const outGroups: ExerciseGroup[] = groups.map((g) => ({ ...g }));
  /** The circuit whose line was last seen, while its indented lines follow. */
  let openCircuit: string | undefined;
  const seen = new Map<number, number>();
  const out: (ExerciseSlot | undefined)[] = slots.map(() => undefined);
  /** Added exercises, each placed after the session's exercise whose line comes before it (-1: before all); `group` when indented under a circuit. */
  const added: { after: number; slot: ExerciseSlot; group?: string }[] = [];
  let lastExisting = -1;
  text.split("\n").forEach((raw, i) => {
    const lineNo = i + 1;
    // Blank lines and "#" lines (your own remarks) are not exercises.
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const circuit = raw.match(/^\s*circuit\s*([a-z])?\s*[:.]?\s*(.*)$/i);
    if (circuit) {
      const id = circuit[1] ? order[circuit[1].toUpperCase().charCodeAt(0) - 65] : undefined;
      if (!id) {
        errors.push({ line: lineNo, message: circuit[1] ? `there is no circuit ${circuit[1].toUpperCase()} - a new circuit is made in Edit` : "a circuit line starts with its letter: \"Circuit A: ...\"" });
        openCircuit = undefined;
        return;
      }
      openCircuit = id;
      const problem = readCircuit(circuit[2], outGroups, id, groups);
      if (problem) errors.push({ line: lineNo, message: problem });
      return;
    }
    const indented = /^(\t| {2,})/.test(raw);
    if (!indented) openCircuit = undefined;
    const head = raw.match(/^\s*(\d+)\s*[.):]?\s*(.*)$/);
    if (!head) {
      errors.push({ line: lineNo, message: raw.includes("@") ? "pick an exercise from the list (or finish typing its name after the number)" : "starts without the exercise's number" });
      return;
    }
    const index = Number(head[1]) - 1;
    if (index < 0) {
      errors.push({ line: lineNo, message: "exercise numbers start at 1" });
      return;
    }
    if (seen.has(index)) {
      errors.push({ line: lineNo, message: `exercise ${index + 1} already has line ${seen.get(index)}` });
      return;
    }
    seen.set(index, lineNo);
    const after = lastExisting;
    if (index < slots.length) lastExisting = index;
    let rest = head[2];
    let note: string | undefined;
    const noteAt = rest.search(/(?:^|[·|;])\s*note\s*:/i);
    if (noteAt !== -1) {
      const colon = rest.indexOf(":", noteAt);
      note = rest.slice(colon + 1).trim();
      rest = rest.slice(0, noteAt);
    }
    const parts = rest.split(/\s*[·|;]\s*/).map((t) => t.trim()).filter(Boolean);
    const p: Parsed = {};
    const problems: string[] = [];
    let name: string | undefined;
    parts.forEach((token, j) => {
      const scratch: Parsed = {};
      const err = readToken(token, scratch, ctx.weightUnit);
      // The first part is the name unless it reads as a value.
      if (err && j === 0) {
        name = token;
        return;
      }
      if (err) problems.push(err);
      else Object.assign(p, scratch);
    });
    if (problems.length) {
      errors.push({ line: lineNo, message: problems.join("; ") });
      return;
    }

    let slot = slots[index];
    if (!slot) {
      // A line past the session's exercises adds one.
      const type = name ? ctx.findType?.(name) : undefined;
      if (!type) {
        errors.push({ line: lineNo, message: name ? `no exercise called "${name}" - type @ to pick one` : `there is no exercise ${index + 1} - type @ and a name to add one` });
        return;
      }
      if (p.skip) return; // added and skipped: nothing to add
      slot = { id: ctx.newId?.() ?? `added-${index + 1}`, typeId: type.id, activeParameters: [...type.parameters] };
    }

    if (p.skip) {
      const { logged: _logged, ...without } = slot;
      out[index] = { ...without, skipped: true };
      return;
    }
    const r = toValues(slot, p);
    if ("error" in r) {
      errors.push({ line: lineNo, message: r.error });
      return;
    }
    // An empty note leaves the exercise's note as it was.
    const logged = note ? { ...r.values, notes: note } : r.values;
    const { skipped: _skipped, ...kept } = slot;
    if (index < slots.length) out[index] = { ...kept, logged };
    else added.push({ after, group: indented ? openCircuit : undefined, slot: { ...kept, logged, ...(ctx.addedTarget === "mirror" ? { prescribed: { ...logged } } : {}) } });
  });
  slots.forEach((s, i) => {
    if (!out[i] && !seen.has(i)) errors.push({ line: null, message: `exercise ${i + 1} (${ctx.nameOf(s)}) has no line - write "${i + 1}. skip" to skip it` });
  });
  if (errors.length) return { errors };
  return { slots: placeAdded(out as ExerciseSlot[], added), groups: outGroups };
}

/** A circuit line's values ("3 rounds · 15 s switch · 60 s round rest") into its group; the first part is its name. */
function readCircuit(rest: string, out: ExerciseGroup[], id: string, given: readonly ExerciseGroup[]): string | null {
  const parts = rest.split(/\s*[·|;]\s*/).map((t) => t.trim()).filter(Boolean);
  const original = given.find((g) => g.id === id);
  const group: ExerciseGroup = { ...(original ?? { id, rounds: 1 }) };
  const problems: string[] = [];
  parts.forEach((token, j) => {
    let m: RegExpMatchArray | null;
    if ((m = token.match(/^(\d+)\s*rounds?$/i))) {
      const n = Number(m[1]);
      if (n < 1) problems.push("a circuit has at least 1 round");
      else group.rounds = n;
    } else if ((m = token.match(new RegExp(`^(${NUM})\\s*(?:s|sec|secs|seconds?)\\s*round\\s*rest$`, "i")))) group.roundRest = Number(m[1].replace(",", "."));
    else if ((m = token.match(new RegExp(`^(${NUM})\\s*(?:s|sec|secs|seconds?)\\s*(?:switch|between)$`, "i")))) group.transition = Number(m[1].replace(",", "."));
    else if (j === 0) {
      // The name: "Circuit" alone (no name of its own) keeps it as it was.
      if (token.toLowerCase() !== "circuit") group.name = token;
    } else problems.push(`"${token}" isn't a circuit value it knows (rounds, s switch, s round rest)`);
  });
  if (problems.length) return problems.join("; ");
  const i = out.findIndex((g) => g.id === id);
  if (i === -1) out.push(group);
  else out[i] = group;
  return null;
}

/**
 * The session's exercises in their own order, each added one right after
 * the exercise its line follows (in the order the lines were written). One
 * added between two members of the same circuit joins that circuit; placed
 * anywhere else it stays on its own, so a circuit's members stay together.
 */
function placeAdded(slots: ExerciseSlot[], added: { after: number; slot: ExerciseSlot; group?: string }[]): ExerciseSlot[] {
  const at = (i: number) => added.filter((a) => a.after === i);
  const place = (a: { slot: ExerciseSlot; group?: string }, between?: string) => {
    const group = a.group ?? between;
    return group ? { ...a.slot, groupId: group } : a.slot;
  };
  // Before everything: inside a circuit only if indented under one whose first member comes first.
  const out: ExerciseSlot[] = at(-1).map((a) => place({ ...a, group: a.group && slots[0]?.groupId === a.group ? a.group : undefined }));
  slots.forEach((slot, i) => {
    out.push(slot);
    const next = slots[i + 1];
    // Between two members of one circuit: in it, indented or not - it can't sit in the middle of a circuit outside it.
    const between = slot.groupId && next?.groupId === slot.groupId ? slot.groupId : undefined;
    for (const a of at(i)) {
      // Indented under a circuit: in it only where that keeps the circuit together - right after one of its members, or
      // right before its first one.
      const touches = a.group && (slot.groupId === a.group || next?.groupId === a.group);
      out.push(place({ ...a, group: touches ? a.group : undefined }, between));
    }
  });
  return out;
}

// --- Adding an exercise by typing @ ----------------------------------------------

/** The "@name" being typed on the cursor's line: what follows the @, and the line's bounds. Null when there is none. */
export function atQuery(text: string, caret: number): { query: string; lineStart: number; lineEnd: number } | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const nl = text.indexOf("\n", caret);
  const lineEnd = nl === -1 ? text.length : nl;
  const m = text.slice(lineStart, caret).match(/@([^@\n·|;]*)$/);
  return m ? { query: m[1], lineStart, lineEnd } : null;
}

/** Exercises whose name contains the query (any case), best matches first, then A-Z. */
export function matchExercises<T extends { name: string; archived?: boolean }>(types: readonly T[], query: string, max = 8): T[] {
  const q = query.trim().toLowerCase();
  // The name starts with it, then a word in it does ("pu" → Weighted Pull-ups), then it is inside a word (Campus).
  const rank = (name: string) => {
    const n = name.toLowerCase();
    return n.startsWith(q) ? 0 : n.split(/[^a-z0-9]+/).some((w) => w.startsWith(q)) ? 1 : 2;
  };
  return types
    .filter((t) => !t.archived && t.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** The number for a line added now: one past both the session's exercises and every number already written. */
export function nextLineNumber(text: string, exerciseCount: number): number {
  let max = exerciseCount;
  for (const line of text.split("\n")) {
    const n = Number(line.match(/^\s*(\d+)/)?.[1] ?? 0);
    if (n > max) max = n;
  }
  return max + 1;
}

/** The text with the line `[lineStart, lineEnd)` replaced, and where the cursor goes (the end of the new line). */
export function replaceLine(text: string, lineStart: number, lineEnd: number, line: string): { text: string; caret: number } {
  return { text: text.slice(0, lineStart) + line + text.slice(lineEnd), caret: lineStart + line.length };
}
