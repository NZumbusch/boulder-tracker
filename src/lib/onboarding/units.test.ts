import { describe, expect, it } from "vitest";
import { regionOf, unitsFromLocale } from "./units";

describe("regionOf", () => {
  it("reads the region of a language tag", () => {
    expect(regionOf("en-US")).toBe("US");
    expect(regionOf("de_DE")).toBe("DE");
    expect(regionOf("zh-Hant-TW")).toBe("TW");
    expect(regionOf("es-419")).toBe("419");
    expect(regionOf("en")).toBeNull();
    expect(regionOf("")).toBeNull();
    expect(regionOf(undefined)).toBeNull();
  });
});

describe("unitsFromLocale", () => {
  it("starts the United States on imperial units and V grades", () => {
    expect(unitsFromLocale("en-US")).toEqual({ metric: false, grades: "v" });
  });
  it("starts the other imperial regions on imperial units, with Font grades", () => {
    expect(unitsFromLocale("en-LR")).toEqual({ metric: false, grades: "font" });
  });
  it("starts everywhere else, and an unknown region, on metric and Font grades", () => {
    expect(unitsFromLocale("de-DE")).toEqual({ metric: true, grades: "font" });
    expect(unitsFromLocale("en-GB")).toEqual({ metric: true, grades: "font" });
    expect(unitsFromLocale("en")).toEqual({ metric: true, grades: "font" });
    expect(unitsFromLocale(undefined)).toEqual({ metric: true, grades: "font" });
  });
});
