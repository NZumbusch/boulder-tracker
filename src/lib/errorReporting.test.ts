import { describe as suite, it, expect } from "vitest";
import { describe, formatConsoleArgs, firstError, addEntry, shouldAlert, type LoggedError } from "./errorReporting";

suite("describe", () => {
  it("reads errors, strings and values", () => {
    expect(describe(new Error("boom"))).toBe("boom");
    expect(describe("text")).toBe("text");
    expect(describe({ a: 1 })).toBe('{"a":1}');
    expect(describe(undefined)).toBe("undefined");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(describe(cyclic)).toBe("[object Object]");
  });
});

suite("formatConsoleArgs", () => {
  it("joins arguments like the console does", () => {
    expect(formatConsoleArgs(["Failed:", new Error("nope"), 3])).toBe("Failed: nope 3");
  });

  it("fills %s-style placeholders and drops %c styling", () => {
    expect(formatConsoleArgs(["%cWarn%c %s at %d", "color:red", "", "thing", 4, "extra"])).toBe("Warn thing at 4 extra");
  });

  it("finds the first Error for its stack", () => {
    const e = new Error("x");
    expect(firstError(["a", e, new Error("y")])).toBe(e);
    expect(firstError(["a"])).toBeUndefined();
  });
});

suite("addEntry", () => {
  const entry = (message: string, at = "2026-09-28T10:00:00Z", level: LoggedError["level"] = "error"): LoggedError => ({ at, message, level });

  it("adds newest first and keeps at most max", () => {
    let log: LoggedError[] = [];
    for (let i = 0; i < 5; i++) log = addEntry(log, entry(`m${i}`), 3);
    expect(log.map((e) => e.message)).toEqual(["m4", "m3", "m2"]);
  });

  it("counts a repeat of the newest entry instead of adding a row", () => {
    let log = addEntry([], entry("same"));
    log = addEntry(log, entry("same", "2026-09-28T10:00:05Z"));
    log = addEntry(log, entry("same", "2026-09-28T10:00:09Z"));
    expect(log).toHaveLength(1);
    expect(log[0].count).toBe(3);
    expect(log[0].at).toBe("2026-09-28T10:00:09Z");
  });

  it("doesn't merge the same text at a different level", () => {
    const log = addEntry(addEntry([], entry("same")), entry("same", undefined, "warning"));
    expect(log).toHaveLength(2);
  });
});

suite("shouldAlert", () => {
  it("follows the setting", () => {
    expect(shouldAlert("error", "errors")).toBe(true);
    expect(shouldAlert("warning", "errors")).toBe(false);
    expect(shouldAlert("warning", "all")).toBe(true);
    expect(shouldAlert("error", "off")).toBe(false);
  });
});
