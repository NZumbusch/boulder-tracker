import { describe, it, expect } from "vitest";
import {
  weeksToShow,
  weekWindowOffsets,
  labelStep,
  showsLabel,
  sparseLabelStep,
  WEEK_SLOT_PX,
  MIN_WEEKS,
  MAX_WEEKS,
  DEFAULT_WEEKS,
} from "./chartWindow";

describe("weeksToShow", () => {
  it("fits more weeks into a wider container", () => {
    expect(weeksToShow(560, "auto")).toBeGreaterThan(weeksToShow(280, "auto"));
  });

  it("shows fewer weeks at a phone width than the old fixed 12", () => {
    expect(weeksToShow(280, "auto")).toBeLessThan(12);
  });

  it("orders the densities: compact shows the most, comfortable the fewest", () => {
    const width = 400;
    expect(weeksToShow(width, "compact")).toBeGreaterThan(weeksToShow(width, "auto"));
    expect(weeksToShow(width, "auto")).toBeGreaterThan(weeksToShow(width, "comfortable"));
  });

  it("gives each week roughly its density's target width", () => {
    for (const density of ["compact", "auto", "comfortable"] as const) {
      const width = 400;
      const perWeek = width / weeksToShow(width, density);
      expect(Math.abs(perWeek - WEEK_SLOT_PX[density])).toBeLessThan(WEEK_SLOT_PX[density] * 0.3);
    }
  });

  it("clamps to a readable range at extreme widths", () => {
    expect(weeksToShow(40, "comfortable")).toBe(MIN_WEEKS);
    expect(weeksToShow(5000, "compact")).toBe(MAX_WEEKS);
  });

  it("falls back to a sensible default before the container is measured", () => {
    expect(weeksToShow(undefined, "auto")).toBe(DEFAULT_WEEKS);
    expect(weeksToShow(0, "auto")).toBe(DEFAULT_WEEKS);
  });
});

describe("weekWindowOffsets", () => {
  it("spans exactly the requested number of weeks", () => {
    for (const weeks of [4, 7, 10, 26]) {
      const { startOffset, endOffset } = weekWindowOffsets(weeks, 0);
      expect(endOffset - startOffset + 1).toBe(weeks);
    }
  });

  it("includes the current week and a short lookahead at page 0", () => {
    const { startOffset, endOffset } = weekWindowOffsets(10, 0);
    expect(startOffset).toBeLessThanOrEqual(0);
    expect(endOffset).toBe(2);
  });

  it("gives up lookahead before history on the narrowest window", () => {
    const { startOffset, endOffset } = weekWindowOffsets(MIN_WEEKS, 0);
    expect(endOffset).toBe(0);
    expect(startOffset).toBe(-(MIN_WEEKS - 1));
  });

  it("pages by a whole window, leaving no gap or overlap between pages", () => {
    const weeks = 10;
    const current = weekWindowOffsets(weeks, 0);
    const previous = weekWindowOffsets(weeks, -1);
    const next = weekWindowOffsets(weeks, 1);
    expect(previous.endOffset).toBe(current.startOffset - 1);
    expect(next.startOffset).toBe(current.endOffset + 1);
  });
});

describe("labelStep / showsLabel", () => {
  it("labels every week when they are wide enough", () => {
    expect(labelStep(8, 400)).toBe(1);
  });

  it("thins the axis when weeks are narrower than a label", () => {
    expect(labelStep(20, 200)).toBeGreaterThan(1);
  });

  it("thins enough that the drawn labels do not overlap", () => {
    const weeks = 24;
    const width = 280;
    const step = labelStep(weeks, width);
    const drawn = Array.from({ length: weeks }, (_, i) => i).filter((i) => showsLabel(i, weeks, step));
    expect(width / drawn.length).toBeGreaterThanOrEqual(24);
  });

  it("always labels the most recent week", () => {
    const weeks = 20;
    const step = labelStep(weeks, 200);
    expect(showsLabel(weeks - 1, weeks, step)).toBe(true);
  });

  it("labels everything when the container has not been measured", () => {
    expect(labelStep(12, undefined)).toBe(1);
  });
});

describe("sparseLabelStep", () => {
  it("labels every point when there are few enough", () => {
    expect(sparseLabelStep(4, 4)).toBe(1);
    expect(sparseLabelStep(1, 4)).toBe(1);
  });

  it("never draws more than the cap", () => {
    for (const count of [5, 10, 17, 40]) {
      const step = sparseLabelStep(count, 4);
      const drawn = Array.from({ length: count }, (_, i) => i).filter((i) => showsLabel(i, count, step));
      expect(drawn.length).toBeLessThanOrEqual(4);
    }
  });

  it("keeps the most recent point labelled", () => {
    const count = 17;
    expect(showsLabel(count - 1, count, sparseLabelStep(count))).toBe(true);
  });
});
