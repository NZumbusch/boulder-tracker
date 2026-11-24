import { describe, it, expect } from "vitest";
import { atQuery, matchExercises, newExerciseLine, nextLineNumber, replaceLine, sessionToText, textToSlots, type QuickLogContext } from "./quickLog";
import type { ExerciseSlot, ParameterBlock } from "../types";

const TRACKS: Record<string, ParameterBlock[]> = {
  hang: ["sets", "reps", "timeOn", "timeOff", "weight", "holdSize", "difficulty"],
  pull: ["sets", "reps", "weight", "difficulty"],
  board: ["sets", "reps", "boardAngle", "grades", "difficulty"],
  rehab: ["duration", "difficulty"],
};
const NAMES: Record<string, string> = { hang: "Max hangs", pull: "Weighted pull-ups", board: "Kilter 4x4", rehab: "Hamstring rehab" };
const ctx: QuickLogContext = { nameOf: (s) => NAMES[s.typeId], tracked: (s) => TRACKS[s.typeId], weightUnit: "kg" };

const hang: ExerciseSlot = { id: "h", typeId: "hang", prescribed: { sets: 6, reps: 1, timeOn: 7, timeOff: 0, weight: 32.5, holdSize: 20, holdType: "Half Crimp", notes: "fresh fingers" } };
const pull: ExerciseSlot = { id: "p", typeId: "pull", prescribed: { sets: 5, reps: 6, weight: 20 } };
const board: ExerciseSlot = { id: "b", typeId: "board", prescribed: { sets: 4, reps: 4, boardAngle: 40, minGrade: "6C", maxGrade: "7A" } };
const rehab: ExerciseSlot = { id: "r", typeId: "rehab", prescribed: { duration: 15 } };
const slots = [hang, pull, board, rehab];

describe("sessionToText", () => {
  it("writes one numbered line per exercise with what it tracks and an RPE to fill in", () => {
    expect(sessionToText(slots, ctx).split("\n")).toEqual([
      "1. Max hangs · 6 sets · 1 reps · 7 s on · 0 s off · +32.5 kg · 20 mm · RPE ? · note:",
      "2. Weighted pull-ups · 5 sets · 6 reps · +20 kg · RPE ? · note:",
      "3. Kilter 4x4 · 4 sets · 4 reps · 40° · 6C-7A · RPE ? · note:",
      "4. Hamstring rehab · 15 min · RPE ? · note:",
    ]);
  });

  it("shows what is already logged, per-set numbers and a skipped exercise", () => {
    const logged: ExerciseSlot = { ...pull, logged: { sets: 3, reps: [8, 7, 6], weight: 20, difficulty: 8, notes: "grindy" } };
    expect(sessionToText([logged, { ...rehab, skipped: true }], ctx)).toBe("1. Weighted pull-ups · 3 sets · 8/7/6 reps · +20 kg · RPE 8 · note: grindy\n2. Hamstring rehab · skip");
  });

  it("writes weights in pounds when that is the unit", () => {
    expect(sessionToText([pull], { ...ctx, weightUnit: "lb" })).toContain("+44.09 lb");
  });
});

describe("textToSlots", () => {
  const read = (text: string, list = slots) => textToSlots(text, list, ctx);

  it("logs the prefilled text as planned, keeping what the text doesn't hold", () => {
    const r = read(sessionToText(slots, ctx));
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[0].logged).toEqual({ sets: 6, reps: 1, timeOn: 7, timeOff: 0, weight: 32.5, holdSize: 20, holdType: "Half Crimp", notes: "fresh fingers" });
    expect(r.slots[2].logged).toMatchObject({ boardAngle: 40, minGrade: "6C", maxGrade: "7A" });
    expect(r.slots[3].logged).toEqual({ duration: 15 });
    expect(r.slots[0].prescribed).toEqual(hang.prescribed);
  });

  it("an empty note leaves the exercise's note as it was; a typed one is its log note", () => {
    const text = sessionToText(slots, ctx).replace("4. Hamstring rehab · 15 min · RPE ? · note:", "4. Hamstring rehab · 15 min · RPE 3 · note: tight left side");
    const r = read(text);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[0].logged?.notes).toBe("fresh fingers");
    expect(r.slots[3].logged).toEqual({ duration: 15, difficulty: 3, notes: "tight left side" });
  });

  it("reads edited numbers, per-set lists, RPE, a note and a skip, in any order and with other separators", () => {
    const r = read([
      "1. Max hangs · RPE 7 · 6 sets · 7 s on · +35 kg · 20 mm",
      "2 | 4 sets | 8/7/6/6 reps | 20/20/22.5/22,5 kg | RPE 8 | note: last set slow; felt ok",
      "3. skip",
      "4. 20 min; RPE 3",
    ].join("\n"));
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[0].logged).toMatchObject({ sets: 6, timeOn: 7, weight: 35, holdSize: 20, difficulty: 7 });
    expect(r.slots[0].logged?.reps).toBeUndefined();
    expect(r.slots[1].logged).toMatchObject({ sets: 4, reps: [8, 7, 6, 6], weight: 21.25, difficulty: 8, notes: "last set slow; felt ok" });
    expect(r.slots[1].logged?.setDetails).toEqual([{ weight: 20 }, { weight: 20 }, { weight: 22.5 }, { weight: 22.5 }]);
    expect(r.slots[2]).toMatchObject({ id: "b", skipped: true });
    expect(r.slots[2].logged).toBeUndefined();
    expect(r.slots[3].logged).toEqual({ duration: 20, difficulty: 3 });
  });

  it("takes the set count from a per-set list when no sets are written", () => {
    const r = read("1. 7/7/6 s on · RPE 9\n2. skip\n3. skip\n4. skip");
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[0].logged).toMatchObject({ sets: 3, timeOn: 6.67, setDetails: [{ timeOn: 7 }, { timeOn: 7 }, { timeOn: 6 }] });
  });

  it("converts pounds to kilograms", () => {
    const r = read("1. skip\n2. 5 sets · 6 reps · +44 lb\n3. skip\n4. skip");
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[1].logged?.weight).toBe(19.96);
  });

  it("says what is wrong, line by line, and saves nothing", () => {
    const r = read([
      "1. Max hangs · 6 sets · 7 s on · RPE 12",
      "2. Pull-ups · 5 sets · 8/7 reps",
      "Kilter · 4 sets",
      "2. skip",
      "9. skip",
      "3. Kilter · banana",
    ].join("\n"));
    expect(r).toEqual({
      errors: [
        { line: 1, message: "RPE is 1 to 10" },
        { line: 2, message: "2 numbers for reps but 5 sets" },
        { line: 3, message: "starts without the exercise's number" },
        { line: 4, message: "exercise 2 already has line 2" },
        { line: 5, message: "there is no exercise 9 - type @ and a name to add one" },
        { line: 6, message: "\"banana\" isn't a value it knows" },
        { line: null, message: "exercise 4 (Hamstring rehab) has no line - write \"4. skip\" to skip it" },
      ],
    });
  });

  it("leaves an exercise with no RPE unrated", () => {
    const r = read("1. skip\n2. skip\n3. skip\n4. 15 min · RPE ?");
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[3].logged?.difficulty).toBeUndefined();
  });
});

describe("adding exercises", () => {
  const withLibrary: QuickLogContext = {
    ...ctx,
    findType: (name) => {
      const hit = Object.entries(NAMES).find(([, n]) => n.toLowerCase() === name.toLowerCase());
      return hit ? { id: hit[0], parameters: TRACKS[hit[0]] } : undefined;
    },
    newId: () => "new-1",
  };
  const rest = "\n1. skip\n2. skip\n3. skip\n4. skip";

  it("writes a line with an empty value for each tracked value", () => {
    expect(newExerciseLine(5, "Weighted pull-ups", TRACKS.pull, "kg")).toBe("5. Weighted pull-ups · - sets · - reps · - kg · RPE ? · note:");
    expect(newExerciseLine(6, "Kilter 4x4", TRACKS.board, "kg")).toBe("6. Kilter 4x4 · - sets · - reps · - ° · grade - · RPE ? · note:");
  });

  it("adds a numbered line past the plan as an exercise of that name - empty values stay empty", () => {
    const r = textToSlots("5. weighted pull-ups · 3 sets · - reps · +10 kg · RPE 6 · note:" + rest, slots, withLibrary);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots).toHaveLength(5);
    // Its line came first, so it comes first.
    expect(r.slots[0]).toEqual({ id: "new-1", typeId: "pull", activeParameters: TRACKS.pull, logged: { sets: 3, weight: 10, difficulty: 6 } });
  });

  it("counts it as planned too when Settings say so", () => {
    const r = textToSlots("5. Hamstring rehab · 10 min · RPE 2" + rest, slots, { ...withLibrary, addedTarget: "mirror" });
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[0]).toMatchObject({ logged: { duration: 10, difficulty: 2 }, prescribed: { duration: 10, difficulty: 2 } });
  });

  it("the empty line as written saves with no values but the RPE", () => {
    const r = textToSlots(newExerciseLine(5, "Kilter 4x4", TRACKS.board, "kg").replace("RPE ?", "RPE 8") + rest, slots, withLibrary);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[0].logged).toEqual({ difficulty: 8 });
  });

  it("says so when the name isn't an exercise, or the @ search wasn't finished", () => {
    expect(textToSlots("5. Banana curls · 3 sets" + rest, slots, withLibrary)).toEqual({ errors: [{ line: 1, message: "no exercise called \"Banana curls\" - type @ to pick one" }] });
    expect(textToSlots("@pull" + rest, slots, withLibrary)).toEqual({ errors: [{ line: 1, message: "pick an exercise from the list (or finish typing its name after the number)" }] });
  });
});

describe("the @ search", () => {
  const text = "1. Max hangs · RPE 7\n@pul";
  it("finds what is typed after @ on the cursor's line", () => {
    expect(atQuery(text, text.length)).toEqual({ query: "pul", lineStart: 21, lineEnd: 25 });
    expect(atQuery(text, 5)).toBeNull();
    expect(atQuery("1. Hangs · @", 12)).toEqual({ query: "", lineStart: 0, lineEnd: 12 });
  });

  it("lists matching exercises, names starting with it first, archived ones left out", () => {
    const types = [{ name: "Weighted pull-ups" }, { name: "Pull-ups" }, { name: "Pullover", archived: true }, { name: "Push-ups" }];
    expect(matchExercises(types, "pul").map((t) => t.name)).toEqual(["Pull-ups", "Weighted pull-ups"]);
    expect(matchExercises(types, "", 2).map((t) => t.name)).toEqual(["Pull-ups", "Push-ups"]);
    expect(matchExercises([{ name: "Campus Board" }, { name: "Weighted Pull-ups" }], "pu").map((t) => t.name)).toEqual(["Weighted Pull-ups", "Campus Board"]);
  });

  it("numbers the new line after everything there, and puts it in place of the @ line", () => {
    expect(nextLineNumber("1. a\n2. b\n7. c", 2)).toBe(8);
    expect(nextLineNumber("1. a", 4)).toBe(5);
    expect(replaceLine(text, 21, 25, "5. Pull-ups · - sets")).toEqual({ text: "1. Max hangs · RPE 7\n5. Pull-ups · - sets", caret: 41 });
  });
});

describe("circuits and adding in the middle", () => {
  const lib: QuickLogContext = {
    ...ctx,
    findType: (name) => {
      const hit = Object.entries(NAMES).find(([, n]) => n.toLowerCase() === name.toLowerCase());
      return hit ? { id: hit[0], parameters: TRACKS[hit[0]] } : undefined;
    },
    newId: (() => { let n = 0; return () => `new-${++n}`; })(),
  };
  const a: ExerciseSlot = { ...hang, id: "a" };
  const b: ExerciseSlot = { ...pull, id: "b", groupId: "g" };
  const c: ExerciseSlot = { ...rehab, id: "c", groupId: "g" };
  const d: ExerciseSlot = { ...board, id: "d" };
  const circuit = [a, b, c, d];
  const groups = [{ id: "g", name: "Pull + Core", rounds: 3 }];

  it("writes a circuit as its own line with its values, and its exercises indented under it", () => {
    const text = sessionToText(circuit, ctx, [{ id: "g", name: "Pull + Core", rounds: 3, transition: 15, roundRest: 60 }]);
    expect(text.split("\n").slice(0, 3)).toEqual([
      expect.stringMatching(/^1\. Max hangs/),
      "Circuit A: Pull + Core · 3 rounds · 15 s switch · 60 s round rest",
      expect.stringMatching(/^\t2\. Weighted pull-ups/),
    ]);
    const r = textToSlots(text, circuit, ctx, groups);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots.map((s) => [s.id, s.groupId])).toEqual([["a", undefined], ["b", "g"], ["c", "g"], ["d", undefined]]);
  });

  it("reads a changed circuit line into the circuit (rounds, switch, round rest, name)", () => {
    const text = sessionToText(circuit, ctx, groups).replace(/^Circuit A: .*$/m, "Circuit A: Core finisher · 4 rounds · 20 s switch · 90 s round rest");
    const r = textToSlots(text, circuit, ctx, groups);
    if (!("groups" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.groups).toEqual([{ id: "g", name: "Core finisher", rounds: 4, transition: 20, roundRest: 90 }]);
  });

  it("an indented new line joins the circuit above it, also after its last member", () => {
    const text = sessionToText(circuit, ctx, groups).replace("\n4. Kilter", "\n\t9. Max hangs · 1 sets\n4. Kilter");
    const r = textToSlots(text, circuit, lib, groups);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots.map((s) => [s.typeId, s.groupId])).toEqual([["hang", undefined], ["pull", "g"], ["rehab", "g"], ["hang", "g"], ["board", undefined]]);
  });

  it("says so for a circuit letter that isn't there, or a circuit value it can't read", () => {
    const base = sessionToText(circuit, ctx, groups);
    expect(textToSlots(base + "\nCircuit B: More", circuit, ctx, groups)).toEqual({ errors: [{ line: 6, message: "there is no circuit B - a new circuit is made in Edit" }] });
    expect(textToSlots(base.replace("3 rounds", "3 laps"), circuit, ctx, groups)).toEqual({ errors: [{ line: 2, message: "\"3 laps\" isn't a circuit value it knows (rounds, s switch, s round rest)" }] });
  });

  it("puts an added exercise where its line is: in the middle, at the start, inside a circuit (joining it)", () => {
    const lines = sessionToText(circuit, ctx, groups).split("\n");
    // lines: 0 "1. a", 1 "# Superset", 2 "2. b", 3 "3. c", 4 "4. d"
    lines.splice(3, 0, "7. Hamstring rehab · 5 min");   // between the circuit's members b and c
    lines.splice(1, 0, "5. Max hangs · 2 sets");         // after a, before the circuit's heading
    lines.splice(0, 0, "6. Kilter 4x4 · RPE 6");         // before everything
    lines.push("8. Weighted pull-ups · 1 sets");          // after d
    const r = textToSlots(lines.join("\n"), circuit, lib);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots.map((s) => [s.typeId + (s.id.startsWith("new") ? "+" : ""), s.groupId])).toEqual([
      ["board+", undefined],
      ["hang", undefined],
      ["hang+", undefined],
      ["pull", "g"],
      ["rehab+", "g"],
      ["rehab", "g"],
      ["board", undefined],
      ["pull+", undefined],
    ]);
  });

  it("an exercise added after a circuit's last member stays outside it", () => {
    const text = sessionToText(circuit, ctx, groups).replace("4. Kilter", "9. Max hangs · 1 sets\n4. Kilter");
    const r = textToSlots(text, circuit, lib);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots.map((s) => s.groupId)).toEqual([undefined, "g", "g", undefined, undefined]);
  });
});

describe("sets that differ, and sets not done", () => {
  it("logs different weights and reps per set", () => {
    const r = textToSlots("1. skip\n2. 3 sets · 8/6/5 reps · +20/22.5/25 kg · RPE 9\n3. skip\n4. skip", slots, ctx);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[1].logged).toMatchObject({ sets: 3, reps: [8, 6, 5], weight: 22.5, setDetails: [{ weight: 20 }, { weight: 22.5 }, { weight: 25 }] });
  });

  it("drops a set or circuit round marked - from every list, as a live circuit logs a round left out", () => {
    const r = textToSlots("1. skip\n2. 3 sets · 8/-/6 reps · +20/-/25 kg\n3. skip\n4. skip", slots, ctx);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[1].logged).toMatchObject({ sets: 2, reps: [8, 6], setDetails: [{ weight: 20 }, { weight: 25 }] });
  });

  it("a - in one list drops that set from the others too", () => {
    const r = textToSlots("1. skip\n2. 8/-/6 reps · +20 kg\n3. skip\n4. skip", slots, ctx);
    if (!("slots" in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.slots[1].logged).toMatchObject({ sets: 2, reps: [8, 6], weight: 20 });
  });

  it("every set not done is a skip", () => {
    expect(textToSlots("1. skip\n2. -/- reps\n3. skip\n4. skip", slots, ctx)).toEqual({ errors: [{ line: 2, message: "every set is marked not done - write skip instead" }] });
  });

  it("writes per-set numbers back the same way", () => {
    const logged: ExerciseSlot = { ...pull, logged: { sets: 3, reps: [8, 6, 5], weight: 22.5, setDetails: [{ weight: 20 }, { weight: 22.5 }, { weight: 25 }] } };
    expect(sessionToText([logged], ctx)).toBe("1. Weighted pull-ups · 3 sets · 8/6/5 reps · +20/22.5/25 kg · RPE ? · note:");
  });
});

