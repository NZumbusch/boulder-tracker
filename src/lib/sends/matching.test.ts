import { describe, it, expect } from "vitest";
import type { OutdoorAscent } from "../types";
import { classifyImport, matchNames, normalizeName } from "./matching";

describe("normalizeName", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalizeName("  L'Abbé  Pierre—Assis ")).toBe("l abbe pierre assis");
    expect(normalizeName("Straße & Co.")).toBe("strasse and co");
  });
});

describe("matchNames", () => {
  it("treats spelling variants of the same name as the same", () => {
    expect(matchNames("Kamelkante", "Kamel-Kante")).toBe("same");
    expect(matchNames("Trémplin", "tremplin")).toBe("same");
  });

  it("calls a typo or an added word similar", () => {
    expect(matchNames("Erdbeerkante", "Erdberkante")).toBe("similar");
    expect(matchNames("Big Boss", "Big Boss sit")).toBe("similar");
  });

  it("keeps different problems apart, and never matches a missing name", () => {
    expect(matchNames("Jenny", "Kamelkante")).toBe("different");
    expect(matchNames("Jaws", "Java")).toBe("different"); // too short to fuzzy-match
    expect(matchNames(undefined, "Jenny")).toBe("different");
  });
});

describe("classifyImport", () => {
  const logged: OutdoorAscent[] = [
    { id: "1", date: "2026-08-18T12:00:00Z", name: "Erdbeerkante", grade: "6A", style: "Flash", crag: "Magic Wood" },
    { id: "2", date: "2026-08-17", name: "Kamelkante", grade: "6C", crag: "Magic Wood" },
  ];
  const row = (name: string | undefined, date: string, grade: string, extra: Partial<OutdoorAscent> = {}): OutdoorAscent => ({ id: `n-${name}-${date}`, date, grade, ...(name ? { name } : {}), ...extra });

  it("discards what's already logged, flags near-misses, keeps the rest", () => {
    const result = classifyImport(
      [
        row("Erdbeerkante", "2026-08-18T12:00:00Z", "6a"), // same day, name, grade -> duplicate
        row("Kamel Kante", "2026-08-18", "6C"), // a day later -> maybe
        row("Erdberkante", "2026-08-18", "6A"), // typo -> maybe
        row("Jenny", "2026-08-18", "6B"), // new
      ],
      logged,
    );
    expect(result.map((r) => r.status)).toEqual(["duplicate", "maybe", "maybe", "new"]);
    expect(result[1].match?.id).toBe("2");
  });

  it("catches a send listed twice in the same file", () => {
    const result = classifyImport([row("Jenny", "2026-08-18", "6B"), row("Jenny", "2026-08-18", "6B")], []);
    expect(result.map((r) => r.status)).toEqual(["new", "duplicate"]);
  });

  it("compares unnamed sends by day, grade, crag and style", () => {
    const unnamed = [{ id: "u", date: "2026-08-18", grade: "7A", crag: "Magic Wood" }];
    expect(classifyImport([row(undefined, "2026-08-18", "7A", { crag: "Magic Wood" })], unnamed)[0].status).toBe("duplicate");
    expect(classifyImport([row(undefined, "2026-08-18", "7A", { crag: "Cresciano" })], unnamed)[0].status).toBe("maybe");
  });
});
