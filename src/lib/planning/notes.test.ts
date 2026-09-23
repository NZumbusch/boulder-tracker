import { describe, it, expect } from "vitest";
import type { WeekNote } from "../types";
import { appendAINote, upsertWeekNote, weekNoteText } from "./notes";

describe("upsertWeekNote", () => {
  const notes: WeekNote[] = [{ weekId: "2026-W39", text: "Trip to Font" }];

  it("adds a note for a week that has none", () => {
    expect(upsertWeekNote(notes, "2026-W40", "Elbow niggly")).toEqual([
      { weekId: "2026-W39", text: "Trip to Font" },
      { weekId: "2026-W40", text: "Elbow niggly" },
    ]);
  });

  it("replaces an existing week's note rather than adding a second one", () => {
    expect(upsertWeekNote(notes, "2026-W39", "Trip cancelled")).toEqual([{ weekId: "2026-W39", text: "Trip cancelled" }]);
  });

  it("removes the note when the new text is blank", () => {
    expect(upsertWeekNote(notes, "2026-W39", "   \n ")).toEqual([]);
  });

  it("trims surrounding whitespace and leaves the input array untouched", () => {
    const result = upsertWeekNote(notes, "2026-W41", "  keep Monday light \n");
    expect(result[1]).toEqual({ weekId: "2026-W41", text: "keep Monday light" });
    expect(notes).toHaveLength(1);
  });
});

describe("weekNoteText", () => {
  it("returns the week's text, or an empty string", () => {
    const notes: WeekNote[] = [{ weekId: "2026-W39", text: "Trip" }];
    expect(weekNoteText(notes, "2026-W39")).toBe("Trip");
    expect(weekNoteText(notes, "2026-W40")).toBe("");
  });
});

describe("appendAINote", () => {
  it("prefixes the AI's text when there is no existing note", () => {
    expect(appendAINote(undefined, "Deload if elbow flares")).toBe("AI: Deload if elbow flares");
    expect(appendAINote("  ", "Deload")).toBe("AI: Deload");
  });

  it("appends below the user's own note, never replacing it", () => {
    expect(appendAINote("Travelling Thu-Sun", "Move the limit session to Monday")).toBe(
      "Travelling Thu-Sun\n\nAI: Move the limit session to Monday",
    );
  });

  it("does not add the same AI line twice when a plan is imported again", () => {
    const once = appendAINote("Mine", "Same advice");
    expect(appendAINote(once, "Same advice")).toBe(once);
  });

  it("leaves the existing note alone when the AI text is blank", () => {
    expect(appendAINote("Mine", "  ")).toBe("Mine");
    expect(appendAINote(undefined, "")).toBe("");
  });
});
