import { describe, it, expect } from "vitest";
import { outdoorDayHints, hintText, looksGood } from "./planBHint";
import type { DailyForecastDay } from "./api";

const day = (date: string, over: Partial<DailyForecastDay> = {}): DailyForecastDay => ({
  date, weatherCode: 0, tempMaxC: 8, tempMinC: 2, humidityMeanPercent: 35, dewPointMeanC: -6, windMaxKmh: 10, precipitationSumMm: 0, precipitationChance: 5, ...over,
});

describe("outdoorDayHints", () => {
  it("takes the best crag per day and skips days beyond the forecast", () => {
    const places = [
      { name: "Wet crag", days: [day("2026-10-24", { precipitationSumMm: 12, precipitationChance: 90 })] },
      { name: "Frankenjura", days: [day("2026-10-24")] },
    ];
    const hints = outdoorDayHints(["2026-10-24", "2026-11-30"], places);
    expect(hints).toHaveLength(1);
    expect(hints[0].where).toBe("Frankenjura");
    expect(looksGood(hints[0])).toBe(true);
    expect(hintText(hints[0])).toMatch(/^Sat: (prime|good) at Frankenjura$/);
  });

  it("says when it will rain", () => {
    const [hint] = outdoorDayHints(["2026-10-25"], [{ name: "Home", days: [day("2026-10-25", { precipitationSumMm: 12, precipitationChance: 80 })] }]);
    expect(hint.label).toBe("Wet");
    expect(looksGood(hint)).toBe(false);
    expect(hintText(hint)).toBe("Sun: wet at Home (80% rain)");
  });
});
