import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast, TOAST_MS, TOAST_UNDO_MS } from "./toast.svelte";

beforeEach(() => { vi.useFakeTimers(); toast.dismiss(); });
afterEach(() => { toast.dismiss(); vi.useRealTimers(); });

describe("toast", () => {
  it("keeps a message for a few seconds and an Undo for longer", () => {
    toast.show("saved");
    vi.advanceTimersByTime(TOAST_MS - 1);
    expect(toast.current?.text).toBe("saved");
    vi.advanceTimersByTime(2);
    expect(toast.current).toBeNull();
    toast.show("deleted", { action: { label: "Undo", run: () => {} } });
    vi.advanceTimersByTime(TOAST_UNDO_MS - 1);
    expect(toast.current?.text).toBe("deleted");
  });

  it("a plain message waits behind an Undo instead of replacing it", async () => {
    const run = vi.fn();
    toast.show("deleted", { action: { label: "Undo", run } });
    toast.show("saved");
    expect(toast.current?.text).toBe("deleted");
    await toast.current!.action!.run();
    expect(run).toHaveBeenCalledOnce();
    expect(toast.current?.text).toBe("saved");
  });

  it("a newer Undo replaces an older one, and the queue shows after it expires", () => {
    toast.show("a", { action: { label: "Undo", run: () => {} } });
    toast.show("b", { action: { label: "Undo", run: () => {} } });
    expect(toast.current?.text).toBe("b");
    toast.show("note");
    vi.advanceTimersByTime(TOAST_UNDO_MS + 1);
    expect(toast.current?.text).toBe("note");
  });

  it("the clock stops while the toast is held and restarts with at least 1.5 s", () => {
    toast.show("held");
    vi.advanceTimersByTime(TOAST_MS - 500);
    toast.pause();
    vi.advanceTimersByTime(60_000);
    expect(toast.current?.text).toBe("held");
    toast.resume();
    vi.advanceTimersByTime(1400);
    expect(toast.current?.text).toBe("held");
    vi.advanceTimersByTime(200);
    expect(toast.current).toBeNull();
  });
});
