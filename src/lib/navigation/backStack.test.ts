import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerBack, backDepth, closeTop, _resetBackStackForTests } from "./backStack.svelte";

/**
 * A minimal browser history: pushState adds an entry after the current
 * one (dropping any forward entries), back() moves one step back
 * *asynchronously* and then fires popstate - the same ordering a real
 * browser has, which is what makes the release/register race worth testing.
 */
function fakeWindow() {
  const listeners: (() => void)[] = [];
  const h = {
    entries: [{}] as unknown[],
    index: 0,
    pushState(state: unknown) {
      h.entries = h.entries.slice(0, h.index + 1);
      h.entries.push(state);
      h.index++;
    },
    back() {
      setTimeout(() => {
        if (h.index === 0) return;
        h.index--;
        listeners.forEach((l) => l());
      }, 0);
    },
  };
  return {
    history: h,
    addEventListener: (_type: string, l: () => void) => listeners.push(l),
  };
}

const settle = () => new Promise((r) => setTimeout(r, 5));
const g = globalThis as { window?: unknown };
let win: ReturnType<typeof fakeWindow>;

beforeEach(() => {
  _resetBackStackForTests();
  win = fakeWindow();
  g.window = win;
});
afterEach(() => {
  g.window = undefined;
});

describe("back stack", () => {
  it("back closes the most recent thing first", async () => {
    const closed: string[] = [];
    registerBack(() => closed.push("sheet"));
    registerBack(() => closed.push("modal"));
    expect(win.history.index).toBe(2);

    win.history.back();
    await settle();
    expect(closed).toEqual(["modal"]);
    win.history.back();
    await settle();
    expect(closed).toEqual(["modal", "sheet"]);
    expect(backDepth()).toBe(0);
    expect(win.history.index).toBe(0);
  });

  it("closing from the UI steps history back without closing anything else", async () => {
    const closed: string[] = [];
    registerBack(() => closed.push("tab"));
    const release = registerBack(() => closed.push("sheet"));
    release();
    await settle();
    expect(closed).toEqual([]);
    expect(backDepth()).toBe(1);
    expect(win.history.index).toBe(1);
  });

  it("re-arms when the thing is still open after closing (a declined 'discard?')", async () => {
    let open = true;
    registerBack(() => {}, () => open);
    win.history.back();
    await settle();
    expect(backDepth()).toBe(1);
    expect(win.history.index).toBe(1);
    open = false;
    win.history.back();
    await settle();
    expect(backDepth()).toBe(0);
  });

  it("stays in step when a release races a new registration", async () => {
    const closed: string[] = [];
    const releaseView = registerBack(() => closed.push("view"));
    // "Start" in the session view: the view closes and the live session opens at once.
    releaseView();
    registerBack(() => closed.push("session"));
    await settle();
    expect(backDepth()).toBe(1);
    win.history.back();
    await settle();
    expect(closed).toEqual(["session"]);
    expect(backDepth()).toBe(0);
  });

  it("does nothing without a window (tests, SSR)", () => {
    g.window = undefined;
    const release = registerBack(() => {});
    expect(backDepth()).toBe(0);
    expect(() => release()).not.toThrow();
  });
});

describe("back stack in the native app", () => {
  beforeEach(() => _resetBackStackForTests(true));

  it("closes the top thing directly and never touches history", async () => {
    const closed: string[] = [];
    registerBack(() => closed.push("tab"));
    const releaseSheet = registerBack(() => closed.push("sheet"));
    registerBack(() => closed.push("modal"));
    expect(win.history.index).toBe(0);
    expect(await closeTop()).toBe(true);
    expect(closed).toEqual(["modal"]);
    releaseSheet();
    expect(backDepth()).toBe(1);
    expect(await closeTop()).toBe(true);
    expect(closed).toEqual(["modal", "tab"]);
    expect(await closeTop()).toBe(false);
    expect(win.history.index).toBe(0);
  });

  it("re-arms when the thing stays open", async () => {
    let open = true;
    registerBack(() => {}, () => open);
    await closeTop();
    expect(backDepth()).toBe(1);
    open = false;
    await closeTop();
    expect(backDepth()).toBe(0);
  });
});

describe("back stack history ordering", () => {
  it("a push waits for the back before it, however fast the next thing opens", async () => {
    // "Finish & rate": the session closes and the rating sheet opens in the same tick.
    registerBack(() => {});
    const releaseSession = registerBack(() => {});
    await settle();
    expect(win.history.index).toBe(2);
    const order: string[] = [];
    const push = win.history.pushState;
    const back = win.history.back;
    win.history.pushState = (s: unknown) => { order.push("push"); push(s); };
    win.history.back = () => { order.push("back"); back(); };
    releaseSession();
    const releaseRating = registerBack(() => {});
    await settle();
    expect(order).toEqual(["back", "push"]);
    expect(win.history.index).toBe(backDepth() + 0);
    releaseRating();
    await settle();
    expect(win.history.index).toBe(backDepth());
    expect(win.history.index).toBe(1);
  });

  it("does not hang if the browser never sends the popstate", async () => {
    registerBack(() => {});
    const release = registerBack(() => {});
    win.history.back = () => {};
    release();
    registerBack(() => {});
    await new Promise((r) => setTimeout(r, 450));
    expect(win.history.index).toBe(3); // the back never happened, but the push was not held up forever
  });
});
