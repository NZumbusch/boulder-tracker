import { describe, it, expect } from "vitest";
import type { CoachNote } from "../types";
import { applyCoachNoteChange, newCoachNoteId, renderCoachMemory, hasProfile, MAX_COACH_NOTES, COACH_NOTES_INSTRUCTIONS } from "./coachNotes";
import { validateChangeSet } from "./changeSet";
import { planChanges, planWithSelection, allItemIds, type PlannerState } from "./changePlanner";
import { buildCoachPrompt } from "./coachPrompt";

const note = (id: string, text: string, source: CoachNote["source"] = "ai"): CoachNote => ({ id, text, source, addedOn: "2026-09-01" });
let n = 0;
const ids = () => `id${++n}`;

describe("coach notes", () => {
  it("mints short ids the AI can quote, never reusing one", () => {
    const seq = [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5];
    const id = newCoachNoteId([{ id: "aaaa" }], () => seq.shift() ?? 0.9);
    expect(id).toMatch(/^[a-z2-9]{4}$/);
    expect(id).not.toBe("aaaa");
  });

  it("adds, edits and removes; stops at the limit and at duplicates", () => {
    const base = [note("k3x9", "Recovers slowly from max hangs")];
    const added = applyCoachNoteChange(base, { action: "add", text: "Likes pyramids" }, "2026-09-27", () => "zz22");
    expect(added.notes.map((x) => x.id)).toEqual(["k3x9", "zz22"]);
    expect(added.notes[1]).toMatchObject({ source: "ai", addedOn: "2026-09-27" });

    const edited = applyCoachNoteChange(base, { action: "edit", id: "k3x9", text: "Keep 72 h between max hangs" }, "2026-09-27", ids);
    expect(edited.notes[0]).toMatchObject({ text: "Keep 72 h between max hangs", updatedOn: "2026-09-27" });

    expect(applyCoachNoteChange(base, { action: "remove", id: "k3x9" }, "2026-09-27", ids).notes).toEqual([]);
    expect(applyCoachNoteChange(base, { action: "remove", id: "nope" }, "2026-09-27", ids).error).toMatch(/No coach note/);
    expect(applyCoachNoteChange(base, { action: "add", text: "recovers slowly from max hangs " }, "2026-09-27", ids).error).toMatch(/already exists/);

    const full = Array.from({ length: MAX_COACH_NOTES }, (_, i) => note(`n${i}`, `Note ${i}`));
    expect(applyCoachNoteChange(full, { action: "add", text: "One more" }, "2026-09-27", ids).error).toMatch(/already 20 notes/);
  });

  it("warns when the AI touches one of the athlete's own notes", () => {
    const out = applyCoachNoteChange([note("mine", "Elbow: no one-arm lock-offs", "me")], { action: "remove", id: "mine" }, "2026-09-27", ids);
    expect(out.warnings).toEqual(["This is one of your own notes."]);
  });

  it("renders About me, the standing goal and the notes for the prompt - or nothing", () => {
    expect(renderCoachMemory(undefined, [])).toBe("");
    expect(hasProfile({ id: "me" })).toBe(false);
    const text = renderCoachMemory(
      { id: "me", heightCm: 178, apeIndexCm: 4, boardLevels: "Kilter 40°: 7A", standingGoal: "Flash 7A outdoors by spring" },
      [note("k3x9", "Recovers slowly from max hangs"), note("m1n2", "Elbow: no lock-offs", "me")],
    );
    expect(text).toContain("Height: 178 cm");
    expect(text).toContain("Ape index: +4 cm");
    expect(text).toContain("Board levels: Kilter 40°: 7A");
    expect(text).toContain("standing goal (what to work towards unless a request says otherwise): Flash 7A outdoors by spring");
    expect(text).toContain("Coach notes (2 of 20)");
    expect(text).toContain("[k3x9] Recovers slowly from max hangs (AI, 2026-09-01)");
    expect(text).toContain("[m1n2] Elbow: no lock-offs (me, 2026-09-01)");
  });

  it("tells the AI the limit, that none is fine, and how notes are used and kept", () => {
    expect(COACH_NOTES_INSTRUCTIONS).toContain("At most 20 notes");
    expect(COACH_NOTES_INSTRUCTIONS).toContain("zero changes is a fine answer");
    expect(COACH_NOTES_INSTRUCTIONS).toContain("EVERY future AI coach reads");
    expect(COACH_NOTES_INSTRUCTIONS).toContain("merge or remove notes first");
    expect(COACH_NOTES_INSTRUCTIONS).toContain('Notes marked "me" are mine');
    for (const a of ['"action": "add"', '"action": "edit"', '"action": "remove"']) expect(COACH_NOTES_INSTRUCTIONS).toContain(a);
  });
});

describe("coach notes in a change set", () => {
  const state = (coachNotes: CoachNote[]): PlannerState => ({
    exerciseTypes: [], analyticsCategories: [], phaseDefs: [], templates: {}, trainingBlocks: [], workouts: [],
    weekOverrides: [], weekNotes: [], coachNotes, today: "2026-09-27", currentWeekId: "2026-W39",
  });
  const doc = {
    summary: "Noted your elbow.",
    coachNotes: [
      { action: "add", text: "Left elbow flares with one-arm lock-offs - avoid" },
      { action: "edit", id: "k3x9", text: "Keep 72 h between max-hang sessions" },
      { action: "remove", id: "gone" },
    ],
  };

  it("is a change set on its own, one tickable item per change", () => {
    const v = validateChangeSet(doc);
    expect(v.valid).toBe(true);
    const r = planChanges(v.data!, state([note("k3x9", "Recovers slowly from max hangs"), note("gone", "Old")]), undefined, ids);
    expect(r.items.map((i) => i.section)).toEqual(["coach", "coach", "coach"]);
    expect(r.writes.coachNotes!.map((x) => x.text)).toEqual(["Keep 72 h between max-hang sessions", "Left elbow flares with one-arm lock-offs - avoid"]);
  });

  it("saves only what's ticked", () => {
    const v = validateChangeSet(doc);
    const selected = allItemIds(v.data!);
    selected.delete("coach-0");
    const r = planWithSelection(v.data!, state([note("k3x9", "x"), note("gone", "y")]), selected, ids);
    expect(r.writes.coachNotes!.map((x) => x.id)).toEqual(["k3x9"]);
  });

  it("shortens an over-long note instead of rejecting the whole reply", () => {
    const v = validateChangeSet({ coachNotes: [{ action: "add", text: "x".repeat(400) }] });
    expect(v.valid).toBe(true);
    expect((v.data!.coachNotes[0] as { text: string }).text.length).toBeLessThanOrEqual(240);
  });
});

describe("the prompt", () => {
  const profile = { recentWorkouts: [], benchmarks: [] };
  it("puts the memory first, editable in a plan change, read-only elsewhere", () => {
    const gen = buildCoachPrompt({ mode: "generate", profile, targetWeekIds: ["2026-W40"], goal: "", coachMemory: "- Coach notes (1 of 20): [k3x9] x" });
    expect(gen).toContain("My coaching memory:");
    expect(gen).toContain('You may update the coach notes - see "coachNotes" below.');
    expect(gen.indexOf("My coaching memory")).toBeLessThan(gen.indexOf("My training profile"));
    const ctx = buildCoachPrompt({ mode: "context", profile, targetWeekIds: [], goal: "", coachMemory: "- About me: x" });
    expect(ctx).toContain("treat them as true");
    expect(buildCoachPrompt({ mode: "context", profile, targetWeekIds: [], goal: "" })).not.toContain("coaching memory");
  });
});
