import { describe, expect, it } from "vitest";
import { parseTheme, resolveTheme } from "./theme";

describe("theme", () => {
  it("defaults to following the system", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("neon")).toBe("system");
  });

  it("keeps a choice made earlier", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("contrast")).toBe("contrast");
  });

  it("system follows the phone's dark mode, light otherwise", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});
