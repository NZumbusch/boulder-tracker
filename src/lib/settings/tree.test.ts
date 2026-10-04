import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, findPage, searchSettings, settingsPath, visiblePages, visibleSections, type SettingsContext } from "./tree";

const phone: SettingsContext = { native: true, widgets: true, healthConnect: true };
const browser: SettingsContext = { native: false, widgets: false, healthConnect: false };

describe("the settings tree", () => {
  it("has unique pages, each in exactly one section", () => {
    const ids = SETTINGS_SECTIONS.flatMap((s) => s.pages.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual(["setup", "display", "sessions", "health", "reminders", "ai", "data", "about"]);
  });

  it("leaves out what the device cannot do", () => {
    const data = SETTINGS_SECTIONS.find((s) => s.id === "data")!;
    expect(visiblePages(data, phone).map((p) => p.id)).toEqual(["sync", "healthConnect", "exports", "widgets"]);
    expect(visiblePages(data, browser).map((p) => p.id)).toEqual(["sync", "exports"]);
    expect(visibleSections(browser)).toHaveLength(8);
  });

  it("writes the path to a page the way the app's text does", () => {
    expect(settingsPath("units")).toBe("Settings → App & display → Units");
    expect(settingsPath("coach")).toBe("Settings → AI & coach → Coach notes");
    expect(settingsPath("about")).toBe("Settings → About & Help");
    expect(findPage("timer").section.id).toBe("sessions");
  });
});

describe("searchSettings", () => {
  it("finds a setting by its name or an alternative word", () => {
    expect(searchSettings("volume", phone)[0]).toEqual({ label: "Cue volume", page: "timer" });
    expect(searchSettings("tts", phone).some((h) => h.page === "timer")).toBe(true);
    expect(searchSettings("fahrenheit", phone)[0].page).toBe("units");
  });

  it("does not list a page again when a setting on it already matched", () => {
    expect(searchSettings("volume", phone)).toEqual([{ label: "Cue volume", page: "timer" }]);
  });

  it("needs every word, ignores case, and finds pages by name", () => {
    expect(searchSettings("TIMER sound", phone).some((h) => h.page === "timer")).toBe(true);
    expect(searchSettings("zzzz", phone)).toEqual([]);
    expect(searchSettings("   ", phone)).toEqual([]);
    expect(searchSettings("pain", phone).map((h) => h.page)).toContain("pain");
  });

  it("does not offer pages this device does not have", () => {
    expect(searchSettings("widgets", browser).some((h) => h.page === "widgets")).toBe(false);
    expect(searchSettings("widgets", phone).some((h) => h.page === "widgets")).toBe(true);
  });
});
