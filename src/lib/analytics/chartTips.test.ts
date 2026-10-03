import { describe, it, expect } from "vitest";
import { ChartTips, isTapPointer, isKeyboardActivation } from "./chartTips.svelte";

describe("ChartTips", () => {
  it("starts with nothing open", () => {
    expect(new ChartTips().openId).toBeNull();
  });

  it("toggles a point open and closed", () => {
    const tips = new ChartTips();
    tips.toggle("a");
    expect(tips.isOpen("a")).toBe(true);
    tips.toggle("a");
    expect(tips.isOpen("a")).toBe(false);
  });

  it("keeps only one open at a time", () => {
    const tips = new ChartTips();
    tips.toggle("a");
    tips.toggle("b");
    expect(tips.isOpen("a")).toBe(false);
    expect(tips.isOpen("b")).toBe(true);
  });

  it("opens without toggling, so re-entering on hover does not close", () => {
    const tips = new ChartTips();
    tips.open("a");
    tips.open("a");
    expect(tips.isOpen("a")).toBe(true);
  });

  it("closes only the point it is asked about", () => {
    const tips = new ChartTips();
    tips.open("a");
    tips.closeIf("b");
    expect(tips.isOpen("a")).toBe(true);
    tips.closeIf("a");
    expect(tips.openId).toBeNull();
  });
});

describe("isTapPointer", () => {
  it("is true for touch and pen, which have no hover to rely on", () => {
    expect(isTapPointer({ pointerType: "touch" } as PointerEvent)).toBe(true);
    expect(isTapPointer({ pointerType: "pen" } as PointerEvent)).toBe(true);
  });

  it("is false for a mouse, where hover already opens the tooltip", () => {
    // Regression: a mouse that both opened on `pointerenter` and toggled on
    // click closed the tooltip the moment the user clicked what they were
    // hovering, which read as clicking being broken.
    expect(isTapPointer({ pointerType: "mouse" } as PointerEvent)).toBe(false);
  });
});

describe("isKeyboardActivation", () => {
  it("is true for Enter/Space on a focused button", () => {
    expect(isKeyboardActivation({ detail: 0 } as MouseEvent)).toBe(true);
  });

  it("is false for a real pointer click, which pointerup already handled", () => {
    expect(isKeyboardActivation({ detail: 1 } as MouseEvent)).toBe(false);
    expect(isKeyboardActivation({ detail: 2 } as MouseEvent)).toBe(false);
  });
});

describe("the mouse and touch paths together", () => {
  const tips = () => new ChartTips();
  const enter = (t: ChartTips, id: string, type: string) => {
    if (!isTapPointer({ pointerType: type } as PointerEvent)) t.open(id);
  };
  const up = (t: ChartTips, id: string, type: string) => {
    if (isTapPointer({ pointerType: type } as PointerEvent)) t.toggle(id);
  };
  const click = (t: ChartTips, id: string, detail: number) => {
    if (isKeyboardActivation({ detail } as MouseEvent)) t.toggle(id);
  };

  it("a mouse hover opens and a mouse click leaves it open", () => {
    const t = tips();
    enter(t, "a", "mouse");
    up(t, "a", "mouse");
    click(t, "a", 1);
    expect(t.isOpen("a")).toBe(true);
  });

  it("a tap opens, and a second tap closes", () => {
    const t = tips();
    enter(t, "a", "touch");
    up(t, "a", "touch");
    click(t, "a", 1);
    expect(t.isOpen("a")).toBe(true);

    up(t, "a", "touch");
    click(t, "a", 1);
    expect(t.isOpen("a")).toBe(false);
  });

  it("the keyboard toggles without any pointer event", () => {
    const t = tips();
    click(t, "a", 0);
    expect(t.isOpen("a")).toBe(true);
    click(t, "a", 0);
    expect(t.isOpen("a")).toBe(false);
  });
});
