import { describe, it, expect } from "vitest";
import { AI_CHANGESET_INSTRUCTIONS } from "./changeSetPrompt";
import { PARAMETER_BLOCKS } from "./changeSet";
import { EXERCISE_VALUE_FIELD_NAMES } from "./valueSpec";

describe("the change-set prompt documents every capability", () => {
  const p = AI_CHANGESET_INSTRUCTIONS;

  it("names every section, action and key the validator accepts", () => {
    for (const key of ['"exerciseTypes"', '"phases"', '"weeks"', '"summary"', '"sessionChanges"', '"exerciseChanges"', '"match"', '"set"', '"occurrence"', '"position"', '"rename"', '"categoryName"', '"parameters"', '"from"', '"to"', '"week"', '"phase"', '"blockNotes"', '"notes"', '"startTime"', '"plannedDuration"', '"dayOfWeek"']) {
      expect(p, key).toContain(key);
    }
    for (const action of ['"add"', '"edit"', '"remove"', '"archive"', '"delete"']) expect(p, action).toContain(`"action": ${action}`);
  });

  it("lists every trackable field and every exercise value field", () => {
    for (const b of PARAMETER_BLOCKS) expect(p, b).toContain(b);
    for (const f of EXERCISE_VALUE_FIELD_NAMES) expect(p, f).toContain(f);
  });

  it("explains where each kind of note goes, and that null clears a value", () => {
    expect(p).toContain("About one session");
    expect(p).toContain("Never put session-level or week-level advice into an exercise's notes");
    expect(p).toContain("null removes a field");
  });
});
