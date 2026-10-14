import { describe, expect, it } from "vitest";
import { defaultRepLabel } from "./repLabel";

describe("defaultRepLabel", () => {
  it("calls a repeater on a hold a Hang", () => {
    expect(defaultRepLabel("Max Hangs", ["holdType", "holdSize", "timeOn", "timeOff"])).toBe("Hang");
    expect(defaultRepLabel("Anything", ["holdSize", "timeOn"])).toBe("Hang");
  });
  it("calls a timed set of something else a Hold", () => {
    expect(defaultRepLabel("Chin Tucks", ["sets", "reps", "timeOn"])).toBe("Hold");
    expect(defaultRepLabel(undefined, [])).toBe("Hold");
  });
  it("goes by the name when the exercise is a hang without a hold size", () => {
    expect(defaultRepLabel("Dead hang", ["timeOn"])).toBe("Hang");
  });
});
