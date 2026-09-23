import { describe, it, expect } from "vitest";
import { displayGrade, fontToV, gradeFromInput, vToFont, vRank } from "./gradeScale";

describe("Font <-> V", () => {
  it("maps Font grades to their V band, including 8a.nu's lettered low grades", () => {
    expect(fontToV("6a+")).toBe("V3");
    expect(fontToV("7B+")).toBe("V8");
    expect(fontToV("5C")).toBe("V2");
    expect(fontToV("V5")).toBeUndefined();
  });

  it("maps V back to the lowest Font grade of its band", () => {
    expect(vToFont("v4")).toBe("6B");
    expect(vToFont("V10")).toBe("7C+");
    expect(vRank("V3")! < vRank("V10")!).toBe(true);
  });

  it("displays in the chosen scale, leaving unknown grades alone", () => {
    expect(displayGrade("7A", "v")).toBe("V6");
    expect(displayGrade("7A", "font")).toBe("7A");
    expect(displayGrade("6c (sit)", "v")).toBe("6c (sit)");
  });

  it("stores a typed V grade as Font, anything else as typed", () => {
    expect(gradeFromInput(" v5 ")).toBe("6C");
    expect(gradeFromInput("7A+")).toBe("7A+");
  });
});
