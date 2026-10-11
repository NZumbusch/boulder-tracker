import { describe, it, expect } from "vitest";
import type { Workout } from "../types";
import type { DailyForecastDay } from "./api";
import { outdoorSuggestion } from "./suggestion";

const prime = (date: string): DailyForecastDay => ({ date, weatherCode: 0, tempMaxC: 9, tempMinC: 2, humidityMeanPercent: 40, dewPointMeanC: -4 });
const greasy = (date: string): DailyForecastDay => ({ date, weatherCode: 0, tempMaxC: 27, tempMinC: 18, humidityMeanPercent: 85, dewPointMeanC: 23 });
const session = (notes: string) => ({ id: notes, status: "planned", notes, exercises: [{ id: "s", typeId: "t" }] }) as unknown as Workout;

describe("outdoorSuggestion", () => {
  const crags = [
    { name: "Frankenjura", days: [greasy("2026-09-23"), greasy("2026-09-24"), prime("2026-09-26")] },
    { name: "Font", days: [greasy("2026-09-23"), prime("2026-09-24"), prime("2026-09-26")] },
  ];

  it("picks the first prime day that has a planned session", () => {
    const plans: Record<string, Workout[]> = { "2026-09-26": [session("Limit bouldering")] };
    expect(outdoorSuggestion(crags, "2026-09-23", (d) => plans[d] ?? [])).toEqual({
      date: "2026-09-26",
      cragName: "Frankenjura",
      sessionName: "Limit bouldering",
    });
  });

  it("uses an earlier prime day when a session is planned then", () => {
    const plans: Record<string, Workout[]> = { "2026-09-24": [session("Board")], "2026-09-26": [session("Limit")] };
    expect(outdoorSuggestion(crags, "2026-09-23", (d) => plans[d] ?? [])?.cragName).toBe("Font");
  });

  it("says nothing without a prime day that has a session", () => {
    expect(outdoorSuggestion(crags, "2026-09-23", () => [])).toBeUndefined();
    expect(outdoorSuggestion(crags, "2026-09-27", () => [session("x")])).toBeUndefined();
  });
});
