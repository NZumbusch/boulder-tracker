import { describe, it, expect } from "vitest";
import { layoutFor, WIDE_MIN_WIDTH } from "./layoutMode.svelte";

describe("layoutFor", () => {
  it("a portrait phone is compact: the menu opens a drawer", () => {
    expect(layoutFor(390, 844)).toBe("compact");
    expect(layoutFor(412, 915)).toBe("compact");
  });
  it("a tablet, a laptop and a folded-out phone are wide: a rail stays on the left", () => {
    expect(layoutFor(WIDE_MIN_WIDTH, 1000)).toBe("wide");
    expect(layoutFor(820, 1180)).toBe("wide");
    expect(layoutFor(1366, 768)).toBe("wide");
  });
  it("a phone on its side is wide too: a rail gives back the height a bottom bar would take", () => {
    expect(layoutFor(850, 390)).toBe("wide");
    expect(layoutFor(740, 360)).toBe("wide");
  });
  it("just under the width and not short stays compact", () => {
    expect(layoutFor(WIDE_MIN_WIDTH - 1, 900)).toBe("compact");
  });
  it("a small window that is short but taller than wide stays compact", () => {
    expect(layoutFor(300, 450)).toBe("compact");
  });
});
