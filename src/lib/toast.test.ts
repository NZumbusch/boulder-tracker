import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast, TOAST_MS, TOAST_UNDO_MS, createUndoScope } from "./toast.svelte";

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

describe("createUndoScope", () => {
  it("closing without saving removes the toast", () => {
    const scope = createUndoScope();
    scope.undoable("removed", () => {}, () => {});
    scope.close();
    expect(toast.current).toBeNull();
  });

  it("a saved editor keeps the toast and Undo runs the stored-data restore", async () => {
    const draft = vi.fn();
    const late = vi.fn();
    const scope = createUndoScope();
    scope.undoable("removed", draft, late);
    scope.commit();
    scope.close();
    expect(toast.current?.text).toBe("removed");
    await toast.current!.action!.run();
    expect(late).toHaveBeenCalledOnce();
    expect(draft).not.toHaveBeenCalled();
  });

  it("saved but with no stored-data restore: the toast goes", () => {
    const scope = createUndoScope();
    scope.undoable("removed", () => {});
    scope.commit();
    scope.close();
    expect(toast.current).toBeNull();
  });

  it("while the editor is open Undo runs the draft restore", async () => {
    const draft = vi.fn();
    const late = vi.fn();
    createUndoScope().undoable("removed", draft, late);
    await toast.current!.action!.run();
    expect(draft).toHaveBeenCalledOnce();
    expect(late).not.toHaveBeenCalled();
  });

  it("leaves a newer unrelated toast alone", () => {
    const scope = createUndoScope();
    scope.undoable("removed", () => {}, () => {});
    toast.show("other", { action: { label: "Undo", run: () => {} } });
    scope.commit();
    scope.close();
    expect(toast.current?.text).toBe("other");
  });

  it("a restore that fails says so", async () => {
    const scope = createUndoScope();
    scope.undoable("removed", () => {}, () => { throw new Error("gone"); });
    scope.commit();
    scope.close();
    await toast.current!.action!.run();
    expect(toast.current?.text).toMatch(/Could not undo/);
  });

  it("the rebound toast gets a fresh clock", () => {
    const scope = createUndoScope();
    scope.undoable("removed", () => {}, () => {});
    vi.advanceTimersByTime(TOAST_UNDO_MS - 100);
    scope.commit();
    scope.close();
    vi.advanceTimersByTime(TOAST_UNDO_MS - 100);
    expect(toast.current?.text).toBe("removed");
  });
});
