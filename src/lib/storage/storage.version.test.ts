import { describe, it, expect } from "vitest";
import { isNewerExportVersion } from "./index";

describe("isNewerExportVersion", () => {
  it("compares major and minor numerically", () => {
    expect(isNewerExportVersion("999")).toBe(true);
    expect(isNewerExportVersion("3.100", "3.34")).toBe(true);
    expect(isNewerExportVersion("3.9", "3.34")).toBe(false);
    expect(isNewerExportVersion("3.34", "3.34")).toBe(false);
    expect(isNewerExportVersion("2.99", "3.34")).toBe(false);
    expect(isNewerExportVersion("1.0", "3.34")).toBe(false);
  });
});
