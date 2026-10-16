import { beforeEach, describe, expect, it } from "vitest";
import { planFocus } from "./planFocus";

describe("planFocus", () => {
  beforeEach(() => planFocus.clear());

  it("hands what one view left to the other, once", () => {
    planFocus.set("weeks", "2026-10-14", "s1");
    expect(planFocus.take("calendar")).toEqual({ day: "2026-10-14", sessionId: "s1", from: "weeks" });
    expect(planFocus.take("calendar")).toBeUndefined();
  });
  it("never hands a view its own focus", () => {
    planFocus.set("calendar", "2026-10-14");
    expect(planFocus.take("calendar")).toBeUndefined();
    expect(planFocus.take("weeks")?.day).toBe("2026-10-14");
  });
  it("a later touch replaces an earlier one, even a read one", () => {
    planFocus.set("weeks", "2026-10-12");
    planFocus.take("calendar");
    planFocus.set("weeks", "2026-10-15", "s2");
    expect(planFocus.take("calendar")?.sessionId).toBe("s2");
  });
  it("peek reads without using it up; clear forgets", () => {
    planFocus.set("weeks", "2026-10-12");
    expect(planFocus.peek()?.day).toBe("2026-10-12");
    expect(planFocus.take("calendar")?.day).toBe("2026-10-12");
    planFocus.clear();
    expect(planFocus.peek()).toBeUndefined();
  });
});
