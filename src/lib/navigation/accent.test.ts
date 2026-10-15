import { describe, it, expect } from "vitest";
import { accentClasses } from "./accent";
import { defaultPreferences, migratePreferences } from "../preferences/migrate";

describe("navigation accent", () => {
  it("is blue unless chosen otherwise", () => {
    expect(defaultPreferences().navAccent).toBe("blue");
    expect(accentClasses("blue").text).toBe("text-primary");
    expect(accentClasses("green").text).toBe("text-success");
  });

  it("only accepts the two accents when preferences are read back", () => {
    const base = JSON.parse(JSON.stringify(defaultPreferences()));
    expect(migratePreferences({ ...base, navAccent: "green" }).navAccent).toBe("green");
    expect(migratePreferences({ ...base, navAccent: "purple" }).navAccent).toBe("blue");
    expect(migratePreferences({ ...base, navAccent: undefined }).navAccent).toBe("blue");
  });
});
