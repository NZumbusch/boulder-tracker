import { describe, it, expect } from "vitest";
import { GOAL_STYLE, dayGoalStyle } from "./goalStyle";

describe("goal style", () => {
  it("gives trips and competitions the one gold colour and the trophy to competitions only", () => {
    expect(GOAL_STYLE.trip.fill).toBe("bg-amber-400");
    expect(GOAL_STYLE.competition.fill).toBe(GOAL_STYLE.trip.fill);
    expect(GOAL_STYLE.competition.icon).toBe("ic:baseline-emoji-events");
    expect(GOAL_STYLE.trip.icon).not.toBe(GOAL_STYLE.competition.icon);
  });
  it("a day with both shows the competition", () => {
    expect(dayGoalStyle(["trip", "competition"])).toBe(GOAL_STYLE.competition);
    expect(dayGoalStyle(["trip"])).toBe(GOAL_STYLE.trip);
  });
});
