import { describe, it, expect, vi } from "vitest";
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock("@capacitor/local-notifications", () => ({ LocalNotifications: {} }));
import { planBReminders } from "./planBReminder";
import { reminderTypeOf } from "./shared";

const input = { altId: "a1", key: "2026-W43", label: "Outdoor if dry", firstDate: "2026-10-24", decided: false };

describe("planBReminders", () => {
  it("reminds the evening before an undecided Plan B, with the forecast", () => {
    const [r] = planBReminders([{ ...input, hint: "Sat: prime at Frankenjura" }], new Date(2026, 9, 20, 12), "19:00");
    expect(r.at).toEqual(new Date(2026, 9, 23, 19, 0));
    expect(r.title).toBe("Tomorrow: Plan A or Plan B?");
    expect(r.body).toBe("Outdoor if dry - Sat: prime at Frankenjura. Start or log either one and that decides it.");
    expect(reminderTypeOf(r.id)).toBe("planB");
  });

  it("skips decided ones and evenings already past", () => {
    expect(planBReminders([{ ...input, decided: true }], new Date(2026, 9, 20), "19:00")).toEqual([]);
    expect(planBReminders([input], new Date(2026, 9, 23, 19, 30), "19:00")).toEqual([]);
  });
});
