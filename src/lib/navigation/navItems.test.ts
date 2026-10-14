import { describe, it, expect } from "vitest";
import { MAIN_ITEMS, SETTINGS_ITEM, drawerRows, fabFor, appBarBack } from "./navItems";

describe("destinations", () => {
  it("are the five the bottom bar had, in its order, with Log as the middle one", () => {
    expect(MAIN_ITEMS.map((i) => i.view)).toEqual(["home", "plan", "add", "history", "analytics"]);
    expect(MAIN_ITEMS.map((i) => i.label)).toEqual(["Home", "Plan", "Log a workout", "History", "Analytics"]);
  });
  it("Settings is its own item, reachable from the drawer and the rail on every screen", () => {
    expect(SETTINGS_ITEM).toMatchObject({ view: "settings", label: "Settings" });
  });
});

describe("drawerRows", () => {
  const base = { sessionRunning: false, syncError: false };
  it("lists the destinations, then Settings and the tour", () => {
    expect(drawerRows(base).map((r) => r.id)).toEqual(["home", "plan", "add", "history", "analytics", "settings", "tour"]);
  });
  it("puts a running session first, as a way back to it", () => {
    const rows = drawerRows({ ...base, sessionRunning: true });
    expect(rows[0]).toMatchObject({ id: "resume", label: "Resume session" });
    expect(rows).toHaveLength(8);
  });
  it("mentions sync only when it needs attention", () => {
    expect(drawerRows({ ...base, syncError: true }).map((r) => r.id)).toContain("sync");
    expect(drawerRows(base).map((r) => r.id)).not.toContain("sync");
  });
});

describe("the floating +", () => {
  it("logs a workout from Home, History and Analytics", () => {
    for (const view of ["home", "history", "analytics"] as const) expect(fabFor(view, { sessionRunning: false, inEditor: false })).toBe("log");
  });
  it("adds a session on the selected day on Plan", () => {
    expect(fabFor("plan", { sessionRunning: false, inEditor: false })).toBe("add-to-plan");
  });
  it("is not there on Log or Settings, in an editor, or while a session runs", () => {
    expect(fabFor("add", { sessionRunning: false, inEditor: false })).toBeNull();
    expect(fabFor("settings", { sessionRunning: false, inEditor: false })).toBeNull();
    expect(fabFor("home", { sessionRunning: true, inEditor: false })).toBeNull();
    expect(fabFor("plan", { sessionRunning: false, inEditor: true })).toBeNull();
  });
});

describe("the top bar's first button", () => {
  it("is the menu on a main screen and a back arrow on a nested page", () => {
    expect(appBarBack({ nested: false })).toBe("menu");
    expect(appBarBack({ nested: true })).toBe("back");
  });
});
