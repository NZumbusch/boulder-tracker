import { describe as group, it, expect } from "vitest";
import {
  appendEntry, cleanEntry, describe, describeArgs, firstError, formatConsoleArgs, formatEntry, matchesFilter, matchesQuery,
  migrateOldLogs, shouldAlert, trimLog, type LogEntry,
} from "./entry";

const at = (s: number) => new Date(Date.UTC(2026, 10, 23, 18, 0, s)).toISOString();
const e = (over: Partial<LogEntry> = {}): LogEntry => ({ at: at(0), level: "info", area: "data", msg: "m", ...over });

group("appendEntry", () => {
  it("folds a repeat within a few seconds into one entry with a count", () => {
    const log: LogEntry[] = [];
    expect(appendEntry(log, e({ at: at(0), level: "debug", msg: "getWorkouts()" }))).toBe("added");
    expect(appendEntry(log, e({ at: at(2), level: "debug", msg: "getWorkouts()" }))).toBe("folded");
    appendEntry(log, e({ at: at(4), level: "debug", msg: "getWorkouts()" }));
    expect(log).toEqual([e({ at: at(4), level: "debug", msg: "getWorkouts()", n: 3 })]);
  });

  it("keeps entries apart that differ in time, level, area, place, operation, or carry data", () => {
    const log: LogEntry[] = [];
    appendEntry(log, e({ at: at(0) }));
    appendEntry(log, e({ at: at(30) }));
    appendEntry(log, e({ at: at(31), level: "warn" }));
    appendEntry(log, e({ at: at(32), level: "warn", area: "sync" }));
    appendEntry(log, e({ at: at(33), level: "warn", area: "sync", where: "a.ts:1" }));
    appendEntry(log, e({ at: at(34), level: "warn", area: "sync", where: "a.ts:1", ops: ["sync"] }));
    appendEntry(log, e({ at: at(35), data: { a: 1 } }));
    appendEntry(log, e({ at: at(36), data: { a: 1 } }));
    expect(log).toHaveLength(8);
  });
});

group("trimLog", () => {
  it("drops the oldest routine lines first and keeps problems longest, in order", () => {
    const log = [e({ msg: "w1", level: "warn" }), e({ msg: "d1", level: "debug" }), e({ msg: "i1" }), e({ msg: "d2", level: "debug" }), e({ msg: "err", level: "error" }), e({ msg: "i2" })];
    expect(trimLog(log, 4, 0).map((x) => x.msg)).toEqual(["w1", "i1", "err", "i2"]);
    expect(trimLog(log, 2, 0).map((x) => x.msg)).toEqual(["w1", "err"]);
    expect(trimLog(log, 1, 0).map((x) => x.msg)).toEqual(["err"]);
  });

  it("does nothing until the log is past its size plus the margin", () => {
    const log = [e(), e(), e()];
    expect(trimLog(log, 2, 1)).toBe(log);
  });
});

group("filters and search", () => {
  const read = e({ level: "debug", msg: "getWorkouts()" });
  const save = e({ msg: "workouts: +1" });
  const guard = e({ level: "warn", msg: "Refused ..." });
  const screen = e({ area: "screen", msg: "Screen: plan" });
  const consoleLine = e({ area: "console", msg: "hello" });
  const crash = e({ area: "console", level: "error", msg: "boom" });
  const all = [read, save, guard, screen, consoleLine, crash];
  const pick = (f: Parameters<typeof matchesFilter>[1]) => all.filter((x) => matchesFilter(x, f));

  it("problems: warnings and errors", () => expect(pick("problems")).toEqual([guard, crash]));
  it("activity: what happened, plus every problem, without routine lines, saves or console", () => expect(pick("activity")).toEqual([guard, screen, crash]));
  it("data: the data's story, reads included", () => expect(pick("data")).toEqual([read, save, guard]));
  it("everything: all of it", () => expect(pick("everything")).toEqual(all));

  it("search looks at the message, area, level, place and operations", () => {
    expect(matchesQuery(e({ msg: "Drive sync done" }), "drive")).toBe(true);
    expect(matchesQuery(e({ ops: ["rate and save session"] }), "rate and")).toBe(true);
    expect(matchesQuery(e({ area: "sync" }), "SYNC")).toBe(true);
    expect(matchesQuery(e(), "nothing like it")).toBe(false);
  });
});

group("formatEntry", () => {
  it("writes time, level, area, count, operations, place and message, with stack and data indented below", () => {
    expect(formatEntry(e({ level: "warn", n: 2, ops: ["rate and save session", "saveWorkout"], where: "x.ts:3", msg: "Refused", stack: "Error: a\n  at f", data: { id: "w1" } }))).toBe(
      `${at(0)} WRN data ×2 [rate and save session > saveWorkout] (x.ts:3) Refused\n    Error: a\n    at f\n    {"id":"w1"}`,
    );
  });
});

group("cleanEntry", () => {
  it("bounds long text and makes data plain", () => {
    const c = cleanEntry(e({ msg: "x".repeat(3000), stack: "s".repeat(3000), data: { d: new Date(0) } }));
    expect(c.msg).toHaveLength(2000);
    expect(c.stack).toHaveLength(2000);
    expect(c.data).toEqual({ d: "1970-01-01T00:00:00.000Z" });
    expect(cleanEntry(e({ msg: "" })).msg).toBe("(no message)");
  });
});

group("describing values", () => {
  it("reads errors, strings and values", () => {
    expect(describe(new Error("boom"))).toBe("boom");
    expect(describe("text")).toBe("text");
    expect(describe({ a: 1 })).toBe('{"a":1}');
    expect(describe(undefined)).toBe("undefined");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(describe(cyclic)).toBe("[object Object]");
  });

  it("joins console arguments like the console, filling %s and dropping %c", () => {
    expect(formatConsoleArgs(["a", 1, { b: 2 }])).toBe('a 1 {"b":2}');
    expect(formatConsoleArgs(["%cStyled %s!", "color:red", "word", "extra"])).toBe("Styled word! extra");
  });

  it("finds the first Error for its stack", () => {
    const err = new Error("x");
    expect(firstError(["text", err, new Error("y")])).toBe(err);
    expect(firstError(["text"])).toBeUndefined();
  });

  it("names a record by id, status, week, day and exercises - never its content", () => {
    expect(describeArgs([{ id: "w1", status: "completed", weekId: "2026-W48", dayOfWeek: "Monday", date: "2026-11-23T20:00:00Z", exercises: [{}, {}], notes: "secret" }])).toBe("{id=w1 completed 2026-W48 Mon 2026-11-23 2 ex}");
    expect(describeArgs([[1, 2, 3], "2026-W48", "x".repeat(80), 3, true, undefined])).toMatch(/^\[3\], "2026-W48", "x{57}…", 3, true, undefined$/);
  });
});

group("migrateOldLogs", () => {
  it("brings the error log, console log and data log into one, by time, without the console log's copies of errors", () => {
    const errors = [
      { at: at(10), level: "warning", source: "console", message: "careful", count: 2 },
      { at: at(5), level: "error", source: "uncaught", where: "a.js:1", message: "boom", stack: "Error: boom" },
    ];
    const lines = [
      { at: at(1), level: "log", message: "hello" },
      { at: at(5), level: "error", message: "a.js:1: boom" },
      { at: at(10), level: "warning", message: "careful" },
      { at: at(12), level: "debug", message: "fine" },
    ];
    const data = [
      { at: at(2), kind: "load", msg: "Loaded the database file" },
      { at: at(3), kind: "call", msg: "getWorkouts()", n: 4 },
      { at: at(6), kind: "guard", msg: "Refused", data: { kept: 1 } },
      { at: at(7), kind: "app", msg: "Screen: plan" },
      { at: at(8), kind: "session", msg: "Live session started", ops: ["x"] },
      { at: at(9), kind: "nonsense-kind", msg: "kept as info" },
      { kind: "app", msg: "no time - dropped" },
    ];
    expect(migrateOldLogs(errors, lines, data).map((x) => [x.at.slice(17, 19), x.level, x.area, x.msg, x.n ?? 1])).toEqual([
      ["01", "info", "console", "hello", 1],
      ["02", "info", "data", "Loaded the database file", 1],
      ["03", "debug", "data", "getWorkouts()", 4],
      ["05", "error", "console", "boom", 1],
      ["06", "warn", "data", "Refused", 1],
      ["07", "info", "screen", "Screen: plan", 1],
      ["08", "info", "session", "Live session started", 1],
      ["09", "info", "data", "kept as info", 1],
      ["10", "warn", "console", "careful", 2],
      ["12", "debug", "console", "fine", 1],
    ]);
    const boom = migrateOldLogs(errors, [], []).find((x) => x.msg === "boom");
    expect(boom).toMatchObject({ where: "a.js:1", stack: "Error: boom", source: "uncaught" });
  });

  it("copes with nothing, or with something that isn't a log", () => {
    expect(migrateOldLogs(null, "x", { a: 1 })).toEqual([]);
  });
});

group("shouldAlert", () => {
  it("follows the setting", () => {
    expect(shouldAlert("error", "errors")).toBe(true);
    expect(shouldAlert("warn", "errors")).toBe(false);
    expect(shouldAlert("warn", "all")).toBe(true);
    expect(shouldAlert("info", "all")).toBe(false);
    expect(shouldAlert("error", "off")).toBe(false);
  });
});
