import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultPreferences, type Preferences } from "../preferences/migrate";
import { TUNABLES } from "../preferences/tunables";
import { PAGE_PREFS, PAGE_TUNABLES, PAGES_WITHOUT_RESET, canResetPage, pageIsAtDefaults, resetPage } from "./pageReset";
import { SETTINGS_SECTIONS, type PageId } from "./tree";

const ALL_PAGES = SETTINGS_SECTIONS.flatMap((s) => s.pages.map((p) => p.id));
const RESETTABLE = ALL_PAGES.filter(canResetPage);
const SENTINEL = "__changed__";

/** Every preference and every tunable moved off its default. */
function messy(): Preferences {
  const prefs = defaultPreferences();
  const out = prefs as unknown as Record<string, unknown>;
  for (const key of Object.keys(prefs)) if (key !== "tunables" && key !== "version") out[key] = SENTINEL;
  prefs.tunables = Object.fromEntries(TUNABLES.map((t) => [t.id, t.kind === "boolean" ? !t.default : t.default === t.max ? t.min : t.max]));
  return prefs;
}

describe("the page reset registry", () => {
  it("covers every page exactly once: a reset or a reason for none", () => {
    for (const id of ALL_PAGES) expect(canResetPage(id) !== PAGES_WITHOUT_RESET.includes(id), id).toBe(true);
    for (const id of Object.keys(PAGE_PREFS)) expect(ALL_PAGES, id).toContain(id);
    for (const id of PAGES_WITHOUT_RESET) expect(PAGE_PREFS[id as PageId], id).toBeUndefined();
  });

  it("names real preferences and real tunables, each on one page only", () => {
    const keys = Object.keys(defaultPreferences());
    const seenKeys = new Set<string>();
    for (const list of Object.values(PAGE_PREFS)) for (const k of list!) {
      expect(keys).toContain(k);
      expect(seenKeys.has(k), `${k} on two pages`).toBe(false);
      seenKeys.add(k);
    }
    const ids = new Set(TUNABLES.map((t) => t.id));
    const seenIds = new Set<string>();
    for (const list of Object.values(PAGE_TUNABLES)) for (const id of list!) {
      expect(ids.has(id), id).toBe(true);
      expect(seenIds.has(id), `${id} on two pages`).toBe(false);
      seenIds.add(id);
    }
    // Every tunable is on some page, so no setting is left out of a reset by accident.
    expect([...ids].filter((id) => !seenIds.has(id))).toEqual([]);
  });

  it("never touches data, secrets, sync state or device permissions", () => {
    const covered = new Set(Object.values(PAGE_PREFS).flat());
    for (const k of ["places", "timerPresets", "notificationsEnabled", "welcomeDone", "autoBackup", "homeCollapsed", "hiddenFindings", "fingerCategoryIds", "benchmarkTotalTypeIds", "version", "navAccent"] as const) {
      expect(covered.has(k), k).toBe(false);
    }
  });

  it("matches the tunables the Settings screens render", () => {
    const read = (f: string) => readFileSync(`src/components/settings/${f}`, "utf8");
    const rendered = new Set<string>();
    for (const f of ["Settings.svelte", "GeneralSettings.svelte", "RemindersSettings.svelte"]) {
      const text = read(f);
      for (const m of text.matchAll(/ids=\{\[([^\]]*)\]\}/g)) for (const id of m[1].matchAll(/'([^']+)'/g)) rendered.add(id[1]);
      for (const m of text.matchAll(/<TunablesSettings topic="(\w+)"(?![^>]*ids=)/g)) for (const t of TUNABLES) if (t.topic === m[1]) rendered.add(t.id);
    }
    rendered.add("alerts.fatigueReminder"); // a switch in NotificationSettings
    const registered = new Set(Object.values(PAGE_TUNABLES).flat());
    expect([...rendered].sort()).toEqual([...registered].sort());
  });
});

describe("resetPage", () => {
  it("puts back only this page's preferences and tunables", () => {
    for (const id of RESETTABLE) {
      const before = messy();
      const after = resetPage(before, id);
      const defaults = defaultPreferences();
      const own = new Set<string>(PAGE_PREFS[id] ?? []);
      for (const key of Object.keys(before) as (keyof Preferences)[]) {
        if (key === "tunables") continue;
        const expected = own.has(key) ? defaults[key] : before[key];
        expect(JSON.stringify(after[key]), `${id}: ${key}`).toBe(JSON.stringify(expected));
      }
      const ownT = new Set(PAGE_TUNABLES[id] ?? []);
      for (const t of TUNABLES) {
        const expected = ownT.has(t.id) ? t.default : before.tunables[t.id];
        expect(after.tunables[t.id], `${id}: ${t.id}`).toBe(expected);
      }
    }
  });

  it("does not change the input", () => {
    const before = messy();
    const copy = JSON.stringify(before);
    resetPage(before, "home");
    expect(JSON.stringify(before)).toBe(copy);
  });

  it("leaves a page without a reset exactly as it is", () => {
    const before = messy();
    for (const id of PAGES_WITHOUT_RESET) expect(resetPage(before, id)).toBe(before);
  });

  it("keeps the tunable ranges valid", () => {
    const prefs = defaultPreferences();
    prefs.tunables = { ...prefs.tunables, "acwr.sweetMin": 1.1, "acwr.caution": 1.2, "acwr.highRisk": 1.3 };
    const after = resetPage(prefs, "model");
    expect(after.tunables["acwr.sweetMin"]).toBe(0.8);
    expect(after.tunables["acwr.caution"]).toBe(1.3);
    expect(after.tunables["acwr.highRisk"]).toBe(1.5);
  });
});

describe("pageIsAtDefaults", () => {
  it("is true on fresh preferences, false after a change on the page, true again after the reset", () => {
    const fresh = defaultPreferences();
    for (const id of RESETTABLE) expect(pageIsAtDefaults(fresh, id), id).toBe(true);
    const changed = { ...fresh, units: { ...fresh.units, weight: fresh.units.weight === "kg" ? "lb" : "kg" } } as Preferences;
    expect(pageIsAtDefaults(changed, "units")).toBe(false);
    expect(pageIsAtDefaults(changed, "pain")).toBe(true);
    expect(pageIsAtDefaults(resetPage(changed, "units"), "units")).toBe(true);
    const tuned = { ...fresh, tunables: { ...fresh.tunables, "day.startHour": 6 } };
    expect(pageIsAtDefaults(tuned, "planCalendar")).toBe(false);
    expect(pageIsAtDefaults(tuned, "model")).toBe(true);
  });

  it("is always true where there is nothing to reset", () => {
    expect(pageIsAtDefaults(messy(), "sync")).toBe(true);
  });
});
