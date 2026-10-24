import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, findPage, resolvePageId, searchSettings, settingsPath, visiblePages, visibleSections, type SettingsContext } from "./tree";

const phone: SettingsContext = { native: true, widgets: true, healthConnect: true, deviceCalendar: true };
const browser: SettingsContext = { native: false, widgets: false, healthConnect: false, deviceCalendar: false };

describe("the settings tree", () => {
  it("has unique pages, each in exactly one section", () => {
    const ids = SETTINGS_SECTIONS.flatMap((s) => s.pages.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual(["setup", "display", "sessions", "health", "reminders", "ai", "data", "about"]);
  });

  it("leaves out what the device cannot do", () => {
    const data = SETTINGS_SECTIONS.find((s) => s.id === "data")!;
    expect(visiblePages(data, phone).map((p) => p.id)).toEqual(["sync", "activityImport", "healthConnect", "deviceCalendar", "exports", "widgets"]);
    expect(visiblePages(data, browser).map((p) => p.id)).toEqual(["sync", "activityImport", "exports"]);
    expect(visibleSections(browser)).toHaveLength(8);
  });

  it("writes the path to a page the way the app's text does", () => {
    expect(settingsPath("units")).toBe("Settings → App & display → Units");
    expect(settingsPath("coach")).toBe("Settings → AI & coach → Coach notes");
    expect(settingsPath("about")).toBe("Settings → About & Help");
    expect(findPage("timer").section.id).toBe("sessions");
    expect(findPage("sounds").section.id).toBe("sessions");
  });

  it("keeps old and unknown page ids from breaking a request to open a page", () => {
    expect(resolvePageId("timer")).toBe("timer");
    expect(resolvePageId("sounds")).toBe("sounds");
    expect(resolvePageId("voice")).toBe("sounds");
    expect(resolvePageId("timerSound")).toBe("sounds");
    expect(resolvePageId("phases")).toBe("phases");
    expect(resolvePageId("nope")).toBeNull();
    expect(resolvePageId(null)).toBeNull();
  });

  it("splits the timer: behaviour on one page, sound and voice on the other", () => {
    const pageOf = (q: string) => searchSettings(q, phone).map((h) => h.page);
    expect(pageOf("3-2-1 countdown")).toContain("timer");
    expect(pageOf("15 second warning")).toContain("timer");
    expect(pageOf("beep sound style")).toContain("sounds");
    expect(pageOf("speak the exercises")).toContain("sounds");
    expect(pageOf("vibrate")).toContain("sounds");
  });

  it("points every search entry at a page that exists", () => {
    for (const q of ["theme", "timer", "sound", "voice", "reminder", "sync", "units"]) {
      for (const hit of searchSettings(q, phone)) expect(() => findPage(hit.page)).not.toThrow();
    }
  });
});

describe("searchSettings", () => {
  it("finds a setting by its name or an alternative word", () => {
    expect(searchSettings("volume", phone)[0]).toEqual({ label: "Cue volume", page: "sounds" });
    expect(searchSettings("tts", phone).some((h) => h.page === "sounds")).toBe(true);
    expect(searchSettings("fahrenheit", phone)[0].page).toBe("units");
  });

  it("does not list a page again when a setting on it already matched", () => {
    expect(searchSettings("volume", phone)).toEqual([{ label: "Cue volume", page: "sounds" }]);
  });

  it("needs every word, ignores case, and finds pages by name", () => {
    expect(searchSettings("TIMER sound", phone).some((h) => h.page === "sounds")).toBe(true);
    expect(searchSettings("zzzz", phone)).toEqual([]);
    expect(searchSettings("   ", phone)).toEqual([]);
    expect(searchSettings("pain", phone).map((h) => h.page)).toContain("pain");
  });

  it("does not offer pages this device does not have", () => {
    expect(searchSettings("widgets", browser).some((h) => h.page === "widgets")).toBe(false);
    expect(searchSettings("widgets", phone).some((h) => h.page === "widgets")).toBe(true);
  });
});
